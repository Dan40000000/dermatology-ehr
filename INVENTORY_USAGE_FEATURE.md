# Inventory Usage Tracking Feature

## Overview
This feature enables healthcare providers (doctors/nurses) to track inventory usage during patient appointments. It automatically deducts items from inventory quantities and maintains a complete audit trail of usage.

## Architecture

### Database Layer
The feature uses three main tables defined in migration `017_inventory_management.sql`:

1. **inventory_items** - Stores inventory items (medications, supplies, cosmetics, equipment)
2. **inventory_usage** - Records each usage of an inventory item during appointments/encounters
3. **inventory_adjustments** - Tracks manual inventory adjustments

#### Automatic Inventory Deduction
A PostgreSQL trigger `trigger_decrease_inventory` automatically decreases inventory quantity when a usage record is inserted. It also validates that sufficient quantity is available before allowing the usage.

### Backend API Endpoints

All inventory endpoints are mounted at `/api/inventory`

#### Usage Endpoints (New)
- **POST /api/inventory/usage** - Record inventory usage during appointment
  - Validates item exists and has sufficient quantity
  - Automatically deducts from inventory via database trigger
  - Records usage with patient, provider, appointment details
  - Access: Admin, Provider, MA roles

- **GET /api/inventory/usage** - Fetch usage records with filters
  - Query params: `patientId`, `appointmentId`, `encounterId`, `limit`
  - Returns usage with patient/provider names
  - Access: All authenticated users

- **GET /api/inventory/usage/:id** - Get single usage record
  - Access: All authenticated users

- **DELETE /api/inventory/usage/:id** - Void usage record (restores quantity)
  - Access: Admin only
  - Uses transaction to ensure data consistency

#### Item Endpoints (Existing)
- GET /api/inventory - List all items
- GET /api/inventory/:id - Get item with usage stats
- POST /api/inventory - Create new item
- PUT /api/inventory/:id - Update item
- DELETE /api/inventory/:id - Delete item (prevents if has usage)
- POST /api/inventory/adjust - Manual quantity adjustment
- GET /api/inventory/:id/adjustments - Get adjustment history
- GET /api/inventory/:id/usage - Get usage history for item
- GET /api/inventory/stats/summary - Get inventory statistics
- GET /api/inventory/alerts/low-stock - Get low stock items
- GET /api/inventory/alerts/expiring - Get expiring items

### Frontend Implementation

#### API Client (`/frontend/src/api.ts`)
```typescript
// Record inventory usage
recordInventoryUsage(tenantId, accessToken, {
  itemId: string,
  quantityUsed: number,
  patientId: string,
  providerId: string,
  appointmentId?: string,
  encounterId?: string,
  notes?: string
})

// Fetch usage records
fetchAllInventoryUsage(tenantId, accessToken, {
  patientId?: string,
  appointmentId?: string,
  encounterId?: string,
  limit?: number
})

// Delete/void usage record
deleteInventoryUsage(tenantId, accessToken, usageId)
```

#### Components

**InventoryUsageModal** (`/components/inventory/InventoryUsageModal.tsx`)
- Modal dialog for selecting and recording inventory usage
- Features:
  - Search and filter inventory items
  - Select multiple items with quantities
  - Add notes per item
  - Shows available quantity and unit cost
  - Records usage individually for each item
  - Validates quantity availability before submission

**InventoryUsageList** (`/components/inventory/InventoryUsageList.tsx`)
- Displays list of inventory items used
- Features:
  - Shows item name, category, quantity used
  - Displays cost per item and total cost
  - Shows usage timestamp
  - Button to open usage modal
  - Supports both appointment and encounter context

#### Integration - Appointment Flow Page

The inventory usage feature is integrated into `AppointmentFlowPage.tsx`:

1. **Availability**: Inventory recording is available when appointment status is:
   - checked-in
   - roomed
   - in-progress
   - checkout
   - completed

2. **Access Points**:
   - "Record Inventory" button in appointment detail modal footer
   - "+ Use Items" button in inventory usage list section
   - Empty state button when no items used yet

3. **User Flow**:
   1. Staff opens appointment details from flow page
   2. Clicks "Record Inventory" button
   3. Modal opens with searchable inventory list
   4. Selects items and quantities
   5. Adds optional notes
   6. Clicks "Record Usage"
   7. System validates availability
   8. Deducts from inventory automatically
   9. List refreshes to show new usage
   10. Total cost is calculated and displayed

## Data Flow

### Recording Usage
```
User Action → InventoryUsageModal
    ↓
recordInventoryUsage API call
    ↓
POST /api/inventory/usage (Backend)
    ↓
Validate item exists & quantity available
    ↓
INSERT into inventory_usage table
    ↓
Database trigger fires (trigger_decrease_inventory)
    ↓
UPDATE inventory_items SET quantity = quantity - used
    ↓
Audit log entry created
    ↓
Success response to frontend
    ↓
InventoryUsageList refreshes
```

### Viewing Usage
```
Component Mount/Refresh → InventoryUsageList
    ↓
fetchAllInventoryUsage API call
    ↓
GET /api/inventory/usage?appointmentId=xxx
    ↓
JOIN inventory_usage with inventory_items, patients, users
    ↓
Return enriched usage records
    ↓
Display in list with totals
```

## Security & Validation

### Backend Validation
- Authentication required for all endpoints
- Role-based access control:
  - Admin, Provider, MA can record usage
  - Only Admin can void usage records
- Schema validation using Zod
- Quantity validation (must be positive, cannot exceed available)
- Tenant isolation enforced on all queries

### Frontend Validation
- Quantity input limited to available stock
- Minimum quantity of 1
- Maximum quantity set to item's available quantity
- Real-time feedback on insufficient stock

## Error Handling

### Insufficient Inventory
If quantity is not available:
- Backend returns 400 error with available quantity
- Frontend displays error toast
- Transaction is not recorded

### Partial Success (Multiple Items)
When recording multiple items:
- Uses Promise.allSettled to handle individual failures
- Shows count of successful vs failed recordings
- Successful items are still recorded even if some fail

### Database Constraints
- Foreign key constraints prevent orphaned records
- Check constraints ensure positive quantities
- Trigger validations prevent negative inventory

## Testing

### Manual Testing Steps

1. **Test Recording Usage**
   - Navigate to Appointment Flow page
   - Select an appointment in "in-progress" status
   - Click appointment to open details
   - Click "Record Inventory" button
   - Search for an item (e.g., "Lidocaine")
   - Check the item checkbox
   - Enter quantity (e.g., 2)
   - Add notes (optional)
   - Click "Record Usage"
   - Verify success message
   - Verify item appears in usage list
   - Check inventory page to confirm quantity decreased

2. **Test Multiple Items**
   - Open inventory modal
   - Select 3 different items
   - Set different quantities
   - Record usage
   - Verify all items appear in list
   - Verify total cost is calculated correctly

3. **Test Insufficient Quantity**
   - Find item with low quantity (or adjust to low quantity)
   - Try to record usage exceeding available
   - Verify error message with available quantity

4. **Test Search and Filter**
   - Open inventory modal
   - Test search by name
   - Test search by SKU
   - Test category filter (Medications, Supplies, etc.)
   - Verify results update correctly

5. **Test Viewing History**
   - Record usage across multiple appointments
   - View different appointments
   - Verify each shows only its own usage
   - Verify totals are correct per appointment

### Database Verification

```sql
-- Check inventory decreased
SELECT name, quantity FROM inventory_items WHERE id = 'item-id';

-- View usage records
SELECT * FROM inventory_usage WHERE appointment_id = 'appt-id';

-- Check trigger worked
SELECT
  i.name,
  i.quantity as current_quantity,
  u.quantity_used,
  u.used_at
FROM inventory_usage u
JOIN inventory_items i ON u.item_id = i.id
WHERE u.appointment_id = 'appt-id'
ORDER BY u.used_at DESC;
```

## Future Enhancements

1. **Batch Recording** - Record multiple items in a single transaction
2. **Usage Templates** - Pre-defined sets of items for common procedures
3. **Cost Reporting** - Reports on inventory costs per provider/department
4. **Reorder Alerts** - Notifications when items reach reorder level
5. **Expiration Warnings** - Alerts for items nearing expiration
6. **Usage Analytics** - Charts and trends on inventory consumption
7. **Integration with Billing** - Automatic charge creation for billable items
8. **Barcode Scanning** - Scan items to record usage quickly
9. **Encounter Integration** - Also support recording in encounter notes
10. **Inventory Forecasting** - Predict usage based on appointment types

## Troubleshooting

### Issue: Usage not appearing in list
- Check appointment ID is correct
- Verify usage was recorded successfully (check network tab)
- Refresh the page
- Check database directly for the usage record

### Issue: "Insufficient inventory" error
- Check current inventory quantity in inventory page
- Verify no other concurrent usage depleted stock
- Consider adjusting inventory if count is incorrect

### Issue: Inventory not decreasing
- Check database trigger is enabled
- Verify no database errors in server logs
- Check audit logs for the usage record creation

### Issue: Modal not opening
- Check console for JavaScript errors
- Verify appointment status allows inventory recording
- Ensure user has proper role (provider/ma/admin)

## Support

For issues or questions:
1. Check server logs: `/backend/logs/`
2. Check browser console for frontend errors
3. Verify database migration ran successfully
4. Review audit logs in `audit_logs` table
