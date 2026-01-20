-- ============================================================================
-- Wound Tracking System
-- ============================================================================
-- Comprehensive wound care tracking with healing progression monitoring

-- Main wounds table
CREATE TABLE IF NOT EXISTS wounds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Wound classification
  wound_type TEXT NOT NULL CHECK (wound_type IN ('surgical', 'ulcer', 'burn', 'laceration', 'pressure_injury', 'other')),
  etiology TEXT,  -- cause/origin (e.g., 'post-Mohs surgery', 'diabetic', 'venous insufficiency', 'arterial', 'pressure')

  -- Location
  body_region TEXT NOT NULL,  -- anatomical region (e.g., 'nose', 'lower leg', 'sacrum')
  x_position NUMERIC,  -- x coordinate on body map (0-100)
  y_position NUMERIC,  -- y coordinate on body map (0-100)
  laterality TEXT,  -- 'left', 'right', 'bilateral', 'midline'

  -- Initial measurements
  length_cm NUMERIC,
  width_cm NUMERIC,
  depth_cm NUMERIC,
  area_cm2 NUMERIC,

  -- Clinical assessment
  wound_bed TEXT CHECK (wound_bed IN ('granulation', 'slough', 'eschar', 'epithelializing', 'mixed', 'necrotic')),
  wound_bed_percentage JSONB,  -- e.g., {"granulation": 70, "slough": 30}
  exudate_amount TEXT CHECK (exudate_amount IN ('none', 'scant', 'moderate', 'heavy')),
  exudate_type TEXT CHECK (exudate_type IN ('serous', 'sanguineous', 'purulent', 'serosanguineous')),

  -- Periwound condition
  periwound_skin TEXT CHECK (periwound_skin IN ('healthy', 'macerated', 'erythematous', 'indurated', 'fragile', 'edematous')),
  undermining_present BOOLEAN DEFAULT false,
  undermining_location TEXT,  -- clock positions or description
  tunneling_present BOOLEAN DEFAULT false,
  tunneling_location TEXT,

  -- Clinical signs
  infection_signs BOOLEAN DEFAULT false,
  infection_notes TEXT,  -- specific signs like warmth, odor, purulence
  pain_level INTEGER CHECK (pain_level BETWEEN 0 AND 10),
  odor_present BOOLEAN DEFAULT false,

  -- Treatment
  current_dressing TEXT,
  dressing_change_frequency TEXT,  -- e.g., 'daily', 'every 2 days', 'twice weekly'
  debridement_needed BOOLEAN DEFAULT false,
  last_debridement_date DATE,

  -- Status tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'healing', 'healed', 'chronic', 'stalled', 'deteriorating')),
  onset_date DATE NOT NULL,
  healed_date DATE,

  -- Clinical notes
  notes TEXT,
  treatment_plan TEXT,

  -- Audit fields
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Wound assessments table for tracking healing progression
CREATE TABLE IF NOT EXISTS wound_assessments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  wound_id TEXT NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Assessment details
  assessment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Measurements
  length_cm NUMERIC,
  width_cm NUMERIC,
  depth_cm NUMERIC,
  area_cm2 NUMERIC,

  -- Wound bed composition (percentages should total 100)
  wound_bed_percentage JSONB,  -- e.g., {"granulation": 80, "slough": 15, "epithelializing": 5}

  -- Wound appearance
  wound_bed TEXT CHECK (wound_bed IN ('granulation', 'slough', 'eschar', 'epithelializing', 'mixed', 'necrotic')),
  exudate_amount TEXT CHECK (exudate_amount IN ('none', 'scant', 'moderate', 'heavy')),
  exudate_type TEXT CHECK (exudate_type IN ('serous', 'sanguineous', 'purulent', 'serosanguineous')),

  -- Periwound assessment
  periwound_skin TEXT CHECK (periwound_skin IN ('healthy', 'macerated', 'erythematous', 'indurated', 'fragile', 'edematous')),
  undermining_present BOOLEAN DEFAULT false,
  undermining_measurement TEXT,
  tunneling_present BOOLEAN DEFAULT false,
  tunneling_measurement TEXT,

  -- Clinical evaluation
  infection_signs BOOLEAN DEFAULT false,
  infection_notes TEXT,
  pain_level INTEGER CHECK (pain_level BETWEEN 0 AND 10),
  odor_present BOOLEAN DEFAULT false,

  -- Treatment applied
  treatment_applied TEXT,  -- debridement, dressing change, etc.
  dressing_applied TEXT,  -- type of dressing used
  cleaning_solution TEXT,  -- e.g., 'normal saline', 'wound cleanser'

  -- Progress evaluation
  healing_trend TEXT CHECK (healing_trend IN ('improving', 'stable', 'declining', 'stalled')),
  healing_percentage NUMERIC,  -- estimated % healed

  -- Documentation
  photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  provider_notes TEXT,
  patient_complaints TEXT,

  -- Follow-up
  next_assessment_date DATE,
  treatment_changes TEXT,
  referral_needed BOOLEAN DEFAULT false,
  referral_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wounds_tenant ON wounds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wounds_patient ON wounds(patient_id);
CREATE INDEX IF NOT EXISTS idx_wounds_status ON wounds(status);
CREATE INDEX IF NOT EXISTS idx_wounds_onset_date ON wounds(onset_date DESC);
CREATE INDEX IF NOT EXISTS idx_wounds_body_region ON wounds(body_region);
CREATE INDEX IF NOT EXISTS idx_wounds_wound_type ON wounds(wound_type);
CREATE INDEX IF NOT EXISTS idx_wounds_active ON wounds(tenant_id, status) WHERE deleted_at IS NULL AND status IN ('open', 'healing');

CREATE INDEX IF NOT EXISTS idx_wound_assessments_tenant ON wound_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_wound ON wound_assessments(wound_id);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_patient ON wound_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_date ON wound_assessments(assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_healing_trend ON wound_assessments(healing_trend);

-- Update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wounds_updated_at
  BEFORE UPDATE ON wounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER wound_assessments_updated_at
  BEFORE UPDATE ON wound_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate wound healing rate
CREATE OR REPLACE FUNCTION calculate_wound_healing_rate(p_wound_id TEXT)
RETURNS TABLE (
  days_since_onset INTEGER,
  initial_area_cm2 NUMERIC,
  current_area_cm2 NUMERIC,
  area_reduction_cm2 NUMERIC,
  area_reduction_percent NUMERIC,
  average_healing_rate_per_week NUMERIC,
  healing_trend TEXT,
  assessment_count INTEGER
) AS $$
DECLARE
  v_onset_date DATE;
  v_initial_area NUMERIC;
  v_latest_area NUMERIC;
BEGIN
  -- Get wound onset date and initial area
  SELECT onset_date, area_cm2
  INTO v_onset_date, v_initial_area
  FROM wounds
  WHERE id = p_wound_id;

  -- Get latest assessment area
  SELECT area_cm2
  INTO v_latest_area
  FROM wound_assessments
  WHERE wound_id = p_wound_id
  ORDER BY assessment_date DESC
  LIMIT 1;

  -- Use initial wound area if no assessments yet
  IF v_latest_area IS NULL THEN
    v_latest_area := v_initial_area;
  END IF;

  RETURN QUERY
  SELECT
    CURRENT_DATE - v_onset_date as days_since_onset,
    v_initial_area as initial_area_cm2,
    v_latest_area as current_area_cm2,
    v_initial_area - v_latest_area as area_reduction_cm2,
    CASE
      WHEN v_initial_area > 0 THEN ((v_initial_area - v_latest_area) / v_initial_area * 100)::NUMERIC
      ELSE 0::NUMERIC
    END as area_reduction_percent,
    CASE
      WHEN v_onset_date IS NOT NULL AND (CURRENT_DATE - v_onset_date) > 0 THEN
        ((v_initial_area - v_latest_area) / NULLIF(CURRENT_DATE - v_onset_date, 0) * 7)::NUMERIC
      ELSE 0::NUMERIC
    END as average_healing_rate_per_week,
    (
      SELECT healing_trend
      FROM wound_assessments
      WHERE wound_id = p_wound_id
      ORDER BY assessment_date DESC
      LIMIT 1
    ) as healing_trend,
    (SELECT COUNT(*)::INTEGER FROM wound_assessments WHERE wound_id = p_wound_id) as assessment_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get active wounds for a patient
CREATE OR REPLACE FUNCTION get_active_wounds_for_patient(p_tenant_id TEXT, p_patient_id TEXT)
RETURNS TABLE (
  wound_id TEXT,
  wound_type TEXT,
  body_region TEXT,
  status TEXT,
  onset_date DATE,
  days_open INTEGER,
  current_area_cm2 NUMERIC,
  last_assessment_date TIMESTAMPTZ,
  healing_trend TEXT,
  infection_signs BOOLEAN,
  pain_level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id,
    w.wound_type,
    w.body_region,
    w.status,
    w.onset_date,
    (CURRENT_DATE - w.onset_date)::INTEGER as days_open,
    COALESCE(
      (SELECT wa.area_cm2 FROM wound_assessments wa
       WHERE wa.wound_id = w.id
       ORDER BY wa.assessment_date DESC LIMIT 1),
      w.area_cm2
    ) as current_area_cm2,
    (SELECT wa.assessment_date FROM wound_assessments wa
     WHERE wa.wound_id = w.id
     ORDER BY wa.assessment_date DESC LIMIT 1) as last_assessment_date,
    (SELECT wa.healing_trend FROM wound_assessments wa
     WHERE wa.wound_id = w.id
     ORDER BY wa.assessment_date DESC LIMIT 1) as healing_trend,
    w.infection_signs,
    w.pain_level
  FROM wounds w
  WHERE w.tenant_id = p_tenant_id
    AND w.patient_id = p_patient_id
    AND w.deleted_at IS NULL
    AND w.status IN ('open', 'healing', 'chronic', 'stalled', 'deteriorating')
  ORDER BY w.onset_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to update wound status based on latest assessment
CREATE OR REPLACE FUNCTION update_wound_status_on_assessment()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update wound status based on healing trend
  UPDATE wounds
  SET
    status = CASE
      WHEN NEW.healing_trend = 'improving' AND NEW.healing_percentage >= 95 THEN 'healed'
      WHEN NEW.healing_trend = 'improving' THEN 'healing'
      WHEN NEW.healing_trend = 'declining' THEN 'deteriorating'
      WHEN NEW.healing_trend = 'stalled' THEN 'stalled'
      ELSE status
    END,
    healed_date = CASE
      WHEN NEW.healing_trend = 'improving' AND NEW.healing_percentage >= 95 THEN CURRENT_DATE
      ELSE healed_date
    END,
    -- Update current measurements
    length_cm = NEW.length_cm,
    width_cm = NEW.width_cm,
    depth_cm = NEW.depth_cm,
    area_cm2 = NEW.area_cm2,
    wound_bed = NEW.wound_bed,
    exudate_amount = NEW.exudate_amount,
    exudate_type = NEW.exudate_type,
    periwound_skin = NEW.periwound_skin,
    infection_signs = NEW.infection_signs,
    pain_level = NEW.pain_level,
    updated_at = NOW()
  WHERE id = NEW.wound_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wound_on_assessment
  AFTER INSERT ON wound_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_wound_status_on_assessment();

-- Add wound_id to photos table if not exists (must be done before view creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'wound_id'
  ) THEN
    ALTER TABLE photos ADD COLUMN wound_id TEXT REFERENCES wounds(id) ON DELETE SET NULL;
    CREATE INDEX idx_photos_wound_id ON photos(wound_id);
    COMMENT ON COLUMN photos.wound_id IS 'Links photo to specific wound for documentation';
  END IF;
END $$;

-- View for comprehensive wound overview
CREATE OR REPLACE VIEW v_wound_overview AS
SELECT
  w.id,
  w.tenant_id,
  w.patient_id,
  p.first_name || ' ' || p.last_name as patient_name,
  p.mrn,
  w.wound_type,
  w.etiology,
  w.body_region,
  w.status,
  w.onset_date,
  w.healed_date,
  (CURRENT_DATE - w.onset_date)::INTEGER as days_since_onset,
  w.area_cm2 as initial_area_cm2,
  w.infection_signs,
  w.pain_level,
  w.current_dressing,
  -- Latest assessment data
  (SELECT assessment_date FROM wound_assessments
   WHERE wound_id = w.id
   ORDER BY assessment_date DESC LIMIT 1) as last_assessment_date,
  (SELECT area_cm2 FROM wound_assessments
   WHERE wound_id = w.id
   ORDER BY assessment_date DESC LIMIT 1) as current_area_cm2,
  (SELECT healing_trend FROM wound_assessments
   WHERE wound_id = w.id
   ORDER BY assessment_date DESC LIMIT 1) as healing_trend,
  (SELECT healing_percentage FROM wound_assessments
   WHERE wound_id = w.id
   ORDER BY assessment_date DESC LIMIT 1) as healing_percentage,
  -- Counts
  (SELECT COUNT(*) FROM wound_assessments WHERE wound_id = w.id) as assessment_count
FROM wounds w
JOIN patients p ON w.patient_id = p.id
WHERE w.deleted_at IS NULL;

-- Comments
COMMENT ON TABLE wounds IS 'Tracks all patient wounds including surgical, chronic, and acute wounds';
COMMENT ON TABLE wound_assessments IS 'Serial assessments tracking wound healing progression over time';
COMMENT ON COLUMN wounds.wound_type IS 'Classification: surgical, ulcer, burn, laceration, pressure_injury, other';
COMMENT ON COLUMN wounds.etiology IS 'Underlying cause (e.g., post-Mohs surgery, diabetic, venous, arterial, pressure)';
COMMENT ON COLUMN wounds.wound_bed_percentage IS 'JSON object with tissue type percentages (should total 100)';
COMMENT ON COLUMN wound_assessments.healing_trend IS 'Provider assessment of healing progression: improving, stable, declining, stalled';
COMMENT ON COLUMN wound_assessments.healing_percentage IS 'Estimated percentage of wound healed (0-100)';
COMMENT ON FUNCTION calculate_wound_healing_rate IS 'Calculates healing rate metrics for wound tracking';
COMMENT ON FUNCTION get_active_wounds_for_patient IS 'Returns all active wounds for a patient with latest assessment data';
COMMENT ON VIEW v_wound_overview IS 'Comprehensive view of all wounds with latest assessment data and metrics';
