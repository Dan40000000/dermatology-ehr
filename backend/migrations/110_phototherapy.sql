-- Phototherapy (UV Light Therapy) Tracking Module
-- Comprehensive system for NB-UVB, BB-UVB, PUVA, and UVA1 treatments

-- Phototherapy Protocols - Templates and active protocols
CREATE TABLE IF NOT EXISTS phototherapy_protocols (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  condition text NOT NULL, -- psoriasis, vitiligo, eczema, atopic_dermatitis, CTCL, morphea, etc.
  light_type text NOT NULL CHECK (light_type IN ('NB-UVB', 'BB-UVB', 'PUVA', 'UVA1')),
  wavelength_nm text, -- e.g., '311nm' for NB-UVB
  description text,

  -- Dosing parameters by Fitzpatrick skin type (mJ/cm2)
  starting_dose_type_i numeric(10,2), -- Very fair skin
  starting_dose_type_ii numeric(10,2), -- Fair skin
  starting_dose_type_iii numeric(10,2), -- Medium skin
  starting_dose_type_iv numeric(10,2), -- Olive skin
  starting_dose_type_v numeric(10,2), -- Brown skin
  starting_dose_type_vi numeric(10,2), -- Dark brown/black skin

  -- General starting dose if not using skin type specific
  starting_dose numeric(10,2),

  -- Increment settings
  increment_percent numeric(5,2) DEFAULT 10.00, -- Percentage increase per treatment (10-20%)
  max_dose numeric(10,2), -- Maximum single dose allowed

  -- Frequency
  frequency text DEFAULT '3x_weekly', -- 3x_weekly, 2x_weekly, weekly
  min_hours_between_treatments integer DEFAULT 48, -- Minimum hours between treatments

  -- PUVA specific
  psoralen_type text, -- methoxsalen, 8-MOP, 5-MOP
  psoralen_dose_mg numeric(8,2),
  psoralen_timing_minutes integer, -- Time before UV exposure

  -- Safety thresholds
  max_cumulative_dose numeric(12,2), -- Lifetime max in J/cm2
  high_cumulative_warning numeric(12,2), -- Warning threshold

  -- Template/active status
  is_template boolean DEFAULT false, -- Template protocols vs active protocols
  is_active boolean DEFAULT true,

  -- Metadata
  created_by text REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_tenant ON phototherapy_protocols(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_light_type ON phototherapy_protocols(light_type);
CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_condition ON phototherapy_protocols(condition);
CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_template ON phototherapy_protocols(is_template) WHERE is_template = true;

-- Phototherapy Cabinets - Equipment tracking
CREATE TABLE IF NOT EXISTS phototherapy_cabinets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  cabinet_name text NOT NULL,
  location_id text REFERENCES locations(id),
  light_type text NOT NULL CHECK (light_type IN ('NB-UVB', 'BB-UVB', 'PUVA', 'UVA1')),
  manufacturer text,
  model text,
  serial_number text,

  -- Bulb/lamp tracking
  bulb_type text,
  number_of_bulbs integer,
  bulb_hours numeric(10,2) DEFAULT 0, -- Total hours of bulb use
  bulb_max_hours numeric(10,2), -- Recommended replacement hours
  bulb_installed_date date,

  -- Calibration
  calibration_date date,
  next_calibration_due date,
  calibration_factor numeric(6,4) DEFAULT 1.0000, -- Multiplier for dose calculation

  -- Maintenance
  last_service_date date,
  next_service_due date,
  service_notes text,

  -- Status
  is_active boolean DEFAULT true,
  out_of_service_reason text,
  out_of_service_date date,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, cabinet_name)
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_cabinets_tenant ON phototherapy_cabinets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_cabinets_location ON phototherapy_cabinets(location_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_cabinets_calibration ON phototherapy_cabinets(next_calibration_due);

-- Phototherapy Courses - Patient treatment series
CREATE TABLE IF NOT EXISTS phototherapy_courses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),
  protocol_id text NOT NULL REFERENCES phototherapy_protocols(id),
  prescribing_provider_id text NOT NULL REFERENCES providers(id),

  -- Course details
  diagnosis_code text, -- ICD-10 code
  diagnosis_description text,
  indication text, -- Specific reason for phototherapy

  -- Patient skin type (Fitzpatrick scale I-VI)
  fitzpatrick_skin_type integer CHECK (fitzpatrick_skin_type BETWEEN 1 AND 6),

  -- Target body areas
  target_body_areas text[], -- Array of body areas being treated
  treatment_percentage_bsa numeric(5,2), -- Body surface area percentage

  -- Course dates
  start_date date NOT NULL,
  end_date date,
  target_treatment_count integer, -- Planned number of treatments

  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discontinued', 'on_hold')),
  discontinuation_reason text,
  discontinuation_date date,

  -- Clinical notes
  clinical_notes text,
  precautions text,

  -- Cumulative tracking for this course
  total_treatments integer DEFAULT 0,
  cumulative_dose_course numeric(12,2) DEFAULT 0, -- Total dose this course (mJ/cm2)

  -- Metadata
  created_by text REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_tenant ON phototherapy_courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_patient ON phototherapy_courses(patient_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_status ON phototherapy_courses(status);
CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_provider ON phototherapy_courses(prescribing_provider_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_active ON phototherapy_courses(patient_id, status) WHERE status = 'active';

-- Phototherapy Treatments - Individual treatment sessions
CREATE TABLE IF NOT EXISTS phototherapy_treatments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  course_id text NOT NULL REFERENCES phototherapy_courses(id),
  cabinet_id text REFERENCES phototherapy_cabinets(id),

  -- Treatment sequence
  treatment_number integer NOT NULL, -- Sequential number within course
  treatment_date date NOT NULL,
  treatment_time time,

  -- Dosimetry
  dose_mj numeric(10,2) NOT NULL, -- Dose in mJ/cm2
  duration_seconds integer, -- Treatment duration

  -- Body areas treated
  body_areas text[], -- Specific areas treated in this session

  -- Patient state at treatment
  skin_type integer, -- Fitzpatrick at time of treatment (can differ from course)

  -- Pre-treatment assessment
  pre_treatment_notes text,

  -- Response tracking (assessed before next treatment)
  erythema_response text CHECK (erythema_response IN ('none', 'minimal', 'mild', 'moderate', 'severe', 'blistering')),
  erythema_score integer CHECK (erythema_score BETWEEN 0 AND 4), -- 0=none, 1=minimal, 2=moderate, 3=marked, 4=blistering
  response_notes text,

  -- Dose adjustments made
  dose_adjustment_reason text,
  previous_dose_mj numeric(10,2),

  -- For PUVA treatments
  psoralen_taken boolean,
  psoralen_time timestamptz,
  psoralen_dose_mg numeric(8,2),

  -- Eye protection verified
  eye_protection_verified boolean DEFAULT true,

  -- Staff
  administered_by text REFERENCES users(id),
  supervised_by text REFERENCES providers(id),

  -- Treatment completion
  treatment_completed boolean DEFAULT true,
  early_termination_reason text,
  actual_duration_seconds integer,

  -- Notes
  notes text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(course_id, treatment_number)
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_tenant ON phototherapy_treatments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_course ON phototherapy_treatments(course_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_date ON phototherapy_treatments(treatment_date DESC);
CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_cabinet ON phototherapy_treatments(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_erythema ON phototherapy_treatments(erythema_response) WHERE erythema_response IN ('moderate', 'severe', 'blistering');

-- Phototherapy Cumulative Dose Tracking - Lifetime exposure
CREATE TABLE IF NOT EXISTS phototherapy_cumulative_doses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text NOT NULL REFERENCES patients(id),

  -- Lifetime totals by light type (in J/cm2)
  nb_uvb_lifetime_dose numeric(12,2) DEFAULT 0,
  bb_uvb_lifetime_dose numeric(12,2) DEFAULT 0,
  puva_lifetime_dose numeric(12,2) DEFAULT 0,
  uva1_lifetime_dose numeric(12,2) DEFAULT 0,

  -- Treatment counts
  nb_uvb_treatment_count integer DEFAULT 0,
  bb_uvb_treatment_count integer DEFAULT 0,
  puva_treatment_count integer DEFAULT 0,
  uva1_treatment_count integer DEFAULT 0,

  -- Last treatment dates
  nb_uvb_last_treatment date,
  bb_uvb_last_treatment date,
  puva_last_treatment date,
  uva1_last_treatment date,

  -- Alerts
  high_exposure_alert_sent boolean DEFAULT false,
  high_exposure_alert_date timestamptz,

  -- External history (treatments before joining practice)
  external_nb_uvb_dose numeric(12,2) DEFAULT 0,
  external_bb_uvb_dose numeric(12,2) DEFAULT 0,
  external_puva_dose numeric(12,2) DEFAULT 0,
  external_uva1_dose numeric(12,2) DEFAULT 0,
  external_history_notes text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_cumulative_patient ON phototherapy_cumulative_doses(patient_id);

-- Phototherapy Alerts - Safety alerts
CREATE TABLE IF NOT EXISTS phototherapy_alerts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id),
  patient_id text REFERENCES patients(id),
  course_id text REFERENCES phototherapy_courses(id),
  treatment_id text REFERENCES phototherapy_treatments(id),

  alert_type text NOT NULL CHECK (alert_type IN (
    'max_dose_exceeded',
    'high_cumulative_exposure',
    'severe_erythema',
    'missed_treatments',
    'calibration_due',
    'bulb_replacement_due',
    'service_due'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  message text NOT NULL,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by text REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by text REFERENCES users(id),
  resolved_at timestamptz,
  resolution_notes text,

  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phototherapy_alerts_patient ON phototherapy_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_phototherapy_alerts_status ON phototherapy_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_phototherapy_alerts_type ON phototherapy_alerts(alert_type);

-- Insert default protocol templates
INSERT INTO phototherapy_protocols (
  id, tenant_id, name, condition, light_type, wavelength_nm,
  starting_dose_type_i, starting_dose_type_ii, starting_dose_type_iii,
  starting_dose_type_iv, starting_dose_type_v, starting_dose_type_vi,
  increment_percent, max_dose, frequency, is_template
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'Standard NB-UVB for Psoriasis',
  'psoriasis',
  'NB-UVB',
  '311nm',
  130, 220, 260, 330, 350, 400, -- Starting doses by skin type (mJ/cm2)
  10.00, -- 10% increment
  3000, -- Max dose
  '3x_weekly',
  true
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO phototherapy_protocols (
  id, tenant_id, name, condition, light_type, wavelength_nm,
  starting_dose_type_i, starting_dose_type_ii, starting_dose_type_iii,
  starting_dose_type_iv, starting_dose_type_v, starting_dose_type_vi,
  increment_percent, max_dose, frequency, is_template
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'NB-UVB for Vitiligo',
  'vitiligo',
  'NB-UVB',
  '311nm',
  200, 250, 300, 350, 400, 450,
  15.00, -- 15% increment for vitiligo
  2500,
  '2x_weekly',
  true
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO phototherapy_protocols (
  id, tenant_id, name, condition, light_type, wavelength_nm,
  starting_dose_type_i, starting_dose_type_ii, starting_dose_type_iii,
  starting_dose_type_iv, starting_dose_type_v, starting_dose_type_vi,
  increment_percent, max_dose, frequency, psoralen_type, psoralen_timing_minutes, is_template
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'PUVA for Psoriasis/CTCL',
  'psoriasis',
  'PUVA',
  '320-400nm',
  0.5, 1.0, 1.5, 2.0, 2.5, 3.0, -- PUVA doses are much lower (J/cm2)
  10.00,
  15,
  '8-MOP',
  120, -- Take psoralen 2 hours before
  true
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO phototherapy_protocols (
  id, tenant_id, name, condition, light_type, wavelength_nm,
  starting_dose, increment_percent, max_dose, frequency, is_template
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'UVA1 for Morphea/Scleroderma',
  'morphea',
  'UVA1',
  '340-400nm',
  20, -- Starting at 20 J/cm2
  10.00,
  130, -- Max 130 J/cm2
  '3x_weekly',
  true
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO phototherapy_protocols (
  id, tenant_id, name, condition, light_type, wavelength_nm,
  starting_dose_type_i, starting_dose_type_ii, starting_dose_type_iii,
  starting_dose_type_iv, starting_dose_type_v, starting_dose_type_vi,
  increment_percent, max_dose, frequency, is_template
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'NB-UVB for Atopic Dermatitis',
  'atopic_dermatitis',
  'NB-UVB',
  '311nm',
  100, 180, 220, 280, 320, 380,
  10.00,
  2500,
  '3x_weekly',
  true
FROM tenants t
ON CONFLICT DO NOTHING;

-- Function to update cumulative doses after treatment
CREATE OR REPLACE FUNCTION update_phototherapy_cumulative_dose()
RETURNS TRIGGER AS $$
DECLARE
  v_patient_id text;
  v_light_type text;
  v_dose_j numeric;
BEGIN
  -- Get patient ID and light type from course
  SELECT pc.patient_id, pp.light_type
  INTO v_patient_id, v_light_type
  FROM phototherapy_courses pc
  JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
  WHERE pc.id = NEW.course_id;

  -- Convert mJ to J (divide by 1000)
  v_dose_j := NEW.dose_mj / 1000;

  -- Upsert cumulative dose record
  INSERT INTO phototherapy_cumulative_doses (
    id, tenant_id, patient_id,
    nb_uvb_lifetime_dose, nb_uvb_treatment_count, nb_uvb_last_treatment,
    bb_uvb_lifetime_dose, bb_uvb_treatment_count, bb_uvb_last_treatment,
    puva_lifetime_dose, puva_treatment_count, puva_last_treatment,
    uva1_lifetime_dose, uva1_treatment_count, uva1_last_treatment
  )
  VALUES (
    gen_random_uuid()::text,
    NEW.tenant_id,
    v_patient_id,
    CASE WHEN v_light_type = 'NB-UVB' THEN v_dose_j ELSE 0 END,
    CASE WHEN v_light_type = 'NB-UVB' THEN 1 ELSE 0 END,
    CASE WHEN v_light_type = 'NB-UVB' THEN NEW.treatment_date ELSE NULL END,
    CASE WHEN v_light_type = 'BB-UVB' THEN v_dose_j ELSE 0 END,
    CASE WHEN v_light_type = 'BB-UVB' THEN 1 ELSE 0 END,
    CASE WHEN v_light_type = 'BB-UVB' THEN NEW.treatment_date ELSE NULL END,
    CASE WHEN v_light_type = 'PUVA' THEN v_dose_j ELSE 0 END,
    CASE WHEN v_light_type = 'PUVA' THEN 1 ELSE 0 END,
    CASE WHEN v_light_type = 'PUVA' THEN NEW.treatment_date ELSE NULL END,
    CASE WHEN v_light_type = 'UVA1' THEN v_dose_j ELSE 0 END,
    CASE WHEN v_light_type = 'UVA1' THEN 1 ELSE 0 END,
    CASE WHEN v_light_type = 'UVA1' THEN NEW.treatment_date ELSE NULL END
  )
  ON CONFLICT (tenant_id, patient_id) DO UPDATE SET
    nb_uvb_lifetime_dose = phototherapy_cumulative_doses.nb_uvb_lifetime_dose +
      CASE WHEN v_light_type = 'NB-UVB' THEN v_dose_j ELSE 0 END,
    nb_uvb_treatment_count = phototherapy_cumulative_doses.nb_uvb_treatment_count +
      CASE WHEN v_light_type = 'NB-UVB' THEN 1 ELSE 0 END,
    nb_uvb_last_treatment = CASE WHEN v_light_type = 'NB-UVB' THEN NEW.treatment_date
      ELSE phototherapy_cumulative_doses.nb_uvb_last_treatment END,
    bb_uvb_lifetime_dose = phototherapy_cumulative_doses.bb_uvb_lifetime_dose +
      CASE WHEN v_light_type = 'BB-UVB' THEN v_dose_j ELSE 0 END,
    bb_uvb_treatment_count = phototherapy_cumulative_doses.bb_uvb_treatment_count +
      CASE WHEN v_light_type = 'BB-UVB' THEN 1 ELSE 0 END,
    bb_uvb_last_treatment = CASE WHEN v_light_type = 'BB-UVB' THEN NEW.treatment_date
      ELSE phototherapy_cumulative_doses.bb_uvb_last_treatment END,
    puva_lifetime_dose = phototherapy_cumulative_doses.puva_lifetime_dose +
      CASE WHEN v_light_type = 'PUVA' THEN v_dose_j ELSE 0 END,
    puva_treatment_count = phototherapy_cumulative_doses.puva_treatment_count +
      CASE WHEN v_light_type = 'PUVA' THEN 1 ELSE 0 END,
    puva_last_treatment = CASE WHEN v_light_type = 'PUVA' THEN NEW.treatment_date
      ELSE phototherapy_cumulative_doses.puva_last_treatment END,
    uva1_lifetime_dose = phototherapy_cumulative_doses.uva1_lifetime_dose +
      CASE WHEN v_light_type = 'UVA1' THEN v_dose_j ELSE 0 END,
    uva1_treatment_count = phototherapy_cumulative_doses.uva1_treatment_count +
      CASE WHEN v_light_type = 'UVA1' THEN 1 ELSE 0 END,
    uva1_last_treatment = CASE WHEN v_light_type = 'UVA1' THEN NEW.treatment_date
      ELSE phototherapy_cumulative_doses.uva1_last_treatment END,
    updated_at = now();

  -- Update course totals
  UPDATE phototherapy_courses
  SET
    total_treatments = total_treatments + 1,
    cumulative_dose_course = cumulative_dose_course + NEW.dose_mj,
    updated_at = now()
  WHERE id = NEW.course_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_phototherapy_cumulative_dose
AFTER INSERT ON phototherapy_treatments
FOR EACH ROW
EXECUTE FUNCTION update_phototherapy_cumulative_dose();

-- Comments
COMMENT ON TABLE phototherapy_protocols IS 'Protocol templates and active protocols for phototherapy treatments';
COMMENT ON TABLE phototherapy_cabinets IS 'Phototherapy equipment tracking including calibration and maintenance';
COMMENT ON TABLE phototherapy_courses IS 'Patient phototherapy treatment courses/series';
COMMENT ON TABLE phototherapy_treatments IS 'Individual phototherapy treatment sessions with dosimetry';
COMMENT ON TABLE phototherapy_cumulative_doses IS 'Lifetime UV exposure tracking for skin cancer risk assessment';
COMMENT ON TABLE phototherapy_alerts IS 'Safety alerts for phototherapy including dose limits and erythema';
