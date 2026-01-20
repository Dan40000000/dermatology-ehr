-- Patient Photos and Comparison System
-- For tracking treatment progress with before/after photos

CREATE TABLE patient_photos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
  lesion_id TEXT, -- References patient_lesions if that table exists

  -- Photo details
  file_path TEXT NOT NULL, -- Full path to stored image
  thumbnail_path TEXT, -- Smaller version for thumbnails
  original_filename TEXT,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  width INTEGER,
  height INTEGER,

  -- Classification
  body_region TEXT NOT NULL, -- face, chest, back, arm_left, arm_right, leg_left, leg_right, hand_left, hand_right, foot_left, foot_right, abdomen, neck, scalp, other
  photo_type TEXT DEFAULT 'clinical', -- clinical, cosmetic, baseline, followup, consent, other
  view_angle TEXT, -- frontal, left_lateral, right_lateral, superior, inferior, closeup

  -- Metadata
  taken_at TIMESTAMPTZ DEFAULT NOW(),
  taken_by TEXT, -- User ID of provider or staff who captured/uploaded
  device_info TEXT, -- Camera/device used
  lighting_conditions TEXT, -- good, poor, flash, natural

  -- Annotations stored as JSON
  -- Format: { shapes: [{ type: 'circle|arrow|line|text', coords: [], color: '', text: '' }], measurements: [{ from: [], to: [], length_mm: 0 }] }
  annotations JSONB,

  -- For comparisons and grouping
  comparison_group TEXT, -- Group related photos together (e.g., "baseline_acne_treatment")
  is_baseline BOOLEAN DEFAULT FALSE, -- Mark as the baseline/starting photo
  treatment_phase TEXT, -- before_treatment, during_treatment, after_treatment, followup_1mo, followup_3mo, etc.

  -- Clinical notes
  notes TEXT,
  clinical_findings TEXT, -- What's visible in the photo

  -- Privacy and consent
  patient_consent BOOLEAN DEFAULT TRUE,
  share_with_patient BOOLEAN DEFAULT FALSE, -- Can patient see this in portal?
  consent_form_id TEXT, -- Reference to signed consent if applicable

  -- HIPAA compliance
  metadata_stripped BOOLEAN DEFAULT FALSE, -- EXIF data removed?
  phi_removed BOOLEAN DEFAULT FALSE, -- Face/identifying info obscured if needed?

  -- Soft delete
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_body_region CHECK (body_region IN (
    'face', 'chest', 'back', 'arm_left', 'arm_right',
    'leg_left', 'leg_right', 'hand_left', 'hand_right',
    'foot_left', 'foot_right', 'abdomen', 'neck', 'scalp',
    'shoulder_left', 'shoulder_right', 'other'
  )),

  CONSTRAINT valid_photo_type CHECK (photo_type IN (
    'clinical', 'cosmetic', 'baseline', 'followup', 'consent', 'dermoscopic', 'other'
  ))
);

-- Photo comparisons - before/after pairs
CREATE TABLE photo_comparisons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  before_photo_id TEXT NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,
  after_photo_id TEXT NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,

  -- Generated comparison image (side-by-side or slider)
  comparison_image_path TEXT, -- Pre-rendered comparison for quick viewing
  comparison_type TEXT DEFAULT 'side_by_side', -- side_by_side, slider, overlay

  -- Treatment context
  treatment_description TEXT, -- What was done between before and after
  treatment_start_date DATE,
  treatment_end_date DATE,
  days_between INTEGER, -- Auto-calculated

  -- Clinical assessment
  improvement_score INTEGER, -- 0-10 scale, or null
  improvement_notes TEXT,

  -- Sharing and export
  shared_with_patient BOOLEAN DEFAULT FALSE,
  included_in_note BOOLEAN DEFAULT FALSE,
  encounter_id TEXT REFERENCES encounters(id), -- If added to clinical note

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT, -- User ID who created comparison
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT before_after_different CHECK (before_photo_id != after_photo_id),
  CONSTRAINT valid_improvement_score CHECK (improvement_score IS NULL OR (improvement_score >= 0 AND improvement_score <= 10))
);

-- Photo tags for better organization
CREATE TABLE photo_tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  photo_id TEXT NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,
  tag TEXT NOT NULL, -- acne, rash, lesion, mole, post_procedure, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  UNIQUE(photo_id, tag)
);

-- Photo access log for HIPAA compliance
CREATE TABLE photo_access_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  photo_id TEXT NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- viewed, downloaded, printed, shared, deleted, modified
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_patient_photos_patient ON patient_photos(patient_id, taken_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_patient_photos_tenant ON patient_photos(tenant_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_patient_photos_body_region ON patient_photos(patient_id, body_region, taken_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_patient_photos_comparison_group ON patient_photos(comparison_group) WHERE comparison_group IS NOT NULL;
CREATE INDEX idx_patient_photos_encounter ON patient_photos(encounter_id) WHERE encounter_id IS NOT NULL;
CREATE INDEX idx_patient_photos_lesion ON patient_photos(lesion_id) WHERE lesion_id IS NOT NULL;
CREATE INDEX idx_patient_photos_baseline ON patient_photos(patient_id, is_baseline) WHERE is_baseline = TRUE;

CREATE INDEX idx_photo_comparisons_patient ON photo_comparisons(patient_id, created_at DESC);
CREATE INDEX idx_photo_comparisons_tenant ON photo_comparisons(tenant_id);
CREATE INDEX idx_photo_comparisons_before ON photo_comparisons(before_photo_id);
CREATE INDEX idx_photo_comparisons_after ON photo_comparisons(after_photo_id);
CREATE INDEX idx_photo_comparisons_encounter ON photo_comparisons(encounter_id) WHERE encounter_id IS NOT NULL;

CREATE INDEX idx_photo_tags_photo ON photo_tags(photo_id);
CREATE INDEX idx_photo_tags_tag ON photo_tags(tenant_id, tag);

CREATE INDEX idx_photo_access_log_photo ON photo_access_log(photo_id, accessed_at DESC);
CREATE INDEX idx_photo_access_log_user ON photo_access_log(user_id, accessed_at DESC);

-- Update trigger
CREATE OR REPLACE FUNCTION update_patient_photos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_photos_updated_at
  BEFORE UPDATE ON patient_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_photos_updated_at();

CREATE TRIGGER photo_comparisons_updated_at
  BEFORE UPDATE ON photo_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_photos_updated_at();

-- Function to calculate days between photos
CREATE OR REPLACE FUNCTION calculate_comparison_days()
RETURNS TRIGGER AS $$
DECLARE
  before_date TIMESTAMPTZ;
  after_date TIMESTAMPTZ;
BEGIN
  SELECT taken_at INTO before_date FROM patient_photos WHERE id = NEW.before_photo_id;
  SELECT taken_at INTO after_date FROM patient_photos WHERE id = NEW.after_photo_id;

  IF before_date IS NOT NULL AND after_date IS NOT NULL THEN
    NEW.days_between = EXTRACT(DAY FROM after_date - before_date)::INTEGER;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_comparison_days_trigger
  BEFORE INSERT OR UPDATE ON photo_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION calculate_comparison_days();

-- Comments for documentation
COMMENT ON TABLE patient_photos IS 'Clinical photos for tracking treatment progress and documenting conditions';
COMMENT ON TABLE photo_comparisons IS 'Before/after photo comparisons for visualizing treatment outcomes';
COMMENT ON COLUMN patient_photos.body_region IS 'Anatomical location of the photo';
COMMENT ON COLUMN patient_photos.comparison_group IS 'Groups photos together for timeline/comparison views';
COMMENT ON COLUMN patient_photos.is_baseline IS 'Marks this as the starting point for treatment tracking';
COMMENT ON COLUMN patient_photos.annotations IS 'JSON structure for drawings, measurements, and markup';
COMMENT ON COLUMN photo_comparisons.days_between IS 'Auto-calculated number of days between before and after photos';
