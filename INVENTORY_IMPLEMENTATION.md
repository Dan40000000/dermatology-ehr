# Inventory Usage Tracking Implementation

This document describes the complete implementation of inventory usage tracking during appointments for the dermatology EHR application.

## Overview

The inventory usage tracking feature allows providers and staff to:
- Track inventory items (medications, supplies, cosmetics, equipment)
- Record usage of inventory items during encounters/appointments
- Automatically deduct inventory quantities when items are used
- View usage history and audit trails
- Get alerts for low stock and expiring items
- Track costs associated with inventory usage

## Database Schema

### Migration File
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/db/migrations/017_inventory_management.sql`

### Tables Created

1. **inventory_items**
   - Tracks all inventory items in the system
   - Fields: id, tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, expiration_date, lot_number
   - Categories: medication, supply, cosmetic, equipment
   - Includes quantity validation (quantity >= 0)

2. **inventory_usage**
   - Records each use of inventory items
   - Fields: id, tenant_id, item_id, encounter_id, appointment_id, patient_id, provider_id, quantity_used, unit_cost_cents, notes, used_at
   - Links to encounters, appointments, and patients
   - Stores historical unit cost for accurate reporting

3. **inventory_adjustments**
   - Audit trail for manual inventory adjustments
   - Fields: id, tenant_id, item_id, adjustment_quantity, reason, notes, created_at, created_by
   - Reasons: received, expired, damaged, adjustment, correction, used

### Database Triggers

1. **decrease_inventory_on_usage()**
   - Automatically decreases inventory quantity when usage is recorded
   - Validates sufficient inventory is available
   - Prevents negative inventory quantities

2. **adjust_inventory_quantity()**
   - Automatically adjusts inventory quantity when adjustments are recorded
   - Validates resulting quantity is not negative

### Database Views

1. **inventory_items_with_stats**
   - Shows inventory items with usage statistics
   - Includes total_used, usage_count, total_usage_cost_cents
   - Flags items needing reorder and expiring soon

### Database Functions

1. **get_low_stock_items(tenant_id)**
   - Returns items where quantity <= reorder_level
   - Ordered by quantity ascending

2. **get_expiring_items(tenant_id, days_threshold)**
   - Returns items expiring within specified days (default 90)
   - Ordered by expiration_date ascending

## Backend API

### Inventory Routes
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/routes/inventory.ts`

**Base Path:** `/api/inventory`

#### Endpoints

1. **GET /**
   - Get all inventory items
   - Query params: category, lowStock
   - Auth: Required
   - Returns: { items: InventoryItem[] }

2. **GET /:id**
   - Get single inventory item
   - Auth: Required
   - Returns: { item: InventoryItem }

3. **POST /**
   - Create new inventory item
   - Auth: Required (admin, provider)
   - Body: InventoryItemSchema
   - Returns: { id: string }

4. **PUT /:id**
   - Update inventory item
   - Auth: Required (admin, provider)
   - Body: Partial<InventoryItemSchema>
   - Returns: { success: boolean }

5. **DELETE /:id**
   - Delete inventory item
   - Auth: Required (admin only)
   - Validates no usage history exists
   - Returns: { success: boolean }

6. **POST /adjust**
   - Manual inventory adjustment
   - Auth: Required (admin, provider, ma)
   - Body: { itemId, adjustmentQuantity, reason, notes }
   - Returns: { id: string }

7. **GET /:id/adjustments**
   - Get adjustment history for item
   - Auth: Required
   - Returns: { adjustments: InventoryAdjustment[] }

8. **GET /alerts/low-stock**
   - Get items at or below reorder level
   - Auth: Required
   - Returns: { items: InventoryItem[] }

9. **GET /alerts/expiring**
   - Get items expiring soon
   - Auth: Required
   - Query params: days (default 90)
   - Returns: { items: InventoryItem[] }

10. **GET /:id/usage**
    - Get usage history for item
    - Auth: Required
    - Query params: limit (default 50)
    - Returns: { usage: InventoryUsage[] }

11. **GET /stats/summary**
    - Get inventory statistics
    - Auth: Required
    - Returns: { totalItems, totalValueCents, lowStockCount, expiringCount }

### Inventory Usage Routes
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/routes/inventoryUsage.ts`

**Base Path:** `/api/inventory-usage`

#### Endpoints

1. **POST /**
   - Record single inventory usage
   - Auth: Required (provider, ma, admin)
   - Body: { itemId, encounterId?, appointmentId?, patientId, providerId, quantityUsed, notes? }
   - Automatically deducts from inventory
   - Returns: { id: string }

2. **POST /batch**
   - Record multiple inventory usages at once
   - Auth: Required (provider, ma, admin)
   - Body: { encounterId?, appointmentId?, patientId, providerId, items: [{ itemId, quantityUsed, notes? }] }
   - Transactional - all or nothing
   - Returns: { ids: string[], count: number }

3. **GET /**
   - Get usage history with filters
   - Auth: Required
   - Query params: patientId, encounterId, appointmentId, providerId, itemId, limit
   - Returns: { usage: InventoryUsage[] }

4. **GET /encounter/:encounterId**
   - Get all usage for specific encounter
   - Auth: Required
   - Returns: { usage: InventoryUsage[] }

5. **GET /patient/:patientId/stats**
   - Get usage statistics for patient
   - Auth: Required
   - Returns: { stats: PatientInventoryStats[] }

6. **GET /stats/by-category**
   - Get usage statistics by category
   - Auth: Required
   - Query params: startDate?, endDate?
   - Returns: { stats: CategoryStats[] }

7. **GET /stats/top-items**
   - Get most used items
   - Auth: Required
   - Query params: limit (default 10), startDate?, endDate?
   - Returns: { items: ItemUsageStats[] }

8. **DELETE /:id**
   - Delete usage record (admin only, for corrections)
   - Auth: Required (admin only)
   - Adds quantity back to inventory
   - Returns: { success: boolean }

## Frontend Components

### API Functions
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/api.ts`

Added comprehensive TypeScript interfaces and functions for:
- InventoryItem
- InventoryUsage
- InventoryAdjustment
- All CRUD operations for inventory
- All usage recording and querying operations

### Inventory Components
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/components/inventory/`

1. **InventoryUsageModal.tsx**
   - Modal for selecting and recording inventory usage during encounters
   - Features:
     - Search and filter inventory items
     - Select multiple items with quantities
     - Add notes for each item
     - Batch recording
     - Real-time validation
   - Props: isOpen, onClose, encounterId?, appointmentId?, patientId, providerId, onSuccess?

2. **InventoryUsageList.tsx**
   - Displays inventory usage for an encounter
   - Features:
     - List all items used with quantities and costs
     - Show total cost summary
     - Link to add more items
     - Real-time updates
   - Props: encounterId, onOpenUsageModal?

3. **index.ts**
   - Exports all inventory components

### Inventory Page
**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/pages/InventoryPage.tsx`

**Status:** Already exists with mock data. Ready to be updated to use real API.

**Required Updates:**
```typescript
// Replace mock data with API calls
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchInventoryItems, createInventoryItem, updateInventoryItem, adjustInventory } from '../api';

// In component:
const { session } = useAuth();
const [inventory, setInventory] = useState<InventoryItem[]>([]);

useEffect(() => {
  if (session) {
    loadInventory();
  }
}, [session]);

const loadInventory = async () => {
  if (!session) return;
  try {
    const { items } = await fetchInventoryItems(session.tenantId, session.accessToken);
    setInventory(items);
  } catch (error) {
    showError('Failed to load inventory');
  }
};
```

## Integration with Encounters

To integrate inventory usage into the EncounterPage:

**Location:** `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/pages/EncounterPage.tsx`

### Example Integration

```typescript
import { InventoryUsageModal, InventoryUsageList } from '../components/inventory';

// Add state
const [showInventoryModal, setShowInventoryModal] = useState(false);

// Add to the encounter UI (in the appropriate section)
<div className="encounter-section">
  <InventoryUsageList
    encounterId={encounterId}
    onOpenUsageModal={() => setShowInventoryModal(true)}
  />
</div>

// Add modal
<InventoryUsageModal
  isOpen={showInventoryModal}
  onClose={() => setShowInventoryModal(false)}
  encounterId={encounterId}
  patientId={patient.id}
  providerId={session.user.id}
  onSuccess={() => {
    // Refresh inventory usage list
    (window as any).__refreshInventoryUsage?.();
  }}
/>
```

## Multi-Tenancy & Security

All routes and database queries are tenant-aware:
- Tenant ID required in all requests via header
- Database queries filter by tenant_id
- Foreign key constraints ensure data isolation
- Audit logging for all inventory changes

## Audit Trail

All inventory operations are logged:
- Item creation, updates, deletions
- Inventory adjustments
- Usage recording
- Batch operations

Audit log entries include:
- Tenant ID
- User ID (actor)
- Action type
- Entity type and ID
- Timestamp
- Optional metadata

## Running Migrations

To apply the inventory migration:

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run migrate
```

The migration system will automatically detect and run `017_inventory_management.sql`.

## Testing the Feature

### Backend Testing

1. **Start the backend server:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Test endpoints using curl or Postman:**
   ```bash
   # Create an inventory item
   curl -X POST http://localhost:4000/api/inventory \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Lidocaine 1%",
       "category": "medication",
       "quantity": 50,
       "reorderLevel": 20,
       "unitCostCents": 1250
     }'

   # Record usage
   curl -X POST http://localhost:4000/api/inventory-usage \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "Content-Type: application/json" \
     -d '{
       "itemId": "ITEM_UUID",
       "encounterId": "ENCOUNTER_ID",
       "patientId": "PATIENT_ID",
       "providerId": "PROVIDER_ID",
       "quantityUsed": 2,
       "notes": "Used for lesion biopsy"
     }'
   ```

### Frontend Testing

1. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Navigate to Inventory Page:**
   - Should display inventory items from database
   - Test creating, editing, adjusting items

3. **Test in Encounter:**
   - Open an encounter
   - Find the Inventory Usage section
   - Click "Use Items" button
   - Select items and record usage
   - Verify items appear in usage list
   - Verify quantities are deducted

## Features Highlights

### Automatic Inventory Deduction
- When usage is recorded, inventory quantity is automatically decreased
- Database triggers ensure data integrity
- Prevents negative inventory
- Shows clear error messages when insufficient stock

### Usage History & Audit Trail
- Every usage is recorded with timestamp
- Links to patient, provider, and encounter
- Historical cost tracking (unit cost at time of use)
- Complete audit trail of adjustments

### Low Stock & Expiration Alerts
- Automatic detection of low stock items
- Expiration date tracking
- Configurable alert thresholds
- Dashboard notifications

### Batch Operations
- Record multiple items used in one operation
- Transactional integrity (all or nothing)
- Improved user experience
- Reduced API calls

### Cost Tracking
- Unit cost stored at time of use
- Total cost calculations per encounter
- Usage statistics by category
- Top items reports

## Future Enhancements

Potential improvements:
1. Purchase order management
2. Vendor integration
3. Barcode scanning
4. Inventory forecasting
5. Automated reordering
6. Integration with billing/charges
7. Lot number tracking for recalls
8. Temperature monitoring for refrigerated items
9. Multi-location inventory transfers
10. Inventory valuation reports

## Support

For questions or issues:
1. Check database logs for migration issues
2. Review API error responses
3. Check browser console for frontend errors
4. Verify authentication and permissions
5. Ensure tenant ID is correctly set
