# Waitlist Auto-Fill Worker Service

## Overview

The Waitlist Auto-Fill Worker Service automatically matches cancelled appointments with patients on the waitlist, creating time-limited holds for matched slots. This service helps practices maximize appointment utilization and reduce no-show impact.

## Features

### 1. Intelligent Matching Algorithm

The service uses a sophisticated scoring algorithm to match waitlist entries with available slots:

**Matching Criteria:**
- **Provider Match** (Weight: 40) - Highest priority
- **Appointment Type Match** (Weight: 25) - Required match
- **Location Match** (Weight: 20) - Preferred but flexible
- **Time of Day Match** (Weight: 10) - Morning/Afternoon/Evening
- **Day of Week Match** (Weight: 5) - Preferred days

**Priority Multipliers:**
- Urgent: 2.0x
- High: 1.5x
- Normal: 1.0x
- Low: 0.75x

**Additional Scoring:**
- FIFO bonus: Up to 5 points based on wait time
- Partial credit for "any" preferences (50% of weight)

### 2. Hold Management

**Hold Duration:** 24 hours from creation

**Hold Lifecycle:**
1. **Active** - Hold is valid and can be accepted
2. **Accepted** - Patient accepted and appointment scheduled
3. **Expired** - Hold expired after 24 hours
4. **Cancelled** - Hold manually cancelled

**Automatic Expiration:**
- Background worker runs every 15 minutes
- Expires holds past their `hold_until` time
- Returns waitlist entries to 'active' status if no other holds exist

### 3. Status Transitions

**Waitlist Entry Statuses:**
- `active` → `matched` - When hold is created
- `matched` → `scheduled` - When hold is accepted
- `matched` → `active` - When hold expires/cancelled with no other holds
- `scheduled` - Final state when appointment booked

### 4. Race Condition Prevention

- Uses database transactions with `FOR UPDATE` locks
- Checks for existing active holds before creating new ones
- Validates hold hasn't expired before acceptance
- Atomic status transitions

### 5. Audit Logging (PHI-Safe)

All operations are logged without PHI:
- `waitlist_hold_created` - Hold creation with slot details
- `waitlist_hold_accepted` - Hold accepted and appointment scheduled
- `waitlist_hold_cancelled` - Hold manually cancelled
- `waitlist_holds_expired` - Batch expiration of old holds
- `waitlist_auto_fill_processed` - Overall matching process stats

Logged metadata includes:
- Tenant ID, User ID (system for automated)
- Waitlist ID, Hold ID
- Provider ID, Location ID (not names)
- Timestamps, scores, counts
- NO patient names, DOB, MRN, or contact info

## Architecture

### Core Service: `WaitlistAutoFillService`

**Main Methods:**

1. **`findMatchingWaitlistEntries(tenantId, slot)`**
   - Finds and scores all eligible waitlist entries for a slot
   - Returns sorted array of matches with scores

2. **`scoreWaitlistEntry(entry, slot, timeOfDay, dayOfWeek)`**
   - Scores a single waitlist entry against a slot
   - Returns match score and details

3. **`createWaitlistHold(tenantId, waitlistId, slot, notificationMethod)`**
   - Creates a hold for a matched slot
   - Updates waitlist status to 'matched'
   - Returns hold ID

4. **`processAppointmentCancellation(tenantId, appointmentId, maxMatches)`**
   - Main entry point for auto-fill
   - Finds matches and creates holds
   - Returns array of created holds with scores

5. **`expireOldHolds(tenantId?)`**
   - Expires holds past their hold_until time
   - Returns count of expired holds

6. **`startExpirationWorker(intervalMinutes)`**
   - Starts background worker for hold expiration
   - Returns interval handle

7. **`getStats(tenantId, startDate?, endDate?)`**
   - Returns statistics on auto-fill performance
   - Metrics: active, accepted, expired, cancelled holds
   - Average acceptance time

### Integration Points

**1. Appointment Cancellation Trigger**
- Location: `/src/routes/appointments.ts`
- Endpoint: `POST /api/appointments/:id/status`
- Automatically triggers when status set to 'cancelled'

**2. Waitlist Routes**
- Location: `/src/routes/waitlist.ts`
- New endpoints added for hold management

## API Endpoints

### Auto-Fill Management

#### Manual Trigger (for testing)
```
POST /api/waitlist/trigger-auto-fill/:appointmentId
```

Request Body:
```json
{
  "maxMatches": 5  // Optional, defaults to 5
}
```

Response:
```json
{
  "message": "Waitlist auto-fill triggered",
  "appointmentId": "uuid",
  "matchesCreated": 3,
  "matches": [
    {
      "holdId": "uuid",
      "waitlistId": "uuid",
      "score": 87.5
    }
  ]
}
```

#### Get Auto-Fill Statistics
```
GET /api/waitlist/stats/auto-fill?startDate=2025-01-01&endDate=2025-12-31
```

Response:
```json
{
  "active_holds": 5,
  "accepted_holds": 120,
  "expired_holds": 15,
  "cancelled_holds": 8,
  "total_holds": 148,
  "avg_accept_time_hours": 6.5
}
```

### Hold Management

#### Get All Active Holds
```
GET /api/waitlist/holds?status=active
```

Response:
```json
[
  {
    "id": "hold-uuid",
    "waitlist_id": "waitlist-uuid",
    "patient_id": "patient-uuid",
    "first_name": "John",
    "last_name": "Doe",
    "appointment_slot_start": "2025-12-31T10:00:00Z",
    "appointment_slot_end": "2025-12-31T10:30:00Z",
    "provider_name": "Dr. Smith",
    "location_name": "Main Office",
    "hold_until": "2025-12-31T10:00:00Z",
    "status": "active"
  }
]
```

#### Get Holds for Waitlist Entry
```
GET /api/waitlist/:waitlistId/holds
```

#### Accept a Hold
```
POST /api/waitlist/holds/:holdId/accept
```

Response:
```json
{
  "message": "Hold accepted and appointment scheduled",
  "appointmentId": "new-appt-uuid",
  "waitlistId": "waitlist-uuid"
}
```

#### Cancel a Hold
```
POST /api/waitlist/holds/:holdId/cancel
```

Response:
```json
{
  "message": "Hold cancelled",
  "waitlistId": "waitlist-uuid"
}
```

## Database Schema

### waitlist_holds Table

```sql
CREATE TABLE waitlist_holds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  waitlist_id TEXT NOT NULL REFERENCES waitlist(id),
  appointment_slot_start TIMESTAMPTZ NOT NULL,
  appointment_slot_end TIMESTAMPTZ NOT NULL,
  provider_id TEXT REFERENCES users(id),
  location_id TEXT REFERENCES locations(id),
  hold_until TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'expired', 'cancelled')),
  notification_sent_at TIMESTAMPTZ,
  notification_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_waitlist_holds_tenant` - Tenant filtering
- `idx_waitlist_holds_waitlist` - Lookup by waitlist entry
- `idx_waitlist_holds_status` - Status filtering
- `idx_waitlist_holds_hold_until` - Expiration queries
- `idx_waitlist_holds_updated_at` - Ordering by update time

## Configuration

### Environment Variables

No specific environment variables required. Service uses:
- Database connection from `pool`
- Logger from `lib/logger`
- Audit service from `services/audit`

### Worker Configuration

**Expiration Worker Interval:**
- Default: 15 minutes
- Configurable in `src/index.ts`

```typescript
waitlistAutoFillService.startExpirationWorker(15); // 15 minutes
```

### Matching Configuration

**Scoring Weights:**
- Configured in `WaitlistAutoFillService.WEIGHTS`
- Can be adjusted in the service class

**Priority Multipliers:**
- Configured in `WaitlistAutoFillService.PRIORITY_MULTIPLIERS`

**Hold Duration:**
- Default: 24 hours
- Configured in `WaitlistAutoFillService.HOLD_DURATION_HOURS`

**Max Matches Per Cancellation:**
- Default: 5
- Configurable via API parameter

## Usage Examples

### Example 1: Automatic Trigger on Cancellation

When a staff member cancels an appointment:

```typescript
// In appointments.ts - POST /:id/status
// When status === 'cancelled'
const matches = await waitlistAutoFillService.processAppointmentCancellation(
  tenantId,
  appointmentId
);
// Automatically creates holds for top 5 matches
```

### Example 2: Manual Trigger

Admin manually triggers auto-fill:

```bash
curl -X POST http://localhost:3000/api/waitlist/trigger-auto-fill/appt-123 \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <token>" \
  -d '{"maxMatches": 10}'
```

### Example 3: Accept a Hold

Patient calls to accept a waitlist slot:

```bash
curl -X POST http://localhost:3000/api/waitlist/holds/hold-123/accept \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <token>"
```

Creates appointment and updates waitlist to 'scheduled'.

### Example 4: Monitor Statistics

Check auto-fill performance:

```bash
curl -X GET "http://localhost:3000/api/waitlist/stats/auto-fill?startDate=2025-01-01" \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <token>"
```

## Monitoring & Metrics

### Key Metrics to Monitor

1. **Hold Creation Rate**
   - Number of holds created per cancellation
   - Average match score

2. **Hold Acceptance Rate**
   - Percentage of holds accepted vs expired
   - Average time to acceptance

3. **Expiration Rate**
   - Percentage of holds that expire
   - Indicates patient engagement

4. **Match Quality**
   - Distribution of match scores
   - Success rate by priority level

### Logs to Monitor

```typescript
// Successful match creation
logger.info('Waitlist match created', {
  tenantId,
  appointmentId,
  waitlistId,
  score,
  matchDetails
});

// Hold expiration
logger.info('Expired old waitlist holds', {
  tenantId,
  count
});

// Errors
logger.error('Waitlist auto-fill failed', {
  error: error.message,
  tenantId,
  appointmentId
});
```

## Troubleshooting

### Issue: No matches found for cancellations

**Possible Causes:**
1. No active waitlist entries
2. Provider/appointment type mismatch
3. Date range filters too restrictive
4. All waitlist patients already have active holds

**Resolution:**
- Check waitlist entries with `GET /api/waitlist?status=active`
- Review waitlist preferences (provider_id, appointment_type_id)
- Check holds with `GET /api/waitlist/holds`

### Issue: Holds not expiring

**Possible Causes:**
1. Expiration worker not running
2. Worker error in logs
3. Database transaction issues

**Resolution:**
- Check server logs for "Starting waitlist hold expiration worker"
- Manually trigger expiration: Call `expireOldHolds()` directly
- Check database for holds with `hold_until < NOW()`

### Issue: Race conditions on hold acceptance

**Possible Causes:**
1. Multiple concurrent accept requests
2. Hold expired between check and accept

**Resolution:**
- Service uses `FOR UPDATE` locks - should prevent races
- Returns 404 if hold no longer active
- Returns 400 if hold expired

## Performance Considerations

### Database Query Optimization

1. **Indexed Columns:**
   - All foreign keys indexed
   - Status and hold_until indexed for filtering
   - Created_at for FIFO ordering

2. **Query Patterns:**
   - Uses EXISTS for efficient hold checking
   - Limits results with ORDER BY and LIMIT
   - Uses prepared statements

3. **Transaction Management:**
   - Short-lived transactions
   - Proper rollback on errors
   - Connection pooling

### Scalability

**Current Design:**
- Handles 100s of waitlist entries efficiently
- 15-minute expiration interval reduces load
- Automatic matching on cancellation

**Scaling Considerations:**
- For 1000+ waitlist entries: Consider partitioning by tenant
- For high-volume cancellations: Consider queue-based processing
- For multi-region: Ensure proper transaction isolation

## Testing

### Unit Tests

Test cases should cover:
1. Scoring algorithm with various preference combinations
2. Hold creation with concurrent requests
3. Hold expiration logic
4. Status transitions

### Integration Tests

1. End-to-end cancellation → matching → hold creation
2. Hold acceptance → appointment creation
3. Hold expiration → status rollback
4. Statistics generation

### Test Data Setup

```sql
-- Create test waitlist entries
INSERT INTO waitlist (id, tenant_id, patient_id, provider_id, priority, status)
VALUES ('test-1', 'tenant-1', 'patient-1', 'provider-1', 'urgent', 'active');

-- Cancel test appointment
UPDATE appointments SET status = 'cancelled' WHERE id = 'test-appt-1';

-- Verify hold created
SELECT * FROM waitlist_holds WHERE waitlist_id = 'test-1';
```

## Future Enhancements

### Potential Features

1. **Multi-slot matching**
   - Match one waitlist entry to multiple available slots
   - Let patient choose preferred time

2. **Smart notification timing**
   - Delay notifications for better acceptance rates
   - Send reminders before hold expiration

3. **Machine learning scoring**
   - Learn from acceptance patterns
   - Adjust weights based on historical data

4. **Patient preferences ranking**
   - Let patients rank multiple holds
   - Auto-accept highest-ranked available hold

5. **Integration with patient portal**
   - Real-time hold notifications
   - Self-service acceptance/rejection

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Review audit logs for operation history
3. Monitor statistics for performance insights
4. Contact development team with specific error details
