# Demo Patients Quick Reference Card

## Priority Patients (Action Required)

### 🚨 URGENT - Results Pending
**Richard Taylor** (`demo-cancer-003`)
- Age 58, suspicious mole biopsy **PENDING**
- Call with results in 7 days
- May need WLE +/- SLNB if melanoma

### 📋 Labs Needed
**Marcus Johnson** (`demo-acne-002`)
- Age 22, severe acne
- Baseline labs for Accutane (CBC, CMP, lipids)
- **Needs iPLEDGE enrollment**

### 📄 Prior Auth Expiring
**James Miller** (`demo-psoriasis-001`)
- Age 52, on Humira for psoriasis
- PA expires Jan 2025 - renewal due in 2 weeks

---

## Tomorrow's Schedule Highlights

### Morning (8:00 AM - 12:00 PM)
- 8:00 - Sarah Chen (Teen acne follow-up)
- 8:30 - Tommy Rodriguez (4yo eczema flare)
- 9:00 - William Thompson (72yo melanoma surveillance)
- 10:10 - Jennifer White (Botox - needs photos)
- 11:40 - Marcus Johnson (Accutane consult)

### Afternoon (12:00 PM - 5:30 PM)
- 12:20 - Susan Martinez (Cryo for 15+ AKs)
- 1:00 - Linda Park (Patch test results)
- 2:10 - Michelle Clark (Alopecia injections)
- 2:40 - Amanda Garcia (IPL for melasma)
- 3:50 - Daniel Perry (Complex: psoriasis + skin ca + cosmetic)

---

## Patient ID Quick Lookup

### Acne
- `demo-acne-001` - Sarah Chen (16F, moderate acne)
- `demo-acne-002` - Marcus Johnson (22M, severe/Accutane)
- `demo-acne-003` - Emma Wilson (28F, hormonal acne)

### Eczema/Dermatitis
- `demo-eczema-001` - Tommy Rodriguez (4M, pediatric AD)
- `demo-eczema-002` - Linda Park (45F, contact dermatitis)
- `demo-eczema-003` - Robert Kim (67M, chronic hand eczema)

### Psoriasis
- `demo-psoriasis-001` - James Miller (52M, on Humira)
- `demo-psoriasis-002` - Patricia Brown (38F, psoriatic arthritis)
- `demo-psoriasis-003` - Michael Davis (44M, scalp psoriasis)

### Skin Cancer
- `demo-cancer-001` - William Thompson (72M, melanoma hx)
- `demo-cancer-002` - Barbara Anderson (65F, multiple BCCs)
- `demo-cancer-003` - Richard Taylor (58M, biopsy pending)
- `demo-cancer-004` - Susan Martinez (49F, multiple AKs)

### Cosmetic
- `demo-cosmetic-001` - Jennifer White (42F, Botox/filler)
- `demo-cosmetic-002` - Amanda Garcia (35F, melasma/IPL)
- `demo-cosmetic-003` - Christopher Lee (50M, rosacea+cosmetic)

### Common Conditions
- `demo-common-001` - David Wilson (33M, warts)
- `demo-common-002` - Michelle Clark (27F, alopecia areata)
- `demo-common-003` - Kevin Brown (19M, seb derm)
- `demo-common-004` - Lisa Johnson (55F, rosacea)
- `demo-common-005` - Brian Smith (41M, ringworm)
- `demo-common-006` - Nancy Taylor (62F, SKs)

### Complex Cases
- `demo-complex-001` - Daniel Perry (48M, multiple conditions)
- `demo-complex-002` - Carol Williams (71F, elderly+polypharmacy)
- `demo-complex-003` - Steven Moore (39M, HIV+)

---

## Special Alerts

### ⚠️ Medication Safety
- **Carol Williams** - Penicillin (anaphylaxis), Codeine, multiple sensitivities
- **Steven Moore** - Sulfa (Stevens-Johnson syndrome)
- **Barbara Anderson** - ON WARFARIN (hold before procedures)
- **Marcus Johnson** - Sulfa drugs (rash)

### 🩹 Contact Allergens
- **Linda Park** - Nickel, Fragrance, Adhesive tape (patch test proven)
- **Emma Wilson** - Latex
- **Robert Kim** - Penicillin (anaphylaxis)

### 👶 Pediatric
- **Tommy Rodriguez** - 4 years old, parent contact required
- Food allergies: peanuts, tree nuts, eggs

### 🔄 Ongoing Series
- **David Wilson** - Wart cryo (visit 3 of 4) - tomorrow is final treatment
- **Michelle Clark** - Monthly alopecia injections

### 💰 Self-Pay/Cosmetic
- Jennifer White - Botox/filler (self-pay)
- Amanda Garcia - IPL for melasma (self-pay)
- Nancy Taylor - SK removal (cosmetic, self-pay)
- Brian Smith - Self-pay (no insurance)

---

## Common ICD-10 Codes (in this demo)

- **L70.0** - Acne vulgaris
- **L70.1** - Acne conglobata (severe)
- **L20.9** - Atopic dermatitis
- **L23.9** - Allergic contact dermatitis
- **L40.0** - Psoriasis vulgaris
- **L40.50** - Psoriatic arthritis
- **C44.311** - Basal cell carcinoma
- **Z85.820** - Personal history of melanoma
- **L57.0** - Actinic keratosis
- **L71.9** - Rosacea
- **L63.9** - Alopecia areata
- **B07.0** - Verruca (warts)
- **B35.4** - Tinea corporis
- **L82.1** - Seborrheic keratosis

---

## Common Procedures Demonstrated

### Destructive
- **17000/17003** - Cryotherapy (AKs, warts, SKs)
- **11100** - Skin biopsy (Richard Taylor - done today)

### Office Visits
- **99203** - New patient, level 3 (30 min)
- **99213** - Established patient, level 3 (20 min)
- **99214** - Established patient, level 4 (30 min)

---

## Run the Demo

```bash
cd backend
npm run seed:demo
```

## Key Features Demonstrated

1. **iPLEDGE workflow** - Marcus Johnson (Accutane)
2. **Prior authorizations** - James Miller (Humira), Marcus Johnson (Accutane)
3. **Biologic therapy** - James Miller (Humira), Patricia Brown (Cosentyx)
4. **Skin cancer surveillance** - William Thompson (quarterly)
5. **Mohs surgery** - Barbara Anderson
6. **Biopsy tracking** - Richard Taylor (pending results)
7. **Cosmetic procedures** - Jennifer White, Amanda Garcia
8. **Complex patients** - Carol Williams, Daniel Perry, Steven Moore
9. **Pediatric care** - Tommy Rodriguez
10. **Geriatric care** - Multiple Medicare patients

---

## Full Documentation

See [DEMO-PATIENTS.md](./DEMO-PATIENTS.md) for complete patient details including:
- Detailed medical histories
- Visit notes with clinical reasoning
- Treatment plans and medications
- Insurance information
- Pending tasks and orders
