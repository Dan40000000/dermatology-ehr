-- Migration 028: SMS/Text Messaging Integration with Twilio
-- Enables two-way SMS communication with patients for appointment reminders,
-- confirmations, and general messaging with TCPA/HIPAA compliance

-- SMS configuration per tenant
CREATE TABLE IF NOT EXISTS sms_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL UNIQUE,

  -- Twilio credentials (encrypted in production)
  twilio_account_sid VARCHAR(255),
  twilio_auth_token VARCHAR(255),
  twilio_phone_number VARCHAR(20), -- clinic's Twilio number in E.164 format

  -- Feature toggles
  appointment_reminders_enabled BOOLEAN DEFAULT true,
  reminder_hours_before INTEGER DEFAULT 24, -- hours before appointment to send reminder
  allow_patient_replies BOOLEAN DEFAULT true,

  -- Message templates (support variables: {patientName}, {providerName}, {appointmentDate}, {appointmentTime}, {clinicPhone})
  reminder_template TEXT DEFAULT 'Hi {patientName}, this is a reminder for your appointment with {providerName} on {appointmentDate} at {appointmentTime}. Reply C to confirm, R to reschedule, or X to cancel.',
  confirmation_template TEXT DEFAULT 'Your appointment is confirmed for {appointmentDate} at {appointmentTime} with {providerName}.',
  cancellation_template TEXT DEFAULT 'Your appointment on {appointmentDate} at {appointmentTime} has been cancelled.',
  reschedule_template TEXT DEFAULT 'To reschedule, please call us at {clinicPhone} or use the patient portal.',

  -- Configuration
  is_active BOOLEAN DEFAULT false, -- must be explicitly enabled after Twilio setup
  is_test_mode BOOLEAN DEFAULT true, -- sandbox mode for testing

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_settings_tenant ON sms_settings(tenant_id);

-- SMS messages log (comprehensive audit trail)
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Twilio identifiers
  twilio_message_sid VARCHAR(255) UNIQUE, -- Twilio's unique message ID

  -- Direction
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('outbound', 'inbound')),

  -- Participants
  from_number VARCHAR(20) NOT NULL, -- E.164 format: +15551234567
  to_number VARCHAR(20) NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,

  -- Message content
  message_body TEXT NOT NULL,
  media_urls JSONB, -- array of image URLs for MMS
  segment_count INTEGER DEFAULT 1, -- SMS segments (160 chars each)

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, sent, delivered, failed, received, undelivered
  error_code VARCHAR(50),
  error_message TEXT,

  -- Context and categorization
  message_type VARCHAR(50), -- reminder, confirmation, notification, conversation, auto_response
  related_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  related_thread_id UUID REFERENCES patient_message_threads(id) ON DELETE SET NULL,

  -- Response tracking
  in_response_to UUID REFERENCES sms_messages(id) ON DELETE SET NULL, -- for threading conversations
  keyword_matched VARCHAR(50), -- if auto-response was triggered (C, R, X, STOP, etc)

  -- Timestamps
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_messages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_tenant ON sms_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_patient ON sms_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_type ON sms_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_sms_messages_appointment ON sms_messages(related_appointment_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_thread ON sms_messages(related_thread_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_sms_messages_from_number ON sms_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_to_number ON sms_messages(to_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at DESC);

-- SMS opt-out preferences (TCPA compliance - REQUIRED BY LAW)
CREATE TABLE IF NOT EXISTS patient_sms_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Opt-in/opt-out status
  opted_in BOOLEAN DEFAULT true,
  appointment_reminders BOOLEAN DEFAULT true,
  marketing_messages BOOLEAN DEFAULT false, -- requires explicit consent
  transactional_messages BOOLEAN DEFAULT true, -- confirmations, cancellations

  -- Opt-out tracking
  opted_out_at TIMESTAMP,
  opted_out_reason TEXT, -- STOP keyword, patient request, etc.
  opted_out_via VARCHAR(50), -- sms, phone, portal, staff

  -- Consent tracking
  consent_date TIMESTAMP,
  consent_method VARCHAR(50), -- portal, paper, verbal, sms
  consent_ip_address VARCHAR(50),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_prefs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_patient_sms_pref UNIQUE (tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_prefs_patient ON patient_sms_preferences(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_prefs_opted_in ON patient_sms_preferences(tenant_id, opted_in);

-- Automated response keywords (C, R, X, STOP, START, HELP, etc.)
CREATE TABLE IF NOT EXISTS sms_auto_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  keyword VARCHAR(50) NOT NULL, -- uppercase, no spaces
  response_text TEXT NOT NULL,
  action VARCHAR(50), -- confirm_appointment, request_reschedule, cancel_appointment, opt_out, opt_in, help

  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_system_keyword BOOLEAN DEFAULT false, -- STOP, START, HELP are protected by law
  priority INTEGER DEFAULT 0, -- higher priority matches first

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_auto_resp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_keyword_per_tenant UNIQUE (tenant_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_sms_auto_resp_tenant ON sms_auto_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_auto_resp_keyword ON sms_auto_responses(tenant_id, keyword, is_active);
CREATE INDEX IF NOT EXISTS idx_sms_auto_resp_priority ON sms_auto_responses(tenant_id, priority DESC);

-- Appointment reminder tracking
CREATE TABLE IF NOT EXISTS appointment_sms_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Reminder schedule
  scheduled_send_time TIMESTAMP NOT NULL,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, sent, failed, cancelled
  sent_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL,

  -- Response tracking
  patient_responded BOOLEAN DEFAULT false,
  response_type VARCHAR(50), -- confirmed, reschedule_requested, cancelled, other
  response_received_at TIMESTAMP,

  sent_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_appt_reminder_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_appointment_reminder UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_appt_reminders_tenant ON appointment_sms_reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appt_reminders_appointment ON appointment_sms_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appt_reminders_patient ON appointment_sms_reminders(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_reminders_status ON appointment_sms_reminders(status);
CREATE INDEX IF NOT EXISTS idx_appt_reminders_scheduled ON appointment_sms_reminders(scheduled_send_time) WHERE status = 'scheduled';

-- SMS campaign/bulk messaging (for future enhancements)
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  message_template TEXT NOT NULL,

  -- Targeting
  target_patient_ids JSONB, -- array of UUIDs if specific patients
  target_criteria JSONB, -- filter criteria: age, last_visit, etc.

  -- Schedule
  scheduled_send_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, sending, completed, cancelled

  -- Results
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  CONSTRAINT fk_sms_campaign_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_tenant ON sms_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);

-- Comments for documentation
COMMENT ON TABLE sms_settings IS 'Twilio configuration and SMS feature settings per tenant';
COMMENT ON TABLE sms_messages IS 'Complete audit log of all SMS messages sent and received';
COMMENT ON TABLE patient_sms_preferences IS 'Patient SMS opt-in/opt-out preferences (TCPA compliance)';
COMMENT ON TABLE sms_auto_responses IS 'Automated keyword-based responses (C, R, X, STOP, etc.)';
COMMENT ON TABLE appointment_sms_reminders IS 'Scheduled appointment reminder tracking';
COMMENT ON TABLE sms_campaigns IS 'Bulk messaging campaigns (requires patient consent)';

-- Insert default SMS settings for existing tenants (disabled by default)
INSERT INTO sms_settings (tenant_id, is_active, is_test_mode)
SELECT id, false, true
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM sms_settings)
ON CONFLICT (tenant_id) DO NOTHING;

-- Insert system-required auto-responses (LEGALLY REQUIRED for TCPA compliance)
-- These are protected by law and MUST be implemented for any SMS system

-- STOP keyword (opt-out) - LEGALLY REQUIRED
INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'STOP', 'You have been unsubscribed from text messages. Text START to re-subscribe or call us if you need assistance.', 'opt_out', true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'STOP' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'UNSUBSCRIBE', 'You have been unsubscribed from text messages. Text START to re-subscribe or call us if you need assistance.', 'opt_out', true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'UNSUBSCRIBE' AND tenant_id = 'default-tenant');

-- START keyword (opt-in) - LEGALLY REQUIRED
INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'START', 'You are now subscribed to text messages from our practice. Reply STOP anytime to unsubscribe.', 'opt_in', true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'START' AND tenant_id = 'default-tenant');

-- HELP keyword - LEGALLY REQUIRED
INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'HELP', 'Reply C to confirm, R to reschedule, X to cancel appointment. Reply STOP to unsubscribe. For assistance, call (555) 123-4567.', 'help', true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'HELP' AND tenant_id = 'default-tenant');

-- Appointment-related keywords (optional but recommended)
INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'C', 'Thank you! Your appointment is confirmed. We look forward to seeing you.', 'confirm_appointment', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'C' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'CONFIRM', 'Thank you! Your appointment is confirmed. We look forward to seeing you.', 'confirm_appointment', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'CONFIRM' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'R', 'To reschedule your appointment, please call us at (555) 123-4567 or use the patient portal.', 'request_reschedule', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'R' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'RESCHEDULE', 'To reschedule your appointment, please call us at (555) 123-4567 or use the patient portal.', 'request_reschedule', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'RESCHEDULE' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'X', 'Your appointment has been cancelled. Reply HELP if you need assistance or call us to reschedule.', 'cancel_appointment', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'X' AND tenant_id = 'default-tenant');

INSERT INTO sms_auto_responses (tenant_id, keyword, response_text, action, is_active, is_system_keyword, priority)
SELECT 'default-tenant', 'CANCEL', 'Your appointment has been cancelled. Reply HELP if you need assistance or call us to reschedule.', 'cancel_appointment', true, false, 50
WHERE NOT EXISTS (SELECT 1 FROM sms_auto_responses WHERE keyword = 'CANCEL' AND tenant_id = 'default-tenant');

-- Create default SMS preferences for existing patients (opted in by default, but should be confirmed)
INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in, appointment_reminders, consent_method)
SELECT p.tenant_id, p.id, true, true, 'system_default'
FROM patients p
WHERE NOT EXISTS (
  SELECT 1 FROM patient_sms_preferences
  WHERE patient_id = p.id AND tenant_id = p.tenant_id
)
ON CONFLICT (tenant_id, patient_id) DO NOTHING;
