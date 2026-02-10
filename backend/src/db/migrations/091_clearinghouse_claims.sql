-- Migration: Clearinghouse Claims Submission System
-- Description: Complete clearinghouse integration for claim submission, X12 837P support, and remittance processing

-- ============================================================================
-- CLEARINGHOUSE CONFIGURATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS clearinghouse_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'change_healthcare', 'availity', 'trizetto', 'waystar', 'custom'
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,

  -- Connection settings
  api_endpoint TEXT,
  api_version TEXT,
  sftp_host TEXT,
  sftp_port INTEGER DEFAULT 22,
  sftp_username TEXT,

  -- Encrypted credentials (encrypted at rest)
  credentials_encrypted JSONB,
  -- Format: {api_key, api_secret, client_id, client_secret, sftp_password, certificate}

  -- Submission settings
  submission_format TEXT DEFAULT '837P', -- '837P', '837I', 'CMS1500', 'UB04'
  submission_method TEXT DEFAULT 'api', -- 'api', 'sftp', 'direct'
  batch_enabled BOOLEAN DEFAULT TRUE,
  max_batch_size INTEGER DEFAULT 100,

  -- Sender/Receiver IDs
  sender_id TEXT,
  sender_qualifier TEXT DEFAULT 'ZZ',
  receiver_id TEXT,
  receiver_qualifier TEXT DEFAULT 'ZZ',
  submitter_id TEXT,

  -- Trading partner settings
  trading_partner_id TEXT,

  -- Status polling
  status_check_enabled BOOLEAN DEFAULT TRUE,
  status_check_interval_minutes INTEGER DEFAULT 60,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Ensure only one default per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_clearinghouse_configs_default
  ON clearinghouse_configs(tenant_id)
  WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_clearinghouse_configs_tenant ON clearinghouse_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clearinghouse_configs_active ON clearinghouse_configs(tenant_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- CLAIM SUBMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS claim_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  superbill_id TEXT,
  clearinghouse_id TEXT REFERENCES clearinghouse_configs(id),

  -- Submission details
  submission_date TIMESTAMPTZ DEFAULT NOW(),
  submission_batch_id TEXT,
  submission_number TEXT,

  -- X12 specific
  x12_claim_id TEXT, -- ICN or internal control number
  x12_transaction_set TEXT, -- Full 837P transaction set (for debugging)
  isa_control_number TEXT,
  gs_control_number TEXT,
  st_control_number TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending',
  -- 'pending', 'submitted', 'acknowledged', 'accepted', 'rejected',
  -- 'paid', 'denied', 'pended', 'additional_info_requested'

  status_code TEXT,
  status_message TEXT,

  -- Acknowledgment data
  acknowledgment_date TIMESTAMPTZ,
  acknowledgment_type TEXT, -- 'TA1', '999', '277CA', '835'

  -- Response data from clearinghouse
  response_data JSONB,
  -- Format: {
  --   acknowledgments: [{type, date, status, errors}],
  --   statusUpdates: [{date, status, code, message}],
  --   rawResponses: [{type, date, content}]
  -- }

  -- Error handling
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Retry management
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Timestamps
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_claim_submissions_tenant ON claim_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_claim ON claim_submissions(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_status ON claim_submissions(status);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_x12_id ON claim_submissions(x12_claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_date ON claim_submissions(submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_batch ON claim_submissions(submission_batch_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_pending ON claim_submissions(tenant_id, status)
  WHERE status IN ('pending', 'submitted', 'pended', 'additional_info_requested');

-- ============================================================================
-- CLAIM STATUS HISTORY (Enhanced)
-- ============================================================================

-- Add additional columns if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claim_status_history') THEN
    -- Add raw_response column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'claim_status_history' AND column_name = 'raw_response') THEN
      ALTER TABLE claim_status_history ADD COLUMN raw_response JSONB;
    END IF;

    -- Add source column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'claim_status_history' AND column_name = 'source') THEN
      ALTER TABLE claim_status_history ADD COLUMN source TEXT DEFAULT 'manual';
      -- 'manual', 'clearinghouse', '277', '835', 'payer_portal'
    END IF;

    -- Add status_code column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'claim_status_history' AND column_name = 'status_code') THEN
      ALTER TABLE claim_status_history ADD COLUMN status_code TEXT;
    END IF;

    -- Add status_category column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'claim_status_history' AND column_name = 'status_category') THEN
      ALTER TABLE claim_status_history ADD COLUMN status_category TEXT;
      -- 'acknowledgment', 'adjudication', 'payment', 'denial', 'appeal'
    END IF;
  END IF;
END $$;

-- ============================================================================
-- REMITTANCE ADVICES (ERA/EOB Processing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS remittance_advices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT REFERENCES claims(id) ON DELETE SET NULL,
  claim_submission_id TEXT REFERENCES claim_submissions(id) ON DELETE SET NULL,

  -- ERA Header Info
  era_number TEXT,
  era_date DATE,
  payer_name TEXT,
  payer_id TEXT,

  -- Payment details
  payment_amount DECIMAL(12, 2),
  payment_amount_cents INTEGER,
  payment_date DATE,
  payment_method TEXT, -- 'eft', 'check', 'virtual_card'
  check_number TEXT,
  eft_trace_number TEXT,

  -- Adjustment details
  adjustment_codes JSONB,
  -- Format: [{code, group, reason, amount}]
  -- Group codes: CO (Contractual Obligation), PR (Patient Responsibility),
  --              OA (Other Adjustment), PI (Payer Initiated)

  total_adjustments_cents INTEGER,

  -- Patient responsibility
  patient_responsibility DECIMAL(12, 2),
  patient_responsibility_cents INTEGER,

  -- Breakdown
  allowed_amount DECIMAL(12, 2),
  deductible_amount DECIMAL(12, 2),
  coinsurance_amount DECIMAL(12, 2),
  copay_amount DECIMAL(12, 2),

  -- Service line details
  service_lines JSONB,
  -- Format: [{
  --   lineNumber, cptCode, chargeAmount, paidAmount,
  --   adjustments: [{code, reason, amount}],
  --   remarkCodes: []
  -- }]

  -- Remark codes
  remark_codes JSONB, -- Array of remark codes with descriptions

  -- X12 835 specific
  x12_835_data JSONB,
  isa_control_number TEXT,
  gs_control_number TEXT,
  transaction_handle_number TEXT,

  -- Processing status
  status TEXT DEFAULT 'received', -- 'received', 'pending_review', 'posted', 'disputed'
  posted_at TIMESTAMPTZ,
  posted_by TEXT,

  -- Reconciliation
  reconciled BOOLEAN DEFAULT FALSE,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  variance_amount_cents INTEGER,
  variance_reason TEXT,

  -- Raw data
  raw_era_data TEXT, -- Original 835 transaction

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remittance_advices_tenant ON remittance_advices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_claim ON remittance_advices(claim_id);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_submission ON remittance_advices(claim_submission_id);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_status ON remittance_advices(status);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_date ON remittance_advices(era_date DESC);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_payer ON remittance_advices(payer_id);
CREATE INDEX IF NOT EXISTS idx_remittance_advices_unreconciled ON remittance_advices(tenant_id)
  WHERE reconciled = FALSE;

-- ============================================================================
-- CLAIM SUBMISSION BATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS claim_submission_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  clearinghouse_id TEXT REFERENCES clearinghouse_configs(id),

  batch_number TEXT NOT NULL,
  batch_date TIMESTAMPTZ DEFAULT NOW(),

  -- Batch statistics
  total_claims INTEGER DEFAULT 0,
  total_amount_cents BIGINT DEFAULT 0,

  -- Status tracking
  submitted_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,

  status TEXT DEFAULT 'draft', -- 'draft', 'ready', 'submitted', 'partial', 'completed', 'failed'

  -- X12 envelope
  isa_control_number TEXT,
  gs_control_number TEXT,
  x12_envelope TEXT, -- Full batch envelope for reference

  -- Submission details
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,

  -- Response tracking
  acknowledgment_received BOOLEAN DEFAULT FALSE,
  acknowledgment_date TIMESTAMPTZ,
  acknowledgment_data JSONB,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_claim_batches_tenant ON claim_submission_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_batches_status ON claim_submission_batches(status);
CREATE INDEX IF NOT EXISTS idx_claim_batches_date ON claim_submission_batches(batch_date DESC);
CREATE INDEX IF NOT EXISTS idx_claim_batches_clearinghouse ON claim_submission_batches(clearinghouse_id);

-- ============================================================================
-- X12 CONTROL NUMBERS (For ISA/GS sequence management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS x12_control_numbers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  clearinghouse_id TEXT REFERENCES clearinghouse_configs(id),

  -- Control number sequences
  isa_sequence INTEGER DEFAULT 1,
  gs_sequence INTEGER DEFAULT 1,
  st_sequence INTEGER DEFAULT 1,

  -- Last used date (for daily reset if needed)
  last_isa_date DATE,
  last_gs_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_x12_control_numbers_unique
  ON x12_control_numbers(tenant_id, clearinghouse_id);

-- ============================================================================
-- ADJUSTMENT REASON CODES (Reference table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS adjustment_reason_codes (
  code TEXT PRIMARY KEY,
  group_code TEXT, -- 'CO', 'PR', 'OA', 'PI', 'CR'
  description TEXT NOT NULL,
  category TEXT, -- 'contractual', 'patient', 'payer', 'denial'
  is_denial BOOLEAN DEFAULT FALSE,
  appeal_required BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common adjustment reason codes
INSERT INTO adjustment_reason_codes (code, group_code, description, category, is_denial) VALUES
  ('1', 'PR', 'Deductible Amount', 'patient', FALSE),
  ('2', 'PR', 'Coinsurance Amount', 'patient', FALSE),
  ('3', 'PR', 'Co-payment Amount', 'patient', FALSE),
  ('4', 'CO', 'Procedure code inconsistent with modifier', 'contractual', TRUE),
  ('5', 'CO', 'Procedure code inconsistent with place of service', 'contractual', TRUE),
  ('16', 'CO', 'Claim lacks information needed for adjudication', 'denial', TRUE),
  ('18', 'CO', 'Duplicate claim', 'denial', TRUE),
  ('22', 'CO', 'Care may be covered by another payer', 'denial', TRUE),
  ('23', 'CO', 'Impact of prior payer adjudication', 'contractual', FALSE),
  ('27', 'CO', 'Expenses incurred after coverage terminated', 'denial', TRUE),
  ('29', 'CO', 'Benefit maximum exceeded', 'denial', TRUE),
  ('45', 'CO', 'Charges exceed fee schedule/maximum allowable', 'contractual', FALSE),
  ('50', 'CO', 'Non-covered service (cosmetic)', 'denial', TRUE),
  ('96', 'CO', 'Non-covered charge', 'denial', TRUE),
  ('97', 'CO', 'Payment adjusted because benefit is included in payment for another service', 'contractual', FALSE),
  ('109', 'CO', 'Claim not covered by this payer/contractor', 'denial', TRUE),
  ('119', 'CO', 'Benefit maximum for service has been reached', 'denial', TRUE),
  ('140', 'CO', 'Patient/Insured health identification number and name do not match', 'denial', TRUE),
  ('197', 'CO', 'Precertification/authorization absent', 'denial', TRUE),
  ('204', 'CO', 'Service not authorized or referred', 'denial', TRUE),
  ('242', 'CO', 'Services not rendered by network/primary care provider', 'denial', TRUE),
  ('B1', 'CO', 'Non-covered visits', 'denial', TRUE),
  ('B4', 'CO', 'Late filing penalty', 'contractual', FALSE),
  ('B7', 'CO', 'Provider not certified/eligible', 'denial', TRUE),
  ('N130', 'OA', 'Claim adjusted based on stop loss', 'payer', FALSE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE clearinghouse_configs IS 'Clearinghouse connection configurations for claim submission';
COMMENT ON TABLE claim_submissions IS 'Individual claim submission records with X12 tracking';
COMMENT ON TABLE remittance_advices IS 'ERA/EOB processing for payment reconciliation';
COMMENT ON TABLE claim_submission_batches IS 'Batch claim submissions with envelope tracking';
COMMENT ON TABLE x12_control_numbers IS 'X12 ISA/GS/ST control number sequence management';
COMMENT ON TABLE adjustment_reason_codes IS 'Reference table for ANSI adjustment reason codes';

COMMENT ON COLUMN claim_submissions.x12_claim_id IS 'Internal Control Number (ICN) assigned by clearinghouse';
COMMENT ON COLUMN claim_submissions.response_data IS 'JSONB containing all clearinghouse responses';
COMMENT ON COLUMN remittance_advices.adjustment_codes IS 'JSONB array of adjustment reason codes with amounts';
COMMENT ON COLUMN clearinghouse_configs.credentials_encrypted IS 'Encrypted API credentials and keys';
