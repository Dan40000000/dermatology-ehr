-- Migration 093: Digital Consent Form System with E-Signatures
-- Comprehensive consent management for dermatology procedures
-- HIPAA compliant with full audit trail and signature verification

-- Consent Templates (master forms for different procedure types)
CREATE TABLE IF NOT EXISTS consent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  name VARCHAR(255) NOT NULL,
  form_type VARCHAR(100) NOT NULL, -- general, biopsy, excision, mohs, cosmetic, phototherapy, isotretinoin
  content_html TEXT NOT NULL, -- HTML content of the form

  -- Required fields configuration (stored as JSONB array)
  required_fields JSONB DEFAULT '[]'::jsonb,

  -- Associated procedure codes (CPT codes that trigger this consent)
  procedure_codes TEXT[] DEFAULT '{}',

  -- Status and versioning
  is_active BOOLEAN DEFAULT true,
  version VARCHAR(50) DEFAULT '1.0',
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,

  -- Metadata
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_consent_template_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes for consent_templates
CREATE INDEX IF NOT EXISTS idx_consent_templates_tenant ON consent_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consent_templates_form_type ON consent_templates(form_type);
CREATE INDEX IF NOT EXISTS idx_consent_templates_active ON consent_templates(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_consent_templates_procedure_codes ON consent_templates USING GIN(procedure_codes);

-- Patient Consents (signed consents linked to patients and encounters)
CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  patient_id UUID NOT NULL,
  template_id UUID NOT NULL,
  encounter_id UUID, -- Optional: linked to specific encounter

  -- Signature information
  signed_at TIMESTAMP,
  signature_data TEXT, -- Base64 encoded signature image or SVG path data
  signature_type VARCHAR(50) DEFAULT 'drawn', -- drawn, typed, biometric

  -- Signer identification
  signer_name VARCHAR(255),
  signer_relationship VARCHAR(100), -- self, parent, guardian, legal_representative

  -- Security and verification
  ip_address INET,
  user_agent TEXT,
  device_fingerprint VARCHAR(255),
  signature_hash VARCHAR(64), -- SHA-256 hash for integrity verification

  -- Witness information (required for certain procedures)
  witness_name VARCHAR(255),
  witness_signature_data TEXT,
  witness_signed_at TIMESTAMP,

  -- Form snapshot (copy of form content at time of signing)
  form_content_snapshot TEXT,
  form_version VARCHAR(50),

  -- Field values filled by patient
  field_values JSONB DEFAULT '{}'::jsonb,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, signed, revoked, expired
  revoked_at TIMESTAMP,
  revoked_by UUID,
  revocation_reason TEXT,

  -- PDF storage
  pdf_url TEXT,
  pdf_generated_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_patient_consent_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_patient_consent_template FOREIGN KEY (template_id) REFERENCES consent_templates(id) ON DELETE RESTRICT
);

-- Indexes for patient_consents
CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant ON patient_consents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_template ON patient_consents(template_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_encounter ON patient_consents(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_status ON patient_consents(status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_signed_at ON patient_consents(signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_consents_pending ON patient_consents(patient_id, status) WHERE status = 'pending';

-- Consent Form Fields (configurable fields for each template)
CREATE TABLE IF NOT EXISTS consent_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,

  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- text, textarea, checkbox, radio, select, date, signature

  -- Field configuration
  required BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  options JSONB, -- For select/radio fields: [{"value": "...", "label": "..."}]
  placeholder VARCHAR(255),
  help_text TEXT,
  validation_pattern VARCHAR(255), -- Regex pattern for validation
  default_value TEXT,

  -- Conditional display
  depends_on_field VARCHAR(100),
  depends_on_value TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_consent_field_template FOREIGN KEY (template_id) REFERENCES consent_templates(id) ON DELETE CASCADE,
  CONSTRAINT uq_consent_field_template_name UNIQUE (template_id, field_name)
);

-- Index for form fields
CREATE INDEX IF NOT EXISTS idx_consent_fields_template ON consent_form_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_consent_fields_position ON consent_form_fields(template_id, position);

-- Consent Audit Log (detailed tracking of all consent-related actions)
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  consent_id UUID NOT NULL,

  action VARCHAR(100) NOT NULL, -- created, viewed, signed, revoked, pdf_generated, pdf_downloaded, witnessed
  performed_by UUID, -- User ID who performed the action
  performed_by_type VARCHAR(50), -- staff, patient, system

  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Additional details
  details JSONB,

  -- Request context
  ip_address INET,
  user_agent TEXT,

  CONSTRAINT fk_consent_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_audit_consent FOREIGN KEY (consent_id) REFERENCES patient_consents(id) ON DELETE CASCADE
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_consent_audit_tenant ON consent_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_consent ON consent_audit_log(consent_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_action ON consent_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_consent_audit_timestamp ON consent_audit_log(timestamp DESC);

-- Consent Sessions (temporary sessions for signing workflow)
CREATE TABLE IF NOT EXISTS consent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  patient_id UUID NOT NULL,
  template_id UUID NOT NULL,
  encounter_id UUID,

  -- Session token for secure access
  session_token VARCHAR(255) NOT NULL UNIQUE,

  -- Session state
  status VARCHAR(50) DEFAULT 'active', -- active, completed, expired, cancelled
  expires_at TIMESTAMP NOT NULL,

  -- Partially filled data
  field_values JSONB DEFAULT '{}'::jsonb,

  -- Created by
  created_by UUID,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  CONSTRAINT fk_consent_session_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_session_template FOREIGN KEY (template_id) REFERENCES consent_templates(id) ON DELETE RESTRICT
);

-- Index for sessions
CREATE INDEX IF NOT EXISTS idx_consent_sessions_token ON consent_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_patient ON consent_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_active ON consent_sessions(status, expires_at) WHERE status = 'active';

-- Comments for documentation
COMMENT ON TABLE consent_templates IS 'Master consent form templates for different procedure types';
COMMENT ON TABLE patient_consents IS 'Signed consent forms linked to patients and encounters';
COMMENT ON TABLE consent_form_fields IS 'Configurable form fields for consent templates';
COMMENT ON TABLE consent_audit_log IS 'HIPAA-compliant audit trail for all consent activities';
COMMENT ON TABLE consent_sessions IS 'Temporary signing sessions for consent workflow';

COMMENT ON COLUMN patient_consents.signature_hash IS 'SHA-256 hash of signature data for integrity verification';
COMMENT ON COLUMN patient_consents.form_content_snapshot IS 'Frozen copy of form at signing time for legal compliance';
COMMENT ON COLUMN consent_templates.procedure_codes IS 'CPT codes that automatically require this consent';

-- Seed dermatology consent templates
INSERT INTO consent_templates (tenant_id, name, form_type, content_html, required_fields, procedure_codes, is_active, version)
VALUES
-- General Procedure Consent
('default-tenant', 'General Dermatology Procedure Consent', 'general',
'<div class="consent-form">
  <h1>Consent for Dermatology Procedure</h1>
  <div class="section">
    <h2>Purpose and Nature of Procedure</h2>
    <p>I hereby authorize {{providerName}} and any assistants to perform the following procedure(s): {{procedureDescription}}</p>
  </div>
  <div class="section">
    <h2>Risks and Complications</h2>
    <p>I understand that all medical procedures carry some risk. Potential risks include but are not limited to:</p>
    <ul>
      <li>Bleeding, bruising, or swelling</li>
      <li>Infection</li>
      <li>Scarring (including keloid or hypertrophic scars)</li>
      <li>Pain or discomfort</li>
      <li>Allergic reactions to medications or materials</li>
      <li>Changes in skin color or texture</li>
      <li>Need for additional procedures</li>
    </ul>
  </div>
  <div class="section">
    <h2>Alternatives</h2>
    <p>I have been informed of alternative treatments including: {{alternatives}}</p>
  </div>
  <div class="section">
    <h2>Patient Acknowledgment</h2>
    <p>I have read and understand this consent form. I have had the opportunity to ask questions and all my questions have been answered to my satisfaction. I voluntarily consent to the procedure described above.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "procedureDescription"]'::jsonb,
ARRAY[]::TEXT[],
true, '1.0'),

-- Biopsy Consent
('default-tenant', 'Skin Biopsy Consent', 'biopsy',
'<div class="consent-form">
  <h1>Consent for Skin Biopsy</h1>
  <div class="section">
    <h2>Procedure Description</h2>
    <p>A skin biopsy is a procedure where a small sample of skin is removed for laboratory analysis. The type of biopsy to be performed is: {{biopsyType}}</p>
    <ul>
      <li><strong>Shave Biopsy:</strong> A thin layer of skin is removed</li>
      <li><strong>Punch Biopsy:</strong> A circular tool removes a deeper sample</li>
      <li><strong>Excisional Biopsy:</strong> The entire lesion is removed</li>
      <li><strong>Incisional Biopsy:</strong> A portion of a larger lesion is removed</li>
    </ul>
  </div>
  <div class="section">
    <h2>Purpose</h2>
    <p>The biopsy is being performed to: {{biopsyPurpose}}</p>
  </div>
  <div class="section">
    <h2>Risks Specific to Biopsy</h2>
    <ul>
      <li>Bleeding that may require additional treatment</li>
      <li>Infection requiring antibiotics</li>
      <li>Scarring at the biopsy site</li>
      <li>Temporary or permanent numbness near the site</li>
      <li>Need for repeat biopsy if results are inconclusive</li>
      <li>Allergic reaction to local anesthetic</li>
    </ul>
  </div>
  <div class="section">
    <h2>Post-Procedure Care</h2>
    <p>I understand I will receive wound care instructions and must follow them carefully. Results are typically available within 1-2 weeks.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "biopsyType", "biopsySite", "biopsyPurpose"]'::jsonb,
ARRAY['11102', '11103', '11104', '11105', '11106', '11107']::TEXT[],
true, '1.0'),

-- Excision/Mohs Consent
('default-tenant', 'Excision and Mohs Surgery Consent', 'excision',
'<div class="consent-form">
  <h1>Consent for Surgical Excision / Mohs Micrographic Surgery</h1>
  <div class="section">
    <h2>Procedure Description</h2>
    <p>I authorize the surgical removal of the lesion(s) at: {{excisionSite}}</p>
    <p>Type of surgery: {{surgeryType}}</p>
  </div>
  <div class="section">
    <h2>About Mohs Surgery</h2>
    <p>Mohs micrographic surgery is a specialized technique that removes skin cancer layer by layer, examining each layer under a microscope until no cancer cells remain. This technique provides the highest cure rate while preserving the maximum amount of healthy tissue.</p>
  </div>
  <div class="section">
    <h2>Surgical Risks</h2>
    <ul>
      <li>Bleeding requiring additional intervention</li>
      <li>Infection requiring antibiotics or hospitalization</li>
      <li>Significant scarring or disfigurement</li>
      <li>Damage to underlying structures (nerves, blood vessels)</li>
      <li>Temporary or permanent numbness or weakness</li>
      <li>Need for reconstructive surgery</li>
      <li>Recurrence of the skin cancer</li>
      <li>Reactions to anesthesia</li>
    </ul>
  </div>
  <div class="section">
    <h2>Reconstruction</h2>
    <p>Following removal, the wound may be closed by: {{reconstructionMethod}}</p>
  </div>
  <div class="section">
    <h2>Time Commitment</h2>
    <p>I understand that Mohs surgery may take several hours as multiple stages may be required.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "excisionSite", "surgeryType", "diagnosis", "reconstructionMethod"]'::jsonb,
ARRAY['17311', '17312', '17313', '17314', '17315', '11600', '11601', '11602', '11603', '11604', '11606']::TEXT[],
true, '1.0'),

-- Cosmetic Procedure Consent (Botox/Fillers)
('default-tenant', 'Cosmetic Injectable Procedure Consent', 'cosmetic',
'<div class="consent-form">
  <h1>Consent for Cosmetic Injectable Procedures</h1>
  <div class="section">
    <h2>Procedure</h2>
    <p>I authorize {{providerName}} to perform the following cosmetic procedure(s):</p>
    <p>{{procedureDescription}}</p>
    <p>Treatment areas: {{treatmentAreas}}</p>
  </div>
  <div class="section">
    <h2>About Neuromodulators (Botox, Dysport, Xeomin)</h2>
    <p>These products temporarily reduce muscle activity to soften lines and wrinkles. Effects typically last 3-4 months.</p>
  </div>
  <div class="section">
    <h2>About Dermal Fillers</h2>
    <p>Dermal fillers add volume and contour to the face. Duration varies by product from 6 months to 2+ years.</p>
  </div>
  <div class="section">
    <h2>Cosmetic Procedure Risks</h2>
    <ul>
      <li>Bruising, swelling, redness at injection sites</li>
      <li>Asymmetry or uneven results</li>
      <li>Lumps or bumps under the skin</li>
      <li>Allergic reactions</li>
      <li>Migration of product</li>
      <li>Infection</li>
      <li>Rare but serious: vascular occlusion, vision changes, skin necrosis</li>
      <li>Results may not meet expectations</li>
    </ul>
  </div>
  <div class="section">
    <h2>Financial Acknowledgment</h2>
    <p>I understand that cosmetic procedures are not covered by insurance and I am responsible for all costs. Total estimated cost: {{estimatedCost}}</p>
  </div>
  <div class="section">
    <h2>Photography Consent</h2>
    <p>I consent to before and after photographs for my medical record.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "treatmentAreas", "productUsed", "estimatedCost"]'::jsonb,
ARRAY['64615', '64616', '64642', '64643', '64644', '11950', '11951', '11952', '11954']::TEXT[],
true, '1.0'),

-- Phototherapy Consent
('default-tenant', 'Phototherapy Treatment Consent', 'phototherapy',
'<div class="consent-form">
  <h1>Consent for Phototherapy Treatment</h1>
  <div class="section">
    <h2>Treatment Description</h2>
    <p>Phototherapy uses specific wavelengths of light to treat skin conditions. The type of phototherapy prescribed is: {{phototherapyType}}</p>
    <ul>
      <li><strong>Narrowband UVB:</strong> Most common form, treats psoriasis, eczema, vitiligo</li>
      <li><strong>Broadband UVB:</strong> Older form of light therapy</li>
      <li><strong>PUVA:</strong> Psoralen plus UVA light</li>
      <li><strong>Excimer Laser:</strong> Targeted treatment for specific areas</li>
    </ul>
  </div>
  <div class="section">
    <h2>Condition Being Treated</h2>
    <p>{{diagnosis}}</p>
  </div>
  <div class="section">
    <h2>Treatment Schedule</h2>
    <p>Phototherapy typically requires {{treatmentFrequency}} treatments per week for {{treatmentDuration}}.</p>
  </div>
  <div class="section">
    <h2>Risks of Phototherapy</h2>
    <ul>
      <li>Sunburn-like reaction</li>
      <li>Skin aging</li>
      <li>Increased risk of skin cancer with long-term use</li>
      <li>Eye damage if protective eyewear not worn</li>
      <li>Flare of certain conditions (cold sores, lupus)</li>
      <li>Itching or skin irritation</li>
      <li>Possible interaction with certain medications</li>
    </ul>
  </div>
  <div class="section">
    <h2>Precautions</h2>
    <p>I agree to wear protective eyewear during treatment and to notify staff of any medications I am taking, especially those that may increase sun sensitivity.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "phototherapyType", "diagnosis", "treatmentFrequency"]'::jsonb,
ARRAY['96900', '96910', '96912', '96913']::TEXT[],
true, '1.0'),

-- Isotretinoin iPLEDGE Consent
('default-tenant', 'Isotretinoin (Accutane) iPLEDGE Consent', 'isotretinoin',
'<div class="consent-form">
  <h1>Isotretinoin (Accutane/Claravis/Absorica) Treatment Consent</h1>
  <div class="section warning">
    <h2>IMPORTANT WARNING</h2>
    <p><strong>Isotretinoin can cause severe birth defects if taken during pregnancy. This medication must NOT be used by anyone who is pregnant or may become pregnant.</strong></p>
  </div>
  <div class="section">
    <h2>iPLEDGE Program</h2>
    <p>I understand that isotretinoin is only available through the FDA-mandated iPLEDGE program. I agree to:</p>
    <ul>
      <li>Register with the iPLEDGE program</li>
      <li>Obtain pregnancy tests as required (if applicable)</li>
      <li>Use two forms of contraception (if applicable)</li>
      <li>Pick up my medication within 7 days of the prescription date</li>
      <li>Not share my medication with anyone</li>
      <li>Not donate blood during treatment and for 1 month after</li>
    </ul>
  </div>
  <div class="section">
    <h2>Known Side Effects</h2>
    <ul>
      <li>Severe dryness of skin, lips, and eyes</li>
      <li>Nosebleeds</li>
      <li>Joint and muscle pain</li>
      <li>Elevated cholesterol and triglycerides</li>
      <li>Elevated liver enzymes</li>
      <li>Depression or mood changes (rare but serious)</li>
      <li>Inflammatory bowel disease (rare)</li>
      <li>Vision problems, especially at night</li>
      <li>Increased sun sensitivity</li>
    </ul>
  </div>
  <div class="section">
    <h2>Required Monitoring</h2>
    <p>I understand I must have regular blood tests to monitor liver function and lipid levels during treatment.</p>
  </div>
  <div class="section">
    <h2>Mental Health Warning</h2>
    <p>I will immediately contact my doctor if I experience depression, mood swings, thoughts of self-harm, or any concerning mental health symptoms.</p>
  </div>
  <div class="section">
    <h2>Patient Acknowledgment</h2>
    <p>I have received and read the iPLEDGE patient guide and the Medication Guide. I understand all the risks and requirements of isotretinoin treatment.</p>
  </div>
</div>',
'["patientName", "dateOfBirth", "ipledgeId", "pregnancyCapable", "contraceptionMethods"]'::jsonb,
ARRAY[]::TEXT[],
true, '1.0')

ON CONFLICT DO NOTHING;

-- Seed form fields for each template
-- General Procedure Consent Fields
INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, placeholder)
SELECT id, 'patientName', 'Patient Name', 'text', true, 1, 'Enter patient full name'
FROM consent_templates WHERE form_type = 'general' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position)
SELECT id, 'dateOfBirth', 'Date of Birth', 'date', true, 2
FROM consent_templates WHERE form_type = 'general' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, placeholder)
SELECT id, 'procedureDescription', 'Procedure Description', 'textarea', true, 3, 'Describe the procedure(s) to be performed'
FROM consent_templates WHERE form_type = 'general' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position)
SELECT id, 'alternatives', 'Alternative Treatments Discussed', 'textarea', false, 4
FROM consent_templates WHERE form_type = 'general' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position)
SELECT id, 'questionsAnswered', 'All questions have been answered', 'checkbox', true, 5
FROM consent_templates WHERE form_type = 'general' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

-- Biopsy Consent Fields
INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, options)
SELECT id, 'biopsyType', 'Type of Biopsy', 'select', true, 3,
'[{"value":"shave","label":"Shave Biopsy"},{"value":"punch","label":"Punch Biopsy"},{"value":"excisional","label":"Excisional Biopsy"},{"value":"incisional","label":"Incisional Biopsy"}]'::jsonb
FROM consent_templates WHERE form_type = 'biopsy' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, placeholder)
SELECT id, 'biopsySite', 'Biopsy Site Location', 'text', true, 4, 'e.g., Left forearm, Right cheek'
FROM consent_templates WHERE form_type = 'biopsy' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

-- Isotretinoin specific fields
INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, placeholder)
SELECT id, 'ipledgeId', 'iPLEDGE ID Number', 'text', true, 3, 'Enter your iPLEDGE ID'
FROM consent_templates WHERE form_type = 'isotretinoin' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, options)
SELECT id, 'pregnancyCapable', 'Pregnancy Capable', 'select', true, 4,
'[{"value":"yes","label":"Yes - I can become pregnant"},{"value":"no","label":"No - I cannot become pregnant"},{"value":"na","label":"Not applicable (male patient)"}]'::jsonb
FROM consent_templates WHERE form_type = 'isotretinoin' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position, placeholder, depends_on_field, depends_on_value)
SELECT id, 'contraceptionMethods', 'Contraception Methods', 'text', false, 5, 'List two forms of contraception', 'pregnancyCapable', 'yes'
FROM consent_templates WHERE form_type = 'isotretinoin' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position)
SELECT id, 'ipledgeGuideRead', 'I have read the iPLEDGE patient guide', 'checkbox', true, 6
FROM consent_templates WHERE form_type = 'isotretinoin' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;

INSERT INTO consent_form_fields (template_id, field_name, field_label, field_type, required, position)
SELECT id, 'noBloodDonation', 'I agree not to donate blood during treatment', 'checkbox', true, 7
FROM consent_templates WHERE form_type = 'isotretinoin' AND tenant_id = 'default-tenant'
ON CONFLICT DO NOTHING;
