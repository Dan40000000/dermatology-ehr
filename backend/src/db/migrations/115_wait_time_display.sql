-- Migration: Patient-Facing Wait Time Display System
-- Description: Creates tables for wait time tracking, queue display, and kiosk configuration

-- ============================================
-- WAIT TIME SNAPSHOTS TABLE
-- Captures periodic snapshots of wait times for analytics and display
-- ============================================

CREATE TABLE IF NOT EXISTS wait_time_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,

  -- Snapshot timing
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Wait time metrics
  avg_wait_minutes INTEGER NOT NULL DEFAULT 0,
  patients_waiting INTEGER NOT NULL DEFAULT 0,

  -- Provider-specific delays (JSONB for flexibility)
  -- Format: { "provider_id": { "name": "Dr. Smith", "delay_minutes": 15, "reason": "procedure running long" } }
  provider_delays JSONB DEFAULT '{}',

  -- Additional metrics
  longest_wait_minutes INTEGER DEFAULT 0,
  shortest_wait_minutes INTEGER DEFAULT 0,
  median_wait_minutes INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wait_time_snapshots_tenant ON wait_time_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wait_time_snapshots_location ON wait_time_snapshots(location_id);
CREATE INDEX IF NOT EXISTS idx_wait_time_snapshots_time ON wait_time_snapshots(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_wait_time_snapshots_location_time ON wait_time_snapshots(location_id, snapshot_time DESC);

-- ============================================
-- CHECK-IN KIOSK CONFIGURATION TABLE
-- Stores per-location kiosk and display settings
-- ============================================

CREATE TABLE IF NOT EXISTS check_in_kiosk_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,

  -- Display mode: 'waiting_room_tv', 'kiosk', 'both'
  display_mode TEXT NOT NULL DEFAULT 'both',

  -- Welcome and branding
  welcome_message TEXT DEFAULT 'Welcome! Please check in for your appointment.',
  show_wait_time BOOLEAN NOT NULL DEFAULT true,

  -- Custom branding (JSONB for flexibility)
  -- Format: { "logo_url": "...", "primary_color": "#...", "secondary_color": "#...", "practice_name": "..." }
  custom_branding JSONB DEFAULT '{}',

  -- Privacy settings
  anonymize_names BOOLEAN NOT NULL DEFAULT false,
  use_queue_numbers BOOLEAN NOT NULL DEFAULT false,
  show_provider_names BOOLEAN NOT NULL DEFAULT true,

  -- Display settings
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 30,
  show_estimated_times BOOLEAN NOT NULL DEFAULT true,
  show_queue_position BOOLEAN NOT NULL DEFAULT true,

  -- SMS notification settings
  enable_sms_updates BOOLEAN NOT NULL DEFAULT true,
  sms_delay_threshold_minutes INTEGER NOT NULL DEFAULT 15,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_config_tenant ON check_in_kiosk_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_config_location ON check_in_kiosk_config(location_id);

-- ============================================
-- PATIENT QUEUE DISPLAY TABLE
-- Real-time queue information for waiting room displays
-- ============================================

CREATE TABLE IF NOT EXISTS patient_queue_display (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,

  -- Display name (anonymized for privacy)
  -- Format: "John S." or "Queue #123" if fully anonymized
  display_name TEXT NOT NULL,

  -- Queue tracking
  queue_number INTEGER,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estimated_call_time TIMESTAMPTZ,
  actual_call_time TIMESTAMPTZ,

  -- Position and status
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'called', 'in_room', 'complete', 'no_show'

  -- Provider assignment
  provider_id TEXT,
  provider_name TEXT,
  room_number TEXT,

  -- Wait tracking
  estimated_wait_minutes INTEGER,
  actual_wait_minutes INTEGER,

  -- Notification tracking
  sms_notifications_sent INTEGER DEFAULT 0,
  last_sms_sent_at TIMESTAMPTZ,
  patient_notified_of_delay BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_display_tenant ON patient_queue_display(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queue_display_location ON patient_queue_display(location_id);
CREATE INDEX IF NOT EXISTS idx_queue_display_appointment ON patient_queue_display(appointment_id);
CREATE INDEX IF NOT EXISTS idx_queue_display_status ON patient_queue_display(status);
CREATE INDEX IF NOT EXISTS idx_queue_display_position ON patient_queue_display(location_id, position) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_queue_display_checkin ON patient_queue_display(check_in_time);

-- ============================================
-- WAIT TIME HISTORICAL AVERAGES TABLE
-- Pre-computed averages for prediction
-- ============================================

CREATE TABLE IF NOT EXISTS wait_time_historical_averages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider_id TEXT,

  -- Time slot (day of week 0-6, hour 0-23)
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),

  -- Averages
  avg_wait_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  std_deviation NUMERIC(10, 2) DEFAULT 0,

  -- Last computed
  computed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, location_id, COALESCE(provider_id, ''), day_of_week, hour_of_day)
);

CREATE INDEX IF NOT EXISTS idx_wait_historical_tenant ON wait_time_historical_averages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wait_historical_location ON wait_time_historical_averages(location_id);
CREATE INDEX IF NOT EXISTS idx_wait_historical_lookup ON wait_time_historical_averages(location_id, day_of_week, hour_of_day);

-- ============================================
-- WAIT TIME NOTIFICATION LOG TABLE
-- Tracks SMS/notification history for wait updates
-- ============================================

CREATE TABLE IF NOT EXISTS wait_time_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Notification details
  notification_type TEXT NOT NULL DEFAULT 'sms', -- 'sms', 'email', 'push'
  message_content TEXT NOT NULL,

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,

  -- Wait time context
  estimated_wait_at_send INTEGER, -- minutes
  delay_amount INTEGER, -- minutes the wait increased by

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wait_notifications_tenant ON wait_time_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wait_notifications_appointment ON wait_time_notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_wait_notifications_patient ON wait_time_notifications(patient_id);
CREATE INDEX IF NOT EXISTS idx_wait_notifications_status ON wait_time_notifications(status);

-- ============================================
-- SEED DEFAULT KIOSK CONFIGURATIONS
-- ============================================

-- Create default kiosk configs for existing locations
INSERT INTO check_in_kiosk_config (id, tenant_id, location_id, display_mode, welcome_message, show_wait_time, custom_branding)
SELECT
  'kiosk_' || l.id,
  l.tenant_id,
  l.id,
  'both',
  'Welcome to ' || COALESCE(l.name, 'our clinic') || '! Please check in for your appointment.',
  true,
  jsonb_build_object(
    'practice_name', l.name,
    'primary_color', '#2563eb',
    'secondary_color', '#1e40af'
  )
FROM locations l
WHERE NOT EXISTS (
  SELECT 1 FROM check_in_kiosk_config c
  WHERE c.location_id = l.id AND c.tenant_id = l.tenant_id
)
ON CONFLICT (tenant_id, location_id) DO NOTHING;

-- ============================================
-- FUNCTIONS FOR WAIT TIME CALCULATIONS
-- ============================================

-- Function to calculate current wait time for a location
CREATE OR REPLACE FUNCTION calculate_current_wait_time(
  p_tenant_id TEXT,
  p_location_id TEXT
) RETURNS TABLE (
  avg_wait_minutes INTEGER,
  patients_waiting INTEGER,
  longest_wait_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - pqd.check_in_time)) / 60)::INTEGER, 0) as avg_wait_minutes,
    COUNT(*)::INTEGER as patients_waiting,
    COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - pqd.check_in_time)) / 60)::INTEGER, 0) as longest_wait_minutes
  FROM patient_queue_display pqd
  WHERE pqd.tenant_id = p_tenant_id
    AND pqd.location_id = p_location_id
    AND pqd.status = 'waiting';
END;
$$ LANGUAGE plpgsql;

-- Function to update queue positions after changes
CREATE OR REPLACE FUNCTION update_queue_positions(
  p_tenant_id TEXT,
  p_location_id TEXT
) RETURNS void AS $$
BEGIN
  WITH ordered_queue AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY check_in_time ASC) as new_position
    FROM patient_queue_display
    WHERE tenant_id = p_tenant_id
      AND location_id = p_location_id
      AND status = 'waiting'
  )
  UPDATE patient_queue_display pqd
  SET position = oq.new_position,
      updated_at = NOW()
  FROM ordered_queue oq
  WHERE pqd.id = oq.id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate anonymized display name
CREATE OR REPLACE FUNCTION generate_display_name(
  p_first_name TEXT,
  p_last_name TEXT,
  p_anonymize BOOLEAN DEFAULT false,
  p_queue_number INTEGER DEFAULT NULL
) RETURNS TEXT AS $$
BEGIN
  IF p_anonymize AND p_queue_number IS NOT NULL THEN
    RETURN 'Queue #' || p_queue_number;
  ELSE
    RETURN COALESCE(p_first_name, 'Patient') || ' ' || LEFT(COALESCE(p_last_name, ''), 1) || '.';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER TO AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_wait_time_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_display_updated ON patient_queue_display;
CREATE TRIGGER trg_queue_display_updated
  BEFORE UPDATE ON patient_queue_display
  FOR EACH ROW
  EXECUTE FUNCTION update_wait_time_timestamp();

DROP TRIGGER IF EXISTS trg_kiosk_config_updated ON check_in_kiosk_config;
CREATE TRIGGER trg_kiosk_config_updated
  BEFORE UPDATE ON check_in_kiosk_config
  FOR EACH ROW
  EXECUTE FUNCTION update_wait_time_timestamp();

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE wait_time_snapshots IS 'Periodic snapshots of wait times for analytics and historical display';
COMMENT ON TABLE check_in_kiosk_config IS 'Per-location configuration for kiosk and waiting room displays';
COMMENT ON TABLE patient_queue_display IS 'Real-time queue information for patient-facing displays';
COMMENT ON TABLE wait_time_historical_averages IS 'Pre-computed historical averages for wait time predictions';
COMMENT ON TABLE wait_time_notifications IS 'Log of wait time related notifications sent to patients';
