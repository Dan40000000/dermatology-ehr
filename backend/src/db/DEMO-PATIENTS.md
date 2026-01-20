# Demo Seed Patient Database

This document describes the 25 realistic dermatology patients created by the demo seed script.

## Running the Demo Seed

```bash
npm run seed:demo
```

## Patient Categories

### ACNE (3 patients)

#### 1. Sarah Chen - Teen Moderate Acne
- **ID:** `demo-acne-001`
- **Age:** 16 years old (DOB: 2008-03-15)
- **Insurance:** Anthem Blue Cross Blue Shield
- **Allergies:** None known
- **Current Medications:** Tretinoin 0.025% cream nightly, Doxycycline 100mg daily
- **Diagnosis:** Moderate acne vulgaris (L70.0)
- **History:** 2 years of moderate facial acne. Previously tried benzoyl peroxide (insufficient response), adapalene (skin irritation). Currently on tretinoin with good tolerance.
- **Prior Visits:** 3 visits (June 2024, August 2024, November 2024) - documented improvement
- **Clinical Notes:** Good response to current regimen. Plan to taper antibiotics in 2-3 months.

#### 2. Marcus Johnson - Severe Cystic Acne (Accutane Candidate)
- **ID:** `demo-acne-002`
- **Age:** 22 years old (DOB: 2002-07-22)
- **Insurance:** United Healthcare
- **Allergies:** Sulfa drugs (rash)
- **Current Medications:** Minocycline 100mg BID, Benzoyl peroxide 5% wash, Clindamycin gel
- **Diagnosis:** Acne conglobata, severe with scarring (L70.1)
- **History:** 4 years of severe nodulocystic acne. Failed multiple oral antibiotics and topical regimens. Significant scarring.
- **Special Requirements:**
  - **NEEDS iPLEDGE ENROLLMENT** for isotretinoin (Accutane)
  - Pending baseline labs (CBC, CMP, lipid panel)
  - Prior authorization request submitted for isotretinoin
- **Clinical Notes:** Excellent candidate for isotretinoin therapy. Patient educated on risks/benefits.

#### 3. Emma Wilson - Adult Hormonal Acne
- **ID:** `demo-acne-003`
- **Age:** 28 years old (DOB: 1996-11-08)
- **Insurance:** Cigna PPO
- **Allergies:** Latex (contact dermatitis)
- **Current Medications:** Spironolactone 100mg daily, Tretinoin 0.05% cream, Combined oral contraceptive
- **Diagnosis:** Adult acne, hormonal pattern (L70.0)
- **History:** Adult-onset acne x 3 years, worse with menstrual cycle. Started spironolactone 6 months ago with significant improvement. PCOS workup negative.
- **Clinical Notes:** Excellent response to anti-androgen therapy.

---

### ECZEMA/DERMATITIS (3 patients)

#### 4. Tommy Rodriguez - Pediatric Atopic Dermatitis
- **ID:** `demo-eczema-001`
- **Age:** 4 years old (DOB: 2020-02-14)
- **Insurance:** Medicaid (Colorado)
- **Allergies:** Peanuts, Tree nuts, Eggs (food allergies - atopic triad)
- **Current Medications:** Triamcinolone 0.1% ointment PRN, Cetirizine 5mg daily, Aquaphor ointment
- **Diagnosis:** Atopic dermatitis, moderate to severe (L20.9)
- **History:** Moderate-severe AD since 6 months old. Frequent flares. Family history of asthma and allergies.
- **Clinical Notes:** Requires aggressive moisturizer regimen and intermittent topical steroids. Parent education on avoiding triggers.

#### 5. Linda Park - Contact Dermatitis (Needs Patch Testing)
- **ID:** `demo-eczema-002`
- **Age:** 45 years old (DOB: 1979-05-20)
- **Insurance:** Aetna HMO
- **Allergies:** Nickel (proven on patch testing), Fragrance mix, Adhesive tape
- **Current Medications:** Clobetasol 0.05% ointment BID, Hydroxyzine 25mg QHS PRN
- **Diagnosis:** Allergic contact dermatitis of hands (L23.9)
- **History:** Recurrent hand dermatitis x 2 years. Works as hairdresser - occupational exposure suspected.
- **Special Requirements:** **NEEDS REPEAT PATCH TESTING** for suspected new allergens
- **Clinical Notes:** Improved with glove use and allergen avoidance. Occupational dermatitis.

#### 6. Robert Kim - Chronic Hand Eczema
- **ID:** `demo-eczema-003`
- **Age:** 67 years old (DOB: 1957-09-12)
- **Insurance:** Medicare Part B + AARP Supplement
- **Allergies:** Penicillin (anaphylaxis), Codeine (nausea)
- **Current Medications:** Tacrolimus 0.1% ointment BID, Clobetasol 0.05% cream PRN, CeraVe cream
- **Diagnosis:** Chronic hand eczema, hyperkeratotic type (L30.9)
- **History:** Chronic hand eczema x 10 years. Retired mechanic - chronic occupational exposure. Multiple failed treatments. Moderate response to tacrolimus.
- **Clinical Notes:** Disabling condition affecting quality of life.

---

### PSORIASIS (3 patients)

#### 7. James Miller - Moderate Psoriasis on Biologic Therapy
- **ID:** `demo-psoriasis-001`
- **Age:** 52 years old (DOB: 1972-04-18)
- **Insurance:** Blue Cross Blue Shield Federal
- **Allergies:** None known
- **Current Medications:** Humira 40mg subQ every 2 weeks, Clobetasol 0.05% foam PRN, Vitamin D
- **Diagnosis:** Psoriasis vulgaris, moderate, on biologic therapy (L40.0)
- **History:** Moderate plaque psoriasis x 15 years (25% BSA at worst). Failed topicals and phototherapy. Started Humira 18 months ago with excellent response (now <5% BSA).
- **Special Requirements:**
  - **PRIOR AUTHORIZATION** for Humira (renewed annually)
  - Currently approved through January 2025
  - Pending task: Submit PA renewal in 2 weeks
- **Clinical Notes:** Excellent response to biologic therapy. No psoriatic arthritis.

#### 8. Patricia Brown - Psoriatic Arthritis
- **ID:** `demo-psoriasis-002`
- **Age:** 38 years old (DOB: 1986-12-03)
- **Insurance:** Kaiser Permanente
- **Allergies:** Shellfish (anaphylaxis)
- **Current Medications:** Cosentyx 300mg subQ monthly, Methotrexate 15mg weekly, Folic acid, Halobetasol ointment
- **Diagnosis:** Psoriatic arthritis with skin involvement (L40.50)
- **History:** Psoriatic arthritis diagnosed 3 years ago (12% BSA skin involvement). Joint pain in hands and feet.
- **Special Requirements:** **NEEDS RHEUMATOLOGY REFERRAL** for co-management
- **Clinical Notes:** Good skin and joint response to combination therapy.

#### 9. Michael Davis - Scalp Psoriasis
- **ID:** `demo-psoriasis-003`
- **Age:** 44 years old (DOB: 1980-08-25)
- **Insurance:** Anthem Blue Cross
- **Allergies:** None known
- **Current Medications:** Clobetasol 0.05% solution BID, Ketoconazole 2% shampoo, Coal tar shampoo
- **Diagnosis:** Scalp psoriasis (L40.0)
- **History:** Scalp psoriasis x 8 years. Thick plaques causing significant flaking and social embarrassment. Minimal body involvement.
- **Clinical Notes:** Good response to topical therapy. Requires ongoing maintenance.

---

### SKIN CANCER / SUSPICIOUS LESIONS (4 patients)

#### 10. William Thompson - Melanoma History (Quarterly Surveillance)
- **ID:** `demo-cancer-001`
- **Age:** 72 years old (DOB: 1952-06-10)
- **Insurance:** Medicare Part B + Medigap Plan F
- **Allergies:** Morphine (severe nausea)
- **Current Medications:** Aspirin 81mg, Atorvastatin 40mg, Lisinopril 20mg, Fluorouracil 5% cream
- **Diagnosis:** Personal history of melanoma, currently NED (Z85.820)
- **History:**
  - Stage IB melanoma (left shoulder, wide local excision 2021, clear sentinel node)
  - NOW ON QUARTERLY FULL-BODY SKIN CHECKS
  - Multiple actinic keratoses
  - Significant sun exposure history (outdoor construction worker x 40 years)
- **Prior Visits:** 2 quarterly surveillance visits documented (July, October 2024)
- **Clinical Notes:** No evidence of disease. Continue quarterly surveillance.

#### 11. Barbara Anderson - Multiple BCCs (Mohs Surgery Patient)
- **ID:** `demo-cancer-002`
- **Age:** 65 years old (DOB: 1959-03-22)
- **Insurance:** Medicare + AARP Supplement
- **Allergies:** Adhesive tape (contact dermatitis)
- **Current Medications:** Warfarin 5mg daily, Metoprolol 50mg BID, Imiquimod 5% cream
- **Diagnosis:** Multiple BCCs, s/p Mohs surgery (C44.311)
- **History:**
  - 8 basal cell carcinomas over past 10 years
  - Most recent: right nasal ala BCC, Mohs surgery 3 months ago (2-stage repair)
  - Healed well
  - On warfarin for AFib (**HOLD FOR PROCEDURES**)
- **Clinical Notes:** Quarterly surveillance. History of extensive sun exposure.

#### 12. Richard Taylor - New Suspicious Mole (**BIOPSY PENDING**)
- **ID:** `demo-cancer-003`
- **Age:** 58 years old (DOB: 1966-11-15)
- **Insurance:** United Healthcare PPO
- **Allergies:** Iodine (hives)
- **Current Medications:** Hydrochlorothiazide 25mg daily
- **Diagnosis:** Atypical nevus, biopsy pending, rule out melanoma (D22.5)
- **History:**
  - New patient presenting with concerning pigmented lesion on upper back
  - 7mm irregular borders, color variation
  - **BIOPSY PERFORMED TODAY - AWAITING PATHOLOGY**
  - Family history: father had melanoma age 65
- **Pending Tasks:**
  - Call patient with biopsy results in 7-10 days
  - May need wide local excision +/- SLNB depending on pathology
- **Clinical Notes:** Patient anxious about results. High suspicion for melanoma.

#### 13. Susan Martinez - Multiple Actinic Keratoses
- **ID:** `demo-cancer-004`
- **Age:** 49 years old (DOB: 1975-07-30)
- **Insurance:** Cigna PPO
- **Allergies:** None known
- **Current Medications:** Levothyroxine 75mcg daily
- **Diagnosis:** Multiple actinic keratoses, field treatment (L57.0)
- **History:** Multiple AKs on face, scalp, dorsal hands. Field cancerization from chronic sun damage (avid golfer x 20 years).
- **Scheduled Procedure:** **LIQUID NITROGEN CRYOTHERAPY TODAY** for 15+ lesions
- **Clinical Notes:** Previous fluorouracil cream (poor compliance due to irritation). Field treatment approach.

---

### COSMETIC (3 patients)

#### 14. Jennifer White - Botox/Filler Patient
- **ID:** `demo-cosmetic-001`
- **Age:** 42 years old (DOB: 1982-02-14)
- **Insurance:** Self-pay (cosmetic)
- **Allergies:** None known
- **Current Medications:** None
- **Diagnosis:** Cosmetic - dynamic facial rhytids (L90.8)
- **History:**
  - Regular Botox patient x 5 years
  - Treats: Glabellar lines, forehead, crow's feet
  - Last treatment 4 months ago
  - Also receives HA filler (Juvederm) in nasolabial folds annually
- **Special Requirements:** **BEFORE/AFTER PHOTO DOCUMENTATION** requested
- **Clinical Notes:** Very satisfied with results. No complications history.

#### 15. Amanda Garcia - Melasma (Laser Treatment)
- **ID:** `demo-cosmetic-002`
- **Age:** 35 years old (DOB: 1989-09-05)
- **Insurance:** Self-pay (cosmetic)
- **Allergies:** None known
- **Current Medications:** Hydroquinone 4% cream, Tretinoin 0.05% cream, Vitamin C serum
- **Diagnosis:** Melasma of face (L81.1)
- **History:** Melasma x 3 years, worse after second pregnancy. Hyperpigmentation on cheeks and upper lip.
- **Treatment Plan:**
  - Currently on triple combination therapy
  - **SCHEDULED FOR SERIES OF IPL TREATMENTS**
  - Fitzpatrick III skin type
- **Clinical Notes:** Sun protection counseling provided. Requires ongoing maintenance.

#### 16. Christopher Lee - Rosacea + Cosmetic Concerns
- **ID:** `demo-cosmetic-003`
- **Age:** 50 years old (DOB: 1974-04-12)
- **Insurance:** Blue Cross (medical), self-pay for cosmetic
- **Allergies:** None known
- **Current Medications:** Metronidazole 0.75% gel BID, Ivermectin 1% cream, Doxycycline 40mg daily
- **Diagnosis:** Rosacea with cosmetic concerns (L71.9)
- **History:** Rosacea x 8 years with erythema and inflammatory papules/pustules. Triggers: alcohol, spicy food, stress.
- **Treatment Plan:**
  - Medical management: Good control with current regimen
  - **CONSIDERING LASER THERAPY (VBeam)** for persistent erythema and telangiectasias
- **Clinical Notes:** Combination medical/cosmetic approach.

---

### COMMON CONDITIONS (6 patients)

#### 17. David Wilson - Plantar Warts (Cryotherapy Series)
- **ID:** `demo-common-001`
- **Age:** 33 years old (DOB: 1991-01-20)
- **Insurance:** Kaiser Permanente
- **Allergies:** None known
- **Current Medications:** None
- **Diagnosis:** Verruca plantaris, multiple, bilateral (B07.0)
- **History:** Multiple plantar warts x 6 months. Failed OTC salicylic acid.
- **Treatment:** **CURRENTLY ON VISIT 3 OF 4** for liquid nitrogen cryotherapy series
- **Clinical Notes:** Warts decreasing in size but not fully resolved. May need additional treatments.

#### 18. Michelle Clark - Alopecia Areata (Steroid Injections)
- **ID:** `demo-common-002`
- **Age:** 27 years old (DOB: 1997-06-18)
- **Insurance:** Anthem Blue Cross
- **Allergies:** None known
- **Current Medications:** Biotin 5000mcg daily
- **Diagnosis:** Alopecia areata, patchy (L63.9)
- **History:** Two patches on scalp (right temporal, occipital) diagnosed 4 months ago.
- **Treatment:** **RECEIVING INTRALESIONAL TRIAMCINOLONE INJECTIONS MONTHLY**
- **Progress:** Temporal patch showing regrowth. Occipital patch stable.
- **Clinical Notes:** Patient anxious about progression. Labs: thyroid function normal, ANA negative.

#### 19. Kevin Brown - Seborrheic Dermatitis
- **ID:** `demo-common-003`
- **Age:** 19 years old (DOB: 2005-10-30)
- **Insurance:** Parents' United Healthcare plan
- **Allergies:** None known
- **Current Medications:** Ketoconazole 2% shampoo twice weekly
- **Diagnosis:** Seborrheic dermatitis (L21.9)
- **History:** Seborrheic dermatitis of scalp and face x 1 year. Scaling on scalp, eyebrows, nasolabial folds. Worse in winter.
- **Clinical Notes:** Good response to ketoconazole. Occasional hydrocortisone 1% for face.

#### 20. Lisa Johnson - Rosacea (Topical Management)
- **ID:** `demo-common-004`
- **Age:** 55 years old (DOB: 1969-03-08)
- **Insurance:** Aetna PPO
- **Allergies:** Sulfa drugs (hives)
- **Current Medications:** Metronidazole 0.75% gel, Azelaic acid 15% gel, Doxycycline 40mg daily
- **Diagnosis:** Rosacea, mixed type (L71.9)
- **History:** Rosacea (erythematotelangiectatic + papulopustular) x 10 years. Good control with current regimen.
- **Triggers:** Hot beverages, stress, exercise
- **Clinical Notes:** Uses gentle skincare, high SPF sunscreen.

#### 21. Brian Smith - Tinea Corporis (Ringworm)
- **ID:** `demo-common-005`
- **Age:** 41 years old (DOB: 1983-07-14)
- **Insurance:** Self-pay
- **Allergies:** None known
- **Current Medications:** Terbinafine 1% cream BID
- **Diagnosis:** Tinea corporis (B35.4)
- **History:** Ringworm on trunk and arms acquired from wrestling practice 3 weeks ago. Classic annular lesions.
- **Clinical Notes:** Good response to topical antifungal. Avoiding contact sports until resolved.

#### 22. Nancy Taylor - Seborrheic Keratoses (Cosmetic Removal)
- **ID:** `demo-common-006`
- **Age:** 62 years old (DOB: 1962-12-25)
- **Insurance:** Medicare Part B
- **Allergies:** None known
- **Current Medications:** Metformin 1000mg BID, Amlodipine 5mg daily
- **Diagnosis:** Seborrheic keratosis, multiple (L82.1)
- **History:** Multiple seborrheic keratoses on trunk and face. Requesting cosmetic removal of prominent facial lesions.
- **Procedure:** **SCHEDULED FOR CRYOTHERAPY** of 5-6 facial SKs (self-pay)
- **Clinical Notes:** Benign lesions confirmed. Patient understands cosmetic removal is self-pay.

---

### COMPLEX CASES (3 patients)

#### 23. Daniel Perry - Multiple Conditions (Psoriasis + Skin Cancer + Cosmetic)
- **ID:** `demo-complex-001`
- **Age:** 48 years old (DOB: 1976-05-03)
- **Insurance:** Blue Cross Blue Shield PPO
- **Allergies:** None known
- **Current Medications:** Stelara 90mg subQ every 12 weeks, Clobetasol foam PRN, Fluorouracil 5% cream
- **Diagnoses:**
  1. Moderate plaque psoriasis (L40.0) - well-controlled on Stelara
  2. History of BCC (left cheek, excision 2019)
  3. Multiple actinic keratoses requiring field treatment
  4. Interested in cosmetic procedures for aging skin
- **Special Requirements:**
  - Prior authorization for Stelara renewed annually
  - Comprehensive approach needed for medical + cosmetic
- **Clinical Notes:** Complex patient requiring coordination of multiple treatment modalities.

#### 24. Carol Williams - Elderly with Polypharmacy and Fragile Skin
- **ID:** `demo-complex-002`
- **Age:** 71 years old (DOB: 1953-08-16)
- **Insurance:** Medicare + Medicaid dual eligible
- **Allergies:** Penicillin (anaphylaxis), Codeine (confusion), **Multiple drug sensitivities**
- **Current Medications:** Warfarin 3mg, Digoxin 0.125mg, Furosemide 40mg BID, Potassium, Triamcinolone 0.1% cream, CeraVe (12 medications total)
- **Diagnoses:**
  1. Chronic stasis dermatitis with recurrent cellulitis (I87.2)
  2. Fragile skin - multiple skin tears
  3. Polypharmacy with drug allergies
- **Special Considerations:**
  - **ON WARFARIN** - requires coordination for any procedures
  - Lives alone, compliance issues
  - Limited mobility
  - Requires coordination with PCP and cardiology
- **Clinical Notes:** Requires gentle approach, careful medication selection. High-risk patient.

#### 25. Steven Moore - HIV+ with Kaposi Sarcoma History
- **ID:** `demo-complex-003`
- **Age:** 39 years old (DOB: 1985-09-27)
- **Insurance:** Medicaid (Colorado)
- **Allergies:** **Sulfa drugs (Stevens-Johnson syndrome - DOCUMENTED)**
- **Current Medications:** Biktarvy (HIV regimen), TMP-SMX (PCP prophylaxis), Fluconazole PRN, Triamcinolone 0.1%
- **Diagnoses:**
  1. HIV (B20) - diagnosed 2015, currently undetectable viral load, CD4 850
  2. History of Kaposi sarcoma (oral lesions 2018, treated and resolved)
  3. Current: Seborrheic dermatitis and folliculitis
- **Special Considerations:**
  - Immunocompetent on current ART
  - Close monitoring required
  - **History of severe sulfa allergy limits antibiotic options**
- **Clinical Notes:** Requires careful attention to drug interactions with ART. Monitor for opportunistic infections.

---

## Sample Day Schedule (Tomorrow)

15 patients scheduled from 8:00 AM to 5:30 PM:

1. **8:00 AM** - Sarah Chen (Acne follow-up) - 20 min
2. **8:30 AM** - Tommy Rodriguez (Eczema flare) - 30 min
3. **9:00 AM** - William Thompson (Skin cancer screening) - 30 min
4. **9:40 AM** - James Miller (Biologic follow-up) - 20 min
5. **10:10 AM** - Jennifer White (Botox treatment) - 45 min
6. **11:10 AM** - David Wilson (Wart cryotherapy visit 4/4) - 20 min
7. **11:40 AM** - Marcus Johnson (Accutane consultation) - 30 min
8. **12:20 PM** - Susan Martinez (Cryotherapy for AKs) - 30 min
9. **1:00 PM** - Linda Park (Patch testing results) - 30 min
10. **1:40 PM** - Patricia Brown (Psoriatic arthritis follow-up) - 20 min
11. **2:10 PM** - Michelle Clark (Alopecia areata injections) - 20 min
12. **2:40 PM** - Amanda Garcia (Melasma - IPL treatment) - 30 min
13. **3:20 PM** - Barbara Anderson (Post-Mohs follow-up) - 20 min
14. **3:50 PM** - Daniel Perry (Complex case) - 30 min
15. **4:30 PM** - Nancy Taylor (SK removal) - 30 min

---

## Pending Tasks

1. **Call patient with biopsy results** - Richard Taylor (melanoma r/o) - Due in 7 days
2. **Review baseline labs** - Marcus Johnson (Accutane) - Due in 2 days
3. **Submit Humira PA renewal** - James Miller - Due in 14 days
4. **Coordinate care/warfarin management** - Carol Williams - Due in 3 days

---

## Pending Orders

### Lab Orders
- **Marcus Johnson** (demo-acne-002):
  - Complete Blood Count (CBC)
  - Comprehensive Metabolic Panel (CMP)
  - Lipid Panel
  - Status: Pending
  - Indication: Baseline labs for isotretinoin therapy

### Prior Authorizations
- **James Miller** (demo-psoriasis-001):
  - Medication: Humira (Adalimumab) 40mg
  - Status: Approved (expires January 2025)
  - Insurance: Blue Cross Blue Shield Federal

- **Marcus Johnson** (demo-acne-002):
  - Medication: Isotretinoin (Accutane) 40mg
  - Status: Pending
  - Insurance: United Healthcare

---

## Key Clinical Workflows Demonstrated

1. **iPLEDGE Program** - Marcus Johnson (Accutane patient)
2. **Prior Authorizations** - James Miller (Humira), Marcus Johnson (Isotretinoin)
3. **Biologic Therapy** - James Miller (Humira), Patricia Brown (Cosentyx)
4. **Skin Cancer Surveillance** - William Thompson (melanoma history quarterly checks)
5. **Mohs Surgery** - Barbara Anderson (multiple BCCs)
6. **Biopsy Tracking** - Richard Taylor (pending pathology results)
7. **Cryotherapy Series** - David Wilson (warts - visit 3/4)
8. **Cosmetic Procedures** - Jennifer White (Botox/filler), Amanda Garcia (IPL)
9. **Complex Medical Management** - Carol Williams (polypharmacy + warfarin)
10. **Immunocompromised Patients** - Steven Moore (HIV+)
11. **Pediatric Care** - Tommy Rodriguez (age 4, atopic dermatitis)
12. **Geriatric Care** - Multiple Medicare patients with comorbidities
13. **Patch Testing** - Linda Park (contact dermatitis)
14. **Intralesional Injections** - Michelle Clark (alopecia areata)
15. **Field Treatment** - Susan Martinez (multiple AKs)

---

## Insurance Coverage Represented

- Medicare (with various supplements: Medigap, AARP)
- Medicaid (Colorado)
- Medicare + Medicaid dual eligible
- Anthem Blue Cross Blue Shield
- United Healthcare (various plans)
- Cigna PPO
- Kaiser Permanente
- Aetna (HMO and PPO)
- Blue Cross Blue Shield Federal
- Self-pay

---

## Allergen Tracking Examples

- **Drug Allergies:** Penicillin (anaphylaxis), Sulfa drugs (rash, SJS), Codeine, Morphine, Iodine
- **Contact Allergens:** Latex, Adhesive tape, Nickel, Fragrance mix
- **Food Allergies:** Peanuts, Tree nuts, Eggs, Shellfish
- **Complex Allergy Profiles:** Carol Williams (multiple drug sensitivities)

---

## This demo database is ideal for testing:

- ✅ Appointment scheduling and workflow
- ✅ Clinical documentation and note templates
- ✅ Prescription management and ePrescribing
- ✅ Prior authorization workflows
- ✅ Lab order tracking and results
- ✅ Biopsy tracking and follow-up
- ✅ Procedure documentation (cryotherapy, injections, biopsies)
- ✅ Cosmetic procedure tracking with photo documentation
- ✅ Complex patient management
- ✅ Pediatric and geriatric workflows
- ✅ Insurance billing (medical vs cosmetic)
- ✅ Medication safety (allergy checking, drug interactions)
- ✅ Patient portal messaging and education
- ✅ Task management and care coordination
- ✅ Dermatology-specific ICD-10 and CPT coding
