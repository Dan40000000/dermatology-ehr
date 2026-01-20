-- SMS Consent and Audit Tables (simplified - no FK constraints)

-- SMS Consent table for HIPAA compliance
CREATE TABLE IF NOT EXISTS sms_consent (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  consent_given BOOLEAN DEFAULT false,
  consent_date TIMESTAMPTZ,
  consent_method TEXT, -- verbal, written, electronic
  obtained_by_user_id TEXT,
  obtained_by_name TEXT,
  expiration_date DATE,
  consent_revoked BOOLEAN DEFAULT false,
  revoked_date TIMESTAMPTZ,
  revoked_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_patient ON sms_consent(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_consent_tenant ON sms_consent(tenant_id);

-- SMS Audit Log table
CREATE TABLE IF NOT EXISTS sms_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  patient_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  action TEXT NOT NULL, -- sent, received, viewed, exported, consent_obtained, consent_revoked
  performed_by_user_id TEXT,
  performed_by_name TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_audit_tenant ON sms_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_audit_patient ON sms_audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_audit_created ON sms_audit_log(created_at DESC);
