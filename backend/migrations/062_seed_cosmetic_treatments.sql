-- Seed Sample Cosmetic Treatment Data
-- Description: Add sample cosmetic treatments (Botox, fillers, lasers) for demo purposes

-- Note: This seed script assumes you have existing patients and providers in your database.
-- It will only insert data if certain conditions are met.

DO $$
DECLARE
  v_tenant_id TEXT;
  v_patient_id_1 TEXT;
  v_patient_id_2 TEXT;
  v_patient_id_3 TEXT;
  v_provider_id TEXT;
  v_treatment_id_1 TEXT;
  v_treatment_id_2 TEXT;
  v_treatment_id_3 TEXT;
  v_treatment_id_4 TEXT;
BEGIN
  -- Get first tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping cosmetic treatment seed data';
    RETURN;
  END IF;

  -- Get first provider
  SELECT id INTO v_provider_id FROM providers WHERE tenant_id = v_tenant_id LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE NOTICE 'No provider found for tenant %, skipping seed data', v_tenant_id;
    RETURN;
  END IF;

  -- Get three patients
  SELECT id INTO v_patient_id_1 FROM patients WHERE tenant_id = v_tenant_id ORDER BY created_at LIMIT 1;
  SELECT id INTO v_patient_id_2 FROM patients WHERE tenant_id = v_tenant_id ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_patient_id_3 FROM patients WHERE tenant_id = v_tenant_id ORDER BY created_at LIMIT 1 OFFSET 2;

  IF v_patient_id_1 IS NULL THEN
    RAISE NOTICE 'No patients found for tenant %, skipping seed data', v_tenant_id;
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding cosmetic treatment data for tenant %', v_tenant_id;

  -- ==================== TREATMENT 1: BOTOX (Glabella, Forehead, Crow''s Feet) ====================
  INSERT INTO cosmetic_treatments (
    id, tenant_id, patient_id, treatment_type, product_name, treatment_date, provider_id,
    total_units, dilution_ratio, lot_number, expiration_date,
    patient_consent_signed, indication, pre_treatment_assessment,
    post_treatment_instructions, follow_up_date, cpt_codes, charged_amount_cents, notes, created_by
  ) VALUES (
    gen_random_uuid()::text,
    v_tenant_id,
    v_patient_id_1,
    'botox',
    'Botox Cosmetic (onabotulinumtoxinA)',
    CURRENT_DATE - INTERVAL '45 days',
    v_provider_id,
    64.0,
    '100 units in 2.5mL saline',
    'C123456A',
    CURRENT_DATE + INTERVAL '18 months',
    true,
    'Moderate to severe glabellar lines, forehead rhytids, and lateral canthal lines',
    'Patient has no contraindications. No history of neuromuscular disorders. Not pregnant. Discussed risks/benefits.',
    'Avoid rubbing treated areas for 24 hours. Stay upright for 4 hours. Avoid strenuous exercise for 24 hours. Results typically visible in 3-7 days, peak at 14 days.',
    CURRENT_DATE + INTERVAL '90 days',
    ARRAY['64615', '64616', '64642'],
    125000, -- $1,250.00
    'Patient tolerated procedure well. No immediate adverse reactions. Discussed return for follow-up assessment and potential touch-up if needed.',
    'system'
  ) RETURNING id INTO v_treatment_id_1;

  -- Add detailed Botox injection sites for Treatment 1
  INSERT INTO botox_injection_map (treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate, units_injected, number_of_injection_points, injection_depth, needle_gauge, notes) VALUES
    (v_treatment_id_1, 'glabella', 'face_front', 50.0, 35.0, 20.0, 5, 'intramuscular', '30G', 'Procerus and corrugator supercilii'),
    (v_treatment_id_1, 'forehead', 'face_front', 50.0, 25.0, 20.0, 5, 'intramuscular', '30G', 'Frontalis muscle - central injections'),
    (v_treatment_id_1, 'crow_feet_right', 'face_front', 72.0, 38.0, 12.0, 3, 'intradermal', '30G', 'Lateral orbital lines'),
    (v_treatment_id_1, 'crow_feet_left', 'face_front', 28.0, 38.0, 12.0, 3, 'intradermal', '30G', 'Lateral orbital lines');

  -- ==================== TREATMENT 2: DERMAL FILLER (Lips and Nasolabial Folds) ====================
  INSERT INTO cosmetic_treatments (
    id, tenant_id, patient_id, treatment_type, product_name, treatment_date, provider_id,
    total_ml, filler_type, lot_number, expiration_date,
    patient_consent_signed, indication, pre_treatment_assessment,
    post_treatment_instructions, follow_up_date, cpt_codes, charged_amount_cents, notes, created_by
  ) VALUES (
    gen_random_uuid()::text,
    v_tenant_id,
    COALESCE(v_patient_id_2, v_patient_id_1),
    'filler',
    'Juvederm Volbella XC',
    CURRENT_DATE - INTERVAL '30 days',
    v_provider_id,
    2.0,
    'hyaluronic_acid',
    'F987654B',
    CURRENT_DATE + INTERVAL '2 years',
    true,
    'Lip augmentation and perioral lines',
    'Patient desires subtle lip enhancement with natural results. No history of hypersensitivity to HA fillers. Discussed longevity (9-12 months) and potential side effects.',
    'Apply ice packs intermittently for first 48 hours. Avoid excessive sun/heat exposure. Avoid strenuous exercise for 24 hours. Swelling and bruising may occur. Take Arnica if desired.',
    CURRENT_DATE + INTERVAL '14 days',
    ARRAY['M4805'],
    140000, -- $1,400.00
    'Slow injection technique with micro-droplet placement. Excellent cosmetic result with good symmetry. Patient very satisfied.',
    'system'
  ) RETURNING id INTO v_treatment_id_2;

  -- Add detailed filler injection sites for Treatment 2
  INSERT INTO filler_injection_map (treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate, ml_injected, syringe_size, injection_depth, injection_technique, cannula_vs_needle, gauge_size, notes) VALUES
    (v_treatment_id_2, 'lips_upper', 'face_front', 50.0, 58.0, 0.6, 1.0, 'superficial_dermal', 'linear_threading', 'needle', '30G', 'Cupid''s bow and body of upper lip'),
    (v_treatment_id_2, 'lips_lower', 'face_front', 50.0, 63.0, 0.5, 1.0, 'superficial_dermal', 'linear_threading', 'needle', '30G', 'Lower lip body'),
    (v_treatment_id_2, 'lips_border', 'face_front', 50.0, 60.0, 0.4, 1.0, 'superficial_dermal', 'serial_puncture', 'needle', '30G', 'Vermillion border definition'),
    (v_treatment_id_2, 'nasolabial_fold_right', 'face_front', 62.0, 52.0, 0.25, 1.0, 'deep_dermal', 'linear_threading', 'cannula', '25G', 'Right nasolabial fold'),
    (v_treatment_id_2, 'nasolabial_fold_left', 'face_front', 38.0, 52.0, 0.25, 1.0, 'deep_dermal', 'linear_threading', 'cannula', '25G', 'Left nasolabial fold');

  -- ==================== TREATMENT 3: LASER SKIN RESURFACING ====================
  INSERT INTO cosmetic_treatments (
    id, tenant_id, patient_id, treatment_type, device_name, treatment_date, provider_id,
    settings, treatment_areas, passes,
    patient_consent_signed, indication, pre_treatment_assessment,
    post_treatment_instructions, follow_up_date, cpt_codes, charged_amount_cents, notes, created_by
  ) VALUES (
    gen_random_uuid()::text,
    v_tenant_id,
    COALESCE(v_patient_id_3, v_patient_id_1),
    'laser',
    'Fraxel Dual 1550/1927nm',
    CURRENT_DATE - INTERVAL '60 days',
    v_provider_id,
    jsonb_build_object(
      'wavelength', 1550,
      'energy_level', 70,
      'treatment_level', 8,
      'passes', 2,
      'density', 20,
      'spot_size', 'standard'
    ),
    ARRAY['face', 'neck'],
    2,
    true,
    'Photoaging, fine lines, irregular pigmentation, and textural irregularities',
    'Patient Fitzpatrick type II. No active acne or infections. Discontinued retinoids 1 week prior. Pre-treated with topical anesthetic.',
    'Apply Aquaphor or Vaseline to treated areas 4-6x daily for 5 days. Avoid sun exposure and use SPF 50+ sunscreen. Expect redness and swelling for 2-5 days. Peeling will occur days 3-7. Use gentle cleanser only.',
    CURRENT_DATE + INTERVAL '6 weeks',
    ARRAY['15788'],
    185000, -- $1,850.00
    'Full face and neck treatment performed. Patient tolerated well with topical anesthesia. Recommend series of 3-5 treatments spaced 4-6 weeks apart for optimal results.',
    'system'
  ) RETURNING id INTO v_treatment_id_3;

  -- ==================== TREATMENT 4: COMBINED BOTOX + FILLER (FULL FACE REJUVENATION) ====================
  INSERT INTO cosmetic_treatments (
    id, tenant_id, patient_id, treatment_type, product_name, treatment_date, provider_id,
    total_units, total_ml, dilution_ratio, filler_type, lot_number,
    patient_consent_signed, indication, pre_treatment_assessment,
    post_treatment_instructions, follow_up_date, cpt_codes, charged_amount_cents, notes, created_by
  ) VALUES (
    gen_random_uuid()::text,
    v_tenant_id,
    v_patient_id_1,
    'botox',
    'Botox Cosmetic + Restylane Defyne',
    CURRENT_DATE - INTERVAL '15 days',
    v_provider_id,
    50.0,
    1.5,
    '100 units in 2.5mL saline',
    'hyaluronic_acid',
    'C789012D',
    true,
    'Comprehensive facial rejuvenation - dynamic and static rhytids, volume loss',
    'Patient desires comprehensive improvement. Combined treatment plan discussed. Good candidate for both neurotoxin and volumizing filler.',
    'Standard post-Botox and post-filler instructions provided. Ice as needed for swelling. Acetaminophen for discomfort. Follow all precautions for both treatments.',
    CURRENT_DATE + INTERVAL '14 days',
    ARRAY['64615', '64616', 'M4805'],
    235000, -- $2,350.00
    'Full face rejuvenation performed. Botox to upper face, filler to mid-face. Excellent immediate result. Patient scheduled for 2-week follow-up for assessment.',
    'system'
  ) RETURNING id INTO v_treatment_id_4;

  -- Add Botox sites for Treatment 4
  INSERT INTO botox_injection_map (treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate, units_injected, injection_depth, needle_gauge) VALUES
    (v_treatment_id_4, 'glabella', 'face_front', 50.0, 35.0, 20.0, 'intramuscular', '30G'),
    (v_treatment_id_4, 'forehead', 'face_front', 50.0, 25.0, 16.0, 'intramuscular', '30G'),
    (v_treatment_id_4, 'crow_feet_right', 'face_front', 72.0, 38.0, 7.0, 'intradermal', '30G'),
    (v_treatment_id_4, 'crow_feet_left', 'face_front', 28.0, 38.0, 7.0, 'intradermal', '30G');

  -- Add filler sites for Treatment 4
  INSERT INTO filler_injection_map (treatment_id, anatomical_region, body_view, x_coordinate, y_coordinate, ml_injected, injection_depth, injection_technique, cannula_vs_needle, gauge_size) VALUES
    (v_treatment_id_4, 'cheek_right', 'face_front', 66.0, 48.0, 0.5, 'supraperiosteal', 'fanning', 'cannula', '25G'),
    (v_treatment_id_4, 'cheek_left', 'face_front', 34.0, 48.0, 0.5, 'supraperiosteal', 'fanning', 'cannula', '25G'),
    (v_treatment_id_4, 'nasolabial_fold_right', 'face_front', 62.0, 52.0, 0.25, 'deep_dermal', 'linear_threading', 'needle', '27G'),
    (v_treatment_id_4, 'nasolabial_fold_left', 'face_front', 38.0, 52.0, 0.25, 'deep_dermal', 'linear_threading', 'needle', '27G');

  -- ==================== ADD SAMPLE FOLLOW-UP EVENTS ====================

  -- Follow-up for Treatment 1 (Botox)
  INSERT INTO cosmetic_treatment_events (treatment_id, event_type, event_date, description, notes)
  VALUES (
    v_treatment_id_1,
    'follow_up',
    CURRENT_DATE - INTERVAL '31 days',
    'Two-week follow-up: Patient very satisfied with results. Full effect visible. No complications. No touch-up needed.',
    'Discussed maintenance - typical duration 3-4 months. Patient wishes to schedule next appointment in 3 months.'
  );

  -- Touch-up for Treatment 2 (Filler)
  INSERT INTO cosmetic_treatment_events (treatment_id, event_type, event_date, description, notes)
  VALUES (
    v_treatment_id_2,
    'touch_up',
    CURRENT_DATE - INTERVAL '16 days',
    'Two-week touch-up: Minor asymmetry noted in upper lip. Added 0.1mL to left upper lip for better symmetry.',
    'Excellent correction. Patient now has symmetric, natural-appearing result.'
  );

  -- Complication for Treatment 3 (Laser) - mild
  INSERT INTO cosmetic_treatment_events (treatment_id, event_type, event_date, description, severity, resolution, notes)
  VALUES (
    v_treatment_id_3,
    'complication',
    CURRENT_DATE - INTERVAL '55 days',
    'Patient reports prolonged erythema on day 7 post-treatment',
    'mild',
    'Prescribed topical corticosteroid. Resolved within 5 days.',
    'Expected side effect in some patients. Good response to treatment. Patient reassured and continuing with treatment series.'
  );

  RAISE NOTICE 'Successfully seeded % cosmetic treatments with detailed injection sites and events', 4;
  RAISE NOTICE 'Treatment IDs: %, %, %, %', v_treatment_id_1, v_treatment_id_2, v_treatment_id_3, v_treatment_id_4;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error seeding cosmetic treatment data: %', SQLERRM;
    RAISE;
END $$;
