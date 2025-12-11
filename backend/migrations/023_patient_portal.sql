-- Patient Portal Schema
-- Comprehensive patient-facing portal for accessing health information

-- Patient portal accounts
CREATE TABLE patient_portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL, -- bcrypt with 10 rounds
  is_active boolean DEFAULT true,
  email_verified boolean DEFAULT false,
  verification_token varchar(255),
  verification_token_expires timestamp,
  reset_token varchar(255),
  reset_token_expires timestamp,
  last_login timestamp,
  failed_login_attempts integer DEFAULT 0,
  locked_until timestamp,
  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp
);

CREATE UNIQUE INDEX idx_portal_accounts_email ON patient_portal_accounts(tenant_id, email);
CREATE INDEX idx_portal_accounts_patient ON patient_portal_accounts(patient_id);
CREATE INDEX idx_portal_accounts_tenant ON patient_portal_accounts(tenant_id);

COMMENT ON TABLE patient_portal_accounts IS 'Patient portal login accounts with email/password authentication';
COMMENT ON COLUMN patient_portal_accounts.password_hash IS 'Bcrypt hash with 10 rounds minimum';
COMMENT ON COLUMN patient_portal_accounts.failed_login_attempts IS 'Account locked after 5 failed attempts';
COMMENT ON COLUMN patient_portal_accounts.locked_until IS 'Account locked for 30 minutes after max failed attempts';

-- Patient portal sessions
CREATE TABLE patient_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES patient_portal_accounts(id) ON DELETE CASCADE,
  session_token varchar(500) NOT NULL UNIQUE,
  ip_address varchar(50),
  user_agent text,
  expires_at timestamp NOT NULL,
  last_activity timestamp DEFAULT current_timestamp,
  created_at timestamp DEFAULT current_timestamp
);

CREATE INDEX idx_portal_sessions_token ON patient_portal_sessions(session_token);
CREATE INDEX idx_portal_sessions_account ON patient_portal_sessions(account_id);
CREATE INDEX idx_portal_sessions_expires ON patient_portal_sessions(expires_at);

COMMENT ON TABLE patient_portal_sessions IS 'Active patient portal sessions with 30-minute inactivity timeout';
COMMENT ON COLUMN patient_portal_sessions.session_token IS 'JWT or UUID session token';
COMMENT ON COLUMN patient_portal_sessions.last_activity IS 'Updated on each request to enforce inactivity timeout';

-- Patient document shares (which documents patient can see)
CREATE TABLE patient_document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES users(id),
  shared_at timestamp DEFAULT current_timestamp,
  viewed_at timestamp,
  notes text,
  category varchar(100) -- Lab Results, Imaging, Forms, Other
);

CREATE INDEX idx_doc_shares_patient ON patient_document_shares(patient_id);
CREATE INDEX idx_doc_shares_document ON patient_document_shares(document_id);
CREATE INDEX idx_doc_shares_tenant ON patient_document_shares(tenant_id);
CREATE INDEX idx_doc_shares_category ON patient_document_shares(category);

COMMENT ON TABLE patient_document_shares IS 'Documents explicitly shared with patients (provider must share)';
COMMENT ON COLUMN patient_document_shares.viewed_at IS 'First time patient viewed the document in portal';

-- Visit summaries (after visit summaries)
CREATE TABLE visit_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id),
  visit_date timestamp NOT NULL,
  chief_complaint text,
  diagnoses jsonb, -- array of {code, description}
  procedures jsonb, -- array of {code, description}
  medications jsonb, -- array of {name, sig, quantity}
  follow_up_instructions text,
  next_appointment_date timestamp,
  is_released boolean DEFAULT false,
  released_at timestamp,
  released_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp
);

CREATE INDEX idx_visit_summaries_patient ON visit_summaries(patient_id);
CREATE INDEX idx_visit_summaries_encounter ON visit_summaries(encounter_id);
CREATE INDEX idx_visit_summaries_released ON visit_summaries(is_released);
CREATE INDEX idx_visit_summaries_tenant ON visit_summaries(tenant_id);
CREATE INDEX idx_visit_summaries_visit_date ON visit_summaries(visit_date DESC);

COMMENT ON TABLE visit_summaries IS 'After-visit summaries that can be released to patient portal';
COMMENT ON COLUMN visit_summaries.is_released IS 'Must be explicitly released by provider before patient can view';
COMMENT ON COLUMN visit_summaries.diagnoses IS 'Array of diagnosis objects with ICD-10 code and description';
COMMENT ON COLUMN visit_summaries.procedures IS 'Array of procedure objects with CPT code and description';
