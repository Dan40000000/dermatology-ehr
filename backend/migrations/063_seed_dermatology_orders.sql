-- Seed dermatology-specific orders for demo
-- Migration: 063_seed_dermatology_orders.sql

-- Get patient IDs and create orders
DO $$
DECLARE
    patient_ids TEXT[];
    patient_1 TEXT;
    patient_2 TEXT;
    patient_3 TEXT;
    patient_4 TEXT;
    patient_5 TEXT;
BEGIN
    -- Get 5 patient IDs from the database
    SELECT ARRAY_AGG(id) INTO patient_ids
    FROM (SELECT id FROM patients WHERE tenant_id = 'tenant-demo' ORDER BY created_at DESC LIMIT 5) sub;

    -- Assign to variables (use first patient as fallback)
    patient_1 := COALESCE(patient_ids[1], patient_ids[1]);
    patient_2 := COALESCE(patient_ids[2], patient_ids[1]);
    patient_3 := COALESCE(patient_ids[3], patient_ids[1]);
    patient_4 := COALESCE(patient_ids[4], patient_ids[1]);
    patient_5 := COALESCE(patient_ids[5], patient_ids[1]);

    -- Make sure we have at least one patient
    IF patient_1 IS NULL THEN
        RAISE NOTICE 'No patients found in tenant-demo, skipping order seeding';
        RETURN;
    END IF;

    -- Clear existing orders first
    DELETE FROM orders WHERE tenant_id = 'tenant-demo';

    -- BIOPSY ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'biopsy', 'pending', 'stat',
     'Shave biopsy of suspicious pigmented lesion - left forearm',
     'Patient noted recent growth. Rule out melanoma. ABCDE criteria present.', NOW() - interval '2 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'biopsy', 'in-progress', 'urgent',
     'Punch biopsy 4mm - erythematous plaque right thigh',
     'Psoriasiform appearance. R/O psoriasis vs fungal infection.', NOW() - interval '1 day'),
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'biopsy', 'completed', 'routine',
     'Excisional biopsy of atypical nevus - back',
     'Moderately dysplastic nevus on dermoscopy. Complete excision with 2mm margins.', NOW() - interval '5 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'biopsy', 'pending', 'urgent',
     'Shave biopsy - rapidly growing nodule scalp',
     'Keratoacanthoma vs SCC. Growth over 3 weeks.', NOW() - interval '4 hours');

    -- PATHOLOGY/DERMPATH ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'dermpath', 'in-progress', 'stat',
     'DermPath review - pigmented lesion biopsy specimen',
     'Specimen submitted for melanocytic analysis. Immunohistochemistry if needed.', NOW() - interval '1 hour'),
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'pathology', 'pending', 'routine',
     'Histopathology - chronic dermatitis specimen',
     'Persistent eczematous dermatitis. R/O allergic contact dermatitis.', NOW() - interval '3 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'dermpath', 'completed', 'routine',
     'Special stains PAS/GMS - nail specimen',
     'Onychomycosis suspected. Fungal culture pending.', NOW() - interval '7 days');

    -- LAB ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'lab', 'pending', 'routine',
     'CBC with differential, CMP, LFTs',
     'Baseline labs prior to starting methotrexate for psoriasis.', NOW() - interval '12 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'lab', 'in-progress', 'routine',
     'ANA panel, Anti-dsDNA, complement levels',
     'Evaluate for lupus. Patient presents with malar rash and photosensitivity.', NOW() - interval '2 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'lab', 'completed', 'routine',
     'TB QuantiFERON Gold, Hepatitis B panel',
     'Pre-biologic screening for TNF-alpha inhibitor therapy.', NOW() - interval '10 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'lab', 'pending', 'urgent',
     'Fasting lipid panel, HbA1c',
     'Isotretinoin baseline labs. Starting Accutane for severe acne.', NOW() - interval '6 hours');

    -- PROCEDURE ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'procedure', 'pending', 'routine',
     'Cryotherapy - multiple actinic keratoses face and scalp',
     '12 AKs identified. Liquid nitrogen treatment planned.', NOW() - interval '1 day'),
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'procedure', 'in-progress', 'routine',
     'Mohs surgery - BCC left nasal ala',
     'Nodular BCC confirmed on biopsy. Stage 1 complete, processing.', NOW() - interval '3 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'procedure', 'completed', 'routine',
     'Electrodesiccation and curettage - seborrheic keratoses',
     '5 irritated SK removed from back. Hemostasis achieved.', NOW() - interval '4 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'procedure', 'pending', 'routine',
     'Intralesional kenalog injection - keloid scars',
     'Triamcinolone 10mg/ml x 3 injection sites. Follow up 4 weeks.', NOW() - interval '8 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'procedure', 'pending', 'urgent',
     'Wide local excision - melanoma in situ',
     'Path confirmed MIS. 5mm margins planned per NCCN guidelines.', NOW() - interval '2 days');

    -- COSMETIC ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-cosmetic-pa', 'Sarah Mitchell, PA-C', 'cosmetic', 'pending', 'routine',
     'Botox - glabella 20u, forehead 10u, crows feet 12u each',
     'Established patient. No prior adverse reactions. Cosmetic consultation complete.', NOW() - interval '1 day'),
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-cosmetic-pa', 'Sarah Mitchell, PA-C', 'cosmetic', 'in-progress', 'routine',
     'Juvederm Ultra Plus XC - nasolabial folds 1.5mL',
     'Touch up from 6 months ago. Good prior results.', NOW() - interval '2 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-cosmetic-pa', 'Sarah Mitchell, PA-C', 'cosmetic', 'completed', 'routine',
     'Chemical peel - Glycolic acid 30% full face',
     'Fitzpatrick type II. Treating fine lines and sun damage.', NOW() - interval '1 week'),
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-cosmetic-pa', 'Sarah Mitchell, PA-C', 'cosmetic', 'pending', 'routine',
     'Kybella - submental fat 2 vials',
     'Treatment #2 of 3. Good response after first treatment.', NOW() - interval '5 hours');

    -- IMAGING ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'imaging', 'pending', 'urgent',
     'Dermoscopy images - full body mole mapping',
     'High risk patient. Family history of melanoma. Annual surveillance.', NOW() - interval '6 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'imaging', 'completed', 'routine',
     'CT chest/abdomen/pelvis with contrast',
     'Staging workup for newly diagnosed melanoma. Breslow 1.8mm.', NOW() - interval '2 weeks'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'imaging', 'in-progress', 'routine',
     'Lymph node ultrasound - bilateral axillary/inguinal',
     'Sentinel node evaluation prior to SLNB.', NOW() - interval '3 days');

    -- PRESCRIPTION ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'rx', 'pending', 'routine',
     'Isotretinoin 40mg PO daily x 5 months',
     'iPLEDGE enrolled. Pregnancy test negative. Consent signed.', NOW() - interval '4 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'rx', 'completed', 'routine',
     'Methotrexate 15mg PO weekly + Folic acid 1mg daily',
     'Moderate plaque psoriasis. PASI 12. Labs cleared.', NOW() - interval '6 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'rx', 'in-progress', 'urgent',
     'Prednisone 60mg taper - severe contact dermatitis',
     'Poison ivy. Extensive involvement. 14-day taper.', NOW() - interval '1 day'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'rx', 'pending', 'routine',
     'Dupixent 300mg SC q2weeks',
     'Moderate-severe atopic dermatitis. Prior auth approved.', NOW() - interval '2 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo-2', 'Riley Johnson, PA-C', 'rx', 'completed', 'routine',
     'Triamcinolone 0.1% cream 454g, Hydrocortisone 2.5% oint 60g',
     'Eczema maintenance therapy. Good response.', NOW() - interval '3 weeks');

    -- REFERRAL ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_1, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'referral', 'pending', 'urgent',
     'Surgical oncology consult - melanoma staging/SLNB',
     'Breslow 1.8mm melanoma. Needs sentinel lymph node biopsy evaluation.', NOW() - interval '1 day'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo-3', 'Dr. Maria Martinez, MD, FAAD', 'referral', 'in-progress', 'routine',
     'Rheumatology consult - possible dermatomyositis',
     'Heliotrope rash, Gottron papules, proximal weakness. CK elevated.', NOW() - interval '4 days'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'referral', 'completed', 'routine',
     'Allergy/Immunology - patch testing',
     'Recurrent allergic contact dermatitis. Need comprehensive panel.', NOW() - interval '2 weeks'),
    (gen_random_uuid()::text, 'tenant-demo', patient_2, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'referral', 'pending', 'routine',
     'Plastic surgery consult - Mohs defect reconstruction',
     'Large BCC nose. Will need complex flap reconstruction.', NOW() - interval '3 days');

    -- SUPPLY ORDERS
    INSERT INTO orders (id, tenant_id, patient_id, provider_id, provider_name, type, status, priority, details, notes, created_at)
    VALUES
    (gen_random_uuid()::text, 'tenant-demo', patient_3, 'prov-demo-2', 'Riley Johnson, PA-C', 'supply', 'pending', 'routine',
     'Wound care supplies - Mepilex Border 4x4 x30, Aquacel Ag x20',
     'Post-Mohs wound care. Change dressing q48h.', NOW() - interval '8 hours'),
    (gen_random_uuid()::text, 'tenant-demo', patient_5, 'prov-demo', 'Dr. David Skin, MD, FAAD', 'supply', 'completed', 'routine',
     'Compression stockings 20-30mmHg knee-high x2 pairs',
     'Stasis dermatitis management. Improve venous return.', NOW() - interval '1 week'),
    (gen_random_uuid()::text, 'tenant-demo', patient_4, 'prov-demo-2', 'Riley Johnson, PA-C', 'supply', 'pending', 'routine',
     'UVB narrowband home unit - prescription/authorization',
     'Psoriasis phototherapy. Insurance pre-auth submitted.', NOW() - interval '2 days');

    RAISE NOTICE 'Successfully seeded dermatology orders';
END $$;
