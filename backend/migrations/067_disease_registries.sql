-- Disease Registry System for Dermatology
-- Comprehensive tracking for melanoma, skin cancer, psoriasis, atopic dermatitis, acne, Mohs surgery, and chronic conditions

-- Enhanced registry_cohorts with disease-specific tracking
ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS registry_type text;
ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS auto_populate boolean DEFAULT false;
ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS inclusion_criteria jsonb;

-- Registry member enhancements for disease tracking
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS enrollment_date timestamptz DEFAULT now();
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS last_assessment_date timestamptz;
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS next_followup_date timestamptz;
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS disease_severity text;
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS treatment_status text;
ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Melanoma Registry specific tracking
CREATE TABLE IF NOT EXISTS melanoma_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Initial diagnosis
  diagnosis_date date,
  initial_biopsy_date date,
  primary_site text, -- Location of melanoma

  -- Staging and characteristics
  breslow_depth_mm numeric(5,2), -- Breslow thickness in mm
  clark_level text, -- I-V
  ulceration boolean,
  mitotic_rate integer, -- mitoses per mm2
  ajcc_stage text, -- 0, IA, IB, IIA, IIB, IIC, IIIA, IIIB, IIIC, IIID, IV
  ajcc_t_stage text,
  ajcc_n_stage text,
  ajcc_m_stage text,

  -- Sentinel node biopsy
  sentinel_node_biopsy_performed boolean,
  sentinel_node_biopsy_date date,
  sentinel_node_status text, -- negative, positive, not_performed
  number_positive_nodes integer,
  number_examined_nodes integer,

  -- Genetics
  braf_mutation_status text, -- positive, negative, not_tested
  nras_mutation_status text,
  kit_mutation_status text,

  -- Treatment
  surgery_date date,
  surgery_type text, -- wide local excision, amputation, lymph node dissection
  margins_clear boolean,
  adjuvant_therapy text, -- immunotherapy, targeted therapy, radiation, none
  systemic_therapy_start_date date,

  -- Follow-up surveillance
  surveillance_schedule text, -- every_3_months, every_6_months, annually
  last_full_body_exam date,
  next_scheduled_exam date,

  -- Recurrence tracking
  recurrence_status text, -- no_recurrence, local, regional, distant
  recurrence_date date,
  recurrence_location text,

  -- Quality metrics
  initial_staging_documented boolean DEFAULT false,
  surveillance_adherent boolean,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_melanoma_registry_tenant ON melanoma_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_melanoma_registry_patient ON melanoma_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_melanoma_registry_next_exam ON melanoma_registry(next_scheduled_exam) WHERE recurrence_status = 'no_recurrence';

-- Non-melanoma Skin Cancer Registry
CREATE TABLE IF NOT EXISTS skin_cancer_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Diagnosis
  diagnosis_date date,
  cancer_type text, -- BCC, SCC, other
  location text,
  histologic_subtype text, -- nodular, superficial, infiltrative (BCC); well-diff, moderate, poor (SCC)

  -- High-risk features (for SCC)
  size_mm numeric(5,1),
  depth_mm numeric(5,1),
  perineural_invasion boolean,
  poor_differentiation boolean,
  high_risk_location boolean, -- ear, lip, temple

  -- Treatment
  treatment_date date,
  treatment_modality text, -- Mohs, excision, curettage, cryotherapy, radiation, topical
  mohs_surgery_id text, -- Link to mohs_surgery_registry if applicable
  margins_clear boolean,

  -- Recurrence
  recurrence_status text, -- no_recurrence, local_recurrence
  recurrence_date date,
  time_to_recurrence_months integer,

  -- Follow-up
  last_skin_check date,
  next_skin_check date,
  surveillance_frequency text, -- every_6_months, annually

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id, diagnosis_date, location)
);

CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_tenant ON skin_cancer_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_patient ON skin_cancer_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_next_check ON skin_cancer_registry(next_skin_check);

-- Psoriasis Registry
CREATE TABLE IF NOT EXISTS psoriasis_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Diagnosis
  diagnosis_date date,
  psoriasis_type text, -- plaque, guttate, inverse, pustular, erythrodermic
  body_surface_area_percent numeric(5,2),

  -- Current severity scores
  current_pasi_score numeric(4,1), -- 0-72 scale
  current_bsa_percent numeric(5,2),
  current_pga_score integer, -- 0-5 scale

  -- Patient-reported outcomes
  current_dlqi_score integer, -- 0-30 scale
  current_itch_severity integer, -- 0-10 scale

  -- Comorbidities
  psoriatic_arthritis boolean,
  psa_diagnosis_date date,

  -- Current treatment
  current_treatment_type text, -- topical, phototherapy, oral, biologic, combination
  current_systemic_medication text,
  biologic_name text,
  biologic_start_date date,
  treatment_start_date date,

  -- Treatment history
  previous_biologics jsonb, -- Array of {name, start_date, end_date, reason_stopped}
  previous_systemics jsonb,

  -- Lab monitoring
  last_lab_date date,
  next_lab_due date,
  tb_screening_date date,
  hepatitis_screening_date date,

  -- Quality metrics
  baseline_pasi_documented boolean,
  labs_up_to_date boolean,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_tenant ON psoriasis_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_patient ON psoriasis_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_next_labs ON psoriasis_registry(next_lab_due);

-- PASI Score History
CREATE TABLE IF NOT EXISTS pasi_score_history (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  psoriasis_registry_id text REFERENCES psoriasis_registry(id),

  assessment_date date NOT NULL,
  pasi_score numeric(4,1),
  bsa_percent numeric(5,2),
  pga_score integer,
  dlqi_score integer,
  itch_severity integer,

  treatment_at_time text,
  assessed_by text REFERENCES users(id),
  notes text,

  created_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, patient_id, assessment_date)
);

CREATE INDEX IF NOT EXISTS idx_pasi_history_patient ON pasi_score_history(patient_id, assessment_date DESC);

-- Atopic Dermatitis Registry
CREATE TABLE IF NOT EXISTS atopic_dermatitis_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Diagnosis
  diagnosis_date date,
  age_at_onset integer,
  atopy_history text, -- asthma, allergic_rhinitis, food_allergies

  -- Current severity
  current_easi_score numeric(5,1), -- 0-72 scale
  current_scorad_score numeric(5,1), -- 0-103 scale
  current_iga_score integer, -- 0-4 scale
  affected_body_areas text,

  -- Patient-reported
  current_itch_intensity integer, -- 0-10 NRS
  current_sleep_disturbance integer, -- 0-10 NRS
  current_dlqi_score integer,

  -- Current treatment
  current_treatment_ladder text, -- step_1_topical, step_2_phototherapy, step_3_systemic, step_4_biologic
  current_topical_regimen text,
  current_systemic_medication text,
  biologic_name text,
  biologic_start_date date,

  -- Flare tracking
  flares_per_year integer,
  last_flare_date date,
  typical_trigger text,

  -- Lab monitoring
  last_lab_date date,
  next_lab_due date,
  ige_level numeric,
  eosinophil_count integer,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_registry_tenant ON atopic_dermatitis_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_registry_patient ON atopic_dermatitis_registry(patient_id);

-- EASI/SCORAD History
CREATE TABLE IF NOT EXISTS ad_score_history (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  ad_registry_id text REFERENCES atopic_dermatitis_registry(id),

  assessment_date date NOT NULL,
  easi_score numeric(5,1),
  scorad_score numeric(5,1),
  iga_score integer,
  itch_intensity integer,
  sleep_disturbance integer,

  treatment_at_time text,
  assessed_by text REFERENCES users(id),
  notes text,

  created_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, patient_id, assessment_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_history_patient ON ad_score_history(patient_id, assessment_date DESC);

-- Acne/Isotretinoin Registry (iPLEDGE tracking)
CREATE TABLE IF NOT EXISTS acne_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Diagnosis
  diagnosis_date date,
  acne_type text, -- comedonal, inflammatory, nodulocystic, acne_conglobata
  severity text, -- mild, moderate, severe

  -- Isotretinoin tracking
  on_isotretinoin boolean DEFAULT false,
  isotretinoin_start_date date,
  isotretinoin_end_date date,
  ipledge_enrolled boolean DEFAULT false,
  ipledge_id text,

  -- For female patients
  pregnancy_category text, -- can_get_pregnant, cannot_get_pregnant
  two_forms_contraception boolean,

  -- Monthly requirements
  last_pregnancy_test_date date,
  next_pregnancy_test_due date,
  last_ipledge_quiz_date date,
  next_ipledge_quiz_due date,

  -- Lab monitoring
  last_lab_date date,
  next_lab_due date,
  baseline_lipids_done boolean,
  baseline_lft_done boolean,

  -- Treatment response
  cumulative_dose_mg numeric(10,2),
  target_cumulative_dose_mg numeric(10,2),
  treatment_response text, -- excellent, good, fair, poor

  -- Quality metrics
  monthly_monitoring_adherent boolean,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_acne_registry_tenant ON acne_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acne_registry_patient ON acne_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_acne_registry_isotretinoin ON acne_registry(on_isotretinoin) WHERE on_isotretinoin = true;
CREATE INDEX IF NOT EXISTS idx_acne_registry_next_preg_test ON acne_registry(next_pregnancy_test_due) WHERE on_isotretinoin = true;

-- Mohs Surgery Registry
CREATE TABLE IF NOT EXISTS mohs_surgery_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Surgery details
  surgery_date date NOT NULL,
  tumor_type text, -- BCC, SCC, other
  tumor_location text,
  histologic_subtype text,

  -- Pre-op assessment
  clinical_size_mm numeric(5,1),
  high_risk_features boolean,
  recurrent_tumor boolean,

  -- Intraoperative
  number_of_stages integer,
  final_defect_size_mm numeric(5,1),

  -- Reconstruction
  reconstruction_type text, -- primary_closure, flap, graft, second_intention
  reconstruction_location text,
  performing_surgeon text REFERENCES users(id),

  -- Pathology
  margins_clear boolean DEFAULT true,
  perineural_invasion boolean,

  -- Follow-up
  last_followup_date date,
  next_followup_date date,

  -- Complications
  complications text, -- infection, bleeding, dehiscence, flap_necrosis, none
  complication_date date,

  -- Outcomes
  recurrence_status text DEFAULT 'no_recurrence',
  recurrence_date date,
  cosmetic_outcome text, -- excellent, good, fair, poor

  -- Quality metrics
  stages_documented boolean,
  reconstruction_documented boolean,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id, surgery_date, tumor_location)
);

CREATE INDEX IF NOT EXISTS idx_mohs_registry_tenant ON mohs_surgery_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mohs_registry_patient ON mohs_surgery_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_mohs_registry_surgery_date ON mohs_surgery_registry(surgery_date DESC);

-- Chronic Systemic Therapy Registry
CREATE TABLE IF NOT EXISTS chronic_therapy_registry (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  registry_member_id text REFERENCES registry_members(id),

  -- Indication
  primary_diagnosis text, -- psoriasis, atopic_dermatitis, lupus, pemphigus, etc

  -- Current therapy
  medication_name text,
  medication_class text, -- methotrexate, cyclosporine, biologic, jak_inhibitor
  start_date date,
  current_dose text,
  dosing_frequency text,

  -- Lab monitoring protocol
  monitoring_protocol text, -- methotrexate_protocol, biologic_protocol, custom
  required_labs text, -- CBC, CMP, LFT, lipids, etc
  lab_frequency text, -- monthly, every_3_months, every_6_months

  -- Lab tracking
  last_lab_date date,
  next_lab_due date,
  last_cbc_date date,
  last_lft_date date,
  last_creatinine_date date,

  -- Screening requirements
  last_tb_screening date,
  next_tb_screening_due date,
  last_hepatitis_screening date,
  hepatitis_b_status text,
  hepatitis_c_status text,

  -- Immunization tracking
  last_pneumovax_date date,
  last_flu_shot_date date,
  last_shingrix_date date,

  -- Safety monitoring
  adverse_events jsonb,
  last_safety_review_date date,

  -- Quality metrics
  labs_up_to_date boolean,
  screening_up_to_date boolean,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text REFERENCES users(id),

  UNIQUE(tenant_id, patient_id, medication_name, start_date)
);

CREATE INDEX IF NOT EXISTS idx_chronic_therapy_tenant ON chronic_therapy_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chronic_therapy_patient ON chronic_therapy_registry(patient_id);
CREATE INDEX IF NOT EXISTS idx_chronic_therapy_next_labs ON chronic_therapy_registry(next_lab_due);
CREATE INDEX IF NOT EXISTS idx_chronic_therapy_overdue ON chronic_therapy_registry(next_lab_due);

-- Create default disease registries
INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Melanoma Registry',
  'Track melanoma patients with staging, sentinel node status, and surveillance schedules per MIPS 137',
  'active',
  'melanoma',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Skin Cancer Registry',
  'BCC/SCC patients with treatment modality and recurrence tracking',
  'active',
  'skin_cancer',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Psoriasis Registry',
  'PASI scores over time, treatment history, and biologic usage per MIPS 485',
  'active',
  'psoriasis',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Atopic Dermatitis Registry',
  'EASI/SCORAD scores, treatment ladder, and flare frequency tracking',
  'active',
  'atopic_dermatitis',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Acne/Isotretinoin Registry',
  'iPLEDGE tracking, pregnancy tests, and lab monitoring',
  'active',
  'acne',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Mohs Surgery Registry',
  'Tumor type, location, stages required, and reconstruction tracking',
  'active',
  'mohs_surgery',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id,
  'Chronic Systemic Therapy Registry',
  'Patients on long-term systemic therapy (methotrexate, biologics) with lab monitoring',
  'active',
  'chronic_therapy',
  true,
  now(),
  now()
FROM tenants
ON CONFLICT DO NOTHING;

COMMENT ON TABLE melanoma_registry IS 'MIPS 137: Melanoma surveillance and continuity of care tracking';
COMMENT ON TABLE psoriasis_registry IS 'MIPS 485: Psoriasis patient-reported itch severity tracking';
COMMENT ON TABLE acne_registry IS 'iPLEDGE compliance tracking for isotretinoin patients';
COMMENT ON TABLE chronic_therapy_registry IS 'Lab monitoring and safety tracking for systemic therapies';
