-- Lesion Comparison and Tracking System
-- Comprehensive system for tracking and comparing lesions over time
-- Critical for dermatology: early detection of changes in suspicious lesions

-- =====================================================
-- TRACKED LESIONS TABLE
-- Main table for lesions under active monitoring
-- =====================================================
CREATE TABLE IF NOT EXISTS tracked_lesions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Body location with standardized coding
  body_location_code VARCHAR(50) NOT NULL,
  body_location_description VARCHAR(255) NOT NULL,

  -- Tracking metadata
  first_documented TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'excised')),

  -- Clinical description
  clinical_description TEXT,

  -- Suspicion level 1-5 (1=benign appearing, 5=highly suspicious)
  suspicion_level INTEGER NOT NULL DEFAULT 1
    CHECK (suspicion_level BETWEEN 1 AND 5),

  -- Link to existing lesion record if applicable
  lesion_id UUID REFERENCES lesions(id) ON DELETE SET NULL,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for tracked_lesions
CREATE INDEX IF NOT EXISTS idx_tracked_lesions_tenant ON tracked_lesions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tracked_lesions_patient ON tracked_lesions(patient_id);
CREATE INDEX IF NOT EXISTS idx_tracked_lesions_status ON tracked_lesions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tracked_lesions_suspicion ON tracked_lesions(suspicion_level DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_lesions_location ON tracked_lesions(body_location_code);

-- =====================================================
-- LESION IMAGES TABLE
-- Photos and dermoscopy images for lesions
-- =====================================================
CREATE TABLE IF NOT EXISTS lesion_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lesion_id UUID NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

  -- Image URLs
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- Capture metadata
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_by UUID NOT NULL REFERENCES users(id),

  -- Image type
  dermoscopy BOOLEAN NOT NULL DEFAULT false,

  -- Measurements stored as JSONB for flexibility
  -- Example: {"length_mm": 5.2, "width_mm": 3.1, "scale_factor": 1.5}
  measurements JSONB DEFAULT '{}',

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for lesion_images
CREATE INDEX IF NOT EXISTS idx_lesion_images_lesion ON lesion_images(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_images_captured ON lesion_images(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_images_encounter ON lesion_images(encounter_id);
CREATE INDEX IF NOT EXISTS idx_lesion_images_dermoscopy ON lesion_images(dermoscopy) WHERE dermoscopy = true;

-- =====================================================
-- LESION MEASUREMENTS TABLE
-- Detailed measurements for tracking size changes
-- =====================================================
CREATE TABLE IF NOT EXISTS lesion_tracking_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lesion_id UUID NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

  -- Dimensions in millimeters
  length_mm DECIMAL(10,2),
  width_mm DECIMAL(10,2),
  height_mm DECIMAL(10,2),

  -- Visual characteristics
  color VARCHAR(100),
  border VARCHAR(100),
  symmetry VARCHAR(50),

  -- Notes
  notes TEXT,

  -- Measurement metadata
  measured_by UUID NOT NULL REFERENCES users(id),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lesion_tracking_measurements
CREATE INDEX IF NOT EXISTS idx_lesion_tracking_meas_lesion ON lesion_tracking_measurements(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_tracking_meas_date ON lesion_tracking_measurements(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_tracking_meas_encounter ON lesion_tracking_measurements(encounter_id);

-- =====================================================
-- LESION ABCDE SCORES TABLE
-- ABCDE melanoma detection scoring
-- =====================================================
CREATE TABLE IF NOT EXISTS lesion_abcde_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lesion_id UUID NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

  -- ABCDE criteria (each scored 0-2)
  asymmetry INTEGER NOT NULL CHECK (asymmetry BETWEEN 0 AND 2),
  border INTEGER NOT NULL CHECK (border BETWEEN 0 AND 2),
  color INTEGER NOT NULL CHECK (color BETWEEN 0 AND 2),
  diameter INTEGER NOT NULL CHECK (diameter BETWEEN 0 AND 2),
  evolution INTEGER NOT NULL CHECK (evolution BETWEEN 0 AND 2),

  -- Calculated total score (0-10)
  total_score INTEGER GENERATED ALWAYS AS (asymmetry + border + color + diameter + evolution) STORED,

  -- Assessment metadata
  assessed_by UUID NOT NULL REFERENCES users(id),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Notes and observations
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lesion_abcde_scores
CREATE INDEX IF NOT EXISTS idx_lesion_abcde_lesion ON lesion_abcde_scores(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_abcde_score ON lesion_abcde_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_abcde_date ON lesion_abcde_scores(assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_abcde_encounter ON lesion_abcde_scores(encounter_id);

-- =====================================================
-- LESION OUTCOMES TABLE
-- Track outcomes: biopsy, excision, monitoring
-- =====================================================
CREATE TABLE IF NOT EXISTS lesion_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lesion_id UUID NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,

  -- Outcome type
  outcome_type VARCHAR(50) NOT NULL
    CHECK (outcome_type IN ('biopsy', 'excision', 'monitoring', 'referral', 'resolved')),

  -- Outcome details
  outcome_date DATE NOT NULL,
  pathology_result TEXT,
  diagnosis_code VARCHAR(20),

  -- Link to biopsy if applicable
  biopsy_id UUID REFERENCES biopsies(id) ON DELETE SET NULL,

  -- Provider who documented outcome
  documented_by UUID NOT NULL REFERENCES users(id),

  -- Notes
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lesion_outcomes
CREATE INDEX IF NOT EXISTS idx_lesion_outcomes_lesion ON lesion_outcomes(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_outcomes_type ON lesion_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_lesion_outcomes_date ON lesion_outcomes(outcome_date DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_outcomes_diagnosis ON lesion_outcomes(diagnosis_code) WHERE diagnosis_code IS NOT NULL;

-- =====================================================
-- LESION CHANGE ALERTS TABLE
-- Track significant changes that require attention
-- =====================================================
CREATE TABLE IF NOT EXISTS lesion_change_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lesion_id UUID NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Alert details
  alert_type VARCHAR(50) NOT NULL
    CHECK (alert_type IN ('size_increase', 'abcde_increase', 'suspicion_elevated', 'follow_up_due')),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Change details
  previous_value JSONB,
  current_value JSONB,
  change_percentage DECIMAL(10,2),

  -- Alert message
  message TEXT NOT NULL,

  -- Alert status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),

  -- Actions taken
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lesion_change_alerts
CREATE INDEX IF NOT EXISTS idx_lesion_alerts_lesion ON lesion_change_alerts(lesion_id);
CREATE INDEX IF NOT EXISTS idx_lesion_alerts_patient ON lesion_change_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_lesion_alerts_status ON lesion_change_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_lesion_alerts_severity ON lesion_change_alerts(severity DESC);
CREATE INDEX IF NOT EXISTS idx_lesion_alerts_type ON lesion_change_alerts(alert_type);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update updated_at timestamp on tracked_lesions
CREATE OR REPLACE FUNCTION update_tracked_lesion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tracked_lesion_updated ON tracked_lesions;
CREATE TRIGGER tracked_lesion_updated
  BEFORE UPDATE ON tracked_lesions
  FOR EACH ROW
  EXECUTE FUNCTION update_tracked_lesion_timestamp();

-- Trigger: Update updated_at on lesion_images
DROP TRIGGER IF EXISTS lesion_image_updated ON lesion_images;
CREATE TRIGGER lesion_image_updated
  BEFORE UPDATE ON lesion_images
  FOR EACH ROW
  EXECUTE FUNCTION update_tracked_lesion_timestamp();

-- Trigger: Detect size changes >20% and create alerts
CREATE OR REPLACE FUNCTION check_lesion_size_change()
RETURNS TRIGGER AS $$
DECLARE
  prev_measurement RECORD;
  prev_area DECIMAL;
  new_area DECIMAL;
  change_pct DECIMAL;
  lesion_record RECORD;
BEGIN
  -- Get the previous measurement for this lesion
  SELECT * INTO prev_measurement
  FROM lesion_tracking_measurements
  WHERE lesion_id = NEW.lesion_id
    AND id != NEW.id
  ORDER BY measured_at DESC
  LIMIT 1;

  -- If there's a previous measurement, check for significant change
  IF prev_measurement IS NOT NULL THEN
    prev_area := COALESCE(prev_measurement.length_mm, 0) * COALESCE(prev_measurement.width_mm, 0);
    new_area := COALESCE(NEW.length_mm, 0) * COALESCE(NEW.width_mm, 0);

    IF prev_area > 0 THEN
      change_pct := ((new_area - prev_area) / prev_area) * 100;

      -- If size increased by more than 20%, create alert
      IF change_pct > 20 THEN
        SELECT * INTO lesion_record FROM tracked_lesions WHERE id = NEW.lesion_id;

        INSERT INTO lesion_change_alerts (
          tenant_id,
          lesion_id,
          patient_id,
          alert_type,
          severity,
          previous_value,
          current_value,
          change_percentage,
          message
        ) VALUES (
          NEW.tenant_id,
          NEW.lesion_id,
          lesion_record.patient_id,
          'size_increase',
          CASE
            WHEN change_pct > 50 THEN 'critical'
            WHEN change_pct > 35 THEN 'high'
            ELSE 'medium'
          END,
          jsonb_build_object('length_mm', prev_measurement.length_mm, 'width_mm', prev_measurement.width_mm, 'area', prev_area),
          jsonb_build_object('length_mm', NEW.length_mm, 'width_mm', NEW.width_mm, 'area', new_area),
          change_pct,
          'Lesion size increased by ' || ROUND(change_pct, 1) || '% - requires review'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_size_change ON lesion_tracking_measurements;
CREATE TRIGGER check_size_change
  AFTER INSERT ON lesion_tracking_measurements
  FOR EACH ROW
  EXECUTE FUNCTION check_lesion_size_change();

-- Trigger: Detect ABCDE score increases and create alerts
CREATE OR REPLACE FUNCTION check_abcde_score_change()
RETURNS TRIGGER AS $$
DECLARE
  prev_score RECORD;
  lesion_record RECORD;
BEGIN
  -- Get the previous ABCDE score for this lesion
  SELECT * INTO prev_score
  FROM lesion_abcde_scores
  WHERE lesion_id = NEW.lesion_id
    AND id != NEW.id
  ORDER BY assessed_at DESC
  LIMIT 1;

  -- If there's a previous score and new total is higher, create alert
  IF prev_score IS NOT NULL AND NEW.asymmetry + NEW.border + NEW.color + NEW.diameter + NEW.evolution > prev_score.total_score THEN
    SELECT * INTO lesion_record FROM tracked_lesions WHERE id = NEW.lesion_id;

    INSERT INTO lesion_change_alerts (
      tenant_id,
      lesion_id,
      patient_id,
      alert_type,
      severity,
      previous_value,
      current_value,
      change_percentage,
      message
    ) VALUES (
      NEW.tenant_id,
      NEW.lesion_id,
      lesion_record.patient_id,
      'abcde_increase',
      CASE
        WHEN NEW.asymmetry + NEW.border + NEW.color + NEW.diameter + NEW.evolution >= 7 THEN 'critical'
        WHEN NEW.asymmetry + NEW.border + NEW.color + NEW.diameter + NEW.evolution >= 5 THEN 'high'
        ELSE 'medium'
      END,
      jsonb_build_object('total_score', prev_score.total_score, 'A', prev_score.asymmetry, 'B', prev_score.border, 'C', prev_score.color, 'D', prev_score.diameter, 'E', prev_score.evolution),
      jsonb_build_object('total_score', NEW.asymmetry + NEW.border + NEW.color + NEW.diameter + NEW.evolution, 'A', NEW.asymmetry, 'B', NEW.border, 'C', NEW.color, 'D', NEW.diameter, 'E', NEW.evolution),
      NULL,
      'ABCDE score increased from ' || prev_score.total_score || ' to ' || (NEW.asymmetry + NEW.border + NEW.color + NEW.diameter + NEW.evolution) || ' - requires review'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_abcde_change ON lesion_abcde_scores;
CREATE TRIGGER check_abcde_change
  AFTER INSERT ON lesion_abcde_scores
  FOR EACH ROW
  EXECUTE FUNCTION check_abcde_score_change();

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Lesion comparison summary
CREATE OR REPLACE VIEW lesion_comparison_summary AS
SELECT
  tl.id AS lesion_id,
  tl.tenant_id,
  tl.patient_id,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.mrn,
  tl.body_location_code,
  tl.body_location_description,
  tl.clinical_description,
  tl.status,
  tl.suspicion_level,
  tl.first_documented,

  -- Latest measurement
  (SELECT length_mm FROM lesion_tracking_measurements WHERE lesion_id = tl.id ORDER BY measured_at DESC LIMIT 1) AS latest_length_mm,
  (SELECT width_mm FROM lesion_tracking_measurements WHERE lesion_id = tl.id ORDER BY measured_at DESC LIMIT 1) AS latest_width_mm,
  (SELECT measured_at FROM lesion_tracking_measurements WHERE lesion_id = tl.id ORDER BY measured_at DESC LIMIT 1) AS last_measured,

  -- First measurement
  (SELECT length_mm FROM lesion_tracking_measurements WHERE lesion_id = tl.id ORDER BY measured_at ASC LIMIT 1) AS first_length_mm,
  (SELECT width_mm FROM lesion_tracking_measurements WHERE lesion_id = tl.id ORDER BY measured_at ASC LIMIT 1) AS first_width_mm,

  -- Latest ABCDE score
  (SELECT total_score FROM lesion_abcde_scores WHERE lesion_id = tl.id ORDER BY assessed_at DESC LIMIT 1) AS latest_abcde_score,
  (SELECT assessed_at FROM lesion_abcde_scores WHERE lesion_id = tl.id ORDER BY assessed_at DESC LIMIT 1) AS last_abcde_assessed,

  -- Image count
  (SELECT COUNT(*) FROM lesion_images WHERE lesion_id = tl.id AND deleted_at IS NULL) AS image_count,

  -- Active alerts
  (SELECT COUNT(*) FROM lesion_change_alerts WHERE lesion_id = tl.id AND status = 'active') AS active_alert_count,

  -- Measurements count
  (SELECT COUNT(*) FROM lesion_tracking_measurements WHERE lesion_id = tl.id) AS measurement_count

FROM tracked_lesions tl
JOIN patients p ON tl.patient_id = p.id
WHERE tl.deleted_at IS NULL;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE tracked_lesions IS 'Lesions under active monitoring and comparison tracking';
COMMENT ON TABLE lesion_images IS 'Photos and dermoscopy images for tracked lesions';
COMMENT ON TABLE lesion_tracking_measurements IS 'Size and characteristic measurements for lesion comparison';
COMMENT ON TABLE lesion_abcde_scores IS 'ABCDE melanoma detection scores for tracked lesions';
COMMENT ON TABLE lesion_outcomes IS 'Outcomes for tracked lesions: biopsy, excision, etc.';
COMMENT ON TABLE lesion_change_alerts IS 'Alerts for significant changes in lesion measurements or scores';
COMMENT ON VIEW lesion_comparison_summary IS 'Summary view for lesion comparison dashboard';
