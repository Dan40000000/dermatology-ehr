-- Migration: 083_waitlist_recall.sql
-- Description: Waitlist Management and Patient Recall System
-- Created: 2026-02-06

-- ============================================================================
-- WAITLIST MANAGEMENT TABLES
-- ============================================================================

-- Waitlist entries - Enhanced waitlist with detailed preferences
CREATE TABLE IF NOT EXISTS waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE SET NULL,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,

    -- Preferences stored as JSONB for flexibility
    preferred_dates JSONB DEFAULT '[]'::jsonb,  -- Array of {date: string, weight: number}
    preferred_times JSONB DEFAULT '{"morning": true, "afternoon": true, "evening": false}'::jsonb,
    preferred_days_of_week JSONB DEFAULT '["monday", "tuesday", "wednesday", "thursday", "friday"]'::jsonb,

    flexibility_days INTEGER DEFAULT 7,  -- How many days flexible from preferred dates
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'matched', 'notified', 'scheduled', 'cancelled', 'expired')),

    reason TEXT,
    notes TEXT,

    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    notified_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    scheduled_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for waitlist_entries
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_tenant ON waitlist_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_patient ON waitlist_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_provider ON waitlist_entries(provider_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_priority ON waitlist_entries(tenant_id, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_active ON waitlist_entries(tenant_id, status) WHERE status = 'active';

-- Waitlist notifications - Track slot offers to patients
CREATE TABLE IF NOT EXISTS waitlist_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,

    -- Slot details
    slot_offered JSONB NOT NULL,  -- {providerId, locationId, scheduledStart, scheduledEnd, appointmentTypeId}
    offered_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Response tracking
    response VARCHAR(20) CHECK (response IN ('pending', 'accepted', 'declined', 'expired', 'no_response')),
    responded_at TIMESTAMPTZ,
    response_notes TEXT,

    -- Notification channel
    notification_channel VARCHAR(20) DEFAULT 'sms' CHECK (notification_channel IN ('sms', 'email', 'phone', 'portal', 'auto')),
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for waitlist_notifications
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_tenant ON waitlist_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_entry ON waitlist_notifications(entry_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_pending ON waitlist_notifications(tenant_id, response) WHERE response = 'pending';
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_expires ON waitlist_notifications(expires_at) WHERE response = 'pending';

-- ============================================================================
-- RECALL CAMPAIGN TABLES (Enhanced)
-- ============================================================================

-- Enhanced recall campaigns with detailed criteria
CREATE TABLE IF NOT EXISTS recall_campaigns_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Recall type with dermatology-specific options
    recall_type VARCHAR(50) NOT NULL CHECK (recall_type IN (
        'annual_skin_check',
        'melanoma_surveillance',
        'follow_up_visit',
        'treatment_continuation',
        'lab_recheck',
        'prescription_renewal',
        'post_procedure_check',
        'psoriasis_follow_up',
        'acne_follow_up',
        'inactive_patients',
        'custom'
    )),

    -- Target criteria as JSONB for flexibility
    target_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example criteria:
    -- {
    --   "lastVisitDaysAgo": {"min": 330, "max": null},
    --   "diagnoses": ["C43.%", "D03.%"],  -- Melanoma history
    --   "procedures": ["11100", "11102"],  -- Biopsy CPT codes
    --   "medications": ["methotrexate", "biologics"],
    --   "ageRange": {"min": 40, "max": null},
    --   "riskLevel": ["high", "moderate"]
    -- }

    -- Message template
    message_template TEXT,
    message_template_sms TEXT,
    message_template_email TEXT,

    -- Communication settings
    channel VARCHAR(20) DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'phone', 'mail', 'portal', 'multi')),
    frequency_days INTEGER DEFAULT 14,  -- Days between contact attempts
    max_attempts INTEGER DEFAULT 3,

    -- Scheduling
    is_active BOOLEAN DEFAULT TRUE,
    auto_identify BOOLEAN DEFAULT FALSE,  -- Automatically identify patients on schedule
    identify_schedule VARCHAR(50),  -- Cron expression for auto-identify

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for recall_campaigns_v2
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_v2_tenant ON recall_campaigns_v2(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_v2_active ON recall_campaigns_v2(tenant_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_v2_type ON recall_campaigns_v2(tenant_id, recall_type);

-- Recall patients - Patients identified for recall
CREATE TABLE IF NOT EXISTS recall_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES recall_campaigns_v2(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Recall details
    reason TEXT NOT NULL,  -- Specific reason for this patient
    due_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Status tracking
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'contacted',
        'scheduled',
        'completed',
        'declined',
        'unable_to_reach',
        'dismissed'
    )),

    -- Contact tracking
    last_contact_at TIMESTAMPTZ,
    next_contact_at TIMESTAMPTZ,
    contact_attempts INTEGER DEFAULT 0,

    -- Resolution
    scheduled_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    dismissed_reason TEXT,

    -- Metadata
    source VARCHAR(30) DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'import')),
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Prevent duplicate recalls for same patient in same campaign
    UNIQUE (campaign_id, patient_id, due_date)
);

-- Indexes for recall_patients
CREATE INDEX IF NOT EXISTS idx_recall_patients_tenant ON recall_patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_patients_campaign ON recall_patients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recall_patients_patient ON recall_patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_recall_patients_status ON recall_patients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_recall_patients_due ON recall_patients(tenant_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_recall_patients_next_contact ON recall_patients(tenant_id, next_contact_at) WHERE status IN ('pending', 'contacted');
CREATE INDEX IF NOT EXISTS idx_recall_patients_pending ON recall_patients(tenant_id, status) WHERE status = 'pending';

-- Recall contact log - Detailed contact attempt history
CREATE TABLE IF NOT EXISTS recall_contact_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recall_patient_id UUID NOT NULL REFERENCES recall_patients(id) ON DELETE CASCADE,

    -- Contact details
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'email', 'phone', 'mail', 'portal')),
    message_sent TEXT,

    -- Timing
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    -- Response
    response VARCHAR(30) CHECK (response IN (
        'no_response',
        'answered',
        'voicemail',
        'scheduled',
        'declined',
        'call_back_requested',
        'wrong_number',
        'opted_out',
        'bounced',
        'delivered',
        'read'
    )),
    responded_at TIMESTAMPTZ,
    response_notes TEXT,

    -- Staff tracking
    sent_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Delivery status for automated channels
    delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    delivery_error TEXT,
    external_message_id VARCHAR(255),  -- Twilio SID, etc.

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for recall_contact_log
CREATE INDEX IF NOT EXISTS idx_recall_contact_log_tenant ON recall_contact_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_contact_log_recall_patient ON recall_contact_log(recall_patient_id);
CREATE INDEX IF NOT EXISTS idx_recall_contact_log_sent_at ON recall_contact_log(tenant_id, sent_at);

-- ============================================================================
-- RECALL CAMPAIGN TEMPLATES (Dermatology-specific presets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recall_campaign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,
    description TEXT,
    recall_type VARCHAR(50) NOT NULL,
    target_criteria JSONB NOT NULL,
    message_template TEXT,
    message_template_sms TEXT,
    message_template_email TEXT,
    frequency_days INTEGER DEFAULT 14,
    max_attempts INTEGER DEFAULT 3,

    -- Whether this is a system-provided template
    is_system BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert dermatology-specific campaign templates
INSERT INTO recall_campaign_templates (id, name, description, recall_type, target_criteria, message_template_sms, message_template_email, frequency_days, max_attempts)
VALUES
    (
        gen_random_uuid(),
        'Annual Skin Check',
        'Patients due for annual full-body skin examination',
        'annual_skin_check',
        '{"lastVisitDaysAgo": {"min": 330, "max": null}, "appointmentTypes": ["skin_check", "full_body_exam", "annual_exam"]}'::jsonb,
        'Hi {{patientFirstName}}, it''s time for your annual skin check at {{practiceName}}. Please call {{practicePhone}} or book online to schedule.',
        '<p>Dear {{patientFirstName}},</p><p>It has been nearly a year since your last skin examination. Regular skin checks are important for early detection of any changes.</p><p>Please contact us at {{practicePhone}} or book online to schedule your annual skin check.</p>',
        14,
        3
    ),
    (
        gen_random_uuid(),
        'Melanoma Surveillance',
        'High-risk melanoma patients requiring close monitoring',
        'melanoma_surveillance',
        '{"diagnoses": ["C43.%", "D03.%"], "lastVisitDaysAgo": {"min": 75, "max": null}}'::jsonb,
        'Important: {{patientFirstName}}, your melanoma follow-up is due at {{practiceName}}. Please call {{practicePhone}} to schedule promptly.',
        '<p>Dear {{patientFirstName}},</p><p>As part of your melanoma surveillance program, it''s time for your regular follow-up examination.</p><p>Regular monitoring is essential. Please contact us at {{practicePhone}} to schedule your appointment.</p>',
        7,
        5
    ),
    (
        gen_random_uuid(),
        'Psoriasis Follow-up',
        'Psoriasis patients on systemic therapy requiring monitoring',
        'psoriasis_follow_up',
        '{"diagnoses": ["L40.%"], "medications": ["methotrexate", "biologics", "apremilast", "cyclosporine"], "lastVisitDaysAgo": {"min": 80, "max": null}}'::jsonb,
        'Hi {{patientFirstName}}, time for your psoriasis check-up at {{practiceName}}. Call {{practicePhone}} to schedule.',
        '<p>Dear {{patientFirstName}},</p><p>It''s time for your regular psoriasis follow-up appointment to monitor your treatment progress.</p><p>Please call {{practicePhone}} or book online.</p>',
        14,
        3
    ),
    (
        gen_random_uuid(),
        'Acne Treatment Follow-up',
        'Acne patients currently on treatment',
        'acne_follow_up',
        '{"diagnoses": ["L70.%"], "medications": ["isotretinoin", "spironolactone", "tretinoin"], "lastVisitDaysAgo": {"min": 25, "max": null}}'::jsonb,
        'Hi {{patientFirstName}}, your acne follow-up is due at {{practiceName}}. Please call {{practicePhone}} to schedule.',
        '<p>Dear {{patientFirstName}},</p><p>It''s time for your acne treatment follow-up appointment.</p><p>Please contact us at {{practicePhone}} to schedule.</p>',
        7,
        3
    ),
    (
        gen_random_uuid(),
        'Post-Procedure Check',
        'Patients requiring follow-up after dermatologic procedures',
        'post_procedure_check',
        '{"proceduresWithinDays": 14, "procedures": ["11100", "11102", "11104", "11106", "17000", "17003"]}'::jsonb,
        'Hi {{patientFirstName}}, please call {{practiceName}} at {{practicePhone}} to schedule your post-procedure follow-up.',
        '<p>Dear {{patientFirstName}},</p><p>Following your recent procedure, a follow-up visit is recommended.</p><p>Please contact us at {{practicePhone}} to schedule.</p>',
        3,
        4
    ),
    (
        gen_random_uuid(),
        'Lab Recheck',
        'Patients requiring lab monitoring',
        'lab_recheck',
        '{"labsDueDaysAgo": {"min": -7, "max": 7}, "labTypes": ["CBC", "CMP", "LFT", "lipid_panel"]}'::jsonb,
        'Hi {{patientFirstName}}, your lab work is due. Please visit the lab before your next appointment. Questions? Call {{practicePhone}}.',
        '<p>Dear {{patientFirstName}},</p><p>It''s time for your routine lab work. Please have your labs drawn before your next appointment.</p><p>If you have questions, call us at {{practicePhone}}.</p>',
        7,
        3
    ),
    (
        gen_random_uuid(),
        'Prescription Renewal',
        'Patients with prescriptions expiring soon',
        'prescription_renewal',
        '{"prescriptionExpiringDays": 30}'::jsonb,
        'Hi {{patientFirstName}}, your prescription from {{practiceName}} expires soon. Call {{practicePhone}} if you need a renewal appointment.',
        '<p>Dear {{patientFirstName}},</p><p>One or more of your prescriptions will expire soon. If you need a renewal, please schedule an appointment.</p><p>Call us at {{practicePhone}}.</p>',
        14,
        2
    ),
    (
        gen_random_uuid(),
        'Inactive Patient Reactivation',
        'Patients not seen in 18+ months',
        'inactive_patients',
        '{"lastVisitDaysAgo": {"min": 540, "max": null}}'::jsonb,
        'We miss you at {{practiceName}}! It''s been a while since your last visit. Call {{practicePhone}} to schedule a skin check.',
        '<p>Dear {{patientFirstName}},</p><p>We haven''t seen you in a while and wanted to reach out. Regular skin examinations are important for your health.</p><p>Please call {{practicePhone}} to schedule an appointment.</p>',
        30,
        2
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VIEWS FOR WAITLIST AND RECALL DASHBOARDS
-- ============================================================================

-- Waitlist dashboard view
CREATE OR REPLACE VIEW waitlist_dashboard_v AS
SELECT
    we.tenant_id,
    COUNT(*) FILTER (WHERE we.status = 'active') AS active_entries,
    COUNT(*) FILTER (WHERE we.status = 'matched') AS matched_entries,
    COUNT(*) FILTER (WHERE we.status = 'notified') AS notified_entries,
    COUNT(*) FILTER (WHERE we.status = 'scheduled') AS scheduled_entries,
    COUNT(*) FILTER (WHERE we.priority = 'urgent') AS urgent_count,
    COUNT(*) FILTER (WHERE we.priority = 'high') AS high_priority_count,
    AVG(EXTRACT(EPOCH FROM (NOW() - we.created_at))/86400)::NUMERIC(10,1) AS avg_wait_days,
    COUNT(*) FILTER (WHERE we.scheduled_at IS NOT NULL AND we.scheduled_at > we.created_at) AS filled_this_month
FROM waitlist_entries we
WHERE we.created_at >= NOW() - INTERVAL '30 days'
GROUP BY we.tenant_id;

-- Recall dashboard view
CREATE OR REPLACE VIEW recall_dashboard_v AS
SELECT
    rp.tenant_id,
    rc.id AS campaign_id,
    rc.name AS campaign_name,
    rc.recall_type,
    COUNT(*) FILTER (WHERE rp.status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE rp.status = 'contacted') AS contacted_count,
    COUNT(*) FILTER (WHERE rp.status = 'scheduled') AS scheduled_count,
    COUNT(*) FILTER (WHERE rp.status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE rp.status = 'declined') AS declined_count,
    COUNT(*) FILTER (WHERE rp.status = 'unable_to_reach') AS unreachable_count,
    COUNT(*) AS total_count,
    ROUND(
        COUNT(*) FILTER (WHERE rp.status IN ('scheduled', 'completed'))::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 1
    ) AS conversion_rate,
    AVG(rp.contact_attempts) AS avg_contact_attempts
FROM recall_patients rp
JOIN recall_campaigns_v2 rc ON rp.campaign_id = rc.id
GROUP BY rp.tenant_id, rc.id, rc.name, rc.recall_type;

-- Patients due for contact view
CREATE OR REPLACE VIEW recall_patients_due_contact_v AS
SELECT
    rp.*,
    p.first_name,
    p.last_name,
    p.phone,
    p.email,
    rc.name AS campaign_name,
    rc.recall_type,
    rc.channel AS preferred_channel,
    rc.max_attempts
FROM recall_patients rp
JOIN patients p ON rp.patient_id = p.id
JOIN recall_campaigns_v2 rc ON rp.campaign_id = rc.id
WHERE rp.status IN ('pending', 'contacted')
  AND rp.contact_attempts < rc.max_attempts
  AND (rp.next_contact_at IS NULL OR rp.next_contact_at <= NOW())
  AND rc.is_active = TRUE;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_waitlist_entries_updated_at ON waitlist_entries;
CREATE TRIGGER trigger_waitlist_entries_updated_at
    BEFORE UPDATE ON waitlist_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_waitlist_notifications_updated_at ON waitlist_notifications;
CREATE TRIGGER trigger_waitlist_notifications_updated_at
    BEFORE UPDATE ON waitlist_notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_recall_campaigns_v2_updated_at ON recall_campaigns_v2;
CREATE TRIGGER trigger_recall_campaigns_v2_updated_at
    BEFORE UPDATE ON recall_campaigns_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_recall_patients_updated_at ON recall_patients;
CREATE TRIGGER trigger_recall_patients_updated_at
    BEFORE UPDATE ON recall_patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to expire old waitlist notifications
CREATE OR REPLACE FUNCTION expire_waitlist_notifications()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE waitlist_notifications
    SET response = 'expired',
        updated_at = NOW()
    WHERE response = 'pending'
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate waitlist match score
CREATE OR REPLACE FUNCTION calculate_waitlist_match_score(
    p_entry_id UUID,
    p_slot_provider_id UUID,
    p_slot_location_id UUID,
    p_slot_appointment_type_id UUID,
    p_slot_start TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
    v_entry RECORD;
    v_score INTEGER := 0;
    v_slot_time_of_day TEXT;
    v_slot_day_of_week TEXT;
BEGIN
    -- Get waitlist entry
    SELECT * INTO v_entry FROM waitlist_entries WHERE id = p_entry_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Base score
    v_score := 10;

    -- Provider match (highest weight)
    IF v_entry.provider_id IS NULL THEN
        v_score := v_score + 20;  -- Flexible on provider
    ELSIF v_entry.provider_id = p_slot_provider_id THEN
        v_score := v_score + 40;  -- Exact match
    ELSE
        RETURN 0;  -- Wrong provider = no match
    END IF;

    -- Appointment type match
    IF v_entry.appointment_type_id IS NULL THEN
        v_score := v_score + 15;
    ELSIF v_entry.appointment_type_id = p_slot_appointment_type_id THEN
        v_score := v_score + 25;
    ELSE
        RETURN 0;  -- Wrong type = no match
    END IF;

    -- Location match
    IF v_entry.location_id IS NULL THEN
        v_score := v_score + 10;
    ELSIF v_entry.location_id = p_slot_location_id THEN
        v_score := v_score + 15;
    ELSE
        v_score := v_score - 5;  -- Location mismatch (not a dealbreaker)
    END IF;

    -- Time of day preference
    v_slot_time_of_day := CASE
        WHEN EXTRACT(HOUR FROM p_slot_start) < 12 THEN 'morning'
        WHEN EXTRACT(HOUR FROM p_slot_start) < 17 THEN 'afternoon'
        ELSE 'evening'
    END;

    IF (v_entry.preferred_times->v_slot_time_of_day)::BOOLEAN THEN
        v_score := v_score + 10;
    END IF;

    -- Day of week preference
    v_slot_day_of_week := LOWER(TO_CHAR(p_slot_start, 'day'));
    IF v_entry.preferred_days_of_week ? TRIM(v_slot_day_of_week) THEN
        v_score := v_score + 5;
    END IF;

    -- Priority bonus
    v_score := v_score * CASE v_entry.priority
        WHEN 'urgent' THEN 2
        WHEN 'high' THEN 1.5
        WHEN 'normal' THEN 1
        WHEN 'low' THEN 0.75
    END;

    -- Waiting time bonus (up to 10 extra points for long waits)
    v_score := v_score + LEAST(EXTRACT(EPOCH FROM (NOW() - v_entry.created_at))/86400, 10)::INTEGER;

    RETURN v_score::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES (if RLS is enabled)
-- ============================================================================

-- Note: Add RLS policies if row-level security is used
-- ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON waitlist_entries
--     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions (adjust role names as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_entries TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_notifications TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON recall_campaigns_v2 TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON recall_patients TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON recall_contact_log TO app_user;
-- GRANT SELECT ON recall_campaign_templates TO app_user;
