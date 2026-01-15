# Orders Module Enhancements

This document describes the enhancements made to the Orders module based on the ModMed EMA gap analysis.

## Overview

The Orders module has been significantly enhanced with advanced filtering, grouping, and organization capabilities to match industry-standard EHR functionality.

## New Features

### 1. Quick Filters System

**Location**: `frontend/src/components/orders/QuickFilters.tsx`

Users can now save frequently used filter combinations as "Quick Filters" for one-click access.

**Features**:
- Save current filter settings with a custom name
- Load saved filters with a single click
- Edit filter names
- Delete saved filters
- Persistent storage using localStorage
- Multiple saved filters support

**Usage**:
1. Configure your desired filters (order types, statuses, priorities, etc.)
2. Click "Save Current Filter"
3. Enter a name for your filter
4. Click "Save"
5. The filter appears in the Quick Filters section for future use

### 2. Multi-Select Order Type Filters

**Location**: `frontend/src/components/orders/OrderFilters.tsx`

Instead of a single dropdown, users can now select multiple order types simultaneously using checkboxes.

**Supported Order Types**:
- Follow Up
- Infusion
- Injection
- Labs
- Pathology
- Radiology
- Referral
- Surgery

**Features**:
- Individual checkbox selection
- "Select All" option to quickly enable/disable all types
- Visual feedback for selected types

### 3. Priority Filters

**Priority Levels**:
- Normal (gray)
- High (orange)
- STAT (red)

**Features**:
- Checkbox-based multi-select
- Color-coded labels matching priority urgency
- "Select All" option
- Visual priority indicators in the orders grid

**Visual Indicators**:
- STAT orders: Red background badge, light red row background
- High priority: Orange background badge
- Normal priority: Gray background badge

### 4. Enhanced Status Filters

**Statuses**:
- Open
- Sent
- In Progress
- Closed
- Canceled

**Features**:
- Multi-select checkboxes instead of single dropdown
- "Select All" option
- Supports filtering by multiple statuses simultaneously

### 5. Group By Feature

**Location**: `frontend/src/components/orders/GroupedOrdersTable.tsx`

Orders can now be grouped and displayed in collapsible sections.

**Grouping Options**:
- None (flat list)
- Patient (group by patient name)
- Provider (group by ordering provider)

**Features**:
- Collapsible/expandable groups
- Group headers show count of orders
- Visual hierarchy with color-coded headers
- Checkbox selection per group
- Maintains all filtering capabilities within groups

### 6. Refresh View Button

A dedicated "Refresh View" button manually refreshes the orders data without page reload.

**Location**: Action bar at top of page

## Technical Implementation

### Frontend Components

#### New Components Created:
1. `QuickFilters.tsx` - Manages saved filter presets
2. `OrderFilters.tsx` - Consolidated filter panel with all filter options
3. `GroupedOrdersTable.tsx` - Handles grouped display of orders
4. `OrdersPageEnhanced.tsx` - Enhanced orders page with all new features

#### Type Definitions

New TypeScript types in `frontend/src/types/index.ts`:
```typescript
export type OrderType = 'followup' | 'infusion' | 'injection' | 'lab' |
                        'pathology' | 'radiology' | 'referral' | 'surgery';

export type OrderStatus = 'open' | 'sent' | 'in-progress' | 'closed' | 'canceled';

export type OrderPriority = 'normal' | 'high' | 'stat';

export type OrderGroupBy = 'none' | 'patient' | 'provider';

export interface QuickFilter {
  id: string;
  name: string;
  orderTypes: OrderType[];
  statuses: OrderStatus[];
  priorities: OrderPriority[];
  searchTerm?: string;
  groupBy?: OrderGroupBy;
}

export interface OrderFilters {
  orderTypes: OrderType[];
  statuses: OrderStatus[];
  priorities: OrderPriority[];
  searchTerm: string;
  groupBy: OrderGroupBy;
}
```

### Backend Enhancements

#### Database Migration

**File**: `backend/src/db/migrations/019_orders_enhancements.sql`

Changes:
- Added `priority` column (text, default 'normal')
- Added `notes` column (text, nullable)
- Added `provider_name` column for denormalization
- Created indexes on type, status, priority for performance
- Created composite indexes for common query patterns

#### API Enhancements

**File**: `backend/src/routes/orders.ts`

Enhanced GET `/orders` endpoint:
- Query parameters: `orderTypes`, `statuses`, `priorities`, `search`, `limit`
- Supports comma-separated values for multi-select filters
- Uses PostgreSQL array operators for efficient filtering
- Returns provider name with orders

Enhanced POST `/orders` endpoint:
- Accepts `priority` and `notes` fields
- Validates priority values using Zod schema
- Denormalizes provider name for query performance

### Data Persistence

**Quick Filters Storage**:
- Stored in browser localStorage
- Key: `orders_quick_filters`
- Format: JSON array of QuickFilter objects
- Persists across browser sessions
- Survives page refreshes

## Testing

### Unit Tests

1. **QuickFilters Component** (`__tests__/QuickFilters.test.tsx`)
   - Save/load/edit/delete filter functionality
   - localStorage persistence
   - Multiple filters support
   - Empty state handling

2. **OrderFilters Component** (`__tests__/OrderFilters.test.tsx`)
   - Multi-select functionality for all filter types
   - Select All behavior
   - Clear filters functionality
   - Individual filter toggling

### Integration Tests

**File**: `frontend/src/pages/__tests__/OrdersPageEnhanced.test.tsx`

Tests:
- Full page rendering with data
- Filter interactions
- Quick filter save/load
- Grouping functionality
- Order selection
- Data refresh
- New order creation

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test QuickFilters.test.tsx

# Run with coverage
npm test -- --coverage
```

## Migration Guide

### For Existing Installations

1. **Run Database Migration**:
   ```bash
   cd backend
   npm run migrate
   ```

2. **Update Frontend**:
   The enhanced OrdersPage is available as `OrdersPageEnhanced.tsx`. To use it:

   In your routing configuration, import and use the enhanced page:
   ```typescript
   import { OrdersPageEnhanced } from './pages/OrdersPageEnhanced';

   // Replace existing OrdersPage with OrdersPageEnhanced
   ```

3. **No Data Migration Required**:
   - Existing orders will have `priority` set to 'normal' automatically
   - No data loss occurs
   - New fields are optional

### Backwards Compatibility

- The enhanced page is fully backwards compatible
- Old API calls still work
- New query parameters are optional
- Existing orders display correctly with default values

## Usage Examples

### Example 1: Filter STAT Lab Orders

1. In the Order Type section, check "Labs"
2. In the Priority section, check "STAT"
3. Click "Save Current Filter" and name it "STAT Labs"
4. Future access: Click "STAT Labs" in Quick Filters section

### Example 2: View In-Progress Orders by Provider

1. In the Status section, check "In Progress"
2. In the Group By section, select "Provider"
3. Orders are now grouped by provider with collapsible sections

### Example 3: Search and Filter

1. Enter search term in Search field (e.g., "biopsy")
2. Select relevant Order Types (e.g., Pathology)
3. Select desired Statuses
4. Results update in real-time

## Performance Considerations

### Database Indexes

The migration adds several indexes for optimal query performance:
- Single column indexes on type, status, priority
- Composite index on (status, priority) for common queries
- Indexes include tenant_id for multi-tenant efficiency

### Query Optimization

- Provider name denormalization reduces joins
- Array operators (ANY) efficiently handle multi-value filters
- Limit clause prevents large result sets
- Indexes support all filter combinations

### Frontend Optimization

- localStorage for Quick Filters prevents server round-trips
- Collapsible groups improve rendering performance
- Filters applied client-side for instant feedback
- Lazy loading ready for future enhancements

## Future Enhancements

Potential additions based on user feedback:

1. **Date Range Filters**: Filter orders by creation date range
2. **Bulk Actions**: Apply status changes to multiple selected orders
3. **Export Functionality**: Export filtered orders to CSV/PDF
4. **Advanced Search**: Search across patient names, order details, notes
5. **Order Templates**: Pre-configured order types with default details
6. **Notifications**: Alert users when STAT orders are overdue
7. **Custom Sort Options**: Sort by patient, priority, date, etc.
8. **Column Customization**: Show/hide columns based on user preference

## Support

For questions or issues with the Orders module enhancements:

1. Check this documentation
2. Review test files for usage examples
3. Examine component source code for implementation details
4. Contact the development team for additional support

## API Documentation

### GET /orders

**Query Parameters**:
- `orderTypes` (string, optional): Comma-separated order types
  - Example: `orderTypes=lab,pathology,radiology`
- `statuses` (string, optional): Comma-separated statuses
  - Example: `statuses=open,in-progress`
- `priorities` (string, optional): Comma-separated priorities
  - Example: `priorities=high,stat`
- `search` (string, optional): Search term for details/notes
  - Example: `search=biopsy`
- `limit` (number, optional, default: 100): Maximum results
  - Example: `limit=50`

**Response**:
```json
{
  "orders": [
    {
      "id": "order-123",
      "patientId": "patient-456",
      "providerId": "provider-789",
      "providerName": "Dr. Smith",
      "type": "lab",
      "status": "open",
      "priority": "normal",
      "details": "CBC with differential",
      "notes": "Fasting required",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### POST /orders

**Request Body**:
```json
{
  "patientId": "patient-456",
  "providerId": "provider-789",
  "type": "lab",
  "status": "open",
  "priority": "stat",
  "details": "CBC with differential",
  "notes": "Urgent - patient symptomatic"
}
```

**Response**:
```json
{
  "id": "order-123"
}
```

## Changelog

### Version 1.0 (2024-01-15)

Initial release with:
- Quick Filters system
- Multi-select order type filters
- Priority filters with visual indicators
- Enhanced status filters
- Group By functionality (Patient/Provider)
- Refresh View button
- Database migrations
- Comprehensive test coverage
