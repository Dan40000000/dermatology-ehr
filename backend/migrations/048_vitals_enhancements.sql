-- ================================================
-- VITALS TABLE ENHANCEMENTS
-- Migration: 048_vitals_enhancements.sql
-- Purpose: Enhance vitals table with additional fields and patient tracking
-- ================================================

-- Check if vitals table exists, if not create it
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,

  -- Vital measurements
  height_cm DECIMAL(5,2),
  weight_kg DECIMAL(6,2),
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  pulse INTEGER,
  temp_c DECIMAL(4,2),
  respiratory_rate INTEGER,
  o2_saturation INTEGER,

  -- Tracking
  recorded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add patient_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'patient_id') THEN
    ALTER TABLE vitals ADD COLUMN patient_id UUID REFERENCES patients(id) ON DELETE CASCADE;
  END IF;

  -- Add respiratory_rate if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'respiratory_rate') THEN
    ALTER TABLE vitals ADD COLUMN respiratory_rate INTEGER;
  END IF;

  -- Add o2_saturation if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'o2_saturation') THEN
    ALTER TABLE vitals ADD COLUMN o2_saturation INTEGER;
  END IF;

  -- Add recorded_by_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'recorded_by_id') THEN
    ALTER TABLE vitals ADD COLUMN recorded_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- Add recorded_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'recorded_at') THEN
    ALTER TABLE vitals ADD COLUMN recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;

  -- Add updated_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vitals' AND column_name = 'updated_at') THEN
    ALTER TABLE vitals ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Update existing records to have patient_id from encounters if missing
UPDATE vitals v
SET patient_id = e.patient_id
FROM encounters e
WHERE v.encounter_id = e.id
  AND v.patient_id IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vitals_patient_recorded ON vitals(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_tenant_patient ON vitals(tenant_id, patient_id);

-- Update statistics
ANALYZE vitals;
