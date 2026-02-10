-- Migration: Drug Interaction Checking System
-- Description: Comprehensive drug interaction, allergy cross-reactivity, and safety alert system

-- =============================================================================
-- Drug Database Table
-- =============================================================================
-- Stores comprehensive drug information including NDC codes, RxNorm CUIs, and contraindications
CREATE TABLE IF NOT EXISTS drug_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ndc_code VARCHAR(11), -- National Drug Code (11-digit format)
  rxnorm_cui VARCHAR(10), -- RxNorm Concept Unique Identifier
  drug_name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  brand_names TEXT[], -- Array of brand names
  drug_class VARCHAR(100), -- Therapeutic class
  drug_subclass VARCHAR(100),
  active_ingredients JSONB, -- List of active ingredients with strengths
  dosage_form VARCHAR(100),
  route VARCHAR(50),
  strength VARCHAR(100),
  manufacturer VARCHAR(255),
  dea_schedule VARCHAR(5), -- I, II, III, IV, V, or NULL
  is_controlled BOOLEAN DEFAULT false,
  black_box_warning TEXT,
  contraindications JSONB DEFAULT '[]'::jsonb, -- Array of contraindication objects
  precautions JSONB DEFAULT '[]'::jsonb,
  pregnancy_category VARCHAR(2), -- A, B, C, D, X, N/A
  lactation_risk VARCHAR(50),
  pediatric_use_notes TEXT,
  geriatric_use_notes TEXT,
  renal_dosing_notes TEXT,
  hepatic_dosing_notes TEXT,
  common_side_effects TEXT[],
  serious_adverse_effects TEXT[],
  monitoring_parameters TEXT[],
  storage_conditions TEXT,
  is_dermatology_common BOOLEAN DEFAULT false, -- Flag for commonly used derm drugs
  openfda_data JSONB, -- Cached OpenFDA response data
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for drug_database
CREATE INDEX IF NOT EXISTS idx_drug_database_tenant ON drug_database(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drug_database_ndc ON drug_database(ndc_code);
CREATE INDEX IF NOT EXISTS idx_drug_database_rxnorm ON drug_database(rxnorm_cui);
CREATE INDEX IF NOT EXISTS idx_drug_database_name ON drug_database(drug_name);
CREATE INDEX IF NOT EXISTS idx_drug_database_generic ON drug_database(generic_name);
CREATE INDEX IF NOT EXISTS idx_drug_database_class ON drug_database(drug_class);
CREATE INDEX IF NOT EXISTS idx_drug_database_derm_common ON drug_database(is_dermatology_common) WHERE is_dermatology_common = true;

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_drug_database_search ON drug_database USING gin(
  to_tsvector('english', COALESCE(drug_name, '') || ' ' || COALESCE(generic_name, ''))
);

COMMENT ON TABLE drug_database IS 'Comprehensive drug database for interaction checking and prescribing';
COMMENT ON COLUMN drug_database.ndc_code IS 'National Drug Code - 11-digit identifier';
COMMENT ON COLUMN drug_database.rxnorm_cui IS 'RxNorm Concept Unique Identifier for cross-referencing';
COMMENT ON COLUMN drug_database.contraindications IS 'JSON array of contraindication conditions';

-- =============================================================================
-- Drug Interactions Table
-- =============================================================================
-- Stores known drug-drug interactions with severity and management recommendations
CREATE TABLE IF NOT EXISTS drug_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug1_rxcui VARCHAR(10) NOT NULL,
  drug1_name VARCHAR(255) NOT NULL,
  drug2_rxcui VARCHAR(10) NOT NULL,
  drug2_name VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('contraindicated', 'major', 'moderate', 'minor')),
  interaction_type VARCHAR(100), -- e.g., 'pharmacokinetic', 'pharmacodynamic'
  mechanism TEXT, -- Mechanism of interaction
  description TEXT NOT NULL,
  clinical_effects TEXT,
  management TEXT,
  onset VARCHAR(50), -- 'immediate', 'delayed', 'varies'
  documentation_level VARCHAR(50), -- 'established', 'theoretical', 'probable'
  source VARCHAR(100), -- 'FDA', 'OpenFDA', 'Clinical Pharmacology', 'Manual'
  source_reference TEXT,
  is_bidirectional BOOLEAN DEFAULT true,
  dermatology_relevance INTEGER DEFAULT 0, -- 0-10 scale
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(drug1_rxcui, drug2_rxcui)
);

-- Indexes for drug_interactions
CREATE INDEX IF NOT EXISTS idx_drug_interactions_drug1 ON drug_interactions(drug1_rxcui);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_drug2 ON drug_interactions(drug2_rxcui);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_severity ON drug_interactions(severity);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_derm_relevance ON drug_interactions(dermatology_relevance DESC);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_names ON drug_interactions(drug1_name, drug2_name);

COMMENT ON TABLE drug_interactions IS 'Drug-drug interaction database with severity classifications';
COMMENT ON COLUMN drug_interactions.severity IS 'Contraindicated (red), Major (orange), Moderate (yellow), Minor (green)';
COMMENT ON COLUMN drug_interactions.dermatology_relevance IS 'Scale 0-10 indicating relevance to dermatology practice';

-- =============================================================================
-- Drug Allergy Classes Table
-- =============================================================================
-- Maps drug classes for cross-reactivity detection
CREATE TABLE IF NOT EXISTS drug_allergy_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergy_class VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'penicillins', 'sulfonamides'
  class_display_name VARCHAR(100) NOT NULL,
  related_drugs TEXT[] NOT NULL, -- Array of related drug names
  related_rxcuis TEXT[], -- Array of related RxCUI values
  cross_reactivity_notes TEXT,
  cross_reactivity_rate DECIMAL(5,2), -- Percentage, e.g., 10.5 for 10.5%
  alternative_suggestions TEXT[],
  parent_class VARCHAR(100), -- For hierarchical relationships
  severity_default VARCHAR(20) DEFAULT 'major',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for drug_allergy_classes
CREATE INDEX IF NOT EXISTS idx_drug_allergy_classes_name ON drug_allergy_classes(allergy_class);
CREATE INDEX IF NOT EXISTS idx_drug_allergy_classes_parent ON drug_allergy_classes(parent_class);
CREATE INDEX IF NOT EXISTS idx_drug_allergy_classes_related_drugs ON drug_allergy_classes USING gin(related_drugs);

COMMENT ON TABLE drug_allergy_classes IS 'Drug class relationships for cross-reactivity allergy checking';
COMMENT ON COLUMN drug_allergy_classes.cross_reactivity_rate IS 'Percentage chance of cross-reactivity between class members';

-- =============================================================================
-- Patient Drug Alerts Table
-- =============================================================================
-- Tracks drug interaction/allergy alerts per patient with acknowledgment
CREATE TABLE IF NOT EXISTS patient_drug_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  drug_rxcui VARCHAR(10),
  drug_name VARCHAR(255) NOT NULL,
  interacting_drug_name VARCHAR(255), -- For interaction alerts
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'drug_interaction',
    'allergy_warning',
    'duplicate_therapy',
    'black_box_warning',
    'contraindication',
    'dose_warning',
    'pregnancy_warning',
    'pediatric_warning',
    'geriatric_warning',
    'renal_warning',
    'hepatic_warning'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('contraindicated', 'major', 'moderate', 'minor', 'info')),
  alert_title VARCHAR(255) NOT NULL,
  alert_message TEXT NOT NULL,
  clinical_significance TEXT,
  recommendation TEXT,
  source_interaction_id UUID REFERENCES drug_interactions(id) ON DELETE SET NULL,
  source_allergy_class_id UUID REFERENCES drug_allergy_classes(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  was_overridden BOOLEAN DEFAULT false,
  override_reason TEXT,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_signature TEXT, -- Digital signature for compliance
  expires_at TIMESTAMPTZ, -- For time-limited alerts
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for patient_drug_alerts
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_tenant_patient ON patient_drug_alerts(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_patient ON patient_drug_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_encounter ON patient_drug_alerts(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_prescription ON patient_drug_alerts(prescription_id);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_active ON patient_drug_alerts(is_active, tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_severity ON patient_drug_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_type ON patient_drug_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_unacknowledged ON patient_drug_alerts(tenant_id, patient_id)
  WHERE is_active = true AND acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_created ON patient_drug_alerts(created_at DESC);

COMMENT ON TABLE patient_drug_alerts IS 'Patient-specific drug safety alerts requiring review and acknowledgment';
COMMENT ON COLUMN patient_drug_alerts.was_overridden IS 'True if provider acknowledged and proceeded despite warning';
COMMENT ON COLUMN patient_drug_alerts.acknowledged_signature IS 'Provider signature for compliance audit trail';

-- =============================================================================
-- Drug Class Mapping Table (for duplicate therapy detection)
-- =============================================================================
CREATE TABLE IF NOT EXISTS drug_class_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxnorm_cui VARCHAR(10),
  drug_name VARCHAR(255) NOT NULL,
  therapeutic_class VARCHAR(100) NOT NULL,
  pharmacologic_class VARCHAR(100),
  mechanism_of_action VARCHAR(255),
  is_dermatology_drug BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drug_class_mapping_rxcui ON drug_class_mapping(rxnorm_cui);
CREATE INDEX IF NOT EXISTS idx_drug_class_mapping_class ON drug_class_mapping(therapeutic_class);
CREATE INDEX IF NOT EXISTS idx_drug_class_mapping_derm ON drug_class_mapping(is_dermatology_drug) WHERE is_dermatology_drug = true;

COMMENT ON TABLE drug_class_mapping IS 'Maps drugs to therapeutic classes for duplicate therapy detection';

-- =============================================================================
-- Seed Data: Common Dermatology Drug Interactions
-- =============================================================================

-- Isotretinoin + Tetracyclines (pseudotumor cerebri risk)
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('6064', 'isotretinoin', '10554', 'doxycycline', 'contraindicated',
   'Concurrent use increases risk of pseudotumor cerebri (idiopathic intracranial hypertension)',
   'Severe headache, papilledema, visual disturbances, increased intracranial pressure, potential permanent vision loss',
   'AVOID combination. If antibiotic needed, use non-tetracycline alternatives such as azithromycin or amoxicillin.',
   10, 'FDA'),
  ('6064', 'isotretinoin', '7407', 'minocycline', 'contraindicated',
   'Concurrent use increases risk of pseudotumor cerebri (idiopathic intracranial hypertension)',
   'Severe headache, visual changes, papilledema, potential permanent vision loss',
   'AVOID combination. Select alternative antibiotic class.',
   10, 'FDA'),
  ('6064', 'isotretinoin', '10660', 'tetracycline', 'contraindicated',
   'Concurrent use increases risk of pseudotumor cerebri',
   'Increased intracranial pressure, severe headache, vision changes',
   'CONTRAINDICATED. Use alternative antibiotic.',
   10, 'FDA'),
  ('6064', 'isotretinoin', '11253', 'vitamin A', 'major',
   'Risk of hypervitaminosis A with additive retinoid toxicity',
   'Hepatotoxicity, bone abnormalities, skin changes, headache',
   'Avoid vitamin A supplements >10,000 IU daily during isotretinoin therapy.',
   10, 'FDA')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Methotrexate interactions
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('6851', 'methotrexate', '10831', 'trimethoprim', 'contraindicated',
   'Trimethoprim inhibits dihydrofolate reductase, potentiating methotrexate toxicity',
   'Severe pancytopenia, myelosuppression, mucositis, potential fatal bone marrow failure',
   'AVOID combination. If antimicrobial needed, select alternatives without folate antagonism.',
   10, 'FDA'),
  ('6851', 'methotrexate', '42586', 'sulfamethoxazole-trimethoprim', 'contraindicated',
   'Sulfa and trimethoprim both enhance methotrexate toxicity',
   'Severe myelosuppression, pancytopenia, mucositis',
   'CONTRAINDICATED. Choose alternative antibiotics.',
   10, 'FDA'),
  ('6851', 'methotrexate', '5640', 'ibuprofen', 'major',
   'NSAIDs decrease methotrexate renal clearance',
   'Increased methotrexate toxicity: bone marrow suppression, GI toxicity, hepatotoxicity',
   'Avoid NSAIDs with high-dose methotrexate. Monitor closely with low-dose regimens. Consider dose reduction.',
   9, 'FDA'),
  ('6851', 'methotrexate', '7233', 'naproxen', 'major',
   'NSAIDs decrease methotrexate elimination',
   'Elevated methotrexate levels, increased toxicity risk',
   'Monitor for toxicity. Consider acetaminophen as alternative.',
   9, 'FDA'),
  ('6851', 'methotrexate', '39997', 'celecoxib', 'moderate',
   'May reduce methotrexate clearance',
   'Potential increased methotrexate levels',
   'Monitor closely. May be safer than non-selective NSAIDs.',
   8, 'Clinical Pharmacology')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Spironolactone interactions (common for acne/hormonal therapy)
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('9997', 'spironolactone', '8183', 'potassium chloride', 'major',
   'Additive hyperkalemia risk',
   'Dangerous hyperkalemia: cardiac arrhythmias, muscle weakness, potentially fatal cardiac effects',
   'Monitor potassium levels closely. Avoid potassium supplements unless hypokalemia documented.',
   10, 'FDA'),
  ('9997', 'spironolactone', '321064', 'potassium citrate', 'major',
   'Additive hyperkalemia risk with potassium-sparing diuretic',
   'Hyperkalemia with cardiac conduction abnormalities',
   'Avoid combination. Monitor serum potassium if use necessary.',
   10, 'FDA'),
  ('9997', 'spironolactone', '29046', 'lisinopril', 'major',
   'Both agents can increase serum potassium',
   'Hyperkalemia risk, especially in renal impairment',
   'Monitor potassium and renal function. Avoid potassium supplements.',
   8, 'FDA'),
  ('9997', 'spironolactone', '52175', 'losartan', 'major',
   'Additive hyperkalemia risk',
   'Elevated serum potassium, cardiac arrhythmia risk',
   'Monitor serum potassium, especially at initiation.',
   8, 'FDA')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Biologic interactions (psoriasis/dermatology biologics)
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('327361', 'adalimumab', 'LIVE_VACCINE', 'live vaccines', 'contraindicated',
   'Immunosuppression increases risk of vaccine-associated infection',
   'Disseminated vaccine infection, serious illness, potential fatality with live vaccines',
   'CONTRAINDICATED. Complete all live vaccinations at least 4 weeks before initiating therapy.',
   10, 'FDA'),
  ('615338', 'ustekinumab', 'LIVE_VACCINE', 'live vaccines', 'contraindicated',
   'Live vaccines contraindicated during immunosuppressive therapy',
   'Risk of disseminated vaccine infection',
   'Complete live vaccinations before starting ustekinumab.',
   10, 'FDA'),
  ('1372738', 'secukinumab', 'LIVE_VACCINE', 'live vaccines', 'contraindicated',
   'Live vaccines should not be given during IL-17 inhibitor therapy',
   'Increased infection risk',
   'Give all live vaccines before initiating secukinumab.',
   10, 'FDA'),
  ('727711', 'dupilumab', 'LIVE_VACCINE', 'live vaccines', 'moderate',
   'May reduce vaccine efficacy due to immunomodulation',
   'Inadequate immune response to vaccines',
   'Complete vaccinations before starting therapy when possible. Non-live vaccines may be given during therapy.',
   9, 'FDA'),
  ('327361', 'adalimumab', '6851', 'methotrexate', 'moderate',
   'Additive immunosuppression',
   'Increased infection risk, potential for opportunistic infections',
   'Monitor closely for infections. May be used together for psoriatic arthritis but with increased vigilance.',
   9, 'Clinical Pharmacology')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Cyclosporine interactions (used for severe psoriasis/eczema)
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('3008', 'cyclosporine', '6135', 'ketoconazole', 'major',
   'Strong CYP3A4 inhibition significantly increases cyclosporine levels',
   'Nephrotoxicity, hepatotoxicity, neurotoxicity, hypertension',
   'Reduce cyclosporine dose by 50-75%. Monitor levels closely.',
   10, 'FDA'),
  ('3008', 'cyclosporine', '4450', 'fluconazole', 'major',
   'CYP3A4 inhibition increases cyclosporine concentrations',
   'Potential for increased cyclosporine toxicity',
   'Monitor cyclosporine levels. Consider dose reduction.',
   9, 'FDA'),
  ('3008', 'cyclosporine', '28031', 'itraconazole', 'major',
   'Strong CYP3A4 inhibition increases cyclosporine levels',
   'Nephrotoxicity, neurotoxicity',
   'Reduce cyclosporine dose. Monitor drug levels and renal function.',
   10, 'FDA'),
  ('3008', 'cyclosporine', '5640', 'ibuprofen', 'major',
   'NSAIDs may potentiate cyclosporine nephrotoxicity',
   'Acute renal impairment, decreased GFR',
   'Avoid NSAIDs when possible. Monitor renal function closely.',
   9, 'Clinical Pharmacology'),
  ('3008', 'cyclosporine', '42463', 'simvastatin', 'contraindicated',
   'Cyclosporine inhibits statin metabolism, greatly increasing myopathy risk',
   'Rhabdomyolysis, myopathy, acute renal failure',
   'AVOID simvastatin. If statin needed, use pravastatin or rosuvastatin at low doses.',
   8, 'FDA')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Warfarin interactions (patients on anticoagulation)
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('11289', 'warfarin', '4450', 'fluconazole', 'major',
   'Fluconazole inhibits CYP2C9, increasing warfarin effect',
   'Significantly elevated INR, major bleeding risk',
   'Reduce warfarin dose by 25-50%. Monitor INR within 3-5 days.',
   7, 'FDA'),
  ('11289', 'warfarin', '7625', 'metronidazole', 'major',
   'Metronidazole inhibits warfarin metabolism',
   'Elevated INR, increased bleeding risk',
   'Monitor INR closely. May need warfarin dose reduction.',
   6, 'FDA')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Corticosteroid interactions
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('8640', 'prednisone', '5640', 'ibuprofen', 'moderate',
   'Additive GI toxicity risk',
   'Increased risk of peptic ulcer, GI bleeding',
   'Consider gastroprotection with PPI. Monitor for GI symptoms.',
   8, 'FDA'),
  ('8640', 'prednisone', '7233', 'naproxen', 'moderate',
   'Combined risk of GI ulceration',
   'Peptic ulcer, GI hemorrhage',
   'Use gastroprotection. Minimize duration of combination.',
   8, 'FDA')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- Doxycycline/tetracycline absorption interactions
INSERT INTO drug_interactions (drug1_rxcui, drug1_name, drug2_rxcui, drug2_name, severity, description, clinical_effects, management, dermatology_relevance, source)
VALUES
  ('10554', 'doxycycline', '8183', 'calcium', 'moderate',
   'Calcium chelates tetracyclines reducing absorption',
   'Decreased antibiotic efficacy',
   'Separate administration by at least 2-3 hours.',
   8, 'Clinical Pharmacology'),
  ('10554', 'doxycycline', '4991', 'iron', 'moderate',
   'Iron chelates tetracyclines reducing absorption of both',
   'Reduced efficacy of both medications',
   'Separate administration by 2-3 hours.',
   8, 'Clinical Pharmacology'),
  ('10554', 'doxycycline', '596', 'antacids', 'moderate',
   'Antacids containing aluminum, magnesium, or calcium reduce absorption',
   'Decreased doxycycline efficacy',
   'Take doxycycline 1-2 hours before or 4 hours after antacids.',
   8, 'Clinical Pharmacology')
ON CONFLICT (drug1_rxcui, drug2_rxcui) DO NOTHING;

-- =============================================================================
-- Seed Data: Drug Allergy Classes
-- =============================================================================

INSERT INTO drug_allergy_classes (allergy_class, class_display_name, related_drugs, cross_reactivity_notes, cross_reactivity_rate, alternative_suggestions)
VALUES
  ('penicillins', 'Penicillin Antibiotics',
   ARRAY['penicillin', 'amoxicillin', 'ampicillin', 'dicloxacillin', 'nafcillin', 'piperacillin', 'oxacillin', 'augmentin', 'amoxicillin-clavulanate'],
   'Cross-reactivity with cephalosporins is approximately 1-2% (lower than previously thought). Higher risk with first-generation cephalosporins sharing similar side chains.',
   2.0,
   ARRAY['azithromycin', 'doxycycline', 'fluoroquinolones', 'trimethoprim-sulfamethoxazole']),

  ('cephalosporins', 'Cephalosporin Antibiotics',
   ARRAY['cephalexin', 'cefazolin', 'ceftriaxone', 'cefdinir', 'cefuroxime', 'cefepime', 'ceftazidime', 'cefpodoxime'],
   'Cross-reactivity with penicillins depends on side chain similarity. First-generation cephalosporins have higher cross-reactivity.',
   1.0,
   ARRAY['azithromycin', 'fluoroquinolones', 'doxycycline']),

  ('sulfonamides', 'Sulfonamide Antibiotics',
   ARRAY['sulfamethoxazole', 'sulfasalazine', 'sulfadiazine', 'trimethoprim-sulfamethoxazole', 'bactrim', 'septra'],
   'Sulfonamide antibiotic allergy does NOT indicate cross-reactivity with non-antibiotic sulfonamides (thiazides, furosemide, celecoxib).',
   0.0,
   ARRAY['doxycycline', 'azithromycin', 'fluoroquinolones', 'amoxicillin']),

  ('tetracyclines', 'Tetracycline Antibiotics',
   ARRAY['tetracycline', 'doxycycline', 'minocycline', 'sarecycline', 'demeclocycline'],
   'Cross-reactivity within tetracycline class is high. Patients allergic to one should avoid all tetracyclines.',
   85.0,
   ARRAY['azithromycin', 'trimethoprim-sulfamethoxazole', 'amoxicillin']),

  ('fluoroquinolones', 'Fluoroquinolone Antibiotics',
   ARRAY['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin', 'gemifloxacin'],
   'High cross-reactivity within class. Avoid all fluoroquinolones if allergy to one.',
   80.0,
   ARRAY['azithromycin', 'doxycycline', 'amoxicillin-clavulanate']),

  ('retinoids', 'Retinoid Class',
   ARRAY['isotretinoin', 'tretinoin', 'adapalene', 'tazarotene', 'trifarotene', 'acitretin', 'alitretinoin', 'bexarotene'],
   'Cross-reactivity possible within retinoid class. Topical retinoids may be tolerated when systemic caused reaction.',
   40.0,
   ARRAY['benzoyl peroxide', 'clindamycin', 'azelaic acid']),

  ('nsaids', 'Non-Steroidal Anti-Inflammatory Drugs',
   ARRAY['ibuprofen', 'naproxen', 'aspirin', 'ketorolac', 'indomethacin', 'meloxicam', 'piroxicam', 'diclofenac', 'celecoxib'],
   'Cross-reactivity depends on reaction type. COX-2 selective inhibitors (celecoxib) may be tolerated in some NSAID-allergic patients.',
   30.0,
   ARRAY['acetaminophen', 'tramadol']),

  ('local_anesthetics_amides', 'Amide Local Anesthetics',
   ARRAY['lidocaine', 'bupivacaine', 'mepivacaine', 'ropivacaine', 'prilocaine', 'articaine'],
   'Cross-reactivity within amide class is possible. No cross-reactivity with ester anesthetics.',
   10.0,
   ARRAY['procaine', 'benzocaine', 'chloroprocaine']),

  ('local_anesthetics_esters', 'Ester Local Anesthetics',
   ARRAY['procaine', 'benzocaine', 'tetracaine', 'chloroprocaine', 'cocaine'],
   'Cross-reactivity within ester class due to PABA metabolite. No cross-reactivity with amide anesthetics.',
   20.0,
   ARRAY['lidocaine', 'bupivacaine', 'mepivacaine'])
ON CONFLICT (allergy_class) DO NOTHING;

-- =============================================================================
-- Seed Data: Drug Class Mappings for Duplicate Therapy
-- =============================================================================

INSERT INTO drug_class_mapping (drug_name, therapeutic_class, pharmacologic_class, is_dermatology_drug)
VALUES
  -- Retinoids
  ('isotretinoin', 'Acne Agents', 'Retinoids - Systemic', true),
  ('tretinoin topical', 'Acne Agents', 'Retinoids - Topical', true),
  ('adapalene', 'Acne Agents', 'Retinoids - Topical', true),
  ('tazarotene', 'Acne Agents', 'Retinoids - Topical', true),
  ('trifarotene', 'Acne Agents', 'Retinoids - Topical', true),
  ('acitretin', 'Psoriasis Agents', 'Retinoids - Systemic', true),

  -- Tetracyclines (commonly used for acne)
  ('doxycycline', 'Acne Agents', 'Tetracycline Antibiotics', true),
  ('minocycline', 'Acne Agents', 'Tetracycline Antibiotics', true),
  ('sarecycline', 'Acne Agents', 'Tetracycline Antibiotics', true),

  -- Immunosuppressants
  ('methotrexate', 'Immunosuppressants', 'DMARD - Antimetabolite', true),
  ('cyclosporine', 'Immunosuppressants', 'Calcineurin Inhibitor - Systemic', true),
  ('azathioprine', 'Immunosuppressants', 'DMARD - Antimetabolite', true),
  ('mycophenolate', 'Immunosuppressants', 'DMARD - Antimetabolite', true),

  -- Biologics
  ('adalimumab', 'Biologics', 'TNF-Alpha Inhibitor', true),
  ('etanercept', 'Biologics', 'TNF-Alpha Inhibitor', true),
  ('infliximab', 'Biologics', 'TNF-Alpha Inhibitor', true),
  ('ustekinumab', 'Biologics', 'IL-12/23 Inhibitor', true),
  ('secukinumab', 'Biologics', 'IL-17 Inhibitor', true),
  ('ixekizumab', 'Biologics', 'IL-17 Inhibitor', true),
  ('brodalumab', 'Biologics', 'IL-17 Receptor Inhibitor', true),
  ('risankizumab', 'Biologics', 'IL-23 Inhibitor', true),
  ('guselkumab', 'Biologics', 'IL-23 Inhibitor', true),
  ('tildrakizumab', 'Biologics', 'IL-23 Inhibitor', true),
  ('dupilumab', 'Biologics', 'IL-4/13 Inhibitor', true),
  ('tralokinumab', 'Biologics', 'IL-13 Inhibitor', true),
  ('omalizumab', 'Biologics', 'Anti-IgE', true),

  -- JAK Inhibitors
  ('tofacitinib', 'JAK Inhibitors', 'JAK1/3 Inhibitor', true),
  ('upadacitinib', 'JAK Inhibitors', 'JAK1 Inhibitor', true),
  ('baricitinib', 'JAK Inhibitors', 'JAK1/2 Inhibitor', true),
  ('abrocitinib', 'JAK Inhibitors', 'JAK1 Inhibitor', true),
  ('ruxolitinib topical', 'JAK Inhibitors', 'JAK1/2 Inhibitor - Topical', true),

  -- Spironolactone (hormonal acne)
  ('spironolactone', 'Hormonal Agents', 'Potassium-Sparing Diuretic', true),

  -- Topical steroids
  ('clobetasol', 'Topical Corticosteroids', 'Super-Potent Steroid', true),
  ('betamethasone', 'Topical Corticosteroids', 'High-Potency Steroid', true),
  ('triamcinolone', 'Topical Corticosteroids', 'Medium-Potency Steroid', true),
  ('hydrocortisone', 'Topical Corticosteroids', 'Low-Potency Steroid', true),

  -- Topical calcineurin inhibitors
  ('tacrolimus topical', 'Topical Immunomodulators', 'Calcineurin Inhibitor - Topical', true),
  ('pimecrolimus', 'Topical Immunomodulators', 'Calcineurin Inhibitor - Topical', true),

  -- Antifungals
  ('fluconazole', 'Antifungals', 'Azole Antifungal - Systemic', true),
  ('itraconazole', 'Antifungals', 'Azole Antifungal - Systemic', true),
  ('terbinafine', 'Antifungals', 'Allylamine Antifungal', true),
  ('ketoconazole topical', 'Antifungals', 'Azole Antifungal - Topical', true),
  ('griseofulvin', 'Antifungals', 'Antifungal - Systemic', true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Add Trigger for Updated Timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_drug_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_patient_drug_alerts_updated_at
  BEFORE UPDATE ON patient_drug_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_drug_alerts_updated_at();

CREATE TRIGGER trigger_drug_interactions_updated_at
  BEFORE UPDATE ON drug_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_drug_alerts_updated_at();

CREATE TRIGGER trigger_drug_allergy_classes_updated_at
  BEFORE UPDATE ON drug_allergy_classes
  FOR EACH ROW
  EXECUTE FUNCTION update_drug_alerts_updated_at();
