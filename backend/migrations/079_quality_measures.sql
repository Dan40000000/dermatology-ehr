-- MIPS/Quality Measures System for Dermatology CRM
-- Comprehensive quality measure tracking, MIPS submission, and care gap identification

-- Quality Measures Reference Table
CREATE TABLE IF NOT EXISTS quality_measures (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  measure_id text UNIQUE NOT NULL,  -- CMS/QPP measure identifier (e.g., MIPS137, CQM374)
  measure_name text NOT NULL,
  description text,
  category text NOT NULL,  -- quality, pi, ia, cost
  specialty text DEFAULT 'dermatology',

  -- Measure criteria as JSONB for flexibility
  numerator_criteria jsonb NOT NULL DEFAULT '{}',
  -- Example: {"diagnosis_codes": ["C43.*"], "procedure_codes": ["11600-11646"], "documentation_required": ["margin_status"]}

  denominator_criteria jsonb NOT NULL DEFAULT '{}',
  -- Example: {"age_min": 18, "diagnosis_codes": ["C43.*"], "encounter_types": ["office_visit"]}

  exclusion_criteria jsonb DEFAULT '{}',
  -- Example: {"diagnosis_codes": ["Z85.820"], "conditions": ["hospice_care"]}

  -- Benchmark data for comparison
  benchmark_data jsonb DEFAULT '{}',
  -- Example: {"national_average": 85.5, "top_decile": 95.0, "bottom_decile": 60.0}

  -- Measure metadata
  measure_type text DEFAULT 'process',  -- process, outcome, structure, patient_reported
  high_priority boolean DEFAULT false,
  outcome_measure boolean DEFAULT false,
  inverse_measure boolean DEFAULT false,  -- lower is better
  weight numeric(4,2) DEFAULT 1.0,

  -- Validity period
  effective_date date,
  end_date date,
  is_active boolean DEFAULT true,

  -- Documentation and references
  cms_url text,
  clinical_guidelines text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_measures_category ON quality_measures(category);
CREATE INDEX IF NOT EXISTS idx_quality_measures_specialty ON quality_measures(specialty);
CREATE INDEX IF NOT EXISTS idx_quality_measures_active ON quality_measures(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quality_measures_measure_id ON quality_measures(measure_id);

-- Patient Measure Tracking - Individual patient performance on measures
CREATE TABLE IF NOT EXISTS patient_measure_tracking (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  measure_id text NOT NULL REFERENCES quality_measures(id),
  encounter_id text REFERENCES encounters(id),
  provider_id text REFERENCES users(id),

  -- Tracking status
  is_denominator_eligible boolean DEFAULT false,
  performance_met boolean DEFAULT false,
  exclusion_applied boolean DEFAULT false,
  exclusion_reason text,

  -- Performance details
  numerator_met boolean DEFAULT false,
  denominator_met boolean DEFAULT false,

  -- Tracking period (for annual measures)
  tracking_period_start date NOT NULL,
  tracking_period_end date NOT NULL,

  -- Evaluation details
  evaluated_at timestamptz DEFAULT now(),
  evaluation_method text DEFAULT 'automatic',  -- automatic, manual, claims
  evaluation_notes text,

  -- Source data references
  source_data jsonb DEFAULT '{}',
  -- Example: {"diagnosis_ids": ["..."], "procedure_ids": ["..."], "lab_result_ids": ["..."]}

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, patient_id, measure_id, tracking_period_start, encounter_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_tenant ON patient_measure_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_patient ON patient_measure_tracking(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_measure ON patient_measure_tracking(measure_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_period ON patient_measure_tracking(tracking_period_start, tracking_period_end);
CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_encounter ON patient_measure_tracking(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_tracking_provider ON patient_measure_tracking(provider_id);

-- MIPS Submissions - Track submission history and scores
CREATE TABLE IF NOT EXISTS mips_submissions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  provider_id text REFERENCES users(id),

  -- Submission period
  submission_year integer NOT NULL,
  submission_quarter integer,  -- null for annual
  submission_type text NOT NULL DEFAULT 'quality',  -- quality, pi, ia, cost, final

  -- Submission status
  status text NOT NULL DEFAULT 'draft',  -- draft, pending, submitted, accepted, rejected

  -- MIPS Category Scores
  quality_score numeric(5,2),
  pi_score numeric(5,2),  -- Promoting Interoperability
  ia_score numeric(5,2),  -- Improvement Activities
  cost_score numeric(5,2),
  final_score numeric(5,2),

  -- Category weights (can vary by year)
  quality_weight numeric(4,2) DEFAULT 30.0,
  pi_weight numeric(4,2) DEFAULT 25.0,
  ia_weight numeric(4,2) DEFAULT 15.0,
  cost_weight numeric(4,2) DEFAULT 30.0,

  -- Submission details
  submission_data jsonb DEFAULT '{}',
  -- Contains detailed measure performance data

  -- Submission tracking
  submitted_at timestamptz,
  submitted_by text REFERENCES users(id),
  confirmation_number text,

  -- Response tracking
  response_received_at timestamptz,
  response_data jsonb DEFAULT '{}',
  feedback_summary text,

  -- Payment adjustments
  expected_payment_adjustment numeric(5,2),  -- Percentage adjustment

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mips_submissions_tenant ON mips_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_provider ON mips_submissions(provider_id);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_year ON mips_submissions(submission_year);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_status ON mips_submissions(status);

-- Promoting Interoperability (PI) Tracking
CREATE TABLE IF NOT EXISTS promoting_interoperability_tracking (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),

  -- Measure identification
  measure_name text NOT NULL,
  measure_category text,  -- e_prescribing, hie, portal_access, security

  -- Performance tracking
  numerator integer NOT NULL DEFAULT 0,
  denominator integer NOT NULL DEFAULT 0,
  performance_rate numeric(5,2),

  -- Tracking period
  tracking_period_start date NOT NULL,
  tracking_period_end date NOT NULL,

  -- Bonus/requirement flags
  is_required boolean DEFAULT true,
  is_bonus boolean DEFAULT false,
  bonus_points numeric(4,2) DEFAULT 0,

  -- Attestation for yes/no measures
  attestation_status boolean,
  attestation_date timestamptz,
  attestation_by text REFERENCES users(id),

  -- Documentation
  documentation jsonb DEFAULT '{}',
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, measure_name, tracking_period_start)
);

CREATE INDEX IF NOT EXISTS idx_pi_tracking_tenant ON promoting_interoperability_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pi_tracking_measure ON promoting_interoperability_tracking(measure_name);
CREATE INDEX IF NOT EXISTS idx_pi_tracking_period ON promoting_interoperability_tracking(tracking_period_start, tracking_period_end);

-- Improvement Activities Tracking
CREATE TABLE IF NOT EXISTS improvement_activities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),

  -- Activity identification
  activity_id text NOT NULL,  -- CMS activity ID (e.g., IA_EPA_1)
  activity_name text NOT NULL,
  activity_description text,
  subcategory text,  -- achieving_health_equity, behavioral_mental_health, etc.

  -- Weight and scoring
  weight text NOT NULL DEFAULT 'medium',  -- high, medium
  points numeric(4,2) DEFAULT 10.0,  -- 20 for high, 10 for medium

  -- Activity period
  start_date date NOT NULL,
  end_date date,

  -- Attestation
  attestation_date timestamptz,
  attestation_by text REFERENCES users(id),
  attestation_status text DEFAULT 'not_started',  -- not_started, in_progress, completed, attested

  -- Documentation
  documentation jsonb DEFAULT '{}',
  -- Can include file references, notes, etc.

  -- Validation
  validated boolean DEFAULT false,
  validation_notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, activity_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_improvement_activities_tenant ON improvement_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_improvement_activities_activity ON improvement_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_improvement_activities_period ON improvement_activities(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_improvement_activities_status ON improvement_activities(attestation_status);

-- Quality Gaps - Patients with open care gaps
CREATE TABLE IF NOT EXISTS quality_gaps (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  measure_id text NOT NULL REFERENCES quality_measures(id),
  provider_id text REFERENCES users(id),

  -- Gap status
  status text NOT NULL DEFAULT 'open',  -- open, pending, closed, excluded
  priority text DEFAULT 'medium',  -- high, medium, low

  -- Gap details
  gap_reason text,
  recommended_action text,
  due_date date,

  -- Resolution
  closed_date timestamptz,
  closed_by text REFERENCES users(id),
  intervention_notes text,
  resolution_method text,  -- encounter, outreach, patient_action

  -- Related encounter if gap was addressed
  resolution_encounter_id text REFERENCES encounters(id),

  -- Outreach tracking
  outreach_attempts integer DEFAULT 0,
  last_outreach_date timestamptz,
  last_outreach_method text,  -- phone, email, portal, mail

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, patient_id, measure_id, status) WHERE status = 'open'
);

CREATE INDEX IF NOT EXISTS idx_quality_gaps_tenant ON quality_gaps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quality_gaps_patient ON quality_gaps(patient_id);
CREATE INDEX IF NOT EXISTS idx_quality_gaps_measure ON quality_gaps(measure_id);
CREATE INDEX IF NOT EXISTS idx_quality_gaps_provider ON quality_gaps(provider_id);
CREATE INDEX IF NOT EXISTS idx_quality_gaps_status ON quality_gaps(status);
CREATE INDEX IF NOT EXISTS idx_quality_gaps_due_date ON quality_gaps(due_date) WHERE status = 'open';

-- Measure Performance Summary (aggregated/cached)
CREATE TABLE IF NOT EXISTS measure_performance (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  provider_id text REFERENCES users(id),
  measure_id text NOT NULL REFERENCES quality_measures(id),

  -- Reporting period
  reporting_period_start date NOT NULL,
  reporting_period_end date NOT NULL,

  -- Performance metrics
  numerator_count integer DEFAULT 0,
  denominator_count integer DEFAULT 0,
  exclusion_count integer DEFAULT 0,
  performance_rate numeric(5,2),

  -- Trend data
  previous_period_rate numeric(5,2),
  rate_change numeric(5,2),

  -- Benchmark comparison
  vs_national_average numeric(5,2),
  percentile_rank integer,

  -- Patient list for drill-down
  patient_list jsonb DEFAULT '[]',

  -- Calculation metadata
  last_calculated_at timestamptz DEFAULT now(),
  calculation_method text DEFAULT 'automatic',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, provider_id, measure_id, reporting_period_start, reporting_period_end)
);

CREATE INDEX IF NOT EXISTS idx_measure_performance_tenant ON measure_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_provider ON measure_performance(provider_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_measure ON measure_performance(measure_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_period ON measure_performance(reporting_period_start, reporting_period_end);

-- Patient Measure Events - Raw events that contribute to measures
CREATE TABLE IF NOT EXISTS patient_measure_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  measure_id text NOT NULL REFERENCES quality_measures(id),
  provider_id text REFERENCES users(id),
  encounter_id text REFERENCES encounters(id),

  -- Event details
  event_date date NOT NULL,
  event_type text NOT NULL,  -- diagnosis, procedure, lab, documentation, attestation
  event_code text,  -- CPT, ICD-10, LOINC, etc.
  event_description text,

  -- Measure contribution
  numerator_met boolean DEFAULT false,
  denominator_met boolean DEFAULT false,
  excluded boolean DEFAULT false,
  exclusion_reason text,

  -- Source reference
  source_table text,
  source_id text,
  source_data jsonb DEFAULT '{}',

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_measure_events_tenant ON patient_measure_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_events_patient ON patient_measure_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_events_measure ON patient_measure_events(measure_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_events_date ON patient_measure_events(event_date);
CREATE INDEX IF NOT EXISTS idx_patient_measure_events_encounter ON patient_measure_events(encounter_id);

-- QRDA Report History
CREATE TABLE IF NOT EXISTS qrda_reports (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),

  -- Report metadata
  report_type text NOT NULL,  -- QRDA-I, QRDA-III
  reporting_year integer NOT NULL,
  reporting_period text,  -- annual, Q1, Q2, Q3, Q4

  -- Generation details
  generated_at timestamptz DEFAULT now(),
  generated_by text REFERENCES users(id),

  -- File storage
  file_path text,
  file_size integer,

  -- Content summary
  patient_count integer,
  measure_count integer,
  summary_data jsonb DEFAULT '{}',

  -- Validation
  validated boolean DEFAULT false,
  validation_errors jsonb DEFAULT '[]',

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qrda_reports_tenant ON qrda_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qrda_reports_year ON qrda_reports(reporting_year);

-- Seed Dermatology-Specific Quality Measures
INSERT INTO quality_measures (id, measure_id, measure_name, description, category, specialty, numerator_criteria, denominator_criteria, exclusion_criteria, benchmark_data, measure_type, high_priority)
VALUES
  -- MELANOMA_MARGINS: Melanoma appropriate surgical margins
  (gen_random_uuid()::text, 'MIPS137', 'Melanoma: Coordination of Care',
   'Percentage of patients with a new diagnosis of melanoma or a history of melanoma who have a follow-up plan documented in their medical record',
   'quality', 'dermatology',
   '{"documentation_required": ["follow_up_plan", "surveillance_schedule"], "time_frame_days": 90}',
   '{"diagnosis_codes": ["C43.*", "D03.*", "Z85.820"], "age_min": 18}',
   '{"conditions": ["hospice_care", "palliative_care"]}',
   '{"national_average": 82.5, "top_decile": 95.0, "bottom_decile": 55.0}',
   'process', true),

  -- Melanoma Surgical Margins
  (gen_random_uuid()::text, 'DERM001', 'Melanoma: Appropriate Surgical Margins',
   'Percentage of patients with melanoma who received excision with appropriate surgical margins based on Breslow depth',
   'quality', 'dermatology',
   '{"procedure_codes": ["11600-11646"], "documentation_required": ["margin_measurement", "breslow_depth"], "margin_guidelines": {"in_situ": 5, "<=1mm": 10, "1.01-2mm": 10, ">2mm": 20}}',
   '{"diagnosis_codes": ["C43.*"], "procedure_codes": ["11600-11646"], "age_min": 18}',
   '{"conditions": ["metastatic_disease", "patient_refusal"]}',
   '{"national_average": 88.0, "top_decile": 98.0, "bottom_decile": 70.0}',
   'process', true),

  -- MELANOMA_RECALL: Melanoma recall system
  (gen_random_uuid()::text, 'DERM002', 'Melanoma: Recall System',
   'Percentage of melanoma patients enrolled in structured recall/surveillance program with documented follow-up schedule',
   'quality', 'dermatology',
   '{"documentation_required": ["recall_enrollment", "next_appointment_scheduled"], "follow_up_interval_documented": true}',
   '{"diagnosis_codes": ["C43.*", "D03.*", "Z85.820"], "age_min": 18, "encounter_types": ["office_visit"]}',
   '{"conditions": ["deceased", "transferred_care"]}',
   '{"national_average": 75.0, "top_decile": 92.0, "bottom_decile": 45.0}',
   'process', true),

  -- PSORIASIS_RESPONSE: Clinical response to systemic medications
  (gen_random_uuid()::text, 'MIPS485', 'Psoriasis: Clinical Response Assessment',
   'Percentage of patients with psoriasis treated with systemic therapy who have documented clinical response assessment using validated tools (PASI, BSA, or PGA)',
   'quality', 'dermatology',
   '{"documentation_required": ["pasi_score", "bsa_percent", "pga_score"], "assessment_within_days": 90}',
   '{"diagnosis_codes": ["L40.*"], "medications": ["methotrexate", "cyclosporine", "apremilast", "biologics"], "age_min": 18}',
   '{"conditions": ["pregnancy", "hospice_care"]}',
   '{"national_average": 70.0, "top_decile": 90.0, "bottom_decile": 40.0}',
   'outcome', true),

  -- PSORIASIS_ITCH: Patient-reported itch severity improvement
  (gen_random_uuid()::text, 'DERM003', 'Psoriasis: Patient-Reported Itch Improvement',
   'Percentage of psoriasis patients who demonstrate improvement in patient-reported itch severity (NRS) from baseline',
   'quality', 'dermatology',
   '{"pro_instruments": ["itch_nrs"], "improvement_threshold": 4, "baseline_required": true, "followup_assessment": true}',
   '{"diagnosis_codes": ["L40.*"], "baseline_itch_nrs_min": 4, "age_min": 18}',
   '{"conditions": ["cognitive_impairment", "unable_to_self_report"]}',
   '{"national_average": 65.0, "top_decile": 85.0, "bottom_decile": 35.0}',
   'patient_reported', false),

  -- TB_SCREENING: TB screening before systemic psoriasis meds
  (gen_random_uuid()::text, 'DERM004', 'TB Screening Before Systemic Psoriasis Therapy',
   'Percentage of patients starting systemic psoriasis therapy (biologics, JAK inhibitors) who have documented TB screening within 12 months prior to initiation',
   'quality', 'dermatology',
   '{"lab_tests": ["tb_skin_test", "quantiferon", "tspot"], "within_months": 12, "result_documented": true}',
   '{"diagnosis_codes": ["L40.*"], "medications": ["adalimumab", "etanercept", "infliximab", "ustekinumab", "secukinumab", "ixekizumab", "guselkumab", "risankizumab", "tildrakizumab", "brodalumab", "certolizumab", "tofacitinib", "upadacitinib", "deucravacitinib"], "age_min": 18, "new_start": true}',
   '{"prior_tb_test_positive_treated": true}',
   '{"national_average": 92.0, "top_decile": 99.0, "bottom_decile": 75.0}',
   'process', true),

  -- TOBACCO_SCREENING: Tobacco use screening and cessation
  (gen_random_uuid()::text, 'MIPS226', 'Tobacco Use: Screening and Cessation Intervention',
   'Percentage of patients aged 18 years and older who were screened for tobacco use and received cessation intervention if identified as a tobacco user',
   'quality', 'dermatology',
   '{"documentation_required": ["tobacco_use_assessed", "cessation_intervention"], "intervention_if_user": true}',
   '{"age_min": 18, "encounter_types": ["office_visit", "telehealth"]}',
   '{"conditions": ["limited_life_expectancy"]}',
   '{"national_average": 85.0, "top_decile": 97.0, "bottom_decile": 60.0}',
   'process', false)
ON CONFLICT (measure_id) DO UPDATE SET
  measure_name = EXCLUDED.measure_name,
  description = EXCLUDED.description,
  numerator_criteria = EXCLUDED.numerator_criteria,
  denominator_criteria = EXCLUDED.denominator_criteria,
  exclusion_criteria = EXCLUDED.exclusion_criteria,
  benchmark_data = EXCLUDED.benchmark_data,
  measure_type = EXCLUDED.measure_type,
  high_priority = EXCLUDED.high_priority,
  updated_at = now();

-- Seed Promoting Interoperability Measures
INSERT INTO quality_measures (id, measure_id, measure_name, description, category, specialty, numerator_criteria, denominator_criteria, measure_type)
VALUES
  (gen_random_uuid()::text, 'PI_ERXW', 'e-Prescribing',
   'At least one permissible prescription written and transmitted electronically using CEHRT',
   'pi', 'all',
   '{"action": "electronic_prescription_sent", "certified_ehr": true}',
   '{"has_prescribing_authority": true, "permissible_prescriptions_count_min": 1}',
   'process'),

  (gen_random_uuid()::text, 'PI_HIE_BI', 'Health Information Exchange: Support Electronic Referral Loops - Receiving',
   'For electronic health information received, patient matching, reconciliation, and incorporation into EHR',
   'pi', 'all',
   '{"action": "received_referral_incorporated", "patient_matched": true, "reconciled": true}',
   '{"electronic_summaries_received_count_min": 1}',
   'process'),

  (gen_random_uuid()::text, 'PI_HIE_SO', 'Health Information Exchange: Support Electronic Referral Loops - Sending',
   'For electronic referrals sent, provide summary of care document',
   'pi', 'all',
   '{"action": "referral_sent_with_summary", "summary_included": true}',
   '{"referrals_to_other_providers_count_min": 1}',
   'process'),

  (gen_random_uuid()::text, 'PI_PEA', 'Provide Patients Electronic Access',
   'Patients have timely access to health information through patient portal',
   'pi', 'all',
   '{"action": "portal_access_enabled", "within_business_days": 4}',
   '{"unique_patients_seen_count_min": 1}',
   'process')
ON CONFLICT (measure_id) DO NOTHING;

-- Seed Improvement Activities
INSERT INTO quality_measures (id, measure_id, measure_name, description, category, specialty, weight, measure_type)
VALUES
  (gen_random_uuid()::text, 'IA_EPA_1', 'Provide 24/7 Access to MIPS Eligible Clinicians',
   'Provide 24/7 access to MIPS eligible clinicians or groups for urgent care needs',
   'ia', 'all', 20.0, 'structure'),

  (gen_random_uuid()::text, 'IA_PM_2', 'Anticoagulant Management Improvements',
   'Improve management of patients on anticoagulants',
   'ia', 'all', 20.0, 'process'),

  (gen_random_uuid()::text, 'IA_CC_8', 'Implementation of Condition-Specific Care Management',
   'Implement care management for high-risk patients with chronic conditions',
   'ia', 'dermatology', 10.0, 'process'),

  (gen_random_uuid()::text, 'IA_PSPA_16', 'Use of Patient Safety Tools',
   'Utilize patient safety tools and best practices',
   'ia', 'all', 10.0, 'structure'),

  (gen_random_uuid()::text, 'IA_BE_4', 'Engagement of Patients Through Implementation of Improvements',
   'Engage patients through implementation of practice improvements',
   'ia', 'all', 10.0, 'process')
ON CONFLICT (measure_id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE quality_measures IS 'Reference table for all quality measures including MIPS, PI, and IA categories';
COMMENT ON TABLE patient_measure_tracking IS 'Individual patient performance tracking for quality measures';
COMMENT ON TABLE mips_submissions IS 'MIPS submission history with category scores';
COMMENT ON TABLE promoting_interoperability_tracking IS 'Promoting Interoperability (PI) measure tracking';
COMMENT ON TABLE improvement_activities IS 'Improvement Activity attestation and documentation';
COMMENT ON TABLE quality_gaps IS 'Open care gaps for patient outreach and intervention';
COMMENT ON TABLE measure_performance IS 'Aggregated measure performance by provider and period';
COMMENT ON TABLE patient_measure_events IS 'Raw events that contribute to quality measure calculations';
COMMENT ON TABLE qrda_reports IS 'QRDA report generation history';
