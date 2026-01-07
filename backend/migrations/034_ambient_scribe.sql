-- Ambient AI Medical Scribe System
--
-- This migration creates the infrastructure for an Ambient AI Medical Scribe system
-- that records conversations, transcribes them, and generates clinical documentation

-- 1. Ambient Recordings Table
-- Stores audio recordings of patient-provider conversations
CREATE TABLE IF NOT EXISTS ambient_recordings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- Recording metadata
  recording_status TEXT NOT NULL DEFAULT 'recording' CHECK (recording_status IN ('recording', 'completed', 'failed', 'stopped')),
  duration_seconds INTEGER DEFAULT 0,
  file_path TEXT, -- Path to encrypted audio file
  file_size_bytes BIGINT DEFAULT 0,
  mime_type TEXT DEFAULT 'audio/webm',

  -- Consent and compliance
  consent_obtained BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMP WITH TIME ZONE,
  consent_method TEXT, -- 'verbal', 'written', 'electronic'

  -- Encryption and security
  encryption_key_id TEXT, -- Reference to encryption key
  is_encrypted BOOLEAN DEFAULT true,

  -- PHI detection
  contains_phi BOOLEAN DEFAULT true,
  phi_redacted BOOLEAN DEFAULT false,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ambient_recordings_tenant ON ambient_recordings(tenant_id);
CREATE INDEX idx_ambient_recordings_encounter ON ambient_recordings(encounter_id);
CREATE INDEX idx_ambient_recordings_patient ON ambient_recordings(patient_id);
CREATE INDEX idx_ambient_recordings_provider ON ambient_recordings(provider_id);
CREATE INDEX idx_ambient_recordings_status ON ambient_recordings(recording_status);
CREATE INDEX idx_ambient_recordings_created ON ambient_recordings(created_at DESC);

-- 2. Ambient Transcripts Table
-- Stores transcribed text with speaker diarization
CREATE TABLE IF NOT EXISTS ambient_transcripts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL REFERENCES ambient_recordings(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE CASCADE,

  -- Transcription data
  transcript_text TEXT,
  transcript_segments JSONB, -- Array of {speaker, text, start, end, confidence}
  language TEXT DEFAULT 'en',

  -- Speaker diarization
  speakers JSONB, -- {speaker_id: {label: 'doctor'|'patient', name: optional}}
  speaker_count INTEGER DEFAULT 2,

  -- Quality metrics
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  word_count INTEGER DEFAULT 0,

  -- PHI handling
  original_text TEXT, -- Before PHI masking
  phi_entities JSONB, -- Detected PHI entities [{type, text, start, end, masked_value}]
  phi_masked BOOLEAN DEFAULT false,

  -- Processing status
  transcription_status TEXT NOT NULL DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ambient_transcripts_tenant ON ambient_transcripts(tenant_id);
CREATE INDEX idx_ambient_transcripts_recording ON ambient_transcripts(recording_id);
CREATE INDEX idx_ambient_transcripts_encounter ON ambient_transcripts(encounter_id);
CREATE INDEX idx_ambient_transcripts_status ON ambient_transcripts(transcription_status);
CREATE INDEX idx_ambient_transcripts_created ON ambient_transcripts(created_at DESC);

-- 3. Ambient Generated Notes Table
-- Stores AI-generated clinical notes from transcripts
CREATE TABLE IF NOT EXISTS ambient_generated_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transcript_id TEXT NOT NULL REFERENCES ambient_transcripts(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE CASCADE,

  -- Generated content
  chief_complaint TEXT,
  hpi TEXT, -- History of Present Illness
  ros TEXT, -- Review of Systems
  physical_exam TEXT,
  assessment TEXT,
  plan TEXT,

  -- Structured extractions
  suggested_icd10_codes JSONB, -- [{code, description, confidence}]
  suggested_cpt_codes JSONB, -- [{code, description, confidence}]
  mentioned_medications JSONB, -- [{name, dosage, frequency, confidence}]
  mentioned_allergies JSONB, -- [{allergen, reaction, confidence}]
  follow_up_tasks JSONB, -- [{task, priority, due_date, confidence}]

  -- AI metadata
  ai_model TEXT DEFAULT 'gpt-4-medical',
  ai_version TEXT,
  generation_prompt TEXT,

  -- Confidence scores
  overall_confidence DECIMAL(3,2), -- 0.00 to 1.00
  section_confidence JSONB, -- {chief_complaint: 0.95, hpi: 0.88, ...}

  -- Review status
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_review', 'approved', 'rejected', 'regenerating')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,

  -- Generation status
  generation_status TEXT NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ambient_notes_tenant ON ambient_generated_notes(tenant_id);
CREATE INDEX idx_ambient_notes_transcript ON ambient_generated_notes(transcript_id);
CREATE INDEX idx_ambient_notes_encounter ON ambient_generated_notes(encounter_id);
CREATE INDEX idx_ambient_notes_review_status ON ambient_generated_notes(review_status);
CREATE INDEX idx_ambient_notes_created ON ambient_generated_notes(created_at DESC);

-- 4. Ambient Note Edits Table
-- Audit trail of all edits made to AI-generated notes
CREATE TABLE IF NOT EXISTS ambient_note_edits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  generated_note_id TEXT NOT NULL REFERENCES ambient_generated_notes(id) ON DELETE CASCADE,

  -- Edit information
  edited_by TEXT NOT NULL REFERENCES users(id),
  section TEXT NOT NULL, -- 'chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan'

  -- Change tracking
  previous_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'approve', 'reject')),

  -- Edit metadata
  edit_reason TEXT,
  is_significant BOOLEAN DEFAULT false, -- Flag major changes

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ambient_edits_tenant ON ambient_note_edits(tenant_id);
CREATE INDEX idx_ambient_edits_note ON ambient_note_edits(generated_note_id);
CREATE INDEX idx_ambient_edits_editor ON ambient_note_edits(edited_by);
CREATE INDEX idx_ambient_edits_created ON ambient_note_edits(created_at DESC);

-- 5. Ambient Scribe Settings Table
-- Per-provider and per-tenant settings for the ambient scribe
CREATE TABLE IF NOT EXISTS ambient_scribe_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE, -- NULL means tenant-wide default

  -- Feature toggles
  auto_start_recording BOOLEAN DEFAULT false,
  auto_generate_notes BOOLEAN DEFAULT false,
  require_review BOOLEAN DEFAULT true,

  -- AI preferences
  preferred_note_style TEXT DEFAULT 'soap', -- 'soap', 'narrative', 'problem-oriented'
  verbosity_level TEXT DEFAULT 'standard', -- 'concise', 'standard', 'detailed'
  include_time_markers BOOLEAN DEFAULT true,

  -- Confidence thresholds
  min_transcription_confidence DECIMAL(3,2) DEFAULT 0.70,
  min_generation_confidence DECIMAL(3,2) DEFAULT 0.75,

  -- PHI handling
  auto_mask_phi BOOLEAN DEFAULT true,
  phi_mask_level TEXT DEFAULT 'full', -- 'none', 'partial', 'full'

  -- Workflow preferences
  default_consent_method TEXT DEFAULT 'verbal',
  recording_quality TEXT DEFAULT 'standard', -- 'low', 'standard', 'high'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(tenant_id, provider_id)
);

CREATE INDEX idx_ambient_settings_tenant ON ambient_scribe_settings(tenant_id);
CREATE INDEX idx_ambient_settings_provider ON ambient_scribe_settings(provider_id);

-- 6. Insert default settings for existing tenants
INSERT INTO ambient_scribe_settings (id, tenant_id, provider_id)
SELECT
  'settings-' || t.id || '-default',
  t.id,
  NULL
FROM tenants t
ON CONFLICT (tenant_id, provider_id) DO NOTHING;

-- 7. Add trigger to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_ambient_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ambient_recordings_updated
  BEFORE UPDATE ON ambient_recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_ambient_timestamp();

CREATE TRIGGER ambient_transcripts_updated
  BEFORE UPDATE ON ambient_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_ambient_timestamp();

CREATE TRIGGER ambient_generated_notes_updated
  BEFORE UPDATE ON ambient_generated_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_ambient_timestamp();

CREATE TRIGGER ambient_scribe_settings_updated
  BEFORE UPDATE ON ambient_scribe_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_ambient_timestamp();

-- 8. Grant permissions
-- Assumes standard role structure from previous migrations
-- Adjust as needed based on your RBAC setup

COMMENT ON TABLE ambient_recordings IS 'Stores encrypted audio recordings of patient-provider conversations with HIPAA-compliant security';
COMMENT ON TABLE ambient_transcripts IS 'Stores transcribed conversations with speaker diarization and PHI masking';
COMMENT ON TABLE ambient_generated_notes IS 'AI-generated clinical notes extracted from transcripts';
COMMENT ON TABLE ambient_note_edits IS 'Audit trail of all edits to AI-generated notes';
COMMENT ON TABLE ambient_scribe_settings IS 'Configuration settings for ambient scribe per provider or tenant';
