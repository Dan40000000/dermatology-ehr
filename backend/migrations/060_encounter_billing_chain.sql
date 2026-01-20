-- Migration: Enhance Appointment → Encounter → Billing Chain
-- This migration adds tables and fields to support automatic encounter creation
-- and claim generation from appointments

-- Add encounter_id reference to appointments (if not exists)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS encounter_id TEXT REFERENCES encounters(id);

-- Add updated_at to charges table if not exists
ALTER TABLE charges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create claim_line_items table if not exists
CREATE TABLE IF NOT EXISTS claim_line_items (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  charge_id TEXT REFERENCES charges(id),
  cpt_code TEXT NOT NULL,
  description TEXT,
  diagnosis_codes TEXT[],
  modifiers TEXT[],
  quantity INT DEFAULT 1,
  amount_cents INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_encounter ON appointments(encounter_id);
CREATE INDEX IF NOT EXISTS idx_claim_line_items_claim ON claim_line_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_line_items_charge ON claim_line_items(charge_id);

-- Add status tracking columns to encounters if not exists
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS claim_submitted_at TIMESTAMPTZ;

-- Add payment tracking to claims
ALTER TABLE claims ADD COLUMN IF NOT EXISTS paid_cents INT DEFAULT 0;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Create trigger to update appointment with encounter_id
CREATE OR REPLACE FUNCTION update_appointment_encounter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    UPDATE appointments
    SET encounter_id = NEW.id
    WHERE id = NEW.appointment_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encounter_appointment_link ON encounters;
CREATE TRIGGER encounter_appointment_link
  AFTER INSERT ON encounters
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_encounter();

-- Add function to auto-generate claim number
CREATE OR REPLACE FUNCTION generate_claim_number(tenant_id_param TEXT)
RETURNS TEXT AS $$
DECLARE
  claim_count INT;
  current_year INT;
  claim_num TEXT;
BEGIN
  SELECT EXTRACT(YEAR FROM NOW()) INTO current_year;

  SELECT COUNT(*) INTO claim_count
  FROM claims
  WHERE tenant_id = tenant_id_param
    AND EXTRACT(YEAR FROM created_at) = current_year;

  claim_num := 'CLM-' || current_year || '-' || LPAD((claim_count + 1)::TEXT, 6, '0');

  RETURN claim_num;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE claim_line_items IS 'Individual line items within an insurance claim, linking to charges';
COMMENT ON COLUMN appointments.encounter_id IS 'Reference to encounter created when patient checks in';
COMMENT ON COLUMN encounters.billed_at IS 'Timestamp when charges were generated for this encounter';
COMMENT ON COLUMN encounters.claim_submitted_at IS 'Timestamp when claim was submitted for this encounter';
