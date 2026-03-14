CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS insurance_payers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  supports_realtime_eligibility BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  provider_services_phone TEXT,
  typical_prior_auth_services TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, payer_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_payers_tenant
  ON insurance_payers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insurance_payers_payer_id
  ON insurance_payers(payer_id);

CREATE TABLE IF NOT EXISTS eligibility_checks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  payer_id TEXT,
  payer_name TEXT,
  member_id TEXT,
  service_date DATE,
  status TEXT NOT NULL DEFAULT 'unknown',
  response JSONB,
  coverage_details JSONB,
  benefits JSONB,
  in_network BOOLEAN,
  requires_prior_auth BOOLEAN NOT NULL DEFAULT false,
  request_id TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'mock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eligibility_checks_tenant
  ON eligibility_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_patient
  ON eligibility_checks(patient_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_checked
  ON eligibility_checks(checked_at DESC);

CREATE TABLE IF NOT EXISTS clearinghouse_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  submission_number TEXT NOT NULL,
  control_number TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  clearinghouse_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clearinghouse_submissions_tenant_claim
  ON clearinghouse_submissions(tenant_id, claim_id);
CREATE INDEX IF NOT EXISTS idx_clearinghouse_submissions_submitted_at
  ON clearinghouse_submissions(submitted_at DESC);

CREATE TABLE IF NOT EXISTS clearinghouse_batch_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  claim_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_clearinghouse_batch_submissions_tenant
  ON clearinghouse_batch_submissions(tenant_id);

CREATE TABLE IF NOT EXISTS era_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  payer_name TEXT,
  payer_id TEXT,
  check_number TEXT,
  check_date DATE,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_era_files_tenant
  ON era_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_era_files_status
  ON era_files(status);
CREATE INDEX IF NOT EXISTS idx_era_files_received
  ON era_files(received_at DESC);

CREATE TABLE IF NOT EXISTS era_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  era_file_id TEXT NOT NULL REFERENCES era_files(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id TEXT REFERENCES claims(id) ON DELETE SET NULL,
  claim_number TEXT,
  patient_name TEXT,
  payer_name TEXT,
  service_date DATE,
  billed_amount_cents INTEGER NOT NULL DEFAULT 0,
  allowed_amount_cents INTEGER NOT NULL DEFAULT 0,
  paid_amount_cents INTEGER NOT NULL DEFAULT 0,
  patient_responsibility_cents INTEGER NOT NULL DEFAULT 0,
  adjustment_codes JSONB,
  status TEXT NOT NULL DEFAULT 'unmatched',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_era_payments_file
  ON era_payments(era_file_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_tenant
  ON era_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_claim
  ON era_payments(claim_id);
