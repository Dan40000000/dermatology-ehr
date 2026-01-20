-- Photo-to-Body-Map Linking Migration
-- Links photos to body map markers/lesions for comprehensive visual tracking

-- Add body map linking columns to patient_photos table
ALTER TABLE patient_photos
  ADD COLUMN IF NOT EXISTS body_map_marker_id TEXT,
  ADD COLUMN IF NOT EXISTS x_position NUMERIC(5,2) CHECK (x_position IS NULL OR (x_position >= 0 AND x_position <= 100)),
  ADD COLUMN IF NOT EXISTS y_position NUMERIC(5,2) CHECK (y_position IS NULL OR (y_position >= 0 AND y_position <= 100)),
  ADD COLUMN IF NOT EXISTS body_view TEXT CHECK (body_view IS NULL OR body_view IN ('front', 'back', 'head-front', 'head-back', 'left-side', 'right-side'));

-- Add foreign key constraint for lesion_id if patient_lesions table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_lesions') THEN
    -- Add foreign key if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_patient_photos_lesion_id'
    ) THEN
      ALTER TABLE patient_photos
        ADD CONSTRAINT fk_patient_photos_lesion_id
        FOREIGN KEY (lesion_id) REFERENCES patient_lesions(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Update photo_comparisons table with additional fields
ALTER TABLE photo_comparisons
  ADD COLUMN IF NOT EXISTS body_region TEXT,
  ADD COLUMN IF NOT EXISTS time_between_days INTEGER,
  ADD COLUMN IF NOT EXISTS comparison_category TEXT CHECK (comparison_category IS NULL OR comparison_category IN ('treatment_progress', 'lesion_evolution', 'cosmetic_result', 'post_procedure', 'side_effect_monitoring'));

-- Create trigger to auto-calculate time_between_days in photo_comparisons
CREATE OR REPLACE FUNCTION calculate_photo_comparison_time()
RETURNS TRIGGER AS $$
DECLARE
  before_date TIMESTAMPTZ;
  after_date TIMESTAMPTZ;
BEGIN
  -- Get the taken_at dates from both photos
  SELECT taken_at INTO before_date FROM patient_photos WHERE id = NEW.before_photo_id;
  SELECT taken_at INTO after_date FROM patient_photos WHERE id = NEW.after_photo_id;

  -- Calculate days between
  IF before_date IS NOT NULL AND after_date IS NOT NULL THEN
    NEW.time_between_days = EXTRACT(DAY FROM after_date - before_date)::INTEGER;
  END IF;

  -- Also update the existing days_between column for backwards compatibility
  IF before_date IS NOT NULL AND after_date IS NOT NULL THEN
    NEW.days_between = EXTRACT(DAY FROM after_date - before_date)::INTEGER;
  END IF;

  -- Auto-populate body_region from before photo if not set
  IF NEW.body_region IS NULL THEN
    SELECT body_region INTO NEW.body_region FROM patient_photos WHERE id = NEW.before_photo_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS calculate_photo_comparison_time_trigger ON photo_comparisons;
CREATE TRIGGER calculate_photo_comparison_time_trigger
  BEFORE INSERT OR UPDATE ON photo_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION calculate_photo_comparison_time();

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_patient_photos_body_map_marker ON patient_photos(body_map_marker_id) WHERE body_map_marker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_photos_body_view ON patient_photos(body_view) WHERE body_view IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_photos_coordinates ON patient_photos(patient_id, x_position, y_position) WHERE x_position IS NOT NULL AND y_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_comparisons_body_region ON photo_comparisons(body_region) WHERE body_region IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_comparisons_category ON photo_comparisons(comparison_category) WHERE comparison_category IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN patient_photos.body_map_marker_id IS 'Reference to body map marker or lesion ID for precise location tracking';
COMMENT ON COLUMN patient_photos.x_position IS 'X coordinate as percentage (0-100) on body diagram view for pinpoint location';
COMMENT ON COLUMN patient_photos.y_position IS 'Y coordinate as percentage (0-100) on body diagram view for pinpoint location';
COMMENT ON COLUMN patient_photos.body_view IS 'Which view of the body diagram this photo corresponds to (front, back, etc.)';
COMMENT ON COLUMN photo_comparisons.body_region IS 'Anatomical region being compared (auto-populated from before photo)';
COMMENT ON COLUMN photo_comparisons.time_between_days IS 'Number of days between before and after photos (auto-calculated)';
COMMENT ON COLUMN photo_comparisons.comparison_category IS 'Clinical purpose of the comparison (treatment progress, lesion evolution, etc.)';
