-- Migration 097: Patient Texting/SMS System
-- Complete two-way SMS messaging system for dermatology EHR

-- ============================================================================
-- SMS CONVERSATIONS TABLE
-- Tracks conversation threads with patients
-- ============================================================================
CREATE TABLE IF NOT EXISTS sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL, -- E.164 format

  -- Conversation state
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  last_message_at TIMESTAMP,
  last_message_direction VARCHAR(10), -- 'inbound' or 'outbound'
  last_message_preview VARCHAR(160), -- First 160 chars of last message

  -- Read tracking
  unread_count INTEGER DEFAULT 0,
  last_read_at TIMESTAMP,
  last_read_by UUID, -- User who last read

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sms_conversations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_sms_conversation_patient UNIQUE (tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_conversations_tenant ON sms_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_patient ON sms_conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_phone ON sms_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_status ON sms_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_last_message ON sms_conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_unread ON sms_conversations(tenant_id, unread_count) WHERE unread_count > 0;

-- ============================================================================
-- SMS MESSAGES TABLE (Enhanced version)
-- Individual messages within conversations
-- ============================================================================
-- Note: sms_messages table already exists in migration 028
-- Adding additional columns if not present
DO $$
BEGIN
  -- Add conversation_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sms_messages' AND column_name = 'conversation_id') THEN
    ALTER TABLE sms_messages ADD COLUMN conversation_id UUID REFERENCES sms_conversations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation ON sms_messages(conversation_id);
  END IF;

  -- Add sent_by_user_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sms_messages' AND column_name = 'sent_by_user_id') THEN
    ALTER TABLE sms_messages ADD COLUMN sent_by_user_id UUID;
  END IF;

  -- Add template_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sms_messages' AND column_name = 'template_id') THEN
    ALTER TABLE sms_messages ADD COLUMN template_id UUID REFERENCES sms_message_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SMS TEMPLATES TABLE (Enhanced version with variables array)
-- Note: sms_message_templates already exists, adding variables column
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sms_message_templates' AND column_name = 'variables') THEN
    ALTER TABLE sms_message_templates ADD COLUMN variables TEXT[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sms_message_templates' AND column_name = 'shortcut_key') THEN
    ALTER TABLE sms_message_templates ADD COLUMN shortcut_key VARCHAR(20);
  END IF;
END $$;

-- ============================================================================
-- SMS OPT-OUT TABLE
-- Tracks patients who have opted out of SMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sms_opt_out (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL, -- E.164 format
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,

  -- Opt-out details
  opted_out_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT, -- 'STOP keyword', 'patient request', 'staff action', etc.
  opted_out_via VARCHAR(50), -- 'sms', 'phone', 'portal', 'staff'

  -- Re-opt-in tracking
  opted_in_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true, -- false if they re-opted in

  CONSTRAINT fk_sms_opt_out_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_sms_opt_out_phone UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_out_tenant ON sms_opt_out(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_opt_out_phone ON sms_opt_out(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_opt_out_active ON sms_opt_out(tenant_id, is_active) WHERE is_active = true;

-- ============================================================================
-- SMS PROVIDER CONFIG TABLE
-- Provider configuration (Twilio, Bandwidth, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sms_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Provider details
  provider_name VARCHAR(50) NOT NULL DEFAULT 'twilio' CHECK (provider_name IN ('twilio', 'bandwidth', 'vonage', 'mock')),
  api_key_encrypted TEXT, -- Encrypted API key/SID
  api_secret_encrypted TEXT, -- Encrypted API secret/token
  from_number VARCHAR(20) NOT NULL, -- E.164 format

  -- Webhook configuration
  webhook_url TEXT,
  status_webhook_url TEXT,

  -- Feature flags
  is_active BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT true,
  supports_mms BOOLEAN DEFAULT false,
  max_segment_length INTEGER DEFAULT 160,

  -- Rate limiting
  rate_limit_per_second INTEGER DEFAULT 10,
  rate_limit_per_day INTEGER DEFAULT 10000,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,

  CONSTRAINT fk_sms_provider_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_sms_provider_tenant_primary UNIQUE (tenant_id, is_primary) -- Only one primary per tenant
);

CREATE INDEX IF NOT EXISTS idx_sms_provider_tenant ON sms_provider_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_provider_active ON sms_provider_config(tenant_id, is_active);

-- ============================================================================
-- ADDITIONAL TEMPLATES FOR DERMATOLOGY
-- ============================================================================
INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Appointment Reminder 24hr',
  '24-hour appointment reminder with confirmation options',
  'Hi {firstName}, reminder: Your dermatology appointment is tomorrow at {appointmentTime} with {providerName}. Reply C to confirm, R to reschedule. Questions? Call {clinicPhone}',
  'appointment_reminder',
  true,
  ARRAY['firstName', 'appointmentTime', 'providerName', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Appointment Reminder 24hr'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Appointment Reminder 2hr',
  '2-hour appointment reminder',
  'Hi {firstName}, your appointment is in 2 hours at {appointmentTime} with {providerName}. We look forward to seeing you! Call {clinicPhone} if running late.',
  'appointment_reminder',
  true,
  ARRAY['firstName', 'appointmentTime', 'providerName', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Appointment Reminder 2hr'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Running Late Notice',
  'Notify patient that provider is running late',
  'Hi {firstName}, we apologize - {providerName} is running approximately {minutes} minutes behind schedule. Thank you for your patience. Call {clinicPhone} with questions.',
  'appointment_reminder',
  true,
  ARRAY['firstName', 'providerName', 'minutes', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Running Late Notice'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Appointment Confirmation Request',
  'Request patient to confirm upcoming appointment',
  'Hi {firstName}, please confirm your appointment on {appointmentDate} at {appointmentTime} with {providerName}. Reply C to confirm or call {clinicPhone} to reschedule.',
  'appointment_reminder',
  true,
  ARRAY['firstName', 'appointmentDate', 'appointmentTime', 'providerName', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Appointment Confirmation Request'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Balance Due Reminder',
  'Reminder about outstanding patient balance',
  'Hi {firstName}, you have an outstanding balance of {balanceAmount} with {clinicName}. Please call {clinicPhone} or visit our patient portal to make a payment. Thank you!',
  'billing',
  true,
  ARRAY['firstName', 'balanceAmount', 'clinicName', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Balance Due Reminder'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Results Ready Notification',
  'Notify patient that test/biopsy results are available',
  'Hi {firstName}, your {resultType} results are now available. Please log into the patient portal to view or call {clinicPhone} to schedule a follow-up with {providerName}.',
  'follow_up',
  true,
  ARRAY['firstName', 'resultType', 'clinicPhone', 'providerName']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Results Ready Notification'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Biopsy Results Ready',
  'Notify patient that biopsy results are ready for review',
  'Hi {firstName}, your biopsy results from {biopsyDate} are now ready. Please call {clinicPhone} to discuss with {providerName} or log into the patient portal.',
  'follow_up',
  true,
  ARRAY['firstName', 'biopsyDate', 'clinicPhone', 'providerName']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Biopsy Results Ready'
);

INSERT INTO sms_message_templates (tenant_id, name, description, message_body, category, is_system_template, variables)
SELECT
  t.id,
  'Skin Check Recall',
  'Annual skin check reminder',
  'Hi {firstName}, it''s time for your annual skin cancer screening at {clinicName}. Early detection saves lives! Call {clinicPhone} to schedule.',
  'recall',
  true,
  ARRAY['firstName', 'clinicName', 'clinicPhone']
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM sms_message_templates WHERE tenant_id = t.id AND name = 'Skin Check Recall'
);

-- ============================================================================
-- SCHEDULED REMINDERS TABLE
-- For appointment reminders that need to be sent at specific times
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Reminder configuration
  reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('24h', '2h', 'custom')),
  scheduled_time TIMESTAMP NOT NULL,
  template_id UUID REFERENCES sms_message_templates(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
  sent_at TIMESTAMP,
  message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL,
  error_message TEXT,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_scheduled_reminders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_scheduled_reminder UNIQUE (appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_tenant ON scheduled_reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_appointment ON scheduled_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_status ON scheduled_reminders(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_scheduled ON scheduled_reminders(scheduled_time) WHERE status = 'pending';

-- ============================================================================
-- FUNCTION: Update conversation on new message
-- ============================================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or create conversation
  INSERT INTO sms_conversations (tenant_id, patient_id, phone_number, last_message_at, last_message_direction, last_message_preview, unread_count)
  VALUES (
    NEW.tenant_id,
    NEW.patient_id,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.from_number ELSE NEW.to_number END,
    CURRENT_TIMESTAMP,
    NEW.direction,
    LEFT(NEW.message_body, 160),
    CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
  )
  ON CONFLICT (tenant_id, patient_id) DO UPDATE SET
    last_message_at = CURRENT_TIMESTAMP,
    last_message_direction = NEW.direction,
    last_message_preview = LEFT(NEW.message_body, 160),
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN sms_conversations.unread_count + 1
      ELSE sms_conversations.unread_count
    END,
    updated_at = CURRENT_TIMESTAMP;

  -- Update the message with conversation_id
  UPDATE sms_messages
  SET conversation_id = (
    SELECT id FROM sms_conversations
    WHERE tenant_id = NEW.tenant_id AND patient_id = NEW.patient_id
    LIMIT 1
  )
  WHERE id = NEW.id AND conversation_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_conversation_on_message') THEN
    CREATE TRIGGER trg_update_conversation_on_message
    AFTER INSERT ON sms_messages
    FOR EACH ROW
    WHEN (NEW.patient_id IS NOT NULL)
    EXECUTE FUNCTION update_conversation_on_message();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE sms_conversations IS 'SMS conversation threads with patients for inbox view';
COMMENT ON TABLE sms_opt_out IS 'Patients who have opted out of SMS messaging (TCPA compliance)';
COMMENT ON TABLE sms_provider_config IS 'SMS provider configuration (Twilio, Bandwidth, etc.)';
COMMENT ON TABLE scheduled_reminders IS 'Scheduled appointment reminders with retry support';

-- ============================================================================
-- MIGRATE EXISTING CONVERSATIONS
-- Create conversation records for existing SMS messages
-- ============================================================================
INSERT INTO sms_conversations (tenant_id, patient_id, phone_number, last_message_at, last_message_direction, last_message_preview, unread_count, status)
SELECT DISTINCT ON (m.tenant_id, m.patient_id)
  m.tenant_id,
  m.patient_id,
  CASE WHEN m.direction = 'inbound' THEN m.from_number ELSE m.to_number END,
  m.created_at,
  m.direction,
  LEFT(m.message_body, 160),
  0,
  'active'
FROM sms_messages m
WHERE m.patient_id IS NOT NULL
ORDER BY m.tenant_id, m.patient_id, m.created_at DESC
ON CONFLICT (tenant_id, patient_id) DO NOTHING;

-- Update existing messages with conversation_id
UPDATE sms_messages m
SET conversation_id = c.id
FROM sms_conversations c
WHERE m.tenant_id = c.tenant_id
  AND m.patient_id = c.patient_id
  AND m.conversation_id IS NULL
  AND m.patient_id IS NOT NULL;
