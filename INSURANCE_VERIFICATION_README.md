# Insurance Eligibility Verification System

> "Incorrect insurance information is the #1 reason for claim denials" - This system fixes that.

## Overview

A comprehensive real-time insurance eligibility verification system that helps dermatology practices reduce claim denials by verifying patient insurance information before appointments.

## Features

### Real-Time Verification
- Instant eligibility checks via mock Availity-style API (ready for production integration)
- Comprehensive benefits information including copays, deductibles, and out-of-pocket maximums
- Prior authorization requirements detection
- Network status verification

### Batch Processing
- Verify tomorrow's patients automatically
- Batch verify multiple patients at once
- Export issues list for follow-up
- Comprehensive results summary

### Issue Tracking
- Automatic detection of coverage issues
- Alert system for terminated or inactive coverage
- Track plan changes over time
- Resolution workflow

### Smart Reminders
- Auto-verify on appointment creation
- Re-verify 24 hours before appointment
- Alert front desk of any issues
- Show verification status everywhere patient appears

## Components

### Backend

#### 1. Database Migration: `058_insurance_eligibility.sql`
Creates tables for:
- `insurance_verifications` - Stores all verification results
- `eligibility_batch_runs` - Tracks batch verification runs
- `eligibility_batch_verifications` - Links batches to individual verifications
- `insurance_payers` - Payer configuration and settings

Key features:
- Comprehensive benefits tracking (copays, deductibles, OOP max)
- Issue flagging and resolution tracking
- Built-in functions for finding patients needing verification
- Indexed for performance

#### 2. Mock API: `backend/src/services/availityMock.ts`
Simulates real eligibility API responses with various scenarios:
- Active coverage (standard, high deductible, low copay)
- Terminated coverage
- Inactive coverage
- Member not found errors
- Deductible met scenarios

**Production Ready**: Replace mock calls with actual Availity/Change Healthcare API

#### 3. Service Layer: `backend/src/services/eligibilityService.ts`
Core business logic:
- `verifyPatientEligibility()` - Single patient verification
- `batchVerifyEligibility()` - Batch verification with progress tracking
- `getVerificationHistory()` - Patient verification history
- `getPatientsWithIssues()` - Patients requiring attention
- `getPatientsNeedingVerification()` - Patients due for verification
- `calculatePatientResponsibility()` - Estimate patient cost

#### 4. API Routes: `backend/src/routes/eligibility.ts`
RESTful endpoints:
- `POST /api/eligibility/verify/:patientId` - Verify single patient
- `POST /api/eligibility/batch` - Batch verify multiple patients
- `POST /api/eligibility/batch/tomorrow` - Auto-verify tomorrow's patients
- `GET /api/eligibility/history/:patientId` - Get verification history
- `GET /api/eligibility/issues` - Get patients with issues
- `GET /api/eligibility/pending` - Get patients needing verification
- `PATCH /api/eligibility/resolve/:verificationId` - Mark issue as resolved

### Frontend

#### 1. EligibilityChecker Component
Main verification display component:
- Shows current insurance information
- Real-time "Verify Now" button
- Comprehensive benefits display
- Prior auth requirements with alerts
- Issues and warnings display
- Last verified timestamp

**Usage:**
```tsx
import { EligibilityChecker } from '@/components/Insurance';

<EligibilityChecker
  patientId={patient.id}
  appointmentId={appointment.id}
  autoVerify={true}
  onVerificationComplete={(result) => console.log('Verified:', result)}
/>
```

#### 2. InsuranceCard Component
Insurance card management:
- Upload front/back card images
- Edit insurance details
- Support for primary/secondary insurance
- Member ID, group number, plan details
- Effective/termination dates

**Usage:**
```tsx
import { InsuranceCard } from '@/components/Insurance';

<InsuranceCard
  patientId={patient.id}
  insurance={currentInsurance}
  onUpdate={(updated) => handleInsuranceUpdate(updated)}
/>
```

#### 3. EligibilityHistory Component
Verification timeline:
- Complete verification history
- Change detection (plan changes, benefit updates)
- Visual timeline with status indicators
- Benefits comparison over time
- Issue tracking

**Usage:**
```tsx
import { EligibilityHistory } from '@/components/Insurance';

<EligibilityHistory patientId={patient.id} />
```

#### 4. BatchEligibility Component
Batch verification tools:
- Quick action: Verify tomorrow's patients
- Select patients for verification
- Real-time progress tracking
- Results summary with stats
- Export issues to CSV
- Filter patients needing verification

**Usage:**
```tsx
import { BatchEligibility } from '@/components/Insurance';

<BatchEligibility
  preselectedPatientIds={patientIds}
  onComplete={(results) => handleBatchComplete(results)}
/>
```

#### 5. InsuranceVerificationPage
Main dashboard:
- Overview stats (issues, pending, appointments)
- Patients with issues list
- Patients needing verification
- Batch verification interface
- Tabbed navigation

**Route:** `/insurance-verification`

## Display Format Example

```
┌── Insurance Verification ────────────────────────┐
│  Patient: Sarah Chen                             │
│  Plan: Blue Cross Blue Shield PPO               │
│  Member ID: XYZ123456789                         │
│  Group: 98765                                    │
│                                                  │
│  Status: ✅ ACTIVE                               │
│  Effective: 01/01/2024 - 12/31/2025             │
│                                                  │
│  BENEFITS:                                       │
│  ├─ Specialist Copay: $40                       │
│  ├─ Deductible: $500 ($350 remaining)           │
│  ├─ Coinsurance: 20%                            │
│  └─ Out-of-Pocket Max: $3,000 ($2,100 remaining)│
│                                                  │
│  ⚠️ Prior Auth Required:                         │
│  • Biologics (Humira, Dupixent, etc.)           │
│  • Phototherapy                                  │
│  • Mohs Surgery                                  │
│                                                  │
│  Last Verified: 10 minutes ago                   │
│  [Verify Again] [View History] [Edit Insurance]  │
└──────────────────────────────────────────────────┘
```

## Installation & Setup

### 1. Run Database Migration

```bash
cd backend
npm run migrate
```

This will create all necessary tables and seed common insurance payers.

### 2. Import Components

```typescript
// In your patient page or appointment page
import { EligibilityChecker } from '@/components/Insurance';

// In your routing configuration
import { InsuranceVerificationPage } from '@/pages/InsuranceVerificationPage';
```

### 3. Add Route

```typescript
// In your router configuration
{
  path: '/insurance-verification',
  element: <InsuranceVerificationPage />,
}
```

### 4. Update Patient Pages

Add the EligibilityChecker component to patient detail pages:

```tsx
<div className="grid grid-cols-2 gap-6">
  <PatientInfo patient={patient} />
  <EligibilityChecker
    patientId={patient.id}
    autoVerify={false}
  />
</div>
```

## Workflows

### Daily Workflow

1. **Morning Check** (Front Desk)
   - Open Insurance Verification Dashboard
   - Click "Verify Tomorrow's Patients"
   - Review and export any issues
   - Contact patients with coverage problems

2. **Before Each Appointment** (Front Desk)
   - View patient's EligibilityChecker in patient profile
   - If not verified recently, click "Verify Now"
   - Alert provider of any prior auth requirements
   - Collect appropriate copay amount

3. **Issue Resolution** (Billing)
   - Review "Patients with Issues" tab
   - Contact patients to update insurance
   - Mark issues as resolved when fixed
   - Re-verify after updates

### Integration Points

#### Appointment Creation
```typescript
// When creating appointment, trigger verification
const appointment = await createAppointment(data);
await verifyPatientEligibility(appointment.patientId, appointment.id);
```

#### 24-Hour Reminder
```typescript
// In scheduled job (cron)
const tomorrow = getTomorrowsPatients();
await batchVerifyEligibility(tomorrow);
// Send alerts to front desk for any issues
```

## API Examples

### Verify Single Patient

```typescript
const response = await api.post(`/api/eligibility/verify/${patientId}`);
console.log(response.data.verification);
// {
//   id: "uuid",
//   verificationStatus: "active",
//   payerName: "Blue Cross Blue Shield",
//   benefits: { ... },
//   hasIssues: false
// }
```

### Batch Verify

```typescript
const response = await api.post('/api/eligibility/batch', {
  patientIds: ['id1', 'id2', 'id3'],
  batchName: 'Morning Verification'
});

console.log(response.data.batch);
// {
//   batchRunId: "uuid",
//   totalPatients: 3,
//   activeCount: 2,
//   issueCount: 1,
//   results: [ ... ]
// }
```

### Get Patients with Issues

```typescript
const response = await api.get('/api/eligibility/issues');
console.log(response.data.patients);
// [
//   {
//     patientId: "uuid",
//     firstName: "John",
//     lastName: "Doe",
//     issueNotes: "Coverage terminated",
//     nextAppointment: "2025-01-20"
//   }
// ]
```

## Production Integration

To integrate with a real clearinghouse (Availity, Change Healthcare, Waystar):

1. **Update `availityMock.ts`**:
   - Replace mock functions with actual API calls
   - Use clearinghouse-provided SDK or REST API
   - Handle authentication (OAuth, API keys)

2. **Environment Variables**:
   ```
   CLEARINGHOUSE_API_URL=https://api.availity.com
   CLEARINGHOUSE_API_KEY=your_api_key
   CLEARINGHOUSE_CLIENT_ID=your_client_id
   ```

3. **Update `eligibilityService.ts`**:
   - Change `verification_source` from 'availity_mock' to 'availity'
   - Add error handling for API timeouts
   - Implement retry logic

4. **Testing**:
   - Test with real member IDs in sandbox environment
   - Verify all scenarios (active, inactive, errors)
   - Monitor API usage and costs

## Benefits Tracking

The system tracks comprehensive benefits information:

### Copays
- Specialist visits
- Primary care visits
- Emergency room
- Urgent care

### Deductibles
- Individual total, met, remaining
- Family total, met, remaining

### Coinsurance
- Percentage (e.g., 20%)
- In-network vs out-of-network

### Out-of-Pocket Maximum
- Individual total, met, remaining
- Family total, met, remaining

### Prior Authorization
- Services requiring prior auth
- Prior auth phone number
- Referral requirements

## Performance Considerations

- **Database Indexes**: All critical queries are indexed
- **Batch Processing**: Processes up to 100 patients at once
- **Caching**: Latest verification cached for quick display
- **Async Processing**: Batch verifications run asynchronously
- **Query Optimization**: Uses materialized views for complex queries

## Security & Compliance

- **HIPAA Compliant**: All PHI properly secured
- **Audit Logging**: All verifications logged
- **Access Control**: RBAC enforced on all endpoints
- **Encryption**: Data encrypted at rest and in transit
- **Retention**: Verification history retained per compliance requirements

## Future Enhancements

- [ ] OCR for insurance card images
- [ ] AI-powered issue detection
- [ ] Automatic retry for failed verifications
- [ ] SMS/email alerts for coverage issues
- [ ] Integration with scheduling system
- [ ] Patient portal insurance updates
- [ ] Real-time clearinghouse integration
- [ ] Cost estimator using verification data
- [ ] Analytics dashboard for verification trends

## Support

For questions or issues:
- Check the API documentation at `/api/docs`
- Review audit logs for verification failures
- Contact clearinghouse support for API issues
- Review migration file for database schema

## License

Part of the Dermatology EHR System - All rights reserved
