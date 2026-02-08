-- ============================================================================
-- External Integrations Layer for Dermatology CRM
-- Migration 087: Core integration tables for clearinghouse, labs, payments, etc.
-- ============================================================================

-- ============================================================================
-- INTEGRATION CONFIGURATION
-- ============================================================================

-- Table for storing integration configurations (credentials, settings, etc.)
CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_type VARCHAR(50) NOT NULL, -- clearinghouse, eligibility, eprescribe, lab, payment, fax
  provider VARCHAR(100) NOT NULL, -- change_healthcare, availity, surescripts, labcorp, quest, stripe, phaxio
  config JSONB NOT NULL DEFAULT '{}', -- Non-sensitive configuration
  credentials_encrypted TEXT, -- Encrypted API keys/secrets
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_frequency_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_integration_configs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_integration_configs_tenant_type UNIQUE (tenant_id, integration_type, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_configs_tenant ON integration_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_configs_type ON integration_configs(integration_type);
CREATE INDEX IF NOT EXISTS idx_integration_configs_active ON integration_configs(tenant_id, is_active) WHERE is_active = true;

-- Table for logging all integration API calls
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100),
  direction VARCHAR(20) NOT NULL DEFAULT 'outbound', -- inbound, outbound
  endpoint VARCHAR(500),
  method VARCHAR(20),
  request JSONB,
  response JSONB,
  status VARCHAR(50) NOT NULL, -- success, error, timeout, pending
  status_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  correlation_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_integration_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant ON integration_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_type ON integration_logs(integration_type);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_correlation ON integration_logs(correlation_id);

-- ============================================================================
-- CLEARINGHOUSE / ERA INTEGRATION
-- ============================================================================

-- Note: Some clearinghouse tables already exist in 029_clearinghouse.sql
-- Adding additional fields for enhanced tracking

-- Table for tracking batch submissions to clearinghouse
CREATE TABLE IF NOT EXISTS clearinghouse_batch_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  batch_id VARCHAR(100) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, submitted, acknowledged, accepted, rejected, partial
  claim_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  total_amount_cents BIGINT DEFAULT 0,
  response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_clearinghouse_batch_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clearinghouse_batch_tenant ON clearinghouse_batch_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clearinghouse_batch_status ON clearinghouse_batch_submissions(status);
CREATE INDEX IF NOT EXISTS idx_clearinghouse_batch_submitted ON clearinghouse_batch_submissions(submitted_at DESC);

-- ERA files table for tracking received 835 files
CREATE TABLE IF NOT EXISTS era_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  filename VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payment_count INTEGER DEFAULT 0,
  total_amount_cents BIGINT DEFAULT 0,
  payer_name VARCHAR(255),
  payer_id VARCHAR(100),
  check_number VARCHAR(100),
  check_date DATE,
  eft_trace_number VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'received', -- received, processing, processed, error, posted
  error_message TEXT,
  raw_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_era_files_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_era_files_tenant ON era_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_era_files_status ON era_files(status);
CREATE INDEX IF NOT EXISTS idx_era_files_received ON era_files(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_era_files_payer ON era_files(payer_id);

-- ERA payments table for individual claim payments from ERA
CREATE TABLE IF NOT EXISTS era_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  era_file_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  claim_id UUID,
  claim_number VARCHAR(100),
  patient_id UUID,
  patient_name VARCHAR(255),
  payer_id VARCHAR(100),
  payer_name VARCHAR(255),
  service_date DATE,
  billed_amount_cents BIGINT,
  allowed_amount_cents BIGINT,
  paid_amount_cents BIGINT NOT NULL,
  patient_responsibility_cents BIGINT DEFAULT 0,
  adjustment_codes JSONB, -- [{code, reason, amount}]
  remark_codes TEXT[],
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, matched, posted, unmatched, denied
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_era_payments_file FOREIGN KEY (era_file_id) REFERENCES era_files(id) ON DELETE CASCADE,
  CONSTRAINT fk_era_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_era_payments_claim FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL,
  CONSTRAINT fk_era_payments_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_era_payments_file ON era_payments(era_file_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_tenant ON era_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_claim ON era_payments(claim_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_patient ON era_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_era_payments_status ON era_payments(status);

-- ============================================================================
-- ELIGIBILITY VERIFICATION
-- ============================================================================

-- Eligibility checks tracking
CREATE TABLE IF NOT EXISTS eligibility_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  payer_id VARCHAR(100),
  payer_name VARCHAR(255),
  member_id VARCHAR(100),
  group_number VARCHAR(100),
  service_type VARCHAR(100) DEFAULT 'medical', -- medical, dental, vision
  service_date DATE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL, -- active, inactive, unknown, error
  response JSONB, -- Raw API response
  coverage_details JSONB, -- Parsed coverage info
  benefits JSONB, -- Copays, deductibles, etc.
  in_network BOOLEAN,
  requires_prior_auth BOOLEAN DEFAULT false,
  prior_auth_phone VARCHAR(50),
  expires_at TIMESTAMPTZ, -- When this verification expires
  source VARCHAR(50) DEFAULT 'api', -- api, manual, cached
  request_id VARCHAR(100), -- Correlation ID for API calls
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eligibility_checks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_eligibility_checks_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eligibility_checks_tenant ON eligibility_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_patient ON eligibility_checks(patient_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_payer ON eligibility_checks(payer_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_status ON eligibility_checks(status);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_checked ON eligibility_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_expires ON eligibility_checks(expires_at);

-- ============================================================================
-- LAB INTEGRATION
-- ============================================================================

-- Lab orders table
CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  encounter_id UUID,
  lab_provider VARCHAR(100) NOT NULL, -- labcorp, quest, local
  order_number VARCHAR(100),
  external_order_id VARCHAR(100), -- Order ID from lab vendor
  tests JSONB NOT NULL, -- [{code, name, instructions}]
  diagnosis_codes TEXT[], -- ICD-10 codes
  priority VARCHAR(50) DEFAULT 'routine', -- stat, urgent, routine
  fasting_required BOOLEAN DEFAULT false,
  special_instructions TEXT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, acknowledged, in_progress, completed, cancelled
  transmitted_at TIMESTAMPTZ,
  transmission_status VARCHAR(50), -- success, error, pending
  transmission_error TEXT,
  results_received_at TIMESTAMPTZ,
  abn_signed BOOLEAN DEFAULT false,
  abn_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_lab_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_encounter FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant ON lab_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_provider ON lab_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_lab_provider ON lab_orders(lab_provider);
CREATE INDEX IF NOT EXISTS idx_lab_orders_ordered ON lab_orders(ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_external ON lab_orders(external_order_id);

-- Lab results table
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  test_code VARCHAR(50) NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  loinc_code VARCHAR(50),
  result_value TEXT,
  result_value_numeric DECIMAL(18, 4),
  unit VARCHAR(50),
  reference_range VARCHAR(100),
  reference_low DECIMAL(18, 4),
  reference_high DECIMAL(18, 4),
  abnormal_flag VARCHAR(20), -- H, L, HH, LL, A, N, null
  interpretation TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'final', -- preliminary, final, corrected, cancelled
  performed_at TIMESTAMPTZ,
  resulted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performing_lab VARCHAR(255),
  technician VARCHAR(255),
  notes TEXT,
  is_critical BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_lab_results_order FOREIGN KEY (order_id) REFERENCES lab_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_results_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lab_results_order ON lab_results(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_tenant ON lab_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_test_code ON lab_results(test_code);
CREATE INDEX IF NOT EXISTS idx_lab_results_abnormal ON lab_results(abnormal_flag) WHERE abnormal_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_results_critical ON lab_results(is_critical) WHERE is_critical = true;
CREATE INDEX IF NOT EXISTS idx_lab_results_resulted ON lab_results(resulted_at DESC);

-- ============================================================================
-- E-PRESCRIBING
-- ============================================================================

-- E-Prescriptions table
CREATE TABLE IF NOT EXISTS eprescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  encounter_id UUID,
  pharmacy_id UUID,
  pharmacy_ncpdp VARCHAR(20),
  pharmacy_name VARCHAR(255),
  prescription_id UUID, -- Link to main prescriptions table if exists
  medications JSONB NOT NULL, -- [{name, ndc, sig, quantity, refills, daw, notes}]
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, accepted, rejected, cancelled, dispensed
  submitted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  dispensed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  transmission_id VARCHAR(100),
  transmission_status VARCHAR(50),
  transmission_error TEXT,
  surescripts_message_id VARCHAR(100),
  is_controlled BOOLEAN DEFAULT false,
  controlled_schedule VARCHAR(10), -- II, III, IV, V
  epcs_signed BOOLEAN DEFAULT false,
  epcs_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eprescriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_eprescriptions_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_eprescriptions_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_eprescriptions_encounter FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_eprescriptions_tenant ON eprescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_patient ON eprescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_provider ON eprescriptions(provider_id);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_pharmacy ON eprescriptions(pharmacy_ncpdp);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_status ON eprescriptions(status);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_submitted ON eprescriptions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_eprescriptions_controlled ON eprescriptions(is_controlled) WHERE is_controlled = true;

-- Pharmacy directory table
CREATE TABLE IF NOT EXISTS pharmacy_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncpdp_id VARCHAR(20) NOT NULL UNIQUE,
  npi VARCHAR(20),
  name VARCHAR(255) NOT NULL,
  dba_name VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(10),
  phone VARCHAR(20),
  fax VARCHAR(20),
  email VARCHAR(255),
  pharmacy_type VARCHAR(50), -- retail, mail_order, specialty, compounding
  chain_name VARCHAR(255),
  accepts_eprescribe BOOLEAN DEFAULT true,
  accepts_new_rx BOOLEAN DEFAULT true,
  accepts_refill_request BOOLEAN DEFAULT true,
  accepts_rx_change BOOLEAN DEFAULT true,
  accepts_cancel BOOLEAN DEFAULT true,
  accepts_controlled BOOLEAN DEFAULT false,
  is_24_hour BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_ncpdp ON pharmacy_directory(ncpdp_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_npi ON pharmacy_directory(npi);
CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_name ON pharmacy_directory(name);
CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_zip ON pharmacy_directory(zip);
CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_city_state ON pharmacy_directory(city, state);
CREATE INDEX IF NOT EXISTS idx_pharmacy_directory_active ON pharmacy_directory(is_active) WHERE is_active = true;

-- ============================================================================
-- PAYMENT PROCESSING
-- ============================================================================

-- Payment intents table (Stripe integration)
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  stripe_payment_intent_id VARCHAR(100),
  stripe_customer_id VARCHAR(100),
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL DEFAULT 'created', -- created, processing, succeeded, failed, cancelled, refunded
  payment_method_type VARCHAR(50), -- card, bank_transfer, etc.
  payment_method_id VARCHAR(100),
  description TEXT,
  metadata JSONB,
  invoice_id UUID,
  encounter_id UUID,
  client_secret VARCHAR(255),
  receipt_url VARCHAR(500),
  failure_code VARCHAR(100),
  failure_message TEXT,
  captured_at TIMESTAMPTZ,
  refunded_amount_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_payment_intents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_intents_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant ON payment_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_patient ON payment_intents(patient_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_stripe ON payment_intents(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_created ON payment_intents(created_at DESC);

-- Payment methods table (stored cards/accounts)
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  stripe_payment_method_id VARCHAR(100) NOT NULL,
  stripe_customer_id VARCHAR(100),
  type VARCHAR(50) NOT NULL, -- card, us_bank_account
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  billing_name VARCHAR(255),
  billing_zip VARCHAR(10),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_payment_methods_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_methods_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant ON payment_methods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_patient ON payment_methods(patient_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe ON payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = true;

-- Stripe customers table
CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255),
  default_payment_method_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_stripe_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_stripe_customers_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_tenant ON stripe_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_patient ON stripe_customers(patient_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe ON stripe_customers(stripe_customer_id);

-- ============================================================================
-- FAX INTEGRATION
-- ============================================================================

-- Fax transmissions table
CREATE TABLE IF NOT EXISTS fax_transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  fax_number VARCHAR(20) NOT NULL,
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  subject VARCHAR(255),
  page_count INTEGER DEFAULT 0,
  document_id UUID,
  document_url VARCHAR(1000),
  referral_id UUID, -- Link to referral if applicable
  provider_id UUID, -- Requesting/receiving provider
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sending, sent, failed, received, processed
  external_id VARCHAR(100), -- Fax provider transmission ID
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_fax_transmissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fax_transmissions_tenant ON fax_transmissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fax_transmissions_direction ON fax_transmissions(direction);
CREATE INDEX IF NOT EXISTS idx_fax_transmissions_status ON fax_transmissions(status);
CREATE INDEX IF NOT EXISTS idx_fax_transmissions_external ON fax_transmissions(external_id);
CREATE INDEX IF NOT EXISTS idx_fax_transmissions_referral ON fax_transmissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_fax_transmissions_created ON fax_transmissions(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Integration configs
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'integration_configs_updated_at') THEN
    CREATE TRIGGER integration_configs_updated_at
      BEFORE UPDATE ON integration_configs
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- ERA files
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'era_files_updated_at') THEN
    CREATE TRIGGER era_files_updated_at
      BEFORE UPDATE ON era_files
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- ERA payments
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'era_payments_updated_at') THEN
    CREATE TRIGGER era_payments_updated_at
      BEFORE UPDATE ON era_payments
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Eligibility checks
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'eligibility_checks_updated_at') THEN
    CREATE TRIGGER eligibility_checks_updated_at
      BEFORE UPDATE ON eligibility_checks
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Lab orders
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lab_orders_int_updated_at') THEN
    CREATE TRIGGER lab_orders_int_updated_at
      BEFORE UPDATE ON lab_orders
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Lab results
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lab_results_int_updated_at') THEN
    CREATE TRIGGER lab_results_int_updated_at
      BEFORE UPDATE ON lab_results
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- E-prescriptions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'eprescriptions_updated_at') THEN
    CREATE TRIGGER eprescriptions_updated_at
      BEFORE UPDATE ON eprescriptions
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Payment intents
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_intents_updated_at') THEN
    CREATE TRIGGER payment_intents_updated_at
      BEFORE UPDATE ON payment_intents
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Payment methods
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_methods_updated_at') THEN
    CREATE TRIGGER payment_methods_updated_at
      BEFORE UPDATE ON payment_methods
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Fax transmissions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fax_transmissions_updated_at') THEN
    CREATE TRIGGER fax_transmissions_updated_at
      BEFORE UPDATE ON fax_transmissions
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;

  -- Clearinghouse batch submissions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clearinghouse_batch_submissions_updated_at') THEN
    CREATE TRIGGER clearinghouse_batch_submissions_updated_at
      BEFORE UPDATE ON clearinghouse_batch_submissions
      FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE integration_configs IS 'Stores configuration for external integrations (clearinghouse, labs, payments, etc.)';
COMMENT ON TABLE integration_logs IS 'Audit log of all external API calls for debugging and compliance';
COMMENT ON TABLE era_files IS 'Electronic Remittance Advice (835) files received from payers';
COMMENT ON TABLE era_payments IS 'Individual claim payments parsed from ERA files';
COMMENT ON TABLE eligibility_checks IS 'Insurance eligibility verification results';
COMMENT ON TABLE lab_orders IS 'Lab orders sent to external lab vendors';
COMMENT ON TABLE lab_results IS 'Lab results received from external vendors';
COMMENT ON TABLE eprescriptions IS 'Electronic prescriptions sent via Surescripts';
COMMENT ON TABLE pharmacy_directory IS 'NCPDP pharmacy directory for e-prescribing';
COMMENT ON TABLE payment_intents IS 'Stripe payment intents for patient payments';
COMMENT ON TABLE payment_methods IS 'Stored payment methods (cards) for patients';
COMMENT ON TABLE stripe_customers IS 'Stripe customer IDs linked to patients';
COMMENT ON TABLE fax_transmissions IS 'Inbound and outbound fax tracking';
