-- Migration 043: SMS Conversation Read Tracking
-- Track when staff last read each patient's SMS conversation

CREATE TABLE IF NOT EXISTS sms_message_reads (
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tenant_id, patient_id),
  CONSTRAINT fk_sms_reads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_reads_patient ON sms_message_reads(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_reads_last_read ON sms_message_reads(last_read_at);

COMMENT ON TABLE sms_message_reads IS 'Tracks when staff last read each patient SMS conversation for unread counts';
