-- Adaptive Learning System for Provider Patterns
-- Tracks diagnosis and procedure usage patterns per provider for intelligent suggestions

-- Provider Diagnosis Frequency Table
-- Tracks how often each provider uses specific ICD-10 codes
CREATE TABLE IF NOT EXISTS provider_diagnosis_frequency (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  icd10_code TEXT NOT NULL,
  frequency_count INTEGER DEFAULT 1 CHECK (frequency_count > 0),
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider Procedure Frequency Table
-- Tracks how often each provider uses specific CPT codes
CREATE TABLE IF NOT EXISTS provider_procedure_frequency (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  cpt_code TEXT NOT NULL,
  frequency_count INTEGER DEFAULT 1 CHECK (frequency_count > 0),
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diagnosis-Procedure Pairs Table
-- Tracks which procedures are commonly used with which diagnoses per provider
CREATE TABLE IF NOT EXISTS diagnosis_procedure_pairs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  icd10_code TEXT NOT NULL,
  cpt_code TEXT NOT NULL,
  pair_count INTEGER DEFAULT 1 CHECK (pair_count > 0),
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique indexes to ensure one record per provider-code combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_dx_unique
  ON provider_diagnosis_frequency(provider_id, icd10_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_proc_unique
  ON provider_procedure_frequency(provider_id, cpt_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dx_proc_pair_unique
  ON diagnosis_procedure_pairs(provider_id, icd10_code, cpt_code);

-- Tenant isolation indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_provider_dx_tenant
  ON provider_diagnosis_frequency(tenant_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_provider_proc_tenant
  ON provider_procedure_frequency(tenant_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_dx_proc_pair_tenant
  ON diagnosis_procedure_pairs(tenant_id, provider_id);

-- Indexes for sorting by frequency and recency
CREATE INDEX IF NOT EXISTS idx_provider_dx_freq
  ON provider_diagnosis_frequency(provider_id, frequency_count DESC, last_used DESC);

CREATE INDEX IF NOT EXISTS idx_provider_proc_freq
  ON provider_procedure_frequency(provider_id, frequency_count DESC, last_used DESC);

CREATE INDEX IF NOT EXISTS idx_dx_proc_pair_freq
  ON diagnosis_procedure_pairs(provider_id, icd10_code, pair_count DESC, last_used DESC);

-- Comments for documentation
COMMENT ON TABLE provider_diagnosis_frequency IS 'Tracks diagnosis usage patterns per provider for intelligent auto-suggestions';
COMMENT ON TABLE provider_procedure_frequency IS 'Tracks procedure usage patterns per provider for intelligent auto-suggestions';
COMMENT ON TABLE diagnosis_procedure_pairs IS 'Tracks commonly paired diagnoses and procedures per provider';

COMMENT ON COLUMN provider_diagnosis_frequency.frequency_count IS 'Number of times this provider has used this diagnosis';
COMMENT ON COLUMN provider_diagnosis_frequency.last_used IS 'Most recent usage timestamp for recency scoring';
COMMENT ON COLUMN provider_procedure_frequency.frequency_count IS 'Number of times this provider has used this procedure';
COMMENT ON COLUMN provider_procedure_frequency.last_used IS 'Most recent usage timestamp for recency scoring';
COMMENT ON COLUMN diagnosis_procedure_pairs.pair_count IS 'Number of times this diagnosis-procedure pair has been used together';
