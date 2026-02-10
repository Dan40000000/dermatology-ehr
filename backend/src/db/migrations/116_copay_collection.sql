-- Copay Collection and Payment Prompts System
-- Migration 116: Comprehensive copay collection workflow

-- ============================================================================
-- COPAY AMOUNTS TABLE
-- Stores copay amounts by payer and visit type
-- ============================================================================

CREATE TABLE IF NOT EXISTS copay_amounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payer_id TEXT NOT NULL,
  payer_name TEXT,

  -- Visit type specifics
  visit_type TEXT NOT NULL CHECK (visit_type IN (
    'new_patient', 'established_patient', 'specialist',
    'preventive', 'urgent_care', 'telehealth', 'procedure', 'other'
  )),

  -- Copay amount in cents
  copay_amount_cents INTEGER NOT NULL DEFAULT 0,

  -- Source of the copay information
  source TEXT NOT NULL CHECK (source IN ('eligibility_check', 'manual', 'default', 'payer_contract')),

  -- Effective dates
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,

  -- Metadata
  notes TEXT,
  verification_id TEXT, -- Link to insurance verification if from eligibility check

  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, payer_id, visit_type, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_copay_amounts_tenant ON copay_amounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_copay_amounts_payer ON copay_amounts(payer_id);
CREATE INDEX IF NOT EXISTS idx_copay_amounts_visit_type ON copay_amounts(visit_type);
CREATE INDEX IF NOT EXISTS idx_copay_amounts_effective ON copay_amounts(effective_date);
CREATE INDEX IF NOT EXISTS idx_copay_amounts_lookup ON copay_amounts(tenant_id, payer_id, visit_type, effective_date DESC);

-- ============================================================================
-- COLLECTION PROMPTS TABLE
-- Tracks prompts shown to staff for collecting payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS collection_prompts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  appointment_id TEXT REFERENCES appointments(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  encounter_id TEXT REFERENCES encounters(id),

  -- Prompt type
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('copay', 'balance', 'deductible', 'coinsurance', 'prepayment', 'deposit')),

  -- Collection point
  collection_point TEXT NOT NULL CHECK (collection_point IN ('pre_visit', 'check_in', 'checkout', 'post_visit')),

  -- Amounts
  amount_due_cents INTEGER NOT NULL DEFAULT 0,
  collected_amount_cents INTEGER DEFAULT 0,

  -- Collection details
  collection_method TEXT CHECK (collection_method IN (
    'cash', 'check', 'credit_card', 'debit_card', 'hsa_fsa',
    'payment_plan', 'card_on_file', 'patient_portal', 'waived', 'deferred'
  )),
  payment_reference TEXT,

  -- Timing
  displayed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'displayed', 'collected_full', 'collected_partial',
    'deferred', 'waived', 'declined', 'expired'
  )),

  -- Response details
  skip_reason TEXT CHECK (skip_reason IN (
    'patient_refused', 'no_card_available', 'dispute', 'hardship',
    'insurance_issue', 'will_pay_later', 'manager_override', 'other'
  )),
  skip_notes TEXT,

  -- Staff handling
  collected_by TEXT REFERENCES users(id),

  -- Related payment
  payment_id TEXT,

  -- Notification tracking
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('sms', 'email', 'both')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_prompts_tenant ON collection_prompts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_appointment ON collection_prompts(appointment_id);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_patient ON collection_prompts(patient_id);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_status ON collection_prompts(status);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_type ON collection_prompts(prompt_type);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_point ON collection_prompts(collection_point);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_date ON collection_prompts(displayed_at);
CREATE INDEX IF NOT EXISTS idx_collection_prompts_pending ON collection_prompts(tenant_id, status) WHERE status = 'pending';

-- ============================================================================
-- PAYMENT PLANS TABLE
-- Tracks payment plan arrangements with patients
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),

  -- Plan details
  plan_number TEXT NOT NULL,
  original_amount_cents INTEGER NOT NULL,
  remaining_amount_cents INTEGER NOT NULL,
  monthly_payment_cents INTEGER NOT NULL,

  -- Schedule
  number_of_payments INTEGER NOT NULL,
  payments_made INTEGER DEFAULT 0,
  start_date DATE NOT NULL,
  next_due_date DATE,
  end_date DATE,

  -- Auto-charge settings
  auto_charge BOOLEAN DEFAULT FALSE,
  card_on_file_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'pending', 'active', 'paused', 'completed', 'defaulted', 'cancelled'
  )),

  -- Terms
  terms_agreed_at TIMESTAMPTZ,
  terms_signature TEXT, -- Could store signature data or reference
  agreement_pdf_url TEXT,

  -- Default handling
  missed_payments_count INTEGER DEFAULT 0,
  last_missed_date DATE,

  -- Notes
  notes TEXT,
  special_terms TEXT,

  -- Audit
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES users(id),
  cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_tenant ON payment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_patient ON payment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON payment_plans(status);
CREATE INDEX IF NOT EXISTS idx_payment_plans_next_due ON payment_plans(next_due_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payment_plans_auto_charge ON payment_plans(tenant_id, auto_charge, next_due_date) WHERE auto_charge = TRUE AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_payment_plans_number ON payment_plans(plan_number);

-- Payment plan payments tracking
CREATE TABLE IF NOT EXISTS payment_plan_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payment_plan_id TEXT NOT NULL REFERENCES payment_plans(id),

  -- Payment details
  payment_number INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Payment method
  payment_method TEXT CHECK (payment_method IN (
    'cash', 'check', 'credit_card', 'debit_card', 'hsa_fsa', 'ach', 'card_on_file'
  )),
  payment_reference TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'late', 'missed', 'waived'
  )),

  -- Auto-charge result
  auto_charge_attempted BOOLEAN DEFAULT FALSE,
  auto_charge_attempted_at TIMESTAMPTZ,
  auto_charge_result TEXT CHECK (auto_charge_result IN ('success', 'declined', 'error', 'pending')),
  auto_charge_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_payments_plan ON payment_plan_payments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_payments_status ON payment_plan_payments(status);
CREATE INDEX IF NOT EXISTS idx_plan_payments_due ON payment_plan_payments(due_date) WHERE status = 'pending';

-- ============================================================================
-- CARD ON FILE TABLE
-- Securely stores payment card references (actual card data in Stripe)
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_on_file (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),

  -- Card display info (non-sensitive)
  last_four TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN (
    'visa', 'mastercard', 'amex', 'discover', 'other'
  )),
  expiry_month INTEGER NOT NULL CHECK (expiry_month >= 1 AND expiry_month <= 12),
  expiry_year INTEGER NOT NULL,

  -- Cardholder info
  cardholder_name TEXT,
  billing_zip TEXT,

  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT, -- Stripe PaymentMethod ID
  stripe_token_encrypted TEXT, -- Encrypted token for legacy compatibility

  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_valid BOOLEAN DEFAULT TRUE,

  -- Verification
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_charge_result TEXT CHECK (last_charge_result IN ('success', 'declined', 'error', 'pending')),

  -- Consent
  consent_given_at TIMESTAMPTZ,
  consent_method TEXT CHECK (consent_method IN ('in_person', 'patient_portal', 'phone', 'written')),
  consent_form_url TEXT,

  -- Audit
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT REFERENCES users(id),
  deactivation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_card_on_file_tenant ON card_on_file(tenant_id);
CREATE INDEX IF NOT EXISTS idx_card_on_file_patient ON card_on_file(patient_id);
CREATE INDEX IF NOT EXISTS idx_card_on_file_default ON card_on_file(patient_id, is_default) WHERE is_default = TRUE AND is_valid = TRUE;
CREATE INDEX IF NOT EXISTS idx_card_on_file_stripe ON card_on_file(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_card_on_file_expiry ON card_on_file(expiry_year, expiry_month);

-- Ensure only one default card per patient
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_on_file_unique_default
  ON card_on_file(patient_id) WHERE is_default = TRUE AND is_valid = TRUE AND deactivated_at IS NULL;

-- ============================================================================
-- DAILY COLLECTION SUMMARY TABLE
-- For reporting and dashboards
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_collection_summary (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  summary_date DATE NOT NULL,

  -- Copay collections
  copays_due_cents INTEGER DEFAULT 0,
  copays_collected_cents INTEGER DEFAULT 0,
  copays_collected_count INTEGER DEFAULT 0,
  copays_waived_cents INTEGER DEFAULT 0,
  copays_deferred_cents INTEGER DEFAULT 0,

  -- Balance collections
  balances_due_cents INTEGER DEFAULT 0,
  balances_collected_cents INTEGER DEFAULT 0,
  balances_collected_count INTEGER DEFAULT 0,

  -- Collection points breakdown
  collected_at_checkin_cents INTEGER DEFAULT 0,
  collected_at_checkout_cents INTEGER DEFAULT 0,
  collected_via_portal_cents INTEGER DEFAULT 0,
  collected_via_phone_cents INTEGER DEFAULT 0,

  -- Payment methods breakdown
  collected_cash_cents INTEGER DEFAULT 0,
  collected_check_cents INTEGER DEFAULT 0,
  collected_card_cents INTEGER DEFAULT 0,
  collected_hsa_fsa_cents INTEGER DEFAULT 0,

  -- Payment plans
  payment_plans_created INTEGER DEFAULT 0,
  payment_plans_amount_cents INTEGER DEFAULT 0,

  -- Metrics
  collection_rate DECIMAL(5,2), -- Percentage collected vs due
  average_collection_cents INTEGER,

  -- Staff performance
  staff_collection_stats JSONB, -- {userId: {collected: x, attempts: y}}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_collection_summary_tenant ON daily_collection_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_collection_summary_date ON daily_collection_summary(summary_date);

-- ============================================================================
-- RECEIPT TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS receipt_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),

  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,

  -- Template content
  header_html TEXT,
  body_html TEXT,
  footer_html TEXT,

  -- Settings
  include_logo BOOLEAN DEFAULT TRUE,
  include_signature_line BOOLEAN DEFAULT FALSE,
  paper_size TEXT DEFAULT 'letter' CHECK (paper_size IN ('letter', 'a4', 'receipt')),

  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get expected copay for an appointment
CREATE OR REPLACE FUNCTION get_expected_copay(
  p_tenant_id TEXT,
  p_appointment_id TEXT
) RETURNS TABLE (
  copay_amount_cents INTEGER,
  source TEXT,
  visit_type TEXT,
  payer_id TEXT,
  payer_name TEXT
) AS $$
DECLARE
  v_patient_id TEXT;
  v_payer_id TEXT;
  v_payer_name TEXT;
  v_visit_type TEXT;
  v_appointment_type TEXT;
BEGIN
  -- Get appointment and patient details
  SELECT a.patient_id, p.insurance_payer_id, p.insurance_provider, at.name
  INTO v_patient_id, v_payer_id, v_payer_name, v_appointment_type
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
  WHERE a.id = p_appointment_id AND a.tenant_id = p_tenant_id;

  IF v_patient_id IS NULL THEN
    RETURN;
  END IF;

  -- Determine visit type based on appointment type
  v_visit_type := CASE
    WHEN v_appointment_type ILIKE '%new%' THEN 'new_patient'
    WHEN v_appointment_type ILIKE '%telehealth%' OR v_appointment_type ILIKE '%video%' THEN 'telehealth'
    WHEN v_appointment_type ILIKE '%preventive%' OR v_appointment_type ILIKE '%annual%' THEN 'preventive'
    WHEN v_appointment_type ILIKE '%urgent%' THEN 'urgent_care'
    WHEN v_appointment_type ILIKE '%procedure%' OR v_appointment_type ILIKE '%surgery%' THEN 'procedure'
    ELSE 'established_patient'
  END;

  -- First try to get from copay_amounts table
  RETURN QUERY
  SELECT ca.copay_amount_cents, ca.source, ca.visit_type, ca.payer_id, ca.payer_name
  FROM copay_amounts ca
  WHERE ca.tenant_id = p_tenant_id
    AND ca.payer_id = v_payer_id
    AND ca.visit_type = v_visit_type
    AND ca.effective_date <= CURRENT_DATE
    AND (ca.expiration_date IS NULL OR ca.expiration_date >= CURRENT_DATE)
  ORDER BY ca.effective_date DESC
  LIMIT 1;

  -- If not found, try from recent eligibility verification
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      iv.copay_specialist_cents::INTEGER as copay_amount_cents,
      'eligibility_check'::TEXT as source,
      v_visit_type,
      iv.payer_id,
      iv.payer_name
    FROM insurance_verifications iv
    WHERE iv.tenant_id = p_tenant_id
      AND iv.patient_id = v_patient_id
      AND iv.verification_status = 'active'
      AND iv.verified_at > NOW() - INTERVAL '30 days'
    ORDER BY iv.verified_at DESC
    LIMIT 1;
  END IF;

  -- If still not found, try patient's stored copay
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      (p.insurance_copay * 100)::INTEGER as copay_amount_cents,
      'default'::TEXT as source,
      v_visit_type,
      p.insurance_payer_id as payer_id,
      p.insurance_provider as payer_name
    FROM patients p
    WHERE p.id = v_patient_id AND p.tenant_id = p_tenant_id
      AND p.insurance_copay IS NOT NULL AND p.insurance_copay > 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily collection summary
CREATE OR REPLACE FUNCTION update_daily_collection_summary(
  p_tenant_id TEXT,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS VOID AS $$
DECLARE
  v_summary RECORD;
BEGIN
  -- Calculate daily totals
  SELECT
    COALESCE(SUM(CASE WHEN prompt_type = 'copay' THEN amount_due_cents ELSE 0 END), 0) as copays_due,
    COALESCE(SUM(CASE WHEN prompt_type = 'copay' AND status IN ('collected_full', 'collected_partial') THEN collected_amount_cents ELSE 0 END), 0) as copays_collected,
    COALESCE(COUNT(*) FILTER (WHERE prompt_type = 'copay' AND status IN ('collected_full', 'collected_partial')), 0) as copays_count,
    COALESCE(SUM(CASE WHEN prompt_type = 'copay' AND status = 'waived' THEN amount_due_cents ELSE 0 END), 0) as copays_waived,
    COALESCE(SUM(CASE WHEN prompt_type = 'copay' AND status = 'deferred' THEN amount_due_cents ELSE 0 END), 0) as copays_deferred,
    COALESCE(SUM(CASE WHEN prompt_type IN ('balance', 'deductible', 'coinsurance') THEN amount_due_cents ELSE 0 END), 0) as balances_due,
    COALESCE(SUM(CASE WHEN prompt_type IN ('balance', 'deductible', 'coinsurance') AND status IN ('collected_full', 'collected_partial') THEN collected_amount_cents ELSE 0 END), 0) as balances_collected,
    COALESCE(COUNT(*) FILTER (WHERE prompt_type IN ('balance', 'deductible', 'coinsurance') AND status IN ('collected_full', 'collected_partial')), 0) as balances_count,
    COALESCE(SUM(CASE WHEN collection_point = 'check_in' AND status IN ('collected_full', 'collected_partial') THEN collected_amount_cents ELSE 0 END), 0) as at_checkin,
    COALESCE(SUM(CASE WHEN collection_point = 'checkout' AND status IN ('collected_full', 'collected_partial') THEN collected_amount_cents ELSE 0 END), 0) as at_checkout,
    COALESCE(SUM(CASE WHEN collection_method = 'cash' THEN collected_amount_cents ELSE 0 END), 0) as cash_collected,
    COALESCE(SUM(CASE WHEN collection_method = 'check' THEN collected_amount_cents ELSE 0 END), 0) as check_collected,
    COALESCE(SUM(CASE WHEN collection_method IN ('credit_card', 'debit_card', 'card_on_file') THEN collected_amount_cents ELSE 0 END), 0) as card_collected,
    COALESCE(SUM(CASE WHEN collection_method = 'hsa_fsa' THEN collected_amount_cents ELSE 0 END), 0) as hsa_collected
  INTO v_summary
  FROM collection_prompts
  WHERE tenant_id = p_tenant_id
    AND DATE(displayed_at) = p_date;

  -- Get payment plan stats
  DECLARE
    v_plans_created INTEGER;
    v_plans_amount INTEGER;
  BEGIN
    SELECT
      COUNT(*),
      COALESCE(SUM(original_amount_cents), 0)
    INTO v_plans_created, v_plans_amount
    FROM payment_plans
    WHERE tenant_id = p_tenant_id
      AND DATE(created_at) = p_date;

    -- Upsert the summary
    INSERT INTO daily_collection_summary (
      id, tenant_id, summary_date,
      copays_due_cents, copays_collected_cents, copays_collected_count,
      copays_waived_cents, copays_deferred_cents,
      balances_due_cents, balances_collected_cents, balances_collected_count,
      collected_at_checkin_cents, collected_at_checkout_cents,
      collected_cash_cents, collected_check_cents, collected_card_cents, collected_hsa_fsa_cents,
      payment_plans_created, payment_plans_amount_cents,
      collection_rate,
      updated_at
    ) VALUES (
      gen_random_uuid()::text, p_tenant_id, p_date,
      v_summary.copays_due, v_summary.copays_collected, v_summary.copays_count,
      v_summary.copays_waived, v_summary.copays_deferred,
      v_summary.balances_due, v_summary.balances_collected, v_summary.balances_count,
      v_summary.at_checkin, v_summary.at_checkout,
      v_summary.cash_collected, v_summary.check_collected, v_summary.card_collected, v_summary.hsa_collected,
      v_plans_created, v_plans_amount,
      CASE WHEN (v_summary.copays_due + v_summary.balances_due) > 0
        THEN ((v_summary.copays_collected + v_summary.balances_collected)::DECIMAL / (v_summary.copays_due + v_summary.balances_due) * 100)
        ELSE 0
      END,
      NOW()
    )
    ON CONFLICT (tenant_id, summary_date) DO UPDATE SET
      copays_due_cents = EXCLUDED.copays_due_cents,
      copays_collected_cents = EXCLUDED.copays_collected_cents,
      copays_collected_count = EXCLUDED.copays_collected_count,
      copays_waived_cents = EXCLUDED.copays_waived_cents,
      copays_deferred_cents = EXCLUDED.copays_deferred_cents,
      balances_due_cents = EXCLUDED.balances_due_cents,
      balances_collected_cents = EXCLUDED.balances_collected_cents,
      balances_collected_count = EXCLUDED.balances_collected_count,
      collected_at_checkin_cents = EXCLUDED.collected_at_checkin_cents,
      collected_at_checkout_cents = EXCLUDED.collected_at_checkout_cents,
      collected_cash_cents = EXCLUDED.collected_cash_cents,
      collected_check_cents = EXCLUDED.collected_check_cents,
      collected_card_cents = EXCLUDED.collected_card_cents,
      collected_hsa_fsa_cents = EXCLUDED.collected_hsa_fsa_cents,
      payment_plans_created = EXCLUDED.payment_plans_created,
      payment_plans_amount_cents = EXCLUDED.payment_plans_amount_cents,
      collection_rate = EXCLUDED.collection_rate,
      updated_at = NOW();
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update payment plan remaining balance
CREATE OR REPLACE FUNCTION update_payment_plan_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE payment_plans
    SET
      remaining_amount_cents = remaining_amount_cents - NEW.amount_cents,
      payments_made = payments_made + 1,
      next_due_date = (
        SELECT MIN(due_date)
        FROM payment_plan_payments
        WHERE payment_plan_id = NEW.payment_plan_id AND status = 'pending'
      ),
      status = CASE
        WHEN remaining_amount_cents - NEW.amount_cents <= 0 THEN 'completed'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = NEW.payment_plan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_payment_plan_on_payment ON payment_plan_payments;
CREATE TRIGGER trg_update_payment_plan_on_payment
  AFTER UPDATE ON payment_plan_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_plan_on_payment();

-- Trigger to set default card
CREATE OR REPLACE FUNCTION manage_default_card()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE AND NEW.is_valid = TRUE THEN
    -- Unset other default cards for this patient
    UPDATE card_on_file
    SET is_default = FALSE, updated_at = NOW()
    WHERE patient_id = NEW.patient_id
      AND id != NEW.id
      AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manage_default_card ON card_on_file;
CREATE TRIGGER trg_manage_default_card
  AFTER INSERT OR UPDATE OF is_default ON card_on_file
  FOR EACH ROW
  WHEN (NEW.is_default = TRUE)
  EXECUTE FUNCTION manage_default_card();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default copay amounts for common payers (example data)
-- This would typically be managed through admin UI
INSERT INTO copay_amounts (tenant_id, payer_id, payer_name, visit_type, copay_amount_cents, source, effective_date)
SELECT
  t.id,
  payer.payer_id,
  payer.payer_name,
  visit.visit_type,
  payer.copay_cents,
  'default',
  '2024-01-01'
FROM tenants t
CROSS JOIN (
  VALUES
    ('BCBS', 'Blue Cross Blue Shield', 4000),
    ('AETNA', 'Aetna', 3500),
    ('CIGNA', 'Cigna', 4500),
    ('UHC', 'United Healthcare', 4000),
    ('HUMANA', 'Humana', 3000)
) as payer(payer_id, payer_name, copay_cents)
CROSS JOIN (
  VALUES
    ('established_patient'),
    ('new_patient'),
    ('specialist'),
    ('telehealth')
) as visit(visit_type)
ON CONFLICT (tenant_id, payer_id, visit_type, effective_date) DO NOTHING;

-- Update new_patient copays to be slightly higher
UPDATE copay_amounts
SET copay_amount_cents = copay_amount_cents + 1000
WHERE visit_type = 'new_patient';

-- Update specialist copays to be higher
UPDATE copay_amounts
SET copay_amount_cents = copay_amount_cents + 500
WHERE visit_type = 'specialist';

COMMENT ON TABLE copay_amounts IS 'Stores copay amounts by payer and visit type for collection prompts';
COMMENT ON TABLE collection_prompts IS 'Tracks collection prompts shown at various collection points';
COMMENT ON TABLE payment_plans IS 'Patient payment plan arrangements';
COMMENT ON TABLE card_on_file IS 'Securely stores payment card references for auto-charge';
COMMENT ON TABLE daily_collection_summary IS 'Daily aggregated collection metrics for reporting';
