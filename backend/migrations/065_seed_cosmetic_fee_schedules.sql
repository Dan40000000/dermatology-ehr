-- Seed: Comprehensive Cosmetic Dermatology Fee Schedules
-- Description: Populate cosmetic procedure pricing with detailed categories and pricing tiers

DO $$
DECLARE
    v_tenant_id TEXT;
    v_fee_schedule_id UUID;
    v_cosmetic_schedule_id UUID;
BEGIN
    -- Get first tenant
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'No tenant found, skipping cosmetic fee schedule seed data';
        RETURN;
    END IF;

    -- Check if a cosmetic fee schedule exists, if not create one
    SELECT id INTO v_cosmetic_schedule_id
    FROM fee_schedules
    WHERE tenant_id = v_tenant_id AND name ILIKE '%cosmetic%'
    LIMIT 1;

    IF v_cosmetic_schedule_id IS NULL THEN
        -- Create dedicated cosmetic fee schedule
        INSERT INTO fee_schedules (id, tenant_id, name, is_default, description)
        VALUES (
            gen_random_uuid(),
            v_tenant_id,
            'Cosmetic & Aesthetic Services',
            false,
            'Comprehensive pricing for all cosmetic and aesthetic dermatology procedures'
        )
        RETURNING id INTO v_cosmetic_schedule_id;

        RAISE NOTICE 'Created new cosmetic fee schedule: %', v_cosmetic_schedule_id;
    ELSE
        RAISE NOTICE 'Using existing cosmetic fee schedule: %', v_cosmetic_schedule_id;
    END IF;

    -- Get default fee schedule (or use cosmetic schedule if it's the default)
    SELECT COALESCE(
        (SELECT id FROM fee_schedules WHERE tenant_id = v_tenant_id AND is_default = true LIMIT 1),
        v_cosmetic_schedule_id
    ) INTO v_fee_schedule_id;

    RAISE NOTICE 'Inserting cosmetic procedures into fee schedule: %', v_fee_schedule_id;

    -- ============================================================================
    -- NEUROTOXINS (BOTOX/DYSPORT/XEOMIN)
    -- ============================================================================

    -- Botox - Glabella (frown lines)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '64615', 'Botox - Glabella (frown lines)', 'neurotoxins', 'upper_face',
        'per unit', 1200, 24000, 30000, 20, true,
        'Typical: 20 units. FDA-approved for moderate to severe frown lines between eyebrows.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        min_price_cents = EXCLUDED.min_price_cents,
        max_price_cents = EXCLUDED.max_price_cents,
        is_cosmetic = true;

    -- Botox - Forehead
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '64616', 'Botox - Forehead horizontal lines', 'neurotoxins', 'upper_face',
        'per unit', 1200, 12000, 24000, 15, true,
        'Typical: 10-20 units depending on muscle strength and desired outcome.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Crow's Feet
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '64642', 'Botox - Crow''s Feet (per side)', 'neurotoxins', 'upper_face',
        'per unit', 1200, 14400, 18000, 12, true,
        'Typical: 12 units per side (24 units total for both sides). Lateral canthal lines.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Full Face
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'BOTOX-FF', 'Botox - Full Face (glabella + forehead + crow''s feet)', 'neurotoxins', 'full_face',
        'package', 1200, 40000, 50000, 50, true,
        'Comprehensive upper face treatment. Typically 44-64 units total. Package pricing.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Lip Flip
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'BOTOX-LF', 'Botox - Lip Flip', 'neurotoxins', 'lower_face',
        'per unit', 1200, 5000, 7500, 5, true,
        'Typical: 4-6 units. Relaxes orbicularis oris to create subtle lip enhancement.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Masseter (jawline slimming)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'BOTOX-MS', 'Botox - Masseter (jawline slimming, per side)', 'neurotoxins', 'lower_face',
        'per unit', 1200, 30000, 37500, 25, true,
        'Typical: 25 units per side (50 total). For TMJ/bruxism or facial slimming.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Hyperhidrosis (underarms)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '64650', 'Botox - Hyperhidrosis (underarms)', 'neurotoxins', 'medical',
        'per unit', 1000, 50000, 70000, 50, true,
        'Typical: 50 units per axilla (100 total). May be covered by insurance for severe hyperhidrosis.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Botox - Platysmal Bands (neck)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'BOTOX-PB', 'Botox - Platysmal Bands (neck)', 'neurotoxins', 'neck',
        'per unit', 1200, 35000, 45000, 35, true,
        'Typical: 30-40 units. Softens vertical neck bands.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Dysport
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'DYSPORT', 'Dysport - Per Unit', 'neurotoxins', 'injectable',
        'per unit', 450, 400, 500, 60, true,
        'Dosing conversion: ~2.5-3 units Dysport = 1 unit Botox'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Xeomin
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'XEOMIN', 'Xeomin - Per Unit', 'neurotoxins', 'injectable',
        'per unit', 1100, 1000, 1200, 20, true,
        '"Naked" neurotoxin without complexing proteins. 1:1 dosing with Botox.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- DERMAL FILLERS
    -- ============================================================================

    -- Juvederm Ultra XC (lips)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-JUV-U', 'Juvederm Ultra XC (lips) - 1 syringe', 'dermal_fillers', 'lips',
        'per syringe', 70000, 60000, 80000, 1, true,
        'Hyaluronic acid filler for lips. Duration: 6-12 months. 1mL syringe.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Juvederm Ultra Plus XC (nasolabial folds)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-JUV-UP', 'Juvederm Ultra Plus XC (nasolabial folds) - 1 syringe', 'dermal_fillers', 'nasolabial',
        'per syringe', 75000, 65000, 85000, 1, true,
        'More robust HA filler for deeper folds. Duration: 9-12 months.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Juvederm Voluma XC (cheeks)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-JUV-V', 'Juvederm Voluma XC (cheeks) - 1 syringe', 'dermal_fillers', 'cheeks',
        'per syringe', 90000, 80000, 100000, 1, true,
        'Volumizing filler for midface. Duration: up to 2 years. FDA-approved for cheeks.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Juvederm Volbella XC (fine lines, lips)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-JUV-VB', 'Juvederm Volbella XC (fine lines, lips) - 1 syringe', 'dermal_fillers', 'lips',
        'per syringe', 62500, 55000, 70000, 1, true,
        'Smooth gel for subtle lip enhancement and perioral lines. Duration: up to 1 year.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Restylane (lips/lines)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-REST', 'Restylane (lips/lines) - 1 syringe', 'dermal_fillers', 'lips',
        'per syringe', 62500, 55000, 70000, 1, true,
        'HA filler for moderate lines and wrinkles. Duration: 6-12 months.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Restylane Lyft (cheeks/hands)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-REST-L', 'Restylane Lyft (cheeks/hands) - 1 syringe', 'dermal_fillers', 'cheeks',
        'per syringe', 80000, 70000, 90000, 1, true,
        'Robust filler for cheeks and hands. Duration: up to 1 year.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Restylane Contour (cheeks)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-REST-C', 'Restylane Contour (cheeks) - 1 syringe', 'dermal_fillers', 'cheeks',
        'per syringe', 75000, 65000, 85000, 1, true,
        'Flexible HA filler for natural cheek contours. Duration: up to 1 year.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Restylane Kysse (lips)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-REST-K', 'Restylane Kysse (lips) - 1 syringe', 'dermal_fillers', 'lips',
        'per syringe', 67500, 60000, 75000, 1, true,
        'XpresHAn technology for soft, natural lip enhancement. Duration: up to 1 year.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Sculptra (collagen stimulator)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-SCULP', 'Sculptra (per vial, collagen stimulator)', 'dermal_fillers', 'volumizer',
        'per vial', 82500, 75000, 90000, 1, true,
        'Poly-L-lactic acid biostimulator. Gradual results over 3-5 months. Duration: up to 2 years. Typically 2-3 vials per session.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Radiesse
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-RAD', 'Radiesse (per syringe)', 'dermal_fillers', 'volumizer',
        'per syringe', 77500, 70000, 85000, 1, true,
        'Calcium hydroxylapatite filler. Immediate volume + collagen stimulation. Duration: 12-18 months.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- RHA Collection
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-RHA', 'RHA Collection (per syringe)', 'dermal_fillers', 'dynamic',
        'per syringe', 72500, 65000, 80000, 1, true,
        'Resilient hyaluronic acid for dynamic areas. RHA 2, 3, or 4. Duration: up to 15 months.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Bellafill (long-lasting)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'M4805-BELL', 'Bellafill (per syringe, long-lasting)', 'dermal_fillers', 'permanent',
        'per syringe', 100000, 90000, 110000, 1, true,
        'PMMA microspheres in collagen. FDA-approved for nasolabial folds and acne scars. Duration: up to 5 years.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- BODY CONTOURING
    -- ============================================================================

    -- Kybella (per vial)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'KYBELLA-1', 'Kybella (double chin) - per vial', 'body_contouring', 'submental',
        'per vial', 70000, 60000, 80000, 1, true,
        'Injectable deoxycholic acid for submental fat reduction. 1-2mL vials.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Kybella Full Treatment
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'KYBELLA-FT', 'Kybella - Full treatment (2-4 vials)', 'body_contouring', 'submental',
        'per treatment', 70000, 120000, 320000, 3, true,
        'Typical full treatment uses 2-4 vials. May require 2-6 treatment sessions spaced 1 month apart.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- LASER HAIR REMOVAL
    -- ============================================================================

    -- Small Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-LHR-SM', 'Laser Hair Removal - Small Area (upper lip, chin, underarms)', 'laser_hair_removal', 'small_area',
        'per session', 11250, 7500, 15000, 1, true,
        'Single session. Package of 6 recommended for optimal results.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Medium Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-LHR-MD', 'Laser Hair Removal - Medium Area (bikini, neck, lower face)', 'laser_hair_removal', 'medium_area',
        'per session', 20000, 15000, 25000, 1, true,
        'Single session. Package of 6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Large Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-LHR-LG', 'Laser Hair Removal - Large Area (full legs, full back, chest)', 'laser_hair_removal', 'large_area',
        'per session', 40000, 30000, 50000, 1, true,
        'Single session. Package of 6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Full Face
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-LHR-FF', 'Laser Hair Removal - Full Face', 'laser_hair_removal', 'face',
        'per session', 25000, 20000, 30000, 1, true,
        'Single session. Package of 6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Full Brazilian
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-LHR-BR', 'Laser Hair Removal - Full Brazilian', 'laser_hair_removal', 'bikini',
        'per session', 32500, 25000, 40000, 1, true,
        'Single session. Package of 6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Package - Small Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, package_sessions, notes
    ) VALUES (
        v_fee_schedule_id, 'LHR-PKG-SM', 'Laser Hair Removal Package - 6 sessions Small Area', 'laser_hair_removal', 'package',
        'package', 10000, 40000, 75000, 6, true, 6,
        'Prepaid package of 6 sessions for small treatment area. Savings vs individual sessions.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Package - Medium Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, package_sessions, notes
    ) VALUES (
        v_fee_schedule_id, 'LHR-PKG-MD', 'Laser Hair Removal Package - 6 sessions Medium Area', 'laser_hair_removal', 'package',
        'package', 16667, 80000, 120000, 6, true, 6,
        'Prepaid package of 6 sessions for medium treatment area.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Package - Large Area
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, package_sessions, notes
    ) VALUES (
        v_fee_schedule_id, 'LHR-PKG-LG', 'Laser Hair Removal Package - 6 sessions Large Area', 'laser_hair_removal', 'package',
        'package', 33333, 150000, 250000, 6, true, 6,
        'Prepaid package of 6 sessions for large treatment area.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- LASER SKIN TREATMENTS
    -- ============================================================================

    -- IPL Photofacial (full face)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-IPL-F', 'IPL Photofacial (full face)', 'laser_skin', 'photofacial',
        'per session', 40000, 30000, 50000, 1, true,
        'Intense pulsed light for sun damage, pigmentation, rosacea. Series of 3-5 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- IPL Photofacial (face + neck)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-IPL-FN', 'IPL Photofacial (face + neck)', 'laser_skin', 'photofacial',
        'per session', 50000, 40000, 60000, 1, true,
        'IPL treatment for face and neck. Series of 3-5 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Fraxel (fractional laser)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788', 'Fraxel (fractional laser, per session)', 'laser_skin', 'resurfacing',
        'per session', 115000, 80000, 150000, 1, true,
        'Non-ablative fractional laser for texture, tone, pores. Series of 3-5 for optimal results. 3-7 days downtime.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- CO2 Laser Resurfacing (full face)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15789', 'CO2 Laser Resurfacing (full face)', 'laser_skin', 'resurfacing',
        'per session', 325000, 250000, 400000, 1, true,
        'Ablative fractional CO2 for dramatic skin rejuvenation. 7-14 days downtime. Single treatment or staged.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Vascular Laser (spider veins)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17106', 'Vascular Laser (spider veins, per session)', 'laser_skin', 'vascular',
        'per session', 32500, 25000, 40000, 1, true,
        'Nd:YAG or KTP laser for facial vessels, rosacea, spider veins. May require multiple sessions.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Pico Laser (pigmentation)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-PICO', 'Pico Laser (pigmentation, per session)', 'laser_skin', 'pigmentation',
        'per session', 50000, 40000, 60000, 1, true,
        'Picosecond laser for pigmentation, melasma, tattoo removal. Series of 3-6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Tattoo Removal (small)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-TAT-SM', 'Tattoo Removal (small) - per session', 'laser_skin', 'tattoo',
        'per session', 20000, 15000, 25000, 1, true,
        'Q-switched or picosecond laser. Small area (<2 inches). Multiple sessions required.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Tattoo Removal (medium)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-TAT-MD', 'Tattoo Removal (medium) - per session', 'laser_skin', 'tattoo',
        'per session', 32500, 25000, 40000, 1, true,
        'Medium area (2-6 inches). Multiple sessions required, 6-8 weeks apart.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Tattoo Removal (large)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '17999-TAT-LG', 'Tattoo Removal (large) - per session', 'laser_skin', 'tattoo',
        'per session', 50000, 40000, 60000, 1, true,
        'Large area (>6 inches). Multiple sessions required.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- CHEMICAL PEELS
    -- ============================================================================

    -- Light Peel
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-PEEL-L', 'Light Peel (glycolic/lactic 20-30%)', 'chemical_peels', 'superficial',
        'per treatment', 12500, 10000, 15000, 1, true,
        'Superficial peel for brightening and mild texture improvement. No downtime. Series of 4-6 recommended monthly.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Medium Peel
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-PEEL-M', 'Medium Peel (glycolic 50-70%, TCA 15-35%)', 'chemical_peels', 'medium_depth',
        'per treatment', 27500, 20000, 35000, 1, true,
        'Medium-depth peel for moderate sun damage, pigmentation, fine lines. 5-7 days peeling.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Deep Peel
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-PEEL-D', 'Deep Peel (TCA 50%, phenol)', 'chemical_peels', 'deep',
        'per treatment', 75000, 50000, 100000, 1, true,
        'Deep peel for significant photoaging and wrinkles. 7-14 days downtime. Single treatment typically sufficient.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- VI Peel
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-VI', 'VI Peel', 'chemical_peels', 'proprietary',
        'per treatment', 40000, 35000, 45000, 1, true,
        'Proprietary blend for tone, texture, acne, pigmentation. 5-7 days peeling. Safe for all skin types.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Perfect Derma Peel
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-PDP', 'Perfect Derma Peel', 'chemical_peels', 'proprietary',
        'per treatment', 45000, 40000, 50000, 1, true,
        'Medical-grade peel with glutathione. 5-7 days peeling. Treats melasma, pigmentation, acne.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- MICRONEEDLING
    -- ============================================================================

    -- Microneedling (face)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-MN', 'Microneedling (face)', 'microneedling', 'collagen_induction',
        'per session', 32500, 25000, 40000, 1, true,
        'Collagen induction therapy for scars, texture, fine lines. Series of 3-6 recommended. 2-3 days redness.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Microneedling with PRP (face)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-MN-PRP', 'Microneedling with PRP (face)', 'microneedling', 'prp',
        'per session', 75000, 60000, 90000, 1, true,
        'Microneedling with platelet-rich plasma. Enhanced collagen production and healing. Series of 3 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Microneedling (face + neck)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-MN-FN', 'Microneedling (face + neck)', 'microneedling', 'collagen_induction',
        'per session', 42500, 35000, 50000, 1, true,
        'Microneedling for face and neck. Series of 3-6 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- RF Microneedling (Morpheus8, Vivace)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '15788-RFMN', 'RF Microneedling (Morpheus8, Vivace)', 'microneedling', 'radiofrequency',
        'per session', 100000, 80000, 120000, 1, true,
        'Radiofrequency microneedling for skin tightening and remodeling. 3-5 days downtime. Series of 3 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- ============================================================================
    -- OTHER COSMETIC
    -- ============================================================================

    -- Hydrafacial
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'HYDRA', 'Hydrafacial', 'other_cosmetic', 'facial',
        'per treatment', 21250, 17500, 25000, 1, true,
        'Patented vortex cleansing, exfoliation, extraction, hydration, antioxidant protection. No downtime. Monthly recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Dermaplaning
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'DERMAP', 'Dermaplaning', 'other_cosmetic', 'exfoliation',
        'per treatment', 12500, 10000, 15000, 1, true,
        'Manual exfoliation with surgical blade. Removes vellus hair and dead skin. No downtime. Monthly recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Microdermabrasion
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'MICRODERM', 'Microdermabrasion', 'other_cosmetic', 'exfoliation',
        'per treatment', 16250, 12500, 20000, 1, true,
        'Diamond-tip or crystal microdermabrasion. No downtime. Series of 6-8 recommended.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- LED Light Therapy
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'LED', 'LED Light Therapy', 'other_cosmetic', 'light_therapy',
        'per session', 10000, 7500, 12500, 1, true,
        'Red/blue/infrared LED for collagen, acne, inflammation. No downtime. Often add-on to other treatments.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- PRP for Hair (per session)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, 'PRP-HAIR', 'Platelet Rich Plasma (PRP) for Hair - per session', 'other_cosmetic', 'hair_restoration',
        'per session', 85000, 70000, 100000, 1, true,
        'PRP injections for hair loss/thinning. Series of 3 sessions, then maintenance every 4-6 months.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    -- Sclerotherapy (spider veins)
    INSERT INTO fee_schedule_items (
        fee_schedule_id, cpt_code, cpt_description, category, subcategory,
        units, fee_cents, min_price_cents, max_price_cents, typical_units, is_cosmetic, notes
    ) VALUES (
        v_fee_schedule_id, '36471', 'Sclerotherapy (spider veins) - per session', 'other_cosmetic', 'veins',
        'per session', 42500, 35000, 50000, 1, true,
        'Injectable sclerosant for leg spider veins. May require 2-4 sessions. Compression stockings required post-treatment.'
    ) ON CONFLICT (fee_schedule_id, cpt_code) DO UPDATE SET
        cpt_description = EXCLUDED.cpt_description,
        category = EXCLUDED.category,
        is_cosmetic = true;

    RAISE NOTICE 'Successfully seeded comprehensive cosmetic fee schedule data';
    RAISE NOTICE 'Total procedures added to fee schedule: %', v_fee_schedule_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error seeding cosmetic fee schedule data: %', SQLERRM;
        RAISE;
END $$;
