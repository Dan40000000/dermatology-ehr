# Demo Seed Script

## Quick Start

Run the demo seed script to populate the database with 25 realistic dermatology patients:

```bash
cd backend
npm run seed:demo
```

## What This Script Creates

### 25 Realistic Dermatology Patients

Organized by condition category:

- **Acne (3 patients)**: Teen moderate acne, severe cystic/Accutane candidate, adult hormonal
- **Eczema/Dermatitis (3)**: Pediatric atopic dermatitis, contact dermatitis, chronic hand eczema
- **Psoriasis (3)**: Biologic therapy, psoriatic arthritis, scalp psoriasis
- **Skin Cancer/Suspicious Lesions (4)**: Melanoma history, multiple BCCs, biopsy pending, actinic keratoses
- **Cosmetic (3)**: Botox/filler, melasma/laser, rosacea+cosmetic
- **Common Conditions (6)**: Warts, alopecia areata, seborrheic dermatitis, rosacea, ringworm, seborrheic keratoses
- **Complex Cases (3)**: Multiple conditions, elderly+polypharmacy, HIV+

### Clinical Data

For each patient:

- Complete demographics and contact information
- Realistic medical history matching their diagnosis
- Appropriate allergies (latex, adhesives, common medications)
- Current medications matching their conditions
- Insurance information (Medicare, Medicaid, commercial plans, self-pay)

### Visit History

- **Past encounters** with detailed clinical notes for select patients
- Examples: Sarah Chen (3 acne follow-ups), William Thompson (2 melanoma surveillance visits), Marcus Johnson (Accutane consultation)
- Realistic chief complaints, HPI, exam findings, assessment/plan
- Proper ICD-10 and CPT coding

### Active Orders

- **Prescriptions**: Tretinoin, Spironolactone, Humira (biologic)
- **Prior Authorizations**:
  - Approved: Humira for James Miller (expires Jan 2025)
  - Pending: Isotretinoin for Marcus Johnson
- **Lab Orders**: Baseline labs for Accutane patient (CBC, CMP, lipids)

### Sample Day Schedule

15 appointments scheduled for **tomorrow** from 8 AM to 5:30 PM:

- Mix of new visits, follow-ups, and procedures
- Realistic appointment types and durations
- Demonstrates full day workflow

### Pending Tasks

Clinical task list demonstrating workflows:

1. Call patient with biopsy results (melanoma rule-out)
2. Review baseline labs for Accutane patient
3. Submit Humira prior authorization renewal
4. Coordinate warfarin management for procedure

## Use Cases

This demo database is perfect for testing:

- ✅ **Appointment scheduling** - Full day schedule with realistic mix
- ✅ **Clinical documentation** - Encounter notes with proper medical terminology
- ✅ **ePrescribing** - Active prescriptions for common derm medications
- ✅ **Prior authorizations** - Biologic therapy workflow (Humira, Accutane)
- ✅ **Lab integration** - Pending orders for Accutane baseline labs
- ✅ **Procedure tracking** - Cryotherapy series, injections, biopsies
- ✅ **Photo documentation** - Cosmetic patients (Botox, before/after)
- ✅ **Insurance billing** - Medical vs cosmetic procedures
- ✅ **Complex patients** - Polypharmacy, immunocompromised, multiple conditions
- ✅ **Age range workflows** - Pediatric (4yo) to geriatric (72yo)
- ✅ **Safety features** - Allergy checking, drug interactions
- ✅ **Care coordination** - Rheumatology referrals, PCP communication

## Special Patient Flags

### Requires Immediate Action

- **Richard Taylor** (demo-cancer-003): Biopsy pending - CALL WITH RESULTS in 7 days
- **Marcus Johnson** (demo-acne-002): Needs iPLEDGE enrollment for Accutane
- **James Miller** (demo-psoriasis-001): Prior auth renewal due in 2 weeks

### Special Considerations

- **Barbara Anderson** (demo-cancer-002): ON WARFARIN - hold before procedures
- **Carol Williams** (demo-complex-002): Multiple drug allergies, fragile skin
- **Steven Moore** (demo-complex-003): HIV+, Stevens-Johnson syndrome history with sulfa
- **Tommy Rodriguez** (demo-eczema-001): Pediatric - parent communication required
- **Linda Park** (demo-eczema-002): Needs patch testing scheduled

### Scheduled Procedures Tomorrow

- David Wilson: Wart cryotherapy (visit 4/4 - final treatment)
- Jennifer White: Botox treatment (regular patient)
- Susan Martinez: Field cryotherapy for 15+ actinic keratoses
- Michelle Clark: Intralesional steroid injections for alopecia
- Nancy Taylor: Cosmetic SK removal (self-pay)

## Files Created

1. **demo-seed.ts** - Main seed script
2. **DEMO-PATIENTS.md** - Complete patient documentation (this file)
3. **README-DEMO-SEED.md** - Quick start guide

## Technical Details

The script:

- Uses transactions (BEGIN/COMMIT) for data integrity
- Handles conflicts with `ON CONFLICT DO NOTHING` or `DO UPDATE`
- Generates realistic UUIDs for all records
- Sets proper foreign key relationships
- Creates data for tomorrow's schedule (dynamic dates)
- Includes proper ICD-10 and CPT codes
- Demonstrates dermatology-specific workflows

## Resetting the Demo Data

To re-run the demo seed:

```bash
# The script uses ON CONFLICT clauses, so it's safe to re-run
npm run seed:demo
```

To completely reset and start fresh:

```bash
# Reset database (be careful - this deletes ALL data)
npm run db:migrate  # Re-run migrations
npm run seed:demo   # Populate with demo data
```

## Patient Details

For complete information about each patient including:
- Full medical histories
- Current medications and allergies
- Visit notes and treatment plans
- Insurance coverage
- Pending orders and tasks

See: [DEMO-PATIENTS.md](./DEMO-PATIENTS.md)

## Support

Questions or issues? The demo patients are designed to be realistic and cover common dermatology workflows. Each patient has:

- Clinically accurate diagnoses
- Appropriate medications for their conditions
- Realistic insurance coverage
- Age-appropriate presentations
- Proper medical terminology in notes

The data is extensive enough to test all major EHR features while remaining focused on dermatology-specific needs.
