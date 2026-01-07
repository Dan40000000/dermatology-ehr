-- Migration 030: SMS Templates and Scheduling Enhancements
-- Adds message templates and scheduled messages for enhanced text messaging functionality

-- Message templates (common pre-written messages)
CREATE TABLE IF NOT EXISTS sms_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Template details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  message_body TEXT NOT NULL,
  category VARCHAR(100), -- appointment_reminder, follow_up, instructions, education, general

  -- Variables supported: {patientName}, {firstName}, {lastName}, {providerName}, {appointmentDate}, {appointmentTime}, {clinicPhone}
  is_system_template BOOLEAN DEFAULT false, -- system templates cannot be deleted
  is_active BOOLEAN DEFAULT true,

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant ON sms_message_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_message_templates(category);
CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_message_templates(tenant_id, is_active);

-- Scheduled messages (messages to be sent at a future time)
CREATE TABLE IF NOT EXISTS sms_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Recipients
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  patient_ids JSONB, -- array of UUIDs for bulk messages
  to_numbers JSONB, -- array of phone numbers for bulk

  -- Message content
  message_body TEXT NOT NULL,
  template_id UUID REFERENCES sms_message_templates(id) ON DELETE SET NULL,

  -- Schedule
  scheduled_send_time TIMESTAMP NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/New_York',

  -- Recurrence (for recurring campaigns)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(50), -- daily, weekly, biweekly, monthly, custom
  recurrence_end_date TIMESTAMP,
  recurrence_config JSONB, -- {days: [1,3,5], time: "09:00", etc}

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, sending, sent, failed, cancelled
  sent_message_ids JSONB, -- array of message IDs created when sent

  -- Results (for bulk sends)
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancelled_by UUID,
  failure_reason TEXT,

  CONSTRAINT fk_sms_scheduled_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_scheduled_tenant ON sms_scheduled_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_patient ON sms_scheduled_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_status ON sms_scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_send_time ON sms_scheduled_messages(scheduled_send_time) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_recurring ON sms_scheduled_messages(is_recurring) WHERE status = 'scheduled';

-- Comments for documentation
COMMENT ON TABLE sms_message_templates IS 'Reusable message templates for common SMS use cases';
COMMENT ON TABLE sms_scheduled_messages IS 'Messages scheduled for future sending with recurrence support';

-- Insert default message templates for all tenants
INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Appointment Reminder',
  'Standard appointment reminder with confirmation options',
  'Hi {firstName}, this is a reminder for your appointment with {providerName} on {appointmentDate} at {appointmentTime}. Reply C to confirm, R to reschedule, or X to cancel.',
  'appointment_reminder',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Appointment Reminder'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Lab Results Available',
  'Notification that lab results are ready',
  'Hi {firstName}, your recent lab results are now available in your patient portal. Please log in to review or call us with any questions at {clinicPhone}.',
  'follow_up',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Lab Results Available'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Pre-Appointment Instructions',
  'Instructions to prepare for appointment',
  'Hi {firstName}, for your appointment on {appointmentDate}, please arrive 15 minutes early and bring your insurance card and photo ID. If you need to cancel, please call {clinicPhone} at least 24 hours in advance.',
  'instructions',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Pre-Appointment Instructions'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Post-Visit Follow-Up',
  'Thank you message and follow-up instructions',
  'Thank you for visiting us today, {firstName}. Please follow the care instructions provided. If you have any concerns or questions, don''t hesitate to call us at {clinicPhone}.',
  'follow_up',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Post-Visit Follow-Up'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Prescription Ready',
  'Notification that prescription is ready for pickup',
  'Hi {firstName}, your prescription is ready for pickup at your pharmacy. Please bring your insurance card and photo ID.',
  'follow_up',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Prescription Ready'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Annual Check-Up Reminder',
  'Reminder to schedule annual dermatology screening',
  'Hi {firstName}, it''s time for your annual skin check. Please call {clinicPhone} or visit our patient portal to schedule your appointment.',
  'appointment_reminder',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Annual Check-Up Reminder'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Sun Safety Reminder',
  'Educational message about sun protection',
  'Dermatology tip: Remember to apply SPF 30+ sunscreen daily, even on cloudy days. Reapply every 2 hours when outdoors. Stay safe!',
  'education',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Sun Safety Reminder'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, created_by)
SELECT
  t.id,
  'Payment Reminder',
  'Reminder about outstanding balance',
  'Hi {firstName}, this is a friendly reminder that you have an outstanding balance. Please call {clinicPhone} or visit our patient portal to make a payment.',
  'general',
  true,
  NULL
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates
  WHERE tenant_id = t.id AND name = 'Payment Reminder'
);
