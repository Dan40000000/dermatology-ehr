-- Digital Pre-Visit Intake Form System
-- Comprehensive dermatology-specific intake forms with templates, assignments, and responses

-- ============================================================================
-- INTAKE FORM TEMPLATES
-- Stores reusable form templates for different visit types
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  form_type VARCHAR(50) NOT NULL CHECK (form_type IN ('new_patient', 'returning', 'procedure_specific')),
  procedure_type VARCHAR(100), -- For procedure_specific forms (e.g., 'mohs', 'biopsy', 'cosmetic')

  -- Template content (stored as JSONB array of section references)
  sections JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Template versioning and status
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default template for this form_type

  -- Timing settings
  send_days_before_appointment INTEGER DEFAULT 3, -- When to send to patient
  due_hours_before_appointment INTEGER DEFAULT 24, -- When form is due

  -- Reminders
  send_reminder BOOLEAN DEFAULT true,
  reminder_hours_before_due INTEGER DEFAULT 24,

  -- Audit trail
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_template_name_version UNIQUE (tenant_id, name, version)
);

-- ============================================================================
-- INTAKE FORM SECTIONS
-- Defines individual sections within a template
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  template_id UUID NOT NULL REFERENCES intake_form_templates(id) ON DELETE CASCADE,

  -- Section identification
  section_name VARCHAR(100) NOT NULL,
  section_key VARCHAR(50) NOT NULL, -- Machine-readable key (e.g., 'demographics', 'skin_history')
  section_order INTEGER NOT NULL,

  -- Section content
  title VARCHAR(255) NOT NULL,
  description TEXT,
  instructions TEXT,

  -- Fields definition (JSONB array of field objects)
  fields JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Conditional logic for showing/hiding section
  conditional_logic JSONB DEFAULT NULL,
  -- Example: {"show_if": {"field": "has_skin_cancer_history", "equals": true}}

  -- Section settings
  is_required BOOLEAN DEFAULT true,
  is_repeatable BOOLEAN DEFAULT false, -- Can patient add multiple entries (e.g., medications)
  max_repeats INTEGER DEFAULT NULL,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_section_order UNIQUE (template_id, section_order)
);

-- ============================================================================
-- INTAKE FORM ASSIGNMENTS
-- Links a form template to a specific appointment/patient
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Assignment linkage
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES intake_form_templates(id) ON DELETE RESTRICT,

  -- Secure access token for patient portal
  access_token VARCHAR(64) UNIQUE NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Timeline
  sent_at TIMESTAMPTZ, -- When link was sent to patient
  due_by TIMESTAMPTZ, -- When form should be completed by
  started_at TIMESTAMPTZ, -- When patient started filling out
  completed_at TIMESTAMPTZ, -- When patient finished
  reviewed_at TIMESTAMPTZ, -- When staff reviewed
  imported_at TIMESTAMPTZ, -- When responses were imported to chart

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'started', 'completed', 'reviewed', 'imported', 'expired', 'cancelled')),

  -- Completion tracking
  completion_percentage INTEGER DEFAULT 0,
  sections_completed INTEGER DEFAULT 0,
  total_sections INTEGER NOT NULL,

  -- Delivery tracking
  send_method VARCHAR(20) DEFAULT 'both' CHECK (send_method IN ('email', 'sms', 'both', 'portal_only')),
  reminder_sent_at TIMESTAMPTZ,
  reminder_count INTEGER DEFAULT 0,

  -- Staff review
  reviewed_by UUID REFERENCES users(id),
  review_notes TEXT,
  flagged_for_review BOOLEAN DEFAULT false,
  flag_reason TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INTAKE FORM RESPONSES
-- Stores patient responses for each section
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Response linkage
  assignment_id UUID NOT NULL REFERENCES intake_form_assignments(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES intake_form_sections(id) ON DELETE CASCADE,

  -- Response data
  field_responses JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: {"first_name": "John", "last_name": "Doe", "dob": "1990-01-15"}

  -- For repeatable sections (e.g., multiple medications)
  repeat_index INTEGER DEFAULT 0,

  -- Response metadata
  is_complete BOOLEAN DEFAULT false,
  validation_errors JSONB DEFAULT NULL,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ DEFAULT NOW(),

  -- Device/session info for audit
  ip_address INET,
  user_agent TEXT,

  CONSTRAINT unique_section_response UNIQUE (assignment_id, section_id, repeat_index)
);

-- ============================================================================
-- INTAKE FORM IMPORTS
-- Tracks what data was imported to the patient chart
-- ============================================================================
CREATE TABLE IF NOT EXISTS intake_form_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  assignment_id UUID NOT NULL REFERENCES intake_form_assignments(id) ON DELETE CASCADE,

  -- Import details
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID NOT NULL REFERENCES users(id),

  -- What was imported
  demographics_updated BOOLEAN DEFAULT false,
  insurance_updated BOOLEAN DEFAULT false,
  medical_history_updated BOOLEAN DEFAULT false,
  medications_updated BOOLEAN DEFAULT false,
  allergies_updated BOOLEAN DEFAULT false,
  family_history_updated BOOLEAN DEFAULT false,

  -- Import results
  import_summary JSONB DEFAULT '{}'::JSONB,
  -- Stores what was changed: {"demographics": {"phone": {"old": "555-1234", "new": "555-5678"}}}

  -- Conflicts/manual review needed
  has_conflicts BOOLEAN DEFAULT false,
  conflicts JSONB DEFAULT NULL,

  -- Notes
  import_notes TEXT
);

-- ============================================================================
-- DEFAULT DERMATOLOGY FORM SECTIONS (Seed Data)
-- Pre-built section templates for dermatology practices
-- ============================================================================

-- Create seed function to populate default sections for new tenants
CREATE OR REPLACE FUNCTION seed_default_intake_sections(p_tenant_id VARCHAR(255), p_template_id UUID)
RETURNS void AS $$
DECLARE
  v_section_order INTEGER := 1;
BEGIN
  -- 1. Demographics Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Demographics', 'demographics', v_section_order,
    'Personal Information',
    'Please verify and update your personal information',
    '[
      {"key": "first_name", "label": "First Name", "type": "text", "required": true, "auto_populate": true},
      {"key": "middle_name", "label": "Middle Name", "type": "text", "required": false},
      {"key": "last_name", "label": "Last Name", "type": "text", "required": true, "auto_populate": true},
      {"key": "preferred_name", "label": "Preferred Name", "type": "text", "required": false},
      {"key": "dob", "label": "Date of Birth", "type": "date", "required": true, "auto_populate": true},
      {"key": "gender", "label": "Gender", "type": "select", "options": ["Male", "Female", "Non-binary", "Prefer not to say"], "required": true},
      {"key": "pronouns", "label": "Preferred Pronouns", "type": "select", "options": ["He/Him", "She/Her", "They/Them", "Other"], "required": false},
      {"key": "ssn_last4", "label": "Last 4 of SSN", "type": "text", "required": false, "mask": "####"},
      {"key": "address_line1", "label": "Street Address", "type": "text", "required": true, "auto_populate": true},
      {"key": "address_line2", "label": "Apt/Suite/Unit", "type": "text", "required": false},
      {"key": "city", "label": "City", "type": "text", "required": true, "auto_populate": true},
      {"key": "state", "label": "State", "type": "state_select", "required": true, "auto_populate": true},
      {"key": "zip_code", "label": "ZIP Code", "type": "text", "required": true, "auto_populate": true},
      {"key": "home_phone", "label": "Home Phone", "type": "phone", "required": false},
      {"key": "cell_phone", "label": "Cell Phone", "type": "phone", "required": true, "auto_populate": true},
      {"key": "email", "label": "Email Address", "type": "email", "required": true, "auto_populate": true},
      {"key": "preferred_contact", "label": "Preferred Contact Method", "type": "select", "options": ["Cell Phone", "Home Phone", "Email", "Text Message"], "required": true},
      {"key": "emergency_contact_name", "label": "Emergency Contact Name", "type": "text", "required": true},
      {"key": "emergency_contact_relationship", "label": "Relationship", "type": "text", "required": true},
      {"key": "emergency_contact_phone", "label": "Emergency Contact Phone", "type": "phone", "required": true}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 2. Insurance Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Insurance', 'insurance', v_section_order,
    'Insurance Information',
    'Please provide your current insurance details',
    '[
      {"key": "has_insurance", "label": "Do you have health insurance?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "primary_insurance_name", "label": "Primary Insurance Company", "type": "text", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_insurance_id", "label": "Member/Subscriber ID", "type": "text", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_insurance_group", "label": "Group Number", "type": "text", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_insurance_phone", "label": "Insurance Phone Number", "type": "phone", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_subscriber_name", "label": "Subscriber Name (if not self)", "type": "text", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_subscriber_dob", "label": "Subscriber Date of Birth", "type": "date", "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "primary_subscriber_relationship", "label": "Relationship to Subscriber", "type": "select", "options": ["Self", "Spouse", "Child", "Other"], "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "has_secondary_insurance", "label": "Do you have secondary insurance?", "type": "radio", "options": ["Yes", "No"], "required": false, "conditional": {"field": "has_insurance", "equals": "Yes"}},
      {"key": "secondary_insurance_name", "label": "Secondary Insurance Company", "type": "text", "required": false, "conditional": {"field": "has_secondary_insurance", "equals": "Yes"}},
      {"key": "secondary_insurance_id", "label": "Secondary Member ID", "type": "text", "required": false, "conditional": {"field": "has_secondary_insurance", "equals": "Yes"}},
      {"key": "secondary_insurance_group", "label": "Secondary Group Number", "type": "text", "required": false, "conditional": {"field": "has_secondary_insurance", "equals": "Yes"}}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 3. Medical History Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Medical History', 'medical_history', v_section_order,
    'Medical History',
    'Please provide information about your medical history',
    '[
      {"key": "conditions", "label": "Do you have or have you had any of the following conditions?", "type": "checkbox_group", "options": [
        "Diabetes", "High Blood Pressure", "Heart Disease", "Stroke", "Cancer", "Thyroid Disease",
        "Kidney Disease", "Liver Disease", "Asthma/COPD", "HIV/AIDS", "Hepatitis", "Lupus/Autoimmune",
        "Psoriasis", "Eczema", "Rosacea", "Acne", "None of the above"
      ], "required": true},
      {"key": "other_conditions", "label": "Other medical conditions not listed above", "type": "textarea", "required": false},
      {"key": "past_surgeries", "label": "List any past surgeries (with approximate dates)", "type": "textarea", "required": false, "placeholder": "e.g., Appendectomy 2015, Knee surgery 2018"},
      {"key": "hospitalizations", "label": "List any hospitalizations in the past 5 years", "type": "textarea", "required": false},
      {"key": "immunocompromised", "label": "Are you currently immunocompromised or on immunosuppressive therapy?", "type": "radio", "options": ["Yes", "No", "Not sure"], "required": true},
      {"key": "immunocompromised_details", "label": "If yes, please explain", "type": "textarea", "required": false, "conditional": {"field": "immunocompromised", "equals": "Yes"}},
      {"key": "pregnant", "label": "Are you currently pregnant or trying to become pregnant?", "type": "radio", "options": ["Yes", "No", "N/A"], "required": true},
      {"key": "breastfeeding", "label": "Are you currently breastfeeding?", "type": "radio", "options": ["Yes", "No", "N/A"], "required": true}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 4. Medications Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required, is_repeatable, max_repeats)
  VALUES (
    p_tenant_id, p_template_id, 'Medications', 'medications', v_section_order,
    'Current Medications',
    'Please list all medications you are currently taking, including prescriptions, over-the-counter, vitamins, and supplements',
    '[
      {"key": "takes_medications", "label": "Are you currently taking any medications?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "medication_name", "label": "Medication Name", "type": "text", "required": false, "conditional": {"field": "takes_medications", "equals": "Yes"}},
      {"key": "medication_dosage", "label": "Dosage", "type": "text", "required": false, "conditional": {"field": "takes_medications", "equals": "Yes"}, "placeholder": "e.g., 10mg"},
      {"key": "medication_frequency", "label": "Frequency", "type": "select", "options": ["Once daily", "Twice daily", "Three times daily", "Four times daily", "As needed", "Weekly", "Other"], "required": false, "conditional": {"field": "takes_medications", "equals": "Yes"}},
      {"key": "medication_reason", "label": "Reason for taking", "type": "text", "required": false, "conditional": {"field": "takes_medications", "equals": "Yes"}},
      {"key": "topical_medications", "label": "List any topical creams, ointments, or lotions you use on your skin", "type": "textarea", "required": false}
    ]'::JSONB, true, true, 20
  );
  v_section_order := v_section_order + 1;

  -- 5. Allergies Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Allergies', 'allergies', v_section_order,
    'Allergies',
    'Please list any allergies you have',
    '[
      {"key": "has_drug_allergies", "label": "Do you have any drug allergies?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "drug_allergies", "label": "List drug allergies and reactions", "type": "textarea", "required": false, "conditional": {"field": "has_drug_allergies", "equals": "Yes"}, "placeholder": "e.g., Penicillin - hives, Sulfa - rash"},
      {"key": "latex_allergy", "label": "Are you allergic to latex?", "type": "radio", "options": ["Yes", "No", "Not sure"], "required": true},
      {"key": "adhesive_allergy", "label": "Are you allergic to adhesives/bandage tape?", "type": "radio", "options": ["Yes", "No", "Not sure"], "required": true},
      {"key": "topical_allergies", "label": "Are you allergic to any topical products (creams, ointments, sunscreens)?", "type": "radio", "options": ["Yes", "No", "Not sure"], "required": true},
      {"key": "topical_allergies_list", "label": "Please list topical allergies", "type": "textarea", "required": false, "conditional": {"field": "topical_allergies", "equals": "Yes"}},
      {"key": "other_allergies", "label": "List any other allergies (food, environmental, etc.)", "type": "textarea", "required": false}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 6. Family History Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Family History', 'family_history', v_section_order,
    'Family Medical History',
    'Please provide information about your family''s medical history',
    '[
      {"key": "family_skin_cancer", "label": "Has anyone in your family had skin cancer?", "type": "radio", "options": ["Yes", "No", "Unknown"], "required": true},
      {"key": "family_skin_cancer_types", "label": "What type(s) of skin cancer?", "type": "checkbox_group", "options": ["Melanoma", "Basal Cell Carcinoma", "Squamous Cell Carcinoma", "Unknown type"], "required": false, "conditional": {"field": "family_skin_cancer", "equals": "Yes"}},
      {"key": "family_skin_cancer_relation", "label": "Which family members?", "type": "text", "required": false, "conditional": {"field": "family_skin_cancer", "equals": "Yes"}, "placeholder": "e.g., Mother, Father, Sibling"},
      {"key": "family_melanoma", "label": "Has anyone in your immediate family (parents, siblings, children) been diagnosed with melanoma?", "type": "radio", "options": ["Yes", "No", "Unknown"], "required": true},
      {"key": "family_autoimmune", "label": "Is there a family history of autoimmune diseases?", "type": "radio", "options": ["Yes", "No", "Unknown"], "required": true},
      {"key": "family_autoimmune_types", "label": "Which autoimmune conditions?", "type": "checkbox_group", "options": ["Lupus", "Rheumatoid Arthritis", "Psoriasis", "Vitiligo", "Alopecia", "Other"], "required": false, "conditional": {"field": "family_autoimmune", "equals": "Yes"}},
      {"key": "family_other_skin", "label": "Is there a family history of other skin conditions?", "type": "textarea", "required": false}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 7. Social History Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Social History', 'social_history', v_section_order,
    'Social History',
    'Please provide information about your lifestyle and habits',
    '[
      {"key": "occupation", "label": "What is your occupation?", "type": "text", "required": true},
      {"key": "outdoor_work", "label": "Does your job involve significant outdoor sun exposure?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "sun_exposure_frequency", "label": "How often are you exposed to the sun for extended periods?", "type": "select", "options": ["Rarely", "1-2 times per week", "3-5 times per week", "Daily"], "required": true},
      {"key": "sunscreen_use", "label": "How often do you use sunscreen?", "type": "select", "options": ["Never", "Rarely", "Sometimes", "Usually", "Always"], "required": true},
      {"key": "tanning_history", "label": "Have you ever used indoor tanning beds?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "tanning_frequency", "label": "How often did you use tanning beds?", "type": "select", "options": ["A few times", "Monthly", "Weekly", "More than weekly"], "required": false, "conditional": {"field": "tanning_history", "equals": "Yes"}},
      {"key": "sunburn_history", "label": "Have you had blistering sunburns in the past?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "sunburn_count", "label": "Approximately how many blistering sunburns?", "type": "select", "options": ["1-2", "3-5", "6-10", "More than 10"], "required": false, "conditional": {"field": "sunburn_history", "equals": "Yes"}},
      {"key": "smoking_status", "label": "Smoking status", "type": "select", "options": ["Never smoked", "Former smoker", "Current smoker"], "required": true},
      {"key": "smoking_amount", "label": "How many packs per day?", "type": "select", "options": ["Less than 1", "1 pack", "1-2 packs", "More than 2 packs"], "required": false, "conditional": {"field": "smoking_status", "equals": "Current smoker"}},
      {"key": "alcohol_use", "label": "Alcohol consumption", "type": "select", "options": ["None", "Occasional (1-2 drinks/week)", "Moderate (3-7 drinks/week)", "Heavy (more than 7 drinks/week)"], "required": true}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 8. Skin History Section (Dermatology-specific)
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Skin History', 'skin_history', v_section_order,
    'Skin Health History',
    'Please provide information about your skin health history',
    '[
      {"key": "prior_skin_cancer", "label": "Have you ever been diagnosed with skin cancer?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "skin_cancer_types", "label": "What type(s) of skin cancer?", "type": "checkbox_group", "options": ["Melanoma", "Basal Cell Carcinoma (BCC)", "Squamous Cell Carcinoma (SCC)", "Merkel Cell Carcinoma", "Other/Unknown"], "required": false, "conditional": {"field": "prior_skin_cancer", "equals": "Yes"}},
      {"key": "skin_cancer_year", "label": "Year of diagnosis", "type": "text", "required": false, "conditional": {"field": "prior_skin_cancer", "equals": "Yes"}},
      {"key": "skin_cancer_location", "label": "Location on body", "type": "text", "required": false, "conditional": {"field": "prior_skin_cancer", "equals": "Yes"}},
      {"key": "skin_cancer_treatment", "label": "Treatment received", "type": "checkbox_group", "options": ["Surgical excision", "Mohs surgery", "Radiation", "Topical treatment", "Immunotherapy", "Other"], "required": false, "conditional": {"field": "prior_skin_cancer", "equals": "Yes"}},
      {"key": "prior_biopsies", "label": "Have you had any skin biopsies?", "type": "radio", "options": ["Yes", "No", "Unknown"], "required": true},
      {"key": "biopsy_count", "label": "Approximately how many biopsies?", "type": "select", "options": ["1-2", "3-5", "6-10", "More than 10"], "required": false, "conditional": {"field": "prior_biopsies", "equals": "Yes"}},
      {"key": "abnormal_moles", "label": "Have you ever been told you have atypical/dysplastic moles?", "type": "radio", "options": ["Yes", "No", "Unknown"], "required": true},
      {"key": "concerning_spots", "label": "Do you have any moles or spots that concern you?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "concerning_spots_locations", "label": "Where are the concerning spots located?", "type": "textarea", "required": false, "conditional": {"field": "concerning_spots", "equals": "Yes"}},
      {"key": "changing_moles", "label": "Have any moles changed in size, shape, or color recently?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "changing_moles_details", "label": "Please describe the changes", "type": "textarea", "required": false, "conditional": {"field": "changing_moles", "equals": "Yes"}},
      {"key": "skin_type", "label": "How would you describe your skin type?", "type": "select", "options": ["Type I - Always burns, never tans (very fair)", "Type II - Usually burns, tans minimally (fair)", "Type III - Sometimes burns, tans gradually (medium)", "Type IV - Rarely burns, tans easily (olive)", "Type V - Very rarely burns, tans very easily (brown)", "Type VI - Never burns (dark brown/black)"], "required": true},
      {"key": "freckling", "label": "Do you have many freckles?", "type": "radio", "options": ["Yes", "No"], "required": true}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 9. Review of Systems Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Review of Systems', 'review_of_systems', v_section_order,
    'Review of Systems',
    'Please indicate if you are currently experiencing any of the following symptoms',
    '[
      {"key": "constitutional", "label": "Constitutional symptoms", "type": "checkbox_group", "options": ["Fever", "Chills", "Fatigue", "Unexplained weight loss", "Night sweats", "None"], "required": true},
      {"key": "skin_symptoms", "label": "Skin symptoms", "type": "checkbox_group", "options": ["Rash", "Itching", "Hives", "New growths", "Changing moles", "Non-healing sores", "Hair loss", "Nail changes", "Excessive sweating", "Dry skin", "None"], "required": true},
      {"key": "skin_symptoms_duration", "label": "How long have you had these skin symptoms?", "type": "select", "options": ["Less than 1 week", "1-4 weeks", "1-3 months", "3-6 months", "6-12 months", "More than 1 year"], "required": false},
      {"key": "neurological", "label": "Neurological symptoms", "type": "checkbox_group", "options": ["Numbness", "Tingling", "Weakness", "Headaches", "None"], "required": true},
      {"key": "musculoskeletal", "label": "Musculoskeletal symptoms", "type": "checkbox_group", "options": ["Joint pain", "Joint swelling", "Muscle aches", "None"], "required": true},
      {"key": "other_symptoms", "label": "Any other symptoms you would like to report?", "type": "textarea", "required": false}
    ]'::JSONB, true
  );
  v_section_order := v_section_order + 1;

  -- 10. Reason for Visit Section
  INSERT INTO intake_form_sections (tenant_id, template_id, section_name, section_key, section_order, title, description, fields, is_required)
  VALUES (
    p_tenant_id, p_template_id, 'Reason for Visit', 'reason_for_visit', v_section_order,
    'Reason for Today''s Visit',
    'Please describe the reason for your visit',
    '[
      {"key": "visit_reason", "label": "What is the main reason for your visit today?", "type": "checkbox_group", "options": ["Full skin exam/screening", "Specific spot or mole concern", "Rash or skin irritation", "Acne", "Eczema/Dermatitis", "Psoriasis", "Skin cancer follow-up", "Cosmetic concern", "Other"], "required": true},
      {"key": "chief_complaint", "label": "Please describe your main concern in detail", "type": "textarea", "required": true},
      {"key": "symptom_duration", "label": "How long have you had this problem?", "type": "select", "options": ["Less than 1 week", "1-2 weeks", "2-4 weeks", "1-3 months", "3-6 months", "6-12 months", "More than 1 year", "Lifelong"], "required": true},
      {"key": "symptom_location", "label": "Where on your body is the problem located?", "type": "text", "required": false, "placeholder": "e.g., Left forearm, Face, Back"},
      {"key": "symptom_progression", "label": "Is the problem getting better, worse, or staying the same?", "type": "select", "options": ["Getting better", "Staying the same", "Getting worse", "Comes and goes"], "required": true},
      {"key": "prior_treatment", "label": "Have you tried any treatments for this problem?", "type": "radio", "options": ["Yes", "No"], "required": true},
      {"key": "prior_treatment_details", "label": "What treatments have you tried?", "type": "textarea", "required": false, "conditional": {"field": "prior_treatment", "equals": "Yes"}},
      {"key": "treatment_effectiveness", "label": "How effective was the treatment?", "type": "select", "options": ["Very effective", "Somewhat effective", "Not effective", "Made it worse"], "required": false, "conditional": {"field": "prior_treatment", "equals": "Yes"}},
      {"key": "additional_concerns", "label": "Is there anything else you would like the provider to know?", "type": "textarea", "required": false}
    ]'::JSONB, true
  );

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Template indexes
CREATE INDEX IF NOT EXISTS idx_intake_templates_tenant ON intake_form_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intake_templates_active ON intake_form_templates(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_intake_templates_type ON intake_form_templates(tenant_id, form_type);
CREATE INDEX IF NOT EXISTS idx_intake_templates_default ON intake_form_templates(tenant_id, form_type, is_default) WHERE is_default = true;

-- Section indexes
CREATE INDEX IF NOT EXISTS idx_intake_sections_template ON intake_form_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_intake_sections_order ON intake_form_sections(template_id, section_order);

-- Assignment indexes
CREATE INDEX IF NOT EXISTS idx_intake_assignments_tenant ON intake_form_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intake_assignments_patient ON intake_form_assignments(patient_id);
CREATE INDEX IF NOT EXISTS idx_intake_assignments_appointment ON intake_form_assignments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_intake_assignments_token ON intake_form_assignments(access_token);
CREATE INDEX IF NOT EXISTS idx_intake_assignments_status ON intake_form_assignments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_intake_assignments_pending ON intake_form_assignments(tenant_id, status, due_by) WHERE status IN ('pending', 'sent', 'started');
CREATE INDEX IF NOT EXISTS idx_intake_assignments_due ON intake_form_assignments(due_by) WHERE status IN ('pending', 'sent', 'started');

-- Response indexes
CREATE INDEX IF NOT EXISTS idx_intake_responses_assignment ON intake_form_responses(assignment_id);
CREATE INDEX IF NOT EXISTS idx_intake_responses_section ON intake_form_responses(section_id);
CREATE INDEX IF NOT EXISTS idx_intake_responses_complete ON intake_form_responses(assignment_id, is_complete);

-- Import indexes
CREATE INDEX IF NOT EXISTS idx_intake_imports_assignment ON intake_form_imports(assignment_id);
CREATE INDEX IF NOT EXISTS idx_intake_imports_tenant ON intake_form_imports(tenant_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for templates
CREATE OR REPLACE FUNCTION update_intake_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_template_updated
  BEFORE UPDATE ON intake_form_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_intake_template_timestamp();

-- Update timestamp trigger for sections
CREATE TRIGGER intake_section_updated
  BEFORE UPDATE ON intake_form_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_intake_template_timestamp();

-- Update timestamp trigger for assignments
CREATE TRIGGER intake_assignment_updated
  BEFORE UPDATE ON intake_form_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_intake_template_timestamp();

-- Auto-update completion percentage when responses change
CREATE OR REPLACE FUNCTION update_assignment_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total_sections INTEGER;
  v_completed_sections INTEGER;
  v_percentage INTEGER;
BEGIN
  -- Get total sections for this assignment
  SELECT a.total_sections INTO v_total_sections
  FROM intake_form_assignments a
  WHERE a.id = NEW.assignment_id;

  -- Count completed sections
  SELECT COUNT(*) INTO v_completed_sections
  FROM intake_form_responses r
  WHERE r.assignment_id = NEW.assignment_id AND r.is_complete = true;

  -- Calculate percentage
  v_percentage := CASE
    WHEN v_total_sections > 0 THEN ROUND((v_completed_sections::NUMERIC / v_total_sections) * 100)
    ELSE 0
  END;

  -- Update assignment
  UPDATE intake_form_assignments
  SET
    sections_completed = v_completed_sections,
    completion_percentage = v_percentage,
    status = CASE
      WHEN v_completed_sections = 0 AND status = 'pending' THEN 'pending'
      WHEN v_completed_sections > 0 AND v_completed_sections < v_total_sections THEN 'started'
      WHEN v_completed_sections = v_total_sections THEN 'completed'
      ELSE status
    END,
    started_at = CASE
      WHEN started_at IS NULL AND v_completed_sections > 0 THEN NOW()
      ELSE started_at
    END,
    completed_at = CASE
      WHEN v_completed_sections = v_total_sections AND completed_at IS NULL THEN NOW()
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = NEW.assignment_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_response_completion_update
  AFTER INSERT OR UPDATE ON intake_form_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_assignment_completion();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for assignment dashboard
CREATE OR REPLACE VIEW intake_assignment_dashboard AS
SELECT
  a.id,
  a.tenant_id,
  a.patient_id,
  a.appointment_id,
  a.template_id,
  a.status,
  a.completion_percentage,
  a.sections_completed,
  a.total_sections,
  a.sent_at,
  a.due_by,
  a.started_at,
  a.completed_at,
  a.flagged_for_review,
  a.created_at,
  t.name as template_name,
  t.form_type,
  p.first_name || ' ' || p.last_name as patient_name,
  p.mrn,
  p.email as patient_email,
  p.cell_phone as patient_phone,
  app.start_time as appointment_time,
  CASE
    WHEN a.status IN ('pending', 'sent', 'started') AND a.due_by < NOW() THEN true
    ELSE false
  END as is_overdue,
  EXTRACT(EPOCH FROM (a.due_by - NOW())) / 3600 as hours_until_due
FROM intake_form_assignments a
JOIN intake_form_templates t ON a.template_id = t.id
JOIN patients p ON a.patient_id = p.id
LEFT JOIN appointments app ON a.appointment_id = app.id
WHERE a.status NOT IN ('expired', 'cancelled');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE intake_form_templates IS 'Reusable intake form templates for different visit types';
COMMENT ON TABLE intake_form_sections IS 'Individual sections within an intake form template';
COMMENT ON TABLE intake_form_assignments IS 'Links a form template to a specific patient/appointment';
COMMENT ON TABLE intake_form_responses IS 'Patient responses to intake form sections';
COMMENT ON TABLE intake_form_imports IS 'Tracks data imported from intake forms to patient charts';
COMMENT ON COLUMN intake_form_templates.form_type IS 'Type of form: new_patient, returning, or procedure_specific';
COMMENT ON COLUMN intake_form_sections.fields IS 'JSONB array of field definitions with type, label, options, validation rules';
COMMENT ON COLUMN intake_form_sections.conditional_logic IS 'Rules for when to show/hide this section based on other responses';
COMMENT ON COLUMN intake_form_assignments.access_token IS 'Secure token for patient to access form without authentication';
