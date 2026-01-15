# Rx/Prescriptions Enhancement - Quick Start Implementation Guide

## Files Created/Modified

### Backend Files

#### 1. Database Migration
**File**: `/backend/migrations/046_rx_refill_change_requests.sql`
- Creates `refill_requests` table
- Creates `rx_change_requests` table
- Creates `prescription_batch_operations` table
- Adds new columns to `prescriptions` table
- Creates indexes for performance

#### 2. Refill Requests Router
**File**: `/backend/src/routes/refillRequests.ts`
- Complete CRUD operations for refill requests
- Approval/denial workflow
- Integration with prescriptions table

#### 3. Rx Change Requests Router
**File**: `/backend/src/routes/rxChangeRequests.ts`
- Complete CRUD operations for change requests
- Approval/denial/modification workflow
- Pharmacy integration

#### 4. Enhanced Prescriptions Router
**File**: `/backend/src/routes/prescriptions.ts` (MODIFIED)
- Added enhanced filtering parameters
- Added bulk operations endpoints:
  - `POST /api/prescriptions/bulk/send-erx`
  - `POST /api/prescriptions/bulk/print`
  - `POST /api/prescriptions/bulk/refill`

#### 5. Server Configuration
**File**: `/backend/src/index.ts` (MODIFIED)
```typescript
// Added imports
import { refillRequestsRouter } from "./routes/refillRequests";
import { rxChangeRequestsRouter } from "./routes/rxChangeRequests";

// Added route registrations
app.use("/api/refill-requests", refillRequestsRouter);
app.use("/api/rx-change-requests", rxChangeRequestsRouter);
```

### Frontend Files

#### 1. TypeScript Types
**File**: `/frontend/src/types/index.ts` (MODIFIED)
- Added `Prescription` interface
- Added `RefillRequest` interface
- Added `RxChangeRequest` interface
- Added `PrescriptionFilters` interface
- Added `BulkPrescriptionOperation` interface
- Added type aliases for status enums

#### 2. API Client
**File**: `/frontend/src/api.ts` (MODIFIED)
Added functions:
- `fetchRefillRequestsNew()`
- `approveRefillRequest()`
- `denyRefillRequest()`
- `fetchRxChangeRequests()`
- `approveRxChangeRequest()`
- `denyRxChangeRequest()`
- `bulkSendErx()`
- `bulkPrintRx()`
- `bulkRefillRx()`
- `fetchPrescriptionsEnhanced()`

#### 3. Enhanced Prescriptions Page
**File**: `/frontend/src/pages/PrescriptionsPageEnhanced.tsx` (NEW)
- Complete rewrite with all new features
- Three tabs: Prescriptions, Refill Requests, Rx Change Requests
- Bulk operations in action bar
- Enhanced filters panel
- Modal workflows for approvals/denials

#### 4. Test Suite
**File**: `/frontend/src/pages/__tests__/prescriptionsEnhanced.test.tsx` (NEW)
- Comprehensive test coverage
- Tests for all major features

## Step-by-Step Setup

### Step 1: Run Database Migration
```bash
cd backend
npm run migrate
# Or manually run the SQL file
psql -U your_user -d your_database -f migrations/046_rx_refill_change_requests.sql
```

### Step 2: Verify Backend Routes
The routes should already be registered. Verify by checking:
```bash
curl http://localhost:3000/api/refill-requests
curl http://localhost:3000/api/rx-change-requests
```

### Step 3: Update Frontend Router
Update your router configuration to use the enhanced page:

**Option A: Replace existing page**
```bash
cd frontend/src/pages
mv PrescriptionsPage.tsx PrescriptionsPage.old.tsx
mv PrescriptionsPageEnhanced.tsx PrescriptionsPage.tsx
```

**Option B: Add as new route**
In your router file (e.g., `router/index.tsx`):
```typescript
import { PrescriptionsPageEnhanced } from '../pages/PrescriptionsPageEnhanced';

// Add route
{
  path: '/prescriptions-enhanced',
  element: <PrescriptionsPageEnhanced />,
}
```

### Step 4: Test the Implementation
```bash
cd frontend
npm test -- prescriptionsEnhanced.test.tsx
```

## API Endpoint Reference

### Refill Requests

#### Get All Refill Requests
```http
GET /api/refill-requests?status=pending&patientId=xxx
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

#### Approve Refill Request
```http
POST /api/refill-requests/{id}/approve
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

Response:
```json
{
  "success": true,
  "message": "Refill approved and new prescription created",
  "newPrescriptionId": "uuid"
}
```

#### Deny Refill Request
```http
POST /api/refill-requests/{id}/deny
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "denialReason": "Maximum Refills Reached",
  "denialNotes": "Patient needs evaluation"
}
```

### Rx Change Requests

#### Get All Change Requests
```http
GET /api/rx-change-requests?status=pending_review
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

#### Approve Change Request
```http
POST /api/rx-change-requests/{id}/approve
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "responseNotes": "Approved as requested",
  "approvedAlternativeDrug": "Generic equivalent",
  "approvedAlternativeStrength": "50mg"
}
```

### Bulk Operations

#### Bulk Send eRx
```http
POST /api/prescriptions/bulk/send-erx
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "prescriptionIds": ["uuid1", "uuid2", "uuid3"]
}
```

Response:
```json
{
  "success": true,
  "batchId": "batch-uuid",
  "totalCount": 3,
  "successCount": 2,
  "failureCount": 1,
  "results": {
    "success": ["uuid1", "uuid2"],
    "failed": [
      {
        "id": "uuid3",
        "error": "No pharmacy NCPDP ID"
      }
    ]
  }
}
```

#### Bulk Print
```http
POST /api/prescriptions/bulk/print
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "prescriptionIds": ["uuid1", "uuid2"]
}
```

#### Bulk Refill
```http
POST /api/prescriptions/bulk/refill
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
Content-Type: application/json

{
  "prescriptionIds": ["uuid1", "uuid2"]
}
```

### Enhanced Filtering

#### Filter Prescriptions
```http
GET /api/prescriptions?writtenDateFrom=2026-01-01&writtenDateTo=2026-01-31&erxStatus=success&isControlled=true
Authorization: Bearer {token}
X-Tenant-ID: {tenantId}
```

## Usage Examples

### Example 1: Approve a Refill Request
```typescript
import { approveRefillRequest } from '../api';

const handleApprove = async (refillId: string) => {
  try {
    const result = await approveRefillRequest(
      session.tenantId,
      session.accessToken,
      refillId
    );

    console.log('Refill approved:', result.newPrescriptionId);
    showSuccess('Refill approved successfully');
  } catch (error) {
    showError('Failed to approve refill');
  }
};
```

### Example 2: Send Multiple Prescriptions
```typescript
import { bulkSendErx } from '../api';

const handleBulkSend = async (prescriptionIds: string[]) => {
  try {
    const result = await bulkSendErx(
      session.tenantId,
      session.accessToken,
      prescriptionIds
    );

    showSuccess(`Sent ${result.successCount} of ${result.totalCount} prescriptions`);

    if (result.failureCount > 0) {
      showError(`${result.failureCount} failed to send`);
    }
  } catch (error) {
    showError('Failed to send prescriptions');
  }
};
```

### Example 3: Filter Controlled Substances
```typescript
import { fetchPrescriptionsEnhanced } from '../api';

const loadControlledRx = async () => {
  const result = await fetchPrescriptionsEnhanced(
    session.tenantId,
    session.accessToken,
    {
      isControlled: true,
      status: 'pending',
      writtenDateFrom: '2026-01-01',
      writtenDateTo: '2026-01-31'
    }
  );

  console.log('Controlled substances:', result.prescriptions);
};
```

### Example 4: Deny Change Request
```typescript
import { denyRxChangeRequest } from '../api';

const handleDenyChange = async (changeId: string) => {
  try {
    await denyRxChangeRequest(
      session.tenantId,
      session.accessToken,
      changeId,
      'Requested change not clinically appropriate'
    );

    showSuccess('Change request denied');
  } catch (error) {
    showError('Failed to deny change request');
  }
};
```

## Component Usage

### Using the Enhanced Page
```typescript
import { PrescriptionsPageEnhanced } from './pages/PrescriptionsPageEnhanced';

function App() {
  return (
    <Router>
      <Route path="/prescriptions" element={<PrescriptionsPageEnhanced />} />
    </Router>
  );
}
```

### Key Component Features

#### 1. Tab Navigation
- Automatic switching between Prescriptions, Refills, and Change Requests
- Badge indicators show pending counts
- Data loads automatically on tab switch

#### 2. Bulk Selection
- Click individual checkboxes to select prescriptions
- Click header checkbox to select all
- Selection count displays in bulk action buttons
- Actions only enabled when prescriptions are selected

#### 3. Enhanced Filters
- Date range pickers for written date
- Dropdown for eRx status
- Checkbox for controlled substances
- All filters work together (AND logic)
- Clear Filters button resets everything

#### 4. Modal Workflows
- Approve/Deny refill requests with reason selection
- Approve/Deny change requests with notes
- Create new prescriptions with drug interaction checking
- All modals have proper validation

## Data Flow

### Refill Request Workflow
```
1. Pharmacy → Refill Request Created (POST /api/refill-requests)
2. Provider Views → Refill Requests Tab
3. Provider Actions → Approve or Deny
4. If Approved → New Prescription Created
5. If Denied → Denial Reason Saved
```

### Change Request Workflow
```
1. Pharmacy → Change Request Created (POST /api/rx-change-requests)
2. Provider Views → Change Requests Tab
3. Provider Reviews → Original vs. Requested
4. Provider Actions → Approve, Approve with Modification, or Deny
5. Response Notes → Sent back to pharmacy
```

### Bulk Operation Workflow
```
1. Provider Selects → Multiple prescriptions
2. Provider Clicks → Bulk action button
3. Backend Processes → Each prescription sequentially
4. Batch Record Created → Tracks operation
5. Results Returned → Success/failure counts
```

## Testing

### Run All Tests
```bash
cd frontend
npm test
```

### Run Specific Test
```bash
npm test -- prescriptionsEnhanced.test.tsx
```

### Test Coverage
The test suite covers:
- ✅ Tab switching
- ✅ Data loading
- ✅ Bulk operations
- ✅ Filter application
- ✅ Approval workflows
- ✅ Denial workflows
- ✅ Empty states
- ✅ Statistics display

## Performance Considerations

### Database Queries
- All queries use indexes for performance
- Results limited to 100 records by default
- Filtering happens at database level

### Bulk Operations
- Maximum batch sizes enforced:
  - eRx/Refill: 50 prescriptions
  - Print: 100 prescriptions
- Operations processed sequentially to avoid overwhelming system
- Error handling allows partial success

### Frontend Optimization
- Data loaded only when tab is active
- Filters debounced to avoid excessive API calls
- Selection state managed efficiently with Set()
- Modals lazy-loaded

## Troubleshooting

### Issue: Migration fails
**Solution**: Check database connection and ensure PostgreSQL is running
```bash
psql -U your_user -d your_database -c "SELECT 1"
```

### Issue: Routes not found (404)
**Solution**: Verify routers are registered in `backend/src/index.ts`
```typescript
console.log('Registered routes:');
app._router.stack.forEach((r) => {
  if (r.route) console.log(r.route.path);
});
```

### Issue: TypeScript errors
**Solution**: Run type checking
```bash
cd frontend
npm run type-check
```

### Issue: Tests failing
**Solution**: Update test mocks if API signatures changed
```typescript
// In test file
vi.mocked(api.fetchPrescriptionsEnhanced).mockResolvedValue({
  prescriptions: []
});
```

## Next Steps

1. **Deploy Migration**: Run on staging/production databases
2. **Test Integration**: Verify with real data
3. **User Training**: Train staff on new features
4. **Monitor Performance**: Watch query performance
5. **Gather Feedback**: Collect user feedback for improvements

## Support

For questions or issues:
- Check this guide first
- Review the test files for examples
- Examine the API route files for endpoint details
- Review the TypeScript types for data structures

## Additional Resources

- [Main Summary Document](./RX_PRESCRIPTIONS_ENHANCEMENT_SUMMARY.md)
- [ModMed EMA Documentation](https://www.modmed.com)
- [Surescripts Integration Guide](https://surescripts.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
