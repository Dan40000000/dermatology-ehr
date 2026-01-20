-- ============================================================================
-- Patient Check-In System
-- ============================================================================
-- Tracks patient check-ins, copay collection, and eligibility verification at arrival

CREATE TABLE IF NOT EXISTS patient_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  -- Check-in details
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Eligibility verification at check-in
  eligibility_verified BOOLEAN DEFAULT FALSE,
  eligibility_verification_id UUID REFERENCES insurance_verifications(id) ON DELETE SET NULL,

  -- Copay collection
  copay_collected_cents INTEGER DEFAULT 0,
  copay_payment_method VARCHAR(50), -- cash, credit, debit, check
  copay_payment_id UUID, -- reference to payment record if created

  -- Insurance updates made during check-in
  insurance_updated BOOLEAN DEFAULT FALSE,
  insurance_update_notes TEXT,

  -- Check-in notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add check-in status to appointments if not exists
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_check_ins_tenant ON patient_check_ins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_check_ins_patient ON patient_check_ins(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_check_ins_appointment ON patient_check_ins(appointment_id);
CREATE INDEX IF NOT EXISTS idx_patient_check_ins_date ON patient_check_ins(checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_checked_in ON appointments(checked_in_at) WHERE checked_in_at IS NOT NULL;

-- Patient payments table for copay and other payments
CREATE TABLE IF NOT EXISTS patient_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  -- Payment details
  amount_cents INTEGER NOT NULL,
  payment_type VARCHAR(50) NOT NULL, -- copay, deductible, coinsurance, previous_balance, other
  payment_method VARCHAR(50) NOT NULL, -- cash, credit, debit, check, ach
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Transaction details
  transaction_id VARCHAR(255), -- external transaction ID from payment processor
  check_number VARCHAR(50),
  card_last_four VARCHAR(4),

  -- Receipt
  receipt_number VARCHAR(100),
  receipt_printed BOOLEAN DEFAULT FALSE,

  -- Notes
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_payments_tenant ON patient_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_payments_patient ON patient_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_payments_appointment ON patient_payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_patient_payments_date ON patient_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_payments_type ON patient_payments(payment_type);

-- Update triggers
CREATE TRIGGER patient_check_ins_updated_at
  BEFORE UPDATE ON patient_check_ins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER patient_payments_updated_at
  BEFORE UPDATE ON patient_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get today's check-ins
CREATE OR REPLACE FUNCTION get_todays_check_ins(p_tenant_id VARCHAR(255))
RETURNS TABLE (
  check_in_id UUID,
  patient_id UUID,
  patient_name VARCHAR(255),
  appointment_id UUID,
  checked_in_at TIMESTAMPTZ,
  eligibility_verified BOOLEAN,
  copay_collected_cents INTEGER,
  checked_in_by_name VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.patient_id,
    p.full_name,
    ci.appointment_id,
    ci.checked_in_at,
    ci.eligibility_verified,
    ci.copay_collected_cents,
    u.full_name
  FROM patient_check_ins ci
  JOIN patients p ON p.id = ci.patient_id
  LEFT JOIN users u ON u.id = ci.checked_in_by
  WHERE ci.tenant_id = p_tenant_id
    AND ci.checked_in_at >= CURRENT_DATE
  ORDER BY ci.checked_in_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE patient_check_ins IS 'Tracks patient check-ins at arrival, including eligibility verification and copay collection';
COMMENT ON TABLE patient_payments IS 'Records all patient payments including copays, deductibles, and other payments';
COMMENT ON COLUMN patient_check_ins.eligibility_verified IS 'Whether insurance eligibility was verified during this check-in';
COMMENT ON COLUMN patient_check_ins.copay_collected_cents IS 'Amount of copay collected during check-in in cents';
COMMENT ON COLUMN patient_payments.payment_type IS 'Type of payment: copay, deductible, coinsurance, previous_balance, other';
