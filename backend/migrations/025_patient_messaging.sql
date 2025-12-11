-- Migration 025: Patient-Provider Messaging System
-- Secure messaging for patients to communicate with their healthcare providers
-- HIPAA compliant with audit logging and encryption support

-- Message threads (conversations between patients and providers/staff)
CREATE TABLE IF NOT EXISTS patient_message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,

  subject VARCHAR(500) NOT NULL,
  category VARCHAR(100), -- general, prescription, appointment, billing, medical
  priority VARCHAR(50) DEFAULT 'normal', -- low, normal, high, urgent
  status VARCHAR(50) DEFAULT 'open', -- open, in-progress, waiting-patient, waiting-provider, closed

  -- Assignment and tracking
  assigned_to UUID, -- staff member assigned to respond
  assigned_at TIMESTAMP,

  -- Thread metadata
  created_by_patient BOOLEAN DEFAULT true,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_by VARCHAR(50), -- 'patient' or 'staff'

  -- Read tracking for staff
  is_read_by_staff BOOLEAN DEFAULT false,
  read_by_staff_at TIMESTAMP,
  read_by_staff_user UUID,

  -- Read tracking for patient
  is_read_by_patient BOOLEAN DEFAULT false,
  read_by_patient_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_patient_msg_thread_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_msg_threads_tenant ON patient_message_threads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_msg_threads_patient ON patient_message_threads(patient_id);
CREATE INDEX IF NOT EXISTS idx_msg_threads_assigned ON patient_message_threads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_msg_threads_status ON patient_message_threads(status);
CREATE INDEX IF NOT EXISTS idx_msg_threads_category ON patient_message_threads(category);
CREATE INDEX IF NOT EXISTS idx_msg_threads_last_msg ON patient_message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_threads_unread_staff ON patient_message_threads(tenant_id, is_read_by_staff) WHERE is_read_by_staff = false;
CREATE INDEX IF NOT EXISTS idx_msg_threads_unread_patient ON patient_message_threads(patient_id, is_read_by_patient) WHERE is_read_by_patient = false;

-- Individual messages within threads
CREATE TABLE IF NOT EXISTS patient_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,

  -- Sender identification
  sender_type VARCHAR(50) NOT NULL, -- 'patient' or 'staff'
  sender_patient_id UUID,
  sender_user_id UUID,
  sender_name VARCHAR(255), -- Cached for display

  -- Message content
  message_text TEXT NOT NULL,

  -- Attachments
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,

  -- Message metadata
  is_internal_note BOOLEAN DEFAULT false, -- staff-only note, not visible to patient

  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Delivery tracking
  delivered_to_patient BOOLEAN DEFAULT false,
  delivered_at TIMESTAMP,

  -- Read tracking (patient side)
  read_by_patient BOOLEAN DEFAULT false,
  read_by_patient_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_patient_msg_thread FOREIGN KEY (thread_id) REFERENCES patient_message_threads(id) ON DELETE CASCADE
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_thread ON patient_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON patient_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON patient_messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_sender_patient ON patient_messages(sender_patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_user ON patient_messages(sender_user_id);

-- Message attachments
CREATE TABLE IF NOT EXISTS patient_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,

  filename VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  file_path TEXT NOT NULL,

  uploaded_by_patient BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_msg_attachment_message FOREIGN KEY (message_id) REFERENCES patient_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_attachments_message ON patient_message_attachments(message_id);

-- Auto-reply templates (sent immediately when patient creates thread in certain categories)
CREATE TABLE IF NOT EXISTS message_auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  category VARCHAR(100) NOT NULL,
  auto_reply_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_auto_reply_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auto_replies_tenant ON message_auto_replies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auto_replies_category ON message_auto_replies(tenant_id, category, is_active);

-- Canned responses library (staff quick responses)
CREATE TABLE IF NOT EXISTS message_canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  response_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,

  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_canned_response_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_tenant ON message_canned_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canned_responses_category ON message_canned_responses(category);
CREATE INDEX IF NOT EXISTS idx_canned_responses_active ON message_canned_responses(tenant_id, is_active);

-- Patient portal accounts (if not already exists)
-- This table enables patients to log in to the patient portal
CREATE TABLE IF NOT EXISTS patient_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL UNIQUE,
  tenant_id VARCHAR(255) NOT NULL,

  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,

  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verification_token VARCHAR(255),
  email_verification_sent_at TIMESTAMP,

  password_reset_token VARCHAR(255),
  password_reset_expires_at TIMESTAMP,

  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_portal_account_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_accounts_email ON patient_portal_accounts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_portal_accounts_patient ON patient_portal_accounts(patient_id);

-- Message notification preferences
CREATE TABLE IF NOT EXISTS patient_message_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL UNIQUE,
  tenant_id VARCHAR(255) NOT NULL,

  email_notifications_enabled BOOLEAN DEFAULT true,
  sms_notifications_enabled BOOLEAN DEFAULT false,
  notification_email VARCHAR(255),
  notification_phone VARCHAR(20),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_msg_pref_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_preferences_patient ON patient_message_preferences(patient_id);

-- Comments for documentation
COMMENT ON TABLE patient_message_threads IS 'Secure message threads between patients and providers/staff';
COMMENT ON TABLE patient_messages IS 'Individual messages within a thread';
COMMENT ON TABLE patient_message_attachments IS 'File attachments for messages (photos, documents, etc.)';
COMMENT ON TABLE message_auto_replies IS 'Automated responses sent when patient initiates conversation';
COMMENT ON TABLE message_canned_responses IS 'Pre-written responses library for staff efficiency';
COMMENT ON TABLE patient_portal_accounts IS 'Patient authentication for portal access';
COMMENT ON TABLE patient_message_preferences IS 'Patient notification preferences for messaging';

-- Insert some default auto-replies
INSERT INTO message_auto_replies (tenant_id, category, auto_reply_text, is_active)
SELECT 'default-tenant', 'prescription', 'Thank you for your prescription refill request. Our clinical team will review your request within 1-2 business days. For urgent medication needs, please call our office directly.', true
WHERE NOT EXISTS (SELECT 1 FROM message_auto_replies WHERE category = 'prescription' LIMIT 1);

INSERT INTO message_auto_replies (tenant_id, category, auto_reply_text, is_active)
SELECT 'default-tenant', 'appointment', 'Thank you for your appointment request. Our scheduling team will respond within 24 hours. For immediate scheduling needs, please call our office.', true
WHERE NOT EXISTS (SELECT 1 FROM message_auto_replies WHERE category = 'appointment' LIMIT 1);

INSERT INTO message_auto_replies (tenant_id, category, auto_reply_text, is_active)
SELECT 'default-tenant', 'medical', 'Thank you for reaching out. A member of our clinical team will review your message and respond within 1-2 business days. If you have urgent medical concerns, please call our office or seek emergency care.', true
WHERE NOT EXISTS (SELECT 1 FROM message_auto_replies WHERE category = 'medical' LIMIT 1);

-- Insert some default canned responses
INSERT INTO message_canned_responses (tenant_id, title, category, response_text, is_active)
SELECT 'default-tenant', 'Prescription Approved', 'prescription', 'Your prescription refill has been approved and sent to your pharmacy. Please allow 24-48 hours for the pharmacy to have it ready for pickup.', true
WHERE NOT EXISTS (SELECT 1 FROM message_canned_responses WHERE title = 'Prescription Approved' LIMIT 1);

INSERT INTO message_canned_responses (tenant_id, title, category, response_text, is_active)
SELECT 'default-tenant', 'Appointment Scheduled', 'appointment', 'Your appointment has been scheduled. You will receive a confirmation email with the date, time, and location details. Please arrive 15 minutes early to complete any necessary paperwork.', true
WHERE NOT EXISTS (SELECT 1 FROM message_canned_responses WHERE title = 'Appointment Scheduled' LIMIT 1);

INSERT INTO message_canned_responses (tenant_id, title, category, response_text, is_active)
SELECT 'default-tenant', 'Need More Information', 'general', 'Thank you for your message. To better assist you, we need some additional information. Please provide [specific details needed].', true
WHERE NOT EXISTS (SELECT 1 FROM message_canned_responses WHERE title = 'Need More Information' LIMIT 1);

INSERT INTO message_canned_responses (tenant_id, title, category, response_text, is_active)
SELECT 'default-tenant', 'Test Results Normal', 'medical', 'Your recent test results have been reviewed by your provider and are within normal limits. If you have any questions or concerns, please let us know.', true
WHERE NOT EXISTS (SELECT 1 FROM message_canned_responses WHERE title = 'Test Results Normal' LIMIT 1);

INSERT INTO message_canned_responses (tenant_id, title, category, response_text, is_active)
SELECT 'default-tenant', 'Billing Question - Forward', 'billing', 'Thank you for your billing question. I have forwarded your message to our billing department, who will respond within 2-3 business days.', true
WHERE NOT EXISTS (SELECT 1 FROM message_canned_responses WHERE title = 'Billing Question - Forward' LIMIT 1);
