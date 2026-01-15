-- Visit summaries table for patient-facing appointment summaries
-- These are simplified, patient-friendly versions of clinical notes

CREATE TABLE IF NOT EXISTS visit_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
  ambient_note_id TEXT,

  -- Visit info
  visit_date DATE NOT NULL,
  provider_name TEXT NOT NULL,

  -- Patient-friendly content
  summary_text TEXT NOT NULL,
  symptoms_discussed TEXT[],
  diagnosis_shared TEXT,
  treatment_plan TEXT,
  next_steps TEXT,
  follow_up_date DATE,

  -- Metadata
  generated_by TEXT NOT NULL,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visit_summaries_patient ON visit_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant ON visit_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visit_summaries_encounter ON visit_summaries(encounter_id);
CREATE INDEX IF NOT EXISTS idx_visit_summaries_date ON visit_summaries(visit_date DESC);

COMMENT ON TABLE visit_summaries IS 'Patient-facing visit summaries generated from clinical notes';
