-- Migration: Cosmetic Treatment Tracking
-- Description: Track cosmetic procedures (Botox, fillers, lasers) on the body map

-- COSMETIC TREATMENTS TABLE
CREATE TABLE IF NOT EXISTS cosmetic_treatments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,

  -- Treatment type and product
  treatment_type TEXT NOT NULL,
  -- 'botox', 'filler', 'laser', 'peel', 'microneedling', 'kybella', 'sclerotherapy', 'prp', 'other'
  product_name TEXT,
  -- e.g., 'Botox', 'Dysport', 'Juvederm Voluma', 'Restylane Kysse', 'Fraxel', etc.

  treatment_date DATE NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),

  -- For neurotoxins (Botox, Dysport, Xeomin, Jeuveau)
  injection_sites JSONB,
  -- array of {region: string, x: number, y: number, units: number, notes: string}
  total_units NUMERIC(10, 2),
  dilution_ratio TEXT,
  -- e.g., "100 units in 2.5mL" (for Botox)

  -- For fillers (Juvederm, Restylane, Radiesse, Sculptra, Bellafill)
  filler_sites JSONB,
  -- array of {region: string, x: number, y: number, ml: number, depth: string, technique: string, notes: string}
  total_ml NUMERIC(10, 2),
  filler_type TEXT,
  -- e.g., 'hyaluronic_acid', 'calcium_hydroxylapatite', 'poly_l_lactic_acid', 'pmma'

  -- Product tracking
  lot_number TEXT,
  expiration_date DATE,

  -- For lasers and energy-based devices
  device_name TEXT,
  -- e.g., 'Fraxel', 'CO2 Laser', 'IPL', 'Nd:YAG', 'Picosure', 'CoolSculpting', etc.
  settings JSONB,
  -- {fluence: number, pulse_duration: number, spot_size: number, passes: number, wavelength: number}
  treatment_areas TEXT[],
  -- e.g., ['face', 'neck', 'chest', 'hands']
  passes INTEGER,

  -- For chemical peels
  peel_strength TEXT,
  -- e.g., 'superficial', 'medium', 'deep'
  peel_agent TEXT,
  -- e.g., 'glycolic_acid', 'tca', 'phenol', 'salicylic_acid', 'jessner'

  -- Photos
  before_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  after_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,

  -- Consent and follow-up
  patient_consent_signed BOOLEAN DEFAULT false,
  consent_form_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  complications TEXT,
  adverse_reactions TEXT,
  follow_up_date DATE,
  follow_up_instructions TEXT,

  -- Billing integration
  cpt_codes TEXT[],
  -- CPT codes for billing
  charged_amount_cents INTEGER,

  -- Clinical notes
  indication TEXT,
  -- Reason for treatment (e.g., 'glabellar lines', 'volume loss', 'skin rejuvenation')
  pre_treatment_assessment TEXT,
  post_treatment_instructions TEXT,
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT valid_treatment_type CHECK (
    treatment_type IN ('botox', 'filler', 'laser', 'peel', 'microneedling', 'kybella', 'sclerotherapy', 'prp', 'other')
  ),
  CONSTRAINT valid_filler_type CHECK (
    filler_type IS NULL OR
    filler_type IN ('hyaluronic_acid', 'calcium_hydroxylapatite', 'poly_l_lactic_acid', 'pmma', 'other')
  ),
  CONSTRAINT valid_peel_strength CHECK (
    peel_strength IS NULL OR
    peel_strength IN ('superficial', 'medium', 'deep')
  )
);

-- BOTOX INJECTION MAP (detailed tracking for neurotoxins)
CREATE TABLE IF NOT EXISTS botox_injection_map (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  treatment_id TEXT NOT NULL REFERENCES cosmetic_treatments(id) ON DELETE CASCADE,

  -- Injection site details
  anatomical_region TEXT NOT NULL,
  -- 'glabella', 'forehead', 'crow_feet_right', 'crow_feet_left', 'bunny_lines',
  -- 'lip_flip', 'gummy_smile', 'masseter_right', 'masseter_left', 'platysmal_bands',
  -- 'chin', 'neck', 'axilla_right', 'axilla_left' (for hyperhidrosis), 'other'

  -- Body map coordinates
  body_view TEXT NOT NULL,
  -- 'front', 'back', 'left', 'right', 'face_front', 'face_left', 'face_right'
  x_coordinate NUMERIC(5, 2) NOT NULL,
  -- Percentage position on image (0-100)
  y_coordinate NUMERIC(5, 2) NOT NULL,

  -- Dosing
  units_injected NUMERIC(6, 2) NOT NULL,
  number_of_injection_points INTEGER,

  -- Technique
  injection_depth TEXT,
  -- 'intradermal', 'subcutaneous', 'intramuscular'
  needle_gauge TEXT,
  -- e.g., '30G', '32G'

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_anatomical_region CHECK (
    anatomical_region IN (
      'glabella', 'forehead', 'crow_feet_right', 'crow_feet_left', 'bunny_lines',
      'lip_flip', 'gummy_smile', 'masseter_right', 'masseter_left', 'platysmal_bands',
      'chin', 'neck', 'axilla_right', 'axilla_left', 'other'
    )
  ),
  CONSTRAINT valid_body_view CHECK (
    body_view IN ('front', 'back', 'left', 'right', 'face_front', 'face_left', 'face_right')
  ),
  CONSTRAINT valid_coordinates CHECK (
    x_coordinate >= 0 AND x_coordinate <= 100 AND
    y_coordinate >= 0 AND y_coordinate <= 100
  ),
  CONSTRAINT valid_injection_depth CHECK (
    injection_depth IS NULL OR
    injection_depth IN ('intradermal', 'subcutaneous', 'intramuscular')
  )
);

-- FILLER INJECTION MAP (detailed tracking for dermal fillers)
CREATE TABLE IF NOT EXISTS filler_injection_map (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  treatment_id TEXT NOT NULL REFERENCES cosmetic_treatments(id) ON DELETE CASCADE,

  -- Injection site details
  anatomical_region TEXT NOT NULL,
  -- 'lips_upper', 'lips_lower', 'lips_border', 'nasolabial_fold_right', 'nasolabial_fold_left',
  -- 'marionette_lines_right', 'marionette_lines_left', 'cheek_right', 'cheek_left',
  -- 'tear_trough_right', 'tear_trough_left', 'temple_right', 'temple_left',
  -- 'chin', 'jawline_right', 'jawline_left', 'nose', 'hand_right', 'hand_left', 'other'

  -- Body map coordinates
  body_view TEXT NOT NULL,
  x_coordinate NUMERIC(5, 2) NOT NULL,
  y_coordinate NUMERIC(5, 2) NOT NULL,

  -- Dosing
  ml_injected NUMERIC(6, 2) NOT NULL,
  syringe_size NUMERIC(4, 2),
  -- e.g., 1.0, 0.8, 0.55

  -- Technique
  injection_depth TEXT,
  -- 'subcutaneous', 'supraperiosteal', 'deep_dermal', 'superficial_dermal'
  injection_technique TEXT,
  -- 'linear_threading', 'serial_puncture', 'cross_hatching', 'fanning', 'bolus'
  cannula_vs_needle TEXT,
  -- 'cannula', 'needle'
  gauge_size TEXT,
  -- e.g., '25G', '27G', '30G'

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_filler_region CHECK (
    anatomical_region IN (
      'lips_upper', 'lips_lower', 'lips_border', 'nasolabial_fold_right', 'nasolabial_fold_left',
      'marionette_lines_right', 'marionette_lines_left', 'cheek_right', 'cheek_left',
      'tear_trough_right', 'tear_trough_left', 'temple_right', 'temple_left',
      'chin', 'jawline_right', 'jawline_left', 'nose', 'hand_right', 'hand_left', 'other'
    )
  ),
  CONSTRAINT valid_filler_body_view CHECK (
    body_view IN ('front', 'back', 'left', 'right', 'face_front', 'face_left', 'face_right')
  ),
  CONSTRAINT valid_filler_coordinates CHECK (
    x_coordinate >= 0 AND x_coordinate <= 100 AND
    y_coordinate >= 0 AND y_coordinate <= 100
  ),
  CONSTRAINT valid_filler_depth CHECK (
    injection_depth IS NULL OR
    injection_depth IN ('subcutaneous', 'supraperiosteal', 'deep_dermal', 'superficial_dermal')
  ),
  CONSTRAINT valid_filler_technique CHECK (
    injection_technique IS NULL OR
    injection_technique IN ('linear_threading', 'serial_puncture', 'cross_hatching', 'fanning', 'bolus')
  ),
  CONSTRAINT valid_cannula_needle CHECK (
    cannula_vs_needle IS NULL OR
    cannula_vs_needle IN ('cannula', 'needle')
  )
);

-- COSMETIC TREATMENT EVENTS (for follow-ups, touch-ups, complications)
CREATE TABLE IF NOT EXISTS cosmetic_treatment_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  treatment_id TEXT NOT NULL REFERENCES cosmetic_treatments(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  -- 'follow_up', 'touch_up', 'complication', 'reversal', 'patient_inquiry', 'other'
  event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  description TEXT NOT NULL,
  severity TEXT,
  -- 'mild', 'moderate', 'severe' (for complications)
  resolution TEXT,
  -- How was it resolved

  photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  provider_id TEXT REFERENCES providers(id),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  CONSTRAINT valid_event_type CHECK (
    event_type IN ('follow_up', 'touch_up', 'complication', 'reversal', 'patient_inquiry', 'other')
  ),
  CONSTRAINT valid_severity CHECK (
    severity IS NULL OR
    severity IN ('mild', 'moderate', 'severe')
  )
);

-- Indexes for performance
CREATE INDEX idx_cosmetic_treatments_tenant ON cosmetic_treatments(tenant_id);
CREATE INDEX idx_cosmetic_treatments_patient ON cosmetic_treatments(patient_id);
CREATE INDEX idx_cosmetic_treatments_provider ON cosmetic_treatments(provider_id);
CREATE INDEX idx_cosmetic_treatments_encounter ON cosmetic_treatments(encounter_id) WHERE encounter_id IS NOT NULL;
CREATE INDEX idx_cosmetic_treatments_date ON cosmetic_treatments(treatment_date DESC);
CREATE INDEX idx_cosmetic_treatments_type ON cosmetic_treatments(treatment_type);
CREATE INDEX idx_cosmetic_treatments_deleted ON cosmetic_treatments(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_cosmetic_treatments_follow_up ON cosmetic_treatments(follow_up_date) WHERE follow_up_date IS NOT NULL;

CREATE INDEX idx_botox_map_treatment ON botox_injection_map(treatment_id);
CREATE INDEX idx_botox_map_region ON botox_injection_map(anatomical_region);

CREATE INDEX idx_filler_map_treatment ON filler_injection_map(treatment_id);
CREATE INDEX idx_filler_map_region ON filler_injection_map(anatomical_region);

CREATE INDEX idx_cosmetic_events_treatment ON cosmetic_treatment_events(treatment_id);
CREATE INDEX idx_cosmetic_events_date ON cosmetic_treatment_events(event_date DESC);
CREATE INDEX idx_cosmetic_events_type ON cosmetic_treatment_events(event_type);

-- Comments
COMMENT ON TABLE cosmetic_treatments IS 'Tracks cosmetic procedures including neurotoxins, fillers, lasers, and other aesthetic treatments';
COMMENT ON TABLE botox_injection_map IS 'Detailed tracking of neurotoxin injection sites with body map coordinates';
COMMENT ON TABLE filler_injection_map IS 'Detailed tracking of dermal filler injection sites with body map coordinates';
COMMENT ON TABLE cosmetic_treatment_events IS 'Follow-up events, complications, and touch-ups for cosmetic treatments';

COMMENT ON COLUMN cosmetic_treatments.treatment_type IS 'Type of cosmetic treatment performed';
COMMENT ON COLUMN cosmetic_treatments.injection_sites IS 'JSON array of injection sites for simplified tracking';
COMMENT ON COLUMN cosmetic_treatments.filler_sites IS 'JSON array of filler injection sites';
COMMENT ON COLUMN cosmetic_treatments.settings IS 'Device settings for laser/energy-based treatments';
COMMENT ON COLUMN botox_injection_map.x_coordinate IS 'Horizontal position on body map (0-100 percentage)';
COMMENT ON COLUMN botox_injection_map.y_coordinate IS 'Vertical position on body map (0-100 percentage)';
COMMENT ON COLUMN filler_injection_map.injection_technique IS 'Injection technique used for filler placement';

-- View for comprehensive cosmetic treatment data
CREATE OR REPLACE VIEW v_cosmetic_treatments_detail AS
SELECT
  ct.*,
  p.first_name || ' ' || p.last_name as patient_name,
  p.mrn,
  p.date_of_birth,
  pr.first_name || ' ' || pr.last_name as provider_name,
  pr.npi as provider_npi,
  -- Count of injection sites
  (SELECT COUNT(*) FROM botox_injection_map bm WHERE bm.treatment_id = ct.id) as botox_site_count,
  (SELECT COUNT(*) FROM filler_injection_map fm WHERE fm.treatment_id = ct.id) as filler_site_count,
  -- Event counts
  (SELECT COUNT(*) FROM cosmetic_treatment_events cte
   WHERE cte.treatment_id = ct.id) as event_count,
  (SELECT COUNT(*) FROM cosmetic_treatment_events cte
   WHERE cte.treatment_id = ct.id AND cte.event_type = 'complication') as complication_count,
  -- Photo info
  (SELECT url FROM photos WHERE id = ct.before_photo_id) as before_photo_url,
  (SELECT url FROM photos WHERE id = ct.after_photo_id) as after_photo_url
FROM cosmetic_treatments ct
JOIN patients p ON ct.patient_id = p.id
JOIN providers pr ON ct.provider_id = pr.id
WHERE ct.deleted_at IS NULL;

COMMENT ON VIEW v_cosmetic_treatments_detail IS 'Comprehensive view of cosmetic treatments with patient, provider, and related data';

-- Function to get treatment history for a patient
CREATE OR REPLACE FUNCTION get_patient_cosmetic_history(p_patient_id TEXT, p_tenant_id TEXT)
RETURNS TABLE (
  treatment_id TEXT,
  treatment_date DATE,
  treatment_type TEXT,
  product_name TEXT,
  provider_name TEXT,
  total_units NUMERIC,
  total_ml NUMERIC,
  notes TEXT,
  complication_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ct.id as treatment_id,
    ct.treatment_date,
    ct.treatment_type,
    ct.product_name,
    pr.first_name || ' ' || pr.last_name as provider_name,
    ct.total_units,
    ct.total_ml,
    ct.notes,
    (SELECT COUNT(*) FROM cosmetic_treatment_events cte
     WHERE cte.treatment_id = ct.id AND cte.event_type = 'complication') as complication_count
  FROM cosmetic_treatments ct
  JOIN providers pr ON ct.provider_id = pr.id
  WHERE ct.patient_id = p_patient_id
    AND ct.tenant_id = p_tenant_id
    AND ct.deleted_at IS NULL
  ORDER BY ct.treatment_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_patient_cosmetic_history IS 'Returns complete cosmetic treatment history for a patient';

-- Function to get treatments needing follow-up
CREATE OR REPLACE FUNCTION get_treatments_needing_followup(p_tenant_id TEXT, p_days_ahead INTEGER DEFAULT 14)
RETURNS TABLE (
  treatment_id TEXT,
  patient_id TEXT,
  patient_name TEXT,
  provider_name TEXT,
  treatment_type TEXT,
  treatment_date DATE,
  follow_up_date DATE,
  days_until_followup INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ct.id as treatment_id,
    ct.patient_id,
    p.first_name || ' ' || p.last_name as patient_name,
    pr.first_name || ' ' || pr.last_name as provider_name,
    ct.treatment_type,
    ct.treatment_date,
    ct.follow_up_date,
    (ct.follow_up_date - CURRENT_DATE)::INTEGER as days_until_followup
  FROM cosmetic_treatments ct
  JOIN patients p ON ct.patient_id = p.id
  JOIN providers pr ON ct.provider_id = pr.id
  WHERE ct.tenant_id = p_tenant_id
    AND ct.deleted_at IS NULL
    AND ct.follow_up_date IS NOT NULL
    AND ct.follow_up_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
  ORDER BY ct.follow_up_date ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_treatments_needing_followup IS 'Returns cosmetic treatments with upcoming follow-up appointments';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cosmetic_treatment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cosmetic_treatment_timestamp
  BEFORE UPDATE ON cosmetic_treatments
  FOR EACH ROW
  EXECUTE FUNCTION update_cosmetic_treatment_timestamp();
