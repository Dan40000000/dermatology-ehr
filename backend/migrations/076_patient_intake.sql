-- Patient Intake Automation System
-- Comprehensive patient intake workflow with pre-registration, documents, consents, and insurance verification

-- =====================================================
-- INTAKE FORMS TABLE
-- Stores all types of intake forms submitted by patients
-- =====================================================

CREATE TABLE IF NOT EXISTS intake_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Form identification
    form_type VARCHAR(50) NOT NULL,
    form_version VARCHAR(20) DEFAULT '1.0',

    -- Form data
    form_data JSONB NOT NULL DEFAULT '{}',

    -- Status tracking
    status VARCHAR(30) NOT NULL DEFAULT 'draft',

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),

    -- Link to appointment (optional)
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    -- Metadata
    source VARCHAR(50) DEFAULT 'portal', -- portal, kiosk, staff_entry
    ip_address VARCHAR(50),
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_intake_form_type CHECK (form_type IN (
        'DEMOGRAPHICS', 'INSURANCE', 'MEDICAL_HISTORY',
        'CONSENT_TREATMENT', 'CONSENT_HIPAA', 'CONSENT_PHOTO',
        'REVIEW_OF_SYSTEMS', 'FAMILY_HISTORY', 'SOCIAL_HISTORY', 'CUSTOM'
    )),
    CONSTRAINT valid_intake_form_status CHECK (status IN (
        'draft', 'submitted', 'pending_review', 'reviewed', 'archived'
    ))
);

CREATE INDEX idx_intake_forms_tenant ON intake_forms(tenant_id);
CREATE INDEX idx_intake_forms_patient ON intake_forms(patient_id);
CREATE INDEX idx_intake_forms_type ON intake_forms(tenant_id, form_type);
CREATE INDEX idx_intake_forms_status ON intake_forms(tenant_id, status);
CREATE INDEX idx_intake_forms_appointment ON intake_forms(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_intake_forms_pending ON intake_forms(tenant_id, patient_id, status) WHERE status IN ('draft', 'submitted', 'pending_review');

COMMENT ON TABLE intake_forms IS 'Patient intake forms with structured data for demographics, medical history, etc.';
COMMENT ON COLUMN intake_forms.form_type IS 'Type of intake form: DEMOGRAPHICS, INSURANCE, MEDICAL_HISTORY, consents';
COMMENT ON COLUMN intake_forms.form_data IS 'JSON structure containing all form field values';

-- =====================================================
-- INTAKE DOCUMENTS TABLE
-- Stores uploaded documents like ID, insurance cards with OCR data
-- =====================================================

CREATE TABLE IF NOT EXISTS intake_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Document identification
    document_type VARCHAR(50) NOT NULL,
    document_name VARCHAR(255),

    -- File storage
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),

    -- OCR data (extracted text and fields)
    ocr_data JSONB DEFAULT '{}',
    ocr_processed BOOLEAN DEFAULT FALSE,
    ocr_confidence DECIMAL(5,2),
    ocr_processed_at TIMESTAMPTZ,

    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id),
    verification_notes TEXT,

    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    -- Link to appointment (optional)
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    -- Metadata
    source VARCHAR(50) DEFAULT 'portal',
    ip_address VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_document_type CHECK (document_type IN (
        'drivers_license', 'state_id', 'passport',
        'insurance_card_front', 'insurance_card_back',
        'referral_letter', 'prior_auth_letter',
        'medical_records', 'lab_results', 'other'
    ))
);

CREATE INDEX idx_intake_documents_tenant ON intake_documents(tenant_id);
CREATE INDEX idx_intake_documents_patient ON intake_documents(patient_id);
CREATE INDEX idx_intake_documents_type ON intake_documents(tenant_id, document_type);
CREATE INDEX idx_intake_documents_verified ON intake_documents(tenant_id, verified) WHERE verified = FALSE;
CREATE INDEX idx_intake_documents_ocr ON intake_documents(ocr_processed) WHERE ocr_processed = FALSE;

COMMENT ON TABLE intake_documents IS 'Uploaded patient documents with OCR processing for data extraction';
COMMENT ON COLUMN intake_documents.ocr_data IS 'Extracted data from document (e.g., insurance member ID, expiration date)';
COMMENT ON COLUMN intake_documents.ocr_confidence IS 'OCR extraction confidence score 0-100';

-- =====================================================
-- CONSENT RECORDS TABLE
-- Electronic signature capture for all consent types
-- =====================================================

CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Consent identification
    consent_type VARCHAR(50) NOT NULL,
    consent_version VARCHAR(20) DEFAULT '1.0',

    -- Consent content (immutable snapshot)
    consent_title VARCHAR(255) NOT NULL,
    consent_content TEXT NOT NULL,

    -- Signature data
    signature_data TEXT NOT NULL, -- base64 encoded signature image
    signer_name VARCHAR(255) NOT NULL,
    signer_relationship VARCHAR(50) DEFAULT 'self',

    -- Witness (if required)
    witness_signature_data TEXT,
    witness_name VARCHAR(255),

    -- Audit trail
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(50) NOT NULL,
    user_agent TEXT,

    -- Validity
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,

    -- Link to appointment (optional)
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_consent_type CHECK (consent_type IN (
        'CONSENT_TREATMENT', 'CONSENT_HIPAA', 'CONSENT_PHOTO',
        'CONSENT_TELEHEALTH', 'CONSENT_FINANCIAL', 'CONSENT_RESEARCH', 'CONSENT_OTHER'
    )),
    CONSTRAINT valid_signer_relationship CHECK (signer_relationship IN (
        'self', 'parent', 'guardian', 'power_of_attorney', 'spouse', 'other'
    ))
);

CREATE INDEX idx_consent_records_tenant ON consent_records(tenant_id);
CREATE INDEX idx_consent_records_patient ON consent_records(patient_id);
CREATE INDEX idx_consent_records_type ON consent_records(tenant_id, consent_type);
CREATE INDEX idx_consent_records_signed ON consent_records(signed_at DESC);
CREATE INDEX idx_consent_records_valid ON consent_records(tenant_id, patient_id, consent_type)
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

COMMENT ON TABLE consent_records IS 'Legally binding electronic consent signatures with full audit trail';
COMMENT ON COLUMN consent_records.consent_content IS 'Immutable snapshot of consent text at time of signing';
COMMENT ON COLUMN consent_records.signature_data IS 'Base64 encoded signature image';

-- =====================================================
-- INSURANCE VERIFICATIONS TABLE
-- Real-time insurance eligibility check results
-- =====================================================

CREATE TABLE IF NOT EXISTS insurance_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Insurance identification
    payer_id VARCHAR(50),
    payer_name VARCHAR(255),
    member_id VARCHAR(100),
    group_number VARCHAR(100),
    plan_name VARCHAR(255),
    plan_type VARCHAR(50),

    -- Verification result
    verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',

    -- Coverage details
    coverage_details JSONB DEFAULT '{}',

    -- Key benefit information (denormalized for quick access)
    effective_date DATE,
    termination_date DATE,
    copay_amount_cents INTEGER,
    deductible_total_cents INTEGER,
    deductible_met_cents INTEGER,
    coinsurance_pct DECIMAL(5,2),
    out_of_pocket_max_cents INTEGER,
    out_of_pocket_met_cents INTEGER,

    -- Prior auth info
    prior_auth_required BOOLEAN DEFAULT FALSE,
    prior_auth_phone VARCHAR(50),

    -- Verification timestamps
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES users(id),
    verification_source VARCHAR(50) DEFAULT 'manual',

    -- Validity
    expires_at TIMESTAMPTZ,
    next_verification_date DATE,

    -- Raw API response
    raw_response JSONB,

    -- Issues
    has_issues BOOLEAN DEFAULT FALSE,
    issue_type VARCHAR(100),
    issue_notes TEXT,
    issue_resolved_at TIMESTAMPTZ,
    issue_resolved_by UUID REFERENCES users(id),

    -- Link to appointment
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_verification_status CHECK (verification_status IN (
        'pending', 'active', 'inactive', 'error', 'needs_review'
    ))
);

CREATE INDEX idx_insurance_verifications_tenant ON insurance_verifications(tenant_id);
CREATE INDEX idx_insurance_verifications_patient ON insurance_verifications(patient_id);
CREATE INDEX idx_insurance_verifications_recent ON insurance_verifications(tenant_id, patient_id, verified_at DESC);
CREATE INDEX idx_insurance_verifications_status ON insurance_verifications(tenant_id, verification_status);
CREATE INDEX idx_insurance_verifications_issues ON insurance_verifications(tenant_id, has_issues) WHERE has_issues = TRUE;
CREATE INDEX idx_insurance_verifications_appointment ON insurance_verifications(appointment_id) WHERE appointment_id IS NOT NULL;

COMMENT ON TABLE insurance_verifications IS 'Insurance eligibility verification results with coverage details';
COMMENT ON COLUMN insurance_verifications.coverage_details IS 'Full coverage information from payer response';

-- =====================================================
-- MEDICAL HISTORY ENTRIES TABLE
-- Structured medical history with source tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS medical_history_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Entry classification
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(50),

    -- Entry data
    entry_data JSONB NOT NULL DEFAULT '{}',

    -- Clinical details (common fields denormalized)
    condition_name VARCHAR(255),
    icd10_code VARCHAR(20),
    onset_date DATE,
    resolved_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    severity VARCHAR(20),

    -- Source tracking
    source VARCHAR(50) NOT NULL DEFAULT 'patient_reported',
    source_document_id UUID REFERENCES intake_documents(id),
    source_form_id UUID REFERENCES intake_forms(id),

    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id),

    -- Link to encounter (if entered during visit)
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    CONSTRAINT valid_history_category CHECK (category IN (
        'allergy', 'medication', 'diagnosis', 'surgery', 'hospitalization',
        'family_history', 'social_history', 'immunization', 'vital_sign', 'other'
    )),
    CONSTRAINT valid_history_source CHECK (source IN (
        'patient_reported', 'imported', 'provider_entered', 'fhir_import', 'hl7_import'
    ))
);

CREATE INDEX idx_medical_history_tenant ON medical_history_entries(tenant_id);
CREATE INDEX idx_medical_history_patient ON medical_history_entries(patient_id);
CREATE INDEX idx_medical_history_category ON medical_history_entries(tenant_id, patient_id, category);
CREATE INDEX idx_medical_history_active ON medical_history_entries(patient_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_medical_history_icd10 ON medical_history_entries(icd10_code) WHERE icd10_code IS NOT NULL;

COMMENT ON TABLE medical_history_entries IS 'Structured patient medical history entries from various sources';
COMMENT ON COLUMN medical_history_entries.source IS 'Where the entry originated from (patient intake, import, provider)';

-- =====================================================
-- INTAKE LINK TOKENS TABLE
-- Secure tokens for pre-registration links
-- =====================================================

CREATE TABLE IF NOT EXISTS intake_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Token
    token VARCHAR(100) NOT NULL UNIQUE,

    -- Link details
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,

    -- Notifications
    sent_via VARCHAR(20), -- email, sms, both
    sent_at TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    reminder_count INTEGER DEFAULT 0,

    -- Metadata
    ip_address VARCHAR(50),

    CONSTRAINT valid_link_status CHECK (status IN ('active', 'used', 'expired', 'revoked'))
);

CREATE INDEX idx_intake_link_tokens_token ON intake_link_tokens(token);
CREATE INDEX idx_intake_link_tokens_patient ON intake_link_tokens(patient_id);
CREATE INDEX idx_intake_link_tokens_appointment ON intake_link_tokens(appointment_id);
CREATE INDEX idx_intake_link_tokens_active ON intake_link_tokens(tenant_id, status, expires_at) WHERE status = 'active';

COMMENT ON TABLE intake_link_tokens IS 'Secure tokens for patient pre-registration links';

-- =====================================================
-- PATIENT PORTAL ACCOUNTS TABLE
-- Patient portal credentials and activation
-- =====================================================

CREATE TABLE IF NOT EXISTS patient_portal_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Account details
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Activation
    activation_token VARCHAR(100),
    activation_token_expires_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,

    -- Password reset
    reset_token VARCHAR(100),
    reset_token_expires_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,

    -- MFA
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(100),
    mfa_backup_codes TEXT[],

    -- Login tracking
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(50),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, patient_id),
    UNIQUE(tenant_id, email),

    CONSTRAINT valid_portal_status CHECK (status IN ('pending', 'active', 'suspended', 'deactivated'))
);

CREATE INDEX idx_portal_accounts_tenant ON patient_portal_accounts(tenant_id);
CREATE INDEX idx_portal_accounts_patient ON patient_portal_accounts(patient_id);
CREATE INDEX idx_portal_accounts_email ON patient_portal_accounts(tenant_id, email);
CREATE INDEX idx_portal_accounts_activation ON patient_portal_accounts(activation_token) WHERE activation_token IS NOT NULL;

COMMENT ON TABLE patient_portal_accounts IS 'Patient portal authentication and account management';

-- =====================================================
-- INTAKE STATUS TRACKING
-- Track overall intake completion status per patient/appointment
-- =====================================================

CREATE TABLE IF NOT EXISTS intake_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,

    -- Form completion status
    demographics_complete BOOLEAN DEFAULT FALSE,
    insurance_complete BOOLEAN DEFAULT FALSE,
    medical_history_complete BOOLEAN DEFAULT FALSE,
    consent_treatment_signed BOOLEAN DEFAULT FALSE,
    consent_hipaa_signed BOOLEAN DEFAULT FALSE,
    consent_photo_signed BOOLEAN DEFAULT FALSE,

    -- Insurance verification
    insurance_verified BOOLEAN DEFAULT FALSE,
    insurance_verification_id UUID REFERENCES insurance_verifications(id),

    -- Document uploads
    insurance_cards_uploaded BOOLEAN DEFAULT FALSE,
    id_uploaded BOOLEAN DEFAULT FALSE,

    -- Portal activation
    portal_activated BOOLEAN DEFAULT FALSE,

    -- Overall status
    overall_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
    completion_percentage INTEGER DEFAULT 0,

    -- Staff notifications
    staff_notified_at TIMESTAMPTZ,
    staff_acknowledged_at TIMESTAMPTZ,
    staff_acknowledged_by UUID REFERENCES users(id),

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, patient_id, appointment_id),

    CONSTRAINT valid_intake_status CHECK (overall_status IN (
        'not_started', 'in_progress', 'pending_review', 'complete', 'expired'
    ))
);

CREATE INDEX idx_intake_status_tenant ON intake_status(tenant_id);
CREATE INDEX idx_intake_status_patient ON intake_status(patient_id);
CREATE INDEX idx_intake_status_appointment ON intake_status(appointment_id);
CREATE INDEX idx_intake_status_overall ON intake_status(tenant_id, overall_status);
CREATE INDEX idx_intake_status_incomplete ON intake_status(tenant_id, overall_status)
    WHERE overall_status IN ('not_started', 'in_progress');

COMMENT ON TABLE intake_status IS 'Tracks overall intake completion progress for patients';

-- =====================================================
-- INTAKE WORKFLOW TRIGGERS
-- Scheduled intake tasks and reminders
-- =====================================================

CREATE TABLE IF NOT EXISTS intake_workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Trigger details
    trigger_type VARCHAR(50) NOT NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,

    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,

    -- Result
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_trigger_type CHECK (trigger_type IN (
        'send_preregistration_link',
        'send_intake_reminder',
        'verify_insurance',
        'check_intake_completion',
        'notify_staff_incomplete',
        'expire_intake_link'
    )),
    CONSTRAINT valid_trigger_status CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    ))
);

CREATE INDEX idx_intake_triggers_pending ON intake_workflow_triggers(tenant_id, status, scheduled_for)
    WHERE status = 'pending';
CREATE INDEX idx_intake_triggers_appointment ON intake_workflow_triggers(appointment_id);

COMMENT ON TABLE intake_workflow_triggers IS 'Scheduled intake automation tasks';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate intake completion percentage
CREATE OR REPLACE FUNCTION calculate_intake_completion(p_patient_id UUID, p_appointment_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_items INTEGER := 6; -- demographics, insurance, medical_history, 3 consents
    completed_items INTEGER := 0;
    v_status RECORD;
BEGIN
    SELECT * INTO v_status
    FROM intake_status
    WHERE patient_id = p_patient_id
      AND (appointment_id = p_appointment_id OR (appointment_id IS NULL AND p_appointment_id IS NULL))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_status.demographics_complete THEN completed_items := completed_items + 1; END IF;
    IF v_status.insurance_complete THEN completed_items := completed_items + 1; END IF;
    IF v_status.medical_history_complete THEN completed_items := completed_items + 1; END IF;
    IF v_status.consent_treatment_signed THEN completed_items := completed_items + 1; END IF;
    IF v_status.consent_hipaa_signed THEN completed_items := completed_items + 1; END IF;
    IF v_status.consent_photo_signed THEN completed_items := completed_items + 1; END IF;

    RETURN (completed_items * 100) / total_items;
END;
$$ LANGUAGE plpgsql;

-- Function to get required consents for a patient
CREATE OR REPLACE FUNCTION get_required_consents(p_tenant_id UUID, p_patient_id UUID)
RETURNS TABLE(
    consent_type VARCHAR,
    is_signed BOOLEAN,
    signed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.type::VARCHAR as consent_type,
        EXISTS(
            SELECT 1 FROM consent_records cr
            WHERE cr.patient_id = p_patient_id
              AND cr.consent_type = ct.type
              AND cr.revoked_at IS NULL
              AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
        ) as is_signed,
        (SELECT MAX(cr2.signed_at) FROM consent_records cr2
         WHERE cr2.patient_id = p_patient_id
           AND cr2.consent_type = ct.type
           AND cr2.revoked_at IS NULL) as signed_at,
        (SELECT MIN(cr3.expires_at) FROM consent_records cr3
         WHERE cr3.patient_id = p_patient_id
           AND cr3.consent_type = ct.type
           AND cr3.revoked_at IS NULL
           AND cr3.expires_at IS NOT NULL) as expires_at
    FROM (
        VALUES
            ('CONSENT_TREATMENT'),
            ('CONSENT_HIPAA'),
            ('CONSENT_PHOTO')
    ) as ct(type);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_intake_completion IS 'Calculates percentage of intake items completed for a patient';
COMMENT ON FUNCTION get_required_consents IS 'Returns status of required consent forms for a patient';
