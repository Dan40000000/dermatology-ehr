-- HL7 v2.x Message Queue and Processing Tables
-- Migration 019: HL7 Messages

-- Main HL7 message queue table
CREATE TABLE IF NOT EXISTS hl7_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Message identification
  message_type VARCHAR(50) NOT NULL,
  message_control_id VARCHAR(100),
  sending_application VARCHAR(255),
  sending_facility VARCHAR(255),
  receiving_application VARCHAR(255),
  receiving_facility VARCHAR(255),

  -- Message content
  raw_message TEXT NOT NULL,
  parsed_data JSONB,

  -- Processing status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status values: pending, processing, processed, failed

  error_message TEXT,
  processed_at TIMESTAMP,

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient observations table (for lab results from ORU^R01 messages)
CREATE TABLE IF NOT EXISTS patient_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  document_id UUID,

  -- Observation details
  observation_code VARCHAR(100) NOT NULL,
  observation_name VARCHAR(255),
  observation_value TEXT,
  value_type VARCHAR(50),
  units VARCHAR(100),
  reference_range VARCHAR(255),
  abnormal_flag VARCHAR(50),

  -- Timing
  observation_date TIMESTAMP NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'final',

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT fk_observation_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_observation_document FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE SET NULL
);

-- Indexes for hl7_messages table
CREATE INDEX IF NOT EXISTS idx_hl7_messages_tenant
  ON hl7_messages(tenant_id);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_status
  ON hl7_messages(status);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_type
  ON hl7_messages(message_type);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_control_id
  ON hl7_messages(message_control_id);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_created
  ON hl7_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_tenant_status
  ON hl7_messages(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_retry
  ON hl7_messages(status, next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;

-- Indexes for patient_observations table
CREATE INDEX IF NOT EXISTS idx_observations_tenant
  ON patient_observations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_observations_patient
  ON patient_observations(patient_id);

CREATE INDEX IF NOT EXISTS idx_observations_document
  ON patient_observations(document_id);

CREATE INDEX IF NOT EXISTS idx_observations_code
  ON patient_observations(observation_code);

CREATE INDEX IF NOT EXISTS idx_observations_date
  ON patient_observations(observation_date);

CREATE INDEX IF NOT EXISTS idx_observations_tenant_patient
  ON patient_observations(tenant_id, patient_id);

-- Add external_id columns to existing tables if they don't exist
-- These allow matching HL7 identifiers to existing records

DO $$
BEGIN
  -- Add external_id to patients table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE patients ADD COLUMN external_id VARCHAR(255);
    CREATE INDEX idx_patients_external_id ON patients(external_id);
  END IF;

  -- Add external_id to appointments table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN external_id VARCHAR(255);
    CREATE INDEX idx_appointments_external_id ON appointments(external_id);
  END IF;

  -- Add external_id to providers table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE providers ADD COLUMN external_id VARCHAR(255);
    CREATE INDEX idx_providers_external_id ON providers(external_id);
  END IF;

  -- Add external_id to locations table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE locations ADD COLUMN external_id VARCHAR(255);
    CREATE INDEX idx_locations_external_id ON locations(external_id);
  END IF;

  -- Add cancel_reason to appointments if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'cancel_reason'
  ) THEN
    ALTER TABLE appointments ADD COLUMN cancel_reason TEXT;
  END IF;

  -- Add ssn to patients if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'ssn'
  ) THEN
    ALTER TABLE patients ADD COLUMN ssn VARCHAR(11);
  END IF;

  -- Add metadata column to documents if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE documents ADD COLUMN metadata JSONB;
  END IF;

  -- Add content column to documents if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'content'
  ) THEN
    ALTER TABLE documents ADD COLUMN content JSONB;
  END IF;
END $$;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON hl7_messages TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON patient_observations TO your_app_user;

-- Comments for documentation
COMMENT ON TABLE hl7_messages IS 'Queue for incoming HL7 v2.x messages with processing status';
COMMENT ON COLUMN hl7_messages.status IS 'Processing status: pending, processing, processed, failed';
COMMENT ON COLUMN hl7_messages.retry_count IS 'Number of retry attempts for failed messages';
COMMENT ON COLUMN hl7_messages.next_retry_at IS 'Timestamp for next retry attempt with exponential backoff';

COMMENT ON TABLE patient_observations IS 'Lab results and observations from HL7 ORU^R01 messages';
COMMENT ON COLUMN patient_observations.observation_code IS 'LOINC or other standard code for the observation';
COMMENT ON COLUMN patient_observations.value_type IS 'HL7 data type (NM=numeric, ST=string, TX=text, etc)';
COMMENT ON COLUMN patient_observations.abnormal_flag IS 'Abnormal flags (H=high, L=low, N=normal, etc)';
