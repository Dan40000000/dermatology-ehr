-- Migration: Dermatology Procedure Documentation Templates
-- Created: 2024-02-07
-- Description: Comprehensive procedure documentation system for dermatology EHR

-- ====================
-- PROCEDURE TEMPLATES
-- ====================
CREATE TABLE IF NOT EXISTS procedure_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    procedure_type VARCHAR(100) NOT NULL, -- cryotherapy, shave_biopsy, punch_biopsy, excision, incision_drainage
    cpt_codes TEXT[] NOT NULL DEFAULT '{}',
    template_sections JSONB NOT NULL DEFAULT '{}',
    default_values JSONB NOT NULL DEFAULT '{}',
    consent_template_id UUID REFERENCES consent_forms(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, procedure_type, name)
);

CREATE INDEX idx_procedure_templates_tenant ON procedure_templates(tenant_id);
CREATE INDEX idx_procedure_templates_type ON procedure_templates(procedure_type);
CREATE INDEX idx_procedure_templates_active ON procedure_templates(tenant_id, is_active) WHERE is_active = true;

-- ====================
-- PROCEDURE DOCUMENTATION
-- ====================
CREATE TABLE IF NOT EXISTS procedure_documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    template_id UUID REFERENCES procedure_templates(id) ON DELETE SET NULL,
    procedure_type VARCHAR(100) NOT NULL,
    procedure_name VARCHAR(255),

    -- Anatomical Information
    body_location VARCHAR(255) NOT NULL,
    body_location_code VARCHAR(50),
    laterality VARCHAR(20), -- left, right, bilateral, midline

    -- Lesion Details
    lesion_description TEXT,
    lesion_size_mm DECIMAL(8,2),
    lesion_type VARCHAR(100),

    -- Procedure Details
    size_mm DECIMAL(8,2), -- Size of procedure (punch, excision, etc.)
    depth VARCHAR(50), -- superficial, partial, full
    dimensions_length_mm DECIMAL(8,2),
    dimensions_width_mm DECIMAL(8,2),
    dimensions_depth_mm DECIMAL(8,2),

    -- Anesthesia
    anesthesia_type VARCHAR(100), -- local, topical, none
    anesthesia_agent VARCHAR(100), -- lidocaine, etc.
    anesthesia_concentration VARCHAR(50), -- 1%, 2%
    anesthesia_with_epinephrine BOOLEAN DEFAULT false,
    anesthesia_volume_ml DECIMAL(5,2),

    -- Procedure-Specific Fields (stored in documentation JSONB)
    documentation JSONB NOT NULL DEFAULT '{}',

    -- Hemostasis
    hemostasis_method VARCHAR(100), -- electrocautery, aluminum_chloride, pressure, suture
    hemostasis_details TEXT,

    -- Closure
    closure_type VARCHAR(100), -- none, simple, intermediate, complex, steri_strips
    suture_type VARCHAR(100), -- nylon, prolene, vicryl, etc.
    suture_size VARCHAR(20), -- 3-0, 4-0, 5-0, etc.
    suture_count INTEGER,

    -- Complications
    complications TEXT[],
    complication_details TEXT,

    -- Specimen
    specimen_sent BOOLEAN DEFAULT false,
    specimen_container VARCHAR(100),
    specimen_label VARCHAR(255),
    pathology_order_id UUID REFERENCES biopsies(id) ON DELETE SET NULL,

    -- Margins (for excisions)
    margins_taken_mm DECIMAL(5,2),
    margins_peripheral_mm DECIMAL(5,2),
    margins_deep_mm DECIMAL(5,2),

    -- Patient Instructions
    patient_instructions_given BOOLEAN DEFAULT true,
    wound_care_handout_provided BOOLEAN DEFAULT false,
    follow_up_instructions TEXT,

    -- Provider
    performing_provider_id UUID NOT NULL REFERENCES providers(id),
    assistant_id UUID REFERENCES users(id),

    -- Billing
    cpt_code VARCHAR(20),
    cpt_modifier VARCHAR(10),
    units INTEGER DEFAULT 1,

    -- Note Generation
    procedure_note TEXT,
    note_generated_at TIMESTAMPTZ,

    -- Timestamps
    procedure_start_time TIMESTAMPTZ,
    procedure_end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_procedure_documentation_tenant ON procedure_documentation(tenant_id);
CREATE INDEX idx_procedure_documentation_encounter ON procedure_documentation(encounter_id);
CREATE INDEX idx_procedure_documentation_patient ON procedure_documentation(patient_id);
CREATE INDEX idx_procedure_documentation_type ON procedure_documentation(procedure_type);
CREATE INDEX idx_procedure_documentation_provider ON procedure_documentation(performing_provider_id);
CREATE INDEX idx_procedure_documentation_date ON procedure_documentation(created_at);
CREATE INDEX idx_procedure_documentation_deleted ON procedure_documentation(deleted_at) WHERE deleted_at IS NULL;

-- ====================
-- PROCEDURE SUPPLIES
-- ====================
CREATE TABLE IF NOT EXISTS procedure_supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_doc_id UUID NOT NULL REFERENCES procedure_documentation(id) ON DELETE CASCADE,
    supply_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    lot_number VARCHAR(100),
    expiration_date DATE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_procedure_supplies_doc ON procedure_supplies(procedure_doc_id);
CREATE INDEX idx_procedure_supplies_inventory ON procedure_supplies(inventory_item_id);

-- ====================
-- SEED DEFAULT TEMPLATES
-- ====================
INSERT INTO procedure_templates (tenant_id, name, procedure_type, cpt_codes, template_sections, default_values)
SELECT
    t.id,
    'Cryotherapy - Standard',
    'cryotherapy',
    ARRAY['17000', '17003', '17004', '17110', '17111'],
    '{
        "sections": [
            {"name": "lesion_info", "label": "Lesion Information", "fields": ["lesion_type", "location", "size_mm"]},
            {"name": "procedure", "label": "Procedure Details", "fields": ["freeze_time_seconds", "number_of_cycles", "thaw_time_seconds"]},
            {"name": "post_procedure", "label": "Post-Procedure", "fields": ["patient_instructions_given", "expected_healing_time"]}
        ]
    }'::jsonb,
    '{
        "freeze_time_seconds": 10,
        "number_of_cycles": 2,
        "thaw_time_seconds": 30,
        "patient_instructions_given": true
    }'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM procedure_templates pt
    WHERE pt.tenant_id = t.id AND pt.procedure_type = 'cryotherapy'
);

INSERT INTO procedure_templates (tenant_id, name, procedure_type, cpt_codes, template_sections, default_values)
SELECT
    t.id,
    'Shave Biopsy - Standard',
    'shave_biopsy',
    ARRAY['11102', '11103', '11104', '11105', '11106', '11107'],
    '{
        "sections": [
            {"name": "lesion_info", "label": "Lesion Information", "fields": ["lesion_description", "abcde_assessment", "location", "size_mm"]},
            {"name": "procedure", "label": "Procedure Details", "fields": ["depth", "anesthesia_type", "anesthesia_concentration", "anesthesia_with_epinephrine"]},
            {"name": "hemostasis", "label": "Hemostasis", "fields": ["hemostasis_method"]},
            {"name": "specimen", "label": "Specimen", "fields": ["specimen_sent", "pathology_lab"]}
        ]
    }'::jsonb,
    '{
        "anesthesia_type": "local",
        "anesthesia_agent": "lidocaine",
        "anesthesia_concentration": "1%",
        "anesthesia_with_epinephrine": true,
        "hemostasis_method": "aluminum_chloride",
        "specimen_sent": true,
        "depth": "partial"
    }'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM procedure_templates pt
    WHERE pt.tenant_id = t.id AND pt.procedure_type = 'shave_biopsy'
);

INSERT INTO procedure_templates (tenant_id, name, procedure_type, cpt_codes, template_sections, default_values)
SELECT
    t.id,
    'Punch Biopsy - Standard',
    'punch_biopsy',
    ARRAY['11104', '11105', '11106', '11107'],
    '{
        "sections": [
            {"name": "lesion_info", "label": "Lesion Information", "fields": ["lesion_description", "location"]},
            {"name": "procedure", "label": "Procedure Details", "fields": ["punch_size_mm", "depth", "anesthesia_type", "anesthesia_concentration", "anesthesia_with_epinephrine"]},
            {"name": "closure", "label": "Closure", "fields": ["closure_type", "suture_type", "suture_size", "suture_count"]},
            {"name": "specimen", "label": "Specimen", "fields": ["specimen_sent", "pathology_lab"]}
        ]
    }'::jsonb,
    '{
        "punch_size_mm": 4,
        "anesthesia_type": "local",
        "anesthesia_agent": "lidocaine",
        "anesthesia_concentration": "1%",
        "anesthesia_with_epinephrine": true,
        "closure_type": "simple",
        "suture_type": "nylon",
        "suture_size": "4-0",
        "suture_count": 1,
        "specimen_sent": true
    }'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM procedure_templates pt
    WHERE pt.tenant_id = t.id AND pt.procedure_type = 'punch_biopsy'
);

INSERT INTO procedure_templates (tenant_id, name, procedure_type, cpt_codes, template_sections, default_values)
SELECT
    t.id,
    'Excision - Standard',
    'excision',
    ARRAY['11400', '11401', '11402', '11403', '11404', '11406', '11420', '11421', '11422', '11423', '11424', '11426', '11440', '11441', '11442', '11443', '11444', '11446', '11600', '11601', '11602', '11603', '11604', '11606', '11620', '11621', '11622', '11623', '11624', '11626', '11640', '11641', '11642', '11643', '11644', '11646'],
    '{
        "sections": [
            {"name": "preop", "label": "Pre-Operative", "fields": ["preop_diagnosis", "lesion_size_mm", "planned_margins_mm"]},
            {"name": "procedure", "label": "Procedure Details", "fields": ["dimensions_length_mm", "dimensions_width_mm", "dimensions_depth_mm", "margins_taken_mm", "anesthesia_type", "anesthesia_concentration", "anesthesia_with_epinephrine", "anesthesia_volume_ml"]},
            {"name": "closure", "label": "Closure", "fields": ["closure_type", "suture_type", "suture_size", "suture_count", "deep_sutures", "superficial_sutures"]},
            {"name": "specimen", "label": "Specimen", "fields": ["specimen_sent", "specimen_orientation", "pathology_lab"]}
        ]
    }'::jsonb,
    '{
        "margins_taken_mm": 2,
        "anesthesia_type": "local",
        "anesthesia_agent": "lidocaine",
        "anesthesia_concentration": "1%",
        "anesthesia_with_epinephrine": true,
        "closure_type": "simple",
        "suture_type": "nylon",
        "suture_size": "4-0",
        "specimen_sent": true
    }'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM procedure_templates pt
    WHERE pt.tenant_id = t.id AND pt.procedure_type = 'excision'
);

INSERT INTO procedure_templates (tenant_id, name, procedure_type, cpt_codes, template_sections, default_values)
SELECT
    t.id,
    'Incision and Drainage - Standard',
    'incision_drainage',
    ARRAY['10060', '10061'],
    '{
        "sections": [
            {"name": "abscess_info", "label": "Abscess Information", "fields": ["location", "size_mm", "duration", "symptoms"]},
            {"name": "procedure", "label": "Procedure Details", "fields": ["incision_size_mm", "anesthesia_type", "anesthesia_concentration", "anesthesia_with_epinephrine"]},
            {"name": "drainage", "label": "Drainage", "fields": ["drainage_description", "drainage_amount_ml", "culture_sent"]},
            {"name": "wound_care", "label": "Wound Care", "fields": ["packing_used", "packing_type", "packing_length_cm"]}
        ]
    }'::jsonb,
    '{
        "anesthesia_type": "local",
        "anesthesia_agent": "lidocaine",
        "anesthesia_concentration": "1%",
        "anesthesia_with_epinephrine": false,
        "packing_used": true,
        "packing_type": "iodoform_gauze"
    }'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM procedure_templates pt
    WHERE pt.tenant_id = t.id AND pt.procedure_type = 'incision_drainage'
);

-- ====================
-- UPDATED_AT TRIGGERS
-- ====================
CREATE OR REPLACE FUNCTION update_procedure_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_procedure_templates_updated_at
    BEFORE UPDATE ON procedure_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_procedure_templates_updated_at();

CREATE OR REPLACE FUNCTION update_procedure_documentation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_procedure_documentation_updated_at
    BEFORE UPDATE ON procedure_documentation
    FOR EACH ROW
    EXECUTE FUNCTION update_procedure_documentation_updated_at();

-- ====================
-- COMMENTS
-- ====================
COMMENT ON TABLE procedure_templates IS 'Templates for different dermatology procedure types with customizable fields and defaults';
COMMENT ON TABLE procedure_documentation IS 'Documentation records for procedures performed during encounters';
COMMENT ON TABLE procedure_supplies IS 'Supplies and materials used during procedures with lot tracking';

COMMENT ON COLUMN procedure_documentation.documentation IS 'JSONB field for procedure-specific data (cryotherapy freeze times, biopsy ABCDE, etc.)';
COMMENT ON COLUMN procedure_templates.template_sections IS 'JSONB defining the form sections and fields for this procedure type';
COMMENT ON COLUMN procedure_templates.default_values IS 'JSONB with default values for form fields';
