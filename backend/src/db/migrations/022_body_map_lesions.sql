-- Body Map Lesions and Observations Tables
-- This migration creates comprehensive lesion tracking for dermatology practice

-- Create patient_lesions table for tracking skin lesions on body map
CREATE TABLE IF NOT EXISTS patient_lesions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Location details
  anatomical_location TEXT NOT NULL,
  location_code TEXT, -- ICD-10 body site code
  x_coordinate DECIMAL(5,2) NOT NULL CHECK (x_coordinate >= 0 AND x_coordinate <= 100),
  y_coordinate DECIMAL(5,2) NOT NULL CHECK (y_coordinate >= 0 AND y_coordinate <= 100),
  body_view TEXT DEFAULT 'front' CHECK (body_view IN ('front', 'back', 'head-front', 'head-back', 'left-side', 'right-side')),

  -- Clinical details
  lesion_type TEXT, -- nevus, cyst, papule, plaque, nodule, melanoma, bcc, scc, ak, sk
  status TEXT DEFAULT 'monitoring' CHECK (status IN ('monitoring', 'suspicious', 'benign', 'malignant', 'treated', 'resolved')),
  size_mm DECIMAL(6,2), -- Size in millimeters
  color TEXT, -- brown, black, red, pink, skin-colored, etc.
  border TEXT CHECK (border IN ('well-defined', 'irregular', 'poorly-defined')),

  -- Tracking dates
  first_noted_date DATE,
  last_examined_date DATE,

  -- Biopsy information
  biopsy_id TEXT,
  pathology_result TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for performance
  CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Create lesion_observations table for tracking lesion changes over time
CREATE TABLE IF NOT EXISTS lesion_observations (
  id TEXT PRIMARY KEY,
  lesion_id TEXT NOT NULL REFERENCES patient_lesions(id) ON DELETE CASCADE,

  -- Observation details
  observed_date DATE NOT NULL,
  provider_id TEXT, -- Reference to user who made the observation

  -- Measurements
  size_mm DECIMAL(6,2), -- Size at time of observation

  -- Media
  photo_id TEXT, -- Reference to photo attachment

  -- Notes
  notes TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_lesion FOREIGN KEY (lesion_id) REFERENCES patient_lesions(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patient_lesions_tenant ON patient_lesions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_lesions_patient ON patient_lesions(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_lesions_status ON patient_lesions(status);
CREATE INDEX IF NOT EXISTS idx_patient_lesions_body_view ON patient_lesions(body_view);
CREATE INDEX IF NOT EXISTS idx_patient_lesions_created ON patient_lesions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_lesions_last_examined ON patient_lesions(last_examined_date DESC);

CREATE INDEX IF NOT EXISTS idx_lesion_observations_lesion ON lesion_observations(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_observations_date ON lesion_observations(observed_date DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_observations_provider ON lesion_observations(provider_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patient_lesions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_patient_lesions_updated_at
  BEFORE UPDATE ON patient_lesions
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_lesions_updated_at();

-- Add comments for documentation
COMMENT ON TABLE patient_lesions IS 'Tracks skin lesions on patient body map with coordinates and clinical details';
COMMENT ON TABLE lesion_observations IS 'Tracks changes and observations of lesions over time';

COMMENT ON COLUMN patient_lesions.x_coordinate IS 'X coordinate as percentage (0-100) on body diagram view';
COMMENT ON COLUMN patient_lesions.y_coordinate IS 'Y coordinate as percentage (0-100) on body diagram view';
COMMENT ON COLUMN patient_lesions.body_view IS 'Which view of the body this lesion appears on';
COMMENT ON COLUMN patient_lesions.status IS 'Current clinical status of the lesion';
COMMENT ON COLUMN patient_lesions.size_mm IS 'Diameter of lesion in millimeters';
COMMENT ON COLUMN patient_lesions.location_code IS 'ICD-10 topography code for anatomical location';

-- Sample data for testing (optional - remove in production)
-- This shows how the data structure works
/*
INSERT INTO patient_lesions (
  id, tenant_id, patient_id, anatomical_location, location_code,
  x_coordinate, y_coordinate, body_view, lesion_type, status,
  size_mm, color, border, first_noted_date, notes
) VALUES (
  'lesion-sample-001',
  'tenant-1',
  'patient-1',
  'Right Forearm',
  'C44.609',
  85.5,
  40.2,
  'front',
  'nevus',
  'monitoring',
  4.5,
  'brown',
  'well-defined',
  '2024-01-15',
  'Regular borders, homogeneous color. Monitor for changes.'
);

INSERT INTO lesion_observations (
  id, lesion_id, observed_date, size_mm, notes
) VALUES (
  'obs-001',
  'lesion-sample-001',
  '2024-01-15',
  4.5,
  'Initial observation - regular nevus'
);
*/
