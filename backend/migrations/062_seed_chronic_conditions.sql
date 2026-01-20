-- Seed sample chronic skin conditions data
-- This migration creates example patients with psoriasis and eczema conditions

-- First, insert sample patients if they don't exist (using DO block to handle duplicates)
DO $$
DECLARE
  v_tenant_id text := 'tenant-1';
  v_patient_psoriasis_id text := 'patient-chronic-psoriasis-001';
  v_patient_eczema_id text := 'patient-chronic-eczema-001';
  v_condition_psoriasis_id text := 'condition-psoriasis-001';
  v_condition_eczema_id text := 'condition-eczema-001';
BEGIN
  -- Insert patient with psoriasis
  INSERT INTO patients (
    id, tenant_id, first_name, last_name, dob, phone, email, sex,
    address, city, state, zip, created_at
  )
  VALUES (
    v_patient_psoriasis_id,
    v_tenant_id,
    'Michael',
    'Anderson',
    '1985-03-15',
    '555-0123',
    'michael.anderson@example.com',
    'M',
    '123 Main Street',
    'Springfield',
    'IL',
    '62701',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert patient with eczema
  INSERT INTO patients (
    id, tenant_id, first_name, last_name, dob, phone, email, sex,
    address, city, state, zip, created_at
  )
  VALUES (
    v_patient_eczema_id,
    v_tenant_id,
    'Sarah',
    'Martinez',
    '1992-07-22',
    '555-0456',
    'sarah.martinez@example.com',
    'F',
    '456 Oak Avenue',
    'Springfield',
    'IL',
    '62702',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert psoriasis condition (elbows and knees)
  INSERT INTO patient_skin_conditions (
    id, tenant_id, patient_id, condition_type, body_regions,
    severity, pasi_score, bsa_percentage,
    onset_date, diagnosis_date,
    current_treatment, treatment_response,
    flare_triggers, last_flare_date,
    status, notes, created_at, updated_at
  )
  VALUES (
    v_condition_psoriasis_id,
    v_tenant_id,
    v_patient_psoriasis_id,
    'psoriasis',
    ARRAY['arm-right-elbow', 'arm-left-elbow', 'knee-right', 'knee-left'],
    'moderate',
    12.5,
    8.0,
    '2018-01-10',
    '2018-02-15',
    'Topical corticosteroids (betamethasone 0.05%), vitamin D analog (calcipotriene). Patient instructed to apply twice daily.',
    'good',
    ARRAY['stress', 'cold weather', 'alcohol'],
    '2025-11-20',
    'controlled',
    'Patient has plaque psoriasis primarily affecting extensor surfaces. Responsive to topical therapy. Flares typically occur in winter months and during stressful periods.',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert initial assessment for psoriasis
  INSERT INTO condition_assessments (
    id, tenant_id, condition_id, patient_id,
    assessment_date, severity_score,
    affected_areas,
    pasi_score, pasi_head, pasi_trunk, pasi_upper_extremities, pasi_lower_extremities,
    treatment_at_time, treatment_adherence,
    provider_notes, clinical_impression,
    follow_up_recommended, follow_up_weeks,
    created_at, updated_at
  )
  VALUES (
    'assessment-psoriasis-001',
    v_tenant_id,
    v_condition_psoriasis_id,
    v_patient_psoriasis_id,
    '2025-12-01',
    4.5,
    jsonb_build_object(
      'arm-right-elbow', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 2, 'induration', 2, 'scaling', 3),
      'arm-left-elbow', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 2, 'induration', 2, 'scaling', 3),
      'knee-right', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 2, 'induration', 2, 'scaling', 2),
      'knee-left', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 2, 'induration', 1, 'scaling', 2)
    ),
    12.5,
    0.0,
    0.0,
    6.3,
    6.2,
    'Betamethasone 0.05% cream + Calcipotriene 0.005% ointment BID',
    'good',
    'Patient reports good adherence to topical therapy. Plaques show improvement since last visit with reduced scaling. Some residual erythema and induration. Patient tolerating treatment well with no adverse effects.',
    'stable',
    true,
    12,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert eczema condition (hands and flexural areas)
  INSERT INTO patient_skin_conditions (
    id, tenant_id, patient_id, condition_type, body_regions,
    severity, bsa_percentage,
    onset_date, diagnosis_date,
    current_treatment, treatment_response,
    flare_triggers, last_flare_date,
    status, notes, created_at, updated_at
  )
  VALUES (
    v_condition_eczema_id,
    v_tenant_id,
    v_patient_eczema_id,
    'eczema',
    ARRAY['hand-right-back', 'hand-left-back', 'arm-right-elbow', 'arm-left-elbow', 'knee-right', 'knee-left'],
    'moderate',
    12.0,
    '2015-05-01',
    '2015-06-10',
    'Emollient therapy (CeraVe cream) twice daily, triamcinolone 0.1% cream for flares, hydroxyzine 25mg at bedtime for pruritus',
    'partial',
    ARRAY['dust mites', 'fragrances', 'wool', 'stress', 'dry weather'],
    '2025-12-15',
    'active',
    'Patient has atopic dermatitis with chronic hand eczema and flexural involvement. Frequent flares requiring topical steroid bursts. Considering step-up to systemic therapy if not better controlled.',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert initial assessment for eczema
  INSERT INTO condition_assessments (
    id, tenant_id, condition_id, patient_id,
    assessment_date, severity_score,
    affected_areas,
    treatment_at_time, treatment_adherence,
    provider_notes, clinical_impression,
    follow_up_recommended, follow_up_weeks,
    created_at, updated_at
  )
  VALUES (
    'assessment-eczema-001',
    v_tenant_id,
    v_condition_eczema_id,
    v_patient_eczema_id,
    '2025-12-18',
    6.0,
    jsonb_build_object(
      'hand-right-back', jsonb_build_object('severity', 'severe', 'bsa', 1.5, 'erythema', 'marked', 'lichenification', 'moderate', 'excoriation', 'present'),
      'hand-left-back', jsonb_build_object('severity', 'severe', 'bsa', 1.5, 'erythema', 'marked', 'lichenification', 'moderate', 'excoriation', 'present'),
      'arm-right-elbow', jsonb_build_object('severity', 'moderate', 'bsa', 2.5, 'erythema', 'moderate', 'lichenification', 'mild'),
      'arm-left-elbow', jsonb_build_object('severity', 'moderate', 'bsa', 2.5, 'erythema', 'moderate', 'lichenification', 'mild'),
      'knee-right', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 'moderate'),
      'knee-left', jsonb_build_object('severity', 'moderate', 'bsa', 2.0, 'erythema', 'moderate')
    ),
    'Triamcinolone 0.1% cream BID to affected areas, CeraVe moisturizing cream, Hydroxyzine 25mg QHS',
    'fair',
    'Patient presents with active flare. Hand eczema shows significant erythema, fissuring, and lichenification. Flexural areas moderately affected. Patient reports fair adherence - sometimes forgets evening moisturizer application. Discussed importance of consistent emollient use and trigger avoidance. Consider patch testing to identify contact allergens contributing to hand dermatitis.',
    'worsening',
    true,
    4,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert follow-up assessment for eczema showing improvement
  INSERT INTO condition_assessments (
    id, tenant_id, condition_id, patient_id,
    assessment_date, severity_score,
    affected_areas,
    treatment_at_time, treatment_adherence,
    provider_notes, clinical_impression,
    follow_up_recommended, follow_up_weeks,
    created_at, updated_at
  )
  VALUES (
    'assessment-eczema-002',
    v_tenant_id,
    v_condition_eczema_id,
    v_patient_eczema_id,
    '2026-01-15',
    4.0,
    jsonb_build_object(
      'hand-right-back', jsonb_build_object('severity', 'moderate', 'bsa', 1.0, 'erythema', 'moderate', 'lichenification', 'mild', 'excoriation', 'resolved'),
      'hand-left-back', jsonb_build_object('severity', 'moderate', 'bsa', 1.0, 'erythema', 'moderate', 'lichenification', 'mild', 'excoriation', 'resolved'),
      'arm-right-elbow', jsonb_build_object('severity', 'mild', 'bsa', 1.5, 'erythema', 'mild'),
      'arm-left-elbow', jsonb_build_object('severity', 'mild', 'bsa', 1.5, 'erythema', 'mild'),
      'knee-right', jsonb_build_object('severity', 'mild', 'bsa', 1.0, 'erythema', 'mild'),
      'knee-left', jsonb_build_object('severity', 'mild', 'bsa', 1.0, 'erythema', 'mild')
    ),
    'Triamcinolone 0.1% cream once daily to hands only, CeraVe moisturizing cream TID, Hydroxyzine 25mg QHS PRN',
    'excellent',
    'Excellent improvement noted. Hand eczema much improved with reduced erythema and resolution of fissures and excoriations. Flexural areas nearly clear. Patient reports 100% adherence since last visit after discussion about importance of consistent routine. Will taper topical steroid and continue emollient therapy.',
    'improving',
    true,
    8,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

END $$;

-- Add comments
COMMENT ON TABLE patient_skin_conditions IS 'Tracks chronic dermatological conditions with body region mapping and severity scoring';
COMMENT ON TABLE condition_assessments IS 'Serial assessments tracking disease progression and treatment response over time';
