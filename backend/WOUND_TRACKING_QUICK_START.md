# Wound Tracking Quick Start

## Database Connection
Database: `postgresql://derm_user:derm_pass@localhost:5432/derm_db`

## Run Migration
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npx ts-node scripts/runMigration.ts 061_wound_tracking.sql
```

## Seed Sample Data
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npx ts-node scripts/seedWounds.ts
```

This creates:
- Post-Mohs surgical wound (healing well, 65% healed, right nose)
- Chronic venous leg ulcer (stalled, 20% healed, left lower leg)

## API Endpoints

### List All Wounds
```bash
GET /api/wounds?activeOnly=true
```

### Get Specific Wound Details
```bash
GET /api/wounds/{wound_id}
```
Returns wound with all assessments, healing metrics, and photos.

### Create New Wound
```bash
POST /api/wounds
Content-Type: application/json

{
  "patientId": "p-demo",
  "woundType": "surgical",
  "etiology": "Post-excision",
  "bodyRegion": "arm",
  "laterality": "left",
  "lengthCm": 3.0,
  "widthCm": 2.5,
  "areaCm2": 7.5,
  "woundBed": "granulation",
  "exudateAmount": "scant",
  "exudateType": "serous",
  "periwoundSkin": "healthy",
  "painLevel": 2,
  "currentDressing": "Non-adherent dressing",
  "dressingChangeFrequency": "daily",
  "onsetDate": "2026-01-15",
  "notes": "Clean surgical wound",
  "treatmentPlan": "Continue daily dressing changes"
}
```

### Add Wound Assessment
```bash
POST /api/wounds/{wound_id}/assessments
Content-Type: application/json

{
  "lengthCm": 2.8,
  "widthCm": 2.3,
  "areaCm2": 6.4,
  "woundBed": "granulation",
  "woundBedPercentage": {
    "granulation": 80,
    "epithelializing": 20
  },
  "exudateAmount": "scant",
  "periwoundSkin": "healthy",
  "painLevel": 1,
  "healingTrend": "improving",
  "healingPercentage": 35,
  "treatmentApplied": "Dressing change",
  "dressingApplied": "Non-adherent dressing",
  "cleaningSolution": "Normal saline",
  "providerNotes": "Wound healing well. Healthy granulation tissue present.",
  "nextAssessmentDate": "2026-01-22"
}
```

### Get Healing Metrics
```bash
GET /api/wounds/{wound_id}/healing-metrics
```
Returns:
- Days since onset
- Initial vs current area
- Area reduction (cm² and %)
- Average healing rate per week
- Assessment count

### Get Active Wounds for Patient
```bash
GET /api/wounds/patient/{patient_id}/active
```

### Update Wound Status
```bash
PUT /api/wounds/{wound_id}/status
Content-Type: application/json

{
  "status": "healed",
  "healedDate": "2026-01-19",
  "notes": "Wound fully epithelialized"
}
```

## Wound Types
- `surgical` - Post-surgical wounds (Mohs, excision, biopsy)
- `ulcer` - Chronic ulcers (venous, arterial, diabetic, pressure)
- `burn` - Burn injuries
- `laceration` - Traumatic wounds
- `pressure_injury` - Pressure ulcers/bedsores
- `other` - Other wound types

## Wound Status Values
- `open` - Newly documented wound
- `healing` - Showing improvement
- `healed` - Fully epithelialized
- `chronic` - Long-standing wound (>3 months)
- `stalled` - Not showing improvement
- `deteriorating` - Getting worse

## Healing Trends
- `improving` - Wound getting smaller/better
- `stable` - No change
- `declining` - Getting worse
- `stalled` - Not healing

## Database Tables
- `wounds` - Main wound records
- `wound_assessments` - Serial assessments
- `v_wound_overview` - Comprehensive view with latest data

## Database Functions
- `calculate_wound_healing_rate(wound_id)` - Healing metrics
- `get_active_wounds_for_patient(tenant_id, patient_id)` - Active wounds list
- `update_wound_status_on_assessment()` - Auto-updates wound on new assessment

## Access Control
- **Create/Update Wounds**: provider, nurse, ma, admin
- **View Wounds**: All authenticated users
- **Delete Wounds**: provider, admin only
- **Update Status**: provider, nurse, admin

## TypeScript Verification
```bash
cd backend
npx tsc --noEmit
```

## Sample Wound IDs (from seed)
Check the output from `seedWounds.ts` for the actual UUIDs generated.
