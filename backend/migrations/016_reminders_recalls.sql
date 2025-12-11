-- Reminders & Recalls System for Automated Patient Follow-ups
-- HIPAA-compliant patient recall campaigns and contact tracking

-- Recall Campaigns Table
CREATE TABLE IF NOT EXISTS recall_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  recall_type TEXT NOT NULL,
  interval_months INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patient Recalls Table
CREATE TABLE IF NOT EXISTS patient_recalls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES recall_campaigns(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'scheduled', 'completed', 'dismissed')),
  last_contact_date DATE,
  contact_method TEXT,
  notes TEXT,
  appointment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reminder Log Table (HIPAA audit trail)
CREATE TABLE IF NOT EXISTS reminder_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recall_id TEXT REFERENCES patient_recalls(id) ON DELETE SET NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('email', 'sms', 'phone', 'mail', 'portal')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opted_out')),
  message_content TEXT,
  sent_by TEXT,
  error_message TEXT
);

-- Patient Communication Preferences
CREATE TABLE IF NOT EXISTS patient_communication_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allow_email BOOLEAN DEFAULT true,
  allow_sms BOOLEAN DEFAULT true,
  allow_phone BOOLEAN DEFAULT true,
  allow_mail BOOLEAN DEFAULT true,
  preferred_method TEXT DEFAULT 'email',
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, patient_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_tenant ON recall_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_active ON recall_campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_type ON recall_campaigns(recall_type);

CREATE INDEX IF NOT EXISTS idx_patient_recalls_tenant ON patient_recalls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_patient ON patient_recalls(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_campaign ON patient_recalls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_due_date ON patient_recalls(due_date);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_status ON patient_recalls(status);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_tenant_status ON patient_recalls(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_recalls_tenant_due ON patient_recalls(tenant_id, due_date);

CREATE INDEX IF NOT EXISTS idx_reminder_log_tenant ON reminder_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_patient ON reminder_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_recall ON reminder_log(recall_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_sent_at ON reminder_log(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_comm_prefs_tenant ON patient_communication_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_comm_prefs_patient ON patient_communication_preferences(patient_id);

-- Comments for documentation
COMMENT ON TABLE recall_campaigns IS 'Configurable recall campaigns for patient follow-ups (annual checks, post-procedure, etc.)';
COMMENT ON TABLE patient_recalls IS 'Individual patient recall records with due dates and tracking';
COMMENT ON TABLE reminder_log IS 'HIPAA-compliant audit log of all patient communications';
COMMENT ON TABLE patient_communication_preferences IS 'Patient consent and communication preferences';

COMMENT ON COLUMN recall_campaigns.recall_type IS 'Types: Annual Skin Check, Post-Procedure Follow-up, Medication Refill, Lab Result Follow-up, Chronic Condition Check-in';
COMMENT ON COLUMN recall_campaigns.interval_months IS 'How many months after last visit to trigger recall (e.g., 12 for annual)';
COMMENT ON COLUMN patient_recalls.status IS 'pending, contacted, scheduled, completed, dismissed';
COMMENT ON COLUMN reminder_log.reminder_type IS 'Communication channel: email, sms, phone, mail, portal';
COMMENT ON COLUMN reminder_log.delivery_status IS 'pending, sent, delivered, failed, bounced, opted_out';
COMMENT ON COLUMN patient_communication_preferences.opted_out IS 'Patient has opted out of ALL communications';
