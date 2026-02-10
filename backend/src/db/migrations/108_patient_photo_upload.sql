-- Async Care / Telederm Patient Photo Upload System
-- Migration 108: Patient-initiated photo consultations

-- ============================================================================
-- ASYNC CARE REQUESTS
-- ============================================================================
-- Main table for patient-submitted care requests
CREATE TABLE IF NOT EXISTS async_care_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Request classification
  request_type TEXT NOT NULL CHECK (request_type IN ('photo_consult', 'follow_up', 'new_concern', 'medication_question')),
  concern_category TEXT, -- rash, mole, acne, eczema, psoriasis, wound, other

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'reviewed', 'responded', 'closed', 'cancelled')),
  urgency TEXT DEFAULT 'routine' CHECK (urgency IN ('routine', 'soon', 'urgent')),

  -- Provider assignment
  assigned_provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Patient-provided information
  chief_complaint TEXT,
  symptom_duration TEXT, -- e.g., "2 days", "1 week", "1 month"
  symptom_changes TEXT, -- getting_better, getting_worse, same, comes_and_goes
  pain_level INTEGER CHECK (pain_level IS NULL OR (pain_level >= 0 AND pain_level <= 10)),
  itching_level INTEGER CHECK (itching_level IS NULL OR (itching_level >= 0 AND itching_level <= 10)),

  -- Questionnaire responses stored as JSON
  questionnaire_responses JSONB DEFAULT '{}',

  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  -- Escalation tracking
  escalated_to_appointment BOOLEAN DEFAULT FALSE,
  escalated_appointment_id TEXT,

  -- Portal account reference
  portal_account_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PATIENT UPLOADED PHOTOS
-- ============================================================================
-- Photos uploaded by patients for async care requests
CREATE TABLE IF NOT EXISTS patient_uploaded_photos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES async_care_requests(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Image storage
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  width INTEGER,
  height INTEGER,

  -- Location tagging
  body_location TEXT NOT NULL, -- face, scalp, neck, chest, back, arm_left, arm_right, etc.
  body_location_detail TEXT, -- More specific area, e.g., "left cheek", "upper back"
  body_view TEXT, -- front, back, side

  -- Patient description
  description TEXT,
  is_close_up BOOLEAN DEFAULT FALSE,

  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  processing_error TEXT,

  -- HIPAA compliance
  exif_stripped BOOLEAN DEFAULT FALSE,

  -- Ordering
  sequence_number INTEGER DEFAULT 1,

  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ASYNC CARE RESPONSES
-- ============================================================================
-- Provider responses to async care requests
CREATE TABLE IF NOT EXISTS async_care_responses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES async_care_requests(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- Response type
  response_type TEXT NOT NULL CHECK (response_type IN ('assessment', 'question', 'referral', 'prescription', 'self_care', 'schedule_visit')),

  -- Response content
  response_text TEXT NOT NULL,
  clinical_assessment TEXT,
  recommended_action TEXT,

  -- Diagnosis suggestion (if applicable)
  suggested_diagnosis TEXT,
  suggested_icd10 TEXT,

  -- Follow-up instructions
  follow_up_instructions TEXT,
  follow_up_timeframe TEXT, -- e.g., "if no improvement in 1 week"

  -- Visibility
  visible_to_patient BOOLEAN DEFAULT TRUE,
  internal_notes TEXT, -- Provider-only notes

  responded_at TIMESTAMPTZ DEFAULT NOW(),
  read_by_patient_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ASYNC CARE TEMPLATES
-- ============================================================================
-- Templates for guided questions based on concern type
CREATE TABLE IF NOT EXISTS async_care_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  -- Template classification
  condition_type TEXT NOT NULL, -- rash, mole, acne, eczema, psoriasis, wound, general
  name TEXT NOT NULL,
  description TEXT,

  -- Auto-generated questions for patients
  auto_questions JSONB DEFAULT '[]',
  -- Format: [{ id: string, question: string, type: 'text'|'select'|'multiselect'|'boolean'|'scale', options?: string[], required: boolean }]

  -- Photo requirements
  photo_requirements JSONB DEFAULT '[]',
  -- Format: [{ description: string, body_location: string, required: boolean, example_url?: string }]

  -- Urgency indicators
  urgency_triggers JSONB DEFAULT '[]',
  -- Format: [{ condition: string, urgency: 'urgent'|'soon', message: string }]

  -- Provider routing
  default_provider_id TEXT REFERENCES providers(id),
  specialty_required TEXT,

  -- Template settings
  is_active BOOLEAN DEFAULT TRUE,
  min_photos INTEGER DEFAULT 1,
  max_photos INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================================
-- ASYNC CARE REQUEST HISTORY
-- ============================================================================
-- Track status changes for audit trail
CREATE TABLE IF NOT EXISTS async_care_request_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES async_care_requests(id) ON DELETE CASCADE,

  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT, -- User ID or 'system' or 'patient'
  change_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Async care requests indexes
CREATE INDEX IF NOT EXISTS idx_async_care_requests_tenant ON async_care_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_async_care_requests_patient ON async_care_requests(patient_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_care_requests_status ON async_care_requests(tenant_id, status, urgency);
CREATE INDEX IF NOT EXISTS idx_async_care_requests_provider ON async_care_requests(assigned_provider_id, status) WHERE assigned_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_async_care_requests_pending ON async_care_requests(tenant_id, submitted_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_async_care_requests_queue ON async_care_requests(tenant_id, status, urgency DESC, submitted_at ASC) WHERE status IN ('pending', 'in_review');

-- Patient uploaded photos indexes
CREATE INDEX IF NOT EXISTS idx_patient_uploaded_photos_request ON patient_uploaded_photos(request_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_patient_uploaded_photos_patient ON patient_uploaded_photos(patient_id, uploaded_at DESC);

-- Async care responses indexes
CREATE INDEX IF NOT EXISTS idx_async_care_responses_request ON async_care_responses(request_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_care_responses_provider ON async_care_responses(provider_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_care_responses_unread ON async_care_responses(request_id) WHERE read_by_patient_at IS NULL AND visible_to_patient = TRUE;

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_async_care_templates_tenant ON async_care_templates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_async_care_templates_condition ON async_care_templates(condition_type, is_active) WHERE is_active = TRUE;

-- History indexes
CREATE INDEX IF NOT EXISTS idx_async_care_request_history_request ON async_care_request_history(request_id, created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for async_care_requests
CREATE OR REPLACE FUNCTION update_async_care_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER async_care_requests_updated_at
  BEFORE UPDATE ON async_care_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_async_care_requests_timestamp();

-- Update timestamp trigger for async_care_responses
CREATE OR REPLACE FUNCTION update_async_care_responses_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER async_care_responses_updated_at
  BEFORE UPDATE ON async_care_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_async_care_responses_timestamp();

-- Update timestamp trigger for async_care_templates
CREATE OR REPLACE FUNCTION update_async_care_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER async_care_templates_updated_at
  BEFORE UPDATE ON async_care_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_async_care_templates_timestamp();

-- Auto-create history entry on status change
CREATE OR REPLACE FUNCTION create_async_care_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO async_care_request_history (id, tenant_id, request_id, previous_status, new_status, changed_by)
    VALUES (gen_random_uuid()::text, NEW.tenant_id, NEW.id, OLD.status, NEW.status, 'system');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER async_care_requests_status_history
  AFTER UPDATE ON async_care_requests
  FOR EACH ROW
  EXECUTE FUNCTION create_async_care_status_history();

-- ============================================================================
-- SEED DEFAULT TEMPLATES
-- ============================================================================

INSERT INTO async_care_templates (id, tenant_id, condition_type, name, description, auto_questions, photo_requirements, urgency_triggers, min_photos, max_photos) VALUES
(
  'tmpl_rash_001',
  'default',
  'rash',
  'New Rash Evaluation',
  'Questions and photo requirements for new rash concerns',
  '[
    {"id": "q1", "question": "When did you first notice the rash?", "type": "select", "options": ["Today", "2-3 days ago", "About a week ago", "More than a week ago"], "required": true},
    {"id": "q2", "question": "Is the rash itchy?", "type": "scale", "min": 0, "max": 10, "minLabel": "Not at all", "maxLabel": "Extremely", "required": true},
    {"id": "q3", "question": "Is the rash spreading?", "type": "select", "options": ["Yes, getting larger", "Yes, spreading to new areas", "Staying the same", "Getting smaller"], "required": true},
    {"id": "q4", "question": "Have you started any new medications, soaps, or detergents recently?", "type": "text", "required": false},
    {"id": "q5", "question": "Do you have any fever or feel unwell?", "type": "boolean", "required": true},
    {"id": "q6", "question": "Have you had a similar rash before?", "type": "boolean", "required": false}
  ]',
  '[
    {"description": "Overview photo showing the full extent of the rash", "body_location": "affected_area", "required": true},
    {"description": "Close-up photo of the rash texture", "body_location": "affected_area", "required": true},
    {"description": "Photo from a different angle (if applicable)", "body_location": "affected_area", "required": false}
  ]',
  '[
    {"condition": "fever", "urgency": "urgent", "message": "Rash with fever requires prompt attention"},
    {"condition": "spreading_rapidly", "urgency": "soon", "message": "Rapidly spreading rash should be seen soon"}
  ]',
  2,
  5
),
(
  'tmpl_mole_001',
  'default',
  'mole',
  'Mole/Skin Lesion Check',
  'Questions and photo requirements for concerning moles',
  '[
    {"id": "q1", "question": "How long have you had this mole/spot?", "type": "select", "options": ["New - less than 1 month", "1-6 months", "6-12 months", "More than a year", "Dont know"], "required": true},
    {"id": "q2", "question": "Has it changed in size, shape, or color recently?", "type": "select", "options": ["Yes, getting larger", "Yes, color is changing", "Yes, shape is changing", "Multiple changes", "No changes"], "required": true},
    {"id": "q3", "question": "Does it bleed or crust over?", "type": "boolean", "required": true},
    {"id": "q4", "question": "Is it itchy or painful?", "type": "boolean", "required": false},
    {"id": "q5", "question": "Do you have a family history of skin cancer?", "type": "boolean", "required": true},
    {"id": "q6", "question": "Any other moles you are concerned about?", "type": "text", "required": false}
  ]',
  '[
    {"description": "Close-up photo of the mole (include a ruler or coin for size reference if possible)", "body_location": "affected_area", "required": true},
    {"description": "Photo from a slight angle", "body_location": "affected_area", "required": true},
    {"description": "Overview photo showing location on body", "body_location": "affected_area", "required": false}
  ]',
  '[
    {"condition": "bleeding", "urgency": "soon", "message": "Bleeding moles should be evaluated promptly"},
    {"condition": "rapid_change", "urgency": "soon", "message": "Rapidly changing moles require timely evaluation"},
    {"condition": "multiple_changes", "urgency": "urgent", "message": "Multiple concerning changes should be seen urgently"}
  ]',
  2,
  4
),
(
  'tmpl_followup_001',
  'default',
  'follow_up',
  'Treatment Follow-up',
  'Questions for patients following up on ongoing treatment',
  '[
    {"id": "q1", "question": "What condition are you following up on?", "type": "text", "required": true},
    {"id": "q2", "question": "How would you rate your improvement since starting treatment?", "type": "scale", "min": 0, "max": 10, "minLabel": "No improvement", "maxLabel": "Completely resolved", "required": true},
    {"id": "q3", "question": "Are you using the prescribed treatment as directed?", "type": "select", "options": ["Yes, as directed", "Mostly as directed", "Sometimes skip applications", "Having trouble using it"], "required": true},
    {"id": "q4", "question": "Any side effects from the treatment?", "type": "text", "required": false},
    {"id": "q5", "question": "Do you need a medication refill?", "type": "boolean", "required": false}
  ]',
  '[
    {"description": "Current photo of the affected area", "body_location": "affected_area", "required": true},
    {"description": "Additional photos if condition has spread", "body_location": "other", "required": false}
  ]',
  '[]',
  1,
  3
),
(
  'tmpl_acne_001',
  'default',
  'acne',
  'Acne Evaluation',
  'Questions and photo requirements for acne concerns',
  '[
    {"id": "q1", "question": "How long have you been dealing with acne?", "type": "select", "options": ["Less than 1 month", "1-6 months", "6-12 months", "1-2 years", "More than 2 years"], "required": true},
    {"id": "q2", "question": "What type of breakouts do you mostly have?", "type": "multiselect", "options": ["Blackheads", "Whiteheads", "Red bumps", "Pus-filled pimples", "Deep painful cysts", "Scars"], "required": true},
    {"id": "q3", "question": "Where does your acne occur?", "type": "multiselect", "options": ["Face", "Chest", "Back", "Shoulders", "Other"], "required": true},
    {"id": "q4", "question": "What treatments have you tried?", "type": "text", "required": false},
    {"id": "q5", "question": "For females: Do breakouts worsen around your period?", "type": "select", "options": ["Yes", "No", "Not applicable"], "required": false}
  ]',
  '[
    {"description": "Front view of face in natural lighting", "body_location": "face", "required": true},
    {"description": "Side view of face", "body_location": "face", "required": false},
    {"description": "Photos of other affected areas (chest, back)", "body_location": "other", "required": false}
  ]',
  '[
    {"condition": "severe_cystic", "urgency": "soon", "message": "Severe cystic acne may benefit from earlier treatment"}
  ]',
  1,
  4
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE async_care_requests IS 'Patient-initiated asynchronous care requests for photo consultations';
COMMENT ON TABLE patient_uploaded_photos IS 'Photos uploaded by patients for async care requests';
COMMENT ON TABLE async_care_responses IS 'Provider responses to async care requests';
COMMENT ON TABLE async_care_templates IS 'Templates for guided questions based on concern type';
COMMENT ON TABLE async_care_request_history IS 'Audit trail for async care request status changes';

COMMENT ON COLUMN async_care_requests.request_type IS 'Type of request: photo_consult, follow_up, new_concern, medication_question';
COMMENT ON COLUMN async_care_requests.urgency IS 'Patient-indicated or auto-detected urgency level';
COMMENT ON COLUMN async_care_requests.questionnaire_responses IS 'JSON object containing patient answers to template questions';
COMMENT ON COLUMN patient_uploaded_photos.body_location IS 'Anatomical location tagged by patient';
COMMENT ON COLUMN async_care_responses.response_type IS 'Type of provider response: assessment, question, referral, prescription, self_care, schedule_visit';
COMMENT ON COLUMN async_care_templates.auto_questions IS 'JSON array of questions to ask patient based on concern type';
COMMENT ON COLUMN async_care_templates.photo_requirements IS 'JSON array of required/recommended photos for this concern type';
