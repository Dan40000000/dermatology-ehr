-- Migration: Prescription Integration Enhancements
-- Add missing columns for prescription tracking with patients and encounters

-- Add refill tracking columns
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS refills_remaining INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_filled_date TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS written_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS erx_status VARCHAR(50); -- success, failed, pending
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS refill_status VARCHAR(50); -- null, requested, approved, denied
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS denial_reason TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS change_request_details JSONB;

-- Add audit tracking for review confirmation
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS audit_confirmed_at TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS audit_confirmed_by UUID REFERENCES users(id);

-- Add print tracking
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS print_count INTEGER DEFAULT 0;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_printed_at TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_printed_by UUID REFERENCES users(id);

-- Create prescription refill history table
CREATE TABLE IF NOT EXISTS prescription_refills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Refill details
  fill_number INTEGER NOT NULL,
  filled_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  quantity_filled NUMERIC(10,2) NOT NULL,
  pharmacy_id UUID REFERENCES pharmacies(id),
  pharmacy_name VARCHAR(255),
  pharmacy_ncpdp VARCHAR(20),

  -- Filled by
  filled_by_provider_id UUID REFERENCES providers(id),
  filled_by_user_id UUID REFERENCES users(id),

  -- Refill method
  refill_method VARCHAR(50) DEFAULT 'erx', -- erx, phone, fax, in_person
  refill_request_date TIMESTAMP,

  -- Cost tracking
  cost_to_patient_cents INTEGER,
  insurance_paid_cents INTEGER,

  -- Notes
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescription_refills_prescription ON prescription_refills(prescription_id, filled_date DESC);
CREATE INDEX idx_prescription_refills_patient ON prescription_refills(patient_id, filled_date DESC);
CREATE INDEX idx_prescription_refills_tenant ON prescription_refills(tenant_id);
CREATE INDEX idx_prescription_refills_filled_date ON prescription_refills(filled_date DESC);

-- Create prescription batch operations table
CREATE TABLE IF NOT EXISTS prescription_batch_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Operation details
  operation_type VARCHAR(50) NOT NULL, -- bulk_erx, bulk_print, bulk_refill, bulk_cancel
  prescription_ids UUID[] NOT NULL,
  total_count INTEGER NOT NULL,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, failed, partial_failure
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- User tracking
  initiated_by UUID NOT NULL REFERENCES users(id),

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Error tracking
  error_log JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescription_batch_operations_tenant ON prescription_batch_operations(tenant_id);
CREATE INDEX idx_prescription_batch_operations_status ON prescription_batch_operations(status);
CREATE INDEX idx_prescription_batch_operations_initiated_by ON prescription_batch_operations(initiated_by);
CREATE INDEX idx_prescription_batch_operations_created_at ON prescription_batch_operations(created_at DESC);

-- Dermatology-specific medication tracking
CREATE TABLE IF NOT EXISTS derm_medication_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,

  -- Medication type
  medication_category VARCHAR(100), -- accutane, biologic, immunosuppressant, other

  -- Accutane/iPledge specific
  ipledge_enrollment_id VARCHAR(100),
  ipledge_risk_category VARCHAR(50), -- category_x, category_1, category_2
  pregnancy_test_required BOOLEAN DEFAULT false,
  last_pregnancy_test_date DATE,
  next_pregnancy_test_due DATE,
  contraception_method VARCHAR(255),
  ipledge_survey_completed_date DATE,

  -- Biologic tracking (Humira, Stelara, Dupixent, etc)
  biologic_name VARCHAR(255),
  loading_dose_completed BOOLEAN DEFAULT false,
  maintenance_dose_frequency VARCHAR(100), -- weekly, biweekly, monthly, q8weeks, q12weeks
  last_injection_date DATE,
  next_injection_due DATE,
  injection_location VARCHAR(100), -- abdomen, thigh, arm
  lot_number VARCHAR(100),
  expiration_date DATE,

  -- Prior authorization
  prior_auth_required BOOLEAN DEFAULT false,
  prior_auth_number VARCHAR(100),
  prior_auth_approved_date DATE,
  prior_auth_expiration_date DATE,
  prior_auth_status VARCHAR(50), -- pending, approved, denied, expired

  -- Lab monitoring
  requires_lab_monitoring BOOLEAN DEFAULT false,
  last_lab_date DATE,
  next_lab_due DATE,
  lab_type VARCHAR(255), -- cbc, cmp, lipid_panel, liver_function, pregnancy_test

  -- Dispensing restrictions
  max_monthly_quantity NUMERIC(10,2),
  specialty_pharmacy_required BOOLEAN DEFAULT false,
  specialty_pharmacy_name VARCHAR(255),

  -- Notes
  clinical_notes TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, completed, discontinued

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_derm_medication_tracking_tenant ON derm_medication_tracking(tenant_id);
CREATE INDEX idx_derm_medication_tracking_patient ON derm_medication_tracking(patient_id);
CREATE INDEX idx_derm_medication_tracking_prescription ON derm_medication_tracking(prescription_id);
CREATE INDEX idx_derm_medication_tracking_category ON derm_medication_tracking(medication_category);
CREATE INDEX idx_derm_medication_tracking_ipledge ON derm_medication_tracking(ipledge_enrollment_id) WHERE ipledge_enrollment_id IS NOT NULL;
CREATE INDEX idx_derm_medication_tracking_prior_auth ON derm_medication_tracking(prior_auth_status) WHERE prior_auth_required = true;
CREATE INDEX idx_derm_medication_tracking_next_pregnancy_test ON derm_medication_tracking(next_pregnancy_test_due) WHERE pregnancy_test_required = true;
CREATE INDEX idx_derm_medication_tracking_next_injection ON derm_medication_tracking(next_injection_due) WHERE biologic_name IS NOT NULL;

-- Update refills_remaining when prescription is created
-- This trigger sets refills_remaining to refills value on insert
CREATE OR REPLACE FUNCTION set_refills_remaining()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.refills_remaining IS NULL THEN
    NEW.refills_remaining := NEW.refills;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_refills_remaining ON prescriptions;
CREATE TRIGGER trigger_set_refills_remaining
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_refills_remaining();

-- Update prescription updated_at timestamp
CREATE OR REPLACE FUNCTION update_prescription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_prescription_updated_at ON prescriptions;
CREATE TRIGGER trigger_update_prescription_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_prescription_updated_at();

COMMENT ON TABLE prescription_refills IS 'Tracks every refill of a prescription with pharmacy and cost information';
COMMENT ON TABLE prescription_batch_operations IS 'Tracks bulk operations on multiple prescriptions (send, print, refill, cancel)';
COMMENT ON TABLE derm_medication_tracking IS 'Dermatology-specific medication tracking for Accutane/iPledge, biologics, and prior authorizations';
COMMENT ON COLUMN prescriptions.refills_remaining IS 'Number of refills remaining (decrements with each refill)';
COMMENT ON COLUMN prescriptions.last_filled_date IS 'Date of most recent refill';
COMMENT ON COLUMN prescriptions.written_date IS 'Date prescription was written (may differ from created_at)';
