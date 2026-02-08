-- Referral Management System
-- Comprehensive referral tracking for incoming/outgoing patient referrals
-- Supports closed-loop communication with referring providers

-- =====================================================
-- REFERRING PROVIDERS TABLE
-- External providers who refer patients to this practice
-- =====================================================

CREATE TABLE IF NOT EXISTS referring_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Provider Information
    name VARCHAR(255) NOT NULL,
    npi VARCHAR(10),
    practice_name VARCHAR(255),
    specialty VARCHAR(100),

    -- Contact Information
    phone VARCHAR(50),
    fax VARCHAR(50),
    email VARCHAR(255),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(10),

    -- Communication Preferences
    preferences JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "preferred_contact_method": "fax" | "email" | "portal" | "phone",
    --   "send_status_updates": true,
    --   "send_closed_loop_reports": true,
    --   "report_format": "pdf" | "hl7" | "fhir",
    --   "auto_acknowledge": true
    -- }

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    UNIQUE(tenant_id, npi)
);

CREATE INDEX idx_referring_providers_tenant ON referring_providers(tenant_id);
CREATE INDEX idx_referring_providers_npi ON referring_providers(npi);
CREATE INDEX idx_referring_providers_active ON referring_providers(tenant_id, is_active);
CREATE INDEX idx_referring_providers_practice ON referring_providers(tenant_id, practice_name);

-- =====================================================
-- REFERRALS TABLE
-- Core referral tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Patient & Provider Links
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    referring_provider_id UUID REFERENCES referring_providers(id) ON DELETE SET NULL,
    assigned_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,

    -- Legacy fields (for backward compatibility)
    direction VARCHAR(20) DEFAULT 'incoming',
    referring_provider VARCHAR(255),  -- Deprecated: use referring_provider_id
    referring_organization VARCHAR(255),  -- Deprecated: use referring_provider_id
    referred_to_provider VARCHAR(255),
    referred_to_organization VARCHAR(255),

    -- Referral Details
    referral_number VARCHAR(50),
    referring_practice VARCHAR(255),  -- Practice name if no provider record

    -- Status Workflow
    -- RECEIVED -> VERIFIED -> SCHEDULED -> IN_PROGRESS -> COMPLETED -> REPORT_SENT
    status VARCHAR(50) DEFAULT 'received',
    priority VARCHAR(20) DEFAULT 'routine',  -- routine, urgent, stat

    -- Clinical Information
    diagnosis_codes TEXT[],  -- ICD-10 codes
    reason TEXT,
    clinical_notes TEXT,
    notes TEXT,  -- General notes

    -- Insurance & Authorization
    insurance_auth_status VARCHAR(50) DEFAULT 'not_required',
    -- not_required, pending, approved, denied
    insurance_auth_number VARCHAR(100),
    insurance_auth_expiry DATE,

    -- Appointment Link
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    scheduled_date DATE,

    -- Closed Loop Communication
    report_sent_at TIMESTAMPTZ,
    report_sent_by UUID REFERENCES users(id),
    acknowledgment_received_at TIMESTAMPTZ,

    -- Timestamps
    received_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_referrals_tenant ON referrals(tenant_id);
CREATE INDEX idx_referrals_patient ON referrals(patient_id);
CREATE INDEX idx_referrals_status ON referrals(tenant_id, status);
CREATE INDEX idx_referrals_priority ON referrals(tenant_id, priority);
CREATE INDEX idx_referrals_provider ON referrals(referring_provider_id);
CREATE INDEX idx_referrals_appointment ON referrals(appointment_id);
CREATE INDEX idx_referrals_created ON referrals(tenant_id, created_at DESC);
CREATE INDEX idx_referrals_stalled ON referrals(tenant_id, status, created_at)
    WHERE status IN ('received', 'verified') AND created_at < NOW() - INTERVAL '5 days';

-- =====================================================
-- REFERRAL STATUS HISTORY TABLE
-- Track all status changes
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,

    -- Status Change
    status VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),

    -- Who Made the Change
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Details
    notes TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referral_status_history_referral ON referral_status_history(referral_id);
CREATE INDEX idx_referral_status_history_created ON referral_status_history(referral_id, created_at DESC);

-- =====================================================
-- REFERRAL COMMUNICATIONS TABLE
-- Track all communications with referring providers
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,

    -- Communication Details
    direction VARCHAR(20) NOT NULL,  -- inbound, outbound
    channel VARCHAR(50) NOT NULL,    -- fax, email, phone, portal, sms, mail

    -- Content
    subject VARCHAR(255),
    message TEXT,

    -- Attachments
    attachments JSONB DEFAULT '[]'::jsonb,
    -- [{ "filename": "...", "url": "...", "type": "...", "size": 123 }]

    -- Status
    status VARCHAR(50) DEFAULT 'sent',  -- pending, sent, delivered, failed, received
    error_message TEXT,

    -- Contact Info
    contact_name VARCHAR(255),
    contact_info VARCHAR(255),  -- phone/fax number or email

    -- Timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_referral_communications_referral ON referral_communications(referral_id);
CREATE INDEX idx_referral_communications_direction ON referral_communications(referral_id, direction);
CREATE INDEX idx_referral_communications_created ON referral_communications(referral_id, created_at DESC);

-- =====================================================
-- REFERRAL DOCUMENTS TABLE
-- Documents associated with referrals
-- =====================================================

CREATE TABLE IF NOT EXISTS referral_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,

    -- Document Info
    document_type VARCHAR(100) NOT NULL,
    -- referral_order, clinical_notes, lab_results, imaging, prior_auth, consultation_report

    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,
    mime_type VARCHAR(100),

    -- Metadata
    description TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referral_documents_referral ON referral_documents(referral_id);
CREATE INDEX idx_referral_documents_type ON referral_documents(referral_id, document_type);

-- =====================================================
-- REFERRAL METRICS VIEW
-- For analytics and reporting
-- =====================================================

CREATE OR REPLACE VIEW referral_metrics_view AS
SELECT
    r.tenant_id,
    COUNT(*) AS total_referrals,
    COUNT(*) FILTER (WHERE r.status = 'received') AS pending_verification,
    COUNT(*) FILTER (WHERE r.status = 'verified') AS awaiting_scheduling,
    COUNT(*) FILTER (WHERE r.status = 'scheduled') AS scheduled,
    COUNT(*) FILTER (WHERE r.status = 'in_progress') AS in_progress,
    COUNT(*) FILTER (WHERE r.status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE r.status = 'report_sent') AS report_sent,
    COUNT(*) FILTER (WHERE r.priority = 'urgent' OR r.priority = 'stat') AS high_priority,
    COUNT(*) FILTER (
        WHERE r.status IN ('received', 'verified')
        AND r.created_at < NOW() - INTERVAL '5 days'
    ) AS stalled_referrals,
    AVG(
        EXTRACT(EPOCH FROM (r.scheduled_date - r.received_at::date)) / 86400
    ) FILTER (WHERE r.scheduled_date IS NOT NULL) AS avg_days_to_schedule,
    COUNT(*) FILTER (WHERE r.report_sent_at IS NOT NULL)::FLOAT /
        NULLIF(COUNT(*) FILTER (WHERE r.status IN ('completed', 'report_sent')), 0) * 100 AS closed_loop_rate
FROM referrals r
WHERE r.created_at > NOW() - INTERVAL '90 days'
GROUP BY r.tenant_id;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_referral_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_referral_timestamp();

CREATE TRIGGER trigger_referring_providers_updated_at
    BEFORE UPDATE ON referring_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_referral_timestamp();

-- Auto-create status history on status change
CREATE OR REPLACE FUNCTION log_referral_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO referral_status_history (referral_id, status, previous_status, changed_by, notes)
        VALUES (NEW.id, NEW.status, OLD.status, NEW.created_by, 'Status changed via update');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_referral_status_change
    AFTER UPDATE OF status ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION log_referral_status_change();

-- =====================================================
-- GENERATE REFERRAL NUMBER FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION generate_referral_number(p_tenant_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_date_str VARCHAR(8);
    v_count INT;
    v_ref_number VARCHAR(50);
BEGIN
    v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COUNT(*) + 1 INTO v_count
    FROM referrals
    WHERE tenant_id = p_tenant_id
    AND DATE(created_at) = CURRENT_DATE;

    v_ref_number := 'REF-' || v_date_str || '-' || LPAD(v_count::TEXT, 4, '0');

    RETURN v_ref_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED SAMPLE REFERRING PROVIDERS
-- =====================================================

INSERT INTO referring_providers (
    tenant_id, name, npi, practice_name, specialty,
    phone, fax, email, preferences
)
SELECT
    t.id,
    'Dr. Robert Smith',
    '1234567890',
    'Primary Care Associates',
    'Family Medicine',
    '555-100-1001',
    '555-100-1002',
    'rsmith@primarycare.example.com',
    '{"preferred_contact_method": "fax", "send_status_updates": true, "send_closed_loop_reports": true}'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM referring_providers WHERE npi = '1234567890'
)
LIMIT 1;

INSERT INTO referring_providers (
    tenant_id, name, npi, practice_name, specialty,
    phone, fax, email, preferences
)
SELECT
    t.id,
    'Dr. Lisa Chen',
    '9876543210',
    'Internal Medicine Group',
    'Internal Medicine',
    '555-200-2001',
    '555-200-2002',
    'lchen@internalmedicine.example.com',
    '{"preferred_contact_method": "email", "send_status_updates": true, "send_closed_loop_reports": true}'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM referring_providers WHERE npi = '9876543210'
)
LIMIT 1;

INSERT INTO referring_providers (
    tenant_id, name, npi, practice_name, specialty,
    phone, fax, email, preferences
)
SELECT
    t.id,
    'Dr. James Wilson',
    '1122334455',
    'Urgent Care Center',
    'Emergency Medicine',
    '555-300-3001',
    '555-300-3002',
    'jwilson@urgentcare.example.com',
    '{"preferred_contact_method": "portal", "send_status_updates": false, "send_closed_loop_reports": true}'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM referring_providers WHERE npi = '1122334455'
)
LIMIT 1;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE referrals IS 'Patient referrals from external providers - tracks full referral lifecycle';
COMMENT ON TABLE referring_providers IS 'Directory of external providers who refer patients to this practice';
COMMENT ON TABLE referral_status_history IS 'Audit trail of all referral status changes';
COMMENT ON TABLE referral_communications IS 'All communications related to referrals (fax, email, phone, etc.)';
COMMENT ON TABLE referral_documents IS 'Documents associated with referrals';
COMMENT ON FUNCTION generate_referral_number IS 'Generates unique referral tracking number';
