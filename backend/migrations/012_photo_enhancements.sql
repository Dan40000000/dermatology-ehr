-- Photo Enhancements for Advanced Dermatology Documentation
-- Adds support for annotations, before/after comparisons, and body map integration

-- Add new columns to photos table
ALTER TABLE photos ADD COLUMN IF NOT EXISTS body_location TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS lesion_id TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS photo_type TEXT DEFAULT 'clinical';
ALTER TABLE photos ADD COLUMN IF NOT EXISTS annotations JSONB;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS comparison_group_id TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS sequence_number INTEGER;

-- Photo comparison groups table
CREATE TABLE IF NOT EXISTS photo_comparison_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_photos_body_location ON photos(body_location);
CREATE INDEX IF NOT EXISTS idx_photos_lesion_id ON photos(lesion_id);
CREATE INDEX IF NOT EXISTS idx_photos_photo_type ON photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_photos_comparison_group ON photos(comparison_group_id);
CREATE INDEX IF NOT EXISTS idx_photos_patient_date ON photos(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comparison_groups_patient ON photo_comparison_groups(patient_id);
CREATE INDEX IF NOT EXISTS idx_comparison_groups_tenant ON photo_comparison_groups(tenant_id);

-- Comments for documentation
COMMENT ON COLUMN photos.body_location IS 'Specific body location/region (e.g., Face, Upper Arm (L))';
COMMENT ON COLUMN photos.lesion_id IS 'Reference to specific lesion on body map';
COMMENT ON COLUMN photos.photo_type IS 'Type: clinical, before, after, dermoscopy, baseline';
COMMENT ON COLUMN photos.annotations IS 'JSON structure with shapes (arrows, circles, rectangles, text) for image annotations';
COMMENT ON COLUMN photos.comparison_group_id IS 'Groups photos for before/after comparisons';
COMMENT ON COLUMN photos.sequence_number IS 'Order within comparison group';
COMMENT ON TABLE photo_comparison_groups IS 'Groups photos for before/after timeline comparisons';
