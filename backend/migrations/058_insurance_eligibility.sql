-- ============================================================================
-- Insurance Eligibility Verification System
-- ============================================================================
-- "Incorrect insurance information is the #1 reason for claim denials"
-- This system enables real-time verification of patient insurance eligibility

-- Table for storing insurance verification results
CREATE TABLE IF NOT EXISTS insurance_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Insurance details verified
  payer_id VARCHAR(255),
  payer_name VARCHAR(255) NOT NULL,
  member_id VARCHAR(100),
  group_number VARCHAR(100),
  plan_name VARCHAR(255),
  plan_type VARCHAR(100), -- PPO, HMO, EPO, POS, etc.

  -- Verification results
  verification_status VARCHAR(50) NOT NULL, -- active, inactive, terminated, pending, error
  effective_date DATE,
  termination_date DATE,

  -- Primary care physician
  pcp_required BOOLEAN DEFAULT FALSE,
  pcp_name VARCHAR(255),

  -- Benefits - Copays
  copay_specialist_cents INTEGER,
  copay_pcp_cents INTEGER,
  copay_er_cents INTEGER,
  copay_urgent_care_cents INTEGER,

  -- Benefits - Deductibles
  deductible_total_cents INTEGER,
  deductible_met_cents INTEGER,
  deductible_remaining_cents INTEGER,
  deductible_family_total_cents INTEGER,
  deductible_family_met_cents INTEGER,

  -- Benefits - Coinsurance
  coinsurance_pct DECIMAL(5,2), -- e.g., 20.00 for 20%

  -- Benefits - Out-of-pocket max
  oop_max_cents INTEGER,
  oop_met_cents INTEGER,
  oop_remaining_cents INTEGER,
  oop_family_max_cents INTEGER,
  oop_family_met_cents INTEGER,

  -- Prior authorization requirements
  prior_auth_required TEXT[], -- array of services requiring prior auth
  prior_auth_phone VARCHAR(50),

  -- Referral requirements
  referral_required BOOLEAN DEFAULT FALSE,

  -- Network status
  in_network BOOLEAN DEFAULT TRUE,
  network_name VARCHAR(255),

  -- Additional coverage details
  coverage_level VARCHAR(50), -- individual, family, employee+spouse, etc.
  coordination_of_benefits VARCHAR(50), -- primary, secondary, tertiary
  subscriber_relationship VARCHAR(50), -- self, spouse, child, other
  subscriber_name VARCHAR(255),
  subscriber_dob DATE,

  -- Metadata
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID, -- user who initiated verification
  verification_source VARCHAR(100) DEFAULT 'manual', -- manual, availity, change_healthcare, etc.
  verification_method VARCHAR(100), -- real-time, batch, manual_entry

  -- Raw response storage
  raw_response JSONB,

  -- Issues tracking
  has_issues BOOLEAN DEFAULT FALSE,
  issue_type VARCHAR(100), -- coverage_ended, patient_not_found, plan_changed, etc.
  issue_notes TEXT,
  issue_resolved_at TIMESTAMPTZ,
  issue_resolved_by UUID,

  -- Appointment association
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  -- Next verification reminder
  next_verification_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_insurance_verifications_patient ON insurance_verifications(patient_id);
CREATE INDEX idx_insurance_verifications_tenant ON insurance_verifications(tenant_id);
CREATE INDEX idx_insurance_verifications_date ON insurance_verifications(verified_at DESC);
CREATE INDEX idx_insurance_verifications_status ON insurance_verifications(verification_status);
CREATE INDEX idx_insurance_verifications_issues ON insurance_verifications(has_issues) WHERE has_issues = TRUE;
CREATE INDEX idx_insurance_verifications_payer ON insurance_verifications(payer_id);
CREATE INDEX idx_insurance_verifications_appointment ON insurance_verifications(appointment_id);
CREATE INDEX idx_insurance_verifications_next_verification ON insurance_verifications(next_verification_date) WHERE next_verification_date IS NOT NULL;

-- Composite index for finding latest verification per patient
CREATE INDEX idx_insurance_verifications_patient_date ON insurance_verifications(patient_id, verified_at DESC);

-- Table for tracking batch eligibility verification runs
CREATE TABLE IF NOT EXISTS eligibility_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Batch details
  batch_name VARCHAR(255),
  batch_type VARCHAR(100) DEFAULT 'scheduled', -- scheduled, manual, pre_appointment

  -- Run statistics
  total_patients INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  active_count INTEGER DEFAULT 0,
  inactive_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  issue_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  results_summary JSONB,
  error_details JSONB,

  -- Audit
  initiated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eligibility_batch_runs_tenant ON eligibility_batch_runs(tenant_id);
CREATE INDEX idx_eligibility_batch_runs_status ON eligibility_batch_runs(status);
CREATE INDEX idx_eligibility_batch_runs_started ON eligibility_batch_runs(started_at DESC);

-- Table for linking batch runs to individual verifications
CREATE TABLE IF NOT EXISTS eligibility_batch_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_run_id UUID NOT NULL REFERENCES eligibility_batch_runs(id) ON DELETE CASCADE,
  verification_id UUID NOT NULL REFERENCES insurance_verifications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eligibility_batch_verifications_batch ON eligibility_batch_verifications(batch_run_id);
CREATE INDEX idx_eligibility_batch_verifications_verification ON eligibility_batch_verifications(verification_id);

-- Table for insurance payer configurations
CREATE TABLE IF NOT EXISTS insurance_payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Payer identification
  payer_id VARCHAR(255) NOT NULL, -- external payer ID (e.g., from Availity)
  payer_name VARCHAR(255) NOT NULL,

  -- Configuration
  supports_realtime_eligibility BOOLEAN DEFAULT FALSE,
  eligibility_check_enabled BOOLEAN DEFAULT TRUE,

  -- Contact information
  phone VARCHAR(50),
  provider_services_phone VARCHAR(50),
  prior_auth_phone VARCHAR(50),
  claims_phone VARCHAR(50),
  website VARCHAR(255),

  -- Common requirements
  typical_prior_auth_services TEXT[],
  typical_referral_required BOOLEAN DEFAULT FALSE,

  -- Notes
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insurance_payers_tenant ON insurance_payers(tenant_id);
CREATE INDEX idx_insurance_payers_payer_id ON insurance_payers(payer_id);
CREATE INDEX idx_insurance_payers_active ON insurance_payers(is_active) WHERE is_active = TRUE;

-- Unique constraint on payer_id per tenant
CREATE UNIQUE INDEX idx_insurance_payers_tenant_payer ON insurance_payers(tenant_id, payer_id);

-- Update triggers
CREATE TRIGGER insurance_verifications_updated_at
  BEFORE UPDATE ON insurance_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER eligibility_batch_runs_updated_at
  BEFORE UPDATE ON eligibility_batch_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER insurance_payers_updated_at
  BEFORE UPDATE ON insurance_payers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get latest verification for a patient
CREATE OR REPLACE FUNCTION get_latest_insurance_verification(p_patient_id UUID)
RETURNS TABLE (
  verification_id UUID,
  verification_status VARCHAR(50),
  verified_at TIMESTAMPTZ,
  payer_name VARCHAR(255),
  has_issues BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    iv.id,
    iv.verification_status,
    iv.verified_at,
    iv.payer_name,
    iv.has_issues
  FROM insurance_verifications iv
  WHERE iv.patient_id = p_patient_id
  ORDER BY iv.verified_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to identify patients needing verification
CREATE OR REPLACE FUNCTION get_patients_needing_verification(
  p_tenant_id VARCHAR(255),
  p_days_threshold INTEGER DEFAULT 30
)
RETURNS TABLE (
  patient_id UUID,
  patient_name VARCHAR(255),
  last_verified_at TIMESTAMPTZ,
  days_since_verification INTEGER,
  upcoming_appointment_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_verifications AS (
    SELECT DISTINCT ON (iv.patient_id)
      iv.patient_id,
      iv.verified_at
    FROM insurance_verifications iv
    WHERE iv.tenant_id = p_tenant_id
    ORDER BY iv.patient_id, iv.verified_at DESC
  ),
  upcoming_appointments AS (
    SELECT DISTINCT ON (a.patient_id)
      a.patient_id,
      a.scheduled_time
    FROM appointments a
    WHERE a.tenant_id = p_tenant_id
      AND a.scheduled_time > NOW()
      AND a.status NOT IN ('cancelled', 'no_show')
    ORDER BY a.patient_id, a.scheduled_time ASC
  )
  SELECT
    p.id,
    p.full_name,
    lv.verified_at,
    EXTRACT(DAY FROM NOW() - lv.verified_at)::INTEGER,
    ua.scheduled_time
  FROM patients p
  LEFT JOIN latest_verifications lv ON lv.patient_id = p.id
  LEFT JOIN upcoming_appointments ua ON ua.patient_id = p.id
  WHERE p.tenant_id = p_tenant_id
    AND (
      lv.verified_at IS NULL
      OR lv.verified_at < NOW() - INTERVAL '1 day' * p_days_threshold
      OR (ua.scheduled_time IS NOT NULL AND ua.scheduled_time < NOW() + INTERVAL '1 day')
    )
  ORDER BY
    CASE
      WHEN ua.scheduled_time IS NOT NULL AND ua.scheduled_time < NOW() + INTERVAL '1 day' THEN 1
      WHEN lv.verified_at IS NULL THEN 2
      ELSE 3
    END,
    ua.scheduled_time ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Seed some common insurance payers
INSERT INTO insurance_payers (tenant_id, payer_id, payer_name, supports_realtime_eligibility, phone, provider_services_phone, typical_prior_auth_services)
VALUES
  ('default', 'BCBS', 'Blue Cross Blue Shield', TRUE, '1-800-BLUE-CROSS', '1-800-555-0100', ARRAY['Biologics', 'Phototherapy', 'Mohs Surgery']),
  ('default', 'AETNA', 'Aetna', TRUE, '1-800-AETNA-US', '1-800-555-0200', ARRAY['Biologics', 'Cosmetic Procedures']),
  ('default', 'CIGNA', 'Cigna', TRUE, '1-800-CIGNA-24', '1-800-555-0300', ARRAY['Biologics', 'Advanced Imaging']),
  ('default', 'UNITED', 'UnitedHealthcare', TRUE, '1-800-328-5979', '1-800-555-0400', ARRAY['Biologics', 'Mohs Surgery', 'Phototherapy']),
  ('default', 'HUMANA', 'Humana', TRUE, '1-800-HUMANA-8', '1-800-555-0500', ARRAY['Biologics', 'Specialty Medications']),
  ('default', 'MEDICARE', 'Medicare', FALSE, '1-800-MEDICARE', '1-800-633-4227', ARRAY['Advanced Diagnostic Tests']),
  ('default', 'MEDICAID', 'Medicaid', FALSE, '1-800-XXX-XXXX', '1-800-XXX-XXXX', ARRAY['Specialty Medications', 'Advanced Procedures'])
ON CONFLICT DO NOTHING;
