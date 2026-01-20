import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "./pool";

/**
 * Comprehensive Demo Seed Script
 * Creates 25 realistic dermatology patients with complete medical histories
 */

async function demoSeed() {
  await pool.query("begin");
  try {
    const tenantId = "tenant-demo";

    // Ensure tenant exists
    await pool.query(
      `INSERT INTO tenants(id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [tenantId, "Demo Dermatology"]
    );

    // User IDs for created_by fields
    const providerId = "u-provider";
    const adminId = "u-admin";

    // ============================================================================
    // DEMO PATIENTS - 25 Realistic Dermatology Cases
    // ============================================================================

    const patients = [
      // ========== ACNE (3 patients) ==========
      {
        id: "demo-acne-001",
        first_name: "Sarah",
        last_name: "Chen",
        dob: "2008-03-15", // 16 years old
        phone: "555-0201",
        email: "sarah.chen.parent@email.com",
        address: "1247 Oak Ridge Lane",
        city: "Denver",
        state: "CO",
        zip: "80203",
        insurance: "Anthem Blue Cross Blue Shield",
        allergies: "None known",
        medications: "Tretinoin 0.025% cream nightly, Doxycycline 100mg daily",
        medical_history: "Moderate acne vulgaris x 2 years. Previous treatments: benzoyl peroxide wash (insufficient response), adapalene (skin irritation). Currently on tretinoin with good tolerance.",
        diagnosis: "Acne vulgaris, moderate",
        icd_code: "L70.0"
      },
      {
        id: "demo-acne-002",
        first_name: "Marcus",
        last_name: "Johnson",
        dob: "2002-07-22", // 22 years old
        phone: "555-0202",
        email: "marcus.j2002@email.com",
        address: "3456 Highland Drive",
        city: "Boulder",
        state: "CO",
        zip: "80301",
        insurance: "United Healthcare",
        allergies: "Sulfa drugs (rash)",
        medications: "Minocycline 100mg BID, Benzoyl peroxide 5% wash, Clindamycin gel",
        medical_history: "Severe nodulocystic acne x 4 years. Failed multiple oral antibiotics (doxycycline, minocycline) and topical regimens. Significant scarring. Candidate for isotretinoin (Accutane) - iPLEDGE enrollment needed. Family history of acne.",
        diagnosis: "Acne conglobata, severe with scarring",
        icd_code: "L70.1"
      },
      {
        id: "demo-acne-003",
        first_name: "Emma",
        last_name: "Wilson",
        dob: "1996-11-08", // 28 years old
        phone: "555-0203",
        email: "emma.wilson28@email.com",
        address: "789 Maple Court",
        city: "Aurora",
        state: "CO",
        zip: "80010",
        insurance: "Cigna PPO",
        allergies: "Latex (contact dermatitis)",
        medications: "Spironolactone 100mg daily, Tretinoin 0.05% cream, Combined oral contraceptive",
        medical_history: "Adult-onset hormonal acne x 3 years. Worse with menstrual cycle. Tried multiple topicals with partial response. Started spironolactone 6 months ago with significant improvement. PCOS workup negative.",
        diagnosis: "Adult acne, hormonal pattern",
        icd_code: "L70.0"
      },

      // ========== ECZEMA/DERMATITIS (3 patients) ==========
      {
        id: "demo-eczema-001",
        first_name: "Tommy",
        last_name: "Rodriguez",
        dob: "2020-02-14", // 4 years old
        phone: "555-0204",
        email: "tommy.rodriguez.parent@email.com",
        address: "2341 Elmwood Avenue",
        city: "Lakewood",
        state: "CO",
        zip: "80226",
        insurance: "Medicaid (Colorado)",
        allergies: "Peanuts, Tree nuts, Eggs (food allergies - related to atopy)",
        medications: "Triamcinolone 0.1% ointment PRN flares, Cetirizine 5mg daily, Aquaphor ointment",
        medical_history: "Moderate-severe atopic dermatitis since 6 months old. Frequent flares requiring steroid use. Family history of asthma and allergies. Controlled with aggressive moisturizer regimen and intermittent topical steroids. Avoiding harsh soaps.",
        diagnosis: "Atopic dermatitis, moderate to severe",
        icd_code: "L20.9"
      },
      {
        id: "demo-eczema-002",
        first_name: "Linda",
        last_name: "Park",
        dob: "1979-05-20", // 45 years old
        phone: "555-0205",
        email: "linda.park@email.com",
        address: "5678 Cherry Blossom Way",
        city: "Centennial",
        state: "CO",
        zip: "80015",
        insurance: "Aetna HMO",
        allergies: "Nickel (proven on patch testing), Fragrance mix, Adhesive tape",
        medications: "Clobetasol 0.05% ointment BID, Hydroxyzine 25mg QHS PRN",
        medical_history: "Recurrent hand dermatitis x 2 years. Works as hairdresser - occupational exposure suspected. Previous patch testing revealed nickel and fragrance allergies. Improved with glove use and avoidance. Needs repeat patch testing for suspected new allergens.",
        diagnosis: "Allergic contact dermatitis of hands",
        icd_code: "L23.9"
      },
      {
        id: "demo-eczema-003",
        first_name: "Robert",
        last_name: "Kim",
        dob: "1957-09-12", // 67 years old
        phone: "555-0206",
        email: "robert.kim1957@email.com",
        address: "891 Riverside Drive",
        city: "Englewood",
        state: "CO",
        zip: "80110",
        insurance: "Medicare Part B + AARP Supplement",
        allergies: "Penicillin (anaphylaxis), Codeine (nausea)",
        medications: "Tacrolimus 0.1% ointment BID, Clobetasol 0.05% cream PRN severe flares, CeraVe cream",
        medical_history: "Chronic hand eczema x 10 years. Retired mechanic - chronic occupational exposure to irritants. Hyperkeratotic palmar eczema. Multiple failed treatments. Currently on tacrolimus with moderate response. Considers himself disabled by condition.",
        diagnosis: "Chronic hand eczema, hyperkeratotic type",
        icd_code: "L30.9"
      },

      // ========== PSORIASIS (3 patients) ==========
      {
        id: "demo-psoriasis-001",
        first_name: "James",
        last_name: "Miller",
        dob: "1972-04-18", // 52 years old
        phone: "555-0207",
        email: "james.miller@email.com",
        address: "1122 Sunset Boulevard",
        city: "Denver",
        state: "CO",
        zip: "80202",
        insurance: "Blue Cross Blue Shield Federal",
        allergies: "None known",
        medications: "Humira 40mg subQ every 2 weeks, Clobetasol 0.05% foam PRN, Vitamin D 2000 IU daily",
        medical_history: "Moderate plaque psoriasis x 15 years, 25% BSA involvement. Failed topicals and phototherapy. Started Humira 18 months ago with excellent response (now <5% BSA). Prior authorization renewed annually. Occasional flares during stress. No psoriatic arthritis.",
        diagnosis: "Psoriasis vulgaris, moderate, on biologic therapy",
        icd_code: "L40.0"
      },
      {
        id: "demo-psoriasis-002",
        first_name: "Patricia",
        last_name: "Brown",
        dob: "1986-12-03", // 38 years old
        phone: "555-0208",
        email: "patricia.brown86@email.com",
        address: "3344 Mountain View Road",
        city: "Highlands Ranch",
        state: "CO",
        zip: "80129",
        insurance: "Kaiser Permanente",
        allergies: "Shellfish (anaphylaxis)",
        medications: "Cosentyx 300mg subQ monthly, Methotrexate 15mg weekly, Folic acid 1mg daily, Halobetasol ointment",
        medical_history: "Psoriatic arthritis diagnosed 3 years ago with skin involvement (12% BSA). Joint pain in hands and feet. Co-managed with rheumatology. Started on methotrexate, added Cosentyx 1 year ago with good skin and joint response. Needs rheumatology referral for follow-up.",
        diagnosis: "Psoriatic arthritis with skin involvement",
        icd_code: "L40.50"
      },
      {
        id: "demo-psoriasis-003",
        first_name: "Michael",
        last_name: "Davis",
        dob: "1980-08-25", // 44 years old
        phone: "555-0209",
        email: "michael.davis1980@email.com",
        address: "5566 Pine Valley Court",
        city: "Littleton",
        state: "CO",
        zip: "80120",
        insurance: "Anthem Blue Cross",
        allergies: "None known",
        medications: "Clobetasol 0.05% solution scalp BID, Ketoconazole 2% shampoo twice weekly, Coal tar shampoo",
        medical_history: "Scalp psoriasis x 8 years. Thick plaques on scalp causing significant flaking and social embarrassment. Minimal body involvement. Managed with topical therapy only. Good response to current regimen but requires ongoing maintenance.",
        diagnosis: "Scalp psoriasis",
        icd_code: "L40.0"
      },

      // ========== SKIN CANCER / SUSPICIOUS LESIONS (4 patients) ==========
      {
        id: "demo-cancer-001",
        first_name: "William",
        last_name: "Thompson",
        dob: "1952-06-10", // 72 years old
        phone: "555-0210",
        email: "bill.thompson@email.com",
        address: "7788 Lakeside Drive",
        city: "Denver",
        state: "CO",
        zip: "80204",
        insurance: "Medicare Part B + Medigap Plan F",
        allergies: "Morphine (severe nausea)",
        medications: "Aspirin 81mg daily, Atorvastatin 40mg daily, Lisinopril 20mg daily, Fluorouracil 5% cream",
        medical_history: "History of melanoma (Stage IB, left shoulder, wide local excision 2021, clear sentinel node). Now on quarterly full-body skin checks. Multiple actinic keratoses. Significant sun exposure history (outdoor construction worker x 40 years). Melanoma surveillance ongoing.",
        diagnosis: "Personal history of melanoma, currently NED, with multiple AKs",
        icd_code: "Z85.820"
      },
      {
        id: "demo-cancer-002",
        first_name: "Barbara",
        last_name: "Anderson",
        dob: "1959-03-22", // 65 years old
        phone: "555-0211",
        email: "barbara.anderson@email.com",
        address: "9900 Willow Creek Lane",
        city: "Arvada",
        state: "CO",
        zip: "80002",
        insurance: "Medicare + AARP Supplement",
        allergies: "Adhesive tape (contact dermatitis)",
        medications: "Warfarin 5mg daily, Metoprolol 50mg BID, Imiquimod 5% cream",
        medical_history: "Multiple basal cell carcinomas over past 10 years (8 total). Most recent: right nasal ala BCC, Mohs surgery 3 months ago, 2-stage repair. Healed well. On warfarin for AFib (hold for procedures). History of extensive sun exposure. Quarterly skin surveillance.",
        diagnosis: "Multiple BCCs, s/p Mohs surgery, on surveillance",
        icd_code: "C44.311"
      },
      {
        id: "demo-cancer-003",
        first_name: "Richard",
        last_name: "Taylor",
        dob: "1966-11-15", // 58 years old
        phone: "555-0212",
        email: "richard.taylor@email.com",
        address: "2233 Aspen Ridge Road",
        city: "Westminster",
        state: "CO",
        zip: "80030",
        insurance: "United Healthcare PPO",
        allergies: "Iodine (hives)",
        medications: "Hydrochlorothiazide 25mg daily",
        medical_history: "New patient presenting with concerning pigmented lesion on upper back (noted by spouse). 7mm irregular borders, color variation. BIOPSY PERFORMED TODAY - awaiting pathology. Patient anxious. No prior skin cancer history. Family history: father had melanoma age 65.",
        diagnosis: "Atypical nevus, biopsy pending, rule out melanoma",
        icd_code: "D22.5"
      },
      {
        id: "demo-cancer-004",
        first_name: "Susan",
        last_name: "Martinez",
        dob: "1975-07-30", // 49 years old
        phone: "555-0213",
        email: "susan.martinez75@email.com",
        address: "4455 Cedar Creek Way",
        city: "Thornton",
        state: "CO",
        zip: "80229",
        insurance: "Cigna PPO",
        allergies: "None known",
        medications: "Levothyroxine 75mcg daily",
        medical_history: "Multiple actinic keratoses on face, scalp, and dorsal hands. Field cancerization from chronic sun damage (avid golfer x 20 years). Scheduled for liquid nitrogen cryotherapy today for 15+ lesions. Previous treatments: fluorouracil cream (poor compliance due to irritation).",
        diagnosis: "Multiple actinic keratoses, field treatment needed",
        icd_code: "L57.0"
      },

      // ========== COSMETIC (3 patients) ==========
      {
        id: "demo-cosmetic-001",
        first_name: "Jennifer",
        last_name: "White",
        dob: "1982-02-14", // 42 years old
        phone: "555-0214",
        email: "jennifer.white@email.com",
        address: "6677 Executive Parkway",
        city: "Greenwood Village",
        state: "CO",
        zip: "80111",
        insurance: "Self-pay (cosmetic)",
        allergies: "None known",
        medications: "None",
        medical_history: "Regular Botox patient x 5 years. Glabellar lines, forehead, crow's feet. Last treatment 4 months ago. Also receives HA filler (Juvederm) in nasolabial folds annually. Requests before/after photo documentation. Very satisfied with results. No complications history.",
        diagnosis: "Cosmetic - dynamic facial rhytids",
        icd_code: "L90.8"
      },
      {
        id: "demo-cosmetic-002",
        first_name: "Amanda",
        last_name: "Garcia",
        dob: "1989-09-05", // 35 years old
        phone: "555-0215",
        email: "amanda.garcia89@email.com",
        address: "8899 Valley View Circle",
        city: "Castle Rock",
        state: "CO",
        zip: "80104",
        insurance: "Self-pay (cosmetic)",
        allergies: "None known",
        medications: "Hydroquinone 4% cream nightly, Tretinoin 0.05% cream (alternating nights), Vitamin C serum AM",
        medical_history: "Melasma x 3 years, worse after second pregnancy. Hyperpigmentation on cheeks and upper lip. Currently on triple combination therapy (hydroquinone/tretinoin/steroid). Scheduled for series of IPL (Intense Pulsed Light) treatments. Sun protection counseling provided. Fitzpatrick III skin type.",
        diagnosis: "Melasma of face",
        icd_code: "L81.1"
      },
      {
        id: "demo-cosmetic-003",
        first_name: "Christopher",
        last_name: "Lee",
        dob: "1974-04-12", // 50 years old
        phone: "555-0216",
        email: "christopher.lee74@email.com",
        address: "1010 Country Club Drive",
        city: "Cherry Hills Village",
        state: "CO",
        zip: "80113",
        insurance: "Blue Cross (medical only), self-pay for cosmetic",
        allergies: "None known",
        medications: "Metronidazole 0.75% gel BID, Ivermectin 1% cream daily, Doxycycline 40mg daily",
        medical_history: "Rosacea x 8 years with background erythema and inflammatory papules/pustules. Triggers: alcohol, spicy food, stress. Managed medically with good control. Also interested in cosmetic treatment - considering laser therapy (VBeam) for persistent erythema and telangiectasias. Combination medical/cosmetic approach.",
        diagnosis: "Rosacea with cosmetic concerns",
        icd_code: "L71.9"
      },

      // ========== COMMON CONDITIONS (6 patients) ==========
      {
        id: "demo-common-001",
        first_name: "David",
        last_name: "Wilson",
        dob: "1991-01-20", // 33 years old
        phone: "555-0217",
        email: "david.wilson91@email.com",
        address: "3210 Harmony Lane",
        city: "Parker",
        state: "CO",
        zip: "80134",
        insurance: "Kaiser Permanente",
        allergies: "None known",
        medications: "None",
        medical_history: "Multiple plantar warts on bilateral feet x 6 months. Failed over-the-counter salicylic acid treatment. Currently on series of liquid nitrogen cryotherapy (TODAY IS VISIT 3 OF 4). Warts decreasing in size but not fully resolved. May need additional treatments or alternative therapy if no resolution.",
        diagnosis: "Verruca plantaris, multiple, bilateral",
        icd_code: "B07.0"
      },
      {
        id: "demo-common-002",
        first_name: "Michelle",
        last_name: "Clark",
        dob: "1997-06-18", // 27 years old
        phone: "555-0218",
        email: "michelle.clark97@email.com",
        address: "5432 Meadow Brook Drive",
        city: "Lone Tree",
        state: "CO",
        zip: "80124",
        insurance: "Anthem Blue Cross",
        allergies: "None known",
        medications: "Biotin 5000mcg daily (for hair)",
        medical_history: "Alopecia areata - two patches on scalp (right temporal, occipital) diagnosed 4 months ago. Receiving intralesional triamcinolone injections monthly. Patch on temporal region showing regrowth. Occipital patch stable. Patient anxious about progression. Labs: thyroid function normal, ANA negative.",
        diagnosis: "Alopecia areata, patchy",
        icd_code: "L63.9"
      },
      {
        id: "demo-common-003",
        first_name: "Kevin",
        last_name: "Brown",
        dob: "2005-10-30", // 19 years old
        phone: "555-0219",
        email: "kevin.brown05@email.com",
        address: "7654 University Avenue",
        city: "Boulder",
        state: "CO",
        zip: "80302",
        insurance: "Parents' United Healthcare plan",
        allergies: "None known",
        medications: "Ketoconazole 2% shampoo twice weekly",
        medical_history: "Seborrheic dermatitis of scalp and face x 1 year. Scaling and flaking on scalp, eyebrows, nasolabial folds. Worse in winter months. Responds well to ketoconazole shampoo. Occasional use of hydrocortisone 1% cream on face for flares. Good control with current regimen.",
        diagnosis: "Seborrheic dermatitis",
        icd_code: "L21.9"
      },
      {
        id: "demo-common-004",
        first_name: "Lisa",
        last_name: "Johnson",
        dob: "1969-03-08", // 55 years old
        phone: "555-0220",
        email: "lisa.johnson69@email.com",
        address: "9876 Cottonwood Circle",
        city: "Broomfield",
        state: "CO",
        zip: "80020",
        insurance: "Aetna PPO",
        allergies: "Sulfa drugs (hives)",
        medications: "Metronidazole 0.75% gel daily, Azelaic acid 15% gel daily, Doxycycline 40mg daily",
        medical_history: "Rosacea (erythematotelangiectatic and papulopustular subtypes) x 10 years. Managed with topical metronidazole and oral doxycycline. Good control. Triggers identified: hot beverages, stress, exercise. Uses gentle skincare, high SPF sunscreen. Occasional flares requiring brief course of higher-dose antibiotics.",
        diagnosis: "Rosacea, mixed type",
        icd_code: "L71.9"
      },
      {
        id: "demo-common-005",
        first_name: "Brian",
        last_name: "Smith",
        dob: "1983-07-14", // 41 years old
        phone: "555-0221",
        email: "brian.smith83@email.com",
        address: "2468 Forest Hills Road",
        city: "Morrison",
        state: "CO",
        zip: "80465",
        insurance: "Self-pay",
        allergies: "None known",
        medications: "Terbinafine 1% cream BID",
        medical_history: "Tinea corporis (ringworm) on trunk and arms. Acquired from wrestling practice 3 weeks ago. Classic annular lesions with central clearing. Started on topical antifungal with good response. Advised on hygiene measures and avoiding contact sports until resolved. No signs of kerion or secondary infection.",
        diagnosis: "Tinea corporis",
        icd_code: "B35.4"
      },
      {
        id: "demo-common-006",
        first_name: "Nancy",
        last_name: "Taylor",
        dob: "1962-12-25", // 62 years old
        phone: "555-0222",
        email: "nancy.taylor@email.com",
        address: "1357 Summit Ridge Drive",
        city: "Golden",
        state: "CO",
        zip: "80401",
        insurance: "Medicare Part B",
        allergies: "None known",
        medications: "Metformin 1000mg BID, Amlodipine 5mg daily",
        medical_history: "Multiple seborrheic keratoses on trunk and face. Patient requesting cosmetic removal of several prominent lesions on face (forehead, cheeks). Benign lesions confirmed clinically. Patient understands cosmetic removal is self-pay. Scheduled for liquid nitrogen cryotherapy of 5-6 facial SKs. No suspicious lesions noted.",
        diagnosis: "Seborrheic keratosis, multiple",
        icd_code: "L82.1"
      },

      // ========== COMPLEX CASES (3 patients) ==========
      {
        id: "demo-complex-001",
        first_name: "Daniel",
        last_name: "Perry",
        dob: "1976-05-03", // 48 years old
        phone: "555-0223",
        email: "daniel.perry@email.com",
        address: "2580 Lakeview Terrace",
        city: "Evergreen",
        state: "CO",
        zip: "80439",
        insurance: "Blue Cross Blue Shield PPO",
        allergies: "None known",
        medications: "Stelara 90mg subQ every 12 weeks, Clobetasol foam PRN, Fluorouracil 5% cream (for AKs)",
        medical_history: "COMPLEX PATIENT: (1) Moderate plaque psoriasis x 12 years, well-controlled on Stelara. (2) History of BCC (left cheek, excision 2019). (3) Multiple AKs requiring field treatment. (4) Interested in cosmetic procedures for aging skin and sun damage. Requires comprehensive approach addressing medical and cosmetic needs. Prior authorization for Stelara renewed annually.",
        diagnosis: "Multiple: Psoriasis vulgaris, h/o BCC, multiple AKs, photoaging",
        icd_code: "L40.0"
      },
      {
        id: "demo-complex-002",
        first_name: "Carol",
        last_name: "Williams",
        dob: "1953-08-16", // 71 years old
        phone: "555-0224",
        email: "carol.williams@email.com",
        address: "7531 Heritage Circle",
        city: "Littleton",
        state: "CO",
        zip: "80123",
        insurance: "Medicare + Medicaid dual eligible",
        allergies: "Penicillin (anaphylaxis), Codeine (confusion), Multiple drug sensitivities",
        medications: "Warfarin 3mg daily, Digoxin 0.125mg daily, Furosemide 40mg BID, Potassium chloride 20mEq daily, Triamcinolone 0.1% cream, CeraVe cream",
        medical_history: "COMPLEX ELDERLY PATIENT: (1) Chronic stasis dermatitis with recurrent cellulitis. (2) Fragile skin - multiple skin tears. (3) Polypharmacy (12 medications total) with multiple drug allergies. (4) On warfarin - requires coordination for any procedures. (5) Lives alone, some compliance issues. (6) Limited mobility. Requires gentle approach, careful medication selection, and coordination with PCP and cardiology.",
        diagnosis: "Stasis dermatitis with complications, fragile skin syndrome",
        icd_code: "I87.2"
      },
      {
        id: "demo-complex-003",
        first_name: "Steven",
        last_name: "Moore",
        dob: "1985-09-27", // 39 years old
        phone: "555-0225",
        email: "steven.moore@email.com",
        address: "9753 Parkside Avenue",
        city: "Denver",
        state: "CO",
        zip: "80205",
        insurance: "Medicaid (Colorado)",
        allergies: "Sulfa drugs (Stevens-Johnson syndrome - documented)",
        medications: "Biktarvy (HIV regimen), TMP-SMX (PCP prophylaxis), Fluconazole PRN, Triamcinolone 0.1% cream",
        medical_history: "HIV+ patient (diagnosed 2015, currently undetectable viral load, CD4 850). History of Kaposi sarcoma (oral lesions 2018, treated with ART intensification and local therapy, resolved). Currently presenting with seborrheic dermatitis and folliculitis. Immunocompetent on current ART. Close monitoring required. History of severe sulfa allergy limits antibiotic options.",
        diagnosis: "HIV with dermatologic manifestations, h/o Kaposi sarcoma",
        icd_code: "B20"
      }
    ];

    console.log("Seeding 25 demo patients...");

    for (const p of patients) {
      await pool.query(
        `INSERT INTO patients(
          id, tenant_id, first_name, last_name, dob, phone, email,
          address, city, state, zip, insurance, allergies, medications
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          dob = EXCLUDED.dob,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          insurance = EXCLUDED.insurance,
          allergies = EXCLUDED.allergies,
          medications = EXCLUDED.medications`,
        [
          p.id, tenantId, p.first_name, p.last_name, p.dob, p.phone, p.email,
          p.address, p.city, p.state, p.zip, p.insurance, p.allergies, p.medications
        ]
      );
    }

    // ============================================================================
    // PAST ENCOUNTERS - Create realistic visit history
    // ============================================================================

    console.log("Creating past encounters and visit history...");

    const encounters = [
      // Sarah Chen - Teen acne, 3 prior visits
      {
        id: randomUUID(),
        patient_id: "demo-acne-001",
        provider_id: providerId,
        encounter_date: "2024-06-15",
        chief_complaint: "Acne breakout",
        hpi: "16-year-old female presenting with worsening facial acne x 6 months. Tried OTC benzoyl peroxide wash with minimal improvement. Comedones, papules, pustules on forehead, cheeks, chin. No scarring yet. Affecting self-esteem.",
        exam: "Face: Multiple open and closed comedones, inflammatory papules and pustules on forehead (15+), cheeks (10+ bilateral), chin (8). No nodules or cysts. No scarring. Mild erythema.",
        assessment_plan: "Moderate acne vulgaris. Start: Tretinoin 0.025% cream nightly (start 3x/week, increase as tolerated), Benzoyl peroxide 5% wash AM, Doxycycline 100mg daily. Education on proper skincare, sun protection with tretinoin use. F/U 6-8 weeks.",
        icd_codes: ["L70.0"],
        cpt_codes: ["99203"],
        status: "completed"
      },
      {
        id: randomUUID(),
        patient_id: "demo-acne-001",
        provider_id: providerId,
        encounter_date: "2024-08-20",
        chief_complaint: "Acne follow-up",
        hpi: "Returns for acne follow-up. Has been using tretinoin nightly for past 2 months, tolerating well after initial irritation. Using doxycycline daily. Seeing some improvement but still breaking out.",
        exam: "Face: Decreased number of inflammatory lesions. Still some comedones present. No new scarring. Mild skin dryness from tretinoin (expected). Overall improved from last visit.",
        assessment_plan: "Moderate acne vulgaris, improving on current regimen. Continue: Tretinoin 0.025% nightly, Doxycycline 100mg daily, BP wash. Add: Clindamycin gel AM. Emphasize compliance. F/U 2-3 months.",
        icd_codes: ["L70.0"],
        cpt_codes: ["99213"],
        status: "completed"
      },
      {
        id: randomUUID(),
        patient_id: "demo-acne-001",
        provider_id: providerId,
        encounter_date: "2024-11-10",
        chief_complaint: "Acne follow-up",
        hpi: "Returns for acne follow-up. Significant improvement on current regimen. Occasional new lesions but much better overall. Happy with progress.",
        exam: "Face: Marked improvement. Few scattered comedones. Rare inflammatory papules. No active pustules. No scarring.",
        assessment_plan: "Moderate acne vulgaris, well-controlled. Continue current regimen. Plan to taper doxycycline in 2-3 months if sustained improvement. F/U 3 months or PRN.",
        icd_codes: ["L70.0"],
        cpt_codes: ["99213"],
        status: "completed"
      },

      // Marcus Johnson - Severe acne, Accutane candidate
      {
        id: randomUUID(),
        patient_id: "demo-acne-002",
        provider_id: providerId,
        encounter_date: "2024-09-15",
        chief_complaint: "Severe acne, requesting Accutane",
        hpi: "22-year-old male with severe nodulocystic acne x 4 years. Failed multiple courses of oral antibiotics (doxycycline, minocycline), topical retinoids, benzoyl peroxide. Significant physical and emotional distress. Developing scarring. Requesting isotretinoin.",
        exam: "Face, chest, back: Numerous deep nodules and cysts. Significant scarring (ice pick and boxcar scars on cheeks). Active inflammation. Severe acne by any measure.",
        assessment_plan: "Severe nodulocystic acne with scarring. Candidate for isotretinoin. Discussed risks, benefits, iPLEDGE requirements, contraception (male patient), monitoring. Patient agreeable. Ordered: Baseline labs (CBC, CMP, lipid panel). Set up iPLEDGE enrollment. F/U 2 weeks with labs to start isotretinoin.",
        icd_codes: ["L70.1"],
        cpt_codes: ["99204"],
        status: "completed"
      },

      // William Thompson - Melanoma history, quarterly checks
      {
        id: randomUUID(),
        patient_id: "demo-cancer-001",
        provider_id: providerId,
        encounter_date: "2024-07-10",
        chief_complaint: "Skin cancer screening (quarterly)",
        hpi: "72-year-old male with history of melanoma (left shoulder, 2021, stage IB, WLE with clear margins, negative SLN). Here for routine quarterly skin check. No new concerning lesions noted by patient. Using sunscreen.",
        exam: "Complete skin exam: Surgical scar left shoulder well-healed. Multiple seborrheic keratoses. 8-10 actinic keratoses on scalp, face, dorsal hands. No suspicious pigmented lesions. No new lesions concerning for melanoma or non-melanoma skin cancer today.",
        assessment_plan: "1. H/o melanoma - NED on today's exam. Continue quarterly surveillance. 2. Multiple AKs - treat with LN2 cryotherapy today (10 lesions). 3. Sun protection counseling reinforced. F/U 3 months.",
        icd_codes: ["Z85.820", "L57.0"],
        cpt_codes: ["99213", "17000", "17003"],
        status: "completed"
      },
      {
        id: randomUUID(),
        patient_id: "demo-cancer-001",
        provider_id: providerId,
        encounter_date: "2024-10-08",
        chief_complaint: "Skin cancer screening (quarterly)",
        hpi: "Returns for quarterly melanoma surveillance. No new concerning lesions. AKs treated last visit resolved.",
        exam: "Complete skin exam: No suspicious lesions. Few new AKs noted. Melanoma scar stable.",
        assessment_plan: "H/o melanoma - continue surveillance. Treat new AKs with cryotherapy. F/U 3 months.",
        icd_codes: ["Z85.820", "L57.0"],
        cpt_codes: ["99213", "17000"],
        status: "completed"
      },

      // Richard Taylor - New suspicious mole, biopsy pending
      {
        id: randomUUID(),
        patient_id: "demo-cancer-003",
        provider_id: providerId,
        encounter_date: new Date().toISOString().split('T')[0], // TODAY
        chief_complaint: "Concerning mole on back",
        hpi: "58-year-old male referred by PCP for evaluation of pigmented lesion on upper back. Patient's wife noticed it 2 months ago. Patient unsure if new or changing. No symptoms. Father had melanoma at age 65.",
        exam: "Upper back: 7mm irregularly bordered brown macule with color variation (light to dark brown). Asymmetric. Concerning for melanoma. Remainder of skin exam: Multiple benign nevi, no other suspicious lesions.",
        assessment_plan: "Atypical pigmented lesion, upper back - high suspicion for melanoma. PERFORMED: Shave biopsy for histopathology. Pathology pending (expect results in 7-10 days). Will call patient with results. May need wide local excision +/- sentinel lymph node biopsy depending on pathology. Patient counseled, anxious but understanding.",
        icd_codes: ["D22.5"],
        cpt_codes: ["99203", "11100"],
        status: "completed"
      }
    ];

    for (const enc of encounters) {
      await pool.query(
        `INSERT INTO encounters(
          id, tenant_id, patient_id, provider_id, status,
          chief_complaint, hpi, exam, assessment_plan, encounter_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING`,
        [
          enc.id, tenantId, enc.patient_id, enc.provider_id, enc.status,
          enc.chief_complaint, enc.hpi, enc.exam, enc.assessment_plan, enc.encounter_date
        ]
      );
    }

    // ============================================================================
    // PRESCRIPTIONS - Realistic medication orders
    // ============================================================================

    console.log("Creating prescriptions...");

    const prescriptions = [
      // Sarah Chen - Tretinoin
      {
        patient_id: "demo-acne-001",
        medication_name: "Tretinoin 0.025% Cream",
        generic_name: "Tretinoin",
        strength: "0.025%",
        dosage_form: "cream",
        sig: "Apply a pea-sized amount to clean, dry face at bedtime. Start 3 times per week for 2 weeks, then increase to nightly as tolerated.",
        quantity: 45,
        quantity_unit: "grams",
        refills: 3,
        days_supply: 90,
        status: "sent",
        indication: "Moderate acne vulgaris"
      },
      // Emma Wilson - Spironolactone
      {
        patient_id: "demo-acne-003",
        medication_name: "Spironolactone 100mg Tablet",
        generic_name: "Spironolactone",
        strength: "100mg",
        dosage_form: "tablet",
        sig: "Take 1 tablet by mouth once daily with food",
        quantity: 90,
        quantity_unit: "each",
        refills: 3,
        days_supply: 90,
        status: "sent",
        indication: "Adult hormonal acne"
      },
      // James Miller - Humira (biologic - needs prior auth)
      {
        patient_id: "demo-psoriasis-001",
        medication_name: "Humira 40mg/0.8mL Injection",
        generic_name: "Adalimumab",
        strength: "40mg/0.8mL",
        dosage_form: "injection",
        sig: "Inject 40mg subcutaneously every 2 weeks",
        quantity: 2,
        quantity_unit: "each",
        refills: 3,
        days_supply: 28,
        status: "sent",
        indication: "Moderate to severe plaque psoriasis",
        is_controlled: false
      }
    ];

    for (const rx of prescriptions) {
      await pool.query(
        `INSERT INTO prescriptions(
          id, tenant_id, patient_id, provider_id, medication_name, generic_name,
          strength, dosage_form, sig, quantity, quantity_unit, refills, days_supply,
          status, indication, created_by, is_controlled
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING`,
        [
          randomUUID(), tenantId, rx.patient_id, providerId, rx.medication_name,
          rx.generic_name, rx.strength, rx.dosage_form, rx.sig, rx.quantity,
          rx.quantity_unit, rx.refills, rx.days_supply, rx.status, rx.indication,
          providerId, rx.is_controlled || false
        ]
      );
    }

    // ============================================================================
    // PRIOR AUTHORIZATIONS - Realistic PA requests
    // ============================================================================

    console.log("Creating prior authorization requests...");

    const priorAuths = [
      {
        patient_id: "demo-psoriasis-001",
        prescription_id: null, // Can link to actual prescription if needed
        medication_name: "Humira (Adalimumab) 40mg/0.8mL",
        diagnosis_code: "L40.0",
        insurance_name: "Blue Cross Blue Shield Federal",
        provider_npi: "1234567890",
        clinical_justification: "52-year-old male with moderate plaque psoriasis affecting 25% BSA. Failed topical therapies (high-potency steroids, vitamin D analogs) and narrowband UVB phototherapy (36 treatments over 12 weeks). Significant impact on quality of life (DLQI score 18). Patient requires systemic therapy. Requesting approval for adalimumab 40mg subcutaneous every 2 weeks per FDA-approved dosing for plaque psoriasis.",
        status: "approved",
        urgency: "routine",
        insurance_auth_number: "AUTH-2024-1234567",
        submitted_at: "2024-01-15T10:00:00Z",
        approved_at: "2024-01-18T14:30:00Z",
        expires_at: "2025-01-18T00:00:00Z"
      },
      {
        patient_id: "demo-acne-002",
        prescription_id: null,
        medication_name: "Isotretinoin (Accutane) 40mg",
        diagnosis_code: "L70.1",
        insurance_name: "United Healthcare",
        provider_npi: "1234567890",
        clinical_justification: "22-year-old male with severe nodulocystic acne with scarring. Failed adequate trials of: (1) Doxycycline 100mg BID x 12 weeks, (2) Minocycline 100mg BID x 12 weeks, (3) Topical tretinoin 0.1% x 6 months, (4) Topical clindamycin, (5) Benzoyl peroxide. Patient has developed permanent scarring. Significant psychological distress. Isotretinoin is medically necessary. Patient enrolled in iPLEDGE program. Baseline labs: Normal CBC, liver function, lipids.",
        status: "pending",
        urgency: "routine",
        submitted_at: new Date().toISOString(),
        insurance_auth_number: null
      }
    ];

    for (const pa of priorAuths) {
      await pool.query(
        `INSERT INTO prior_authorizations(
          id, tenant_id, patient_id, prescription_id, auth_number, medication_name,
          diagnosis_code, insurance_name, provider_npi, clinical_justification,
          status, urgency, insurance_auth_number, submitted_at, approved_at, expires_at,
          created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (auth_number) DO NOTHING`,
        [
          randomUUID(), tenantId, pa.patient_id, pa.prescription_id,
          `PA-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
          pa.medication_name, pa.diagnosis_code, pa.insurance_name, pa.provider_npi,
          pa.clinical_justification, pa.status, pa.urgency, pa.insurance_auth_number,
          pa.submitted_at, pa.approved_at, pa.expires_at, providerId, providerId
        ]
      );
    }

    // ============================================================================
    // LAB ORDERS - Pending labs for Accutane patient
    // ============================================================================

    console.log("Creating lab orders...");

    // For Marcus Johnson (Accutane candidate) - baseline labs
    await pool.query(
      `INSERT INTO lab_orders(
        id, tenant_id, patient_id, provider_id, order_type, order_name,
        loinc_code, status, urgency, clinical_indication, ordered_at, created_by
      ) VALUES
        ($1,$2,$3,$4,'lab','Complete Blood Count','58410-2','pending','routine','Baseline labs for isotretinoin therapy',NOW(),$5),
        ($6,$2,$3,$4,'lab','Comprehensive Metabolic Panel','24323-8','pending','routine','Baseline labs for isotretinoin therapy',NOW(),$5),
        ($7,$2,$3,$4,'lab','Lipid Panel','57698-3','pending','routine','Baseline labs for isotretinoin therapy',NOW(),$5)
      ON CONFLICT (id) DO NOTHING`,
      [
        randomUUID(), tenantId, "demo-acne-002", providerId, providerId,
        randomUUID(), randomUUID()
      ]
    );

    // ============================================================================
    // SAMPLE DAY SCHEDULE - Tomorrow's appointments
    // ============================================================================

    console.log("Creating sample day schedule for tomorrow...");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0); // Start at 8 AM

    const scheduleSlots = [
      { patient_id: "demo-acne-001", time_offset: 0, duration: 20, type: "appttype-fu", chief_complaint: "Acne follow-up" },
      { patient_id: "demo-eczema-001", time_offset: 30, duration: 30, type: "appttype-demo", chief_complaint: "Eczema flare" },
      { patient_id: "demo-cancer-001", time_offset: 60, duration: 30, type: "appttype-demo", chief_complaint: "Skin cancer screening" },
      { patient_id: "demo-psoriasis-001", time_offset: 100, duration: 20, type: "appttype-fu", chief_complaint: "Biologic follow-up" },
      { patient_id: "demo-cosmetic-001", time_offset: 130, duration: 45, type: "appttype-proc", chief_complaint: "Botox treatment" },
      { patient_id: "demo-common-001", time_offset: 190, duration: 20, type: "appttype-proc", chief_complaint: "Wart cryotherapy (visit 4/4)" },
      { patient_id: "demo-acne-002", time_offset: 220, duration: 30, type: "appttype-demo", chief_complaint: "Accutane consultation" },
      { patient_id: "demo-cancer-004", time_offset: 260, duration: 30, type: "appttype-proc", chief_complaint: "Cryotherapy for AKs" },
      { patient_id: "demo-eczema-002", time_offset: 300, duration: 30, type: "appttype-demo", chief_complaint: "Patch testing results" },
      { patient_id: "demo-psoriasis-002", time_offset: 340, duration: 20, type: "appttype-fu", chief_complaint: "Psoriatic arthritis follow-up" },
      { patient_id: "demo-common-002", time_offset: 370, duration: 20, type: "appttype-proc", chief_complaint: "Alopecia areata injections" },
      { patient_id: "demo-cosmetic-002", time_offset: 400, duration: 30, type: "appttype-demo", chief_complaint: "Melasma - IPL treatment" },
      { patient_id: "demo-cancer-002", time_offset: 440, duration: 20, type: "appttype-fu", chief_complaint: "Post-Mohs follow-up" },
      { patient_id: "demo-complex-001", time_offset: 470, duration: 30, type: "appttype-demo", chief_complaint: "Complex case - psoriasis + skin cancer surveillance" },
      { patient_id: "demo-common-006", time_offset: 510, duration: 30, type: "appttype-proc", chief_complaint: "SK removal (cosmetic)" }
    ];

    for (const slot of scheduleSlots) {
      const startTime = new Date(tomorrow.getTime() + slot.time_offset * 60 * 1000);
      const endTime = new Date(startTime.getTime() + slot.duration * 60 * 1000);

      await pool.query(
        `INSERT INTO appointments(
          id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
          scheduled_start, scheduled_end, status, chief_complaint
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING`,
        [
          randomUUID(), tenantId, slot.patient_id, providerId, "loc-demo",
          slot.type, startTime.toISOString(), endTime.toISOString(),
          "scheduled", slot.chief_complaint
        ]
      );
    }

    // ============================================================================
    // TASKS - Pending clinical tasks
    // ============================================================================

    console.log("Creating pending tasks...");

    const tasks = [
      {
        patient_id: "demo-cancer-003",
        title: "Call patient with biopsy results (Richard Taylor)",
        description: "Pathology expected back in 7-10 days. Call patient with results. If melanoma, schedule for WLE +/- SLNB discussion.",
        assigned_to: providerId,
        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      },
      {
        patient_id: "demo-acne-002",
        title: "Review baseline labs for Marcus Johnson (Accutane)",
        description: "Check CBC, CMP, lipid panel results. If normal, clear to start isotretinoin. Enroll in iPLEDGE and submit first prescription.",
        assigned_to: providerId,
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days from now
      },
      {
        patient_id: "demo-psoriasis-001",
        title: "Submit Humira prior authorization renewal (James Miller)",
        description: "Current PA expires in 30 days. Submit renewal paperwork to BCBS Federal. Include updated clinical notes showing continued benefit.",
        assigned_to: adminId,
        due_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days from now
      },
      {
        patient_id: "demo-complex-002",
        title: "Coordinate care for Carol Williams",
        description: "Contact PCP and cardiologist regarding warfarin management for upcoming procedure. Patient needs cryotherapy but on warfarin.",
        assigned_to: "u-ma",
        due_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
      }
    ];

    for (const task of tasks) {
      await pool.query(
        `INSERT INTO tasks(
          id, tenant_id, patient_id, title, description, status, due_at, assigned_to
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING`,
        [
          randomUUID(), tenantId, task.patient_id, task.title, task.description,
          "open", task.due_at, task.assigned_to
        ]
      );
    }

    await pool.query("commit");

    console.log("✓ Demo seed complete!");
    console.log("✓ Created 25 realistic dermatology patients");
    console.log("✓ Created past encounters with visit notes");
    console.log("✓ Created prescriptions and prior authorizations");
    console.log("✓ Created pending lab orders");
    console.log("✓ Created sample day schedule for tomorrow with 15 appointments");
    console.log("✓ Created pending clinical tasks");
    console.log("\nPatient Categories:");
    console.log("  - Acne: 3 patients (teen, severe/Accutane candidate, adult hormonal)");
    console.log("  - Eczema/Dermatitis: 3 patients (pediatric, contact dermatitis, chronic hand eczema)");
    console.log("  - Psoriasis: 3 patients (biologic therapy, psoriatic arthritis, scalp psoriasis)");
    console.log("  - Skin Cancer/Suspicious Lesions: 4 patients (melanoma history, multiple BCCs, biopsy pending, AKs)");
    console.log("  - Cosmetic: 3 patients (Botox/filler, melasma/laser, rosacea+cosmetic)");
    console.log("  - Common Conditions: 6 patients (warts, alopecia, seborrheic dermatitis, rosacea, ringworm, SKs)");
    console.log("  - Complex Cases: 3 patients (multiple conditions, elderly+polypharmacy, HIV+)");

  } catch (err) {
    await pool.query("rollback");
    throw err;
  }
}

// Export function for programmatic use
export { demoSeed as runDemoSeed };

// Run if executed directly
if (require.main === module) {
  demoSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Demo seed failed:", err);
      process.exit(1);
    });
}
