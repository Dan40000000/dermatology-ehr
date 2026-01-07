# Inventory Feature - Quick Start Guide

## 5-Minute Setup

Follow these steps to get the inventory feature running:

### Step 1: Run the Database Migration (1 minute)

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run migrate
```

Expected output:
```
✓ Running migration: 017_inventory_management.sql
✓ Migration completed successfully
```

### Step 2: Restart the Backend (30 seconds)

```bash
# If backend is running, restart it
# Press Ctrl+C to stop, then:
npm run dev
```

The new routes will be automatically registered.

### Step 3: Test the API (2 minutes)

**Option A: Using the frontend (recommended)**

1. Start the frontend if not running:
   ```bash
   cd /Users/danperry/Desktop/Dermatology\ program/derm-app/frontend
   npm run dev
   ```

2. Navigate to the Inventory page (the existing one with mock data will still work)

**Option B: Using curl**

```bash
# Replace YOUR_TOKEN and YOUR_TENANT_ID with real values

# Create a test item
curl -X POST http://localhost:4000/api/inventory \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Item",
    "category": "supply",
    "quantity": 100,
    "reorderLevel": 20,
    "unitCostCents": 500
  }'

# Should return: { "id": "some-uuid" }

# List items
curl http://localhost:4000/api/inventory \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"

# Should return: { "items": [...] }
```

### Step 4: Optional - Add to EncounterPage (1 minute)

See [INVENTORY_INTEGRATION_GUIDE.md](./INVENTORY_INTEGRATION_GUIDE.md) for detailed instructions.

Quick version:

1. Open `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/pages/EncounterPage.tsx`

2. Add imports:
   ```typescript
   import { InventoryUsageModal, InventoryUsageList } from '../components/inventory';
   ```

3. Add state:
   ```typescript
   const [showInventoryModal, setShowInventoryModal] = useState(false);
   ```

4. Add to UI where appropriate:
   ```typescript
   <InventoryUsageList
     encounterId={encounterId}
     onOpenUsageModal={() => setShowInventoryModal(true)}
   />

   <InventoryUsageModal
     isOpen={showInventoryModal}
     onClose={() => setShowInventoryModal(false)}
     encounterId={encounterId}
     patientId={patientId}
     providerId={session.user.id}
     onSuccess={() => window.__refreshInventoryUsage?.()}
   />
   ```

## Verification Checklist

After setup, verify:

- [ ] Backend starts without errors
- [ ] Migration created 3 tables: `inventory_items`, `inventory_usage`, `inventory_adjustments`
- [ ] Can access `/api/inventory` endpoint
- [ ] Can access `/api/inventory-usage` endpoint
- [ ] Frontend loads without errors
- [ ] (Optional) Inventory components render in EncounterPage

## Common Issues

### Migration fails with "table already exists"
The migration has `IF NOT EXISTS` clauses, so this shouldn't happen. If it does:
```sql
-- Check existing tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'inventory%';
```

### Backend returns 404 for inventory routes
1. Check that backend was restarted after adding route files
2. Verify the route files exist in `backend/src/routes/`
3. Check backend console for startup errors

### Frontend can't find inventory components
1. Verify components were created in `frontend/src/components/inventory/`
2. Check that index.ts exports them correctly
3. Restart the frontend dev server

### "Failed to load inventory items"
1. Check backend is running
2. Verify you're logged in (valid token)
3. Check browser console for specific error
4. Verify tenant ID is set correctly

## Next Steps

Now that the feature is installed:

1. **Add Some Inventory Items**
   - Use the existing Inventory page (with mock data or connect it to API)
   - Or create items via API
   - Add real items from your practice

2. **Test Recording Usage**
   - Open an encounter
   - Use the inventory modal
   - Record some test usage
   - Verify quantities decrease

3. **Check Audit Trail**
   ```sql
   -- View all inventory audit logs
   SELECT * FROM audit_log
   WHERE entity = 'inventory_item' OR entity = 'inventory_usage'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. **Set Up Alerts**
   - Configure reorder levels for items
   - Check low stock alerts endpoint
   - Set up expiration date alerts

5. **Train Staff**
   - Show providers how to record usage
   - Explain the automatic deduction
   - Review low stock alerts

## Quick Reference

### API Endpoints

```
Inventory Management:
  GET    /api/inventory              - List items
  POST   /api/inventory              - Create item
  PUT    /api/inventory/:id          - Update item
  DELETE /api/inventory/:id          - Delete item
  POST   /api/inventory/adjust       - Adjust quantity
  GET    /api/inventory/alerts/low-stock  - Low stock items
  GET    /api/inventory/stats/summary     - Statistics

Inventory Usage:
  POST   /api/inventory-usage        - Record usage
  POST   /api/inventory-usage/batch  - Record multiple
  GET    /api/inventory-usage/encounter/:id - Get usage
```

### Database Tables

```sql
-- Main tables
inventory_items         - All inventory items
inventory_usage         - Usage records
inventory_adjustments   - Manual adjustments

-- Check data
SELECT COUNT(*) FROM inventory_items;
SELECT COUNT(*) FROM inventory_usage;

-- View recent usage
SELECT
  i.name,
  u.quantity_used,
  u.used_at,
  p.first_name || ' ' || p.last_name as patient
FROM inventory_usage u
JOIN inventory_items i ON u.item_id = i.id
JOIN patients p ON u.patient_id = p.id
ORDER BY u.used_at DESC
LIMIT 10;
```

### Component Props

```typescript
// InventoryUsageModal
<InventoryUsageModal
  isOpen={boolean}
  onClose={() => void}
  encounterId?: string
  appointmentId?: string
  patientId: string
  providerId: string
  onSuccess?: () => void
/>

// InventoryUsageList
<InventoryUsageList
  encounterId: string
  onOpenUsageModal?: () => void
/>
```

## Getting Help

If you run into issues:

1. **Check the documentation:**
   - [INVENTORY_IMPLEMENTATION.md](./INVENTORY_IMPLEMENTATION.md) - Complete technical docs
   - [INVENTORY_INTEGRATION_GUIDE.md](./INVENTORY_INTEGRATION_GUIDE.md) - Integration steps
   - [INVENTORY_ARCHITECTURE.md](./INVENTORY_ARCHITECTURE.md) - System architecture

2. **Check the logs:**
   - Backend: Console output or log files
   - Frontend: Browser console (F12)
   - Database: PostgreSQL logs

3. **Verify your setup:**
   - Node.js version: 16+ recommended
   - PostgreSQL version: 12+ recommended
   - All dependencies installed

## Success!

You should now have a fully functional inventory tracking system. The feature includes:

✅ Database with triggers for automatic updates
✅ Complete REST API
✅ Frontend components ready to use
✅ Multi-tenant support
✅ Audit logging
✅ Low stock alerts
✅ Cost tracking

Start recording inventory usage in your encounters and enjoy automated inventory management!
