-- Migration: Fax Management System
-- Description: Tables for inbound/outbound fax management with patient linking and status tracking
-- Created: 2025-12-29

-- Create faxes table for inbound and outbound fax records
CREATE TABLE IF NOT EXISTS faxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Direction and transmission details
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  subject VARCHAR(500),
  pages INTEGER DEFAULT 1,

  -- Status tracking
  status VARCHAR(20) NOT NULL CHECK (status IN ('received', 'sending', 'sent', 'failed')),
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  transmission_id VARCHAR(100),
  error_message TEXT,

  -- File storage
  pdf_url VARCHAR(1000),
  storage VARCHAR(20) DEFAULT 'local',
  object_key VARCHAR(500),

  -- Patient and encounter linking
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

  -- Inbox management
  read BOOLEAN DEFAULT FALSE,
  notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Outbox tracking
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT faxes_tenant_id_check CHECK (tenant_id <> '')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_faxes_tenant_id ON faxes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_faxes_direction ON faxes(direction);
CREATE INDEX IF NOT EXISTS idx_faxes_status ON faxes(status);
CREATE INDEX IF NOT EXISTS idx_faxes_patient_id ON faxes(patient_id);
CREATE INDEX IF NOT EXISTS idx_faxes_read ON faxes(read) WHERE direction = 'inbound';
CREATE INDEX IF NOT EXISTS idx_faxes_received_at ON faxes(received_at) WHERE direction = 'inbound';
CREATE INDEX IF NOT EXISTS idx_faxes_sent_at ON faxes(sent_at) WHERE direction = 'outbound';
CREATE INDEX IF NOT EXISTS idx_faxes_assigned_to ON faxes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_faxes_sent_by ON faxes(sent_by);

-- Composite index for inbox filtering
CREATE INDEX IF NOT EXISTS idx_faxes_inbox ON faxes(tenant_id, direction, status, read, received_at DESC);

-- Composite index for outbox filtering
CREATE INDEX IF NOT EXISTS idx_faxes_outbox ON faxes(tenant_id, direction, status, sent_at DESC);

-- Add comment for documentation
COMMENT ON TABLE faxes IS 'Stores inbound and outbound fax records with patient linking and status tracking';
COMMENT ON COLUMN faxes.direction IS 'Whether the fax is inbound (received) or outbound (sent)';
COMMENT ON COLUMN faxes.status IS 'Transmission status: received, sending, sent, or failed';
COMMENT ON COLUMN faxes.transmission_id IS 'Unique identifier from fax service provider';
COMMENT ON COLUMN faxes.read IS 'Whether the inbound fax has been read (inbox management)';
COMMENT ON COLUMN faxes.assigned_to IS 'User responsible for processing the inbound fax';
COMMENT ON COLUMN faxes.sent_by IS 'User who initiated the outbound fax';
