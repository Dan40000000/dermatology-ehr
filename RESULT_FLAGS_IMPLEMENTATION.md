# Result Flags Implementation

## Overview

This document describes the comprehensive Result Flags feature implemented for the dermatology EHR application. Result flags provide clinical interpretation markers for pathology/lab results and radiology/imaging results, matching ModMed EMA functionality.

## Features Implemented

### 1. Result Flag Types

The following flag types are supported for clinical interpretation:

#### Pathology-Specific Flags
- **Benign** - Non-cancerous findings
- **Inconclusive** - Results require further investigation
- **Precancerous** - Dysplastic or precancerous lesions
- **Cancerous/Malignant** - Confirmed malignancy

#### Lab Result Flags
- **Normal (WNL)** - Within Normal Limits
- **Abnormal** - Outside normal range
- **Low** - Below normal range
- **High** - Above normal range
- **Out of Range** - Significantly outside reference range
- **Panic Value (Critical)** - Life-threatening value requiring immediate attention
- **None/Not Specified** - Default state

### 2. Visual Indicators

Color-coded badge system for quick visual identification:

- **Red** (#dc2626) - Cancerous/Malignant, Panic Value (Critical)
- **Orange** (#fee2e2) - Precancerous, Abnormal, Out of Range
- **Yellow** (#fef3c7) - Inconclusive, High, Low
- **Green** (#d1fae5) - Normal (WNL), Benign
- **Gray** (#f3f4f6) - None/Not Specified

### 3. Filter Functionality

#### Multi-Select Filters
- Checkbox-based filter panel with grouped flag types:
  - Critical (Cancerous, Panic Value)
  - Warning (Precancerous, Abnormal, Out of Range)
  - Caution (Inconclusive, High, Low)
  - Normal (Normal, Benign)

#### Quick Filter Buttons
- **Critical Results** - Instantly filter for Cancerous/Panic Value flags
- **Abnormal Results** - Filter for Precancerous/Abnormal/Out of Range flags
- **Clear Filters** - Remove all flag filters

### 4. Results Flag Column

Added Result Flag column to both:
- **Path/Labs Page** - Displays flags for pathology and laboratory orders
- **Radiology/Other Page** - Displays flags for imaging/radiology orders

Columns are sortable and clickable for editing.

### 5. Set/Update Flag Action

Interactive flag management:
- Click on any flag badge to open the update modal
- Dropdown selector with grouped flag types
- Optional change reason field for audit trail
- Displays current flag status
- Shows patient and order context

### 6. Audit Trail

Comprehensive audit logging for all flag changes:
- Records old and new flag values
- Tracks user who made the change
- Timestamps all changes
- Optional change reason
- Accessible via API endpoint

## Database Schema

### Tables Modified

#### `orders` table
```sql
ALTER TABLE orders
  ADD COLUMN result_flag result_flag_type DEFAULT 'none',
  ADD COLUMN result_flag_updated_at timestamp,
  ADD COLUMN result_flag_updated_by uuid REFERENCES providers(id);
```

#### `lab_orders` table
```sql
ALTER TABLE lab_orders
  ADD COLUMN result_flag result_flag_type DEFAULT 'none',
  ADD COLUMN result_flag_updated_at timestamp,
  ADD COLUMN result_flag_updated_by uuid REFERENCES providers(id);
```

#### `dermpath_reports` table
```sql
ALTER TABLE dermpath_reports
  ADD COLUMN result_flag result_flag_type DEFAULT 'none',
  ADD COLUMN result_flag_updated_at timestamp,
  ADD COLUMN result_flag_updated_by uuid REFERENCES providers(id);
```

### New Tables

#### `result_flag_audit` table
```sql
CREATE TABLE result_flag_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  order_id uuid,
  lab_order_id uuid REFERENCES lab_orders(id),
  dermpath_report_id uuid REFERENCES dermpath_reports(id),
  old_flag result_flag_type,
  new_flag result_flag_type NOT NULL,
  changed_by uuid NOT NULL REFERENCES providers(id),
  change_reason text,
  created_at timestamp DEFAULT current_timestamp
);
```

### Enum Type
```sql
CREATE TYPE result_flag_type AS ENUM (
  'benign',
  'inconclusive',
  'precancerous',
  'cancerous',
  'normal',
  'abnormal',
  'low',
  'high',
  'out_of_range',
  'panic_value',
  'none'
);
```

## API Endpoints

### Update Order Result Flag
```
PATCH /api/result-flags/orders/:id
```

**Request Body:**
```json
{
  "resultFlag": "abnormal",
  "changeReason": "Lab values outside normal range"
}
```

**Response:**
```json
{
  "id": "order-uuid",
  "resultFlag": "abnormal",
  "resultFlagUpdatedAt": "2026-01-15T10:30:00Z"
}
```

### Update Lab Order Result Flag
```
PATCH /api/result-flags/lab-orders/:id
```

**Request Body:**
```json
{
  "resultFlag": "cancerous",
  "changeReason": "Pathology confirms melanoma"
}
```

### Get Audit Trail
```
GET /api/result-flags/audit?order_id=xxx&limit=50
```

**Response:**
```json
[
  {
    "id": "audit-uuid",
    "orderId": "order-uuid",
    "oldFlag": "none",
    "newFlag": "abnormal",
    "changedBy": "provider-uuid",
    "changedByName": "Dr. Smith",
    "changeReason": "Lab values outside normal range",
    "createdAt": "2026-01-15T10:30:00Z"
  }
]
```

### Get Statistics
```
GET /api/result-flags/stats
```

**Response:**
```json
{
  "orders": [
    { "result_flag": "normal", "count": 50 },
    { "result_flag": "abnormal", "count": 10 }
  ],
  "labOrders": [
    { "result_flag": "benign", "count": 30 },
    { "result_flag": "cancerous", "count": 5 }
  ]
}
```

## Frontend Components

### ResultFlagBadge
Display component for showing flag badges with color coding.

**Usage:**
```tsx
<ResultFlagBadge flag="abnormal" size="sm" showLabel={true} />
```

**Props:**
- `flag` - The result flag type
- `size` - Badge size: 'sm' | 'md' | 'lg'
- `showLabel` - Whether to show text label

### ResultFlagSelect
Dropdown selector for choosing a result flag.

**Usage:**
```tsx
<ResultFlagSelect
  value={currentFlag}
  onChange={(flag) => setCurrentFlag(flag)}
  disabled={false}
/>
```

### ResultFlagFilter
Multi-select checkbox filter panel with grouped flag types.

**Usage:**
```tsx
<ResultFlagFilter
  selectedFlags={selectedFlags}
  onChange={(flags) => setSelectedFlags(flags)}
/>
```

### QuickFilterButtons
Quick access buttons for common filter scenarios.

**Usage:**
```tsx
<QuickFilterButtons
  onFilterCritical={() => filterCritical()}
  onFilterAbnormal={() => filterAbnormal()}
  onClearFilters={() => clearFilters()}
/>
```

## Files Modified/Created

### Backend
- `backend/src/db/migrations/018_result_flags.sql` - Database migration
- `backend/src/routes/resultFlags.ts` - New API endpoints
- `backend/src/routes/orders.ts` - Updated to include result_flag
- `backend/src/routes/labOrders.ts` - Updated to include result_flag
- `backend/src/index.ts` - Registered result flags router
- `backend/src/routes/__tests__/resultFlags.test.ts` - Tests

### Frontend
- `frontend/src/components/ResultFlagBadge.tsx` - New component
- `frontend/src/api/resultFlags.ts` - API client functions
- `frontend/src/types/index.ts` - Added ResultFlagType
- `frontend/src/pages/LabsPage.tsx` - Updated with flags
- `frontend/src/pages/RadiologyPage.tsx` - Updated with flags
- `frontend/src/components/__tests__/ResultFlagBadge.test.tsx` - Tests

## Testing

### Backend Tests
Run backend tests:
```bash
cd backend
npm test src/routes/__tests__/resultFlags.test.ts
```

Tests cover:
- Updating flags for orders and lab orders
- Authorization and authentication
- Validation of flag types
- Audit trail creation
- Error handling and rollback
- Statistics endpoint

### Frontend Tests
Run frontend tests:
```bash
cd frontend
npm test ResultFlagBadge.test.tsx
```

Tests cover:
- Badge rendering and color coding
- Select dropdown functionality
- Filter checkbox interactions
- Quick filter buttons
- Size and display options

## Migration Instructions

### 1. Run Database Migration
```bash
cd backend
npm run migrate
# or manually apply: src/db/migrations/018_result_flags.sql
```

### 2. Restart Backend Server
```bash
cd backend
npm run dev
```

### 3. Rebuild Frontend
```bash
cd frontend
npm run build
```

## Usage Examples

### Setting a Result Flag
1. Navigate to Path/Labs or Radiology page
2. Locate the order in the results table
3. Click on the flag badge in the "Result Flag" column
4. Select the appropriate flag from the dropdown
5. Optionally add a change reason
6. Click "Update Flag"

### Filtering by Flags
1. In the filter panel, locate "Result Flags" section
2. Click "Show Filters" to expand detailed filters
3. Check desired flag types, or use quick filter buttons:
   - "Critical Results" for urgent flags
   - "Abnormal Results" for warning flags
4. Applied flags show as badges below quick filters
5. Click "Clear Filters" to remove flag filters

### Viewing Audit Trail
Use the API endpoint to retrieve flag change history:
```javascript
const audit = await getResultFlagAudit(
  tenantId,
  accessToken,
  { order_id: orderId, limit: 50 }
);
```

## Security Considerations

- Result flag updates require authentication
- Only providers and admins can update flags
- All changes are logged in audit trail
- Role-based access control enforced via middleware
- Tenant isolation maintained throughout

## Performance Optimizations

- Indexes on result_flag columns for fast filtering
- Audit table indexed on foreign keys and created_at
- Efficient query patterns avoid N+1 problems
- Frontend uses React hooks for optimal rendering

## Future Enhancements

Potential improvements:
- Automated flag suggestions based on result values
- Notification system for critical flags
- Dashboard widget showing flag distribution
- Export functionality for flagged results
- Integration with clinical decision support
- Bulk flag updates for multiple results
- Flag templates for common scenarios
- Mobile app support for flag management

## Support

For issues or questions:
- Review this documentation
- Check test files for usage examples
- Refer to inline code comments
- Contact development team

## License

This implementation is part of the dermatology EHR application and subject to its licensing terms.
