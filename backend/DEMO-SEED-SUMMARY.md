# Demo Seed Script - Summary

## What Was Created

A comprehensive demo seed script (`backend/src/db/demo-seed.ts`) that populates your dermatology EHR with **25 realistic patients** representing actual clinical scenarios you'll encounter in a dermatology practice.

## Files Created

1. **backend/src/db/demo-seed.ts** (45KB)
   - Main seed script with full patient data
   - Past encounters with clinical notes
   - Prescriptions and prior authorizations
   - Lab orders and pending tasks
   - Sample day schedule

2. **backend/src/db/DEMO-PATIENTS.md** (21KB)
   - Complete documentation of all 25 patients
   - Detailed medical histories
   - Clinical workflows demonstrated
   - Full reference guide

3. **backend/src/db/README-DEMO-SEED.md** (5.7KB)
   - Quick start guide
   - Usage instructions
   - Technical details

4. **backend/src/db/QUICK-REFERENCE.md**
   - Patient ID lookup
   - Priority patients
   - Tomorrow's schedule
   - Common codes

5. **backend/package.json** (updated)
   - Added `"seed:demo"` npm script

## How to Run

```bash
cd backend
npm run seed:demo
```

## What Gets Created

### 25 Patients by Category

**Acne (3):**
- Sarah Chen, 16F - Teen moderate acne, on tretinoin, 3 prior visits
- Marcus Johnson, 22M - Severe cystic, Accutane candidate (needs iPLEDGE)
- Emma Wilson, 28F - Adult hormonal acne, on spironolactone

**Eczema/Dermatitis (3):**
- Tommy Rodriguez, 4M - Pediatric atopic dermatitis
- Linda Park, 45F - Contact dermatitis, needs patch testing
- Robert Kim, 67M - Chronic hand eczema

**Psoriasis (3):**
- James Miller, 52M - On Humira (biologic), prior auth needed
- Patricia Brown, 38F - Psoriatic arthritis, needs rheum referral
- Michael Davis, 44M - Scalp psoriasis

**Skin Cancer / Suspicious (4):**
- William Thompson, 72M - Melanoma history, quarterly checks
- Barbara Anderson, 65F - Multiple BCCs, Mohs patient
- Richard Taylor, 58M - NEW suspicious mole, BIOPSY PENDING
- Susan Martinez, 49F - Multiple AKs, scheduled for cryo

**Cosmetic (3):**
- Jennifer White, 42F - Botox/filler, needs photo tracking
- Amanda Garcia, 35F - Melasma, laser treatment
- Christopher Lee, 50M - Rosacea + cosmetic concerns

**Common Conditions (6):**
- David Wilson, 33M - Warts, cryo series (visit 3/4)
- Michelle Clark, 27F - Alopecia areata, steroid injections
- Kevin Brown, 19M - Seborrheic dermatitis
- Lisa Johnson, 55F - Rosacea, topical management
- Brian Smith, 41M - Tinea corporis (ringworm)
- Nancy Taylor, 62F - Seborrheic keratoses, cosmetic removal

**Complex Cases (3):**
- Daniel Perry, 48M - Psoriasis + skin cancer history + cosmetic
- Carol Williams, 71F - Multiple conditions, polypharmacy, fragile skin
- Steven Moore, 39M - HIV+, Kaposi sarcoma history

### Additional Clinical Data

- **10 past encounters** with detailed visit notes
- **3 active prescriptions** (Tretinoin, Spironolactone, Humira)
- **2 prior authorizations** (1 approved, 1 pending)
- **3 pending lab orders** for Accutane patient
- **4 pending tasks** demonstrating care coordination
- **15 appointments** scheduled for tomorrow (8 AM - 5:30 PM)

## Key Workflows Demonstrated

1. **iPLEDGE Program** - Marcus Johnson (Accutane enrollment)
2. **Prior Authorizations** - James Miller (Humira renewal due)
3. **Biologic Therapy** - Multiple patients on biologics
4. **Skin Cancer Surveillance** - William Thompson (quarterly)
5. **Mohs Surgery** - Barbara Anderson (on warfarin)
6. **Biopsy Tracking** - Richard Taylor (RESULTS PENDING)
7. **Cryotherapy Series** - David Wilson (visit 3 of 4)
8. **Cosmetic Procedures** - Botox, IPL, laser
9. **Complex Patients** - Polypharmacy, immunocompromised
10. **Pediatric Care** - 4-year-old with eczema
11. **Patch Testing** - Linda Park (occupational dermatitis)
12. **Intralesional Injections** - Michelle Clark (alopecia)
13. **Field Treatment** - Susan Martinez (15+ AKs)

## Priority Patients (Action Required)

### 🚨 URGENT
- **Richard Taylor** - Biopsy pending, call with results in 7 days

### 📋 Labs Needed
- **Marcus Johnson** - Baseline labs for Accutane (CBC, CMP, lipids)

### 📄 Prior Auth Expiring
- **James Miller** - Humira PA renewal due in 2 weeks

## Special Considerations

### Medication Safety Alerts
- **Carol Williams** - Multiple drug allergies including penicillin (anaphylaxis)
- **Steven Moore** - Sulfa drugs (Stevens-Johnson syndrome history)
- **Barbara Anderson** - ON WARFARIN (hold before procedures)

### Pediatric
- **Tommy Rodriguez** - 4 years old, parent communication required

### Self-Pay/Cosmetic
- Jennifer White, Amanda Garcia, Nancy Taylor (cosmetic procedures)
- Brian Smith (no insurance)

## Insurance Coverage Represented

- Medicare (with Medigap, AARP supplements)
- Medicaid (Colorado)
- Medicare + Medicaid dual eligible
- Anthem Blue Cross Blue Shield
- United Healthcare
- Cigna PPO
- Kaiser Permanente
- Aetna (HMO and PPO)
- Blue Cross Federal
- Self-pay

## Testing Use Cases

This demo database is ideal for testing:

- ✅ Appointment scheduling and workflow
- ✅ Clinical documentation and note templates
- ✅ Prescription management and ePrescribing
- ✅ Prior authorization workflows
- ✅ Lab order tracking and results
- ✅ Biopsy tracking and follow-up
- ✅ Procedure documentation (cryo, injections, biopsies)
- ✅ Cosmetic procedure tracking with photos
- ✅ Complex patient management
- ✅ Pediatric and geriatric workflows
- ✅ Insurance billing (medical vs cosmetic)
- ✅ Medication safety (allergy checking)
- ✅ Patient portal messaging
- ✅ Task management and care coordination
- ✅ Dermatology-specific ICD-10 and CPT coding

## Technical Details

- Uses PostgreSQL transactions for data integrity
- Handles conflicts gracefully (ON CONFLICT clauses)
- Generates realistic UUIDs
- Sets proper foreign key relationships
- Creates dynamic dates (tomorrow's schedule)
- Includes proper ICD-10 and CPT codes
- Safe to re-run (idempotent)

## Documentation

- **Quick Start**: See `backend/src/db/README-DEMO-SEED.md`
- **Full Patient Details**: See `backend/src/db/DEMO-PATIENTS.md`
- **Quick Reference**: See `backend/src/db/QUICK-REFERENCE.md`

## Next Steps

1. Run the seed script: `npm run seed:demo`
2. Log into the app and explore the patients
3. Try scheduling appointments with the demo patients
4. Review the pending tasks and orders
5. Test the clinical workflows (prescriptions, prior auths, etc.)

---

**Created:** January 19, 2025
**Patient Count:** 25 realistic dermatology patients
**Total Records:** 100+ (patients, encounters, appointments, prescriptions, tasks, labs)
