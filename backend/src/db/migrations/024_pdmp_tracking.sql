-- Migration: PDMP (Prescription Drug Monitoring Program) Tracking
-- Description: Add table for tracking PDMP checks for controlled substances

-- Create PDMP checks table
CREATE TABLE IF NOT EXISTS pdmp_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  checked_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication TEXT NOT NULL,
  schedule TEXT, -- Schedule II, III, IV, V
  risk_score TEXT, -- Low, Moderate, High
  flags_found INTEGER DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pdmp_checks_tenant_patient ON pdmp_checks(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_pdmp_checks_checked_at ON pdmp_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdmp_checks_patient_id ON pdmp_checks(patient_id);

-- Add comments
COMMENT ON TABLE pdmp_checks IS 'Tracks PDMP (Prescription Drug Monitoring Program) checks for controlled substances';
COMMENT ON COLUMN pdmp_checks.schedule IS 'DEA controlled substance schedule (II, III, IV, V)';
COMMENT ON COLUMN pdmp_checks.risk_score IS 'Patient risk assessment from PDMP check (Low, Moderate, High)';
COMMENT ON COLUMN pdmp_checks.flags_found IS 'Number of risk flags identified in PDMP check';
