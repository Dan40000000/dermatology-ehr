# Inventory System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐│
│  │  InventoryPage   │    │  EncounterPage   │    │  Components  ││
│  │                  │    │                  │    │              ││
│  │  - List items    │    │  - View usage    │    │  - Modal     ││
│  │  - Create/Edit   │    │  - Record usage  │    │  - List      ││
│  │  - Adjust qty    │    │  - View costs    │    │              ││
│  └────────┬─────────┘    └────────┬─────────┘    └──────┬───────┘│
│           │                       │                      │        │
│           └───────────────────────┴──────────────────────┘        │
│                                   │                               │
│                              api.ts (API Layer)                   │
│                                   │                               │
└───────────────────────────────────┼───────────────────────────────┘
                                    │
                          HTTP/REST API
                                    │
┌───────────────────────────────────┼───────────────────────────────┐
│                        Backend (Node.js/Express)                  │
├───────────────────────────────────┼───────────────────────────────┤
│                                   │                               │
│  ┌────────────────────────────────┴───────────────────────────┐  │
│  │                  Route Handlers                            │  │
│  │                                                             │  │
│  │  /api/inventory              /api/inventory-usage          │  │
│  │  ┌──────────────────┐        ┌──────────────────┐          │  │
│  │  │ GET /            │        │ POST /           │          │  │
│  │  │ GET /:id         │        │ POST /batch      │          │  │
│  │  │ POST /           │        │ GET /            │          │  │
│  │  │ PUT /:id         │        │ GET /encounter/  │          │  │
│  │  │ DELETE /:id      │        │ GET /patient/    │          │  │
│  │  │ POST /adjust     │        │ GET /stats/      │          │  │
│  │  │ GET /alerts/*    │        │ DELETE /:id      │          │  │
│  │  │ GET /stats/*     │        │                  │          │  │
│  │  └────────┬─────────┘        └────────┬─────────┘          │  │
│  └───────────┼──────────────────────────┼────────────────────┘  │
│              │                          │                       │
│  ┌───────────┼──────────────────────────┼────────────────────┐  │
│  │           │   Middleware Layer       │                    │  │
│  │           │                          │                    │  │
│  │  ┌────────▼──────────┐    ┌─────────▼──────────┐         │  │
│  │  │ Authentication    │    │ Authorization      │         │  │
│  │  │ - JWT validation  │    │ - Role checking    │         │  │
│  │  │ - Tenant check    │    │ - Permission check │         │  │
│  │  └───────────────────┘    └────────────────────┘         │  │
│  └────────────────────────────────────────────────────────────  │
│                                   │                               │
└───────────────────────────────────┼───────────────────────────────┘
                                    │
                           Database Layer
                                    │
┌───────────────────────────────────┼───────────────────────────────┐
│                         PostgreSQL Database                       │
├───────────────────────────────────┼───────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                        Tables                               │ │
│  │                                                             │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐ │ │
│  │  │ inventory_items  │  │ inventory_usage  │  │inventory │ │ │
│  │  │                  │  │                  │  │adjust-   │ │ │
│  │  │ - id             │  │ - id             │  │ments     │ │ │
│  │  │ - tenant_id      │  │ - tenant_id      │  │          │ │ │
│  │  │ - name           │  │ - item_id ───────┼──┼>id       │ │ │
│  │  │ - category       │  │ - encounter_id   │  │          │ │ │
│  │  │ - quantity       │  │ - patient_id     │  │          │ │ │
│  │  │ - reorder_level  │  │ - provider_id    │  │          │ │ │
│  │  │ - unit_cost_cents│  │ - quantity_used  │  │          │ │ │
│  │  │ - supplier       │  │ - unit_cost_cents│  │          │ │ │
│  │  │ - location       │  │ - used_at        │  │          │ │ │
│  │  │ - expiration_date│  │ - notes          │  │          │ │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Database Triggers                        │ │
│  │                                                             │ │
│  │  ┌────────────────────────────────────────────────────────┐│ │
│  │  │ AFTER INSERT on inventory_usage                        ││ │
│  │  │ → decrease_inventory_on_usage()                        ││ │
│  │  │   - Deducts quantity_used from inventory_items         ││ │
│  │  │   - Validates sufficient inventory                     ││ │
│  │  │   - Prevents negative quantities                       ││ │
│  │  └────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │  ┌────────────────────────────────────────────────────────┐│ │
│  │  │ AFTER INSERT on inventory_adjustments                  ││ │
│  │  │ → adjust_inventory_quantity()                          ││ │
│  │  │   - Adjusts quantity in inventory_items                ││ │
│  │  │   - Validates non-negative result                      ││ │
│  │  └────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Database Functions                       │ │
│  │                                                             │ │
│  │  • get_low_stock_items(tenant_id)                          │ │
│  │    Returns items where quantity <= reorder_level           │ │
│  │                                                             │ │
│  │  • get_expiring_items(tenant_id, days_threshold)           │ │
│  │    Returns items expiring within specified days            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                       Views                                 │ │
│  │                                                             │ │
│  │  • inventory_items_with_stats                              │ │
│  │    Joins items with usage statistics                       │ │
│  │    Shows: total_used, usage_count, total_cost              │ │
│  │    Flags: needs_reorder, expiring_soon                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Recording Inventory Usage

```
┌──────────────┐
│   Provider   │
│  in Encounter│
└──────┬───────┘
       │
       │ 1. Clicks "Use Items"
       ▼
┌──────────────────────┐
│ InventoryUsageModal  │
│                      │
│ - Shows all items    │
│ - Provider selects:  │
│   • Lidocaine (2)    │
│   • Biopsy punch (1) │
└──────┬───────────────┘
       │
       │ 2. Clicks "Record Usage"
       ▼
┌──────────────────────┐
│   Frontend API       │
│ recordBatchInventory │
│        Usage()       │
└──────┬───────────────┘
       │
       │ 3. POST /api/inventory-usage/batch
       │    {
       │      encounterId: "enc-123",
       │      patientId: "pat-456",
       │      providerId: "prov-789",
       │      items: [
       │        { itemId: "item-1", quantityUsed: 2 },
       │        { itemId: "item-2", quantityUsed: 1 }
       │      ]
       │    }
       ▼
┌──────────────────────┐
│  Backend Handler     │
│  /inventory-usage    │
│       /batch         │
└──────┬───────────────┘
       │
       │ 4. Start Transaction
       ▼
┌──────────────────────────────────────────┐
│        For Each Item:                    │
│                                          │
│  a) Get current unit_cost from DB       │
│  b) Validate quantity available         │
│  c) INSERT into inventory_usage         │
│                                          │
│     ┌─────────────────────────────────┐ │
│     │  Database Trigger Fires:        │ │
│     │  decrease_inventory_on_usage()  │ │
│     │                                 │ │
│     │  UPDATE inventory_items         │ │
│     │  SET quantity = quantity - 2    │ │
│     │  WHERE id = 'item-1'            │ │
│     │                                 │ │
│     │  ✓ Validates quantity >= 0      │ │
│     └─────────────────────────────────┘ │
│                                          │
│  d) Log audit entry                     │
└──────┬───────────────────────────────────┘
       │
       │ 5. Commit Transaction
       ▼
┌──────────────────────┐
│   Return Success     │
│   { ids: [...],      │
│     count: 2 }       │
└──────┬───────────────┘
       │
       │ 6. Response
       ▼
┌──────────────────────┐
│     Frontend         │
│ - Shows success      │
│ - Refreshes usage    │
│   list               │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ InventoryUsageList   │
│                      │
│ ✓ Lidocaine (2)      │
│   $25.00             │
│ ✓ Biopsy punch (1)   │
│   $2.50              │
│                      │
│ Total: $27.50        │
└──────────────────────┘
```

## Security Flow

```
┌──────────────┐
│   Request    │
└──────┬───────┘
       │
       │ Headers:
       │ - Authorization: Bearer {jwt_token}
       │ - x-tenant-id: {tenant_id}
       ▼
┌─────────────────────────┐
│  Authentication         │
│  Middleware             │
│                         │
│  1. Verify JWT token    │
│  2. Extract user info   │
│  3. Validate tenant     │
└──────┬──────────────────┘
       │
       │ req.user = {
       │   id: "user-123",
       │   tenantId: "tenant-456",
       │   role: "provider"
       │ }
       ▼
┌─────────────────────────┐
│  Authorization          │
│  Middleware             │
│  (requireRoles)         │
│                         │
│  Check if user.role     │
│  in allowed roles       │
└──────┬──────────────────┘
       │
       │ ✓ Authorized
       ▼
┌─────────────────────────┐
│  Route Handler          │
│                         │
│  Uses tenantId from     │
│  req.user for all DB    │
│  queries                │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Database Query         │
│                         │
│  WHERE tenant_id =      │
│    req.user.tenantId    │
└─────────────────────────┘
```

## Component Hierarchy

```
EncounterPage
│
├─── PatientBanner
│
├─── EncounterForm
│    ├─── ChiefComplaint
│    ├─── HPI
│    ├─── ROS
│    └─── AssessmentPlan
│
├─── VitalsSection
│
├─── OrdersSection
│
├─── BillingSection
│    ├─── DiagnosisSearchModal
│    ├─── ProcedureSearchModal
│    └─── ChargesList
│
├─── InventorySection                    ← NEW
│    │
│    └─── InventoryUsageList             ← NEW
│         │
│         ├─── UsageItem (multiple)
│         │    ├─── ItemName + Category
│         │    ├─── Quantity
│         │    ├─── Cost
│         │    └─── Timestamp
│         │
│         └─── TotalCostSummary
│
└─── Modals
     ├─── DiagnosisSearchModal
     ├─── ProcedureSearchModal
     └─── InventoryUsageModal            ← NEW
          │
          ├─── SearchBar
          ├─── CategoryFilter
          ├─── ItemsList
          │    └─── InventoryItem (multiple)
          │         ├─── Checkbox
          │         ├─── ItemDetails
          │         └─── QuantityInput (if selected)
          │
          └─── ActionButtons
```

## State Management

```
EncounterPage State:
├─── patient: Patient
├─── encounter: Encounter
├─── vitals: Vitals
├─── orders: Order[]
├─── diagnoses: Diagnosis[]
├─── charges: Charge[]
├─── showInventoryModal: boolean         ← NEW
└─── ... (other state)

InventoryUsageModal State:
├─── loading: boolean
├─── inventoryItems: InventoryItem[]
├─── selectedItems: Map<itemId, UsageItem>
├─── searchTerm: string
└─── categoryFilter: string

InventoryUsageList State:
├─── loading: boolean
└─── usageRecords: InventoryUsage[]
```

## Multi-Tenancy Model

```
┌──────────────────────────────────────────────┐
│              Tenant A (Practice 1)           │
├──────────────────────────────────────────────┤
│                                              │
│  Users:                                      │
│  ├─ Dr. Smith (provider)                    │
│  ├─ Dr. Jones (provider)                    │
│  └─ Alice (MA)                              │
│                                              │
│  Inventory Items:                            │
│  ├─ Lidocaine 1% (50 units)                 │
│  ├─ Biopsy Punch 4mm (100 units)            │
│  └─ Botox (10 units)                        │
│                                              │
│  Patients:                                   │
│  ├─ John Doe                                │
│  └─ Jane Smith                              │
│                                              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              Tenant B (Practice 2)           │
├──────────────────────────────────────────────┤
│                                              │
│  Users:                                      │
│  ├─ Dr. Brown (provider)                    │
│  └─ Bob (MA)                                │
│                                              │
│  Inventory Items:                            │
│  ├─ Lidocaine 2% (30 units)                 │
│  └─ Suture Kit (75 units)                   │
│                                              │
│  Patients:                                   │
│  └─ Mary Johnson                            │
│                                              │
└──────────────────────────────────────────────┘

Database ensures:
- Dr. Smith can only see Tenant A's inventory
- Dr. Brown can only see Tenant B's inventory
- No data leakage between tenants
- All queries filtered by tenant_id
```

## Error Handling Flow

```
Record Usage Request
       │
       ▼
┌──────────────────┐
│  Validate Input  │
└────┬─────────────┘
     │
     ├─ Invalid? ──────────────────┐
     │                             ▼
     │                    ┌────────────────┐
     │                    │ 400 Bad Request│
     │                    │ Show error msg │
     │                    └────────────────┘
     │
     ├─ Valid
     ▼
┌──────────────────────┐
│ Check Inventory      │
│ Quantity Available   │
└────┬─────────────────┘
     │
     ├─ Insufficient? ─────────────┐
     │                             ▼
     │                    ┌──────────────────┐
     │                    │ 400 Bad Request  │
     │                    │ "Insufficient    │
     │                    │  inventory: only │
     │                    │  X units         │
     │                    │  available"      │
     │                    └──────────────────┘
     │
     ├─ Sufficient
     ▼
┌──────────────────────┐
│ Record Usage         │
│ (Database Insert)    │
└────┬─────────────────┘
     │
     ├─ DB Error? ─────────────────┐
     │                             ▼
     │                    ┌──────────────────┐
     │                    │ 500 Server Error │
     │                    │ Rollback trans.  │
     │                    │ Show error msg   │
     │                    └──────────────────┘
     │
     ├─ Success
     ▼
┌──────────────────────┐
│ 201 Created          │
│ Return usage ID      │
│ Frontend shows       │
│ success message      │
└──────────────────────┘
```

## Performance Optimizations

```
Database Level:
├─── Indexes on tenant_id (fast filtering)
├─── Indexes on foreign keys (fast joins)
├─── Indexes on frequently queried fields
├─── Database triggers (automatic updates)
├─── Views for complex aggregations
└─── Functions for complex queries

Backend Level:
├─── Batch operations (reduce API calls)
├─── Transaction support (data integrity)
├─── Validation before DB operations
├─── Connection pooling
└─── Efficient SQL queries

Frontend Level:
├─── Component memoization
├─── Lazy loading
├─── Debounced search
├─── Optimistic UI updates
└─── Efficient re-renders
```

This architecture provides a robust, scalable, and secure inventory management system that integrates seamlessly with the existing dermatology EHR application.
