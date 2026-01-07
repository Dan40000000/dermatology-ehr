-- Enhanced Telehealth Video Consultation System
-- Comprehensive schema for video consultations with recording, quality monitoring, and compliance

-- Core telehealth sessions table (enhanced)
CREATE TABLE IF NOT EXISTS telehealth_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  session_token VARCHAR(500) NOT NULL UNIQUE,
  room_name VARCHAR(255) NOT NULL,

  -- Session state
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'waiting', 'in_progress', 'completed', 'cancelled', 'error')),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_minutes INTEGER,

  -- Consent and compliance
  recording_consent BOOLEAN DEFAULT false,
  recording_consent_timestamp TIMESTAMP,
  patient_state VARCHAR(2), -- US state code for licensing verification
  provider_licensed_states TEXT[], -- Array of state codes
  state_licensing_verified BOOLEAN DEFAULT false,

  -- Session configuration
  virtual_background_enabled BOOLEAN DEFAULT false,
  beauty_filter_enabled BOOLEAN DEFAULT false,
  screen_sharing_enabled BOOLEAN DEFAULT true,

  -- Technical metadata
  connection_quality VARCHAR(20), -- excellent, good, fair, poor
  reconnection_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 0)
);

CREATE INDEX idx_telehealth_sessions_tenant ON telehealth_sessions(tenant_id);
CREATE INDEX idx_telehealth_sessions_patient ON telehealth_sessions(patient_id);
CREATE INDEX idx_telehealth_sessions_provider ON telehealth_sessions(provider_id);
CREATE INDEX idx_telehealth_sessions_status ON telehealth_sessions(status);
CREATE INDEX idx_telehealth_sessions_started ON telehealth_sessions(started_at);

-- Session recordings (encrypted storage)
CREATE TABLE IF NOT EXISTS telehealth_recordings (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,

  -- Storage details
  storage_type VARCHAR(20) DEFAULT 's3' CHECK (storage_type IN ('s3', 'local', 'azure')),
  file_path TEXT NOT NULL,
  encrypted BOOLEAN DEFAULT true,
  encryption_key_id VARCHAR(255),

  -- Recording metadata
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  format VARCHAR(20) DEFAULT 'mp4',
  resolution VARCHAR(20), -- 1080p, 720p, etc.

  -- Access control
  consent_verified BOOLEAN DEFAULT false,
  auto_delete_date DATE, -- HIPAA compliance - delete after retention period
  access_log JSONB DEFAULT '[]'::jsonb,

  -- Status
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'available', 'deleted', 'error')),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_telehealth_recordings_session ON telehealth_recordings(session_id);
CREATE INDEX idx_telehealth_recordings_tenant ON telehealth_recordings(tenant_id);
CREATE INDEX idx_telehealth_recordings_auto_delete ON telehealth_recordings(auto_delete_date);

-- Real-time session notes
CREATE TABLE IF NOT EXISTS telehealth_session_notes (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE SET NULL,

  -- Note content
  chief_complaint TEXT,
  hpi TEXT, -- History of Present Illness
  examination_findings TEXT,
  assessment TEXT,
  plan TEXT,

  -- Captured media during session
  photos_captured JSONB DEFAULT '[]'::jsonb, -- Array of photo references
  annotations JSONB DEFAULT '[]'::jsonb, -- Drawing/markup data

  -- AI assistance
  ai_suggestions JSONB,
  ai_generated_summary TEXT,

  -- Billing
  suggested_cpt_codes TEXT[], -- Array of CPT codes
  suggested_icd10_codes TEXT[], -- Array of ICD-10 codes
  complexity_level VARCHAR(20), -- Level 1-5 for E/M coding

  -- Status
  finalized BOOLEAN DEFAULT false,
  finalized_at TIMESTAMP,
  finalized_by INTEGER REFERENCES providers(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_telehealth_notes_session ON telehealth_session_notes(session_id);
CREATE INDEX idx_telehealth_notes_tenant ON telehealth_session_notes(tenant_id);
CREATE INDEX idx_telehealth_notes_encounter ON telehealth_session_notes(encounter_id);

-- Quality metrics and monitoring
CREATE TABLE IF NOT EXISTS telehealth_quality_metrics (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,

  -- Timestamp for this metric snapshot
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Participant (patient or provider)
  participant_type VARCHAR(20) NOT NULL CHECK (participant_type IN ('patient', 'provider')),

  -- Network quality
  bitrate_kbps INTEGER,
  packet_loss_percent DECIMAL(5,2),
  jitter_ms INTEGER,
  latency_ms INTEGER,

  -- Media quality
  video_resolution VARCHAR(20),
  video_fps INTEGER,
  audio_quality VARCHAR(20), -- excellent, good, fair, poor

  -- Connection info
  connection_type VARCHAR(50), -- wifi, ethernet, cellular
  bandwidth_up_mbps DECIMAL(10,2),
  bandwidth_down_mbps DECIMAL(10,2),

  -- Issues
  freezes_count INTEGER DEFAULT 0,
  audio_drops_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_telehealth_quality_session ON telehealth_quality_metrics(session_id);
CREATE INDEX idx_telehealth_quality_tenant ON telehealth_quality_metrics(tenant_id);
CREATE INDEX idx_telehealth_quality_recorded ON telehealth_quality_metrics(recorded_at);

-- Virtual waiting room queue
CREATE TABLE IF NOT EXISTS telehealth_waiting_room (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Queue management
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  queue_position INTEGER,
  estimated_wait_minutes INTEGER,

  -- Equipment check results
  camera_working BOOLEAN,
  microphone_working BOOLEAN,
  speaker_working BOOLEAN,
  bandwidth_adequate BOOLEAN,
  browser_compatible BOOLEAN,
  equipment_check_completed BOOLEAN DEFAULT false,

  -- Communication
  chat_messages JSONB DEFAULT '[]'::jsonb,
  front_desk_notified BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'called', 'left')),
  called_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_waiting_room_tenant ON telehealth_waiting_room(tenant_id);
CREATE INDEX idx_waiting_room_session ON telehealth_waiting_room(session_id);
CREATE INDEX idx_waiting_room_status ON telehealth_waiting_room(status);
CREATE INDEX idx_waiting_room_queue ON telehealth_waiting_room(queue_position);

-- Session events and audit trail (HIPAA compliance)
CREATE TABLE IF NOT EXISTS telehealth_session_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,

  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  user_id INTEGER,
  user_type VARCHAR(20), -- patient, provider, staff
  ip_address VARCHAR(45),
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_events_session ON telehealth_session_events(session_id);
CREATE INDEX idx_session_events_tenant ON telehealth_session_events(tenant_id);
CREATE INDEX idx_session_events_type ON telehealth_session_events(event_type);
CREATE INDEX idx_session_events_created ON telehealth_session_events(created_at);

-- Provider state licensing
CREATE TABLE IF NOT EXISTS provider_state_licenses (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  state_code VARCHAR(2) NOT NULL,
  license_number VARCHAR(100) NOT NULL,
  license_type VARCHAR(50), -- MD, DO, NP, PA, etc.

  issue_date DATE,
  expiration_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'revoked')),

  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_date DATE,
  verification_source VARCHAR(100),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(tenant_id, provider_id, state_code)
);

CREATE INDEX idx_provider_licenses_provider ON provider_state_licenses(provider_id);
CREATE INDEX idx_provider_licenses_tenant ON provider_state_licenses(tenant_id);
CREATE INDEX idx_provider_licenses_state ON provider_state_licenses(state_code);
CREATE INDEX idx_provider_licenses_status ON provider_state_licenses(status);

-- Educational content for waiting room
CREATE TABLE IF NOT EXISTS telehealth_educational_content (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) CHECK (content_type IN ('video', 'article', 'infographic', 'faq')),
  content_url TEXT,
  description TEXT,
  thumbnail_url TEXT,

  -- Targeting
  categories TEXT[], -- dermatology topics
  duration_seconds INTEGER,

  -- Status
  active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_educational_content_tenant ON telehealth_educational_content(tenant_id);
CREATE INDEX idx_educational_content_active ON telehealth_educational_content(active);

-- Session photos captured during visit
CREATE TABLE IF NOT EXISTS telehealth_session_photos (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  file_path TEXT NOT NULL,
  storage_type VARCHAR(20) DEFAULT 's3',
  file_size_bytes BIGINT,

  -- Photo metadata
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  body_site VARCHAR(100),
  view_type VARCHAR(50), -- close-up, overview, comparison

  -- Annotations
  has_annotations BOOLEAN DEFAULT false,
  annotation_data JSONB,

  -- Organization
  linked_to_note BOOLEAN DEFAULT false,
  linked_to_encounter BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_photos_session ON telehealth_session_photos(session_id);
CREATE INDEX idx_session_photos_patient ON telehealth_session_photos(patient_id);
CREATE INDEX idx_session_photos_tenant ON telehealth_session_photos(tenant_id);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_telehealth_sessions_updated_at BEFORE UPDATE ON telehealth_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_telehealth_recordings_updated_at BEFORE UPDATE ON telehealth_recordings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_telehealth_notes_updated_at BEFORE UPDATE ON telehealth_session_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waiting_room_updated_at BEFORE UPDATE ON telehealth_waiting_room
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_licenses_updated_at BEFORE UPDATE ON provider_state_licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample educational content
INSERT INTO telehealth_educational_content (tenant_id, title, content_type, description, categories, duration_seconds, active)
VALUES
  ('demo', 'Understanding Melanoma', 'video', 'Learn about melanoma detection and prevention', ARRAY['skin-cancer', 'prevention'], 180, true),
  ('demo', 'Acne Treatment Options', 'article', 'Comprehensive guide to acne treatments', ARRAY['acne', 'treatment'], NULL, true),
  ('demo', 'Eczema Care Tips', 'infographic', 'Daily care routine for eczema management', ARRAY['eczema', 'skincare'], NULL, true),
  ('demo', 'Telehealth Visit FAQ', 'faq', 'Common questions about virtual dermatology visits', ARRAY['telehealth', 'general'], NULL, true);
