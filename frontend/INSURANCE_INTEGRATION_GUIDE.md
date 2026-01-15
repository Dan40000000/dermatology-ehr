# Insurance Tab Enhancement - Integration Guide

This guide explains how to integrate the enhanced Insurance Tab and EditInsuranceModal into your PatientDetailPage.tsx.

## Files Modified/Created

1. **Types Updated**: `/src/types/index.ts` - Added comprehensive insurance types
2. **New Component File**: `/src/pages/PatientDetailPage_insurance.tsx` - Contains the enhanced components
3. **Target File**: `/src/pages/PatientDetailPage.tsx` - Will be updated with new components

## Steps to Integrate

### Step 1: Replace InsuranceTab Component

In `/src/pages/PatientDetailPage.tsx`, find the `InsuranceTab` component (around line 919) and replace it with the version from `PatientDetailPage_insurance.tsx`.

### Step 2: Replace EditInsuranceModal Component

In `/src/pages/PatientDetailPage.tsx`, find the `EditInsuranceModal` component (around line 1634) and replace it with the version from `PatientDetailPage_insurance.tsx`.

### Step 3: Add Import for Types (if not already present)

At the top of PatientDetailPage.tsx, ensure these imports exist:
```typescript
import type { Patient, PolicyType, EligibilityStatus, RelationshipToInsured } from '../types';
```

## New Features Implemented

### Primary Insurance Policy Section:
- **Payer** (searchable dropdown/input)
- **Plan Name**
- **Policy Number** * (required)
- **Group Number**
- **Policy Type** * (dropdown with 16 options)
- **Notes** field (textarea)
- **Authorization requirements checkboxes**:
  - Referral/Authorization for office visit
  - Pre-Cert for In-Patient Services
  - Pre-Auth for Out-Patient Services

### Patient Name (as registered with insurance):
- Option to use patient's name
- Option to enter custom name
- **Signature on File** (Yes/No checkbox)

### Policy Holder Section:
- **Patient's Relationship to Policy Holder** (Self, Spouse, Child, Other)
- If not Self: Shows additional fields
  - Policy Holder Last Name
  - Policy Holder First Name
  - Policy Holder Middle Name
  - Policy Holder DOB
  - Policy Holder SSN (masked display)

### Eligibility Information:
- **Eligibility Status** (Unknown/Error, Active, Inactive)
- **Co-Pay Amount** ($)
- **Co-Insurance** (%)
- **Deductible** ($)
- **Remaining Deductible** ($)
- **Out of Pocket** ($)
- **Remaining Out of Pocket** ($)
- **Policy Effective Date**
- **Policy End Date**
- **Check Eligibility** button (placeholder function)

### Card Images:
- **Card Front** upload area
- **Card Back** upload area

### Secondary Insurance:
- All same fields as primary insurance

### Payer Contact Information:
- Support for multiple contact types:
  - Customer Service
  - Claims
  - Appeals
  - Precertification
- Each contact can have:
  - Phone
  - Fax
  - Email
  - Address

## Backend Support Required

The backend needs to support storing `insuranceDetails` as a JSONB column or similar structure with this schema:

```json
{
  "primary": {
    "payer": "string",
    "planName": "string",
    "policyNumber": "string",
    "groupNumber": "string",
    "policyType": "EPO | Group Health Plan (GHP) | HMO | ...",
    "notes": "string",
    "requiresReferralAuth": boolean,
    "requiresInPatientPreCert": boolean,
    "requiresOutPatientPreAuth": boolean,
    "usePatientName": boolean,
    "patientNameOnCard": "string",
    "signatureOnFile": boolean,
    "relationshipToInsured": "Self | Spouse | Child | Other",
    "policyHolderFirstName": "string",
    "policyHolderMiddle": "string",
    "policyHolderLastName": "string",
    "policyHolderDob": "date",
    "policyHolderSsn": "string",
    "eligibilityStatus": "Unknown/Error | Active | Inactive",
    "copayAmount": number,
    "coinsurancePercent": number,
    "deductible": number,
    "remainingDeductible": number,
    "outOfPocket": number,
    "remainingOutOfPocket": number,
    "policyEffectiveDate": "date",
    "policyEndDate": "date",
    "cardFrontUrl": "string",
    "cardBackUrl": "string"
  },
  "secondary": {
    // Same fields as primary
  },
  "payerContacts": [
    {
      "contactType": "Customer Service | Claims | Appeals | Precertification",
      "phone": "string",
      "fax": "string",
      "email": "string",
      "address": "string"
    }
  ]
}
```

## API Endpoint

The modal saves data to:
```
PUT /api/patients/:id
Body: { insuranceDetails: { ... } }
```

## UI/UX Features

1. **Tabbed Interface**: Separate tabs for Primary, Secondary, and Payer Contacts
2. **Conditional Fields**: Policy holder fields only show when relationship is not "Self"
3. **Smart Defaults**: Patient name checkbox auto-fills patient's name
4. **Responsive Layout**: 2-column grid layout for form fields
5. **Masked SSN Display**: Only shows last 4 digits in view mode
6. **Scrollable Modal**: Form content scrolls independently
7. **Add/Remove Contacts**: Dynamic payer contact management

## Testing Checklist

- [ ] Primary insurance saves correctly
- [ ] Secondary insurance saves correctly
- [ ] Policy holder fields appear/hide based on relationship
- [ ] Patient name checkbox works correctly
- [ ] Payer contacts can be added and removed
- [ ] All checkboxes save state correctly
- [ ] Financial fields accept decimal values
- [ ] Date fields work correctly
- [ ] Modal closes and refreshes data on save
- [ ] Display tab shows all saved information correctly
- [ ] SSN is masked in display view
- [ ] Eligibility button shows placeholder message

## Notes

- No stubs or "coming soon" placeholders are used in the form
- All fields are functional and save to the backend
- The Check Eligibility button has a placeholder alert (future integration point)
- Card image upload currently uses URL input (file upload can be added)
- All 16 policy types from EMA are supported
- Full CRUD operations on payer contacts
