-- Chronic Skin Conditions Tracking System
-- Enables tracking of chronic dermatological conditions over time with assessments and body region mapping

-- Main chronic conditions table
create table if not exists patient_skin_conditions (
  id text primary key,
  tenant_id text not null,
  patient_id text not null references patients(id) on delete cascade,

  -- Condition details
  condition_type text not null, -- 'psoriasis', 'eczema', 'vitiligo', 'acne', 'rosacea', 'seborrheic_dermatitis'
  body_regions text[], -- array of affected regions (e.g., ['elbow-right', 'knee-left', 'scalp'])

  -- Severity and scoring
  severity text, -- 'mild', 'moderate', 'severe'
  pasi_score numeric(5,2), -- Psoriasis Area and Severity Index (0-72)
  bsa_percentage numeric(5,2), -- Body Surface Area affected (0-100)

  -- Timeline
  onset_date date, -- When condition first started
  diagnosis_date date, -- When officially diagnosed

  -- Treatment tracking
  current_treatment text, -- Current treatment plan/medications
  treatment_response text, -- 'excellent', 'good', 'partial', 'poor', 'none'

  -- Flare management
  flare_triggers text[], -- Array of known triggers (e.g., ['stress', 'weather', 'diet'])
  last_flare_date date, -- Most recent flare-up

  -- Status
  status text default 'active', -- 'active', 'controlled', 'remission'

  -- Clinical notes
  notes text,

  -- Audit fields
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Condition assessments table for tracking progression over time
create table if not exists condition_assessments (
  id text primary key,
  tenant_id text not null,
  condition_id text not null references patient_skin_conditions(id) on delete cascade,
  patient_id text not null references patients(id) on delete cascade,
  encounter_id text references encounters(id) on delete set null,

  -- Assessment details
  assessment_date date not null,
  severity_score numeric(5,2), -- Overall severity score for this assessment

  -- Detailed body region tracking
  affected_areas jsonb, -- { "elbow-right": {"severity": "moderate", "bsa": 5}, "knee-left": {...} }

  -- PASI scoring components (for psoriasis)
  pasi_score numeric(5,2),
  pasi_head numeric(5,2),
  pasi_trunk numeric(5,2),
  pasi_upper_extremities numeric(5,2),
  pasi_lower_extremities numeric(5,2),

  -- Documentation
  photo_ids text[], -- Array of photo IDs linked to this assessment

  -- Treatment at time of assessment
  treatment_at_time text,
  treatment_adherence text, -- 'excellent', 'good', 'fair', 'poor'

  -- Provider observations
  provider_notes text,
  clinical_impression text, -- 'improving', 'stable', 'worsening', 'flaring'

  -- Next steps
  follow_up_recommended boolean default false,
  follow_up_weeks integer, -- Recommended follow-up in X weeks

  -- Audit fields
  assessed_by text references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_skin_conditions_patient on patient_skin_conditions(patient_id);
create index if not exists idx_skin_conditions_tenant on patient_skin_conditions(tenant_id);
create index if not exists idx_skin_conditions_condition_type on patient_skin_conditions(condition_type);
create index if not exists idx_skin_conditions_status on patient_skin_conditions(status);

create index if not exists idx_condition_assessments_condition on condition_assessments(condition_id);
create index if not exists idx_condition_assessments_patient on condition_assessments(patient_id);
create index if not exists idx_condition_assessments_encounter on condition_assessments(encounter_id);
create index if not exists idx_condition_assessments_date on condition_assessments(assessment_date);
create index if not exists idx_condition_assessments_tenant on condition_assessments(tenant_id);

-- Update triggers
create or replace function update_skin_condition_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger skin_condition_updated
  before update on patient_skin_conditions
  for each row
  execute function update_skin_condition_timestamp();

create trigger condition_assessment_updated
  before update on condition_assessments
  for each row
  execute function update_skin_condition_timestamp();

-- Comments for documentation
comment on table patient_skin_conditions is 'Tracks chronic skin conditions for patients over time';
comment on table condition_assessments is 'Individual assessments/check-ins for chronic conditions with detailed tracking';
comment on column patient_skin_conditions.condition_type is 'Type of chronic condition: psoriasis, eczema, vitiligo, acne, rosacea, seborrheic_dermatitis';
comment on column patient_skin_conditions.pasi_score is 'Psoriasis Area and Severity Index (PASI) score: 0-72 scale';
comment on column patient_skin_conditions.bsa_percentage is 'Body Surface Area affected as percentage: 0-100';
comment on column patient_skin_conditions.status is 'Current status: active, controlled, remission';
comment on column condition_assessments.affected_areas is 'JSON object mapping body regions to severity and BSA data';
comment on column condition_assessments.clinical_impression is 'Provider impression: improving, stable, worsening, flaring';
