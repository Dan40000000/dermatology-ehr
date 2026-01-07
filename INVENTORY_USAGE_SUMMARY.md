# Inventory Usage Tracking - Implementation Summary

## What Was Implemented

A comprehensive inventory usage tracking system that allows nurses and doctors to:
1. Select items from inventory during an appointment
2. Track usage of inventory items with quantities and notes
3. Automatically deduct from inventory quantities (via database trigger)
4. Keep complete records of how inventory is used per appointment

## Files Modified/Created

### Backend Changes

**Modified: `/backend/src/routes/inventory.ts`**
- Added POST `/api/inventory/usage` - Record inventory usage
- Added GET `/api/inventory/usage` - Fetch usage records (filtered by appointment/encounter/patient)
- Added GET `/api/inventory/usage/:id` - Get single usage record
- Added DELETE `/api/inventory/usage/:id` - Void usage record and restore quantity
- All endpoints validate quantity, check availability, and maintain audit trail

### Frontend Changes

**Modified: `/frontend/src/api.ts`**
- Updated `recordInventoryUsage()` - Points to `/api/inventory/usage` endpoint
- Updated `fetchAllInventoryUsage()` - Supports appointment/encounter filtering
- Added `deleteInventoryUsage()` - Void usage records

**Modified: `/frontend/src/components/inventory/InventoryUsageModal.tsx`**
- Updated to use new API endpoint
- Records items individually instead of batch
- Improved error handling with partial success support

**Modified: `/frontend/src/components/inventory/InventoryUsageList.tsx`**
- Added support for `appointmentId` parameter
- Updated to use `fetchAllInventoryUsage` API
- Can display usage for both appointments and encounters

**Modified: `/frontend/src/pages/AppointmentFlowPage.tsx`**
- Imported InventoryUsageModal and InventoryUsageList components
- Added inventory usage section to appointment detail modal
- Only shows for appointments that are checked-in or later (not scheduled/confirmed)
- Added "Record Inventory" button in modal footer
- Integrated InventoryUsageList to display items used during appointment
- Auto-refreshes usage list after recording new items

### Database Schema

**Existing (already in place from migration 017):**
- `inventory_items` table - Stores all inventory items
- `inventory_usage` table - Records each usage instance
- `inventory_adjustments` table - Manual adjustments audit trail
- `trigger_decrease_inventory` - Automatically deducts quantity on usage insert
- Built-in validation prevents negative inventory

## How It Works

### User Flow
1. Staff opens an appointment from the Appointment Flow page
2. When appointment is checked-in, roomed, in-progress, or at checkout:
   - Inventory usage section appears in the detail modal
   - "Record Inventory" button is available
3. Click "Record Inventory" to open the usage modal
4. Search/filter inventory items by name, SKU, or category
5. Select items, set quantities, and add optional notes
6. Click "Record Usage" to save
7. System validates availability and records usage
8. Inventory quantity is automatically decreased via trigger
9. Usage list refreshes to show the new items
10. Total cost is calculated and displayed

### Technical Flow
```
User Selection → API Call → Validation → Database Insert
                                              ↓
                                     Trigger Fires
                                              ↓
                                   Quantity Decreased
                                              ↓
                                      Response → UI Update
```

## Key Features

1. **Automatic Quantity Management**
   - Database trigger automatically deducts quantities
   - Prevents recording usage if insufficient stock
   - Transaction safety ensures consistency

2. **Complete Audit Trail**
   - Records who used items, when, and for which patient
   - Links to appointment and/or encounter
   - Tracks cost at time of use for historical accuracy
   - Audit logs all changes

3. **Smart UI Integration**
   - Only appears when appointment reaches appropriate status
   - Shows available quantities in real-time
   - Prevents selecting more than available
   - Search and filter for quick item selection
   - Category badges for easy identification

4. **Cost Tracking**
   - Displays cost per item
   - Calculates total cost for appointment
   - Uses cost at time of use (frozen for accuracy)

5. **Error Handling**
   - Validates quantity before submission
   - Handles partial failures gracefully
   - Clear error messages to user
   - Database constraints prevent invalid data

## API Endpoints

### Record Usage
```
POST /api/inventory/usage
Body: {
  itemId: string,
  quantityUsed: number,
  patientId: string,
  providerId: string,
  appointmentId?: string,
  encounterId?: string,
  notes?: string
}
Response: {
  id: string,
  usedAt: string,
  message: string
}
```

### Get Usage Records
```
GET /api/inventory/usage?appointmentId=xxx&limit=100
Response: {
  usage: [{
    id, itemId, itemName, itemCategory,
    quantityUsed, unitCostCents, notes, usedAt,
    patientId, patientFirstName, patientLastName,
    providerId, providerName
  }]
}
```

### Void Usage (Admin only)
```
DELETE /api/inventory/usage/:id
Response: {
  success: true,
  message: "Usage record voided and quantity restored"
}
```

## Security

- **Authentication**: All endpoints require valid session
- **Authorization**:
  - Recording usage: Admin, Provider, MA roles
  - Viewing usage: All authenticated users
  - Voiding usage: Admin only
- **Tenant Isolation**: All queries filtered by tenant_id
- **Input Validation**: Zod schemas validate all inputs
- **Quantity Validation**: Database triggers prevent negative inventory

## Testing

See `INVENTORY_USAGE_FEATURE.md` for detailed testing steps.

Quick test:
1. Navigate to Appointment Flow page
2. Select appointment in "in-progress" status
3. Click "Record Inventory" button
4. Select item, set quantity, click "Record Usage"
5. Verify success message and item appears in list
6. Check Inventory page to confirm quantity decreased

## Future Enhancements

- Batch recording optimization
- Usage templates for common procedures
- Cost reports per provider/department
- Barcode scanning support
- Integration with billing for automatic charges
- Usage analytics and forecasting
- Mobile-optimized interface
- Offline mode with sync

## Documentation

Full documentation available in: `INVENTORY_USAGE_FEATURE.md`
