# Cosmetic Provider Quick Reference

## New Cosmetic PA Provider

**Sarah Mitchell, PA-C**
- **Provider ID:** `prov-cosmetic-pa`
- **NPI:** 4567890123
- **Specialty:** Cosmetic Dermatology
- **Schedule:** Monday-Friday, 9:00 AM - 6:00 PM

## Cosmetic Appointment Types

| ID | Name | Duration |
|----|------|----------|
| `appttype-cosmetic-consult` | Cosmetic Consultation | 45 min |
| `appttype-botox` | Botox/Filler | 30 min |
| `appttype-cosmetic-proc` | Cosmetic Procedure | 60 min |

## Common Cosmetic CPT Codes

### Most Frequently Used

| Code | Procedure | Price |
|------|-----------|-------|
| 64650 | Botox - both axillae | $750.00 |
| 64653 | Botox - other area | $600.00 |
| 15788 | Chemical peel, facial (epidermal) | $300.00 |
| 17360 | Chemical exfoliation for acne | $120.00 |
| 17106 | Laser treatment, small (<10 sq cm) | $350.00 |
| 36468 | Spider vein injections | $350.00 |
| 96567 | Photodynamic therapy (PDT) | $850.00 |

### Other Procedures

| Code | Procedure | Price |
|------|-----------|-------|
| 15789 | Chemical peel, facial (dermal) | $250.00 |
| 17107 | Laser treatment, medium (10-50 sq cm) | $550.00 |
| 96920 | Laser treatment (<250 sq cm) | $285.00 |
| 96921 | Laser treatment (250-500 sq cm) | $385.00 |
| 15780 | Dermabrasion, total face | $1,500.00 |
| 67346 | Blepharoplasty (upper eyelid) | $2,500.00 |

## All Providers in System

1. **Dr. David Skin, MD, FAAD** - General Dermatology
2. **Riley Johnson, PA-C** - General Dermatology
3. **Dr. Maria Martinez, MD, FAAD** - General & Medical Dermatology
4. **Sarah Mitchell, PA-C** - **Cosmetic Dermatology** ⭐

## Quick SQL Queries

### Check provider schedule
```sql
SELECT * FROM provider_availability
WHERE provider_id = 'prov-cosmetic-pa'
ORDER BY day_of_week;
```

### View cosmetic appointments
```sql
SELECT
  a.scheduled_start,
  at.name as appointment_type,
  pat.first_name || ' ' || pat.last_name as patient
FROM appointments a
JOIN appointment_types at ON a.appointment_type_id = at.id
JOIN patients pat ON a.patient_id = pat.id
WHERE a.provider_id = 'prov-cosmetic-pa'
ORDER BY a.scheduled_start;
```

### List all cosmetic CPT codes
```sql
SELECT code, description, default_fee_cents/100.0 as price
FROM cpt_codes
WHERE category IN (
  'Botox/Neurotoxin', 'Chemical Peel', 'Laser Treatment',
  'Dermabrasion', 'Sclerotherapy', 'PDT', 'Cosmetic Surgery'
)
ORDER BY category, code;
```

## Testing the Setup

Run the verification script:
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
node verify-cosmetic-setup.js
```

## Notes

- All cosmetic procedures are typically **cash-pay** (not covered by insurance)
- Prices can be adjusted in the `cpt_codes` table
- Provider can be scheduled for any appointment type, but specializes in cosmetic procedures
- Standard dermatology appointment types can also be used with this provider
