-- ============================================================================
-- Add Insurance Eligibility Fields to Patients Table
-- ============================================================================
-- Stores latest eligibility status directly on patient record for quick access

ALTER TABLE patients ADD COLUMN IF NOT EXISTS eligibility_status VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS copay_amount_cents INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deductible_remaining_cents INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS coinsurance_percent DECIMAL(5,2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_payer_id VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_plan_name VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_member_id VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_group_number VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_verification_id UUID REFERENCES insurance_verifications(id) ON DELETE SET NULL;

-- Add index for quick eligibility lookups
CREATE INDEX IF NOT EXISTS idx_patients_eligibility_status ON patients(eligibility_status);
CREATE INDEX IF NOT EXISTS idx_patients_eligibility_checked_at ON patients(eligibility_checked_at);
CREATE INDEX IF NOT EXISTS idx_patients_latest_verification ON patients(latest_verification_id);

-- Function to update patient eligibility from verification
CREATE OR REPLACE FUNCTION update_patient_eligibility_from_verification()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the patient record with latest eligibility info
  UPDATE patients
  SET
    eligibility_status = NEW.verification_status,
    eligibility_checked_at = NEW.verified_at,
    copay_amount_cents = NEW.copay_specialist_cents,
    deductible_remaining_cents = NEW.deductible_remaining_cents,
    coinsurance_percent = NEW.coinsurance_pct,
    insurance_payer_id = NEW.payer_id,
    insurance_plan_name = NEW.plan_name,
    insurance_member_id = NEW.member_id,
    insurance_group_number = NEW.group_number,
    latest_verification_id = NEW.id,
    updated_at = NOW()
  WHERE id = NEW.patient_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update patient eligibility when verification is created/updated
DROP TRIGGER IF EXISTS update_patient_eligibility_trigger ON insurance_verifications;
CREATE TRIGGER update_patient_eligibility_trigger
  AFTER INSERT OR UPDATE ON insurance_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_eligibility_from_verification();

-- Comments for documentation
COMMENT ON COLUMN patients.eligibility_status IS 'Latest insurance eligibility status (active, inactive, terminated, pending, error)';
COMMENT ON COLUMN patients.eligibility_checked_at IS 'Timestamp of last eligibility verification';
COMMENT ON COLUMN patients.copay_amount_cents IS 'Expected copay amount in cents for specialist visits';
COMMENT ON COLUMN patients.deductible_remaining_cents IS 'Remaining deductible in cents';
COMMENT ON COLUMN patients.coinsurance_percent IS 'Patient coinsurance percentage';
COMMENT ON COLUMN patients.insurance_payer_id IS 'Insurance payer ID from eligibility verification';
COMMENT ON COLUMN patients.insurance_plan_name IS 'Insurance plan name';
COMMENT ON COLUMN patients.latest_verification_id IS 'Reference to the most recent eligibility verification';
