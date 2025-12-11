-- Migration: Prior Authorizations (ePA)
-- Description: Electronic Prior Authorization system for expensive medications

CREATE TABLE IF NOT EXISTS prior_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Authorization details
  auth_number VARCHAR(100) NOT NULL UNIQUE,
  medication_name VARCHAR(255) NOT NULL,
  diagnosis_code VARCHAR(20) NOT NULL,
  insurance_name VARCHAR(255) NOT NULL,
  provider_npi VARCHAR(20) NOT NULL,
  clinical_justification TEXT NOT NULL,

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status values: pending, submitted, approved, denied, additional_info_needed
  urgency VARCHAR(20) NOT NULL DEFAULT 'routine',
  -- Urgency values: routine, urgent, stat

  -- Insurance response
  insurance_auth_number VARCHAR(100),
  denial_reason TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  denied_at TIMESTAMP,
  expires_at TIMESTAMP,

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'submitted', 'approved', 'denied', 'additional_info_needed')),
  CONSTRAINT valid_urgency CHECK (urgency IN ('routine', 'urgent', 'stat'))
);

-- Indexes for performance
CREATE INDEX idx_prior_auth_tenant ON prior_authorizations(tenant_id);
CREATE INDEX idx_prior_auth_patient ON prior_authorizations(patient_id);
CREATE INDEX idx_prior_auth_provider ON prior_authorizations(provider_id);
CREATE INDEX idx_prior_auth_status ON prior_authorizations(status);
CREATE INDEX idx_prior_auth_created_at ON prior_authorizations(created_at DESC);
CREATE INDEX idx_prior_auth_prescription ON prior_authorizations(prescription_id);

-- Comments
COMMENT ON TABLE prior_authorizations IS 'Electronic Prior Authorization (ePA) requests for expensive medications';
COMMENT ON COLUMN prior_authorizations.auth_number IS 'Unique PA tracking number (e.g., PA-1702345678-ABC123)';
COMMENT ON COLUMN prior_authorizations.clinical_justification IS 'Medical justification for why this medication is necessary';
COMMENT ON COLUMN prior_authorizations.insurance_auth_number IS 'Authorization number provided by insurance company';
COMMENT ON COLUMN prior_authorizations.urgency IS 'Priority level: routine (72hrs), urgent (24hrs), stat (same day)';
