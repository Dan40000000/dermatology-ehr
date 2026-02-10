-- Appointment Reminders System for Automated Patient Notifications
-- Comprehensive reminder scheduling, queue management, and response tracking

-- ============================================================================
-- REMINDER SCHEDULES TABLE
-- Defines when and how reminders should be sent for each appointment type
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminder_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_type_id TEXT REFERENCES appointment_types(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('sms', 'email', 'both')),
  hours_before INTEGER NOT NULL CHECK (hours_before > 0),
  template_id TEXT,
  is_active BOOLEAN DEFAULT true,
  include_confirmation_request BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, appointment_type_id, hours_before, reminder_type)
);

-- ============================================================================
-- REMINDER QUEUE TABLE
-- Tracks all scheduled and sent reminders
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminder_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES reminder_schedules(id) ON DELETE SET NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('sms', 'email')),
  reminder_category TEXT NOT NULL DEFAULT 'standard' CHECK (
    reminder_category IN ('48_hour', '24_hour', '2_hour', 'confirmation', 'no_show_followup', 'custom')
  ),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
  delivery_status TEXT CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'bounced', 'undelivered')),
  message_content TEXT,
  external_message_id TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- REMINDER RESPONSES TABLE
-- Tracks patient responses to confirmation requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminder_responses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL REFERENCES reminder_queue(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  response_type TEXT NOT NULL CHECK (response_type IN ('confirmed', 'cancelled', 'rescheduled', 'unknown')),
  response_channel TEXT CHECK (response_channel IN ('sms', 'email', 'phone', 'portal')),
  response_at TIMESTAMPTZ DEFAULT NOW(),
  raw_response TEXT,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PATIENT REMINDER PREFERENCES TABLE
-- Patient-specific reminder settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_reminder_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  preferred_channel TEXT NOT NULL DEFAULT 'both' CHECK (preferred_channel IN ('sms', 'email', 'both', 'none')),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opted_out_reason TEXT,
  preferred_language TEXT DEFAULT 'en',
  advance_notice_hours INTEGER DEFAULT 24,
  receive_no_show_followup BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, patient_id)
);

-- ============================================================================
-- REMINDER TEMPLATES TABLE
-- Customizable message templates with variable support
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminder_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('48_hour', '24_hour', '2_hour', 'confirmation', 'no_show_followup', 'custom')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  variables JSONB DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- REMINDER STATISTICS TABLE
-- Aggregated statistics for reporting
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminder_statistics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reminder_category TEXT NOT NULL,
  channel TEXT NOT NULL,
  total_scheduled INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_confirmed INTEGER DEFAULT 0,
  total_cancelled INTEGER DEFAULT 0,
  total_no_shows INTEGER DEFAULT 0,
  confirmation_rate DECIMAL(5,2),
  delivery_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date, reminder_category, channel)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Reminder schedules indexes
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_tenant ON reminder_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_type ON reminder_schedules(appointment_type_id);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_active ON reminder_schedules(tenant_id, is_active);

-- Reminder queue indexes
CREATE INDEX IF NOT EXISTS idx_reminder_queue_tenant ON reminder_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_appointment ON reminder_queue(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_patient ON reminder_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_status ON reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_scheduled ON reminder_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_pending ON reminder_queue(tenant_id, status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminder_queue_retry ON reminder_queue(next_retry_at)
  WHERE status = 'failed' AND retry_count < max_retries;

-- Reminder responses indexes
CREATE INDEX IF NOT EXISTS idx_reminder_responses_tenant ON reminder_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_reminder ON reminder_responses(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_appointment ON reminder_responses(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_patient ON reminder_responses(patient_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_type ON reminder_responses(response_type);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_unprocessed ON reminder_responses(tenant_id, processed)
  WHERE processed = false;

-- Patient preferences indexes
CREATE INDEX IF NOT EXISTS idx_patient_reminder_prefs_tenant ON patient_reminder_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_reminder_prefs_patient ON patient_reminder_preferences(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reminder_prefs_opted_out ON patient_reminder_preferences(opted_out);

-- Reminder templates indexes
CREATE INDEX IF NOT EXISTS idx_reminder_templates_tenant ON reminder_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_type ON reminder_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_channel ON reminder_templates(channel);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_active ON reminder_templates(tenant_id, is_active);

-- Reminder statistics indexes
CREATE INDEX IF NOT EXISTS idx_reminder_stats_tenant ON reminder_statistics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_stats_date ON reminder_statistics(date);
CREATE INDEX IF NOT EXISTS idx_reminder_stats_tenant_date ON reminder_statistics(tenant_id, date DESC);

-- ============================================================================
-- INSERT DEFAULT TEMPLATES
-- ============================================================================
INSERT INTO reminder_templates (id, tenant_id, name, description, template_type, channel, subject, body, is_default, variables)
SELECT
  gen_random_uuid()::text,
  t.id,
  '48-Hour Email Reminder',
  'Default 48-hour advance appointment reminder via email',
  '48_hour',
  'email',
  'Appointment Reminder - {appointment_date}',
  E'Dear {patient_name},\n\nThis is a reminder that you have an appointment scheduled:\n\nDate: {appointment_date}\nTime: {appointment_time}\nProvider: {provider_name}\nLocation: {location}\n\nPlease reply to confirm your appointment.\n\nIf you need to reschedule, please call us at {clinic_phone}.\n\nThank you,\n{clinic_name}',
  true,
  '["patient_name", "appointment_date", "appointment_time", "provider_name", "location", "clinic_phone", "clinic_name"]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_templates rt
  WHERE rt.tenant_id = t.id AND rt.template_type = '48_hour' AND rt.channel = 'email'
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_templates (id, tenant_id, name, description, template_type, channel, body, is_default, variables)
SELECT
  gen_random_uuid()::text,
  t.id,
  '48-Hour SMS Reminder',
  'Default 48-hour advance appointment reminder via SMS',
  '48_hour',
  'sms',
  'Reminder: You have an appointment on {appointment_date} at {appointment_time} with {provider_name}. Reply Y to confirm or call {clinic_phone} to reschedule.',
  true,
  '["appointment_date", "appointment_time", "provider_name", "clinic_phone"]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_templates rt
  WHERE rt.tenant_id = t.id AND rt.template_type = '48_hour' AND rt.channel = 'sms'
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_templates (id, tenant_id, name, description, template_type, channel, body, is_default, variables)
SELECT
  gen_random_uuid()::text,
  t.id,
  '24-Hour SMS Reminder',
  'Default 24-hour advance appointment reminder via SMS',
  '24_hour',
  'sms',
  'Tomorrow: Appointment with {provider_name} at {appointment_time}. {location}. Reply Y to confirm.',
  true,
  '["provider_name", "appointment_time", "location"]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_templates rt
  WHERE rt.tenant_id = t.id AND rt.template_type = '24_hour' AND rt.channel = 'sms'
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_templates (id, tenant_id, name, description, template_type, channel, body, is_default, variables)
SELECT
  gen_random_uuid()::text,
  t.id,
  '2-Hour SMS Reminder',
  'Default 2-hour advance appointment reminder via SMS',
  '2_hour',
  'sms',
  'Reminder: Your appointment is in 2 hours at {appointment_time}. See you soon!',
  true,
  '["appointment_time"]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_templates rt
  WHERE rt.tenant_id = t.id AND rt.template_type = '2_hour' AND rt.channel = 'sms'
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_templates (id, tenant_id, name, description, template_type, channel, body, is_default, variables)
SELECT
  gen_random_uuid()::text,
  t.id,
  'No-Show Follow-up',
  'Message sent after a patient misses their appointment',
  'no_show_followup',
  'sms',
  'We missed you today! Please call {clinic_phone} to reschedule your appointment with {provider_name}.',
  true,
  '["clinic_phone", "provider_name"]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_templates rt
  WHERE rt.tenant_id = t.id AND rt.template_type = 'no_show_followup' AND rt.channel = 'sms'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INSERT DEFAULT REMINDER SCHEDULES
-- ============================================================================
INSERT INTO reminder_schedules (id, tenant_id, appointment_type_id, reminder_type, hours_before, include_confirmation_request, priority)
SELECT
  gen_random_uuid()::text,
  t.id,
  NULL,
  'both',
  48,
  true,
  1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_schedules rs
  WHERE rs.tenant_id = t.id AND rs.hours_before = 48
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_schedules (id, tenant_id, appointment_type_id, reminder_type, hours_before, include_confirmation_request, priority)
SELECT
  gen_random_uuid()::text,
  t.id,
  NULL,
  'sms',
  24,
  true,
  2
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_schedules rs
  WHERE rs.tenant_id = t.id AND rs.hours_before = 24
)
ON CONFLICT DO NOTHING;

INSERT INTO reminder_schedules (id, tenant_id, appointment_type_id, reminder_type, hours_before, include_confirmation_request, priority)
SELECT
  gen_random_uuid()::text,
  t.id,
  NULL,
  'sms',
  2,
  false,
  3
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_schedules rs
  WHERE rs.tenant_id = t.id AND rs.hours_before = 2
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE reminder_schedules IS 'Defines reminder schedules for different appointment types';
COMMENT ON TABLE reminder_queue IS 'Queue of pending and sent reminders';
COMMENT ON TABLE reminder_responses IS 'Patient responses to reminder confirmations';
COMMENT ON TABLE patient_reminder_preferences IS 'Patient-specific reminder preferences';
COMMENT ON TABLE reminder_templates IS 'Customizable reminder message templates';
COMMENT ON TABLE reminder_statistics IS 'Aggregated reminder statistics for reporting';

COMMENT ON COLUMN reminder_schedules.hours_before IS 'Hours before appointment to send reminder';
COMMENT ON COLUMN reminder_schedules.include_confirmation_request IS 'Whether to include Reply Y to confirm';
COMMENT ON COLUMN reminder_queue.reminder_category IS '48_hour, 24_hour, 2_hour, confirmation, no_show_followup, custom';
COMMENT ON COLUMN reminder_queue.retry_count IS 'Number of retry attempts for failed sends';
COMMENT ON COLUMN reminder_responses.response_type IS 'confirmed, cancelled, rescheduled, unknown';
COMMENT ON COLUMN patient_reminder_preferences.quiet_hours_start IS 'Start of quiet hours (no reminders)';
COMMENT ON COLUMN patient_reminder_preferences.quiet_hours_end IS 'End of quiet hours';
COMMENT ON COLUMN reminder_templates.variables IS 'JSON array of supported template variables';
