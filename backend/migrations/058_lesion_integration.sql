-- Lesion Integration Migration
-- Ensures seamless clinical data flow: Body Map → Lesions → Biopsies → Photos → Pathology

-- Ensure biopsies table has lesion_id if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'biopsies' AND column_name = 'lesion_id'
  ) THEN
    ALTER TABLE biopsies ADD COLUMN lesion_id TEXT REFERENCES lesions(id) ON DELETE SET NULL;
    CREATE INDEX idx_biopsies_lesion_id ON biopsies(lesion_id);
    COMMENT ON COLUMN biopsies.lesion_id IS 'Links biopsy to specific lesion on body map';
  END IF;
END $$;

-- Ensure photos table has lesion_id if not already present (might exist from earlier migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'lesion_id'
  ) THEN
    ALTER TABLE photos ADD COLUMN lesion_id TEXT REFERENCES lesions(id) ON DELETE SET NULL;
    CREATE INDEX idx_photos_lesion_id ON photos(lesion_id);
    COMMENT ON COLUMN photos.lesion_id IS 'Links photo to specific lesion on body map';
  END IF;
END $$;

-- Add biopsy-related fields to lesions table if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesions' AND column_name = 'latest_biopsy_id'
  ) THEN
    ALTER TABLE lesions ADD COLUMN latest_biopsy_id TEXT REFERENCES biopsies(id) ON DELETE SET NULL;
    COMMENT ON COLUMN lesions.latest_biopsy_id IS 'Most recent biopsy performed on this lesion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesions' AND column_name = 'pathology_diagnosis'
  ) THEN
    ALTER TABLE lesions ADD COLUMN pathology_diagnosis TEXT;
    COMMENT ON COLUMN lesions.pathology_diagnosis IS 'Final pathology diagnosis from biopsy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesions' AND column_name = 'malignancy_type'
  ) THEN
    ALTER TABLE lesions ADD COLUMN malignancy_type TEXT;
    COMMENT ON COLUMN lesions.malignancy_type IS 'Type of malignancy if applicable';
  END IF;
END $$;

-- Function to update lesion when biopsy result arrives
CREATE OR REPLACE FUNCTION update_lesion_on_biopsy_result()
RETURNS TRIGGER AS $$
BEGIN
  -- When a biopsy gets a pathology diagnosis, update the linked lesion
  IF NEW.pathology_diagnosis IS NOT NULL AND NEW.lesion_id IS NOT NULL THEN
    UPDATE lesions
    SET
      latest_biopsy_id = NEW.id,
      pathology_diagnosis = NEW.pathology_diagnosis,
      malignancy_type = NEW.malignancy_type,
      biopsy_performed = true,
      biopsy_date = NEW.resulted_at,
      biopsy_result = NEW.pathology_diagnosis,
      status = CASE
        WHEN NEW.malignancy_type IS NOT NULL THEN 'malignant'
        WHEN NEW.pathology_diagnosis ILIKE '%benign%' THEN 'benign'
        ELSE 'treated'
      END,
      updated_at = NOW()
    WHERE id = NEW.lesion_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trigger_update_lesion_on_biopsy_result ON biopsies;
CREATE TRIGGER trigger_update_lesion_on_biopsy_result
  AFTER UPDATE ON biopsies
  FOR EACH ROW
  WHEN (NEW.pathology_diagnosis IS NOT NULL AND OLD.pathology_diagnosis IS NULL)
  EXECUTE FUNCTION update_lesion_on_biopsy_result();

-- View for comprehensive lesion data including biopsies and photos
CREATE OR REPLACE VIEW v_lesion_details AS
SELECT
  l.*,
  p.first_name || ' ' || p.last_name as patient_name,
  p.mrn,
  -- Biopsy count
  (SELECT COUNT(*) FROM biopsies b WHERE b.lesion_id = l.id AND b.deleted_at IS NULL) as biopsy_count,
  -- Latest biopsy info
  (SELECT specimen_id FROM biopsies b WHERE b.id = l.latest_biopsy_id) as latest_biopsy_specimen_id,
  (SELECT status FROM biopsies b WHERE b.id = l.latest_biopsy_id) as latest_biopsy_status,
  -- Photo count
  (SELECT COUNT(*) FROM photos ph WHERE ph.lesion_id = l.id AND ph.is_deleted = false) as photo_count,
  -- Latest photo
  (SELECT id FROM photos ph WHERE ph.lesion_id = l.id AND ph.is_deleted = false ORDER BY created_at DESC LIMIT 1) as latest_photo_id,
  (SELECT url FROM photos ph WHERE ph.lesion_id = l.id AND ph.is_deleted = false ORDER BY created_at DESC LIMIT 1) as latest_photo_url,
  -- Event count
  (SELECT COUNT(*) FROM lesion_events le WHERE le.lesion_id = l.id) as event_count
FROM lesions l
JOIN patients p ON l.patient_id = p.id
WHERE l.deleted_at IS NULL;

COMMENT ON VIEW v_lesion_details IS 'Comprehensive view of lesions with related biopsies, photos, and events';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesions_latest_biopsy ON lesions(latest_biopsy_id) WHERE latest_biopsy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lesions_status ON lesions(status);
CREATE INDEX IF NOT EXISTS idx_lesions_patient_status ON lesions(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_lesions_concern_level ON lesions(concern_level) WHERE concern_level IN ('high', 'critical');

-- Function to get lesion timeline (all events, biopsies, photos chronologically)
CREATE OR REPLACE FUNCTION get_lesion_timeline(p_lesion_id TEXT)
RETURNS TABLE (
  event_date TIMESTAMPTZ,
  event_type TEXT,
  event_description TEXT,
  event_details JSONB,
  provider_name TEXT,
  related_id TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- Lesion creation
  SELECT
    l.created_at as event_date,
    'lesion_created'::TEXT as event_type,
    'Lesion identified and documented'::TEXT as event_description,
    jsonb_build_object(
      'location', l.body_location,
      'type', l.lesion_type,
      'concern_level', l.concern_level
    ) as event_details,
    u.first_name || ' ' || u.last_name as provider_name,
    l.id as related_id
  FROM lesions l
  LEFT JOIN users u ON l.created_by = u.id
  WHERE l.id = p_lesion_id

  UNION ALL

  -- Lesion events
  SELECT
    le.event_date,
    le.event_type,
    le.description as event_description,
    jsonb_build_object(
      'outcome', le.outcome,
      'follow_up_needed', le.follow_up_needed,
      'photos', le.photos
    ) as event_details,
    u.first_name || ' ' || u.last_name as provider_name,
    le.id as related_id
  FROM lesion_events le
  LEFT JOIN users u ON le.provider_id = u.id
  WHERE le.lesion_id = p_lesion_id

  UNION ALL

  -- Measurements
  SELECT
    lm.measured_at as event_date,
    'measurement'::TEXT as event_type,
    'Lesion measured'::TEXT as event_description,
    jsonb_build_object(
      'length_mm', lm.length_mm,
      'width_mm', lm.width_mm,
      'abcde_score', lm.abcde_score
    ) as event_details,
    u.first_name || ' ' || u.last_name as provider_name,
    lm.id as related_id
  FROM lesion_measurements lm
  LEFT JOIN users u ON lm.measured_by = u.id
  WHERE lm.lesion_id = p_lesion_id

  UNION ALL

  -- Biopsies
  SELECT
    b.ordered_at as event_date,
    'biopsy_ordered'::TEXT as event_type,
    'Biopsy specimen collected: ' || b.specimen_id as event_description,
    jsonb_build_object(
      'specimen_id', b.specimen_id,
      'specimen_type', b.specimen_type,
      'status', b.status,
      'diagnosis', b.pathology_diagnosis,
      'malignancy_type', b.malignancy_type
    ) as event_details,
    pr.first_name || ' ' || pr.last_name as provider_name,
    b.id as related_id
  FROM biopsies b
  LEFT JOIN providers pr ON b.ordering_provider_id = pr.id
  WHERE b.lesion_id = p_lesion_id

  UNION ALL

  -- Biopsy results
  SELECT
    b.resulted_at as event_date,
    'biopsy_resulted'::TEXT as event_type,
    'Pathology result received'::TEXT as event_description,
    jsonb_build_object(
      'specimen_id', b.specimen_id,
      'diagnosis', b.pathology_diagnosis,
      'malignancy_type', b.malignancy_type,
      'margins', b.margins
    ) as event_details,
    pr.first_name || ' ' || pr.last_name as provider_name,
    b.id as related_id
  FROM biopsies b
  LEFT JOIN providers pr ON b.reviewing_provider_id = pr.id
  WHERE b.lesion_id = p_lesion_id AND b.resulted_at IS NOT NULL

  UNION ALL

  -- Photos
  SELECT
    ph.created_at as event_date,
    'photo_captured'::TEXT as event_type,
    'Clinical photo documented'::TEXT as event_description,
    jsonb_build_object(
      'photo_type', ph.photo_type,
      'body_location', ph.body_location,
      'notes', ph.notes
    ) as event_details,
    u.first_name || ' ' || u.last_name as provider_name,
    ph.id as related_id
  FROM photos ph
  LEFT JOIN users u ON ph.uploaded_by = u.id
  WHERE ph.lesion_id = p_lesion_id AND ph.is_deleted = false

  ORDER BY event_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_lesion_timeline IS 'Returns complete chronological timeline of all lesion-related events';
