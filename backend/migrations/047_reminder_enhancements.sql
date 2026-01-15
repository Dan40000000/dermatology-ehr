-- Reminder/Recalls Enhancements: Bulk notifications, additional tracking columns
-- Adds doctor's notes, preferred contact method, notification tracking

-- Add additional columns to patient_recalls table
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT CHECK (preferred_contact_method IN ('email', 'sms', 'phone', 'mail', 'portal'));
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS notified_on TIMESTAMPTZ;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS notification_count INTEGER DEFAULT 0;

-- Create reminder notification history table for tracking individual notifications
CREATE TABLE IF NOT EXISTS reminder_notification_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recall_id TEXT NOT NULL REFERENCES patient_recalls(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'sms', 'phone', 'portal')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
  message_content TEXT,
  error_message TEXT,
  sent_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_recalls_preferred_contact ON patient_recalls(preferred_contact_method);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_notified_on ON patient_recalls(notified_on);
CREATE INDEX IF NOT EXISTS idx_reminder_notification_history_tenant ON reminder_notification_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_notification_history_recall ON reminder_notification_history(recall_id);
CREATE INDEX IF NOT EXISTS idx_reminder_notification_history_patient ON reminder_notification_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_reminder_notification_history_sent_at ON reminder_notification_history(sent_at DESC);

-- Comments for documentation
COMMENT ON TABLE reminder_notification_history IS 'Detailed history of individual reminder notifications sent to patients';
COMMENT ON COLUMN patient_recalls.doctor_notes IS 'Clinical notes from doctor regarding this recall';
COMMENT ON COLUMN patient_recalls.preferred_contact_method IS 'Patient preferred method for contact';
COMMENT ON COLUMN patient_recalls.notified_on IS 'Timestamp of most recent notification sent';
COMMENT ON COLUMN patient_recalls.notification_count IS 'Total number of notifications sent for this recall';
