-- MIPS/MACRA Quality Measure Reporting System
-- Migration 112: Comprehensive MIPS reporting tables for dermatology

-- ============================================================================
-- QUALITY MEASURES TABLE (Enhanced if already exists)
-- ============================================================================

-- Drop and recreate quality_measures with enhanced schema if needed
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_measures' AND column_name = 'points') THEN
    ALTER TABLE quality_measures ADD COLUMN points INTEGER DEFAULT 10;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_measures' AND column_name = 'reporting_period_type') THEN
    ALTER TABLE quality_measures ADD COLUMN reporting_period_type VARCHAR(20) DEFAULT 'annual';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_measures' AND column_name = 'cms_measure_id') THEN
    ALTER TABLE quality_measures ADD COLUMN cms_measure_id VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_measures' AND column_name = 'submission_method') THEN
    ALTER TABLE quality_measures ADD COLUMN submission_method VARCHAR(50) DEFAULT 'registry';
  END IF;
END $$;

-- ============================================================================
-- MEASURE PERFORMANCE TABLE (Provider-level aggregated performance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS measure_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  measure_id UUID NOT NULL,
  provider_id UUID,
  reporting_period_start DATE NOT NULL,
  reporting_period_end DATE NOT NULL,
  numerator_count INTEGER DEFAULT 0,
  denominator_count INTEGER DEFAULT 0,
  exclusion_count INTEGER DEFAULT 0,
  performance_rate DECIMAL(5,2) DEFAULT 0.00,
  met_threshold BOOLEAN DEFAULT FALSE,
  benchmark_percentile INTEGER,
  decile_score INTEGER,
  points_earned DECIMAL(5,2) DEFAULT 0.00,
  bonus_points DECIMAL(5,2) DEFAULT 0.00,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider_id, measure_id, reporting_period_start, reporting_period_end)
);

CREATE INDEX IF NOT EXISTS idx_measure_performance_tenant ON measure_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_provider ON measure_performance(provider_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_measure ON measure_performance(measure_id);
CREATE INDEX IF NOT EXISTS idx_measure_performance_period ON measure_performance(reporting_period_start, reporting_period_end);

-- ============================================================================
-- PATIENT MEASURE STATUS (Individual patient tracking per encounter)
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_measure_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  measure_id UUID NOT NULL,
  encounter_id UUID,
  provider_id UUID,
  status VARCHAR(20) NOT NULL CHECK (status IN ('eligible', 'met', 'not_met', 'excluded', 'pending')),
  status_date DATE NOT NULL DEFAULT CURRENT_DATE,
  documentation TEXT,
  documentation_data JSONB DEFAULT '{}',
  exclusion_reason VARCHAR(255),
  performance_met BOOLEAN DEFAULT FALSE,
  source_data JSONB DEFAULT '{}',
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_measure_status_tenant ON patient_measure_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_status_patient ON patient_measure_status(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_status_measure ON patient_measure_status(measure_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_status_encounter ON patient_measure_status(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_measure_status_status ON patient_measure_status(status);
CREATE INDEX IF NOT EXISTS idx_patient_measure_status_date ON patient_measure_status(status_date);

-- ============================================================================
-- MIPS SUBMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mips_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider_id UUID,
  submission_year INTEGER NOT NULL,
  submission_quarter INTEGER,
  submission_date TIMESTAMPTZ DEFAULT NOW(),
  submission_type VARCHAR(50) NOT NULL DEFAULT 'final' CHECK (submission_type IN ('quality', 'pi', 'ia', 'cost', 'final', 'interim', 'correction')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'submitted', 'accepted', 'rejected', 'under_review', 'corrected')),
  confirmation_number VARCHAR(100),
  quality_score DECIMAL(5,2),
  pi_score DECIMAL(5,2),
  ia_score DECIMAL(5,2),
  cost_score DECIMAL(5,2),
  final_score DECIMAL(5,2),
  payment_adjustment DECIMAL(5,2),
  submission_data JSONB DEFAULT '{}',
  response_data JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mips_submissions_tenant ON mips_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_provider ON mips_submissions(provider_id);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_year ON mips_submissions(submission_year);
CREATE INDEX IF NOT EXISTS idx_mips_submissions_status ON mips_submissions(status);

-- ============================================================================
-- IMPROVEMENT ACTIVITIES (IA) TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ia_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  activity_id VARCHAR(50) NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  activity_description TEXT,
  weight VARCHAR(20) NOT NULL CHECK (weight IN ('medium', 'high')),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  points INTEGER DEFAULT 10,
  is_attested BOOLEAN DEFAULT FALSE,
  attestation_date DATE,
  attestation_by UUID,
  start_date DATE,
  end_date DATE,
  documentation JSONB DEFAULT '{}',
  evidence_files JSONB DEFAULT '[]',
  attestation_status VARCHAR(30) DEFAULT 'not_started' CHECK (attestation_status IN ('not_started', 'in_progress', 'attested', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, activity_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_ia_activities_tenant ON ia_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ia_activities_activity ON ia_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_ia_activities_attestation ON ia_activities(is_attested);

-- ============================================================================
-- DERMATOLOGY-SPECIFIC MIPS MEASURES SEED DATA
-- ============================================================================

-- Insert dermatology-relevant MIPS measures if they don't exist
INSERT INTO quality_measures (
  id, measure_id, measure_name, description, category, specialty,
  numerator_criteria, denominator_criteria, exclusion_criteria,
  benchmark_data, weight, high_priority, is_active, points, cms_measure_id
)
SELECT
  gen_random_uuid(),
  measure_id,
  measure_name,
  description,
  category,
  specialty,
  numerator_criteria,
  denominator_criteria,
  exclusion_criteria,
  benchmark_data,
  weight,
  high_priority,
  is_active,
  points,
  cms_measure_id
FROM (VALUES
  -- Melanoma Continuity of Care
  (
    'MIPS137',
    'Melanoma: Continuity of Care - Recall System',
    'Percentage of patients with a current diagnosis of melanoma or a history of melanoma whose information was entered, at least once within a 12 month period, into a recall system with a documented recall date',
    'quality',
    'dermatology',
    '{"documentation_required": ["recall_system_entry", "follow_up_scheduled"], "recall_documented": true}'::jsonb,
    '{"diagnosis_codes": ["C43.*", "D03.*", "Z85.820"], "age_min": 18}'::jsonb,
    '{"conditions": ["patient_refused", "hospice_care", "terminal_illness"]}'::jsonb,
    '{"national_average": 78.5, "top_decile": 95.0}'::jsonb,
    20,
    true,
    true,
    10,
    '137'
  ),

  -- Biopsy Follow-up
  (
    'DERM-BIOPSY-FU',
    'Biopsy Follow-up: Results Communication',
    'Percentage of patients who had a skin biopsy during the measurement period with documented communication of results to patient within 14 days',
    'quality',
    'dermatology',
    '{"documentation_required": ["result_communicated", "communication_method", "communication_date"], "days_within": 14}'::jsonb,
    '{"procedure_codes": ["11102", "11103", "11104", "11105", "11106", "11107"], "age_min": 18}'::jsonb,
    '{"conditions": ["patient_deceased", "patient_unreachable", "emergency_transfer"]}'::jsonb,
    '{"national_average": 85.0, "top_decile": 98.0}'::jsonb,
    10,
    true,
    true,
    10,
    NULL
  ),

  -- Skin Cancer Prevention Counseling
  (
    'DERM-PREVENTION',
    'Skin Cancer Prevention: Sun Protection Counseling',
    'Percentage of patients aged 18 and older with documented skin cancer prevention counseling including sun protection, self-examination education, and risk factor discussion',
    'quality',
    'dermatology',
    '{"documentation_required": ["sun_protection_counseling", "self_exam_education"], "counseling_documented": true}'::jsonb,
    '{"age_min": 18, "encounter_types": ["office_visit", "annual_exam", "skin_check"]}'::jsonb,
    '{"conditions": ["hospice_care", "limited_life_expectancy"]}'::jsonb,
    '{"national_average": 65.0, "top_decile": 92.0}'::jsonb,
    10,
    false,
    true,
    10,
    NULL
  ),

  -- Tobacco Screening and Cessation (MIPS Quality Measure)
  (
    'MIPS226',
    'Preventive Care and Screening: Tobacco Use Screening and Cessation Intervention',
    'Percentage of patients aged 18 years and older who were screened for tobacco use one or more times within 12 months AND who received tobacco cessation intervention if identified as a tobacco user',
    'quality',
    'all',
    '{"documentation_required": ["tobacco_screening", "cessation_intervention_if_user"], "screening_complete": true}'::jsonb,
    '{"age_min": 18, "encounter_types": ["office_visit"]}'::jsonb,
    '{"conditions": ["limited_life_expectancy", "palliative_care"]}'::jsonb,
    '{"national_average": 82.0, "top_decile": 97.0}'::jsonb,
    10,
    true,
    true,
    10,
    '226'
  ),

  -- BMI Screening and Follow-up
  (
    'MIPS128',
    'Preventive Care and Screening: Body Mass Index (BMI) Screening and Follow-Up Plan',
    'Percentage of patients aged 18 years and older with a BMI documented during the encounter or within the previous twelve months AND with a follow-up plan documented if BMI is outside parameters',
    'quality',
    'all',
    '{"documentation_required": ["bmi_documented", "follow_up_plan_if_abnormal"], "bmi_recorded": true}'::jsonb,
    '{"age_min": 18, "encounter_types": ["office_visit"]}'::jsonb,
    '{"conditions": ["palliative_care", "pregnancy"], "diagnosis_codes": ["Z68.1", "R63.4"]}'::jsonb,
    '{"national_average": 75.0, "top_decile": 95.0}'::jsonb,
    10,
    false,
    true,
    10,
    '128'
  ),

  -- Medication Reconciliation
  (
    'MIPS046',
    'Medication Reconciliation Post-Discharge',
    'Percentage of discharges from any inpatient facility during the measurement period for patients 18 years and older with a reconciliation of the discharge medications with the current medication list in the medical record documented',
    'quality',
    'all',
    '{"documentation_required": ["medication_reconciliation"], "reconciliation_complete": true}'::jsonb,
    '{"age_min": 18, "discharge_within_days": 30}'::jsonb,
    '{"conditions": ["patient_expired", "left_against_medical_advice"]}'::jsonb,
    '{"national_average": 70.0, "top_decile": 92.0}'::jsonb,
    10,
    false,
    true,
    10,
    '046'
  ),

  -- Advanced Care Planning
  (
    'MIPS047',
    'Advance Care Plan',
    'Percentage of patients aged 65 years and older who have an advance care plan or surrogate decision maker documented in the medical record or documentation in the medical record that an advance care plan was discussed',
    'quality',
    'all',
    '{"documentation_required": ["advance_care_plan", "surrogate_decision_maker"], "discussion_documented": true}'::jsonb,
    '{"age_min": 65, "encounter_types": ["office_visit", "annual_wellness"]}'::jsonb,
    '{"conditions": []}'::jsonb,
    '{"national_average": 55.0, "top_decile": 85.0}'::jsonb,
    10,
    false,
    true,
    10,
    '047'
  ),

  -- Psoriasis Response Assessment
  (
    'MIPS485',
    'Psoriasis: Assessment of Disease Activity',
    'Percentage of patients with psoriasis who have documented assessment of disease activity using a standardized measure (PASI, BSA, or PGA)',
    'quality',
    'dermatology',
    '{"documentation_required": ["pasi_score", "bsa_assessment", "pga_score"], "assessment_complete": true, "pro_instruments": ["PASI", "BSA", "PGA"]}'::jsonb,
    '{"diagnosis_codes": ["L40.*"], "age_min": 18}'::jsonb,
    '{"conditions": ["hospice_care"]}'::jsonb,
    '{"national_average": 72.0, "top_decile": 94.0}'::jsonb,
    10,
    true,
    true,
    10,
    '485'
  )
) AS measures(measure_id, measure_name, description, category, specialty, numerator_criteria, denominator_criteria, exclusion_criteria, benchmark_data, weight, high_priority, is_active, points, cms_measure_id)
WHERE NOT EXISTS (
  SELECT 1 FROM quality_measures qm WHERE qm.measure_id = measures.measure_id
);

-- ============================================================================
-- IMPROVEMENT ACTIVITIES SEED DATA
-- ============================================================================

INSERT INTO quality_measures (
  id, measure_id, measure_name, description, category, specialty,
  numerator_criteria, denominator_criteria, exclusion_criteria,
  weight, is_active, points
)
SELECT
  gen_random_uuid(),
  activity_id,
  activity_name,
  description,
  'ia',
  'all',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  weight,
  true,
  points
FROM (VALUES
  ('IA_BE_4', 'Use of patient safety tools', 'Use of tools such as checklists, trigger tools, or validated patient safety screening tools to identify patients at risk', 20, 20),
  ('IA_BE_6', 'Collection and follow-up on patient experience and satisfaction data', 'Regularly collect and act on patient experience and satisfaction data', 10, 10),
  ('IA_CC_1', 'Implementation of care coordination agreements', 'Implement care coordination agreements with other providers', 10, 10),
  ('IA_CC_8', 'Implementation of documentation improvements for care coordination', 'Improvements to documentation to support care coordination', 10, 10),
  ('IA_PM_2', 'Anticoagulant management improvements', 'Managing anticoagulant medication therapy', 20, 20),
  ('IA_PM_4', 'Glycemic management services', 'For patients with diabetes, managing glycemic control', 10, 10),
  ('IA_PM_13', 'Chronic Care Management', 'Providing chronic care management services', 10, 10),
  ('IA_PM_16', 'Implementation of medication management practice improvements', 'Practice improvements in medication management', 10, 10),
  ('IA_PSPA_7', 'Use of QCDR data for quality improvement', 'Use QCDR quality data to drive improvements', 10, 10),
  ('IA_PSPA_16', 'Use of clinical decision support tools', 'Implementation of clinical decision support tools', 10, 10),
  ('IA_EPA_1', 'Provide 24/7 access to MIPS eligible clinicians', 'Patient access to clinician or practice 24/7', 20, 20),
  ('IA_EPA_2', 'Use of telehealth services', 'Provide telehealth services for patient encounters', 10, 10),
  ('IA_AHE_3', 'Promote use of patient-reported outcomes', 'Use patient-reported outcome measures in clinical practice', 20, 20),
  ('IA_BMH_7', 'Integration of behavioral health and primary care', 'Integrate behavioral health in dermatology practice', 10, 10)
) AS activities(activity_id, activity_name, description, weight, points)
WHERE NOT EXISTS (
  SELECT 1 FROM quality_measures qm WHERE qm.measure_id = activities.activity_id
);

-- ============================================================================
-- PROMOTING INTEROPERABILITY TRACKING ENHANCEMENTS
-- ============================================================================

-- Add columns to promoting_interoperability_tracking if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promoting_interoperability_tracking' AND column_name = 'attestation_status') THEN
    ALTER TABLE promoting_interoperability_tracking ADD COLUMN attestation_status BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promoting_interoperability_tracking' AND column_name = 'exclusion_applied') THEN
    ALTER TABLE promoting_interoperability_tracking ADD COLUMN exclusion_applied BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promoting_interoperability_tracking' AND column_name = 'exclusion_reason') THEN
    ALTER TABLE promoting_interoperability_tracking ADD COLUMN exclusion_reason VARCHAR(255);
  END IF;
END $$;

-- ============================================================================
-- ENCOUNTER MEASURE CHECKLIST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS encounter_measure_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  measure_id UUID NOT NULL,
  measure_code VARCHAR(50) NOT NULL,
  measure_name VARCHAR(255) NOT NULL,
  is_applicable BOOLEAN DEFAULT TRUE,
  is_completed BOOLEAN DEFAULT FALSE,
  completion_status VARCHAR(30) DEFAULT 'pending' CHECK (completion_status IN ('pending', 'met', 'not_met', 'excluded', 'not_applicable')),
  completion_notes TEXT,
  required_actions JSONB DEFAULT '[]',
  completed_actions JSONB DEFAULT '[]',
  prompted_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounter_measure_checklist_tenant ON encounter_measure_checklist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encounter_measure_checklist_encounter ON encounter_measure_checklist(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_measure_checklist_patient ON encounter_measure_checklist(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounter_measure_checklist_measure ON encounter_measure_checklist(measure_id);
CREATE INDEX IF NOT EXISTS idx_encounter_measure_checklist_completed ON encounter_measure_checklist(is_completed);

-- ============================================================================
-- MEASURE ALERTS TABLE (Gaps in Care Alerts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS measure_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID,
  measure_id UUID NOT NULL,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('gap', 'pending', 'expiring', 'reminder', 'opportunity')),
  alert_priority VARCHAR(20) DEFAULT 'medium' CHECK (alert_priority IN ('low', 'medium', 'high', 'critical')),
  alert_title VARCHAR(255) NOT NULL,
  alert_message TEXT NOT NULL,
  recommended_action TEXT,
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ,
  dismiss_reason VARCHAR(255),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_encounter_id UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measure_alerts_tenant ON measure_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_patient ON measure_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_provider ON measure_alerts(provider_id);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_measure ON measure_alerts(measure_id);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_type ON measure_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_dismissed ON measure_alerts(is_dismissed);
CREATE INDEX IF NOT EXISTS idx_measure_alerts_resolved ON measure_alerts(is_resolved);

-- ============================================================================
-- MIPS SCORE HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mips_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider_id UUID,
  calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reporting_year INTEGER NOT NULL,
  quality_score DECIMAL(5,2),
  pi_score DECIMAL(5,2),
  ia_score DECIMAL(5,2),
  cost_score DECIMAL(5,2),
  final_score DECIMAL(5,2),
  quality_weight DECIMAL(5,2) DEFAULT 30.00,
  pi_weight DECIMAL(5,2) DEFAULT 25.00,
  ia_weight DECIMAL(5,2) DEFAULT 15.00,
  cost_weight DECIMAL(5,2) DEFAULT 30.00,
  estimated_payment_adjustment DECIMAL(5,2),
  measure_details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mips_score_history_tenant ON mips_score_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mips_score_history_provider ON mips_score_history(provider_id);
CREATE INDEX IF NOT EXISTS idx_mips_score_history_year ON mips_score_history(reporting_year);
CREATE INDEX IF NOT EXISTS idx_mips_score_history_date ON mips_score_history(calculation_date);

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_mips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_measure_performance_updated_at ON measure_performance;
CREATE TRIGGER trigger_measure_performance_updated_at
  BEFORE UPDATE ON measure_performance
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

DROP TRIGGER IF EXISTS trigger_patient_measure_status_updated_at ON patient_measure_status;
CREATE TRIGGER trigger_patient_measure_status_updated_at
  BEFORE UPDATE ON patient_measure_status
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

DROP TRIGGER IF EXISTS trigger_mips_submissions_updated_at ON mips_submissions;
CREATE TRIGGER trigger_mips_submissions_updated_at
  BEFORE UPDATE ON mips_submissions
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

DROP TRIGGER IF EXISTS trigger_ia_activities_updated_at ON ia_activities;
CREATE TRIGGER trigger_ia_activities_updated_at
  BEFORE UPDATE ON ia_activities
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

DROP TRIGGER IF EXISTS trigger_encounter_measure_checklist_updated_at ON encounter_measure_checklist;
CREATE TRIGGER trigger_encounter_measure_checklist_updated_at
  BEFORE UPDATE ON encounter_measure_checklist
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

DROP TRIGGER IF EXISTS trigger_measure_alerts_updated_at ON measure_alerts;
CREATE TRIGGER trigger_measure_alerts_updated_at
  BEFORE UPDATE ON measure_alerts
  FOR EACH ROW EXECUTE FUNCTION update_mips_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE measure_performance IS 'Aggregated MIPS quality measure performance by provider and period';
COMMENT ON TABLE patient_measure_status IS 'Individual patient measure status tracking per encounter';
COMMENT ON TABLE mips_submissions IS 'MIPS submission records with scores and confirmation';
COMMENT ON TABLE ia_activities IS 'Improvement Activity attestations and tracking';
COMMENT ON TABLE encounter_measure_checklist IS 'Real-time measure checklist shown during encounters';
COMMENT ON TABLE measure_alerts IS 'Care gap and measure opportunity alerts';
COMMENT ON TABLE mips_score_history IS 'Historical tracking of MIPS scores over time';
