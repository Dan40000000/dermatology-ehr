# Wound Tracking System Implementation

## Overview
Complete wound tracking and healing progression monitoring system for the dermatology EHR.

## Database Schema

### Tables Created

#### 1. `wounds` Table
Tracks all patient wounds including surgical, chronic, and acute wounds.

**Key Fields:**
- `wound_type`: surgical, ulcer, burn, laceration, pressure_injury, other
- `etiology`: Underlying cause (e.g., post-Mohs surgery, diabetic, venous)
- `body_region`: Anatomical location
- `x_position`, `y_position`: Body map coordinates (0-100)
- **Measurements**: length_cm, width_cm, depth_cm, area_cm2
- **Clinical Assessment**:
  - wound_bed (granulation, slough, eschar, epithelializing, mixed, necrotic)
  - wound_bed_percentage (JSONB with tissue type percentages)
  - exudate_amount (none, scant, moderate, heavy)
  - exudate_type (serous, sanguineous, purulent, serosanguineous)
- **Periwound Condition**:
  - periwound_skin (healthy, macerated, erythematous, indurated, fragile, edematous)
  - undermining_present, tunneling_present
- **Clinical Signs**: infection_signs, pain_level (0-10), odor_present
- **Treatment**: current_dressing, dressing_change_frequency, debridement_needed
- **Status**: open, healing, healed, chronic, stalled, deteriorating
- **Dates**: onset_date, healed_date

#### 2. `wound_assessments` Table
Serial assessments tracking wound healing progression over time.

**Key Fields:**
- All measurement fields from wounds table
- `healing_trend`: improving, stable, declining, stalled
- `healing_percentage`: Estimated % healed (0-100)
- `treatment_applied`: Debridement, dressing change, etc.
- `photo_id`: Reference to clinical photo
- `provider_notes`: Assessment documentation
- `next_assessment_date`: Follow-up scheduling
- `referral_needed`, `referral_notes`: Specialist referral tracking

### Database Functions

#### `calculate_wound_healing_rate(p_wound_id TEXT)`
Returns healing metrics:
- Days since onset
- Initial vs current area
- Area reduction (cm² and %)
- Average healing rate per week
- Current healing trend
- Assessment count

#### `get_active_wounds_for_patient(p_tenant_id TEXT, p_patient_id TEXT)`
Returns all active wounds for a patient with latest assessment data.

#### `update_wound_status_on_assessment()`
Trigger function that auto-updates wound status based on healing trend:
- Sets status to "healed" when healing percentage >= 95%
- Updates wound measurements from latest assessment
- Manages healed_date automatically

### View: `v_wound_overview`
Comprehensive wound overview with:
- Patient demographics
- Current wound status and measurements
- Latest assessment data
- Days since onset
- Assessment count

## API Endpoints

### Base Route: `/api/wounds`

#### GET /api/wounds
List all wounds with filtering.

**Query Parameters:**
- `patientId`: Filter by patient
- `status`: Filter by status
- `woundType`: Filter by wound type
- `activeOnly=true`: Show only open/healing wounds

**Response:**
```json
{
  "wounds": [
    {
      "id": "uuid",
      "patient_name": "John Doe",
      "wound_type": "surgical",
      "body_region": "nose",
      "status": "healing",
      "days_since_onset": 14,
      "healing_percentage": 65,
      ...
    }
  ]
}
```

#### GET /api/wounds/:id
Get single wound with full details including all assessments, healing metrics, and photos.

**Response:**
```json
{
  "wound": { ... },
  "assessments": [ ... ],
  "healingMetrics": {
    "days_since_onset": 14,
    "initial_area_cm2": 4.5,
    "current_area_cm2": 2.0,
    "area_reduction_percent": 55.5,
    "average_healing_rate_per_week": 1.25
  },
  "photos": [ ... ]
}
```

#### POST /api/wounds
Create new wound.

**Required Fields:**
- `patientId`
- `woundType`
- `bodyRegion`
- `onsetDate`

**Permissions:** provider, nurse, ma, admin

#### PUT /api/wounds/:id
Update wound details.

**Permissions:** provider, nurse, ma, admin

#### POST /api/wounds/:id/assessments
Add new wound assessment.

**Required Fields:**
- `healingTrend`: improving, stable, declining, stalled

**Optional Fields:**
- Measurements (length, width, depth, area)
- Clinical observations
- Treatment applied
- Photos
- Provider notes

**Permissions:** provider, nurse, ma, admin

#### GET /api/wounds/:id/assessments
Get all assessments for a wound (chronologically ordered).

#### GET /api/wounds/:id/healing-metrics
Get healing rate calculations for a wound.

#### GET /api/wounds/patient/:patientId/active
Get all active wounds for a patient (uses database function).

#### PUT /api/wounds/:id/status
Update wound status (open, healing, healed, chronic, stalled, deteriorating).

**Permissions:** provider, nurse, admin

#### DELETE /api/wounds/:id
Soft delete wound.

**Permissions:** provider, admin

## Seed Data

Two sample wounds created for testing:

### 1. Post-Mohs Surgical Wound
- **Location**: Right nasal ala
- **Status**: Healing well (65% healed)
- **Onset**: 14 days ago
- **Assessments**: 3 showing progressive healing
- **Treatment**: Daily petrolatum gauze dressing changes

### 2. Chronic Venous Leg Ulcer
- **Location**: Left lower leg
- **Status**: Chronic/stalled (20% healed)
- **Onset**: 90 days ago
- **Assessments**: 4 showing stalled healing
- **Treatment**: Foam dressing with compression therapy
- **Notes**: Referral to vascular surgery recommended

## Files Created

### Migration
- `/backend/migrations/061_wound_tracking.sql`

### API Routes
- `/backend/src/routes/wounds.ts`

### Scripts
- `/backend/scripts/seedWounds.ts` - Sample wound data
- `/backend/scripts/runMigration.ts` - Helper for running migrations

### Integration
- Updated `/backend/src/index.ts` to register wounds router

## Testing

Run the seed script to create sample data:
```bash
cd backend
npx ts-node scripts/seedWounds.ts
```

Test the API:
```bash
# List all wounds
curl http://localhost:4000/api/wounds

# Get wound details
curl http://localhost:4000/api/wounds/{wound_id}

# Get healing metrics
curl http://localhost:4000/api/wounds/{wound_id}/healing-metrics
```

## TypeScript Compilation
✅ Verified with `npx tsc --noEmit` - No errors

## Features Implemented

✅ Comprehensive wound classification and documentation
✅ Serial assessment tracking with healing progression
✅ Automatic wound status updates based on healing trend
✅ Healing rate calculations and metrics
✅ Integration with photos table for wound documentation
✅ Body map coordinate support (x, y positions)
✅ Treatment and dressing tracking
✅ Infection monitoring and pain assessment
✅ Referral workflow support
✅ Audit logging for all operations
✅ Role-based access control
✅ Soft delete for data preservation

## Clinical Use Cases

1. **Post-Surgical Wound Care**: Track healing after Mohs surgery, biopsies, excisions
2. **Chronic Wound Management**: Monitor venous ulcers, diabetic ulcers, pressure injuries
3. **Documentation for Billing**: Detailed wound measurements and treatment records
4. **Quality Metrics**: Track healing rates and outcomes
5. **Care Coordination**: Document referrals when wounds aren't healing appropriately
6. **Patient Education**: Visual tracking of healing progress

## Future Enhancements

- Frontend UI for wound documentation
- Integration with body diagram for visual wound mapping
- Wound care protocol templates
- Automated alerts for stalled healing
- Photo comparison tools (before/after)
- Export wound data for external systems
- Mobile wound assessment capture
