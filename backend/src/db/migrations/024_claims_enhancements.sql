-- Migration: Enhanced Claims Management with Diagnoses and Charges
-- Description: Add separate tables for diagnoses and charges, connect to fee schedules

-- Claim diagnoses table
CREATE TABLE IF NOT EXISTS claim_diagnoses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  icd10_code TEXT NOT NULL,
  description TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  sequence_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claim charges/line items table (normalized from JSONB)
CREATE TABLE IF NOT EXISTS claim_charges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  cpt_code TEXT NOT NULL,
  description TEXT,
  modifiers TEXT[] DEFAULT '{}',
  quantity INTEGER DEFAULT 1,
  fee_cents INTEGER NOT NULL,
  fee_schedule_id TEXT,
  linked_diagnosis_ids TEXT[] DEFAULT '{}',
  sequence_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ICD-10 diagnosis codes for dermatology
CREATE TABLE IF NOT EXISTS diagnosis_codes (
  id TEXT PRIMARY KEY,
  icd10_code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  is_common BOOLEAN DEFAULT FALSE,
  specialty TEXT DEFAULT 'dermatology',
  billable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claim_diagnoses_claim ON claim_diagnoses(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_diagnoses_tenant ON claim_diagnoses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_diagnoses_code ON claim_diagnoses(icd10_code);

CREATE INDEX IF NOT EXISTS idx_claim_charges_claim ON claim_charges(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_charges_tenant ON claim_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_charges_cpt ON claim_charges(cpt_code);

CREATE INDEX IF NOT EXISTS idx_diagnosis_codes_icd10 ON diagnosis_codes(icd10_code);
CREATE INDEX IF NOT EXISTS idx_diagnosis_codes_common ON diagnosis_codes(is_common) WHERE is_common = TRUE;
CREATE INDEX IF NOT EXISTS idx_diagnosis_codes_specialty ON diagnosis_codes(specialty);

-- Seed common dermatology diagnosis codes
INSERT INTO diagnosis_codes (id, icd10_code, description, category, is_common, specialty) VALUES
  -- Psoriasis
  ('dx_l40_0', 'L40.0', 'Psoriasis vulgaris', 'Papulosquamous disorders', TRUE, 'dermatology'),
  ('dx_l40_1', 'L40.1', 'Generalized pustular psoriasis', 'Papulosquamous disorders', FALSE, 'dermatology'),
  ('dx_l40_4', 'L40.4', 'Guttate psoriasis', 'Papulosquamous disorders', FALSE, 'dermatology'),
  ('dx_l40_50', 'L40.50', 'Arthropathic psoriasis, unspecified', 'Papulosquamous disorders', FALSE, 'dermatology'),
  ('dx_l40_9', 'L40.9', 'Psoriasis, unspecified', 'Papulosquamous disorders', TRUE, 'dermatology'),

  -- Atopic dermatitis / Eczema
  ('dx_l20_0', 'L20.0', 'Besnier prurigo', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l20_81', 'L20.81', 'Atopic neurodermatitis', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l20_82', 'L20.82', 'Flexural eczema', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l20_9', 'L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis and eczema', TRUE, 'dermatology'),

  -- Acne
  ('dx_l70_0', 'L70.0', 'Acne vulgaris', 'Disorders of sebaceous glands', TRUE, 'dermatology'),
  ('dx_l70_1', 'L70.1', 'Acne conglobata', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_2', 'L70.2', 'Acne varioliformis', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_3', 'L70.3', 'Acne tropica', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_4', 'L70.4', 'Infantile acne', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_5', 'L70.5', 'Acne excoriee', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_8', 'L70.8', 'Other acne', 'Disorders of sebaceous glands', FALSE, 'dermatology'),
  ('dx_l70_9', 'L70.9', 'Acne, unspecified', 'Disorders of sebaceous glands', TRUE, 'dermatology'),

  -- Rosacea
  ('dx_l71_0', 'L71.0', 'Perioral dermatitis', 'Rosacea', FALSE, 'dermatology'),
  ('dx_l71_1', 'L71.1', 'Rhinophyma', 'Rosacea', FALSE, 'dermatology'),
  ('dx_l71_8', 'L71.8', 'Other rosacea', 'Rosacea', FALSE, 'dermatology'),
  ('dx_l71_9', 'L71.9', 'Rosacea, unspecified', 'Rosacea', TRUE, 'dermatology'),

  -- Malignant melanoma
  ('dx_c43_0', 'C43.0', 'Malignant melanoma of lip', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_10', 'C43.10', 'Malignant melanoma of unspecified eyelid, including canthus', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_20', 'C43.20', 'Malignant melanoma of unspecified ear and external auricular canal', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_30', 'C43.30', 'Malignant melanoma of unspecified part of face', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_39', 'C43.39', 'Malignant melanoma of other parts of face', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_4', 'C43.4', 'Malignant melanoma of scalp and neck', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_51', 'C43.51', 'Malignant melanoma of anal skin', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_52', 'C43.52', 'Malignant melanoma of skin of breast', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_59', 'C43.59', 'Malignant melanoma of other part of trunk', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_60', 'C43.60', 'Malignant melanoma of unspecified upper limb, including shoulder', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_70', 'C43.70', 'Malignant melanoma of unspecified lower limb, including hip', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_8', 'C43.8', 'Malignant melanoma of overlapping sites of skin', 'Skin cancer - Melanoma', FALSE, 'dermatology'),
  ('dx_c43_9', 'C43.9', 'Malignant melanoma of skin, unspecified', 'Skin cancer - Melanoma', TRUE, 'dermatology'),

  -- Basal cell carcinoma (BCC)
  ('dx_c44_01', 'C44.01', 'Basal cell carcinoma of skin of lip', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_111', 'C44.111', 'Basal cell carcinoma of skin of unspecified eyelid, including canthus', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_211', 'C44.211', 'Basal cell carcinoma of skin of unspecified ear and external auricular canal', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_310', 'C44.310', 'Basal cell carcinoma of skin of unspecified parts of face', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_319', 'C44.319', 'Basal cell carcinoma of skin of other parts of face', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_41', 'C44.41', 'Basal cell carcinoma of skin of scalp and neck', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_510', 'C44.510', 'Basal cell carcinoma of anal skin', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_511', 'C44.511', 'Basal cell carcinoma of skin of breast', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_519', 'C44.519', 'Basal cell carcinoma of skin of other part of trunk', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_611', 'C44.611', 'Basal cell carcinoma of skin of unspecified upper limb, including shoulder', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_711', 'C44.711', 'Basal cell carcinoma of skin of unspecified lower limb, including hip', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_81', 'C44.81', 'Basal cell carcinoma of overlapping sites of skin', 'Skin cancer - BCC', FALSE, 'dermatology'),
  ('dx_c44_91', 'C44.91', 'Basal cell carcinoma of skin, unspecified', 'Skin cancer - BCC', TRUE, 'dermatology'),

  -- Squamous cell carcinoma (SCC)
  ('dx_c44_02', 'C44.02', 'Squamous cell carcinoma of skin of lip', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_121', 'C44.121', 'Squamous cell carcinoma of skin of unspecified eyelid, including canthus', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_221', 'C44.221', 'Squamous cell carcinoma of skin of unspecified ear and external auricular canal', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_320', 'C44.320', 'Squamous cell carcinoma of skin of unspecified parts of face', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_329', 'C44.329', 'Squamous cell carcinoma of skin of other parts of face', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_42', 'C44.42', 'Squamous cell carcinoma of skin of scalp and neck', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_520', 'C44.520', 'Squamous cell carcinoma of anal skin', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_521', 'C44.521', 'Squamous cell carcinoma of skin of breast', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_529', 'C44.529', 'Squamous cell carcinoma of skin of other part of trunk', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_621', 'C44.621', 'Squamous cell carcinoma of skin of unspecified upper limb, including shoulder', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_721', 'C44.721', 'Squamous cell carcinoma of skin of unspecified lower limb, including hip', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_82', 'C44.82', 'Squamous cell carcinoma of overlapping sites of skin', 'Skin cancer - SCC', FALSE, 'dermatology'),
  ('dx_c44_92', 'C44.92', 'Squamous cell carcinoma of skin, unspecified', 'Skin cancer - SCC', TRUE, 'dermatology'),

  -- Melanocytic nevi (Moles)
  ('dx_d22_0', 'D22.0', 'Melanocytic nevi of lip', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_10', 'D22.10', 'Melanocytic nevi of unspecified eyelid, including canthus', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_20', 'D22.20', 'Melanocytic nevi of unspecified ear and external auricular canal', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_30', 'D22.30', 'Melanocytic nevi of unspecified part of face', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_39', 'D22.39', 'Melanocytic nevi of other parts of face', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_4', 'D22.4', 'Melanocytic nevi of scalp and neck', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_5', 'D22.5', 'Melanocytic nevi of trunk', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_60', 'D22.60', 'Melanocytic nevi of unspecified upper limb, including shoulder', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_70', 'D22.70', 'Melanocytic nevi of unspecified lower limb, including hip', 'Benign neoplasms', FALSE, 'dermatology'),
  ('dx_d22_9', 'D22.9', 'Melanocytic nevi, unspecified', 'Benign neoplasms', TRUE, 'dermatology'),

  -- Seborrheic keratosis
  ('dx_l82_0', 'L82.0', 'Inflamed seborrheic keratosis', 'Benign skin lesions', FALSE, 'dermatology'),
  ('dx_l82_1', 'L82.1', 'Other seborrheic keratosis', 'Benign skin lesions', TRUE, 'dermatology'),

  -- Actinic keratosis
  ('dx_l57_0', 'L57.0', 'Actinic keratosis', 'Precancerous lesions', TRUE, 'dermatology'),

  -- Fungal infections
  ('dx_b35_0', 'B35.0', 'Tinea barbae and tinea capitis', 'Fungal infections', FALSE, 'dermatology'),
  ('dx_b35_1', 'B35.1', 'Tinea unguium (onychomycosis)', 'Fungal infections', TRUE, 'dermatology'),
  ('dx_b35_2', 'B35.2', 'Tinea manuum', 'Fungal infections', FALSE, 'dermatology'),
  ('dx_b35_3', 'B35.3', 'Tinea pedis (athlete foot)', 'Fungal infections', TRUE, 'dermatology'),
  ('dx_b35_4', 'B35.4', 'Tinea corporis', 'Fungal infections', TRUE, 'dermatology'),
  ('dx_b35_5', 'B35.5', 'Tinea imbricata', 'Fungal infections', FALSE, 'dermatology'),
  ('dx_b35_6', 'B35.6', 'Tinea cruris', 'Fungal infections', TRUE, 'dermatology'),
  ('dx_b35_8', 'B35.8', 'Other dermatophytoses', 'Fungal infections', FALSE, 'dermatology'),
  ('dx_b35_9', 'B35.9', 'Dermatophytosis, unspecified', 'Fungal infections', FALSE, 'dermatology'),

  -- Herpes zoster (Shingles)
  ('dx_b02_0', 'B02.0', 'Zoster encephalitis', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_1', 'B02.1', 'Zoster meningitis', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_21', 'B02.21', 'Postherpetic geniculate ganglionitis', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_22', 'B02.22', 'Postherpetic trigeminal neuralgia', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_23', 'B02.23', 'Postherpetic polyneuropathy', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_24', 'B02.24', 'Postherpetic myelitis', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_29', 'B02.29', 'Other postherpetic nervous system involvement', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_30', 'B02.30', 'Zoster ocular disease, unspecified', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_7', 'B02.7', 'Disseminated zoster', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_8', 'B02.8', 'Zoster with other complications', 'Viral infections', FALSE, 'dermatology'),
  ('dx_b02_9', 'B02.9', 'Zoster without complications', 'Viral infections', TRUE, 'dermatology'),

  -- Contact dermatitis
  ('dx_l23_0', 'L23.0', 'Allergic contact dermatitis due to metals', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_1', 'L23.1', 'Allergic contact dermatitis due to adhesives', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_2', 'L23.2', 'Allergic contact dermatitis due to cosmetics', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_3', 'L23.3', 'Allergic contact dermatitis due to drugs in contact with skin', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_4', 'L23.4', 'Allergic contact dermatitis due to dyes', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_5', 'L23.5', 'Allergic contact dermatitis due to other chemical products', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_6', 'L23.6', 'Allergic contact dermatitis due to food in contact with skin', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_7', 'L23.7', 'Allergic contact dermatitis due to plants, except food', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_81', 'L23.81', 'Allergic contact dermatitis due to animal (cat) (dog) dander', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_89', 'L23.89', 'Allergic contact dermatitis due to other agents', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l23_9', 'L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis and eczema', TRUE, 'dermatology'),

  -- Other dermatitis
  ('dx_l30_0', 'L30.0', 'Nummular dermatitis', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_1', 'L30.1', 'Dyshidrosis [pompholyx]', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_2', 'L30.2', 'Cutaneous autosensitization', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_3', 'L30.3', 'Infective dermatitis', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_4', 'L30.4', 'Erythema intertrigo', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_8', 'L30.8', 'Other specified dermatitis', 'Dermatitis and eczema', FALSE, 'dermatology'),
  ('dx_l30_9', 'L30.9', 'Dermatitis, unspecified', 'Dermatitis and eczema', TRUE, 'dermatology'),

  -- Warts
  ('dx_b07_0', 'B07.0', 'Plantar wart', 'Viral infections', TRUE, 'dermatology'),
  ('dx_b07_8', 'B07.8', 'Other viral warts', 'Viral infections', TRUE, 'dermatology'),
  ('dx_b07_9', 'B07.9', 'Viral wart, unspecified', 'Viral infections', TRUE, 'dermatology'),

  -- Urticaria (Hives)
  ('dx_l50_0', 'L50.0', 'Allergic urticaria', 'Urticaria and erythema', TRUE, 'dermatology'),
  ('dx_l50_1', 'L50.1', 'Idiopathic urticaria', 'Urticaria and erythema', TRUE, 'dermatology'),
  ('dx_l50_2', 'L50.2', 'Urticaria due to cold and heat', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_3', 'L50.3', 'Dermatographic urticaria', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_4', 'L50.4', 'Vibratory urticaria', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_5', 'L50.5', 'Cholinergic urticaria', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_6', 'L50.6', 'Contact urticaria', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_8', 'L50.8', 'Other urticaria', 'Urticaria and erythema', FALSE, 'dermatology'),
  ('dx_l50_9', 'L50.9', 'Urticaria, unspecified', 'Urticaria and erythema', TRUE, 'dermatology')
ON CONFLICT (icd10_code) DO NOTHING;

-- Comments
COMMENT ON TABLE claim_diagnoses IS 'Diagnoses associated with insurance claims';
COMMENT ON TABLE claim_charges IS 'Line items (procedures/services) on claims with CPT codes';
COMMENT ON TABLE diagnosis_codes IS 'Master list of ICD-10 diagnosis codes for dermatology';
