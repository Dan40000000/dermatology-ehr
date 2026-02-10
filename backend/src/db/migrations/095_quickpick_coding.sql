-- Quick-Pick Coding System for Dermatology
-- Provides one-tap diagnosis and procedure coding for common dermatology conditions

-- ============================================
-- TABLES
-- ============================================

-- Quick pick categories for organizing codes
CREATE TABLE IF NOT EXISTS quickpick_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    icon VARCHAR(50),
    color VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- Quick pick items (individual diagnosis/procedure codes)
CREATE TABLE IF NOT EXISTS quickpick_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES quickpick_categories(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    code_type VARCHAR(10) NOT NULL CHECK (code_type IN ('CPT', 'ICD10')),
    description TEXT NOT NULL,
    short_name VARCHAR(50),
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code, code_type)
);

-- Provider-specific quick pick preferences
CREATE TABLE IF NOT EXISTS provider_quickpicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES quickpick_items(id) ON DELETE CASCADE,
    custom_order INTEGER,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, item_id)
);

-- Quick pick bundles (groups of codes commonly used together)
CREATE TABLE IF NOT EXISTS quickpick_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- Encounter codes (links codes to encounters)
CREATE TABLE IF NOT EXISTS encounter_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    quickpick_item_id UUID REFERENCES quickpick_items(id) ON DELETE SET NULL,
    code VARCHAR(20) NOT NULL,
    code_type VARCHAR(10) NOT NULL CHECK (code_type IN ('CPT', 'ICD10')),
    description TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    modifier VARCHAR(10),
    units INTEGER DEFAULT 1,
    added_by UUID REFERENCES users(id),
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_quickpick_categories_tenant ON quickpick_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quickpick_categories_order ON quickpick_categories(tenant_id, display_order);

CREATE INDEX IF NOT EXISTS idx_quickpick_items_tenant ON quickpick_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quickpick_items_category ON quickpick_items(category_id);
CREATE INDEX IF NOT EXISTS idx_quickpick_items_code ON quickpick_items(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_quickpick_items_type ON quickpick_items(tenant_id, code_type);
CREATE INDEX IF NOT EXISTS idx_quickpick_items_usage ON quickpick_items(tenant_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_quickpick_items_search ON quickpick_items(tenant_id, code, description);

CREATE INDEX IF NOT EXISTS idx_provider_quickpicks_provider ON provider_quickpicks(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_quickpicks_item ON provider_quickpicks(item_id);
CREATE INDEX IF NOT EXISTS idx_provider_quickpicks_usage ON provider_quickpicks(provider_id, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_quickpick_bundles_tenant ON quickpick_bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quickpick_bundles_usage ON quickpick_bundles(tenant_id, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_encounter_codes_encounter ON encounter_codes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_codes_tenant ON encounter_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encounter_codes_type ON encounter_codes(encounter_id, code_type);

-- ============================================
-- SEED DATA FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION seed_quickpick_data(p_tenant_id UUID)
RETURNS void AS $$
DECLARE
    v_acne_cat_id UUID;
    v_eczema_cat_id UUID;
    v_psoriasis_cat_id UUID;
    v_cancer_cat_id UUID;
    v_nevi_cat_id UUID;
    v_warts_cat_id UUID;
    v_rosacea_cat_id UUID;
    v_seb_kat_id UUID;
    v_em_cat_id UUID;
    v_destruction_cat_id UUID;
    v_biopsy_cat_id UUID;
    v_excision_cat_id UUID;
    v_repair_cat_id UUID;
BEGIN
    -- Create diagnosis categories
    INSERT INTO quickpick_categories (tenant_id, name, display_order, icon, color)
    VALUES
        (p_tenant_id, 'Acne', 1, 'face', '#FF6B6B'),
        (p_tenant_id, 'Eczema', 2, 'allergy', '#4ECDC4'),
        (p_tenant_id, 'Psoriasis', 3, 'psoriasis', '#45B7D1'),
        (p_tenant_id, 'Skin Cancer', 4, 'warning', '#FF4757'),
        (p_tenant_id, 'Nevi', 5, 'circle', '#A55EEA'),
        (p_tenant_id, 'Warts', 6, 'virus', '#FFA502'),
        (p_tenant_id, 'Rosacea', 7, 'face-smile', '#FF6348'),
        (p_tenant_id, 'Seborrheic Keratosis', 8, 'skin', '#747D8C'),
        (p_tenant_id, 'E&M Codes', 10, 'clipboard', '#2ED573'),
        (p_tenant_id, 'Destruction', 11, 'fire', '#FF4500'),
        (p_tenant_id, 'Biopsies', 12, 'scalpel', '#3742FA'),
        (p_tenant_id, 'Excisions', 13, 'cut', '#1E90FF'),
        (p_tenant_id, 'Repairs', 14, 'stitch', '#7B68EE')
    ON CONFLICT (tenant_id, name) DO NOTHING
    RETURNING id INTO v_acne_cat_id;

    -- Get category IDs
    SELECT id INTO v_acne_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Acne';
    SELECT id INTO v_eczema_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Eczema';
    SELECT id INTO v_psoriasis_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Psoriasis';
    SELECT id INTO v_cancer_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Skin Cancer';
    SELECT id INTO v_nevi_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Nevi';
    SELECT id INTO v_warts_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Warts';
    SELECT id INTO v_rosacea_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Rosacea';
    SELECT id INTO v_seb_kat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Seborrheic Keratosis';
    SELECT id INTO v_em_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'E&M Codes';
    SELECT id INTO v_destruction_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Destruction';
    SELECT id INTO v_biopsy_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Biopsies';
    SELECT id INTO v_excision_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Excisions';
    SELECT id INTO v_repair_cat_id FROM quickpick_categories WHERE tenant_id = p_tenant_id AND name = 'Repairs';

    -- Acne diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_acne_cat_id, 'L70.0', 'ICD10', 'Acne vulgaris', 'Acne Vulgaris'),
        (p_tenant_id, v_acne_cat_id, 'L70.1', 'ICD10', 'Acne conglobata', 'Acne Conglobata'),
        (p_tenant_id, v_acne_cat_id, 'L70.8', 'ICD10', 'Other acne', 'Other Acne'),
        (p_tenant_id, v_acne_cat_id, 'L70.9', 'ICD10', 'Acne, unspecified', 'Acne NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Eczema diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_eczema_cat_id, 'L20.0', 'ICD10', 'Besnier''s prurigo (atopic dermatitis)', 'Atopic Derm'),
        (p_tenant_id, v_eczema_cat_id, 'L20.9', 'ICD10', 'Atopic dermatitis, unspecified', 'Atopic Derm NOS'),
        (p_tenant_id, v_eczema_cat_id, 'L30.9', 'ICD10', 'Dermatitis, unspecified', 'Derm NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Psoriasis diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_psoriasis_cat_id, 'L40.0', 'ICD10', 'Psoriasis vulgaris', 'Plaque Psoriasis'),
        (p_tenant_id, v_psoriasis_cat_id, 'L40.1', 'ICD10', 'Generalized pustular psoriasis', 'Pustular Psoriasis'),
        (p_tenant_id, v_psoriasis_cat_id, 'L40.4', 'ICD10', 'Guttate psoriasis', 'Guttate Psoriasis'),
        (p_tenant_id, v_psoriasis_cat_id, 'L40.9', 'ICD10', 'Psoriasis, unspecified', 'Psoriasis NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Skin cancer diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_cancer_cat_id, 'C44.01', 'ICD10', 'Basal cell carcinoma of skin of lip', 'BCC Lip'),
        (p_tenant_id, v_cancer_cat_id, 'C44.11', 'ICD10', 'Basal cell carcinoma of skin of eyelid', 'BCC Eyelid'),
        (p_tenant_id, v_cancer_cat_id, 'C44.31', 'ICD10', 'Basal cell carcinoma of skin of other parts of face', 'BCC Face'),
        (p_tenant_id, v_cancer_cat_id, 'C44.41', 'ICD10', 'Basal cell carcinoma of skin of scalp and neck', 'BCC Scalp/Neck'),
        (p_tenant_id, v_cancer_cat_id, 'C44.51', 'ICD10', 'Basal cell carcinoma of skin of trunk', 'BCC Trunk'),
        (p_tenant_id, v_cancer_cat_id, 'C44.61', 'ICD10', 'Basal cell carcinoma of skin of upper limb', 'BCC Upper Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C44.71', 'ICD10', 'Basal cell carcinoma of skin of lower limb', 'BCC Lower Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C44.02', 'ICD10', 'Squamous cell carcinoma of skin of lip', 'SCC Lip'),
        (p_tenant_id, v_cancer_cat_id, 'C44.12', 'ICD10', 'Squamous cell carcinoma of skin of eyelid', 'SCC Eyelid'),
        (p_tenant_id, v_cancer_cat_id, 'C44.32', 'ICD10', 'Squamous cell carcinoma of skin of other parts of face', 'SCC Face'),
        (p_tenant_id, v_cancer_cat_id, 'C44.42', 'ICD10', 'Squamous cell carcinoma of skin of scalp and neck', 'SCC Scalp/Neck'),
        (p_tenant_id, v_cancer_cat_id, 'C44.52', 'ICD10', 'Squamous cell carcinoma of skin of trunk', 'SCC Trunk'),
        (p_tenant_id, v_cancer_cat_id, 'C44.62', 'ICD10', 'Squamous cell carcinoma of skin of upper limb', 'SCC Upper Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C44.72', 'ICD10', 'Squamous cell carcinoma of skin of lower limb', 'SCC Lower Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C43.0', 'ICD10', 'Malignant melanoma of lip', 'Melanoma Lip'),
        (p_tenant_id, v_cancer_cat_id, 'C43.1', 'ICD10', 'Malignant melanoma of eyelid', 'Melanoma Eyelid'),
        (p_tenant_id, v_cancer_cat_id, 'C43.3', 'ICD10', 'Malignant melanoma of other parts of face', 'Melanoma Face'),
        (p_tenant_id, v_cancer_cat_id, 'C43.4', 'ICD10', 'Malignant melanoma of scalp and neck', 'Melanoma Scalp/Neck'),
        (p_tenant_id, v_cancer_cat_id, 'C43.5', 'ICD10', 'Malignant melanoma of trunk', 'Melanoma Trunk'),
        (p_tenant_id, v_cancer_cat_id, 'C43.6', 'ICD10', 'Malignant melanoma of upper limb', 'Melanoma Upper Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C43.7', 'ICD10', 'Malignant melanoma of lower limb', 'Melanoma Lower Limb'),
        (p_tenant_id, v_cancer_cat_id, 'C43.9', 'ICD10', 'Malignant melanoma of skin, unspecified', 'Melanoma NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Nevi diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_nevi_cat_id, 'D22.0', 'ICD10', 'Melanocytic nevi of lip', 'Nevus Lip'),
        (p_tenant_id, v_nevi_cat_id, 'D22.1', 'ICD10', 'Melanocytic nevi of eyelid', 'Nevus Eyelid'),
        (p_tenant_id, v_nevi_cat_id, 'D22.3', 'ICD10', 'Melanocytic nevi of other parts of face', 'Nevus Face'),
        (p_tenant_id, v_nevi_cat_id, 'D22.4', 'ICD10', 'Melanocytic nevi of scalp and neck', 'Nevus Scalp/Neck'),
        (p_tenant_id, v_nevi_cat_id, 'D22.5', 'ICD10', 'Melanocytic nevi of trunk', 'Nevus Trunk'),
        (p_tenant_id, v_nevi_cat_id, 'D22.6', 'ICD10', 'Melanocytic nevi of upper limb', 'Nevus Upper Limb'),
        (p_tenant_id, v_nevi_cat_id, 'D22.7', 'ICD10', 'Melanocytic nevi of lower limb', 'Nevus Lower Limb'),
        (p_tenant_id, v_nevi_cat_id, 'D22.9', 'ICD10', 'Melanocytic nevi, unspecified', 'Nevus NOS'),
        (p_tenant_id, v_nevi_cat_id, 'D23.0', 'ICD10', 'Other benign neoplasm of skin of lip', 'Benign Skin Lip'),
        (p_tenant_id, v_nevi_cat_id, 'D23.3', 'ICD10', 'Other benign neoplasm of skin of other parts of face', 'Benign Skin Face'),
        (p_tenant_id, v_nevi_cat_id, 'D23.4', 'ICD10', 'Other benign neoplasm of skin of scalp and neck', 'Benign Skin Scalp/Neck'),
        (p_tenant_id, v_nevi_cat_id, 'D23.5', 'ICD10', 'Other benign neoplasm of skin of trunk', 'Benign Skin Trunk'),
        (p_tenant_id, v_nevi_cat_id, 'D23.6', 'ICD10', 'Other benign neoplasm of skin of upper limb', 'Benign Skin Upper Limb'),
        (p_tenant_id, v_nevi_cat_id, 'D23.7', 'ICD10', 'Other benign neoplasm of skin of lower limb', 'Benign Skin Lower Limb'),
        (p_tenant_id, v_nevi_cat_id, 'D23.9', 'ICD10', 'Other benign neoplasm of skin, unspecified', 'Benign Skin NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Warts diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_warts_cat_id, 'B07.0', 'ICD10', 'Plantar wart', 'Plantar Wart'),
        (p_tenant_id, v_warts_cat_id, 'B07.8', 'ICD10', 'Other viral warts', 'Other Warts'),
        (p_tenant_id, v_warts_cat_id, 'B07.9', 'ICD10', 'Viral wart, unspecified', 'Wart NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Rosacea diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_rosacea_cat_id, 'L71.0', 'ICD10', 'Perioral dermatitis', 'Perioral Derm'),
        (p_tenant_id, v_rosacea_cat_id, 'L71.1', 'ICD10', 'Rhinophyma', 'Rhinophyma'),
        (p_tenant_id, v_rosacea_cat_id, 'L71.8', 'ICD10', 'Other rosacea', 'Other Rosacea'),
        (p_tenant_id, v_rosacea_cat_id, 'L71.9', 'ICD10', 'Rosacea, unspecified', 'Rosacea NOS')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Seborrheic keratosis diagnoses (ICD-10)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_seb_kat_id, 'L82.0', 'ICD10', 'Inflamed seborrheic keratosis', 'Inflamed SK'),
        (p_tenant_id, v_seb_kat_id, 'L82.1', 'ICD10', 'Other seborrheic keratosis', 'SK')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- E&M Codes (CPT) - Established patients
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_em_cat_id, '99212', 'CPT', 'Office/outpatient visit, established patient, straightforward', 'E/M Est L2'),
        (p_tenant_id, v_em_cat_id, '99213', 'CPT', 'Office/outpatient visit, established patient, low complexity', 'E/M Est L3'),
        (p_tenant_id, v_em_cat_id, '99214', 'CPT', 'Office/outpatient visit, established patient, moderate complexity', 'E/M Est L4'),
        (p_tenant_id, v_em_cat_id, '99215', 'CPT', 'Office/outpatient visit, established patient, high complexity', 'E/M Est L5'),
        (p_tenant_id, v_em_cat_id, '99202', 'CPT', 'Office/outpatient visit, new patient, straightforward', 'E/M New L2'),
        (p_tenant_id, v_em_cat_id, '99203', 'CPT', 'Office/outpatient visit, new patient, low complexity', 'E/M New L3'),
        (p_tenant_id, v_em_cat_id, '99204', 'CPT', 'Office/outpatient visit, new patient, moderate complexity', 'E/M New L4'),
        (p_tenant_id, v_em_cat_id, '99205', 'CPT', 'Office/outpatient visit, new patient, high complexity', 'E/M New L5')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Destruction codes (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_destruction_cat_id, '17000', 'CPT', 'Destruction of premalignant lesion, first lesion', 'Destr PreMal 1st'),
        (p_tenant_id, v_destruction_cat_id, '17003', 'CPT', 'Destruction of premalignant lesions, 2-14 lesions, each', 'Destr PreMal 2-14'),
        (p_tenant_id, v_destruction_cat_id, '17004', 'CPT', 'Destruction of premalignant lesions, 15 or more lesions', 'Destr PreMal 15+'),
        (p_tenant_id, v_destruction_cat_id, '17110', 'CPT', 'Destruction of benign lesions, up to 14 lesions', 'Destr Benign 1-14'),
        (p_tenant_id, v_destruction_cat_id, '17111', 'CPT', 'Destruction of benign lesions, 15 or more lesions', 'Destr Benign 15+')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Biopsy codes (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_biopsy_cat_id, '11102', 'CPT', 'Tangential biopsy of skin, single lesion', 'Shave Bx 1st'),
        (p_tenant_id, v_biopsy_cat_id, '11103', 'CPT', 'Tangential biopsy of skin, each additional lesion', 'Shave Bx Add'),
        (p_tenant_id, v_biopsy_cat_id, '11104', 'CPT', 'Punch biopsy of skin, single lesion', 'Punch Bx 1st'),
        (p_tenant_id, v_biopsy_cat_id, '11105', 'CPT', 'Punch biopsy of skin, each additional lesion', 'Punch Bx Add'),
        (p_tenant_id, v_biopsy_cat_id, '11106', 'CPT', 'Incisional biopsy of skin, single lesion', 'Incis Bx 1st'),
        (p_tenant_id, v_biopsy_cat_id, '11107', 'CPT', 'Incisional biopsy of skin, each additional lesion', 'Incis Bx Add')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Excision codes - Benign (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_excision_cat_id, '11400', 'CPT', 'Excision benign lesion, trunk/arms/legs, 0.5cm or less', 'Exc Ben T/E 0.5'),
        (p_tenant_id, v_excision_cat_id, '11401', 'CPT', 'Excision benign lesion, trunk/arms/legs, 0.6-1.0cm', 'Exc Ben T/E 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11402', 'CPT', 'Excision benign lesion, trunk/arms/legs, 1.1-2.0cm', 'Exc Ben T/E 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11403', 'CPT', 'Excision benign lesion, trunk/arms/legs, 2.1-3.0cm', 'Exc Ben T/E 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11404', 'CPT', 'Excision benign lesion, trunk/arms/legs, 3.1-4.0cm', 'Exc Ben T/E 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11406', 'CPT', 'Excision benign lesion, trunk/arms/legs, >4.0cm', 'Exc Ben T/E >4'),
        (p_tenant_id, v_excision_cat_id, '11420', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, 0.5cm or less', 'Exc Ben S/N 0.5'),
        (p_tenant_id, v_excision_cat_id, '11421', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, 0.6-1.0cm', 'Exc Ben S/N 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11422', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, 1.1-2.0cm', 'Exc Ben S/N 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11423', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, 2.1-3.0cm', 'Exc Ben S/N 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11424', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, 3.1-4.0cm', 'Exc Ben S/N 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11426', 'CPT', 'Excision benign lesion, scalp/neck/hands/feet/genitalia, >4.0cm', 'Exc Ben S/N >4'),
        (p_tenant_id, v_excision_cat_id, '11440', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.5cm or less', 'Exc Ben Face 0.5'),
        (p_tenant_id, v_excision_cat_id, '11441', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.6-1.0cm', 'Exc Ben Face 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11442', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 1.1-2.0cm', 'Exc Ben Face 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11443', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 2.1-3.0cm', 'Exc Ben Face 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11444', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 3.1-4.0cm', 'Exc Ben Face 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11446', 'CPT', 'Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, >4.0cm', 'Exc Ben Face >4')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Excision codes - Malignant (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_excision_cat_id, '11600', 'CPT', 'Excision malignant lesion, trunk/arms/legs, 0.5cm or less', 'Exc Mal T/E 0.5'),
        (p_tenant_id, v_excision_cat_id, '11601', 'CPT', 'Excision malignant lesion, trunk/arms/legs, 0.6-1.0cm', 'Exc Mal T/E 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11602', 'CPT', 'Excision malignant lesion, trunk/arms/legs, 1.1-2.0cm', 'Exc Mal T/E 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11603', 'CPT', 'Excision malignant lesion, trunk/arms/legs, 2.1-3.0cm', 'Exc Mal T/E 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11604', 'CPT', 'Excision malignant lesion, trunk/arms/legs, 3.1-4.0cm', 'Exc Mal T/E 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11606', 'CPT', 'Excision malignant lesion, trunk/arms/legs, >4.0cm', 'Exc Mal T/E >4'),
        (p_tenant_id, v_excision_cat_id, '11620', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, 0.5cm or less', 'Exc Mal S/N 0.5'),
        (p_tenant_id, v_excision_cat_id, '11621', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, 0.6-1.0cm', 'Exc Mal S/N 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11622', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, 1.1-2.0cm', 'Exc Mal S/N 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11623', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, 2.1-3.0cm', 'Exc Mal S/N 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11624', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, 3.1-4.0cm', 'Exc Mal S/N 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11626', 'CPT', 'Excision malignant lesion, scalp/neck/hands/feet/genitalia, >4.0cm', 'Exc Mal S/N >4'),
        (p_tenant_id, v_excision_cat_id, '11640', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.5cm or less', 'Exc Mal Face 0.5'),
        (p_tenant_id, v_excision_cat_id, '11641', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.6-1.0cm', 'Exc Mal Face 0.6-1'),
        (p_tenant_id, v_excision_cat_id, '11642', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, 1.1-2.0cm', 'Exc Mal Face 1.1-2'),
        (p_tenant_id, v_excision_cat_id, '11643', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, 2.1-3.0cm', 'Exc Mal Face 2.1-3'),
        (p_tenant_id, v_excision_cat_id, '11644', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, 3.1-4.0cm', 'Exc Mal Face 3.1-4'),
        (p_tenant_id, v_excision_cat_id, '11646', 'CPT', 'Excision malignant lesion, face/ears/eyelids/nose/lips/mucous membrane, >4.0cm', 'Exc Mal Face >4')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Repair codes - Simple (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_repair_cat_id, '12001', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, 2.5cm or less', 'Simple Repair 2.5'),
        (p_tenant_id, v_repair_cat_id, '12002', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, 2.6-7.5cm', 'Simple Repair 2.6-7.5'),
        (p_tenant_id, v_repair_cat_id, '12004', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, 7.6-12.5cm', 'Simple Repair 7.6-12.5'),
        (p_tenant_id, v_repair_cat_id, '12005', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, 12.6-20.0cm', 'Simple Repair 12.6-20'),
        (p_tenant_id, v_repair_cat_id, '12006', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, 20.1-30.0cm', 'Simple Repair 20.1-30'),
        (p_tenant_id, v_repair_cat_id, '12007', 'CPT', 'Simple repair, scalp/neck/axillae/ext genitalia/trunk/extremities, >30.0cm', 'Simple Repair >30')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Repair codes - Intermediate (CPT)
    INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
    VALUES
        (p_tenant_id, v_repair_cat_id, '12031', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, 2.5cm or less', 'Intermed Repair 2.5'),
        (p_tenant_id, v_repair_cat_id, '12032', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, 2.6-7.5cm', 'Intermed Repair 2.6-7.5'),
        (p_tenant_id, v_repair_cat_id, '12034', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, 7.6-12.5cm', 'Intermed Repair 7.6-12.5'),
        (p_tenant_id, v_repair_cat_id, '12035', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, 12.6-20.0cm', 'Intermed Repair 12.6-20'),
        (p_tenant_id, v_repair_cat_id, '12036', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, 20.1-30.0cm', 'Intermed Repair 20.1-30'),
        (p_tenant_id, v_repair_cat_id, '12037', 'CPT', 'Intermediate repair, scalp/axillae/trunk/extremities, >30.0cm', 'Intermed Repair >30'),
        (p_tenant_id, v_repair_cat_id, '12041', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, 2.5cm or less', 'Intermed Repair N/H/F 2.5'),
        (p_tenant_id, v_repair_cat_id, '12042', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, 2.6-7.5cm', 'Intermed Repair N/H/F 2.6-7.5'),
        (p_tenant_id, v_repair_cat_id, '12044', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, 7.6-12.5cm', 'Intermed Repair N/H/F 7.6-12.5'),
        (p_tenant_id, v_repair_cat_id, '12045', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, 12.6-20.0cm', 'Intermed Repair N/H/F 12.6-20'),
        (p_tenant_id, v_repair_cat_id, '12046', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, 20.1-30.0cm', 'Intermed Repair N/H/F 20.1-30'),
        (p_tenant_id, v_repair_cat_id, '12047', 'CPT', 'Intermediate repair, neck/hands/feet/external genitalia, >30.0cm', 'Intermed Repair N/H/F >30'),
        (p_tenant_id, v_repair_cat_id, '12051', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 2.5cm or less', 'Intermed Repair Face 2.5'),
        (p_tenant_id, v_repair_cat_id, '12052', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 2.6-5.0cm', 'Intermed Repair Face 2.6-5'),
        (p_tenant_id, v_repair_cat_id, '12053', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 5.1-7.5cm', 'Intermed Repair Face 5.1-7.5'),
        (p_tenant_id, v_repair_cat_id, '12054', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 7.6-12.5cm', 'Intermed Repair Face 7.6-12.5'),
        (p_tenant_id, v_repair_cat_id, '12055', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 12.6-20.0cm', 'Intermed Repair Face 12.6-20'),
        (p_tenant_id, v_repair_cat_id, '12056', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, 20.1-30.0cm', 'Intermed Repair Face 20.1-30'),
        (p_tenant_id, v_repair_cat_id, '12057', 'CPT', 'Intermediate repair, face/ears/eyelids/nose/lips/mucous membranes, >30.0cm', 'Intermed Repair Face >30')
    ON CONFLICT (tenant_id, code, code_type) DO NOTHING;

    -- Create common bundles
    INSERT INTO quickpick_bundles (tenant_id, name, description, items)
    VALUES
        (p_tenant_id, 'Skin Cancer Visit - BCC', 'Standard BCC workup with biopsy',
         '[{"code": "99214", "codeType": "CPT"}, {"code": "11104", "codeType": "CPT"}, {"code": "C44.31", "codeType": "ICD10"}]'),
        (p_tenant_id, 'Acne Follow-up', 'Established patient acne visit',
         '[{"code": "99213", "codeType": "CPT"}, {"code": "L70.0", "codeType": "ICD10"}]'),
        (p_tenant_id, 'Wart Destruction', 'Multiple wart destruction visit',
         '[{"code": "99213", "codeType": "CPT"}, {"code": "17110", "codeType": "CPT"}, {"code": "B07.9", "codeType": "ICD10"}]'),
        (p_tenant_id, 'Psoriasis Management', 'Psoriasis follow-up visit',
         '[{"code": "99214", "codeType": "CPT"}, {"code": "L40.0", "codeType": "ICD10"}]'),
        (p_tenant_id, 'Eczema Visit', 'Atopic dermatitis follow-up',
         '[{"code": "99213", "codeType": "CPT"}, {"code": "L20.9", "codeType": "ICD10"}]'),
        (p_tenant_id, 'SK Removal', 'Seborrheic keratosis destruction',
         '[{"code": "99213", "codeType": "CPT"}, {"code": "17110", "codeType": "CPT"}, {"code": "L82.1", "codeType": "ICD10"}]'),
        (p_tenant_id, 'Melanoma Excision', 'Melanoma excision with intermediate repair',
         '[{"code": "99215", "codeType": "CPT"}, {"code": "11640", "codeType": "CPT"}, {"code": "12051", "codeType": "CPT"}, {"code": "C43.9", "codeType": "ICD10"}]')
    ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_quickpick_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quickpick_categories_updated ON quickpick_categories;
CREATE TRIGGER quickpick_categories_updated
    BEFORE UPDATE ON quickpick_categories
    FOR EACH ROW EXECUTE FUNCTION update_quickpick_timestamp();

DROP TRIGGER IF EXISTS quickpick_items_updated ON quickpick_items;
CREATE TRIGGER quickpick_items_updated
    BEFORE UPDATE ON quickpick_items
    FOR EACH ROW EXECUTE FUNCTION update_quickpick_timestamp();

DROP TRIGGER IF EXISTS provider_quickpicks_updated ON provider_quickpicks;
CREATE TRIGGER provider_quickpicks_updated
    BEFORE UPDATE ON provider_quickpicks
    FOR EACH ROW EXECUTE FUNCTION update_quickpick_timestamp();

DROP TRIGGER IF EXISTS quickpick_bundles_updated ON quickpick_bundles;
CREATE TRIGGER quickpick_bundles_updated
    BEFORE UPDATE ON quickpick_bundles
    FOR EACH ROW EXECUTE FUNCTION update_quickpick_timestamp();

DROP TRIGGER IF EXISTS encounter_codes_updated ON encounter_codes;
CREATE TRIGGER encounter_codes_updated
    BEFORE UPDATE ON encounter_codes
    FOR EACH ROW EXECUTE FUNCTION update_quickpick_timestamp();
