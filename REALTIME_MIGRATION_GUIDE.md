# Real-Time WebSocket Migration Guide

This guide shows how to add WebSocket emissions to the remaining routes.

## Routes Already Updated

✅ **Appointments** (`backend/src/routes/appointments.ts`)
- POST `/appointments` → emits `appointment:created`
- POST `/appointments/:id/reschedule` → emits `appointment:updated`
- POST `/appointments/:id/status` → emits `appointment:updated`, `appointment:cancelled`, `appointment:checkedin`

✅ **Patients** (`backend/src/routes/patients.ts`)
- PUT `/patients/:id` → emits `patient:updated`

✅ **Encounters** (`backend/src/routes/encounters.ts`)
- POST `/encounters` → emits `encounter:created`

## Routes That Need Emissions

### 1. Encounters (Remaining Routes)

**File**: `backend/src/routes/encounters.ts`

Already has imports. Add emissions to these endpoints:

#### POST `/encounters/:id` (Update encounter)

```typescript
// After successful update
try {
  const encounterData = await pool.query(
    `SELECT e.id, e.patient_id, e.provider_id, e.appointment_id, e.status,
            e.chief_complaint, e.created_at, e.updated_at,
            p.first_name || ' ' || p.last_name as patient_name,
            pr.full_name as provider_name
     FROM encounters e
     JOIN patients p ON p.id = e.patient_id
     JOIN providers pr ON pr.id = e.provider_id
     WHERE e.id = $1`,
    [id]
  );

  if (encounterData.rows.length > 0) {
    const enc = encounterData.rows[0];
    emitEncounterUpdated(tenantId, {
      id: enc.id,
      patientId: enc.patient_id,
      patientName: enc.patient_name,
      providerId: enc.provider_id,
      providerName: enc.provider_name,
      appointmentId: enc.appointment_id,
      status: enc.status,
      chiefComplaint: enc.chief_complaint,
      createdAt: enc.created_at,
      updatedAt: enc.updated_at,
    });
  }
} catch (error: any) {
  logger.error("Failed to emit encounter updated event", {
    error: error.message,
    encounterId: id,
  });
}
```

#### POST `/encounters/:id/complete` (Complete encounter)

```typescript
// After marking complete
emitEncounterCompleted(tenantId, id, req.user!.id);
```

#### POST `/encounters/:id/sign` (Sign encounter)

```typescript
// After signing
emitEncounterSigned(tenantId, id, req.user!.id);
```

### 2. Biopsies

**File**: `backend/src/routes/biopsy.ts`

Already has imports. Add emissions:

#### POST `/biopsies` (Create biopsy)

```typescript
// After creating biopsy
try {
  const biopsyData = await pool.query(
    `SELECT b.id, b.patient_id, b.ordering_provider_id, b.status,
            b.body_location, b.specimen_type, b.path_lab, b.created_at,
            p.first_name || ' ' || p.last_name as patient_name,
            pr.full_name as provider_name
     FROM biopsies b
     JOIN patients p ON p.id = b.patient_id
     JOIN providers pr ON pr.id = b.ordering_provider_id
     WHERE b.id = $1`,
    [biopsyId]
  );

  if (biopsyData.rows.length > 0) {
    const biopsy = biopsyData.rows[0];
    emitBiopsyCreated(tenantId, {
      id: biopsy.id,
      patientId: biopsy.patient_id,
      patientName: biopsy.patient_name,
      orderingProviderId: biopsy.ordering_provider_id,
      orderingProviderName: biopsy.provider_name,
      status: biopsy.status,
      bodyLocation: biopsy.body_location,
      specimenType: biopsy.specimen_type,
      pathLab: biopsy.path_lab,
      createdAt: biopsy.created_at,
    });
  }
} catch (error: any) {
  logger.error("Failed to emit biopsy created event", {
    error: error.message,
    biopsyId,
  });
}
```

#### POST `/biopsies/:id/result` (Add pathology result) - **CRITICAL**

```typescript
// After adding result
emitBiopsyResultReceived(
  tenantId,
  id,
  biopsy.patient_id,
  validatedData.pathology_diagnosis
);

// Fetch full biopsy and emit update too
emitBiopsyUpdated(tenantId, {
  // ... full biopsy data
  status: 'resulted',
  diagnosis: validatedData.pathology_diagnosis,
  resultedAt: new Date().toISOString(),
});
```

#### POST `/biopsies/:id/review` (Provider reviews result)

```typescript
// After review
emitBiopsyReviewed(
  tenantId,
  id,
  biopsy.patient_id,
  req.user!.fullName || req.user!.id
);
```

#### PATCH `/biopsies/:id` (Update biopsy)

```typescript
// After update
try {
  const biopsyData = await pool.query(
    `SELECT b.*, p.first_name || ' ' || p.last_name as patient_name,
            pr.full_name as provider_name
     FROM biopsies b
     JOIN patients p ON p.id = b.patient_id
     JOIN providers pr ON pr.id = b.ordering_provider_id
     WHERE b.id = $1`,
    [id]
  );

  if (biopsyData.rows.length > 0) {
    const biopsy = biopsyData.rows[0];
    emitBiopsyUpdated(tenantId, {
      // ... map all fields
    });
  }
} catch (error: any) {
  logger.error("Failed to emit biopsy updated event", {
    error: error.message,
    biopsyId: id,
  });
}
```

### 3. Claims

**File**: `backend/src/routes/claims.ts`

Already has imports. Add emissions:

#### POST `/claims` (Create claim)

```typescript
// After creating claim
try {
  const claimData = await pool.query(
    `SELECT c.*, p.first_name || ' ' || p.last_name as patient_name
     FROM claims c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.id = $1`,
    [claimId]
  );

  if (claimData.rows.length > 0) {
    const claim = claimData.rows[0];
    emitClaimCreated(tenantId, {
      id: claim.id,
      claimNumber: claim.claim_number,
      patientId: claim.patient_id,
      patientName: claim.patient_name,
      encounterId: claim.encounter_id,
      status: claim.status,
      totalCharges: claim.total_charges,
      payer: claim.payer,
      payerName: claim.payer_name,
      serviceDate: claim.service_date,
      submittedAt: claim.submitted_at,
    });
  }
} catch (error: any) {
  logger.error("Failed to emit claim created event", {
    error: error.message,
    claimId,
  });
}
```

#### PUT `/claims/:id` (Update claim)

```typescript
// After update
emitClaimUpdated(tenantId, {
  // ... full claim data
});
```

#### POST `/claims/:id/status` (Change status) - **IMPORTANT**

```typescript
// After status change
const oldStatus = /* get from DB before update */;
const newStatus = parsed.data.status;

emitClaimStatusChanged(tenantId, claimId, oldStatus, newStatus);

// Also emit full claim update
emitClaimUpdated(tenantId, {
  // ... full claim data
});

// Special handling for specific statuses
if (newStatus === 'submitted') {
  emitClaimSubmitted(tenantId, claimId, claim.payer_name);
} else if (newStatus === 'denied') {
  emitClaimDenied(tenantId, claimId, claim.denial_reason || 'Unknown reason');
} else if (newStatus === 'paid') {
  emitClaimPaid(tenantId, claimId, claim.paid_amount || claim.total_charges);
}
```

#### POST `/claims/:id/payments` (Post payment)

```typescript
// After posting payment
try {
  const paymentData = await pool.query(
    `SELECT p.*, pt.first_name || ' ' || pt.last_name as patient_name
     FROM payments p
     JOIN claims c ON c.id = p.claim_id
     JOIN patients pt ON pt.id = c.patient_id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (paymentData.rows.length > 0) {
    const payment = paymentData.rows[0];
    emitPaymentReceived(tenantId, {
      id: payment.id,
      patientId: payment.patient_id,
      patientName: payment.patient_name,
      claimId: payment.claim_id,
      amount: payment.amount_cents,
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      payer: payment.payer,
      createdAt: payment.created_at,
    });
  }
} catch (error: any) {
  logger.error("Failed to emit payment received event", {
    error: error.message,
    paymentId,
  });
}
```

### 4. Prior Authorizations

**File**: Create or find the prior auth routes

#### When status changes

```typescript
import {
  emitPriorAuthCreated,
  emitPriorAuthStatusChanged,
  emitPriorAuthApproved,
  emitPriorAuthDenied,
} from '../websocket/emitter';

// On create
emitPriorAuthCreated(tenantId, {
  id,
  patientId,
  patientName,
  status: 'pending',
  serviceType,
  insurancePlan,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// On status change
const oldStatus = /* previous status */;
const newStatus = /* new status */;
emitPriorAuthStatusChanged(tenantId, priorAuthId, oldStatus, newStatus);

// If approved
if (newStatus === 'approved') {
  emitPriorAuthApproved(tenantId, priorAuthId, authNumber);
}

// If denied
if (newStatus === 'denied') {
  emitPriorAuthDenied(tenantId, priorAuthId, denialReason);
}
```

### 5. Prescriptions (If exists)

```typescript
import {
  emitPrescriptionCreated,
  emitPrescriptionSent,
  emitPrescriptionStatusChanged,
} from '../websocket/emitter';

// On prescription creation
emitPrescriptionCreated(tenantId, {
  id,
  patientId,
  patientName,
  providerId,
  providerName,
  medication,
  status: 'pending',
  createdAt: new Date().toISOString(),
});

// When sent to pharmacy
emitPrescriptionSent(tenantId, prescriptionId, patientId, medication);

// Status changes
emitPrescriptionStatusChanged(tenantId, prescriptionId, newStatus);
```

## Testing Each Integration

After adding emissions to a route:

1. **Test in Postman/API client**:
   - Make the API call
   - Check server logs for "WebSocket event emitted"

2. **Test in browser DevTools**:
   - Open DevTools → Network → WS tab
   - Make the change in the UI
   - See the WebSocket frame with your event

3. **Test multi-window**:
   - Open two browser windows
   - Make change in window 1
   - See update appear in window 2

4. **Check toast notifications**:
   - Verify toast appears with correct message
   - Check icon and duration are appropriate

## Common Patterns

### Pattern 1: Simple Emission After Create

```typescript
// 1. Insert into database
await pool.query(`INSERT INTO table ...`, [...]);

// 2. Fetch with joins for full data
const result = await pool.query(`
  SELECT t.*, related.name, ...
  FROM table t
  JOIN related ON ...
  WHERE t.id = $1
`, [id]);

// 3. Emit event
try {
  if (result.rows.length > 0) {
    emitThingCreated(tenantId, mapToEventData(result.rows[0]));
  }
} catch (error) {
  logger.error("Failed to emit event", { error, id });
}
```

### Pattern 2: Status Change with Conditional Events

```typescript
// 1. Get old status
const old = await pool.query(`SELECT status FROM table WHERE id = $1`, [id]);
const oldStatus = old.rows[0].status;

// 2. Update status
await pool.query(`UPDATE table SET status = $1 WHERE id = $2`, [newStatus, id]);

// 3. Emit generic status change
emitStatusChanged(tenantId, id, oldStatus, newStatus);

// 4. Emit specific events for certain statuses
if (newStatus === 'completed') {
  emitCompleted(tenantId, id);
} else if (newStatus === 'cancelled') {
  emitCancelled(tenantId, id, reason);
}
```

### Pattern 3: Update with Full Data Fetch

```typescript
// 1. Update
await pool.query(`UPDATE table SET ... WHERE id = $1`, [..., id]);

// 2. Fetch updated data with all joins
const updated = await pool.query(`
  SELECT t.*, p.name as patient_name, pr.name as provider_name
  FROM table t
  JOIN patients p ON ...
  JOIN providers pr ON ...
  WHERE t.id = $1
`, [id]);

// 3. Emit
emitThingUpdated(tenantId, mapToEventData(updated.rows[0]));
```

## Error Handling

Always wrap emissions in try-catch:

```typescript
try {
  emitSomeEvent(tenantId, data);
} catch (error: any) {
  // Log but don't fail the request
  logger.error("Failed to emit WebSocket event", {
    event: 'some:event',
    error: error.message,
    tenantId,
    dataId: data.id,
  });
}
```

## Checklist

- [ ] Encounters: POST /:id (update)
- [ ] Encounters: POST /:id/complete
- [ ] Encounters: POST /:id/sign
- [ ] Biopsies: POST / (create)
- [ ] Biopsies: POST /:id/result (CRITICAL)
- [ ] Biopsies: POST /:id/review
- [ ] Biopsies: PATCH /:id (update)
- [ ] Claims: POST / (create)
- [ ] Claims: PUT /:id (update)
- [ ] Claims: POST /:id/status (IMPORTANT)
- [ ] Claims: POST /:id/payments
- [ ] Prior Auth: All routes
- [ ] Prescriptions: All routes (if exists)

## Validation

After completing migrations:

```bash
# Search for routes without emissions
cd backend/src/routes
grep -l "pool.query.*INSERT\|UPDATE" *.ts | while read f; do
  if ! grep -q "emit" "$f"; then
    echo "Missing emissions: $f"
  fi
done
```

## Getting Help

- See working examples in `backend/src/routes/appointments.ts`
- Check emitter functions in `backend/src/websocket/emitter.ts`
- Review event types in `backend/src/websocket/types.ts`
