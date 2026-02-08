-- Workflow Orchestration Tables
-- Connects all medical practice workflows for automated processing

-- =====================================================
-- WORKFLOW EVENT TRACKING
-- =====================================================

-- Track all workflow events for analytics and debugging
CREATE TABLE IF NOT EXISTS workflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    user_id UUID REFERENCES users(id),
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_workflow_events_tenant_type (tenant_id, event_type),
    INDEX idx_workflow_events_entity (entity_type, entity_id),
    INDEX idx_workflow_events_created (tenant_id, created_at DESC)
);

-- Track workflow errors for debugging
CREATE TABLE IF NOT EXISTS workflow_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_workflow_errors_unresolved (tenant_id, resolved, created_at DESC)
);

-- =====================================================
-- DAILY ANALYTICS
-- =====================================================

-- Aggregate daily metrics for dashboard
CREATE TABLE IF NOT EXISTS daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, date, metric),
    INDEX idx_daily_analytics_lookup (tenant_id, date, metric)
);

-- =====================================================
-- APPOINTMENT WORKFLOW QUEUES
-- =====================================================

-- Scheduled appointment reminders
CREATE TABLE IF NOT EXISTS scheduled_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL, -- '24h', '2h', 'custom'
    scheduled_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, sent, failed, cancelled
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(appointment_id, reminder_type),
    INDEX idx_scheduled_reminders_pending (tenant_id, status, scheduled_time)
);

-- Eligibility check queue
CREATE TABLE IF NOT EXISTS eligibility_check_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    result JSONB,
    checked_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_eligibility_queue_pending (tenant_id, status, created_at)
);

-- Copay collection queue
CREATE TABLE IF NOT EXISTS copay_collection_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    expected_amount DECIMAL(10, 2) NOT NULL,
    collected_amount DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'pending', -- pending, collected, waived, skipped
    collected_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_copay_queue_pending (tenant_id, status)
);

-- Appointment metrics (wait times, etc.)
CREATE TABLE IF NOT EXISTS appointment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    checkin_time TIMESTAMPTZ,
    roomed_time TIMESTAMPTZ,
    provider_start_time TIMESTAMPTZ,
    provider_end_time TIMESTAMPTZ,
    checkout_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(appointment_id),
    INDEX idx_appointment_metrics_tenant (tenant_id, checkin_time)
);

-- =====================================================
-- FOLLOW-UP AND RECALL QUEUES
-- =====================================================

-- Follow-up appointment queue
CREATE TABLE IF NOT EXISTS follow_up_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    follow_up_type VARCHAR(50) NOT NULL, -- follow_up, recheck, post_procedure
    target_date DATE NOT NULL,
    scheduled_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, scheduled, contacted, declined, expired
    contact_attempts INT DEFAULT 0,
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_followup_queue_pending (tenant_id, status, target_date)
);

-- Recall queue for regular check-ups
CREATE TABLE IF NOT EXISTS recall_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    recall_type VARCHAR(50) NOT NULL, -- annual_skin_check, mohs_followup, cancer_surveillance
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, contacted, scheduled, declined, expired
    scheduled_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    contact_attempts INT DEFAULT 0,
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_recall_queue_due (tenant_id, status, due_date)
);

-- Follow-up rules by diagnosis
CREATE TABLE IF NOT EXISTS follow_up_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    icd10_code VARCHAR(20) NOT NULL,
    description VARCHAR(255),
    follow_up_days INT NOT NULL,
    follow_up_type VARCHAR(50) DEFAULT 'follow_up',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, icd10_code),
    INDEX idx_followup_rules_active (tenant_id, is_active)
);

-- =====================================================
-- PRIOR AUTHORIZATION ENHANCEMENTS
-- =====================================================

-- Prior auth rules by procedure/medication/lab
CREATE TABLE IF NOT EXISTS prior_auth_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payer_id VARCHAR(50),
    appointment_type VARCHAR(50),
    cpt_code VARCHAR(20),
    lab_code VARCHAR(20),
    medication_id UUID,
    diagnosis_codes TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_prior_auth_rules_lookup (tenant_id, is_active)
);

-- =====================================================
-- LAB ORDER QUEUE
-- =====================================================

-- Lab order processing queue
CREATE TABLE IF NOT EXISTS lab_order_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, acknowledged, resulted, error
    interface_message_id VARCHAR(100),
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(order_id),
    INDEX idx_lab_order_queue_pending (tenant_id, status)
);

-- =====================================================
-- PATIENT NOTIFICATION QUEUE
-- =====================================================

-- Patient notification queue (SMS, email, portal)
CREATE TABLE IF NOT EXISTS patient_notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- lab_results, prescription_sent, appointment_reminder, prior_auth_update
    entity_id UUID,
    metadata JSONB DEFAULT '{}',
    channels TEXT[] DEFAULT ARRAY['portal'], -- portal, sms, email
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_patient_notify_pending (tenant_id, status, created_at)
);

-- =====================================================
-- SURVEY QUEUE
-- =====================================================

-- Patient satisfaction survey queue
CREATE TABLE IF NOT EXISTS survey_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    survey_type VARCHAR(50) DEFAULT 'satisfaction', -- satisfaction, nps, custom
    scheduled_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, sent, completed, expired
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_survey_queue_pending (tenant_id, status, scheduled_time)
);

-- =====================================================
-- CLAIM ADJUSTMENTS AND STATEMENTS
-- =====================================================

-- ERA/EOB claim adjustments
CREATE TABLE IF NOT EXISTS claim_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    adjustment_code VARCHAR(20) NOT NULL,
    adjustment_reason VARCHAR(255),
    amount_cents INT NOT NULL,
    era_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_claim_adjustments_claim (claim_id)
);

-- Patient statements
CREATE TABLE IF NOT EXISTS patient_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
    statement_number VARCHAR(50),
    amount_due_cents INT NOT NULL,
    statement_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, paid, collections
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    paid_amount_cents INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_patient_statements_pending (tenant_id, status, statement_date)
);

-- Appeal review queue
CREATE TABLE IF NOT EXISTS appeal_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    denial_code VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, appealed, closed
    assigned_to UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    appeal_submitted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_appeal_queue_pending (tenant_id, status)
);

-- =====================================================
-- SEED FOLLOW-UP RULES FOR DERMATOLOGY
-- =====================================================

-- Common dermatology conditions requiring follow-up
INSERT INTO follow_up_rules (id, tenant_id, icd10_code, description, follow_up_days, follow_up_type, is_active)
SELECT
    gen_random_uuid(),
    t.id,
    rules.icd10_code,
    rules.description,
    rules.follow_up_days,
    rules.follow_up_type,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    -- Skin cancers requiring close monitoring
    ('C44.91', 'Basal cell carcinoma, unspecified', 90, 'cancer_surveillance'),
    ('C44.92', 'Squamous cell carcinoma of skin, unspecified', 90, 'cancer_surveillance'),
    ('C43.9', 'Malignant melanoma of skin, unspecified', 60, 'cancer_surveillance'),

    -- Pre-cancerous lesions
    ('L57.0', 'Actinic keratosis', 180, 'recheck'),
    ('D04.9', 'Carcinoma in situ of skin, unspecified', 90, 'cancer_surveillance'),

    -- Chronic conditions requiring regular monitoring
    ('L40.0', 'Psoriasis vulgaris', 90, 'follow_up'),
    ('L40.9', 'Psoriasis, unspecified', 90, 'follow_up'),
    ('L20.9', 'Atopic dermatitis, unspecified', 60, 'follow_up'),
    ('L82.1', 'Other seborrheic keratosis', 365, 'annual_check'),

    -- Post-procedure follow-ups
    ('Z96.1', 'Presence of intraocular lens', 14, 'post_procedure'),
    ('Z87.2', 'Personal history of diseases of the skin', 365, 'annual_check')
) AS rules(icd10_code, description, follow_up_days, follow_up_type)
ON CONFLICT DO NOTHING;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_workflow_events_recent ON workflow_events (tenant_id, created_at DESC) WHERE created_at > NOW() - INTERVAL '30 days';
CREATE INDEX IF NOT EXISTS idx_daily_analytics_recent ON daily_analytics (tenant_id, date DESC) WHERE date > CURRENT_DATE - INTERVAL '90 days';

-- =====================================================
-- ERA/EOB IMPORTS
-- =====================================================

-- Track ERA/EOB file imports
CREATE TABLE IF NOT EXISTS era_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    claim_count INT NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    imported_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,

    INDEX idx_era_imports_tenant (tenant_id, created_at DESC)
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate average wait times
CREATE OR REPLACE FUNCTION calculate_wait_time_stats(p_tenant_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
    avg_checkin_to_room INTERVAL,
    avg_room_to_provider INTERVAL,
    avg_total_visit INTERVAL,
    appointments_measured INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        AVG(roomed_time - checkin_time) as avg_checkin_to_room,
        AVG(provider_start_time - roomed_time) as avg_room_to_provider,
        AVG(checkout_time - checkin_time) as avg_total_visit,
        COUNT(*)::INT as appointments_measured
    FROM appointment_metrics am
    JOIN appointments a ON a.id = am.appointment_id
    WHERE am.tenant_id = p_tenant_id
      AND a.start_time::DATE BETWEEN p_start_date AND p_end_date
      AND am.checkin_time IS NOT NULL
      AND am.checkout_time IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get revenue cycle metrics
CREATE OR REPLACE FUNCTION get_rcm_metrics(p_tenant_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE(
    total_charges DECIMAL,
    total_payments DECIMAL,
    collection_rate DECIMAL,
    avg_days_to_payment DECIMAL,
    denial_rate DECIMAL,
    clean_claim_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH claim_stats AS (
        SELECT
            COALESCE(SUM(total_charges), 0) as charges,
            COALESCE(SUM(paid_amount), 0) as payments,
            COUNT(*) FILTER (WHERE status = 'denied') as denied,
            COUNT(*) FILTER (WHERE status IN ('submitted', 'accepted', 'denied', 'paid')) as submitted,
            COUNT(*) FILTER (WHERE scrub_status = 'clean') as clean,
            COUNT(*) FILTER (WHERE scrub_status IS NOT NULL) as scrubbed
        FROM claims
        WHERE tenant_id = p_tenant_id
          AND created_at > NOW() - (p_days || ' days')::INTERVAL
    ),
    payment_stats AS (
        SELECT
            AVG(EXTRACT(DAY FROM cp.payment_date::TIMESTAMP - c.submitted_at)) as avg_days
        FROM claim_payments cp
        JOIN claims c ON c.id = cp.claim_id
        WHERE c.tenant_id = p_tenant_id
          AND cp.payment_date > NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        cs.charges,
        cs.payments,
        CASE WHEN cs.charges > 0 THEN (cs.payments / cs.charges * 100) ELSE 0 END,
        COALESCE(ps.avg_days, 0),
        CASE WHEN cs.submitted > 0 THEN (cs.denied::DECIMAL / cs.submitted * 100) ELSE 0 END,
        CASE WHEN cs.scrubbed > 0 THEN (cs.clean::DECIMAL / cs.scrubbed * 100) ELSE 0 END
    FROM claim_stats cs
    CROSS JOIN payment_stats ps;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE workflow_events IS 'Tracks all workflow events for analytics and debugging';
COMMENT ON TABLE daily_analytics IS 'Aggregated daily metrics for dashboards';
COMMENT ON TABLE follow_up_queue IS 'Queue for scheduling follow-up appointments';
COMMENT ON TABLE recall_queue IS 'Queue for patient recall/recheck appointments';
COMMENT ON TABLE patient_statements IS 'Patient billing statements';
