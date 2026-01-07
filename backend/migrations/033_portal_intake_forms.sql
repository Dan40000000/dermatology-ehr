-- Patient Portal Intake Forms and eCheck-in
-- Digital intake forms, questionnaires, and check-in system

-- Intake form templates (created by staff)
CREATE TABLE portal_intake_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,

  name varchar(255) NOT NULL,
  description text,

  form_type varchar(100) NOT NULL, -- medical_history, review_of_systems, consent, custom

  -- Form structure (JSON schema)
  form_schema jsonb NOT NULL, -- {sections: [{title, fields: [{type, label, required, options}]}]}

  -- When to use this form
  trigger_type varchar(100), -- new_patient, annual_update, pre_appointment, specific_appointment_type
  appointment_type_id uuid REFERENCES appointment_types(id),

  is_active boolean DEFAULT true,
  version integer DEFAULT 1,

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid REFERENCES users(id),
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_form_type CHECK (form_type IN ('medical_history', 'review_of_systems', 'consent', 'insurance', 'demographics', 'custom'))
);

CREATE INDEX idx_form_templates_tenant ON portal_intake_form_templates(tenant_id);
CREATE INDEX idx_form_templates_type ON portal_intake_form_templates(form_type);
CREATE INDEX idx_form_templates_active ON portal_intake_form_templates(is_active) WHERE is_active = true;

COMMENT ON TABLE portal_intake_form_templates IS 'Reusable intake form templates for patient portal';
COMMENT ON COLUMN portal_intake_form_templates.form_schema IS 'JSON schema defining form structure and validation rules';
COMMENT ON COLUMN portal_intake_form_templates.trigger_type IS 'When this form should be shown to patients';

-- Patient intake form assignments (which forms a patient needs to fill out)
CREATE TABLE portal_intake_form_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  form_template_id uuid NOT NULL REFERENCES portal_intake_form_templates(id),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE, -- if tied to specific appointment

  status varchar(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, expired

  assigned_at timestamp DEFAULT current_timestamp,
  assigned_by uuid REFERENCES users(id),

  due_date timestamp, -- when form must be completed by
  expires_at timestamp, -- when form is no longer valid

  completed_at timestamp,

  -- Notifications
  reminder_sent_at timestamp,
  reminder_count integer DEFAULT 0,

  CONSTRAINT valid_assignment_status CHECK (status IN ('pending', 'in_progress', 'completed', 'expired'))
);

CREATE INDEX idx_form_assignments_patient ON portal_intake_form_assignments(patient_id);
CREATE INDEX idx_form_assignments_tenant ON portal_intake_form_assignments(tenant_id);
CREATE INDEX idx_form_assignments_status ON portal_intake_form_assignments(status);
CREATE INDEX idx_form_assignments_appointment ON portal_intake_form_assignments(appointment_id);
CREATE INDEX idx_form_assignments_due ON portal_intake_form_assignments(due_date) WHERE status = 'pending';

COMMENT ON TABLE portal_intake_form_assignments IS 'Forms assigned to specific patients to complete';
COMMENT ON COLUMN portal_intake_form_assignments.due_date IS 'When form should be completed (e.g., before appointment)';

-- Patient intake form responses (completed forms)
CREATE TABLE portal_intake_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,

  assignment_id uuid NOT NULL REFERENCES portal_intake_form_assignments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_template_id uuid NOT NULL REFERENCES portal_intake_form_templates(id),

  -- Response data
  response_data jsonb NOT NULL, -- {section_id: {field_id: value}}

  status varchar(50) NOT NULL DEFAULT 'draft', -- draft, submitted, reviewed, archived

  -- Audit trail
  started_at timestamp DEFAULT current_timestamp,
  submitted_at timestamp,
  reviewed_at timestamp,
  reviewed_by uuid REFERENCES users(id),

  -- Metadata
  ip_address varchar(50),
  user_agent text,
  completion_time_seconds integer, -- how long patient took to complete

  -- Signature (if form requires signature)
  signature_data text, -- base64 encoded signature image
  signature_timestamp timestamp,

  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_response_status CHECK (status IN ('draft', 'submitted', 'reviewed', 'archived'))
);

CREATE INDEX idx_form_responses_assignment ON portal_intake_form_responses(assignment_id);
CREATE INDEX idx_form_responses_patient ON portal_intake_form_responses(patient_id);
CREATE INDEX idx_form_responses_tenant ON portal_intake_form_responses(tenant_id);
CREATE INDEX idx_form_responses_status ON portal_intake_form_responses(status);
CREATE INDEX idx_form_responses_submitted ON portal_intake_form_responses(submitted_at DESC);

COMMENT ON TABLE portal_intake_form_responses IS 'Patient responses to assigned intake forms';
COMMENT ON COLUMN portal_intake_form_responses.response_data IS 'Patient answers to all form fields';
COMMENT ON COLUMN portal_intake_form_responses.completion_time_seconds IS 'Time tracking for form completion analytics';

-- Consent forms (electronic signature capture)
CREATE TABLE portal_consent_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,

  title varchar(255) NOT NULL,
  consent_type varchar(100) NOT NULL, -- treatment, hipaa, financial, photography, telehealth, research

  content text NOT NULL, -- full consent text
  version varchar(50) DEFAULT '1.0',

  requires_signature boolean DEFAULT true,
  requires_witness boolean DEFAULT false,

  is_active boolean DEFAULT true,
  is_required boolean DEFAULT false, -- must be signed before appointments

  effective_date date,
  expiration_date date,

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid REFERENCES users(id),
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_consent_type CHECK (consent_type IN ('treatment', 'hipaa', 'financial', 'photography', 'telehealth', 'research', 'general'))
);

CREATE INDEX idx_consent_forms_tenant ON portal_consent_forms(tenant_id);
CREATE INDEX idx_consent_forms_type ON portal_consent_forms(consent_type);
CREATE INDEX idx_consent_forms_active ON portal_consent_forms(is_active) WHERE is_active = true;
CREATE INDEX idx_consent_forms_required ON portal_consent_forms(is_required) WHERE is_required = true;

COMMENT ON TABLE portal_consent_forms IS 'Consent form templates requiring patient signature';
COMMENT ON COLUMN portal_consent_forms.version IS 'Version number to track consent form updates';
COMMENT ON COLUMN portal_consent_forms.is_required IS 'Must be signed before patient can book appointments';

-- Patient consent signatures (signed consents)
CREATE TABLE portal_consent_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_form_id uuid NOT NULL REFERENCES portal_consent_forms(id),

  -- Signature data
  signature_data text NOT NULL, -- base64 encoded signature image
  signer_name varchar(255) NOT NULL,
  signer_relationship varchar(100) DEFAULT 'self', -- self, parent, guardian, power_of_attorney

  -- Witness (if required)
  witness_signature_data text,
  witness_name varchar(255),

  -- Audit trail
  signed_at timestamp NOT NULL DEFAULT current_timestamp,
  ip_address varchar(50) NOT NULL,
  user_agent text,

  consent_version varchar(50) NOT NULL, -- version of consent that was signed
  consent_content text NOT NULL, -- snapshot of consent text at time of signing

  is_valid boolean DEFAULT true,
  revoked_at timestamp,
  revoked_by uuid REFERENCES users(id),
  revocation_reason text,

  created_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_signer_relationship CHECK (signer_relationship IN ('self', 'parent', 'guardian', 'power_of_attorney', 'other'))
);

CREATE INDEX idx_consent_signatures_patient ON portal_consent_signatures(patient_id);
CREATE INDEX idx_consent_signatures_tenant ON portal_consent_signatures(tenant_id);
CREATE INDEX idx_consent_signatures_form ON portal_consent_signatures(consent_form_id);
CREATE INDEX idx_consent_signatures_signed ON portal_consent_signatures(signed_at DESC);
CREATE INDEX idx_consent_signatures_valid ON portal_consent_signatures(is_valid) WHERE is_valid = true;

COMMENT ON TABLE portal_consent_signatures IS 'Patient signatures on consent forms with full audit trail';
COMMENT ON COLUMN portal_consent_signatures.consent_content IS 'Immutable snapshot of consent text at time of signing';
COMMENT ON COLUMN portal_consent_signatures.is_valid IS 'False if consent is revoked or superseded';

-- eCheck-in sessions (kiosk or mobile check-in)
CREATE TABLE portal_checkin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,

  session_type varchar(50) NOT NULL DEFAULT 'mobile', -- mobile, kiosk, tablet

  status varchar(50) NOT NULL DEFAULT 'started', -- started, insurance_verified, forms_completed, completed, abandoned

  -- Check-in steps completed
  demographics_confirmed boolean DEFAULT false,
  insurance_verified boolean DEFAULT false,
  forms_completed boolean DEFAULT false,
  copay_collected boolean DEFAULT false,

  -- Insurance card uploads
  insurance_card_front_url varchar(500),
  insurance_card_back_url varchar(500),
  insurance_verification_status varchar(50), -- pending, verified, failed

  -- Payment
  copay_amount decimal(10,2),
  copay_payment_id uuid REFERENCES portal_payment_transactions(id),

  -- Notifications
  staff_notified boolean DEFAULT false,
  staff_notified_at timestamp,

  started_at timestamp DEFAULT current_timestamp,
  completed_at timestamp,
  abandoned_at timestamp,

  -- Metadata
  ip_address varchar(50),
  user_agent text,
  device_type varchar(100),
  location_id uuid REFERENCES locations(id),

  CONSTRAINT valid_session_type CHECK (session_type IN ('mobile', 'kiosk', 'tablet')),
  CONSTRAINT valid_checkin_status CHECK (status IN ('started', 'insurance_verified', 'forms_completed', 'completed', 'abandoned'))
);

CREATE INDEX idx_checkin_sessions_patient ON portal_checkin_sessions(patient_id);
CREATE INDEX idx_checkin_sessions_tenant ON portal_checkin_sessions(tenant_id);
CREATE INDEX idx_checkin_sessions_appointment ON portal_checkin_sessions(appointment_id);
CREATE INDEX idx_checkin_sessions_status ON portal_checkin_sessions(status);
CREATE INDEX idx_checkin_sessions_started ON portal_checkin_sessions(started_at DESC);

COMMENT ON TABLE portal_checkin_sessions IS 'Patient check-in sessions via mobile app or kiosk';
COMMENT ON COLUMN portal_checkin_sessions.staff_notified IS 'Whether staff was notified of patient arrival';
COMMENT ON COLUMN portal_checkin_sessions.insurance_card_front_url IS 'Uploaded insurance card image (front)';

-- Pre-appointment questionnaires (specific questions for certain appointment types)
CREATE TABLE portal_pre_appointment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,

  appointment_type_id uuid REFERENCES appointment_types(id),
  specialty varchar(100), -- dermatology, cosmetic, surgical

  question_text text NOT NULL,
  question_type varchar(50) NOT NULL, -- text, textarea, yes_no, multiple_choice, scale
  options jsonb, -- for multiple_choice: {options: ["Option 1", "Option 2"]}

  is_required boolean DEFAULT false,
  display_order integer DEFAULT 0,

  is_active boolean DEFAULT true,

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid REFERENCES users(id),

  CONSTRAINT valid_question_type CHECK (question_type IN ('text', 'textarea', 'yes_no', 'multiple_choice', 'scale', 'date', 'number'))
);

CREATE INDEX idx_pre_appt_questions_tenant ON portal_pre_appointment_questions(tenant_id);
CREATE INDEX idx_pre_appt_questions_type ON portal_pre_appointment_questions(appointment_type_id);
CREATE INDEX idx_pre_appt_questions_active ON portal_pre_appointment_questions(is_active) WHERE is_active = true;

COMMENT ON TABLE portal_pre_appointment_questions IS 'Pre-appointment questions shown during booking or check-in';

-- Seed default consent forms
INSERT INTO portal_consent_forms (tenant_id, title, consent_type, content, version, requires_signature, is_required, is_active)
VALUES
  ('tenant-demo', 'HIPAA Authorization', 'hipaa', 'I acknowledge that I have received and reviewed the Notice of Privacy Practices. I understand that my health information may be used and disclosed as described in the Notice.', '1.0', true, true, true),
  ('tenant-demo', 'Treatment Consent', 'treatment', 'I consent to medical treatment by the providers at this facility. I understand the nature of the proposed treatment and associated risks.', '1.0', true, true, true),
  ('tenant-demo', 'Financial Policy', 'financial', 'I understand that I am financially responsible for all charges incurred. I agree to pay all copays, deductibles, and non-covered services at the time of service.', '1.0', true, false, true),
  ('tenant-demo', 'Photography Consent', 'photography', 'I consent to clinical photography for medical documentation and potential educational purposes. I understand my identity will be protected.', '1.0', true, false, true)
ON CONFLICT DO NOTHING;

-- Seed sample medical history form template
INSERT INTO portal_intake_form_templates (
  tenant_id,
  name,
  description,
  form_type,
  form_schema,
  trigger_type,
  is_active,
  version
)
VALUES (
  'tenant-demo',
  'New Patient Medical History',
  'Comprehensive medical history form for new dermatology patients',
  'medical_history',
  '{
    "sections": [
      {
        "title": "Personal Information",
        "fields": [
          {"id": "allergies", "type": "textarea", "label": "List any allergies (medications, foods, environmental)", "required": true},
          {"id": "current_medications", "type": "textarea", "label": "Current medications and supplements", "required": true}
        ]
      },
      {
        "title": "Medical History",
        "fields": [
          {"id": "previous_skin_conditions", "type": "textarea", "label": "Previous skin conditions or treatments", "required": false},
          {"id": "family_history_skin_cancer", "type": "yes_no", "label": "Family history of skin cancer?", "required": true},
          {"id": "chronic_conditions", "type": "multiple_choice", "label": "Do you have any of the following?", "required": true, "options": ["Diabetes", "High Blood Pressure", "Heart Disease", "Autoimmune Disease", "None"]}
        ]
      },
      {
        "title": "Current Concerns",
        "fields": [
          {"id": "chief_complaint", "type": "textarea", "label": "What brings you in today?", "required": true},
          {"id": "symptom_duration", "type": "text", "label": "How long have you had this concern?", "required": true},
          {"id": "previous_treatment", "type": "textarea", "label": "Have you tried any treatments? What were the results?", "required": false}
        ]
      }
    ]
  }'::jsonb,
  'new_patient',
  true,
  1
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE portal_intake_form_templates IS 'Customizable intake form templates for collecting patient information';
COMMENT ON TABLE portal_consent_signatures IS 'Legally binding electronic signatures with full audit trail';
COMMENT ON TABLE portal_checkin_sessions IS 'Patient self-service check-in reducing front desk workload';
