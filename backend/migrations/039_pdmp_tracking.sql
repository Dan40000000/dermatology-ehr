-- PDMP (Prescription Drug Monitoring Program) Tracking

CREATE TABLE IF NOT EXISTS pdmp_checks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  checked_by_user_id TEXT NOT NULL,
  medication TEXT,
  schedule TEXT,  -- Schedule II, III, IV, V
  risk_score TEXT,  -- Low, Moderate, High
  flags_found INTEGER DEFAULT 0,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdmp_checks_patient ON pdmp_checks(patient_id);
CREATE INDEX IF NOT EXISTS idx_pdmp_checks_tenant ON pdmp_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pdmp_checks_checked_at ON pdmp_checks(checked_at DESC);

-- Prior auth requirements by CPT code
CREATE TABLE IF NOT EXISTS prior_auth_requirements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  cpt_code TEXT NOT NULL,
  payer_id TEXT,
  requires_auth BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prior_auth_req_cpt ON prior_auth_requirements(cpt_code);
CREATE INDEX IF NOT EXISTS idx_prior_auth_req_tenant ON prior_auth_requirements(tenant_id);
