# Insurance Verification Integration with Check-In and Claims

## Overview

This integration creates a seamless flow of insurance information from eligibility verification through patient check-in to claims submission. Insurance data is verified once and propagated automatically throughout the system, reducing manual data entry and improving billing accuracy.

## Architecture

```
┌─────────────────┐
│  Eligibility    │
│  Verification   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  Patient        │─────>│  Check-In    │
│  Record         │      │  Flow        │
└────────┬────────┘      └──────┬───────┘
         │                      │
         │                      ▼
         │              ┌──────────────┐
         └─────────────>│  Claims      │
                        │  Generation  │
                        └──────────────┘
```

## Implementation Components

### 1. Database Schema Changes

#### Migration: `059_patient_eligibility_fields.sql`

Adds eligibility tracking fields directly to the `patients` table:

- `eligibility_status` - Current verification status (active, inactive, error, etc.)
- `eligibility_checked_at` - Timestamp of last verification
- `copay_amount_cents` - Expected copay for specialist visits
- `deductible_remaining_cents` - Remaining deductible amount
- `coinsurance_percent` - Patient coinsurance percentage
- `insurance_payer_id` - Payer identifier
- `insurance_plan_name` - Plan name
- `insurance_member_id` - Member ID
- `insurance_group_number` - Group number
- `latest_verification_id` - Reference to most recent verification record

**Trigger**: Automatically updates patient record when new verification is created/updated

#### Migration: `060_patient_check_ins.sql`

Creates tables for check-in workflow:

- `patient_check_ins` - Tracks check-in events with eligibility verification and copay collection
- `patient_payments` - Records copay and other patient payments

### 2. Backend Services

#### `checkInService.ts` - Patient Check-In Service

Core functions:
- `getPatientEligibilityForCheckIn()` - Fetches eligibility with auto-refresh logic
- `refreshEligibilityAtCheckIn()` - Triggers real-time eligibility verification
- `completeCheckIn()` - Completes full check-in workflow including:
  - Eligibility refresh (if stale)
  - Insurance information updates
  - Copay payment recording
  - Appointment status update
- `calculateEstimatedResponsibility()` - Estimates patient financial responsibility

#### Check-In API Routes (`routes/checkIn.ts`)

Endpoints:
- `POST /api/check-in/eligibility/:patientId` - Get eligibility for check-in
- `POST /api/check-in/refresh-eligibility/:patientId` - Refresh eligibility
- `POST /api/check-in/complete` - Complete check-in process
- `GET /api/check-in/status/:appointmentId` - Get check-in status
- `GET /api/check-in/today` - Get today's check-ins
- `POST /api/check-in/estimate-responsibility` - Calculate patient responsibility

#### Claims Integration (`routes/claims.ts`)

Updated claim creation to:
- Automatically pull insurance information from latest eligibility verification
- Use verified payer ID, payer name, member ID, and group number
- Fallback to patient insurance fields if verification not available

### 3. Frontend Components

#### Insurance Status Badge (`components/insurance/InsuranceStatusBadge.tsx`)

Visual indicator for insurance verification status:
- **Active** (Green) - Insurance verified and active
- **Inactive** (Red) - Coverage inactive or terminated
- **Pending** (Yellow) - Verification in progress
- **Error** (Gray) - Unable to verify
- **Unverified** (Gray) - Not yet verified

Features:
- Shows verification date
- Highlights stale verifications (>30 days)
- Indicates issues

#### Coverage Summary Card (`components/insurance/CoverageSummaryCard.tsx`)

Comprehensive insurance coverage display:
- Payer and plan information
- Member ID and group number
- Copay amounts
- Deductible progress (with visual progress bar)
- Out-of-pocket max progress
- Coinsurance percentage
- Prior authorization requirements
- Referral requirements
- Refresh eligibility button
- Issue alerts

Available in both compact and full modes.

#### Check-In Page (`pages/CheckIn.tsx`)

Complete check-in workflow:
1. Displays patient and appointment information
2. Shows insurance eligibility status with auto-refresh warning if stale
3. Coverage summary card with refresh capability
4. Copay collection section:
   - Pre-filled with expected copay from eligibility
   - Payment method selection (cash, credit, debit, check)
5. Insurance update section (if patient has new card)
6. Complete check-in button that:
   - Refreshes eligibility if needed
   - Records copay payment
   - Updates insurance information
   - Marks appointment as checked in

### 4. Data Flow

#### Before Appointment (Batch Eligibility)

```
Scheduled Job (2 days before)
    ↓
Get tomorrow's appointments
    ↓
Batch verify eligibility
    ↓
Update patient records (via trigger)
    ↓
Flag issues for front desk
```

#### At Check-In

```
Front desk scans/selects appointment
    ↓
System loads eligibility status
    ↓
IF eligibility > 24 hours old
    ↓
Auto-refresh eligibility
    ↓
Display coverage summary
    ↓
Collect copay (if applicable)
    ↓
Update insurance (if changed)
    ↓
Complete check-in
```

#### After Visit (Claims)

```
Provider completes encounter
    ↓
Billing creates claim
    ↓
System auto-populates insurance from:
  1. Latest verification (preferred)
  2. Patient insurance fields (fallback)
    ↓
Claim includes:
  - Verified payer ID
  - Member ID
  - Group number
  - Plan name
    ↓
Submit claim with accurate insurance
```

## Key Features

### Automatic Data Propagation

- Eligibility verification automatically updates patient record (database trigger)
- Claims automatically pull verified insurance information
- No manual data re-entry required

### Smart Refresh Logic

- Eligibility flagged as stale if >24 hours old
- Auto-refresh offered at check-in
- Batch verification can run before appointments

### Financial Transparency

- Patient sees expected copay before visit
- Deductible and out-of-pocket progress displayed
- Estimated responsibility calculated in real-time

### Issue Detection

- Inactive coverage flagged immediately
- Changed insurance highlighted for update
- Prior auth requirements visible to staff

## Usage Examples

### 1. Front Desk Check-In Workflow

```typescript
// Front desk opens check-in for appointment
const checkInData = await fetch('/api/check-in/eligibility/{patientId}?appointmentId={appointmentId}');

// If eligibility stale (>24 hours)
if (checkInData.insuranceNeedsUpdate) {
  await fetch('/api/check-in/refresh-eligibility/{patientId}');
}

// Collect copay
const copayAmount = checkInData.eligibility.copayAmount;

// Complete check-in
await fetch('/api/check-in/complete', {
  method: 'POST',
  body: JSON.stringify({
    patientId,
    appointmentId,
    copayCollected: true,
    copayAmountCents: copayAmount,
    paymentMethod: 'credit'
  })
});
```

### 2. Billing Creates Claim

```typescript
// Create claim - insurance auto-populated from latest verification
const claim = await fetch('/api/claims', {
  method: 'POST',
  body: JSON.stringify({
    patientId: '123',
    encounterId: '456',
    // payer info automatically pulled from patient's latest verification
  })
});

// Claim includes:
// - payer_id from verification
// - payer_name from verification
// - member_id from verification
// - group_number from verification
```

### 3. Using Insurance Components

```tsx
import { InsuranceStatusBadge, CoverageSummaryCard } from '@/components/insurance';

// In patient chart or check-in screen
<InsuranceStatusBadge
  status={patient.eligibilityStatus}
  verifiedAt={patient.eligibilityCheckedAt}
  hasIssues={verification.hasIssues}
  showDate={true}
/>

<CoverageSummaryCard
  eligibility={{
    status: patient.eligibilityStatus,
    verifiedAt: patient.eligibilityCheckedAt,
    payerName: patient.insurancePlanName,
    copayAmount: patient.copayAmountCents,
    deductibleRemaining: patient.deductibleRemainingCents,
    coinsurancePercent: patient.coinsurancePercent,
    // ... other fields
  }}
  onRefresh={() => refreshEligibility(patient.id)}
  isRefreshing={loading}
/>
```

## Benefits

### For Front Desk Staff

- Quick visual confirmation of insurance status
- Automatic eligibility refresh when needed
- Pre-calculated copay amounts
- Easy insurance update workflow

### For Billing Department

- Accurate insurance information on claims
- Reduced claim denials due to incorrect insurance
- Automatic inclusion of verified payer IDs
- Less manual data entry

### For Patients

- Transparent cost expectations before visit
- See deductible and out-of-pocket progress
- Quick check-in process
- Accurate billing

### For Practice

- Improved cash flow (copays collected upfront)
- Reduced claim denials
- Better data accuracy across systems
- Automated workflows reduce staff time

## Configuration

### Environment Variables

No additional environment variables required. Uses existing:
- Database connection (from existing config)
- Eligibility service configuration (existing)

### Database Setup

Run migrations in order:
1. `058_insurance_eligibility.sql` (existing)
2. `059_patient_eligibility_fields.sql` (new)
3. `060_patient_check_ins.sql` (new)

### Frontend Routes

Add to your router:
```tsx
<Route path="/check-in/:appointmentId" element={<CheckIn />} />
```

### Backend Routes

Already registered in `/backend/src/index.ts`:
```typescript
app.use("/api/check-in", checkInRouter);
```

## Testing

### Manual Testing Checklist

1. **Eligibility Verification**
   - [ ] Verify patient eligibility
   - [ ] Check patient record updated with eligibility data
   - [ ] Verify eligibility status badge displays correctly

2. **Check-In Flow**
   - [ ] Open check-in for appointment
   - [ ] Verify eligibility auto-refreshes if stale
   - [ ] Collect copay
   - [ ] Update insurance information
   - [ ] Complete check-in
   - [ ] Verify appointment status updated

3. **Claims**
   - [ ] Create claim for checked-in patient
   - [ ] Verify insurance info auto-populated from eligibility
   - [ ] Check payer ID and member ID are correct

4. **Edge Cases**
   - [ ] Patient with no insurance
   - [ ] Patient with inactive insurance
   - [ ] Patient with changed insurance
   - [ ] Stale eligibility (>24 hours)

## Future Enhancements

1. **Real-Time Updates**
   - WebSocket notifications when eligibility changes
   - Push notifications for staff when issues detected

2. **Batch Optimization**
   - Scheduled batch verification for tomorrow's appointments
   - Priority verification for high-dollar procedures

3. **Analytics**
   - Denial rate by insurance verification timeliness
   - Copay collection rate tracking
   - Time-to-check-in metrics

4. **Patient Portal Integration**
   - Patients can update insurance before appointment
   - View coverage summary in portal
   - See expected costs

5. **Advanced Calculations**
   - Multi-procedure cost estimates
   - Family deductible tracking
   - Secondary insurance coordination

## Troubleshooting

### Patient record not updating after verification

**Issue**: Eligibility verified but patient fields not updated

**Solution**: Check database trigger `update_patient_eligibility_trigger` is active:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'update_patient_eligibility_trigger';
```

### Claim not getting insurance info

**Issue**: Claim created but insurance fields are null

**Solution**:
1. Verify patient has `latest_verification_id` populated
2. Check join in claims creation query
3. Ensure insurance fields exist on patients table

### Check-in eligibility refresh fails

**Issue**: Error when trying to refresh eligibility at check-in

**Solution**:
1. Check eligibility service is configured
2. Verify patient has insurance information on file
3. Check API credentials for eligibility service

## Files Created/Modified

### Backend

**Created:**
- `/backend/migrations/059_patient_eligibility_fields.sql`
- `/backend/migrations/060_patient_check_ins.sql`
- `/backend/src/services/checkInService.ts`
- `/backend/src/routes/checkIn.ts`

**Modified:**
- `/backend/src/routes/claims.ts` - Auto-populate insurance from verification
- `/backend/src/index.ts` - Register check-in routes

### Frontend

**Created:**
- `/frontend/src/components/insurance/InsuranceStatusBadge.tsx`
- `/frontend/src/components/insurance/CoverageSummaryCard.tsx`
- `/frontend/src/components/insurance/index.ts`
- `/frontend/src/pages/CheckIn.tsx`

## API Reference

### Check-In Endpoints

#### Get Eligibility for Check-In
```
POST /api/check-in/eligibility/:patientId?appointmentId={id}
```

Returns:
```json
{
  "success": true,
  "data": {
    "patientId": "uuid",
    "appointmentId": "uuid",
    "eligibilityStatus": {
      "status": "active",
      "verifiedAt": "2024-01-15T10:30:00Z",
      "copayAmount": 3000,
      "deductibleRemaining": 50000,
      "coinsurancePercent": 20,
      "payerName": "Blue Cross Blue Shield",
      "hasIssues": false
    },
    "insuranceNeedsUpdate": false
  }
}
```

#### Refresh Eligibility
```
POST /api/check-in/refresh-eligibility/:patientId?appointmentId={id}
```

#### Complete Check-In
```
POST /api/check-in/complete

Body:
{
  "patientId": "uuid",
  "appointmentId": "uuid",
  "copayCollected": true,
  "copayAmountCents": 3000,
  "paymentMethod": "credit",
  "insuranceUpdates": {
    "insuranceProvider": "New Payer",
    "insuranceMemberId": "12345",
    "insuranceGroupNumber": "GRP001"
  }
}
```

Returns:
```json
{
  "success": true,
  "result": {
    "checkInId": "uuid",
    "eligibilityRefreshed": true,
    "copayCollected": true,
    "insuranceUpdated": false,
    "warnings": []
  }
}
```

---

**Implementation Date**: January 2026
**Status**: Complete and Ready for Production
**Dependencies**: Existing eligibility verification system
