-- Mohs Micrographic Surgery Workflow System
-- Migration 100: Complete Mohs surgery tracking

-- ============================================================================
-- MOHS CASES TABLE
-- Main table for tracking Mohs surgery cases
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    encounter_id UUID REFERENCES encounters(id),
    surgeon_id UUID NOT NULL REFERENCES providers(id),
    assistant_id UUID REFERENCES providers(id),

    -- Case identification
    case_number VARCHAR(50) UNIQUE,
    case_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Tumor information
    tumor_location VARCHAR(255) NOT NULL,
    tumor_location_code VARCHAR(20),
    tumor_laterality VARCHAR(20) CHECK (tumor_laterality IN ('left', 'right', 'midline', 'bilateral')),
    tumor_type VARCHAR(100) NOT NULL,
    tumor_subtype VARCHAR(100),
    tumor_histology VARCHAR(255),
    clinical_description TEXT,

    -- Pre-operative measurements
    pre_op_size_mm DECIMAL(6,2),
    pre_op_width_mm DECIMAL(6,2),
    pre_op_length_mm DECIMAL(6,2),
    pre_op_depth_mm DECIMAL(6,2),

    -- Final defect measurements
    final_defect_size_mm DECIMAL(6,2),
    final_defect_width_mm DECIMAL(6,2),
    final_defect_length_mm DECIMAL(6,2),
    final_defect_depth_mm DECIMAL(6,2),

    -- Closure information
    closure_type VARCHAR(100),
    closure_subtype VARCHAR(100),
    closure_performed_by UUID REFERENCES providers(id),

    -- Case status workflow
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled',
        'pre_op',
        'in_progress',
        'reading',
        'closure',
        'post_op',
        'completed',
        'cancelled'
    )),

    -- Timing
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    total_stages INTEGER DEFAULT 0,

    -- Clinical notes
    pre_op_notes TEXT,
    post_op_notes TEXT,
    operative_notes TEXT,
    complications TEXT,

    -- Prior pathology reference
    prior_biopsy_id UUID REFERENCES biopsies(id),
    prior_pathology_diagnosis TEXT,
    prior_pathology_date DATE,

    -- Anesthesia
    anesthesia_type VARCHAR(100) DEFAULT 'local',
    anesthesia_agent VARCHAR(255),
    anesthesia_volume_ml DECIMAL(6,2),

    -- Photographs
    pre_op_photos JSONB DEFAULT '[]',
    post_op_photos JSONB DEFAULT '[]',

    -- Consent
    consent_obtained BOOLEAN DEFAULT FALSE,
    consent_signed_at TIMESTAMPTZ,
    consent_document_id UUID,

    -- CPT codes for billing
    mohs_cpt_codes TEXT[] DEFAULT '{}',
    repair_cpt_codes TEXT[] DEFAULT '{}',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- MOHS STAGES TABLE
-- Individual excision stages during Mohs procedure
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Stage identification
    stage_number INTEGER NOT NULL,

    -- Timing
    excision_time TIMESTAMPTZ,
    frozen_section_time TIMESTAMPTZ,
    reading_time TIMESTAMPTZ,

    -- Margin status
    margin_status VARCHAR(20) CHECK (margin_status IN ('positive', 'negative', 'partial', 'pending')),
    margin_status_details TEXT,

    -- Tissue processing
    tissue_processor VARCHAR(100),
    histology_tech VARCHAR(100),
    stain_type VARCHAR(100) DEFAULT 'H&E',

    -- Stage dimensions
    excision_width_mm DECIMAL(6,2),
    excision_length_mm DECIMAL(6,2),
    excision_depth_mm DECIMAL(6,2),

    -- Map reference
    map_image_url TEXT,
    map_svg TEXT,

    -- Notes
    notes TEXT,
    pathologist_notes TEXT,

    -- Number of blocks/sections
    block_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(case_id, stage_number)
);

-- ============================================================================
-- MOHS STAGE BLOCKS TABLE
-- Individual tissue blocks within a stage (A, B, C, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_stage_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES mohs_stages(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Block identification
    block_label VARCHAR(10) NOT NULL, -- A, B, C, D, etc.

    -- Position on map (clock positions like 12, 3, 6, 9)
    position VARCHAR(50),
    position_degrees INTEGER, -- 0-360 degrees

    -- Margin status for this block
    margin_status VARCHAR(20) CHECK (margin_status IN ('positive', 'negative', 'close', 'indeterminate')),

    -- Depth information
    depth_mm DECIMAL(6,2),
    deep_margin_status VARCHAR(20) CHECK (deep_margin_status IN ('positive', 'negative', 'close', 'indeterminate')),

    -- Tumor details in this block
    tumor_type_found VARCHAR(100),
    tumor_percentage DECIMAL(5,2), -- Percentage of block with tumor

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(stage_id, block_label)
);

-- ============================================================================
-- MOHS CLOSURES TABLE
-- Closure/repair documentation
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Closure type
    closure_type VARCHAR(100) NOT NULL CHECK (closure_type IN (
        'primary',
        'complex_linear',
        'advancement_flap',
        'rotation_flap',
        'transposition_flap',
        'interpolation_flap',
        'full_thickness_graft',
        'split_thickness_graft',
        'secondary_intention',
        'delayed',
        'referred'
    )),

    -- Closure subtype/details
    closure_subtype VARCHAR(100),

    -- Performed by
    closure_by UUID REFERENCES providers(id),
    closure_time TIMESTAMPTZ,

    -- Repair dimensions
    repair_length_cm DECIMAL(6,2),
    repair_width_cm DECIMAL(6,2),
    repair_area_sq_cm DECIMAL(8,2),

    -- CPT codes for repair
    repair_cpt_codes TEXT[] DEFAULT '{}',

    -- Flap/graft specific details stored as JSONB
    flap_graft_details JSONB DEFAULT '{}',
    -- Example structure for flap_graft_details:
    -- {
    --   "flap_type": "rotation",
    --   "donor_site": "cheek",
    --   "graft_source": "preauricular",
    --   "pedicle_width": 1.5,
    --   "arc_of_rotation": 90,
    --   "undermining_extent": "moderate"
    -- }

    -- Suture information
    suture_layers INTEGER,
    deep_sutures VARCHAR(100),
    superficial_sutures VARCHAR(100),
    suture_removal_days INTEGER,

    -- Dressing
    dressing_type VARCHAR(100),
    pressure_dressing BOOLEAN DEFAULT FALSE,

    -- Notes
    closure_notes TEXT,
    technique_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- MOHS MAPS TABLE
-- Tumor mapping and annotation storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES mohs_stages(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Map type
    map_type VARCHAR(50) DEFAULT 'tumor' CHECK (map_type IN (
        'tumor',
        'pre_op',
        'stage',
        'cumulative',
        'closure'
    )),

    -- SVG content for the map
    map_svg TEXT,

    -- Base image URL (if using image background)
    base_image_url TEXT,

    -- Annotations stored as JSONB array
    annotations JSONB DEFAULT '[]',
    -- Example annotation structure:
    -- [
    --   {
    --     "type": "tumor_margin",
    --     "points": [[x1,y1], [x2,y2], ...],
    --     "color": "#ff0000",
    --     "stage": 1,
    --     "block": "A"
    --   },
    --   {
    --     "type": "positive_margin",
    --     "clock_position": "3",
    --     "degrees": 90,
    --     "color": "#ff0000"
    --   }
    -- ]

    -- Orientation markers
    orientation_12_oclock VARCHAR(50), -- e.g., "superior", "medial"

    -- Scale information
    scale_mm_per_pixel DECIMAL(8,4),

    -- Notes
    notes TEXT,

    -- Version control for map edits
    version INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- ============================================================================
-- MOHS CPT CODE REFERENCE TABLE
-- Reference table for Mohs-related CPT codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS mohs_cpt_reference (
    code VARCHAR(10) PRIMARY KEY,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'mohs_excision', 'repair', 'graft', 'flap'
    body_area VARCHAR(50), -- 'head_neck', 'trunk_extremities', 'any'
    stage_type VARCHAR(50), -- 'first', 'additional', 'any'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert standard Mohs CPT codes
INSERT INTO mohs_cpt_reference (code, description, category, body_area, stage_type, notes) VALUES
-- Mohs surgery codes
('17311', 'Mohs micrographic technique, including removal of all gross tumor, surgical excision of tissue specimens, mapping, color coding of specimens, microscopic examination of specimens by the surgeon, and histopathologic preparation including routine stain(s) (eg, hematoxylin and eosin, toluidine blue), head, neck, hands, feet, genitalia, or any location with surgery directly involving muscle, cartilage, bone, tendon, major nerves, or vessels; first stage, up to 5 tissue blocks', 'mohs_excision', 'head_neck', 'first', 'First stage, head/neck/hands/feet/genitalia'),
('17312', 'Mohs micrographic technique; each additional stage after the first stage, up to 5 tissue blocks', 'mohs_excision', 'head_neck', 'additional', 'Additional stage, head/neck/hands/feet/genitalia'),
('17313', 'Mohs micrographic technique; each additional block after the first 5 tissue blocks, any stage', 'mohs_excision', 'any', 'any', 'Additional tissue blocks beyond first 5'),
('17314', 'Mohs micrographic technique, including removal of all gross tumor, surgical excision of tissue specimens, mapping, color coding of specimens, microscopic examination of specimens by the surgeon, and histopathologic preparation including routine stain(s) (eg, hematoxylin and eosin, toluidine blue), trunk, arms, or legs; first stage, up to 5 tissue blocks', 'mohs_excision', 'trunk_extremities', 'first', 'First stage, trunk/arms/legs'),
('17315', 'Mohs micrographic technique; each additional stage after the first stage, up to 5 tissue blocks', 'mohs_excision', 'trunk_extremities', 'additional', 'Additional stage, trunk/arms/legs'),

-- Common repair codes
('12031', 'Layer closure of wounds of scalp, axillae, trunk and/or extremities; 2.5 cm or less', 'repair', 'trunk_extremities', 'any', 'Simple repair'),
('12032', 'Layer closure; 2.6 cm to 7.5 cm', 'repair', 'trunk_extremities', 'any', 'Simple repair'),
('12041', 'Layer closure of wounds of neck, hands, feet and/or external genitalia; 2.5 cm or less', 'repair', 'head_neck', 'any', 'Simple repair'),
('12051', 'Layer closure of wounds of face, ears, eyelids, nose, lips and/or mucous membranes; 2.5 cm or less', 'repair', 'head_neck', 'any', 'Simple repair, face'),
('12052', 'Layer closure; 2.6 cm to 5.0 cm', 'repair', 'head_neck', 'any', 'Simple repair, face'),
('13131', 'Complex repair, forehead, cheeks, chin, mouth, neck, axillae, genitalia, hands and/or feet; 2.6 cm to 7.5 cm', 'repair', 'head_neck', 'any', 'Complex repair'),
('13132', 'Complex repair; each additional 5 cm or less', 'repair', 'head_neck', 'any', 'Complex repair add-on'),

-- Flap codes
('14040', 'Adjacent tissue transfer or rearrangement, forehead, cheeks, chin, mouth, neck, axillae, genitalia, hands and/or feet; defect 10 sq cm or less', 'flap', 'head_neck', 'any', 'Flap 10 sq cm or less'),
('14041', 'Adjacent tissue transfer; defect 10.1 sq cm to 30.0 sq cm', 'flap', 'head_neck', 'any', 'Flap 10.1-30 sq cm'),
('14060', 'Adjacent tissue transfer, eyelids, nose, ears and/or lips; defect 10 sq cm or less', 'flap', 'head_neck', 'any', 'Flap face 10 sq cm or less'),
('14061', 'Adjacent tissue transfer; defect 10.1 sq cm to 30.0 sq cm', 'flap', 'head_neck', 'any', 'Flap face 10.1-30 sq cm'),

-- Graft codes
('15120', 'Split-thickness autograft, face, scalp, eyelids, mouth, neck, ears, orbits, genitalia, hands, feet, and/or multiple digits; first 100 sq cm or less', 'graft', 'head_neck', 'any', 'Split graft face'),
('15200', 'Full thickness graft, free, including direct closure of donor site, trunk; 20 sq cm or less', 'graft', 'trunk_extremities', 'any', 'Full thickness graft trunk'),
('15220', 'Full thickness graft, scalp, arms, and/or legs; 20 sq cm or less', 'graft', 'any', 'any', 'Full thickness graft scalp/extremities'),
('15240', 'Full thickness graft, face, eyelids, mouth, neck, ears, orbits, genitalia, hands, feet, and/or multiple digits; 20 sq cm or less', 'graft', 'head_neck', 'any', 'Full thickness graft face')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_mohs_cases_tenant ON mohs_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_patient ON mohs_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_surgeon ON mohs_cases(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_date ON mohs_cases(case_date);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_status ON mohs_cases(status);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_case_number ON mohs_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_mohs_cases_tumor_type ON mohs_cases(tumor_type);

CREATE INDEX IF NOT EXISTS idx_mohs_stages_case ON mohs_stages(case_id);
CREATE INDEX IF NOT EXISTS idx_mohs_stages_tenant ON mohs_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mohs_stages_margin ON mohs_stages(margin_status);

CREATE INDEX IF NOT EXISTS idx_mohs_blocks_stage ON mohs_stage_blocks(stage_id);
CREATE INDEX IF NOT EXISTS idx_mohs_blocks_tenant ON mohs_stage_blocks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_mohs_closures_case ON mohs_closures(case_id);
CREATE INDEX IF NOT EXISTS idx_mohs_closures_tenant ON mohs_closures(tenant_id);

CREATE INDEX IF NOT EXISTS idx_mohs_maps_case ON mohs_maps(case_id);
CREATE INDEX IF NOT EXISTS idx_mohs_maps_stage ON mohs_maps(stage_id);
CREATE INDEX IF NOT EXISTS idx_mohs_maps_tenant ON mohs_maps(tenant_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update mohs_cases.updated_at on update
CREATE OR REPLACE FUNCTION update_mohs_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mohs_cases_updated_at ON mohs_cases;
CREATE TRIGGER trigger_mohs_cases_updated_at
    BEFORE UPDATE ON mohs_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_mohs_cases_updated_at();

-- Update stage count on mohs_cases when stages are added/removed
CREATE OR REPLACE FUNCTION update_mohs_case_stage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE mohs_cases
        SET total_stages = (SELECT COUNT(*) FROM mohs_stages WHERE case_id = NEW.case_id),
            updated_at = NOW()
        WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE mohs_cases
        SET total_stages = (SELECT COUNT(*) FROM mohs_stages WHERE case_id = OLD.case_id),
            updated_at = NOW()
        WHERE id = OLD.case_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mohs_stage_count ON mohs_stages;
CREATE TRIGGER trigger_mohs_stage_count
    AFTER INSERT OR DELETE ON mohs_stages
    FOR EACH ROW
    EXECUTE FUNCTION update_mohs_case_stage_count();

-- Update block count on mohs_stages when blocks are added/removed
CREATE OR REPLACE FUNCTION update_mohs_stage_block_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE mohs_stages
        SET block_count = (SELECT COUNT(*) FROM mohs_stage_blocks WHERE stage_id = NEW.stage_id),
            updated_at = NOW()
        WHERE id = NEW.stage_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE mohs_stages
        SET block_count = (SELECT COUNT(*) FROM mohs_stage_blocks WHERE stage_id = OLD.stage_id),
            updated_at = NOW()
        WHERE id = OLD.stage_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mohs_block_count ON mohs_stage_blocks;
CREATE TRIGGER trigger_mohs_block_count
    AFTER INSERT OR DELETE ON mohs_stage_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_mohs_stage_block_count();

-- Generate case number
CREATE OR REPLACE FUNCTION generate_mohs_case_number()
RETURNS TRIGGER AS $$
DECLARE
    year_str TEXT;
    count_today INTEGER;
    new_number TEXT;
BEGIN
    IF NEW.case_number IS NULL THEN
        year_str := TO_CHAR(NEW.case_date, 'YYYY');

        SELECT COUNT(*) + 1 INTO count_today
        FROM mohs_cases
        WHERE tenant_id = NEW.tenant_id
          AND EXTRACT(YEAR FROM case_date) = EXTRACT(YEAR FROM NEW.case_date);

        new_number := 'MOHS-' || year_str || '-' || LPAD(count_today::TEXT, 4, '0');
        NEW.case_number := new_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_mohs_case_number ON mohs_cases;
CREATE TRIGGER trigger_generate_mohs_case_number
    BEFORE INSERT ON mohs_cases
    FOR EACH ROW
    EXECUTE FUNCTION generate_mohs_case_number();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE mohs_cases IS 'Main table for Mohs micrographic surgery cases';
COMMENT ON TABLE mohs_stages IS 'Individual excision stages during Mohs procedure';
COMMENT ON TABLE mohs_stage_blocks IS 'Tissue blocks within each stage (A, B, C, etc.)';
COMMENT ON TABLE mohs_closures IS 'Closure/repair documentation for Mohs cases';
COMMENT ON TABLE mohs_maps IS 'Tumor mapping and annotations for Mohs cases';
COMMENT ON TABLE mohs_cpt_reference IS 'Reference table for Mohs and repair CPT codes';
