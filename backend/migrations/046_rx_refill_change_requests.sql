-- Migration: Rx Refill and Change Requests Enhancement
-- Adds dedicated tables for refill requests and pharmacy-requested changes

-- Refill Requests Table
-- Tracks incoming refill requests from pharmacies or patients
CREATE TABLE IF NOT EXISTS refill_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  original_prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,

  -- Medication information (copied from original Rx for reference)
  medication_name VARCHAR(255) NOT NULL,
  strength VARCHAR(100),
  drug_description TEXT,

  -- Request details
  requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  original_rx_date TIMESTAMP,
  provider_id UUID REFERENCES providers(id),
  pharmacy_id UUID REFERENCES pharmacies(id),
  pharmacy_name VARCHAR(255),
  pharmacy_ncpdp VARCHAR(20),

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, denied
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  -- Denial tracking
  denial_reason VARCHAR(255),
  denial_notes TEXT,

  -- Request source
  request_source VARCHAR(50) DEFAULT 'pharmacy', -- pharmacy, patient, portal
  request_method VARCHAR(50), -- surescripts, fax, phone, portal

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refill_requests_tenant ON refill_requests(tenant_id);
CREATE INDEX idx_refill_requests_patient ON refill_requests(patient_id);
CREATE INDEX idx_refill_requests_prescription ON refill_requests(original_prescription_id);
CREATE INDEX idx_refill_requests_status ON refill_requests(status);
CREATE INDEX idx_refill_requests_provider ON refill_requests(provider_id);
CREATE INDEX idx_refill_requests_requested_date ON refill_requests(requested_date DESC);

-- Rx Change Requests Table
-- Tracks pharmacy-requested changes (generic substitution, dosage changes, etc.)
CREATE TABLE IF NOT EXISTS rx_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  original_prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,

  -- Original medication
  original_drug VARCHAR(255) NOT NULL,
  original_strength VARCHAR(100),
  original_quantity NUMERIC(10,2),
  original_sig TEXT,

  -- Requested change
  requested_drug VARCHAR(255),
  requested_strength VARCHAR(100),
  requested_quantity NUMERIC(10,2),
  requested_sig TEXT,
  change_type VARCHAR(100) NOT NULL, -- generic_substitution, dosage_change, frequency_change, quantity_change, therapeutic_alternative
  change_reason VARCHAR(255), -- formulary, availability, cost, clinical

  -- Pharmacy information
  pharmacy_id UUID REFERENCES pharmacies(id),
  pharmacy_name VARCHAR(255) NOT NULL,
  pharmacy_ncpdp VARCHAR(20),
  pharmacy_phone VARCHAR(20),

  -- Request tracking
  request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, approved, denied, approved_with_modification
  provider_id UUID REFERENCES providers(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  -- Response details
  response_notes TEXT,
  approved_alternative_drug VARCHAR(255),
  approved_alternative_strength VARCHAR(100),

  -- Metadata
  surescripts_message_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rx_change_requests_tenant ON rx_change_requests(tenant_id);
CREATE INDEX idx_rx_change_requests_patient ON rx_change_requests(patient_id);
CREATE INDEX idx_rx_change_requests_prescription ON rx_change_requests(original_prescription_id);
CREATE INDEX idx_rx_change_requests_status ON rx_change_requests(status);
CREATE INDEX idx_rx_change_requests_pharmacy ON rx_change_requests(pharmacy_id);
CREATE INDEX idx_rx_change_requests_request_date ON rx_change_requests(request_date DESC);
CREATE INDEX idx_rx_change_requests_provider ON rx_change_requests(provider_id);

-- Add additional columns to existing prescriptions table for enhanced filtering
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS written_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS erx_status VARCHAR(50); -- pending, transmitting, success, error, rejected
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS erx_error_details TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS print_count INTEGER DEFAULT 0;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_printed_at TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_printed_by UUID REFERENCES users(id);

-- Create indexes for new prescription columns
CREATE INDEX IF NOT EXISTS idx_prescriptions_written_date ON prescriptions(written_date DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_erx_status ON prescriptions(erx_status);

-- Add refill tracking columns to prescriptions
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS refill_status VARCHAR(50); -- null, pending, approved, denied, change_requested
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS denial_reason TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS change_request_details JSONB;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS audit_confirmed_at TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS audit_confirmed_by UUID REFERENCES users(id);

-- Prescription batch operations log (for bulk actions)
CREATE TABLE IF NOT EXISTS prescription_batch_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operation_type VARCHAR(50) NOT NULL, -- bulk_erx, bulk_print, bulk_refill
  prescription_ids UUID[] NOT NULL,
  total_count INTEGER NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- Operation details
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, partial_failure, failed
  error_log JSONB,

  -- User tracking
  initiated_by UUID NOT NULL REFERENCES users(id),
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescription_batch_operations_tenant ON prescription_batch_operations(tenant_id);
CREATE INDEX idx_prescription_batch_operations_initiated_by ON prescription_batch_operations(initiated_by);
CREATE INDEX idx_prescription_batch_operations_status ON prescription_batch_operations(status);
CREATE INDEX idx_prescription_batch_operations_initiated_at ON prescription_batch_operations(initiated_at DESC);

-- Comments
COMMENT ON TABLE refill_requests IS 'Tracks refill requests from pharmacies, patients, or portal';
COMMENT ON TABLE rx_change_requests IS 'Tracks pharmacy-requested medication changes (substitutions, dosage adjustments, etc.)';
COMMENT ON TABLE prescription_batch_operations IS 'Logs bulk operations on prescriptions (ePrescribe, Print, Refill)';

COMMENT ON COLUMN prescriptions.written_date IS 'Date prescription was written (for filtering)';
COMMENT ON COLUMN prescriptions.erx_status IS 'Electronic prescription transmission status';
COMMENT ON COLUMN prescriptions.refill_status IS 'Status of refill request workflow';
COMMENT ON COLUMN prescriptions.audit_confirmed_at IS 'Timestamp when prescription was reviewed for compliance/audit';
