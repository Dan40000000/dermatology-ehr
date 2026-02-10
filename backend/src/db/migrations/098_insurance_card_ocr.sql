-- Migration: Insurance Card OCR System
-- Version: 098
-- Description: Tables for insurance card scanning and OCR data extraction

-- Table: insurance_card_scans
-- Stores scanned insurance card images and their OCR results
CREATE TABLE IF NOT EXISTS insurance_card_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    front_image_url TEXT,
    back_image_url TEXT,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ocr_result JSONB,
    ocr_provider VARCHAR(50) DEFAULT 'tesseract', -- tesseract, google_vision, aws_textract
    ocr_confidence DECIMAL(5,2), -- Overall confidence score 0-100
    processing_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    processing_error TEXT,
    extracted_data JSONB, -- Structured extracted fields
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: ocr_field_mappings
-- Configurable patterns for extracting fields from different payer cards
CREATE TABLE IF NOT EXISTS ocr_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    payer_pattern VARCHAR(255) NOT NULL, -- Regex pattern to match payer name
    payer_name VARCHAR(255), -- Human-readable payer name for display
    field_name VARCHAR(100) NOT NULL, -- member_id, group_number, plan_type, etc.
    regex_pattern TEXT NOT NULL, -- Regex pattern to extract the field
    position_hint VARCHAR(50), -- front, back, top, bottom, left, right
    priority INTEGER DEFAULT 0, -- Higher priority patterns are tried first
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, payer_pattern, field_name)
);

-- Table: known_payers
-- Reference table for known insurance payers and their card layouts
CREATE TABLE IF NOT EXISTS known_payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id VARCHAR(50) UNIQUE NOT NULL, -- Standard payer ID
    payer_name VARCHAR(255) NOT NULL,
    payer_aliases TEXT[], -- Alternative names/spellings
    card_layout_type VARCHAR(50), -- standard, medicare, medicaid, bcbs, uhc, aetna, cigna
    member_id_label VARCHAR(100) DEFAULT 'Member ID',
    group_number_label VARCHAR(100) DEFAULT 'Group',
    logo_pattern TEXT, -- Description or pattern to identify logo
    front_fields TEXT[], -- Fields typically found on front
    back_fields TEXT[], -- Fields typically found on back
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add OCR-extracted fields to patient_insurance table if not exists
DO $$
BEGIN
    -- Add copay fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'copay_pcp_cents') THEN
        ALTER TABLE patient_insurance ADD COLUMN copay_pcp_cents INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'copay_specialist_cents') THEN
        ALTER TABLE patient_insurance ADD COLUMN copay_specialist_cents INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'copay_er_cents') THEN
        ALTER TABLE patient_insurance ADD COLUMN copay_er_cents INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'copay_urgent_care_cents') THEN
        ALTER TABLE patient_insurance ADD COLUMN copay_urgent_care_cents INTEGER;
    END IF;

    -- Add phone number fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'claims_phone') THEN
        ALTER TABLE patient_insurance ADD COLUMN claims_phone VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'prior_auth_phone') THEN
        ALTER TABLE patient_insurance ADD COLUMN prior_auth_phone VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'member_services_phone') THEN
        ALTER TABLE patient_insurance ADD COLUMN member_services_phone VARCHAR(20);
    END IF;

    -- Add card image URLs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'front_card_image_url') THEN
        ALTER TABLE patient_insurance ADD COLUMN front_card_image_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'back_card_image_url') THEN
        ALTER TABLE patient_insurance ADD COLUMN back_card_image_url TEXT;
    END IF;

    -- Add last OCR scan reference
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'last_ocr_scan_id') THEN
        ALTER TABLE patient_insurance ADD COLUMN last_ocr_scan_id UUID REFERENCES insurance_card_scans(id);
    END IF;

    -- Add RxBIN and RxPCN for pharmacy benefits
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'rx_bin') THEN
        ALTER TABLE patient_insurance ADD COLUMN rx_bin VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'rx_pcn') THEN
        ALTER TABLE patient_insurance ADD COLUMN rx_pcn VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'patient_insurance' AND column_name = 'rx_group') THEN
        ALTER TABLE patient_insurance ADD COLUMN rx_group VARCHAR(50);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_patient ON insurance_card_scans(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_tenant ON insurance_card_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_status ON insurance_card_scans(processing_status);
CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_scanned_at ON insurance_card_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_field_mappings_payer ON ocr_field_mappings(payer_pattern);
CREATE INDEX IF NOT EXISTS idx_ocr_field_mappings_tenant ON ocr_field_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_known_payers_name ON known_payers(payer_name);
CREATE INDEX IF NOT EXISTS idx_known_payers_aliases ON known_payers USING GIN(payer_aliases);

-- Insert common payer patterns
INSERT INTO known_payers (payer_id, payer_name, payer_aliases, card_layout_type, front_fields, back_fields)
VALUES
    ('UHC', 'UnitedHealthcare', ARRAY['United Healthcare', 'UHC', 'United Health Care', 'UnitedHealth'],
     'uhc',
     ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name', 'effective_date'],
     ARRAY['claims_phone', 'prior_auth_phone', 'rx_bin', 'rx_pcn', 'rx_group']),

    ('AETNA', 'Aetna', ARRAY['Aetna', 'Aetna Health', 'CVS Aetna'],
     'aetna',
     ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name'],
     ARRAY['claims_phone', 'prior_auth_phone', 'copay_pcp', 'copay_specialist']),

    ('CIGNA', 'Cigna', ARRAY['Cigna', 'Cigna Healthcare', 'Cigna Health'],
     'cigna',
     ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name', 'effective_date'],
     ARRAY['claims_phone', 'member_services_phone', 'copay_amounts']),

    ('BCBS', 'Blue Cross Blue Shield', ARRAY['BCBS', 'Blue Cross', 'Blue Shield', 'Anthem', 'CareFirst', 'Highmark', 'Premera', 'Regence', 'Wellmark', 'Independence Blue Cross', 'Horizon BCBS'],
     'bcbs',
     ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name', 'prefix'],
     ARRAY['claims_phone', 'prior_auth_phone', 'rx_bin', 'rx_pcn']),

    ('MEDICARE', 'Medicare', ARRAY['Medicare', 'CMS', 'Centers for Medicare'],
     'medicare',
     ARRAY['member_id', 'effective_date', 'part_a_date', 'part_b_date'],
     ARRAY['claims_phone']),

    ('MEDICAID', 'Medicaid', ARRAY['Medicaid', 'Medi-Cal', 'MassHealth', 'BadgerCare', 'TennCare', 'Molina', 'Centene', 'Amerigroup'],
     'medicaid',
     ARRAY['member_id', 'plan_name', 'effective_date'],
     ARRAY['claims_phone', 'member_services_phone']),

    ('HUMANA', 'Humana', ARRAY['Humana', 'Humana Health'],
     'standard',
     ARRAY['member_id', 'group_number', 'plan_type', 'subscriber_name'],
     ARRAY['claims_phone', 'prior_auth_phone', 'copay_amounts']),

    ('KAISER', 'Kaiser Permanente', ARRAY['Kaiser', 'Kaiser Permanente', 'KP'],
     'standard',
     ARRAY['member_id', 'medical_record_number', 'plan_type'],
     ARRAY['member_services_phone']),

    ('TRICARE', 'TRICARE', ARRAY['TRICARE', 'TriCare', 'Military Health'],
     'standard',
     ARRAY['sponsor_ssn', 'member_id', 'plan_type', 'effective_date'],
     ARRAY['claims_phone', 'prior_auth_phone'])
ON CONFLICT (payer_id) DO NOTHING;

-- Insert default OCR field extraction patterns
INSERT INTO ocr_field_mappings (tenant_id, payer_pattern, payer_name, field_name, regex_pattern, position_hint, priority)
VALUES
    -- Generic patterns (no tenant_id = applies to all)
    (NULL, '.*', 'Generic', 'member_id', '(?:Member\s*(?:ID|#|Number)|ID\s*#?|Subscriber\s*ID)\s*[:\s]*([A-Z0-9]{6,20})', 'front', 0),
    (NULL, '.*', 'Generic', 'group_number', '(?:Group\s*(?:#|Number|No\.?)|Grp)\s*[:\s]*([A-Z0-9]{4,15})', 'front', 0),
    (NULL, '.*', 'Generic', 'plan_type', '(PPO|HMO|EPO|POS|HDHP|HSA|Medicare\s+Advantage)', 'front', 0),
    (NULL, '.*', 'Generic', 'effective_date', '(?:Effective|Eff\.?|Coverage)\s*(?:Date)?\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})', 'front', 0),
    (NULL, '.*', 'Generic', 'subscriber_name', '(?:Subscriber|Member|Name)\s*[:\s]*([A-Z][a-zA-Z\-\'']+\s+[A-Z][a-zA-Z\-\'']+(?:\s+[A-Z][a-zA-Z\-\'']+)?)', 'front', 0),
    (NULL, '.*', 'Generic', 'copay_pcp', '(?:PCP|Primary\s*Care|Office\s*Visit)\s*(?:Copay)?\s*[:\s]*\$?(\d+)', 'back', 0),
    (NULL, '.*', 'Generic', 'copay_specialist', '(?:Specialist|Spec\.?)\s*(?:Copay)?\s*[:\s]*\$?(\d+)', 'back', 0),
    (NULL, '.*', 'Generic', 'copay_er', '(?:ER|Emergency|Emergency\s*Room)\s*(?:Copay)?\s*[:\s]*\$?(\d+)', 'back', 0),
    (NULL, '.*', 'Generic', 'claims_phone', '(?:Claims|Billing)\s*(?:Phone|#|Number)?\s*[:\s]*(\(?[0-9]{3}\)?[\s\.\-]?[0-9]{3}[\s\.\-]?[0-9]{4})', 'back', 0),
    (NULL, '.*', 'Generic', 'prior_auth_phone', '(?:Prior\s*Auth|Pre-?Authorization|Pre-?Cert)\s*(?:Phone|#|Number)?\s*[:\s]*(\(?[0-9]{3}\)?[\s\.\-]?[0-9]{3}[\s\.\-]?[0-9]{4})', 'back', 0),
    (NULL, '.*', 'Generic', 'rx_bin', '(?:RxBIN|BIN)\s*[:\s]*([0-9]{6})', 'back', 0),
    (NULL, '.*', 'Generic', 'rx_pcn', '(?:RxPCN|PCN)\s*[:\s]*([A-Z0-9]{4,10})', 'back', 0),
    (NULL, '.*', 'Generic', 'rx_group', '(?:RxGrp|Rx\s*Group)\s*[:\s]*([A-Z0-9]{4,15})', 'back', 0),

    -- UnitedHealthcare specific patterns
    (NULL, '(?i)united\s*health|uhc', 'UnitedHealthcare', 'member_id', 'Member\s*ID\s*[:\s]*([0-9]{9,12})', 'front', 10),
    (NULL, '(?i)united\s*health|uhc', 'UnitedHealthcare', 'group_number', 'Group\s*#?\s*[:\s]*([0-9]{6,8})', 'front', 10),

    -- BCBS specific patterns
    (NULL, '(?i)blue\s*cross|bcbs|anthem', 'Blue Cross Blue Shield', 'member_id', '(?:ID|Member)\s*[:\s]*([A-Z]{3}[0-9]{9,12})', 'front', 10),
    (NULL, '(?i)blue\s*cross|bcbs|anthem', 'Blue Cross Blue Shield', 'prefix', '([A-Z]{3})\d{9}', 'front', 10),

    -- Aetna specific patterns
    (NULL, '(?i)aetna', 'Aetna', 'member_id', 'Member\s*ID\s*[:\s]*([A-Z]?[0-9]{9,12})', 'front', 10),

    -- Medicare specific patterns
    (NULL, '(?i)medicare', 'Medicare', 'member_id', 'Medicare\s*(?:Number|#|ID)\s*[:\s]*([0-9A-Z]{11})', 'front', 10),
    (NULL, '(?i)medicare', 'Medicare', 'part_a_date', 'Part\s*A\s*[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})', 'front', 10),
    (NULL, '(?i)medicare', 'Medicare', 'part_b_date', 'Part\s*B\s*[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})', 'front', 10)
ON CONFLICT (tenant_id, payer_pattern, field_name) DO NOTHING;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_insurance_ocr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_insurance_card_scans_updated_at ON insurance_card_scans;
CREATE TRIGGER update_insurance_card_scans_updated_at
    BEFORE UPDATE ON insurance_card_scans
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_ocr_updated_at();

DROP TRIGGER IF EXISTS update_ocr_field_mappings_updated_at ON ocr_field_mappings;
CREATE TRIGGER update_ocr_field_mappings_updated_at
    BEFORE UPDATE ON ocr_field_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_ocr_updated_at();

DROP TRIGGER IF EXISTS update_known_payers_updated_at ON known_payers;
CREATE TRIGGER update_known_payers_updated_at
    BEFORE UPDATE ON known_payers
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_ocr_updated_at();

COMMENT ON TABLE insurance_card_scans IS 'Stores scanned insurance card images and OCR extraction results';
COMMENT ON TABLE ocr_field_mappings IS 'Configurable regex patterns for extracting fields from insurance cards by payer';
COMMENT ON TABLE known_payers IS 'Reference table of known insurance payers and their card layouts';
