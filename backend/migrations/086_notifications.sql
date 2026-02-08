-- Migration 086: Comprehensive Notification System
-- Multi-channel notification system with preferences, queuing, and templates
-- Supports in-app, email, and push notifications

-- ============================================================================
-- NOTIFICATION TYPES AND CATEGORIES (ENUM-LIKE CONSTRAINTS VIA CHECK)
-- ============================================================================
-- Categories: clinical, administrative, billing, scheduling, compliance, inventory, patient, system
-- Priority Levels: low, normal, high, urgent

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,

  -- Notification type and categorization
  type VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('clinical', 'administrative', 'billing', 'scheduling', 'compliance', 'inventory', 'patient', 'system')),

  -- Content
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',

  -- Priority
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Status tracking
  read_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  expires_at TIMESTAMP,

  -- Metadata
  source_type VARCHAR(100), -- e.g., 'lab_result', 'appointment', 'claim', etc.
  source_id UUID, -- Reference to the source entity
  action_url VARCHAR(500), -- Deep link to the relevant page
  action_label VARCHAR(100), -- e.g., "View Results", "Review Claim"

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notification_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications(user_id, dismissed_at, expires_at)
  WHERE dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source_type, source_id) WHERE source_id IS NOT NULL;

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,

  -- Category-specific preferences
  category VARCHAR(50) NOT NULL CHECK (category IN ('clinical', 'administrative', 'billing', 'scheduling', 'compliance', 'inventory', 'patient', 'system')),

  -- Channel preferences
  in_app_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  sound_enabled BOOLEAN DEFAULT true,

  -- Priority threshold (only notify for this priority or higher)
  min_priority VARCHAR(20) DEFAULT 'low' CHECK (min_priority IN ('low', 'normal', 'high', 'urgent')),

  -- Quiet hours (optional)
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notif_pref_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uk_notif_pref_user_category UNIQUE (tenant_id, user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_tenant ON notification_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);

-- ============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,

  -- Push subscription data (Web Push API format)
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL, -- Contains p256dh and auth keys

  -- Device information
  user_agent TEXT,
  device_name VARCHAR(255),

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_push_sub_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uk_push_sub_endpoint UNIQUE (tenant_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_tenant ON push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

-- ============================================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Template identification
  template_name VARCHAR(100) NOT NULL,

  -- Content
  subject VARCHAR(500) NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT, -- Plain text fallback

  -- Template variables
  variables JSONB DEFAULT '[]', -- Array of variable names expected

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_email_template_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uk_email_template_name UNIQUE (tenant_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_email_template_tenant ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_template_name ON email_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_email_template_active ON email_templates(tenant_id, is_active) WHERE is_active = true;

-- ============================================================================
-- NOTIFICATION QUEUE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Notification details
  notification_type VARCHAR(100) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('user', 'role', 'patient', 'custom')),
  recipient_id VARCHAR(255), -- User ID, role name, patient ID, or custom identifier

  -- Delivery channel
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('in_app', 'email', 'push', 'sms')),

  -- Payload
  payload JSONB NOT NULL,

  -- Scheduling
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Processing
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  sent_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  error TEXT,
  last_attempt_at TIMESTAMP,

  -- Priority for processing
  priority INTEGER DEFAULT 50, -- 1-100, higher = more urgent

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notif_queue_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_tenant ON notification_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notif_queue_scheduled ON notification_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_queue_processing ON notification_queue(status, priority DESC, scheduled_at ASC)
  WHERE status = 'pending';

-- ============================================================================
-- NOTIFICATION BATCHES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Batch details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  notification_type VARCHAR(100) NOT NULL,

  -- Recipients
  recipients JSONB NOT NULL, -- Array of user IDs or filter criteria
  recipient_count INTEGER DEFAULT 0,

  -- Template/content
  template_id UUID,
  payload JSONB,

  -- Progress tracking
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'completed', 'cancelled')),

  -- Scheduling
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notif_batch_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_batch_template FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_batch_tenant ON notification_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_batch_status ON notification_batches(status);
CREATE INDEX IF NOT EXISTS idx_notif_batch_scheduled ON notification_batches(scheduled_at) WHERE status = 'scheduled';

-- ============================================================================
-- NOTIFICATION TRIGGERS TABLE (Defines what events trigger notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Trigger definition
  trigger_event VARCHAR(100) NOT NULL, -- e.g., 'lab_result_received', 'claim_denied', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Target
  category VARCHAR(50) NOT NULL CHECK (category IN ('clinical', 'administrative', 'billing', 'scheduling', 'compliance', 'inventory', 'patient', 'system')),
  recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('user', 'role', 'dynamic')),
  recipient_value VARCHAR(255), -- Role name or 'assigned_provider', 'billing_staff', etc.

  -- Notification content
  title_template VARCHAR(500) NOT NULL, -- Can include {variables}
  message_template TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Channels
  channels JSONB DEFAULT '["in_app"]', -- Array of channels: in_app, email, push

  -- Conditions (optional)
  conditions JSONB, -- Filter conditions for when to trigger

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notif_trigger_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_trigger_tenant ON notification_triggers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_trigger_event ON notification_triggers(trigger_event);
CREATE INDEX IF NOT EXISTS idx_notif_trigger_active ON notification_triggers(tenant_id, trigger_event, is_active) WHERE is_active = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE notifications IS 'User notifications (in-app) with read/dismiss tracking';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification delivery by category';
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscriptions for browser push notifications';
COMMENT ON TABLE email_templates IS 'Reusable email templates with variable substitution';
COMMENT ON TABLE notification_queue IS 'Async notification delivery queue for all channels';
COMMENT ON TABLE notification_batches IS 'Bulk notification campaigns with progress tracking';
COMMENT ON TABLE notification_triggers IS 'Event-driven notification rules configuration';

-- ============================================================================
-- SEED DEFAULT EMAIL TEMPLATES
-- ============================================================================

-- Appointment Reminder Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'appointment_reminder',
  'Reminder: Your Appointment on {appointment_date}',
  '<html><body>
<h2>Appointment Reminder</h2>
<p>Dear {patient_name},</p>
<p>This is a reminder about your upcoming appointment:</p>
<ul>
<li><strong>Date:</strong> {appointment_date}</li>
<li><strong>Time:</strong> {appointment_time}</li>
<li><strong>Provider:</strong> {provider_name}</li>
<li><strong>Location:</strong> {location_name}</li>
</ul>
<p>Please arrive 15 minutes early to complete any necessary paperwork.</p>
<p>If you need to reschedule or cancel, please contact us at {clinic_phone}.</p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'Appointment Reminder

Dear {patient_name},

This is a reminder about your upcoming appointment:

Date: {appointment_date}
Time: {appointment_time}
Provider: {provider_name}
Location: {location_name}

Please arrive 15 minutes early to complete any necessary paperwork.

If you need to reschedule or cancel, please contact us at {clinic_phone}.

Thank you,
{clinic_name}',
  '["patient_name", "appointment_date", "appointment_time", "provider_name", "location_name", "clinic_phone", "clinic_name"]',
  'Sent to patients before their scheduled appointment',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'appointment_reminder' LIMIT 1);

-- Appointment Confirmation Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'appointment_confirmation',
  'Appointment Confirmed: {appointment_date} at {appointment_time}',
  '<html><body>
<h2>Appointment Confirmed</h2>
<p>Dear {patient_name},</p>
<p>Your appointment has been successfully scheduled:</p>
<ul>
<li><strong>Date:</strong> {appointment_date}</li>
<li><strong>Time:</strong> {appointment_time}</li>
<li><strong>Provider:</strong> {provider_name}</li>
<li><strong>Type:</strong> {appointment_type}</li>
<li><strong>Location:</strong> {location_name}</li>
<li><strong>Address:</strong> {location_address}</li>
</ul>
<p>We will send you a reminder before your appointment.</p>
<p>If you need to make changes, please contact us at {clinic_phone}.</p>
<p>Thank you for choosing {clinic_name}!</p>
</body></html>',
  'Appointment Confirmed

Dear {patient_name},

Your appointment has been successfully scheduled:

Date: {appointment_date}
Time: {appointment_time}
Provider: {provider_name}
Type: {appointment_type}
Location: {location_name}
Address: {location_address}

We will send you a reminder before your appointment.

If you need to make changes, please contact us at {clinic_phone}.

Thank you for choosing {clinic_name}!',
  '["patient_name", "appointment_date", "appointment_time", "provider_name", "appointment_type", "location_name", "location_address", "clinic_phone", "clinic_name"]',
  'Sent when an appointment is booked',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'appointment_confirmation' LIMIT 1);

-- Lab Results Ready Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'lab_results_ready',
  'Your Lab Results Are Ready',
  '<html><body>
<h2>Lab Results Available</h2>
<p>Dear {patient_name},</p>
<p>Your lab results from {test_date} are now available.</p>
<p>You can view your results by logging into your patient portal.</p>
<p><a href="{portal_url}">View Results</a></p>
<p>If you have questions about your results, please contact our office or message your provider through the patient portal.</p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'Lab Results Available

Dear {patient_name},

Your lab results from {test_date} are now available.

You can view your results by logging into your patient portal: {portal_url}

If you have questions about your results, please contact our office or message your provider through the patient portal.

Thank you,
{clinic_name}',
  '["patient_name", "test_date", "portal_url", "clinic_name"]',
  'Notifies patients when lab results are ready',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'lab_results_ready' LIMIT 1);

-- Prescription Sent Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'prescription_sent',
  'Prescription Sent to Your Pharmacy',
  '<html><body>
<h2>Prescription Notification</h2>
<p>Dear {patient_name},</p>
<p>A prescription has been sent to your pharmacy:</p>
<ul>
<li><strong>Medication:</strong> {medication_name}</li>
<li><strong>Pharmacy:</strong> {pharmacy_name}</li>
<li><strong>Pharmacy Phone:</strong> {pharmacy_phone}</li>
</ul>
<p>Please allow time for your pharmacy to process the prescription before pickup.</p>
<p>If you have any questions, please contact our office.</p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'Prescription Notification

Dear {patient_name},

A prescription has been sent to your pharmacy:

Medication: {medication_name}
Pharmacy: {pharmacy_name}
Pharmacy Phone: {pharmacy_phone}

Please allow time for your pharmacy to process the prescription before pickup.

If you have any questions, please contact our office.

Thank you,
{clinic_name}',
  '["patient_name", "medication_name", "pharmacy_name", "pharmacy_phone", "clinic_name"]',
  'Notifies patients when a prescription is sent',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'prescription_sent' LIMIT 1);

-- Payment Receipt Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'payment_receipt',
  'Payment Receipt - {clinic_name}',
  '<html><body>
<h2>Payment Receipt</h2>
<p>Dear {patient_name},</p>
<p>Thank you for your payment. Here are the details:</p>
<ul>
<li><strong>Amount:</strong> ${amount}</li>
<li><strong>Date:</strong> {payment_date}</li>
<li><strong>Payment Method:</strong> {payment_method}</li>
<li><strong>Confirmation Number:</strong> {confirmation_number}</li>
</ul>
<p>If you have any questions about this payment, please contact our billing department.</p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'Payment Receipt

Dear {patient_name},

Thank you for your payment. Here are the details:

Amount: ${amount}
Date: {payment_date}
Payment Method: {payment_method}
Confirmation Number: {confirmation_number}

If you have any questions about this payment, please contact our billing department.

Thank you,
{clinic_name}',
  '["patient_name", "amount", "payment_date", "payment_method", "confirmation_number", "clinic_name"]',
  'Sent after successful payment',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'payment_receipt' LIMIT 1);

-- Statement Ready Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'statement_ready',
  'Your Statement is Ready',
  '<html><body>
<h2>Statement Available</h2>
<p>Dear {patient_name},</p>
<p>Your statement for the period ending {statement_date} is now available.</p>
<ul>
<li><strong>Balance Due:</strong> ${balance_due}</li>
<li><strong>Due Date:</strong> {due_date}</li>
</ul>
<p>You can view and pay your statement online through the patient portal:</p>
<p><a href="{portal_url}">View Statement</a></p>
<p>If you have questions about your bill, please contact our billing department at {billing_phone}.</p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'Statement Available

Dear {patient_name},

Your statement for the period ending {statement_date} is now available.

Balance Due: ${balance_due}
Due Date: {due_date}

You can view and pay your statement online through the patient portal: {portal_url}

If you have questions about your bill, please contact our billing department at {billing_phone}.

Thank you,
{clinic_name}',
  '["patient_name", "statement_date", "balance_due", "due_date", "portal_url", "billing_phone", "clinic_name"]',
  'Notifies patients when a new statement is available',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'statement_ready' LIMIT 1);

-- Credential Expiring Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'credential_expiring',
  'Action Required: Credential Expiring Soon',
  '<html><body>
<h2>Credential Expiration Notice</h2>
<p>Dear {staff_name},</p>
<p>This is a reminder that one of your credentials is expiring soon:</p>
<ul>
<li><strong>Credential:</strong> {credential_type}</li>
<li><strong>Expiration Date:</strong> {expiration_date}</li>
<li><strong>Days Until Expiration:</strong> {days_remaining}</li>
</ul>
<p>Please take action to renew this credential before the expiration date to maintain compliance.</p>
<p>If you have already renewed this credential, please submit the updated documentation to HR.</p>
<p>Thank you,<br>{clinic_name} Administration</p>
</body></html>',
  'Credential Expiration Notice

Dear {staff_name},

This is a reminder that one of your credentials is expiring soon:

Credential: {credential_type}
Expiration Date: {expiration_date}
Days Until Expiration: {days_remaining}

Please take action to renew this credential before the expiration date to maintain compliance.

If you have already renewed this credential, please submit the updated documentation to HR.

Thank you,
{clinic_name} Administration',
  '["staff_name", "credential_type", "expiration_date", "days_remaining", "clinic_name"]',
  'Alerts staff about expiring credentials',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'credential_expiring' LIMIT 1);

-- Task Assigned Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'task_assigned',
  'New Task Assigned: {task_title}',
  '<html><body>
<h2>New Task Assignment</h2>
<p>Dear {assignee_name},</p>
<p>A new task has been assigned to you:</p>
<ul>
<li><strong>Task:</strong> {task_title}</li>
<li><strong>Priority:</strong> {task_priority}</li>
<li><strong>Due Date:</strong> {due_date}</li>
<li><strong>Assigned By:</strong> {assigned_by}</li>
</ul>
<p><strong>Description:</strong></p>
<p>{task_description}</p>
<p><a href="{task_url}">View Task</a></p>
<p>Thank you,<br>{clinic_name}</p>
</body></html>',
  'New Task Assignment

Dear {assignee_name},

A new task has been assigned to you:

Task: {task_title}
Priority: {task_priority}
Due Date: {due_date}
Assigned By: {assigned_by}

Description:
{task_description}

View Task: {task_url}

Thank you,
{clinic_name}',
  '["assignee_name", "task_title", "task_priority", "due_date", "assigned_by", "task_description", "task_url", "clinic_name"]',
  'Notifies staff when a task is assigned',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'task_assigned' LIMIT 1);

-- Denial Received Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'denial_received',
  'Claim Denial Alert: {patient_name}',
  '<html><body>
<h2>Claim Denial Notice</h2>
<p>A claim has been denied and requires attention:</p>
<ul>
<li><strong>Patient:</strong> {patient_name}</li>
<li><strong>Claim ID:</strong> {claim_id}</li>
<li><strong>Service Date:</strong> {service_date}</li>
<li><strong>Denial Reason:</strong> {denial_reason}</li>
<li><strong>Payer:</strong> {payer_name}</li>
<li><strong>Amount:</strong> ${claim_amount}</li>
</ul>
<p>Please review and take appropriate action.</p>
<p><a href="{claim_url}">View Claim Details</a></p>
</body></html>',
  'Claim Denial Notice

A claim has been denied and requires attention:

Patient: {patient_name}
Claim ID: {claim_id}
Service Date: {service_date}
Denial Reason: {denial_reason}
Payer: {payer_name}
Amount: ${claim_amount}

Please review and take appropriate action.

View Claim Details: {claim_url}',
  '["patient_name", "claim_id", "service_date", "denial_reason", "payer_name", "claim_amount", "claim_url"]',
  'Alerts billing staff of claim denials',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'denial_received' LIMIT 1);

-- Welcome Email Template
INSERT INTO email_templates (tenant_id, template_name, subject, html_content, text_content, variables, description, is_active)
SELECT 'default-tenant', 'welcome_email',
  'Welcome to {clinic_name}!',
  '<html><body>
<h2>Welcome to {clinic_name}!</h2>
<p>Dear {user_name},</p>
<p>Welcome to our team! Your account has been created successfully.</p>
<p><strong>Login Details:</strong></p>
<ul>
<li><strong>Email:</strong> {user_email}</li>
<li><strong>Role:</strong> {user_role}</li>
</ul>
<p>To get started, please set your password by clicking the link below:</p>
<p><a href="{password_reset_url}">Set Your Password</a></p>
<p>This link will expire in 24 hours.</p>
<p>If you have any questions, please contact your administrator.</p>
<p>Welcome aboard!<br>{clinic_name}</p>
</body></html>',
  'Welcome to {clinic_name}!

Dear {user_name},

Welcome to our team! Your account has been created successfully.

Login Details:
Email: {user_email}
Role: {user_role}

To get started, please set your password by visiting: {password_reset_url}

This link will expire in 24 hours.

If you have any questions, please contact your administrator.

Welcome aboard!
{clinic_name}',
  '["user_name", "user_email", "user_role", "password_reset_url", "clinic_name"]',
  'Welcome email for new users',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE template_name = 'welcome_email' LIMIT 1);

-- ============================================================================
-- SEED DEFAULT NOTIFICATION TRIGGERS
-- ============================================================================

-- Lab Result Received Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'lab_result_received', 'Lab Results Notification', 'clinical', 'dynamic', 'assigned_provider',
  'Lab Results Ready: {patient_name}',
  'Lab results for {patient_name} have been received and are ready for review.',
  'normal',
  '["in_app", "email"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'lab_result_received' LIMIT 1);

-- Prior Auth Approved Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'prior_auth_approved', 'Prior Auth Approved', 'administrative', 'dynamic', 'requesting_provider',
  'Prior Authorization Approved',
  'Prior authorization for {patient_name} has been approved for {procedure_name}.',
  'normal',
  '["in_app"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'prior_auth_approved' LIMIT 1);

-- Prior Auth Denied Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'prior_auth_denied', 'Prior Auth Denied', 'administrative', 'dynamic', 'requesting_provider',
  'Prior Authorization Denied',
  'Prior authorization for {patient_name} has been denied for {procedure_name}. Reason: {denial_reason}',
  'high',
  '["in_app", "email"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'prior_auth_denied' LIMIT 1);

-- Claim Denied Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'claim_denied', 'Claim Denial Alert', 'billing', 'role', 'billing_staff',
  'Claim Denied: {patient_name}',
  'A claim for {patient_name} has been denied. Reason: {denial_reason}. Amount: ${amount}',
  'high',
  '["in_app", "email"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'claim_denied' LIMIT 1);

-- Credential Expiring Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'credential_expiring', 'Credential Expiration Warning', 'compliance', 'dynamic', 'credential_owner',
  'Credential Expiring: {credential_type}',
  'Your {credential_type} expires on {expiration_date}. Please renew before expiration.',
  'high',
  '["in_app", "email"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'credential_expiring' LIMIT 1);

-- Inventory Low Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'inventory_low', 'Low Inventory Alert', 'inventory', 'role', 'admin',
  'Low Inventory: {item_name}',
  '{item_name} is below minimum stock level. Current: {current_quantity}, Minimum: {minimum_quantity}',
  'normal',
  '["in_app"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'inventory_low' LIMIT 1);

-- New Message Received Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'message_received', 'New Message', 'patient', 'dynamic', 'assigned_staff',
  'New Message from {sender_name}',
  'You have received a new message regarding {subject}.',
  'normal',
  '["in_app", "push"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'message_received' LIMIT 1);

-- Appointment Cancelled Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'appointment_cancelled', 'Appointment Cancellation', 'scheduling', 'dynamic', 'assigned_provider',
  'Appointment Cancelled: {patient_name}',
  '{patient_name} has cancelled their appointment on {appointment_date} at {appointment_time}.',
  'normal',
  '["in_app"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'appointment_cancelled' LIMIT 1);

-- Task Assigned Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'task_assigned', 'Task Assignment', 'administrative', 'dynamic', 'assignee',
  'New Task: {task_title}',
  'You have been assigned a new task: {task_title}. Due: {due_date}',
  'normal',
  '["in_app", "email"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'task_assigned' LIMIT 1);

-- Urgent Referral Trigger
INSERT INTO notification_triggers (tenant_id, trigger_event, name, category, recipient_type, recipient_value, title_template, message_template, priority, channels, is_active)
SELECT 'default-tenant', 'urgent_referral', 'Urgent Referral', 'clinical', 'role', 'scheduling',
  'Urgent Referral: {patient_name}',
  'Urgent referral received for {patient_name}. Specialty: {specialty}. Please schedule promptly.',
  'urgent',
  '["in_app", "push"]',
  true
WHERE NOT EXISTS (SELECT 1 FROM notification_triggers WHERE trigger_event = 'urgent_referral' LIMIT 1);
