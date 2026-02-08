-- Migration: Enhanced RCM (Revenue Cycle Management) Features
-- Description: Adds appeal tracking, ERA improvements, and underpayment detection

-- ============================================
-- CLAIM APPEALS TABLE
-- Tracks the full history of appeals for denied claims
-- ============================================

CREATE TABLE IF NOT EXISTS claim_appeals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Appeal details
  appeal_level TEXT NOT NULL DEFAULT 'first', -- first, second, external
  appeal_status TEXT NOT NULL DEFAULT 'pending', -- pending, submitted, approved, denied, partial
  appeal_notes TEXT,
  template_used TEXT, -- Reference to template ID used

  -- Deadlines and dates
  appeal_deadline DATE,
  submitted_at TIMESTAMPTZ,
  decision_date DATE,

  -- Outcome tracking
  outcome TEXT, -- approved, denied, partial
  approved_amount_cents INTEGER,
  outcome_notes TEXT,

  -- Audit
  submitted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_appeals_claim ON claim_appeals(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_tenant ON claim_appeals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_status ON claim_appeals(appeal_status);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_deadline ON claim_appeals(appeal_deadline) WHERE appeal_status = 'submitted';

-- ============================================
-- CLAIM ADJUSTMENTS TABLE
-- Tracks payment adjustments from ERA/EOB
-- ============================================

CREATE TABLE IF NOT EXISTS claim_adjustments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Adjustment details
  adjustment_code TEXT NOT NULL,
  adjustment_reason TEXT,
  amount_cents INTEGER NOT NULL,

  -- Categorization
  adjustment_group TEXT, -- CO, PR, OA, PI (Contractual, Patient Responsibility, Other Adjustment, Payer Initiated)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_adjustments_claim ON claim_adjustments(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_adjustments_tenant ON claim_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_adjustments_code ON claim_adjustments(adjustment_code);

-- ============================================
-- ERA IMPORTS TABLE ENHANCEMENTS
-- Add columns for better tracking of import results
-- ============================================

-- Add new columns if they don't exist
DO $$
BEGIN
  -- matched_count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'era_imports' AND column_name = 'matched_count') THEN
    ALTER TABLE era_imports ADD COLUMN matched_count INTEGER DEFAULT 0;
  END IF;

  -- unmatched_count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'era_imports' AND column_name = 'unmatched_count') THEN
    ALTER TABLE era_imports ADD COLUMN unmatched_count INTEGER DEFAULT 0;
  END IF;

  -- total_paid_cents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'era_imports' AND column_name = 'total_paid_cents') THEN
    ALTER TABLE era_imports ADD COLUMN total_paid_cents INTEGER DEFAULT 0;
  END IF;

  -- summary (JSONB for detailed results)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'era_imports' AND column_name = 'summary') THEN
    ALTER TABLE era_imports ADD COLUMN summary JSONB;
  END IF;
END $$;

-- ============================================
-- UNDERPAYMENT FLAGS TABLE
-- Tracks claims flagged for underpayment review
-- ============================================

CREATE TABLE IF NOT EXISTS claim_underpayment_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Variance details
  expected_amount_cents INTEGER,
  actual_paid_cents INTEGER,
  variance_percent DECIMAL(5, 2),

  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending', -- pending, reviewing, resolved, dismissed
  notes TEXT,
  resolution_notes TEXT,

  -- Audit
  flagged_by TEXT,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_underpayment_flags_claim ON claim_underpayment_flags(claim_id);
CREATE INDEX IF NOT EXISTS idx_underpayment_flags_tenant ON claim_underpayment_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_underpayment_flags_status ON claim_underpayment_flags(status);
CREATE INDEX IF NOT EXISTS idx_underpayment_flags_created ON claim_underpayment_flags(created_at DESC);

-- ============================================
-- PAYER CONTRACTS ENHANCEMENTS
-- Ensure we have the fields needed for underpayment detection
-- ============================================

DO $$
BEGIN
  -- reimbursement_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'payer_contracts' AND column_name = 'reimbursement_type') THEN
    ALTER TABLE payer_contracts ADD COLUMN reimbursement_type TEXT;
  END IF;

  -- reimbursement_percentage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'payer_contracts' AND column_name = 'reimbursement_percentage') THEN
    ALTER TABLE payer_contracts ADD COLUMN reimbursement_percentage DECIMAL(5, 2);
  END IF;

  -- medicare_percentage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'payer_contracts' AND column_name = 'medicare_percentage') THEN
    ALTER TABLE payer_contracts ADD COLUMN medicare_percentage DECIMAL(5, 2);
  END IF;
END $$;

-- ============================================
-- APPEAL LETTER TEMPLATES TABLE (Optional)
-- For storing custom templates per tenant
-- ============================================

CREATE TABLE IF NOT EXISTS appeal_letter_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL = global/system template

  -- Template details
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- cosmetic_vs_medical, modifier_issue, prior_auth, documentation, duplicate
  description TEXT,
  template_content TEXT NOT NULL,

  -- Usage tracking
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_appeal_templates_tenant ON appeal_letter_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appeal_templates_category ON appeal_letter_templates(category);
CREATE INDEX IF NOT EXISTS idx_appeal_templates_active ON appeal_letter_templates(is_active) WHERE is_active = TRUE;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE claim_appeals IS 'Tracks appeal history for denied claims with levels, deadlines, and outcomes';
COMMENT ON TABLE claim_adjustments IS 'Payment adjustments from ERA/EOB processing (contractual, patient responsibility, etc.)';
COMMENT ON TABLE claim_underpayment_flags IS 'Flags claims where paid amount is significantly less than expected based on fee schedule';
COMMENT ON TABLE appeal_letter_templates IS 'Customizable appeal letter templates for different denial types';

COMMENT ON COLUMN claim_appeals.appeal_level IS 'Level of appeal: first (initial), second (reconsideration), external (IRE)';
COMMENT ON COLUMN claim_underpayment_flags.variance_percent IS 'Percentage difference between expected and actual payment';
COMMENT ON COLUMN claim_adjustments.adjustment_group IS 'CAS adjustment group: CO (Contractual), PR (Patient Resp), OA (Other), PI (Payer Initiated)';
