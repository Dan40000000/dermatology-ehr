-- Allergy Alert System Migration
-- Comprehensive allergy tracking and alert system for dermatology EHR

-- ============================================================================
-- Table: patient_allergies
-- Core table for tracking patient allergies with dermatology-specific focus
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Allergen information
  allergen_type VARCHAR(50) NOT NULL CHECK (
    allergen_type IN ('drug', 'food', 'environmental', 'latex', 'contact')
  ),
  allergen_name VARCHAR(255) NOT NULL,
  rxcui VARCHAR(20), -- RxNorm Concept Unique Identifier for drugs

  -- Reaction details
  reaction_type VARCHAR(100), -- e.g., 'anaphylaxis', 'rash', 'urticaria', 'contact_dermatitis'
  severity VARCHAR(20) NOT NULL DEFAULT 'moderate' CHECK (
    severity IN ('mild', 'moderate', 'severe', 'life_threatening')
  ),
  onset_date DATE,

  -- Verification
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive', 'resolved', 'entered_in_error')
  ),

  -- Additional details
  notes TEXT,
  source VARCHAR(50), -- 'patient_reported', 'chart_review', 'patch_test', 'drug_challenge'

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id),

  -- Constraints
  CONSTRAINT unique_patient_allergen UNIQUE (tenant_id, patient_id, allergen_name, allergen_type)
);

-- Indexes for patient_allergies
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_tenant ON patient_allergies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_status ON patient_allergies(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_patient_allergies_allergen_type ON patient_allergies(allergen_type);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_rxcui ON patient_allergies(rxcui) WHERE rxcui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_severity ON patient_allergies(severity);

-- ============================================================================
-- Table: allergy_reactions
-- Detailed reaction information for each allergy
-- ============================================================================
CREATE TABLE IF NOT EXISTS allergy_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergy_id UUID NOT NULL REFERENCES patient_allergies(id) ON DELETE CASCADE,

  -- Reaction details
  reaction_description TEXT NOT NULL,
  symptoms TEXT[] DEFAULT '{}', -- Array of symptoms
  onset_timing VARCHAR(50), -- 'immediate', 'delayed', 'unknown'
  duration VARCHAR(50),
  treatment_required BOOLEAN DEFAULT false,
  hospitalization_required BOOLEAN DEFAULT false,

  -- Documentation
  documented_date DATE,
  documented_by UUID REFERENCES users(id),

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for allergy_reactions
CREATE INDEX IF NOT EXISTS idx_allergy_reactions_allergy ON allergy_reactions(allergy_id);

-- ============================================================================
-- Table: allergy_cross_reactivity
-- Known cross-reactivity patterns for drug classes
-- ============================================================================
CREATE TABLE IF NOT EXISTS allergy_cross_reactivity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary allergen information
  primary_allergen VARCHAR(255) NOT NULL,
  primary_allergen_rxcui VARCHAR(20),
  primary_drug_class VARCHAR(100),

  -- Cross-reactive allergens
  cross_reactive_allergens TEXT[] NOT NULL DEFAULT '{}',
  cross_reactive_rxcuis TEXT[] DEFAULT '{}',

  -- Cross-reactivity details
  cross_reactivity_type VARCHAR(50) NOT NULL CHECK (
    cross_reactivity_type IN ('drug_class', 'chemical_structure', 'immunologic', 'unknown')
  ),
  cross_reactivity_rate DECIMAL(5,2), -- Percentage of cross-reactivity (e.g., 10.5 for 10.5%)
  clinical_significance VARCHAR(20) CHECK (
    clinical_significance IN ('high', 'moderate', 'low', 'theoretical')
  ),

  -- Evidence and notes
  evidence_level VARCHAR(20), -- 'strong', 'moderate', 'weak', 'anecdotal'
  clinical_notes TEXT,
  recommendations TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_cross_reactivity UNIQUE (primary_allergen, cross_reactivity_type)
);

-- Indexes for allergy_cross_reactivity
CREATE INDEX IF NOT EXISTS idx_cross_reactivity_primary ON allergy_cross_reactivity(primary_allergen);
CREATE INDEX IF NOT EXISTS idx_cross_reactivity_rxcui ON allergy_cross_reactivity(primary_allergen_rxcui)
  WHERE primary_allergen_rxcui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cross_reactivity_drug_class ON allergy_cross_reactivity(primary_drug_class)
  WHERE primary_drug_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cross_reactivity_type ON allergy_cross_reactivity(cross_reactivity_type);

-- ============================================================================
-- Table: allergy_alerts_log
-- Audit log for all allergy alerts displayed and actions taken
-- ============================================================================
CREATE TABLE IF NOT EXISTS allergy_alerts_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Alert information
  alert_type VARCHAR(50) NOT NULL CHECK (
    alert_type IN ('drug_allergy', 'cross_reactivity', 'latex', 'adhesive', 'contact', 'food')
  ),
  trigger_drug VARCHAR(255), -- The drug or product that triggered the alert
  trigger_rxcui VARCHAR(20),

  -- Related allergy
  allergy_id UUID REFERENCES patient_allergies(id) ON DELETE SET NULL,

  -- Alert severity and details
  alert_severity VARCHAR(20) NOT NULL CHECK (
    alert_severity IN ('info', 'warning', 'critical', 'contraindicated')
  ),
  alert_message TEXT,
  cross_reactive_with VARCHAR(255), -- For cross-reactivity alerts

  -- Display context
  displayed_to UUID NOT NULL REFERENCES users(id),
  displayed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  display_context VARCHAR(50), -- 'prescribing', 'procedure_scheduling', 'encounter', 'orders'

  -- Action taken
  action_taken VARCHAR(50) CHECK (
    action_taken IN ('override', 'cancelled', 'changed', 'acknowledged', 'pending')
  ),
  action_at TIMESTAMPTZ,
  action_reason TEXT,
  override_reason TEXT,

  -- Additional metadata
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  prescription_id UUID,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for allergy_alerts_log
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_patient ON allergy_alerts_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_tenant ON allergy_alerts_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_type ON allergy_alerts_log(alert_type);
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_user ON allergy_alerts_log(displayed_to);
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_date ON allergy_alerts_log(displayed_at);
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_action ON allergy_alerts_log(action_taken) WHERE action_taken IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_allergy_alerts_severity ON allergy_alerts_log(alert_severity);

-- ============================================================================
-- Seed data: Common dermatology cross-reactivity patterns
-- ============================================================================
INSERT INTO allergy_cross_reactivity (
  primary_allergen, primary_drug_class, cross_reactive_allergens,
  cross_reactivity_type, cross_reactivity_rate, clinical_significance,
  evidence_level, recommendations
) VALUES
-- Penicillin cross-reactivity with cephalosporins
(
  'penicillin', 'beta_lactam',
  ARRAY['cephalosporin', 'cephalexin', 'cefazolin', 'ceftriaxone', 'cefdinir', 'cefuroxime'],
  'drug_class', 2.0, 'moderate', 'strong',
  'Consider skin testing before use. First-generation cephalosporins have higher cross-reactivity risk. Use with caution or select alternatives.'
),
-- Sulfonamide antibiotics cross-reactivity
(
  'sulfonamide', 'sulfonamide_antibiotic',
  ARRAY['sulfamethoxazole', 'sulfasalazine', 'dapsone', 'sulfadiazine'],
  'drug_class', 10.0, 'high', 'strong',
  'Avoid all sulfonamide antibiotics. Dapsone commonly used in dermatology - requires alternative if patient is allergic.'
),
-- Tetracycline class
(
  'tetracycline', 'tetracycline',
  ARRAY['doxycycline', 'minocycline', 'demeclocycline', 'tigecycline'],
  'drug_class', 80.0, 'high', 'strong',
  'Avoid all tetracycline-class antibiotics. Common acne treatment alternative: erythromycin or trimethoprim.'
),
-- Retinoid class
(
  'isotretinoin', 'retinoid',
  ARRAY['tretinoin', 'adapalene', 'tazarotene', 'acitretin', 'alitretinoin'],
  'chemical_structure', 30.0, 'moderate', 'moderate',
  'Cross-sensitivity possible but not universal. Consider patch test for topical retinoids before use.'
),
-- Neomycin topical antibiotics
(
  'neomycin', 'aminoglycoside_topical',
  ARRAY['bacitracin', 'polymyxin', 'gentamicin topical'],
  'drug_class', 50.0, 'high', 'strong',
  'Common cause of allergic contact dermatitis. Avoid triple antibiotic ointments. Consider mupirocin as alternative.'
),
-- Latex cross-reactivity with foods/plants
(
  'latex', 'latex',
  ARRAY['banana', 'avocado', 'kiwi', 'chestnut', 'papaya', 'fig', 'passion fruit'],
  'immunologic', 35.0, 'moderate', 'moderate',
  'Latex-fruit syndrome. Inform patient of potential food cross-reactivity.'
),
-- Adhesive/tape allergies
(
  'medical_adhesive', 'adhesive',
  ARRAY['surgical tape', 'bandage adhesive', 'electrode adhesive', 'colophony', 'acrylate'],
  'chemical_structure', 60.0, 'moderate', 'moderate',
  'Use silicone-based or hypoallergenic adhesives. Consider paper tape or gauze wrapping.'
),
-- Local anesthetic cross-reactivity (amide vs ester)
(
  'lidocaine', 'amide_anesthetic',
  ARRAY['bupivacaine', 'mepivacaine', 'prilocaine', 'ropivacaine'],
  'drug_class', 5.0, 'low', 'moderate',
  'Cross-reactivity within amide class is rare. Consider ester-type anesthetic (procaine) if true allergy confirmed.'
),
-- NSAID cross-reactivity
(
  'aspirin', 'nsaid',
  ARRAY['ibuprofen', 'naproxen', 'diclofenac', 'ketorolac', 'meloxicam', 'celecoxib'],
  'drug_class', 25.0, 'moderate', 'strong',
  'NSAID-exacerbated respiratory disease may cross-react. COX-2 inhibitors may be better tolerated.'
),
-- Quinolone antibiotics
(
  'ciprofloxacin', 'fluoroquinolone',
  ARRAY['levofloxacin', 'moxifloxacin', 'ofloxacin', 'gemifloxacin'],
  'drug_class', 50.0, 'high', 'strong',
  'Cross-reactivity within fluoroquinolone class is common. Avoid entire class if allergic.'
)
ON CONFLICT (primary_allergen, cross_reactivity_type) DO NOTHING;

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_allergy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_patient_allergies_updated_at ON patient_allergies;
CREATE TRIGGER trigger_patient_allergies_updated_at
  BEFORE UPDATE ON patient_allergies
  FOR EACH ROW
  EXECUTE FUNCTION update_allergy_updated_at();

DROP TRIGGER IF EXISTS trigger_allergy_reactions_updated_at ON allergy_reactions;
CREATE TRIGGER trigger_allergy_reactions_updated_at
  BEFORE UPDATE ON allergy_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_allergy_updated_at();

DROP TRIGGER IF EXISTS trigger_cross_reactivity_updated_at ON allergy_cross_reactivity;
CREATE TRIGGER trigger_cross_reactivity_updated_at
  BEFORE UPDATE ON allergy_cross_reactivity
  FOR EACH ROW
  EXECUTE FUNCTION update_allergy_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE patient_allergies IS 'Core patient allergy records with dermatology-specific allergen types';
COMMENT ON TABLE allergy_reactions IS 'Detailed reaction documentation for each allergy';
COMMENT ON TABLE allergy_cross_reactivity IS 'Known cross-reactivity patterns between drugs and allergens';
COMMENT ON TABLE allergy_alerts_log IS 'Audit trail of allergy alerts displayed and actions taken';

COMMENT ON COLUMN patient_allergies.allergen_type IS 'Type: drug, food, environmental, latex, or contact (from patch testing)';
COMMENT ON COLUMN patient_allergies.rxcui IS 'RxNorm Concept Unique Identifier for standardized drug identification';
COMMENT ON COLUMN patient_allergies.source IS 'How allergy was documented: patient_reported, chart_review, patch_test, drug_challenge';
COMMENT ON COLUMN allergy_cross_reactivity.cross_reactivity_rate IS 'Estimated percentage of patients who cross-react';
COMMENT ON COLUMN allergy_alerts_log.display_context IS 'Where alert was shown: prescribing, procedure_scheduling, encounter, orders';
