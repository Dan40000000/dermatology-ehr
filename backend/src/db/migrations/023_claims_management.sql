-- Migration: Claims Management with Denial Prevention
-- Description: Enhanced claims management system for dermatology with scrubbing and denial prevention

-- Drop existing claims table and recreate with enhanced fields
DROP TABLE IF EXISTS claim_payments CASCADE;
DROP TABLE IF EXISTS claim_status_history CASCADE;
DROP TABLE IF EXISTS claims CASCADE;

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT,

  -- Claim details
  claim_number TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  -- Status: draft, scrubbed, ready, submitted, accepted, denied, paid, appealed

  -- Dates
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at TIMESTAMPTZ,
  adjudicated_at TIMESTAMPTZ,

  -- Charges
  total_charges DECIMAL(10, 2),
  allowed_amount DECIMAL(10, 2),
  paid_amount DECIMAL(10, 2),
  patient_responsibility DECIMAL(10, 2),
  adjustment_amount DECIMAL(10, 2),

  -- Payer
  payer_id TEXT,
  payer_name TEXT,
  payer TEXT, -- Keep for backwards compatibility

  -- Billing codes (stored as JSONB array)
  line_items JSONB DEFAULT '[]'::jsonb,
  -- Format: [{cpt: "11100", modifiers: ["25"], dx: ["L98.9"], units: 1, charge: 150.00}]

  -- Scrub results
  scrub_status TEXT, -- clean, warnings, errors
  scrub_errors JSONB DEFAULT '[]'::jsonb,
  scrub_warnings JSONB DEFAULT '[]'::jsonb,
  scrub_info JSONB DEFAULT '[]'::jsonb,
  last_scrubbed_at TIMESTAMPTZ,

  -- Denial info
  denial_reason TEXT,
  denial_code TEXT,
  denial_date DATE,
  denial_category TEXT, -- cosmetic_vs_medical, modifier_issue, prior_auth, documentation, duplicate

  -- Appeal
  appeal_status TEXT, -- pending, submitted, approved, denied
  appeal_submitted_at TIMESTAMPTZ,
  appeal_decision TEXT,
  appeal_decision_date DATE,
  appeal_notes TEXT,

  -- Classification
  is_cosmetic BOOLEAN DEFAULT FALSE,
  cosmetic_reason TEXT,

  -- Audit fields (compatibility)
  total_cents INTEGER GENERATED ALWAYS AS (CAST(total_charges * 100 AS INTEGER)) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Claim status history
CREATE TABLE claim_status_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claim payments
CREATE TABLE claim_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT,
  payer TEXT,
  check_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- Claim scrub rules
CREATE TABLE claim_scrub_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL = global rule
  rule_code TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL, -- error, warning, info
  rule_logic JSONB NOT NULL,
  -- Format: {
  --   type: "missing_modifier",
  --   conditions: {cpt: "99213", with_cpt: ["11100", "11101"], missing_modifier: "25"},
  --   suggestion: "Add modifier 25 to E/M code when billed with procedure"
  -- }
  is_active BOOLEAN DEFAULT TRUE,
  specialty TEXT DEFAULT 'dermatology',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modifier suggestions
CREATE TABLE modifier_rules (
  id TEXT PRIMARY KEY,
  modifier_code TEXT NOT NULL,
  modifier_name TEXT NOT NULL,
  description TEXT,
  when_to_use TEXT,
  specialty TEXT DEFAULT 'dermatology',
  rule_logic JSONB,
  -- Format: {
  --   applies_when: {cpt_pattern: "992*", with_procedure: true},
  --   required: false
  -- }
  examples JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Denial tracking
CREATE TABLE denial_reasons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  reason_code TEXT NOT NULL,
  reason_description TEXT NOT NULL,
  category TEXT, -- cosmetic_vs_medical, modifier_issue, prior_auth, documentation, duplicate
  payer_name TEXT,
  suggested_action TEXT,
  resolution_steps JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_claims_tenant ON claims(tenant_id);
CREATE INDEX idx_claims_patient ON claims(patient_id);
CREATE INDEX idx_claims_encounter ON claims(encounter_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_service_date ON claims(service_date DESC);
CREATE INDEX idx_claims_scrub_status ON claims(scrub_status);
CREATE INDEX idx_claims_is_cosmetic ON claims(is_cosmetic);
CREATE INDEX idx_claims_denial_date ON claims(denial_date DESC);
CREATE INDEX idx_claims_payer ON claims(payer_id);

CREATE INDEX idx_claim_status_history_claim ON claim_status_history(claim_id);
CREATE INDEX idx_claim_status_history_tenant ON claim_status_history(tenant_id);

CREATE INDEX idx_claim_payments_claim ON claim_payments(claim_id);
CREATE INDEX idx_claim_payments_tenant ON claim_payments(tenant_id);
CREATE INDEX idx_claim_payments_date ON claim_payments(payment_date DESC);

CREATE INDEX idx_scrub_rules_active ON claim_scrub_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_scrub_rules_severity ON claim_scrub_rules(severity);

CREATE INDEX idx_modifier_rules_active ON modifier_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_modifier_rules_modifier ON modifier_rules(modifier_code);

CREATE INDEX idx_denial_reasons_category ON denial_reasons(category);
CREATE INDEX idx_denial_reasons_payer ON denial_reasons(payer_name);

-- Seed common scrub rules
INSERT INTO claim_scrub_rules (id, rule_code, rule_name, description, severity, rule_logic, specialty) VALUES
  ('rule_001', 'modifier_25_em_procedure', 'Modifier 25 Required: E/M with Procedure',
   'When an E/M service is billed on the same day as a procedure, modifier 25 must be added to the E/M code',
   'error',
   '{"type": "missing_modifier", "conditions": {"cpt_pattern": "992*", "with_cpt_type": "procedure", "missing_modifier": "25"}, "auto_fix": true, "suggestion": "Add modifier 25 to E/M code"}',
   'dermatology'),

  ('rule_002', 'modifier_59_distinct_procedure', 'Modifier 59 Required: Distinct Procedures',
   'Multiple procedures at different anatomical sites require modifier 59',
   'error',
   '{"type": "missing_modifier", "conditions": {"multiple_procedures": true, "different_sites": true, "missing_modifier": "59"}, "suggestion": "Add modifier 59 to subsequent procedure codes"}',
   'dermatology'),

  ('rule_003', 'cosmetic_botox', 'Potential Cosmetic: Botox',
   'Botox (J0585) is often denied as cosmetic. Verify medical necessity is documented',
   'warning',
   '{"type": "cosmetic_check", "conditions": {"cpt_or_hcpcs": ["J0585", "64612", "64615"]}, "suggestion": "Verify medical necessity documented (hyperhidrosis, migraine, blepharospasm)"}',
   'dermatology'),

  ('rule_004', 'cosmetic_procedure_check', 'Potential Cosmetic Procedure',
   'This procedure may be considered cosmetic by insurance',
   'warning',
   '{"type": "cosmetic_check", "conditions": {"cpt": ["15780", "15781", "15782", "15783", "15786", "15787", "15788", "15789", "17999"]}, "suggestion": "Verify medical necessity or mark as patient responsibility"}',
   'dermatology'),

  ('rule_005', 'prior_auth_biologic', 'Prior Authorization Required: Biologics',
   'Biologic medications require prior authorization',
   'error',
   '{"type": "prior_auth_check", "conditions": {"hcpcs_pattern": "J*", "drug_class": "biologic"}, "suggestion": "Verify prior authorization is on file"}',
   'dermatology'),

  ('rule_006', 'dx_supports_procedure', 'Diagnosis Must Support Procedure',
   'The diagnosis code must medically justify the procedure',
   'error',
   '{"type": "medical_necessity", "conditions": {"check_dx_cpt_match": true}, "suggestion": "Ensure diagnosis codes support medical necessity"}',
   'dermatology'),

  ('rule_007', 'duplicate_claim_check', 'Duplicate Claim Detection',
   'Claim with same patient, date, and procedures may be duplicate',
   'warning',
   '{"type": "duplicate_check", "conditions": {"check_same_patient_date_cpt": true}, "suggestion": "Verify this is not a duplicate submission"}',
   'dermatology'),

  ('rule_008', 'missing_documentation', 'Documentation Required',
   'Certain procedures require supporting documentation',
   'warning',
   '{"type": "documentation_check", "conditions": {"cpt": ["11100", "11101", "17000", "17110"]}, "suggestion": "Ensure pathology report, photos, or body diagram are attached"}',
   'dermatology');

-- Seed common modifiers
INSERT INTO modifier_rules (id, modifier_code, modifier_name, description, when_to_use, specialty, examples) VALUES
  ('mod_25', '25', 'Significant, Separately Identifiable E/M',
   'Indicates that the E/M service is significant and separately identifiable from the procedure',
   'Use when billing an E/M visit (99202-99215) on the same day as a procedure. The E/M must be above and beyond the usual pre/post-operative work.',
   'dermatology',
   '[{"scenario": "Patient presents for acne follow-up (E/M), provider also performs biopsy of suspicious lesion", "codes": "99213-25, 11100"}]'),

  ('mod_59', '59', 'Distinct Procedural Service',
   'Indicates that a procedure is distinct or independent from other services',
   'Use for multiple biopsies at different anatomical sites, or procedures performed in different sessions on the same day',
   'dermatology',
   '[{"scenario": "Biopsy of lesion on arm and separate lesion on leg", "codes": "11100, 11101-59"}]'),

  ('mod_76', '76', 'Repeat Procedure by Same Physician',
   'Indicates that a procedure was repeated by the same physician',
   'Use when the exact same procedure is performed again on the same day by the same provider',
   'dermatology',
   '[{"scenario": "Second cryotherapy session same day for additional lesions", "codes": "17110, 17110-76"}]'),

  ('mod_77', '77', 'Repeat Procedure by Different Physician',
   'Indicates that a procedure was repeated by a different physician',
   'Use when the exact same procedure is performed again on the same day by a different provider',
   'dermatology',
   '[{"scenario": "Biopsy repeated by covering physician", "codes": "11100-77"}]'),

  ('mod_xe', 'XE', 'Separate Encounter',
   'Indicates service was performed during separate encounter on same date',
   'Subset of 59 - use when procedures are performed in completely separate patient encounters on the same day',
   'dermatology',
   '[{"scenario": "Morning visit for procedure, patient returns for separate urgent issue", "codes": "99213-XE"}]'),

  ('mod_xs', 'XS', 'Separate Structure',
   'Indicates service performed on separate organ/structure',
   'Subset of 59 - use for procedures on distinct anatomical structures',
   'dermatology',
   '[{"scenario": "Lesion destruction on right arm and left leg", "codes": "17000, 17000-XS"}]'),

  ('mod_xp', 'XP', 'Separate Practitioner',
   'Indicates service performed by different practitioner',
   'Subset of 59 - use when different providers perform separate procedures same day',
   'dermatology',
   '[{"scenario": "Two providers working together on complex excision", "codes": "11604, 12032-XP"}]'),

  ('mod_xu', 'XU', 'Unusual Non-Overlapping Service',
   'Indicates service that does not overlap with other services',
   'Subset of 59 - use for distinctly different services that do not fit XE, XS, or XP',
   'dermatology',
   '[{"scenario": "Unusual combination of services", "codes": "17000, 96372-XU"}]');

-- Seed common denial reasons
INSERT INTO denial_reasons (id, reason_code, reason_description, category, suggested_action, resolution_steps) VALUES
  ('den_001', 'COSMETIC', 'Service deemed cosmetic/not medically necessary', 'cosmetic_vs_medical',
   'Appeal with medical necessity documentation or write-off',
   '["Gather clinical notes showing medical necessity", "Obtain photos showing functional impairment", "Submit appeal with supporting documentation", "If truly cosmetic, write off and collect from patient"]'),

  ('den_002', 'MOD_MISSING', 'Required modifier missing', 'modifier_issue',
   'Correct claim and resubmit',
   '["Add appropriate modifier", "Resubmit corrected claim", "No appeal needed"]'),

  ('den_003', 'NO_AUTH', 'Prior authorization not obtained', 'prior_auth',
   'Attempt retroactive auth or write-off',
   '["Request retroactive authorization", "Provide clinical justification", "If denied, may need to write off"]'),

  ('den_004', 'INSUFFICIENT_DOC', 'Insufficient documentation', 'documentation',
   'Submit additional documentation',
   '["Gather operative notes, pathology reports", "Submit additional documentation", "Include body diagram or photos if applicable"]'),

  ('den_005', 'DUPLICATE', 'Duplicate claim', 'duplicate',
   'Verify not duplicate, or void if it is',
   '["Check if truly duplicate", "If duplicate, void the claim", "If not, submit proof of separate service"]');

-- Comments
COMMENT ON TABLE claims IS 'Enhanced claims management with denial prevention for dermatology';
COMMENT ON COLUMN claims.scrub_status IS 'Result of claim scrubber: clean (no issues), warnings (review recommended), errors (must fix)';
COMMENT ON COLUMN claims.line_items IS 'JSONB array of billing line items with CPT, modifiers, diagnosis pointers';
COMMENT ON TABLE claim_scrub_rules IS 'Automated claim validation rules specific to dermatology billing';
COMMENT ON TABLE modifier_rules IS 'Guide for when to apply modifiers to dermatology procedures';
