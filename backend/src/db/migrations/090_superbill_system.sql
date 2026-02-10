-- Migration: Superbill/Charge Auto-Capture System
-- Description: Complete superbill management for dermatology billing

-- SUPERBILLS TABLE - Main superbill header
CREATE TABLE IF NOT EXISTS superbills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- References
  encounter_id VARCHAR(255) NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id VARCHAR(255) NOT NULL,

  -- Service information
  service_date DATE NOT NULL,
  place_of_service VARCHAR(10) DEFAULT '11', -- 11 = Office

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  -- draft, pending_review, approved, finalized, submitted, void

  -- Financial summary
  total_charges INTEGER NOT NULL DEFAULT 0, -- cents

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  finalized_at TIMESTAMP,
  finalized_by VARCHAR(255),
  created_by VARCHAR(255),

  -- Notes
  notes TEXT,

  CONSTRAINT valid_superbill_status CHECK (
    status IN ('draft', 'pending_review', 'approved', 'finalized', 'submitted', 'void')
  ),
  CONSTRAINT unique_encounter_superbill UNIQUE (encounter_id, tenant_id)
);

-- SUPERBILL LINE ITEMS TABLE - Individual charges on a superbill
CREATE TABLE IF NOT EXISTS superbill_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  superbill_id UUID NOT NULL REFERENCES superbills(id) ON DELETE CASCADE,

  -- CPT/Procedure information
  cpt_code VARCHAR(10) NOT NULL,
  description TEXT,

  -- Diagnosis codes (ICD-10)
  icd10_codes TEXT[] DEFAULT '{}',

  -- Billing details
  units INTEGER NOT NULL DEFAULT 1,
  fee INTEGER NOT NULL DEFAULT 0, -- cents per unit
  modifier VARCHAR(10), -- e.g., 25, 59, TC, 26
  modifier2 VARCHAR(10),
  modifier3 VARCHAR(10),
  modifier4 VARCHAR(10),

  -- Line total (computed: units * fee)
  line_total INTEGER GENERATED ALWAYS AS (units * fee) STORED,

  -- Sequence for ordering
  line_sequence INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_units CHECK (units > 0),
  CONSTRAINT valid_fee CHECK (fee >= 0)
);

-- FEE SCHEDULES TABLE - Define fees for CPT codes
CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Fee schedule identification
  name VARCHAR(255) NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  is_default BOOLEAN DEFAULT FALSE,

  -- CPT code
  cpt_code VARCHAR(10) NOT NULL,
  description TEXT,

  -- Default fee
  default_fee INTEGER NOT NULL DEFAULT 0, -- cents

  -- Payer-specific fees as JSONB
  -- Format: { "payerId1": { "fee": 15000, "notes": "..." }, "payerId2": { ... } }
  payer_specific_fees JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_fee_schedule_cpt UNIQUE (tenant_id, name, cpt_code, effective_date)
);

-- COMMON DERMATOLOGY CODES TABLE - Quick access to frequently used codes
CREATE TABLE IF NOT EXISTS common_derm_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL tenant_id means system-wide default

  -- Code details
  code_type VARCHAR(10) NOT NULL, -- 'CPT' or 'ICD10'
  code VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,

  -- Categorization
  category VARCHAR(100), -- e.g., 'E/M', 'Destruction', 'Biopsy', 'Surgery'
  subcategory VARCHAR(100),

  -- Usage tracking
  is_favorite BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Display order
  display_order INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_code_type CHECK (code_type IN ('CPT', 'ICD10'))
);

-- Indexes for performance
CREATE INDEX idx_superbills_tenant ON superbills(tenant_id);
CREATE INDEX idx_superbills_encounter ON superbills(encounter_id);
CREATE INDEX idx_superbills_patient ON superbills(patient_id);
CREATE INDEX idx_superbills_provider ON superbills(provider_id);
CREATE INDEX idx_superbills_status ON superbills(tenant_id, status);
CREATE INDEX idx_superbills_service_date ON superbills(service_date DESC);
CREATE INDEX idx_superbills_created ON superbills(created_at DESC);

CREATE INDEX idx_superbill_line_items_superbill ON superbill_line_items(superbill_id);
CREATE INDEX idx_superbill_line_items_cpt ON superbill_line_items(cpt_code);
CREATE INDEX idx_superbill_line_items_tenant ON superbill_line_items(tenant_id);

CREATE INDEX idx_fee_schedules_tenant ON fee_schedules(tenant_id);
CREATE INDEX idx_fee_schedules_cpt ON fee_schedules(cpt_code);
CREATE INDEX idx_fee_schedules_default ON fee_schedules(tenant_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_fee_schedules_effective ON fee_schedules(effective_date, expiration_date);

CREATE INDEX idx_common_derm_codes_tenant ON common_derm_codes(tenant_id);
CREATE INDEX idx_common_derm_codes_type ON common_derm_codes(code_type);
CREATE INDEX idx_common_derm_codes_category ON common_derm_codes(category);
CREATE INDEX idx_common_derm_codes_favorite ON common_derm_codes(is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_common_derm_codes_usage ON common_derm_codes(usage_count DESC);

-- Comments
COMMENT ON TABLE superbills IS 'Superbill/charge capture documents for encounters';
COMMENT ON TABLE superbill_line_items IS 'Individual CPT charges on a superbill';
COMMENT ON TABLE fee_schedules IS 'Fee schedules with payer-specific pricing';
COMMENT ON TABLE common_derm_codes IS 'Commonly used dermatology CPT and ICD-10 codes';

COMMENT ON COLUMN superbills.status IS 'draft, pending_review, approved, finalized, submitted, void';
COMMENT ON COLUMN superbills.total_charges IS 'Total charges in cents';
COMMENT ON COLUMN superbill_line_items.fee IS 'Fee per unit in cents';
COMMENT ON COLUMN superbill_line_items.icd10_codes IS 'Array of ICD-10 diagnosis codes linked to this line item';
COMMENT ON COLUMN fee_schedules.payer_specific_fees IS 'JSONB object with payer IDs as keys and fee info as values';

-- Function to update superbill totals when line items change
CREATE OR REPLACE FUNCTION update_superbill_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the superbill total
  UPDATE superbills
  SET
    total_charges = COALESCE((
      SELECT SUM(units * fee)
      FROM superbill_line_items
      WHERE superbill_id = COALESCE(NEW.superbill_id, OLD.superbill_id)
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.superbill_id, OLD.superbill_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic total calculation
CREATE TRIGGER trigger_update_superbill_total_insert
  AFTER INSERT ON superbill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_superbill_total();

CREATE TRIGGER trigger_update_superbill_total_update
  AFTER UPDATE ON superbill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_superbill_total();

CREATE TRIGGER trigger_update_superbill_total_delete
  AFTER DELETE ON superbill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_superbill_total();

-- Function to increment code usage count
CREATE OR REPLACE FUNCTION increment_code_usage(
  p_tenant_id VARCHAR(255),
  p_code_type VARCHAR(10),
  p_code VARCHAR(20)
)
RETURNS VOID AS $$
BEGIN
  UPDATE common_derm_codes
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE (tenant_id = p_tenant_id OR tenant_id IS NULL)
    AND code_type = p_code_type
    AND code = p_code;
END;
$$ LANGUAGE plpgsql;

-- Seed common dermatology CPT codes (system-wide defaults)
INSERT INTO common_derm_codes (tenant_id, code_type, code, description, category, display_order) VALUES
  -- E/M Office Visits
  (NULL, 'CPT', '99211', 'Office visit, established patient, minimal', 'E/M', 1),
  (NULL, 'CPT', '99212', 'Office visit, established patient, straightforward', 'E/M', 2),
  (NULL, 'CPT', '99213', 'Office visit, established patient, low complexity', 'E/M', 3),
  (NULL, 'CPT', '99214', 'Office visit, established patient, moderate complexity', 'E/M', 4),
  (NULL, 'CPT', '99215', 'Office visit, established patient, high complexity', 'E/M', 5),
  (NULL, 'CPT', '99201', 'Office visit, new patient, straightforward', 'E/M', 6),
  (NULL, 'CPT', '99202', 'Office visit, new patient, straightforward', 'E/M', 7),
  (NULL, 'CPT', '99203', 'Office visit, new patient, low complexity', 'E/M', 8),
  (NULL, 'CPT', '99204', 'Office visit, new patient, moderate complexity', 'E/M', 9),
  (NULL, 'CPT', '99205', 'Office visit, new patient, high complexity', 'E/M', 10),

  -- Destruction (Cryotherapy/Electrodessication)
  (NULL, 'CPT', '17000', 'Destruction, premalignant lesion, first lesion', 'Destruction', 20),
  (NULL, 'CPT', '17003', 'Destruction, premalignant lesion, 2-14 lesions, each', 'Destruction', 21),
  (NULL, 'CPT', '17004', 'Destruction, premalignant lesions, 15 or more lesions', 'Destruction', 22),
  (NULL, 'CPT', '17110', 'Destruction, benign lesions, up to 14 lesions', 'Destruction', 23),
  (NULL, 'CPT', '17111', 'Destruction, benign lesions, 15 or more lesions', 'Destruction', 24),
  (NULL, 'CPT', '17106', 'Destruction, cutaneous vascular lesions, < 10 sq cm', 'Destruction', 25),
  (NULL, 'CPT', '17107', 'Destruction, cutaneous vascular lesions, 10-50 sq cm', 'Destruction', 26),
  (NULL, 'CPT', '17108', 'Destruction, cutaneous vascular lesions, > 50 sq cm', 'Destruction', 27),

  -- Skin Biopsies
  (NULL, 'CPT', '11102', 'Tangential biopsy of skin, single lesion', 'Biopsy', 30),
  (NULL, 'CPT', '11103', 'Tangential biopsy of skin, each additional lesion', 'Biopsy', 31),
  (NULL, 'CPT', '11104', 'Punch biopsy of skin, single lesion', 'Biopsy', 32),
  (NULL, 'CPT', '11105', 'Punch biopsy of skin, each additional lesion', 'Biopsy', 33),
  (NULL, 'CPT', '11106', 'Incisional biopsy of skin, single lesion', 'Biopsy', 34),
  (NULL, 'CPT', '11107', 'Incisional biopsy of skin, each additional lesion', 'Biopsy', 35),

  -- Excisions - Benign
  (NULL, 'CPT', '11400', 'Excision, benign lesion, trunk/arms/legs, 0.5 cm or less', 'Excision', 40),
  (NULL, 'CPT', '11401', 'Excision, benign lesion, trunk/arms/legs, 0.6-1.0 cm', 'Excision', 41),
  (NULL, 'CPT', '11402', 'Excision, benign lesion, trunk/arms/legs, 1.1-2.0 cm', 'Excision', 42),
  (NULL, 'CPT', '11403', 'Excision, benign lesion, trunk/arms/legs, 2.1-3.0 cm', 'Excision', 43),
  (NULL, 'CPT', '11404', 'Excision, benign lesion, trunk/arms/legs, 3.1-4.0 cm', 'Excision', 44),

  -- Excisions - Malignant
  (NULL, 'CPT', '11600', 'Excision, malignant lesion, trunk/arms/legs, 0.5 cm or less', 'Excision', 50),
  (NULL, 'CPT', '11601', 'Excision, malignant lesion, trunk/arms/legs, 0.6-1.0 cm', 'Excision', 51),
  (NULL, 'CPT', '11602', 'Excision, malignant lesion, trunk/arms/legs, 1.1-2.0 cm', 'Excision', 52),
  (NULL, 'CPT', '11603', 'Excision, malignant lesion, trunk/arms/legs, 2.1-3.0 cm', 'Excision', 53),
  (NULL, 'CPT', '11604', 'Excision, malignant lesion, trunk/arms/legs, 3.1-4.0 cm', 'Excision', 54),

  -- Shave Removals
  (NULL, 'CPT', '11300', 'Shave removal, skin lesion, trunk/arms/legs, 0.5 cm or less', 'Shave', 60),
  (NULL, 'CPT', '11301', 'Shave removal, skin lesion, trunk/arms/legs, 0.6-1.0 cm', 'Shave', 61),
  (NULL, 'CPT', '11302', 'Shave removal, skin lesion, trunk/arms/legs, 1.1-2.0 cm', 'Shave', 62),
  (NULL, 'CPT', '11303', 'Shave removal, skin lesion, trunk/arms/legs, > 2.0 cm', 'Shave', 63),

  -- Repairs
  (NULL, 'CPT', '12001', 'Simple repair, superficial wounds, 2.5 cm or less', 'Repair', 70),
  (NULL, 'CPT', '12002', 'Simple repair, superficial wounds, 2.6-7.5 cm', 'Repair', 71),
  (NULL, 'CPT', '12004', 'Simple repair, superficial wounds, 7.6-12.5 cm', 'Repair', 72),

  -- Injections
  (NULL, 'CPT', '11900', 'Injection, intralesional, up to 7 lesions', 'Injection', 80),
  (NULL, 'CPT', '11901', 'Injection, intralesional, more than 7 lesions', 'Injection', 81),
  (NULL, 'CPT', '96372', 'Therapeutic injection, subcutaneous/intramuscular', 'Injection', 82),

  -- Phototherapy
  (NULL, 'CPT', '96900', 'Actinotherapy (UV light)', 'Phototherapy', 90),
  (NULL, 'CPT', '96910', 'Photochemotherapy, tar and UV', 'Phototherapy', 91),
  (NULL, 'CPT', '96912', 'Photochemotherapy, psoralens and UV (PUVA)', 'Phototherapy', 92),
  (NULL, 'CPT', '96920', 'Laser treatment for inflammatory skin disease', 'Phototherapy', 93),

  -- Patch Testing
  (NULL, 'CPT', '95044', 'Patch or application test(s)', 'Allergy Testing', 100),
  (NULL, 'CPT', '95052', 'Photo patch test(s)', 'Allergy Testing', 101)
ON CONFLICT DO NOTHING;

-- Seed common dermatology ICD-10 codes (system-wide defaults)
INSERT INTO common_derm_codes (tenant_id, code_type, code, description, category, display_order) VALUES
  -- Acne
  (NULL, 'ICD10', 'L70.0', 'Acne vulgaris', 'Acne', 1),
  (NULL, 'ICD10', 'L70.1', 'Acne conglobata', 'Acne', 2),
  (NULL, 'ICD10', 'L70.4', 'Infantile acne', 'Acne', 3),
  (NULL, 'ICD10', 'L70.8', 'Other acne', 'Acne', 4),
  (NULL, 'ICD10', 'L70.9', 'Acne, unspecified', 'Acne', 5),

  -- Psoriasis
  (NULL, 'ICD10', 'L40.0', 'Psoriasis vulgaris', 'Psoriasis', 10),
  (NULL, 'ICD10', 'L40.1', 'Generalized pustular psoriasis', 'Psoriasis', 11),
  (NULL, 'ICD10', 'L40.4', 'Guttate psoriasis', 'Psoriasis', 12),
  (NULL, 'ICD10', 'L40.50', 'Arthropathic psoriasis, unspecified', 'Psoriasis', 13),
  (NULL, 'ICD10', 'L40.8', 'Other psoriasis', 'Psoriasis', 14),
  (NULL, 'ICD10', 'L40.9', 'Psoriasis, unspecified', 'Psoriasis', 15),

  -- Eczema/Dermatitis
  (NULL, 'ICD10', 'L20.9', 'Atopic dermatitis, unspecified', 'Eczema', 20),
  (NULL, 'ICD10', 'L20.81', 'Atopic neurodermatitis', 'Eczema', 21),
  (NULL, 'ICD10', 'L20.82', 'Flexural eczema', 'Eczema', 22),
  (NULL, 'ICD10', 'L20.84', 'Intrinsic (allergic) eczema', 'Eczema', 23),
  (NULL, 'ICD10', 'L30.9', 'Dermatitis, unspecified', 'Eczema', 24),
  (NULL, 'ICD10', 'L23.9', 'Allergic contact dermatitis, unspecified cause', 'Eczema', 25),
  (NULL, 'ICD10', 'L24.9', 'Irritant contact dermatitis, unspecified cause', 'Eczema', 26),

  -- Melanocytic Nevi
  (NULL, 'ICD10', 'D22.0', 'Melanocytic nevi of lip', 'Nevi', 30),
  (NULL, 'ICD10', 'D22.1', 'Melanocytic nevi of eyelid, including canthus', 'Nevi', 31),
  (NULL, 'ICD10', 'D22.2', 'Melanocytic nevi of ear and external auricular canal', 'Nevi', 32),
  (NULL, 'ICD10', 'D22.30', 'Melanocytic nevi of unspecified part of face', 'Nevi', 33),
  (NULL, 'ICD10', 'D22.4', 'Melanocytic nevi of scalp and neck', 'Nevi', 34),
  (NULL, 'ICD10', 'D22.5', 'Melanocytic nevi of trunk', 'Nevi', 35),
  (NULL, 'ICD10', 'D22.60', 'Melanocytic nevi of unspecified upper limb', 'Nevi', 36),
  (NULL, 'ICD10', 'D22.70', 'Melanocytic nevi of unspecified lower limb', 'Nevi', 37),
  (NULL, 'ICD10', 'D22.9', 'Melanocytic nevi, unspecified', 'Nevi', 38),

  -- Skin Cancers
  (NULL, 'ICD10', 'C43.9', 'Malignant melanoma of skin, unspecified', 'Skin Cancer', 40),
  (NULL, 'ICD10', 'C43.0', 'Malignant melanoma of lip', 'Skin Cancer', 41),
  (NULL, 'ICD10', 'C43.4', 'Malignant melanoma of scalp and neck', 'Skin Cancer', 42),
  (NULL, 'ICD10', 'C43.51', 'Malignant melanoma of anal skin', 'Skin Cancer', 43),
  (NULL, 'ICD10', 'C43.59', 'Malignant melanoma of other part of trunk', 'Skin Cancer', 44),
  (NULL, 'ICD10', 'C44.91', 'Basal cell carcinoma of skin, unspecified', 'Skin Cancer', 45),
  (NULL, 'ICD10', 'C44.92', 'Squamous cell carcinoma of skin, unspecified', 'Skin Cancer', 46),
  (NULL, 'ICD10', 'C44.01', 'Basal cell carcinoma of skin of lip', 'Skin Cancer', 47),
  (NULL, 'ICD10', 'C44.02', 'Squamous cell carcinoma of skin of lip', 'Skin Cancer', 48),
  (NULL, 'ICD10', 'C44.111', 'Basal cell carcinoma of skin of unspecified eyelid', 'Skin Cancer', 49),
  (NULL, 'ICD10', 'C44.112', 'Squamous cell carcinoma of skin of unspecified eyelid', 'Skin Cancer', 50),

  -- Premalignant Lesions
  (NULL, 'ICD10', 'L57.0', 'Actinic keratosis', 'Premalignant', 60),
  (NULL, 'ICD10', 'D04.9', 'Carcinoma in situ of skin, unspecified', 'Premalignant', 61),
  (NULL, 'ICD10', 'L57.8', 'Other skin changes due to chronic exposure to nonionizing radiation', 'Premalignant', 62),

  -- Seborrheic/Benign Lesions
  (NULL, 'ICD10', 'L82.0', 'Inflamed seborrheic keratosis', 'Benign', 70),
  (NULL, 'ICD10', 'L82.1', 'Other seborrheic keratosis', 'Benign', 71),
  (NULL, 'ICD10', 'L72.0', 'Epidermal cyst', 'Benign', 72),
  (NULL, 'ICD10', 'L72.11', 'Pilar cyst', 'Benign', 73),
  (NULL, 'ICD10', 'L72.3', 'Sebaceous cyst', 'Benign', 74),
  (NULL, 'ICD10', 'D23.9', 'Other benign neoplasm of skin, unspecified', 'Benign', 75),

  -- Rosacea
  (NULL, 'ICD10', 'L71.0', 'Perioral dermatitis', 'Rosacea', 80),
  (NULL, 'ICD10', 'L71.1', 'Rhinophyma', 'Rosacea', 81),
  (NULL, 'ICD10', 'L71.8', 'Other rosacea', 'Rosacea', 82),
  (NULL, 'ICD10', 'L71.9', 'Rosacea, unspecified', 'Rosacea', 83),

  -- Warts/Viral
  (NULL, 'ICD10', 'B07.0', 'Plantar wart', 'Viral', 90),
  (NULL, 'ICD10', 'B07.8', 'Other viral warts', 'Viral', 91),
  (NULL, 'ICD10', 'B07.9', 'Viral wart, unspecified', 'Viral', 92),
  (NULL, 'ICD10', 'B08.1', 'Molluscum contagiosum', 'Viral', 93),

  -- Fungal
  (NULL, 'ICD10', 'B35.0', 'Tinea barbae and tinea capitis', 'Fungal', 100),
  (NULL, 'ICD10', 'B35.1', 'Tinea unguium', 'Fungal', 101),
  (NULL, 'ICD10', 'B35.3', 'Tinea pedis', 'Fungal', 102),
  (NULL, 'ICD10', 'B35.4', 'Tinea corporis', 'Fungal', 103),
  (NULL, 'ICD10', 'B35.6', 'Tinea cruris', 'Fungal', 104),
  (NULL, 'ICD10', 'B36.0', 'Pityriasis versicolor', 'Fungal', 105),

  -- Alopecia
  (NULL, 'ICD10', 'L63.9', 'Alopecia areata, unspecified', 'Alopecia', 110),
  (NULL, 'ICD10', 'L64.9', 'Androgenic alopecia, unspecified', 'Alopecia', 111),
  (NULL, 'ICD10', 'L65.9', 'Nonscarring hair loss, unspecified', 'Alopecia', 112),
  (NULL, 'ICD10', 'L66.9', 'Cicatricial alopecia, unspecified', 'Alopecia', 113),

  -- Urticaria
  (NULL, 'ICD10', 'L50.0', 'Allergic urticaria', 'Urticaria', 120),
  (NULL, 'ICD10', 'L50.1', 'Idiopathic urticaria', 'Urticaria', 121),
  (NULL, 'ICD10', 'L50.9', 'Urticaria, unspecified', 'Urticaria', 122)
ON CONFLICT DO NOTHING;

-- View for superbill with line items summary
CREATE OR REPLACE VIEW superbill_summary AS
SELECT
  s.id,
  s.tenant_id,
  s.encounter_id,
  s.patient_id,
  s.provider_id,
  s.service_date,
  s.status,
  s.total_charges,
  s.created_at,
  s.updated_at,
  s.finalized_at,
  p.first_name || ' ' || p.last_name as patient_name,
  pr.full_name as provider_name,
  COALESCE(li.line_count, 0) as line_count,
  COALESCE(li.cpt_codes, '{}') as cpt_codes
FROM superbills s
LEFT JOIN patients p ON p.id = s.patient_id
LEFT JOIN providers pr ON pr.id = s.provider_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as line_count,
    ARRAY_AGG(DISTINCT cpt_code) as cpt_codes
  FROM superbill_line_items
  WHERE superbill_id = s.id
) li ON TRUE;

COMMENT ON VIEW superbill_summary IS 'Summary view of superbills with patient/provider names and line item counts';
