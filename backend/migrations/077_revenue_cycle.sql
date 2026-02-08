-- ============================================================================
-- Revenue Cycle Optimization System
-- Charge capture, denial management, payment plans, underpayment detection
-- ============================================================================

-- Charge Captures - Document services for billing
CREATE TABLE IF NOT EXISTS charge_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID,
  cpt_codes JSONB NOT NULL DEFAULT '[]', -- Array of {code, description, modifiers[], units}
  icd_codes JSONB NOT NULL DEFAULT '[]', -- Array of {code, description, is_primary}
  charges JSONB NOT NULL DEFAULT '[]', -- Array of {cpt_code, units, fee_cents, total_cents}
  total_cents BIGINT DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, validated, submitted, posted, error
  validation_errors JSONB, -- Array of validation error messages
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_by UUID,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  submitted_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charge_captures_tenant ON charge_captures(tenant_id);
CREATE INDEX idx_charge_captures_encounter ON charge_captures(encounter_id);
CREATE INDEX idx_charge_captures_patient ON charge_captures(patient_id);
CREATE INDEX idx_charge_captures_status ON charge_captures(status);
CREATE INDEX idx_charge_captures_captured_at ON charge_captures(captured_at);

-- Claim Denials - Track and categorize denials
CREATE TABLE IF NOT EXISTS claim_denials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  claim_id UUID NOT NULL,
  patient_id UUID,
  payer_id VARCHAR(255),
  payer_name VARCHAR(255),
  denial_code VARCHAR(50) NOT NULL,
  denial_reason TEXT NOT NULL,
  denial_category VARCHAR(50) NOT NULL, -- ELIGIBILITY, AUTHORIZATION, CODING, DOCUMENTATION, DUPLICATE, TIMELY_FILING
  remark_codes JSONB, -- Array of remark codes
  service_date DATE,
  billed_amount_cents BIGINT,
  allowed_amount_cents BIGINT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  recovery_likelihood VARCHAR(20) DEFAULT 'medium', -- low, medium, high
  appeal_status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, approved, denied, written_off
  appeal_deadline DATE,
  assigned_to UUID,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  root_cause TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_denials_tenant ON claim_denials(tenant_id);
CREATE INDEX idx_claim_denials_claim ON claim_denials(claim_id);
CREATE INDEX idx_claim_denials_patient ON claim_denials(patient_id);
CREATE INDEX idx_claim_denials_category ON claim_denials(denial_category);
CREATE INDEX idx_claim_denials_status ON claim_denials(appeal_status);
CREATE INDEX idx_claim_denials_deadline ON claim_denials(appeal_deadline);
CREATE INDEX idx_claim_denials_created ON claim_denials(created_at);
CREATE INDEX idx_claim_denials_recovery ON claim_denials(recovery_likelihood);

-- Claim Appeals - Track appeal submissions and responses
CREATE TABLE IF NOT EXISTS claim_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  denial_id UUID NOT NULL REFERENCES claim_denials(id) ON DELETE CASCADE,
  appeal_level INTEGER NOT NULL DEFAULT 1, -- 1st level, 2nd level, external review
  appeal_type VARCHAR(50) NOT NULL, -- written, peer_to_peer, external_review
  appeal_letter TEXT,
  appeal_template_used VARCHAR(255),
  supporting_docs JSONB, -- Array of {doc_id, doc_type, description}
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  submission_method VARCHAR(50), -- fax, mail, portal, electronic
  tracking_number VARCHAR(100),
  expected_response_date DATE,
  response TEXT,
  response_received_at TIMESTAMPTZ,
  outcome VARCHAR(50), -- pending, approved, partially_approved, denied, escalated
  approved_amount_cents BIGINT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_appeals_tenant ON claim_appeals(tenant_id);
CREATE INDEX idx_claim_appeals_denial ON claim_appeals(denial_id);
CREATE INDEX idx_claim_appeals_outcome ON claim_appeals(outcome);
CREATE INDEX idx_claim_appeals_submitted ON claim_appeals(submitted_at);

-- Payment Plans - Patient payment arrangements
CREATE TABLE IF NOT EXISTS payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  plan_number VARCHAR(100),
  total_amount_cents BIGINT NOT NULL,
  remaining_amount_cents BIGINT NOT NULL,
  monthly_amount_cents BIGINT NOT NULL,
  down_payment_cents BIGINT DEFAULT 0,
  interest_rate DECIMAL(5, 2) DEFAULT 0, -- Annual interest rate percentage
  number_of_payments INTEGER NOT NULL,
  payments_made INTEGER DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE,
  next_payment_date DATE,
  payment_day_of_month INTEGER, -- Day of month for recurring payments
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- pending, active, completed, defaulted, cancelled
  autopay_enabled BOOLEAN DEFAULT FALSE,
  autopay_payment_method_id UUID,
  associated_encounters JSONB, -- Array of encounter_ids
  associated_claims JSONB, -- Array of claim_ids
  terms_accepted_at TIMESTAMPTZ,
  terms_accepted_ip VARCHAR(45),
  default_count INTEGER DEFAULT 0, -- Number of missed payments
  last_payment_date DATE,
  last_payment_amount_cents BIGINT,
  reminder_enabled BOOLEAN DEFAULT TRUE,
  reminder_days_before INTEGER DEFAULT 3,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_plans_tenant ON payment_plans(tenant_id);
CREATE INDEX idx_payment_plans_patient ON payment_plans(patient_id);
CREATE INDEX idx_payment_plans_status ON payment_plans(status);
CREATE INDEX idx_payment_plans_next_payment ON payment_plans(next_payment_date);
CREATE INDEX idx_payment_plans_plan_number ON payment_plans(plan_number);

-- Payment Plan Transactions - Individual payments within a plan
CREATE TABLE IF NOT EXISTS payment_plan_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  payment_number INTEGER NOT NULL, -- Sequential payment number
  scheduled_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  principal_cents BIGINT, -- Principal portion
  interest_cents BIGINT DEFAULT 0, -- Interest portion
  payment_date DATE,
  actual_amount_cents BIGINT,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, processing, completed, failed, skipped, waived
  payment_method VARCHAR(50), -- card, ach, check, cash
  payment_method_last_four VARCHAR(4),
  transaction_reference VARCHAR(255),
  processor_response JSONB,
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  notes TEXT,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ppt_tenant ON payment_plan_transactions(tenant_id);
CREATE INDEX idx_ppt_plan ON payment_plan_transactions(plan_id);
CREATE INDEX idx_ppt_scheduled_date ON payment_plan_transactions(scheduled_date);
CREATE INDEX idx_ppt_status ON payment_plan_transactions(status);
CREATE INDEX idx_ppt_payment_date ON payment_plan_transactions(payment_date);

-- Underpayments - Track payer underpayments vs contract
CREATE TABLE IF NOT EXISTS underpayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  claim_id UUID NOT NULL,
  era_id UUID, -- Reference to remittance_advice
  payer_id VARCHAR(255),
  payer_name VARCHAR(255),
  contract_id UUID, -- Reference to payer_contracts
  cpt_code VARCHAR(20),
  service_date DATE,
  units INTEGER DEFAULT 1,
  expected_amount_cents BIGINT NOT NULL,
  paid_amount_cents BIGINT NOT NULL,
  variance_cents BIGINT NOT NULL,
  variance_percentage DECIMAL(5, 2),
  adjustment_codes JSONB, -- Payer adjustment codes
  status VARCHAR(50) NOT NULL DEFAULT 'identified', -- identified, under_review, appealed, recovered, written_off, valid
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high
  assigned_to UUID,
  review_notes TEXT,
  recovery_action VARCHAR(100), -- appeal, provider_adjustment, payer_correction, write_off
  recovered_amount_cents BIGINT DEFAULT 0,
  identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_underpayments_tenant ON underpayments(tenant_id);
CREATE INDEX idx_underpayments_claim ON underpayments(claim_id);
CREATE INDEX idx_underpayments_payer ON underpayments(payer_id);
CREATE INDEX idx_underpayments_status ON underpayments(status);
CREATE INDEX idx_underpayments_identified ON underpayments(identified_at);
CREATE INDEX idx_underpayments_variance ON underpayments(variance_cents);

-- Payer Contracts - Fee schedules and contract terms by payer
CREATE TABLE IF NOT EXISTS payer_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  payer_id VARCHAR(255) NOT NULL,
  payer_name VARCHAR(255) NOT NULL,
  contract_number VARCHAR(100),
  contract_type VARCHAR(50), -- fee_for_service, capitation, percentage_of_charges, case_rate
  fee_schedule JSONB NOT NULL DEFAULT '{}', -- {cpt_code: {allowed_cents, effective_date, expiration_date}}
  base_rate_percentage DECIMAL(5, 2), -- For percentage-of-charges contracts
  fee_schedule_version VARCHAR(50),
  effective_date DATE NOT NULL,
  expiration_date DATE,
  termination_notice_days INTEGER DEFAULT 90,
  auto_renew BOOLEAN DEFAULT FALSE,
  billing_npi VARCHAR(20),
  tax_id VARCHAR(20),
  credentialing_required BOOLEAN DEFAULT TRUE,
  timely_filing_days INTEGER DEFAULT 90,
  appeal_filing_days INTEGER DEFAULT 60,
  contract_terms JSONB, -- Additional contract terms
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  provider_representative VARCHAR(255),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active', -- pending, active, expiring, expired, terminated
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payer_contracts_tenant ON payer_contracts(tenant_id);
CREATE INDEX idx_payer_contracts_payer ON payer_contracts(payer_id);
CREATE INDEX idx_payer_contracts_status ON payer_contracts(status);
CREATE INDEX idx_payer_contracts_effective ON payer_contracts(effective_date);
CREATE INDEX idx_payer_contracts_expiration ON payer_contracts(expiration_date);

-- Appeal Templates - Reusable appeal letter templates
CREATE TABLE IF NOT EXISTS appeal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  denial_category VARCHAR(50), -- Which denial category this template is for
  template_content TEXT NOT NULL,
  template_variables JSONB, -- Available variables for merge
  instructions TEXT,
  success_rate DECIMAL(5, 2), -- Historical success rate
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appeal_templates_tenant ON appeal_templates(tenant_id);
CREATE INDEX idx_appeal_templates_category ON appeal_templates(denial_category);

-- Revenue Cycle Metrics - Daily/weekly/monthly KPIs
CREATE TABLE IF NOT EXISTS revenue_cycle_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  metric_date DATE NOT NULL,
  metric_period VARCHAR(20) NOT NULL, -- day, week, month

  -- A/R metrics
  total_ar_cents BIGINT DEFAULT 0,
  ar_current_cents BIGINT DEFAULT 0,
  ar_31_60_cents BIGINT DEFAULT 0,
  ar_61_90_cents BIGINT DEFAULT 0,
  ar_91_120_cents BIGINT DEFAULT 0,
  ar_over_120_cents BIGINT DEFAULT 0,
  days_in_ar DECIMAL(6, 2),

  -- Charge metrics
  gross_charges_cents BIGINT DEFAULT 0,
  net_charges_cents BIGINT DEFAULT 0,
  charge_count INTEGER DEFAULT 0,

  -- Collection metrics
  total_payments_cents BIGINT DEFAULT 0,
  insurance_payments_cents BIGINT DEFAULT 0,
  patient_payments_cents BIGINT DEFAULT 0,

  -- Adjustment metrics
  contractual_adjustments_cents BIGINT DEFAULT 0,
  write_offs_cents BIGINT DEFAULT 0,
  bad_debt_cents BIGINT DEFAULT 0,

  -- Denial metrics
  denial_count INTEGER DEFAULT 0,
  denial_amount_cents BIGINT DEFAULT 0,
  denial_rate DECIMAL(5, 2), -- As percentage
  appeal_count INTEGER DEFAULT 0,
  appeal_success_count INTEGER DEFAULT 0,
  appeal_success_rate DECIMAL(5, 2),

  -- Underpayment metrics
  underpayment_count INTEGER DEFAULT 0,
  underpayment_amount_cents BIGINT DEFAULT 0,
  underpayment_recovered_cents BIGINT DEFAULT 0,

  -- Payment plan metrics
  active_payment_plans INTEGER DEFAULT 0,
  payment_plan_balance_cents BIGINT DEFAULT 0,
  payment_plan_collections_cents BIGINT DEFAULT 0,
  payment_plan_default_count INTEGER DEFAULT 0,

  -- Clean claim rate
  clean_claim_rate DECIMAL(5, 2),
  first_pass_resolution_rate DECIMAL(5, 2),

  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_rcm_metrics_unique ON revenue_cycle_metrics(tenant_id, metric_date, metric_period);
CREATE INDEX idx_rcm_metrics_tenant ON revenue_cycle_metrics(tenant_id);
CREATE INDEX idx_rcm_metrics_date ON revenue_cycle_metrics(metric_date);

-- Collection Escalation Rules - Automated collection workflow
CREATE TABLE IF NOT EXISTS collection_escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  days_past_due INTEGER NOT NULL,
  min_balance_cents BIGINT DEFAULT 0,
  action_type VARCHAR(50) NOT NULL, -- statement, sms, email, call, collection_agency
  action_config JSONB, -- Template IDs, message content, etc.
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalation_rules_tenant ON collection_escalation_rules(tenant_id);
CREATE INDEX idx_escalation_rules_days ON collection_escalation_rules(days_past_due);

-- Collection Actions Log - Track collection activities
CREATE TABLE IF NOT EXISTS collection_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  balance_cents BIGINT,
  days_past_due INTEGER,
  action_type VARCHAR(50) NOT NULL,
  action_details JSONB,
  rule_id UUID REFERENCES collection_escalation_rules(id),
  result VARCHAR(50), -- sent, delivered, failed, responded
  response_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collection_actions_tenant ON collection_actions_log(tenant_id);
CREATE INDEX idx_collection_actions_patient ON collection_actions_log(patient_id);
CREATE INDEX idx_collection_actions_created ON collection_actions_log(created_at);

-- Triggers for updated_at
CREATE TRIGGER charge_captures_updated_at
  BEFORE UPDATE ON charge_captures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER claim_denials_updated_at
  BEFORE UPDATE ON claim_denials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER claim_appeals_updated_at
  BEFORE UPDATE ON claim_appeals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_plans_updated_at
  BEFORE UPDATE ON payment_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_plan_transactions_updated_at
  BEFORE UPDATE ON payment_plan_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER underpayments_updated_at
  BEFORE UPDATE ON underpayments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payer_contracts_updated_at
  BEFORE UPDATE ON payer_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER appeal_templates_updated_at
  BEFORE UPDATE ON appeal_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER collection_escalation_rules_updated_at
  BEFORE UPDATE ON collection_escalation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed denial categories reference (for documentation)
COMMENT ON TABLE claim_denials IS 'Denial categories: ELIGIBILITY - Patient not covered/inactive; AUTHORIZATION - Prior auth required/not obtained; CODING - Invalid/incorrect codes; DOCUMENTATION - Missing/insufficient documentation; DUPLICATE - Claim already processed; TIMELY_FILING - Submission deadline missed';

-- Insert default appeal templates
INSERT INTO appeal_templates (tenant_id, name, denial_category, template_content, template_variables, instructions) VALUES
('default', 'Medical Necessity Appeal', 'DOCUMENTATION',
'Dear [PAYER_NAME] Appeals Department,

Re: Appeal for Claim [CLAIM_NUMBER]
Patient: [PATIENT_NAME]
Member ID: [MEMBER_ID]
Date of Service: [SERVICE_DATE]

I am writing to appeal the denial of the above-referenced claim for [CPT_CODE] ([CPT_DESCRIPTION]).

The service was medically necessary because:
[MEDICAL_NECESSITY_REASON]

Enclosed please find supporting documentation including:
- Relevant clinical notes
- Peer-reviewed literature supporting medical necessity
- [ADDITIONAL_DOCS]

Based on the above, I respectfully request that you reconsider the denial and approve payment for this medically necessary service.

Sincerely,
[PROVIDER_NAME], [PROVIDER_CREDENTIALS]
[PRACTICE_NAME]
NPI: [PROVIDER_NPI]',
'["PAYER_NAME", "CLAIM_NUMBER", "PATIENT_NAME", "MEMBER_ID", "SERVICE_DATE", "CPT_CODE", "CPT_DESCRIPTION", "MEDICAL_NECESSITY_REASON", "ADDITIONAL_DOCS", "PROVIDER_NAME", "PROVIDER_CREDENTIALS", "PRACTICE_NAME", "PROVIDER_NPI"]',
'Use for medical necessity denials. Include relevant clinical documentation and any peer-reviewed literature supporting the service.'),

('default', 'Prior Authorization Appeal', 'AUTHORIZATION',
'Dear [PAYER_NAME] Appeals Department,

Re: Appeal for Claim [CLAIM_NUMBER] - Prior Authorization Denial
Patient: [PATIENT_NAME]
Member ID: [MEMBER_ID]
Date of Service: [SERVICE_DATE]

This letter appeals the denial of the above-referenced claim denied for prior authorization requirements.

[SELECT_APPROPRIATE]:
- Prior authorization was obtained: Authorization #[AUTH_NUMBER] dated [AUTH_DATE]
- Prior authorization was not required per your policy guidelines for this service
- This was an urgent/emergent service where prior authorization could not be obtained

[ADDITIONAL_EXPLANATION]

Please find enclosed supporting documentation. I request reconsideration of this denial.

Sincerely,
[PROVIDER_NAME], [PROVIDER_CREDENTIALS]
[PRACTICE_NAME]',
'["PAYER_NAME", "CLAIM_NUMBER", "PATIENT_NAME", "MEMBER_ID", "SERVICE_DATE", "AUTH_NUMBER", "AUTH_DATE", "ADDITIONAL_EXPLANATION", "PROVIDER_NAME", "PROVIDER_CREDENTIALS", "PRACTICE_NAME"]',
'Use for authorization-related denials. Include copy of prior auth if obtained.'),

('default', 'Coding Correction Appeal', 'CODING',
'Dear [PAYER_NAME] Appeals Department,

Re: Appeal for Claim [CLAIM_NUMBER] - Coding Denial
Patient: [PATIENT_NAME]
Member ID: [MEMBER_ID]
Date of Service: [SERVICE_DATE]

I am writing to appeal the denial of the above claim denied for coding reason: [DENIAL_REASON].

[SELECT_APPROPRIATE]:
- The original coding was correct and supported by documentation. [EXPLANATION]
- We are submitting a corrected claim with code [CORRECTED_CODE] which accurately reflects the service provided.

The service performed was: [SERVICE_DESCRIPTION]

Please find enclosed operative notes/clinical documentation supporting this coding.

Sincerely,
[PROVIDER_NAME], [PROVIDER_CREDENTIALS]
[PRACTICE_NAME]',
'["PAYER_NAME", "CLAIM_NUMBER", "PATIENT_NAME", "MEMBER_ID", "SERVICE_DATE", "DENIAL_REASON", "EXPLANATION", "CORRECTED_CODE", "SERVICE_DESCRIPTION", "PROVIDER_NAME", "PROVIDER_CREDENTIALS", "PRACTICE_NAME"]',
'Use for coding denials. Review documentation to ensure correct code before appealing.');

-- Insert default collection escalation rules
INSERT INTO collection_escalation_rules (tenant_id, rule_name, days_past_due, min_balance_cents, action_type, action_config, priority) VALUES
('default', 'First Statement', 0, 500, 'statement', '{"template": "initial_statement"}', 1),
('default', 'SMS Reminder - 15 Days', 15, 500, 'sms', '{"template": "balance_reminder"}', 2),
('default', 'Second Statement', 30, 500, 'statement', '{"template": "second_statement"}', 3),
('default', 'SMS Reminder - 45 Days', 45, 1000, 'sms', '{"template": "urgent_balance_reminder"}', 4),
('default', 'Phone Call - 60 Days', 60, 2500, 'call', '{"script_template": "collection_call_script"}', 5),
('default', 'Final Notice', 90, 2500, 'statement', '{"template": "final_notice"}', 6),
('default', 'Collection Agency', 120, 10000, 'collection_agency', '{"auto_transfer": false}', 7);
