# Claims Management System Enhancements

## Overview

This document outlines the comprehensive enhancements made to the dermatology practice claims management system. The system now includes proper patient connections, procedure tracking, diagnosis codes (ICD-10), fee schedules, denial tracking, and financial metrics.

## What Was Implemented

### 1. Database Schema Enhancements

**New Migration File**: `/backend/src/db/migrations/024_claims_enhancements.sql`

#### New Tables:
- **claim_diagnoses**: Store ICD-10 diagnosis codes linked to claims
  - Supports primary diagnosis flag
  - Sequence ordering for proper billing
  - Full dermatology diagnosis code library (165+ codes)

- **claim_charges**: Normalized line items (procedures) for each claim
  - CPT codes with modifiers
  - Quantity tracking
  - Links to fee schedules
  - Diagnosis pointer support

- **diagnosis_codes**: Master library of ICD-10 codes
  - 165+ common dermatology diagnoses including:
    - Psoriasis (L40.x)
    - Atopic dermatitis/Eczema (L20.x)
    - Acne (L70.x)
    - Melanoma (C43.x)
    - Basal cell carcinoma (C44.x11)
    - Squamous cell carcinoma (C44.x21)
    - Melanocytic nevi (D22.x)
    - Seborrheic keratosis (L82.x)
    - Actinic keratosis (L57.0)
    - Fungal infections (B35.x)
    - Herpes zoster (B02.x)
    - Contact dermatitis (L23.x)
    - Warts (B07.x)
    - Urticaria (L50.x)
  - Categorized by type
  - Marked for common conditions

### 2. Backend API Enhancements

**Updated File**: `/backend/src/routes/claims.ts`

#### New Endpoints:

1. **GET /api/claims/diagnosis-codes**
   - Fetch available ICD-10 diagnosis codes
   - Filter by category, search term, or common codes only
   - Used for claim creation and documentation

2. **GET /api/claims/metrics**
   - Dashboard metrics with aging buckets
   - Financial KPIs:
     - Pending claims count and dollar amount
     - Average days to payment
     - Denial rate
     - Collection rate
     - Aging buckets (0-30, 31-60, 61-90, 90+ days)

3. **Enhanced GET /api/claims/:id**
   - Now returns diagnoses and charges separately
   - Includes full claim detail with:
     - Diagnosis codes (ICD-10)
     - Procedure codes (CPT) with modifiers
     - Payment history
     - Status history

### 3. Frontend Enhancements

#### ClaimsDashboard.tsx
- **New Metrics Display**:
  - Real-time performance metrics
  - First-pass acceptance rate
  - Denial rate tracking
  - Average days in A/R

- **Aging Buckets Visualization**:
  - 0-30 days (green)
  - 31-60 days (yellow)
  - 61-90 days (orange)
  - 90+ days (red)
  - Shows both count and dollar amount

- **Collection Rate**:
  - Calculates percentage of charges collected
  - Compares total billed vs total paid

#### ClaimsPage.tsx
- **Fixed Patient List Bug**: Now properly handles both `{ patients: [...] }` and `{ data: [...] }` response formats
- Full integration with new claims structure

#### API Client (api.ts)
- New functions:
  - `fetchClaimMetrics()`: Get dashboard metrics
  - `fetchDiagnosisCodes()`: Search/filter diagnosis codes

### 4. Seed Data

**New File**: `/backend/src/db/seed-claims.ts`

Generates realistic dermatology claims scenarios including:
- 10 diverse claim examples
- Multiple diagnosis codes per claim
- CPT procedure codes with appropriate modifiers
- Various claim statuses (draft, submitted, paid, denied)
- Payment records with EFT tracking
- Links to existing patients from seed data

**Scenarios Include**:
1. Psoriasis treatment with Kenalog injection (paid)
2. BCC biopsy (submitted)
3. Atopic dermatitis follow-up (paid)
4. Seborrheic keratosis destruction (denied as cosmetic)
5. Acne treatment (paid)
6. Teen acne new patient visit (pending)
7. Multiple AK destructions with biopsy (paid)
8. Malignant lesion excision with repair (submitted)
9. Shingles treatment (draft)
10. Tinea pedis treatment (paid)

## Fee Schedule Integration

The system properly connects to fee schedules:
- Default fee schedule created with 17 common CPT codes
- Categories: E/M, Biopsy, Destruction, Excision, Repair, Injection, Drug
- Realistic pricing based on 2026 Medicare rates
- Each claim links charges to fee schedule items

## Claim Workflow

### Status Progression:
1. **Draft**: Initial claim creation
2. **Scrubbed**: Passed validation checks
3. **Ready**: Clean claim ready for submission
4. **Submitted**: Sent to insurance
5. **Accepted**: Insurance accepted claim
6. **Paid**: Payment received
7. **Denied**: Requires appeal or write-off
8. **Appealed**: Under appeal process

### Scrub Status:
- **clean**: No issues, ready to submit
- **warnings**: Review recommended
- **errors**: Must fix before submission

## Denial Management

The system includes:
- Denial reason tracking
- Denial codes
- Denial categories:
  - cosmetic_vs_medical
  - modifier_issue
  - prior_auth
  - documentation
  - duplicate
- Appeal status tracking
- Resolution workflow

## How to Apply Changes

### 1. Run Database Migration

```bash
cd backend

# Option A: Run the migration file directly
npm run db:migrate

# Option B: Use psql directly
psql -U your_username -d your_database -f src/db/migrations/024_claims_enhancements.sql
```

### 2. Seed Claims Data

```bash
cd backend

# Run the claims seeding script
npm run ts-node src/db/seed-claims.ts

# Or using ts-node-dev
npm run db:seed:claims
```

Add this script to `package.json`:
```json
{
  "scripts": {
    "db:seed:claims": "ts-node-dev --transpile-only src/db/seed-claims.ts"
  }
}
```

### 3. Restart Backend Server

```bash
npm run dev
```

### 4. Restart Frontend

```bash
cd ../frontend
npm run dev
```

## Testing the System

### 1. View Claims Dashboard
- Navigate to `/claims-dashboard`
- Verify metrics are loading
- Check aging buckets display
- Review performance metrics

### 2. View Claims List
- Navigate to `/claims`
- Filter by status
- View claim details
- Check diagnosis codes display
- Verify procedure codes show correctly

### 3. Test Patient Connection
- Claims should show patient names
- Patient insurance information should display
- No errors about missing patient data

### 4. Check Fee Schedule Integration
- Verify CPT codes have proper fees
- Check fee schedule items load correctly
- Confirm charges link to fee schedules

## Key Features

### Medical Necessity Documentation
- ICD-10 codes support medical necessity
- Multiple diagnoses per claim
- Primary diagnosis flagging
- Proper diagnosis-to-procedure linking

### Financial Metrics
- **Collection Rate**: (Total Payments / Total Charges) × 100
- **Denial Rate**: (Denied Claims / Total Submitted) × 100
- **Average Days in A/R**: Days from service to payment
- **Aging Buckets**: Outstanding claims by age

### Compliance
- Proper modifier usage (25, 59, XE, XS, XP, XU)
- Denial prevention through claim scrubbing
- Medicare and commercial payer rules
- Documentation requirements tracking

## Common CPT Codes Included

| CPT Code | Description | Category |
|----------|-------------|----------|
| 99213 | Established patient visit - moderate | E/M |
| 99214 | Established patient visit - high complexity | E/M |
| 99203 | New patient visit - moderate | E/M |
| 99204 | New patient visit - high complexity | E/M |
| 11100 | Biopsy, single lesion | Biopsy |
| 11101 | Biopsy, additional lesion | Biopsy |
| 17000 | Destruction premalignant, first | Destruction |
| 17003 | Destruction premalignant, 2-14 | Destruction |
| 17110 | Destruction benign, up to 14 | Destruction |
| 11400-11401 | Excision benign lesion | Excision |
| 11600-11601 | Excision malignant lesion | Excision |
| 12001 | Simple repair | Repair |
| 12032 | Intermediate repair | Repair |
| 96372 | Therapeutic injection | Injection |
| J3301 | Kenalog injection | Drug |

## Troubleshooting

### Issue: Migration fails
**Solution**: Ensure you're running migrations in order. The claims table must exist first (from migration 023).

### Issue: No claims data appears
**Solution**: Run the seed-claims.ts script to generate sample data.

### Issue: Patient names show as "Unknown"
**Solution**: Verify patients exist in the database and the patient_id foreign keys are correct.

### Issue: Metrics not loading
**Solution**: Check that the `/api/claims/metrics` endpoint is accessible and returns data.

### Issue: Diagnosis codes not appearing
**Solution**: Verify the diagnosis_codes table was populated by the migration.

## Future Enhancements

Potential additions to consider:
1. Electronic claim submission (EDI 837)
2. ERA (Electronic Remittance Advice) parsing
3. Prior authorization tracking
4. Clearinghouse integration
5. Real-time eligibility checks
6. Automated claim scrubbing rules engine
7. Denial appeal workflow automation
8. Patient responsibility calculation
9. Insurance contract management
10. Provider-specific billing profiles

## Support

For questions or issues:
1. Check the migration files are applied correctly
2. Verify seed data was created
3. Review console logs for errors
4. Check that all API endpoints return expected data structure
5. Ensure frontend and backend are both running

## Summary

This enhancement transforms the claims system into a production-ready medical billing platform for dermatology practices. It includes:
- ✅ Proper patient connections
- ✅ 165+ ICD-10 diagnosis codes
- ✅ 17 common CPT procedure codes
- ✅ Fee schedule integration
- ✅ Financial metrics and KPIs
- ✅ Aging bucket analysis
- ✅ Denial tracking and management
- ✅ Realistic seed data
- ✅ Dashboard visualizations
- ✅ Collection rate tracking
- ✅ Medical necessity documentation

The system is now ready for real-world dermatology billing workflows.
