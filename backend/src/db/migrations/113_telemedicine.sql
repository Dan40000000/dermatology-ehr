-- Video Visit Sessions table
-- Core table for managing video visit sessions
CREATE TABLE IF NOT EXISTS video_visit_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    appointment_id INTEGER REFERENCES appointments(id),
    patient_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'waiting', 'in_progress', 'completed', 'no_show', 'cancelled')),
    room_url TEXT,
    room_token TEXT,
    recording_url TEXT,
    recording_enabled BOOLEAN DEFAULT FALSE,
    video_provider TEXT DEFAULT 'mock' CHECK (video_provider IN ('mock', 'twilio', 'daily', 'zoom')),
    video_room_id TEXT,
    duration_minutes INTEGER,
    connection_quality TEXT CHECK (connection_quality IN ('excellent', 'good', 'fair', 'poor')),
    technical_issues_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for video_visit_sessions
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_tenant ON video_visit_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_appointment ON video_visit_sessions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_patient ON video_visit_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_provider ON video_visit_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_status ON video_visit_sessions(status);
CREATE INDEX IF NOT EXISTS idx_video_visit_sessions_scheduled ON video_visit_sessions(scheduled_start);

-- Video Visit Settings table
-- Provider-specific settings for video visits
CREATE TABLE IF NOT EXISTS video_visit_settings (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    provider_id INTEGER NOT NULL,
    virtual_background_url TEXT,
    virtual_background_type TEXT DEFAULT 'none' CHECK (virtual_background_type IN ('none', 'blur', 'image', 'clinic')),
    waiting_room_enabled BOOLEAN DEFAULT TRUE,
    auto_record BOOLEAN DEFAULT FALSE,
    max_duration_minutes INTEGER DEFAULT 60,
    auto_end_warning_minutes INTEGER DEFAULT 5,
    screen_share_enabled BOOLEAN DEFAULT TRUE,
    photo_capture_enabled BOOLEAN DEFAULT TRUE,
    multi_participant_enabled BOOLEAN DEFAULT TRUE,
    max_participants INTEGER DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider_id)
);

-- Index for video_visit_settings
CREATE INDEX IF NOT EXISTS idx_video_visit_settings_provider ON video_visit_settings(provider_id);

-- Video Visit Notes table
-- Additional notes specific to telemedicine visits
CREATE TABLE IF NOT EXISTS video_visit_notes (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    session_id INTEGER NOT NULL REFERENCES video_visit_sessions(id),
    encounter_id INTEGER,
    tech_issues_noted TEXT,
    patient_location_state TEXT,
    patient_location_verified BOOLEAN DEFAULT FALSE,
    consent_verified BOOLEAN DEFAULT FALSE,
    consent_method TEXT CHECK (consent_method IN ('verbal', 'written', 'electronic')),
    interpreter_used BOOLEAN DEFAULT FALSE,
    interpreter_language TEXT,
    family_member_present BOOLEAN DEFAULT FALSE,
    family_member_names TEXT,
    photo_captured_count INTEGER DEFAULT 0,
    screen_shared BOOLEAN DEFAULT FALSE,
    clinical_notes TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for video_visit_notes
CREATE INDEX IF NOT EXISTS idx_video_visit_notes_session ON video_visit_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_notes_encounter ON video_visit_notes(encounter_id);

-- Telehealth Consents table
-- Track patient consent for telehealth services
CREATE TABLE IF NOT EXISTS telehealth_consents (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    patient_id INTEGER NOT NULL,
    consent_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_type TEXT NOT NULL CHECK (consent_type IN ('general_telehealth', 'recording', 'photo_capture', 'screen_share', 'multi_participant')),
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    consent_method TEXT CHECK (consent_method IN ('verbal', 'written', 'electronic', 'in_app')),
    consent_document_url TEXT,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    witness_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for telehealth_consents
CREATE INDEX IF NOT EXISTS idx_telehealth_consents_patient ON telehealth_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_telehealth_consents_type ON telehealth_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_telehealth_consents_date ON telehealth_consents(consent_date);

-- Video Visit Participants table
-- Track all participants in a video visit (for multi-participant support)
CREATE TABLE IF NOT EXISTS video_visit_participants (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    session_id INTEGER NOT NULL REFERENCES video_visit_sessions(id),
    participant_type TEXT NOT NULL CHECK (participant_type IN ('patient', 'provider', 'interpreter', 'family', 'caregiver', 'specialist')),
    participant_id INTEGER,
    participant_name TEXT,
    participant_email TEXT,
    join_token TEXT,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    connection_quality TEXT,
    muted BOOLEAN DEFAULT FALSE,
    video_off BOOLEAN DEFAULT FALSE,
    is_screen_sharing BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for video_visit_participants
CREATE INDEX IF NOT EXISTS idx_video_visit_participants_session ON video_visit_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_participants_type ON video_visit_participants(participant_type);

-- Video Visit Photos table
-- Photos captured during video visits
CREATE TABLE IF NOT EXISTS video_visit_photos (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    session_id INTEGER NOT NULL REFERENCES video_visit_sessions(id),
    patient_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    captured_by_provider_id INTEGER,
    body_site TEXT,
    description TEXT,
    linked_to_chart BOOLEAN DEFAULT FALSE,
    linked_photo_id INTEGER,
    annotations JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for video_visit_photos
CREATE INDEX IF NOT EXISTS idx_video_visit_photos_session ON video_visit_photos(session_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_photos_patient ON video_visit_photos(patient_id);

-- Video Visit Waiting Queue table
-- Manage patient waiting queue for video visits
CREATE TABLE IF NOT EXISTS video_visit_waiting_queue (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    session_id INTEGER NOT NULL REFERENCES video_visit_sessions(id),
    patient_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    queue_position INTEGER NOT NULL,
    joined_queue_at TIMESTAMPTZ DEFAULT NOW(),
    called_at TIMESTAMPTZ,
    estimated_wait_minutes INTEGER,
    device_check_completed BOOLEAN DEFAULT FALSE,
    camera_working BOOLEAN,
    microphone_working BOOLEAN,
    speaker_working BOOLEAN,
    bandwidth_check_passed BOOLEAN,
    browser_supported BOOLEAN,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'called', 'joined', 'left', 'no_show')),
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for video_visit_waiting_queue
CREATE INDEX IF NOT EXISTS idx_video_visit_queue_session ON video_visit_waiting_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_queue_provider ON video_visit_waiting_queue(provider_id);
CREATE INDEX IF NOT EXISTS idx_video_visit_queue_status ON video_visit_waiting_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_visit_queue_position ON video_visit_waiting_queue(queue_position);

-- Trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_telemedicine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers for updated_at
DROP TRIGGER IF EXISTS video_visit_sessions_updated_at ON video_visit_sessions;
CREATE TRIGGER video_visit_sessions_updated_at
    BEFORE UPDATE ON video_visit_sessions
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();

DROP TRIGGER IF EXISTS video_visit_settings_updated_at ON video_visit_settings;
CREATE TRIGGER video_visit_settings_updated_at
    BEFORE UPDATE ON video_visit_settings
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();

DROP TRIGGER IF EXISTS video_visit_notes_updated_at ON video_visit_notes;
CREATE TRIGGER video_visit_notes_updated_at
    BEFORE UPDATE ON video_visit_notes
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();

DROP TRIGGER IF EXISTS telehealth_consents_updated_at ON telehealth_consents;
CREATE TRIGGER telehealth_consents_updated_at
    BEFORE UPDATE ON telehealth_consents
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();

DROP TRIGGER IF EXISTS video_visit_participants_updated_at ON video_visit_participants;
CREATE TRIGGER video_visit_participants_updated_at
    BEFORE UPDATE ON video_visit_participants
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();

DROP TRIGGER IF EXISTS video_visit_queue_updated_at ON video_visit_waiting_queue;
CREATE TRIGGER video_visit_queue_updated_at
    BEFORE UPDATE ON video_visit_waiting_queue
    FOR EACH ROW EXECUTE FUNCTION update_telemedicine_updated_at();
