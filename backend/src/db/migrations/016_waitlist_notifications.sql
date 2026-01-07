-- Migration: Waitlist Notifications
-- Description: Notification tracking and confirmation handling for waitlist matches

-- WAITLIST NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  waitlist_id UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Appointment details
  provider_name VARCHAR(255) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  slot_id UUID,
  -- Reference to specific appointment slot if applicable

  -- Notification details
  notification_method VARCHAR(50) NOT NULL DEFAULT 'sms',
  -- Methods: sms, email, phone, portal
  twilio_sid VARCHAR(255),
  -- Twilio message SID for SMS tracking

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status: pending, sent, delivered, failed, accepted, declined, expired
  patient_response VARCHAR(50),
  -- Response: accepted, declined

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  responded_at TIMESTAMP,
  expired_at TIMESTAMP,

  -- Error tracking
  error_message TEXT,

  CONSTRAINT valid_notification_method CHECK (notification_method IN ('sms', 'email', 'phone', 'portal')),
  CONSTRAINT valid_notification_status CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'accepted', 'declined', 'expired')),
  CONSTRAINT valid_patient_response CHECK (patient_response IN ('accepted', 'declined') OR patient_response IS NULL)
);

-- Add new status values to waitlist table
-- Note: PostgreSQL doesn't directly support adding enum values in this way
-- We update the constraint to include new statuses
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS valid_status_waitlist;
ALTER TABLE waitlist ADD CONSTRAINT valid_status_waitlist
  CHECK (status IN ('active', 'contacted', 'matched', 'scheduled', 'cancelled', 'expired'));

-- Add notification preferences to waitlist table
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS notification_preferences JSONB;
-- Example: {"methods": ["sms", "email"], "times": ["morning", "afternoon"]}

-- Indexes for performance
CREATE INDEX idx_waitlist_notifications_tenant ON waitlist_notifications(tenant_id);
CREATE INDEX idx_waitlist_notifications_waitlist ON waitlist_notifications(waitlist_id);
CREATE INDEX idx_waitlist_notifications_patient ON waitlist_notifications(patient_id);
CREATE INDEX idx_waitlist_notifications_status ON waitlist_notifications(status);
CREATE INDEX idx_waitlist_notifications_created ON waitlist_notifications(created_at DESC);
CREATE INDEX idx_waitlist_notifications_patient_date ON waitlist_notifications(patient_id, created_at DESC);

-- Index for Twilio SID lookups (for webhook updates)
CREATE INDEX idx_waitlist_notifications_twilio ON waitlist_notifications(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Comments
COMMENT ON TABLE waitlist_notifications IS 'Tracks all notifications sent to patients about waitlist matches';
COMMENT ON COLUMN waitlist_notifications.notification_method IS 'How patient was notified: sms, email, phone, portal';
COMMENT ON COLUMN waitlist_notifications.status IS 'Current status: pending, sent, delivered, failed, accepted, declined, expired';
COMMENT ON COLUMN waitlist_notifications.patient_response IS 'Patient response: accepted or declined';
COMMENT ON COLUMN waitlist_notifications.twilio_sid IS 'Twilio message SID for tracking SMS delivery status';

-- Create function to auto-expire old notifications
CREATE OR REPLACE FUNCTION expire_old_waitlist_notifications()
RETURNS void AS $$
BEGIN
  UPDATE waitlist_notifications
  SET status = 'expired',
      expired_at = NOW()
  WHERE status = 'sent'
    AND patient_response IS NULL
    AND created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create scheduled job to run expiration (requires pg_cron extension)
-- SELECT cron.schedule('expire-waitlist-notifications', '0 * * * *', 'SELECT expire_old_waitlist_notifications()');

-- View for active waitlist entries with notification counts
CREATE OR REPLACE VIEW waitlist_with_notifications AS
SELECT
  w.*,
  p.first_name,
  p.last_name,
  p.phone,
  p.email,
  u.full_name as provider_name,
  COUNT(wn.id) as notification_count,
  MAX(wn.created_at) as last_notification_at,
  COUNT(wn.id) FILTER (WHERE wn.patient_response = 'accepted') as accepted_count,
  COUNT(wn.id) FILTER (WHERE wn.patient_response = 'declined') as declined_count
FROM waitlist w
JOIN patients p ON w.patient_id = p.id
LEFT JOIN users u ON w.provider_id = u.id
LEFT JOIN waitlist_notifications wn ON w.id = wn.waitlist_id
GROUP BY w.id, p.first_name, p.last_name, p.phone, p.email, u.full_name;

COMMENT ON VIEW waitlist_with_notifications IS 'Waitlist entries with aggregated notification statistics';
