# Waitlist Auto-Fill Testing Guide

## Overview

This guide provides step-by-step instructions for testing the Waitlist Auto-Fill Worker Service functionality.

## Prerequisites

1. Backend server running on port 3000 (or configured port)
2. Database with migrations applied (including `042_waitlist_holds_updated_at.sql`)
3. Valid tenant account with:
   - At least one provider
   - At least one location
   - At least one appointment type
   - At least one patient

## Test Scenarios

### Scenario 1: Basic Auto-Fill on Cancellation

**Objective:** Verify automatic matching when an appointment is cancelled.

**Setup:**

1. Create a waitlist entry:
```bash
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "PATIENT_UUID",
    "providerId": "PROVIDER_UUID",
    "appointmentTypeId": "APPT_TYPE_UUID",
    "locationId": "LOCATION_UUID",
    "reason": "earlier_appointment",
    "priority": "normal",
    "preferredTimeOfDay": "morning",
    "preferredDaysOfWeek": ["monday", "wednesday", "friday"]
  }'
```

2. Create an appointment to cancel:
```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "OTHER_PATIENT_UUID",
    "providerId": "PROVIDER_UUID",
    "locationId": "LOCATION_UUID",
    "appointmentTypeId": "APPT_TYPE_UUID",
    "scheduledStart": "2025-12-31T09:00:00Z",
    "scheduledEnd": "2025-12-31T09:30:00Z",
    "status": "scheduled"
  }'
```

**Test Steps:**

1. Cancel the appointment:
```bash
curl -X POST http://localhost:3000/api/appointments/APPOINTMENT_UUID/status \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"status": "cancelled"}'
```

2. Check for created holds:
```bash
curl -X GET http://localhost:3000/api/waitlist/holds \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Status 200 on cancellation
- Server logs show "Waitlist auto-fill triggered"
- At least one hold created with status 'active'
- Waitlist entry status changed from 'active' to 'matched'
- Hold has `hold_until` timestamp 24 hours in the future

**Acceptance Criteria:**
- ✅ Automatic matching triggered on cancellation
- ✅ Hold created with correct appointment details
- ✅ Waitlist status updated to 'matched'
- ✅ Audit log entry created for 'waitlist_auto_fill_processed'

---

### Scenario 2: Priority Scoring

**Objective:** Verify that higher priority waitlist entries are matched first.

**Setup:**

1. Create multiple waitlist entries with different priorities:
```bash
# Urgent priority
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "PATIENT_1_UUID",
    "providerId": "PROVIDER_UUID",
    "priority": "urgent",
    "reason": "medical_urgency"
  }'

# Normal priority (created earlier)
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "PATIENT_2_UUID",
    "providerId": "PROVIDER_UUID",
    "priority": "normal",
    "reason": "earlier_appointment"
  }'
```

**Test Steps:**

1. Cancel an appointment with matching provider
2. Check which waitlist entry got the hold

**Expected Results:**
- Urgent priority entry gets matched first despite being created later
- Match score for urgent entry is approximately 2x normal priority

**Acceptance Criteria:**
- ✅ Urgent priority matches before normal priority
- ✅ Scoring reflects priority multiplier (2.0x for urgent)

---

### Scenario 3: Provider Matching

**Objective:** Verify provider preference matching logic.

**Setup:**

Create three waitlist entries:
1. Specific provider requested (matches available slot)
2. Specific provider requested (does NOT match available slot)
3. Any provider acceptable

**Test Steps:**

1. Cancel appointment with Provider A
2. Check match scores and holds created

**Expected Results:**
- Entry #1 (matching provider) gets highest score (40 points + multipliers)
- Entry #2 (non-matching provider) gets score of 0 (excluded)
- Entry #3 (any provider) gets medium score (~20 points + multipliers)

**Acceptance Criteria:**
- ✅ Specific provider match scores highest
- ✅ Non-matching specific provider excluded (score = 0)
- ✅ "Any provider" gets partial credit

---

### Scenario 4: Hold Acceptance

**Objective:** Verify patient can accept a hold and appointment is created.

**Setup:**

1. Create hold using Scenario 1
2. Note the `holdId` from response

**Test Steps:**

1. Accept the hold:
```bash
curl -X POST http://localhost:3000/api/waitlist/holds/HOLD_UUID/accept \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. Verify appointment created:
```bash
curl -X GET http://localhost:3000/api/appointments \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

3. Verify waitlist status:
```bash
curl -X GET http://localhost:3000/api/waitlist/WAITLIST_UUID \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Status 200 on acceptance
- New appointment created with:
  - Same provider, location, appointment type as hold
  - Same scheduled_start and scheduled_end as hold
  - Status: 'scheduled'
  - Patient ID matches waitlist patient
- Hold status changed to 'accepted'
- Waitlist status changed to 'scheduled'
- Waitlist `scheduled_appointment_id` populated
- Waitlist `resolved_at` timestamp set

**Acceptance Criteria:**
- ✅ Appointment successfully created
- ✅ Hold status updated to 'accepted'
- ✅ Waitlist status updated to 'scheduled'
- ✅ All foreign keys correctly linked
- ✅ Audit log entry created for 'waitlist_hold_accepted'

---

### Scenario 5: Hold Cancellation

**Objective:** Verify hold can be cancelled and waitlist returns to active.

**Setup:**

1. Create hold using Scenario 1
2. Note the `holdId` and `waitlistId`

**Test Steps:**

1. Cancel the hold:
```bash
curl -X POST http://localhost:3000/api/waitlist/holds/HOLD_UUID/cancel \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. Check waitlist status:
```bash
curl -X GET http://localhost:3000/api/waitlist/WAITLIST_UUID \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Status 200 on cancellation
- Hold status changed to 'cancelled'
- Waitlist status changed back to 'active' (if no other active holds)

**Acceptance Criteria:**
- ✅ Hold status updated to 'cancelled'
- ✅ Waitlist returned to 'active' status
- ✅ Audit log entry created for 'waitlist_hold_cancelled'

---

### Scenario 6: Hold Expiration

**Objective:** Verify automatic expiration of holds after 24 hours.

**Setup:**

1. Manually create a hold with expired `hold_until`:
```sql
INSERT INTO waitlist_holds (
  id, tenant_id, waitlist_id, appointment_slot_start, appointment_slot_end,
  provider_id, location_id, hold_until, status, created_at
) VALUES (
  gen_random_uuid()::text,
  'YOUR_TENANT_ID',
  'WAITLIST_UUID',
  NOW() + INTERVAL '1 day',
  NOW() + INTERVAL '1 day 30 minutes',
  'PROVIDER_UUID',
  'LOCATION_UUID',
  NOW() - INTERVAL '1 hour', -- Already expired
  'active',
  NOW() - INTERVAL '25 hours'
);
```

2. Update waitlist to 'matched':
```sql
UPDATE waitlist SET status = 'matched' WHERE id = 'WAITLIST_UUID';
```

**Test Steps:**

1. Wait for expiration worker to run (up to 15 minutes) OR manually trigger:
```bash
# If you add a manual expiration endpoint for testing
curl -X POST http://localhost:3000/api/waitlist/expire-holds \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. Check hold status:
```bash
curl -X GET http://localhost:3000/api/waitlist/holds?status=expired \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

3. Check waitlist status:
```bash
curl -X GET http://localhost:3000/api/waitlist/WAITLIST_UUID \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Hold status changed to 'expired'
- Waitlist status changed back to 'active'
- Server logs show "Expired old waitlist holds" with count

**Acceptance Criteria:**
- ✅ Expired holds automatically detected
- ✅ Hold status updated to 'expired'
- ✅ Waitlist returned to 'active'
- ✅ Audit log entry created for 'waitlist_holds_expired'

---

### Scenario 7: Multiple Matches Per Cancellation

**Objective:** Verify multiple waitlist entries can be matched to one cancelled slot.

**Setup:**

1. Create 5 waitlist entries with same provider preference
2. Create one appointment to cancel

**Test Steps:**

1. Cancel the appointment
2. Check number of holds created

**Expected Results:**
- Default: Up to 5 holds created
- Top 5 matches by score
- Each hold has unique waitlist entry
- No duplicate holds for same waitlist entry

**Acceptance Criteria:**
- ✅ Multiple holds created (up to maxMatches)
- ✅ Holds sorted by score (highest first)
- ✅ No race conditions or duplicates

---

### Scenario 8: Manual Trigger

**Objective:** Verify manual trigger endpoint works correctly.

**Test Steps:**

1. Create waitlist entries
2. Create and cancel an appointment (but don't trigger auto-fill)
3. Manually trigger:
```bash
curl -X POST http://localhost:3000/api/waitlist/trigger-auto-fill/APPOINTMENT_UUID \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"maxMatches": 10}'
```

**Expected Results:**
- Manual trigger creates holds successfully
- Can specify custom `maxMatches`
- Response includes match details and scores

**Acceptance Criteria:**
- ✅ Manual trigger works independently
- ✅ Custom maxMatches respected
- ✅ Returns detailed match information

---

### Scenario 9: Statistics Endpoint

**Objective:** Verify statistics are calculated correctly.

**Setup:**

1. Create several holds with various outcomes:
   - 2 accepted
   - 1 expired
   - 1 cancelled
   - 2 active

**Test Steps:**

1. Query statistics:
```bash
curl -X GET "http://localhost:3000/api/waitlist/stats/auto-fill?startDate=2025-01-01&endDate=2025-12-31" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
```json
{
  "active_holds": 2,
  "accepted_holds": 2,
  "expired_holds": 1,
  "cancelled_holds": 1,
  "total_holds": 6,
  "avg_accept_time_hours": 4.5
}
```

**Acceptance Criteria:**
- ✅ Counts match actual hold statuses
- ✅ Date range filtering works
- ✅ Average acceptance time calculated correctly

---

### Scenario 10: Race Condition Prevention

**Objective:** Verify no race conditions when accepting holds concurrently.

**Setup:**

1. Create one hold
2. Attempt to accept it twice simultaneously

**Test Steps:**

1. In parallel (use two terminals):
```bash
# Terminal 1
curl -X POST http://localhost:3000/api/waitlist/holds/HOLD_UUID/accept \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Terminal 2 (run simultaneously)
curl -X POST http://localhost:3000/api/waitlist/holds/HOLD_UUID/accept \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- One request succeeds (200)
- Other request fails (404 or 400)
- Only one appointment created
- No database constraint violations

**Acceptance Criteria:**
- ✅ FOR UPDATE lock prevents race condition
- ✅ Only one acceptance succeeds
- ✅ No duplicate appointments
- ✅ Proper error handling

---

### Scenario 11: Audit Log Verification

**Objective:** Verify audit logs are created without PHI.

**Test Steps:**

1. Perform various operations (create hold, accept, cancel, expire)
2. Query audit logs:
```bash
curl -X GET http://localhost:3000/api/audit \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**

Audit log entries should include:
- `action`: One of:
  - `waitlist_hold_created`
  - `waitlist_hold_accepted`
  - `waitlist_hold_cancelled`
  - `waitlist_holds_expired`
  - `waitlist_auto_fill_processed`
- `user_id`: 'system' for automated, actual user for manual
- `resource_type`: 'waitlist_hold' or 'appointment'
- `metadata`: Contains IDs but NO PHI (no names, DOB, contact info)

**Acceptance Criteria:**
- ✅ All operations generate audit logs
- ✅ No PHI in audit logs
- ✅ Sufficient detail for troubleshooting
- ✅ Proper attribution (system vs user)

---

## Performance Testing

### Load Test 1: Many Waitlist Entries

**Objective:** Test performance with 100+ waitlist entries.

**Setup:**
1. Create 100 waitlist entries with various preferences
2. Cancel one appointment

**Expected Results:**
- Matching completes in < 2 seconds
- Database queries remain efficient
- No timeout errors

### Load Test 2: High Cancellation Volume

**Objective:** Test handling of many concurrent cancellations.

**Setup:**
1. Create 50 waitlist entries
2. Cancel 20 appointments rapidly

**Expected Results:**
- All cancellations processed
- No hold creation failures
- No database deadlocks

---

## Cleanup After Testing

```sql
-- Remove test holds
DELETE FROM waitlist_holds WHERE tenant_id = 'YOUR_TENANT_ID';

-- Remove test waitlist entries
DELETE FROM waitlist WHERE tenant_id = 'YOUR_TENANT_ID';

-- Remove test appointments
DELETE FROM appointments WHERE tenant_id = 'YOUR_TENANT_ID' AND status = 'cancelled';

-- Remove test audit logs
DELETE FROM audit_log WHERE tenant_id = 'YOUR_TENANT_ID' AND action LIKE 'waitlist%';
```

---

## Troubleshooting

### Issue: No holds created on cancellation

**Check:**
1. Server logs for errors
2. Waitlist entries exist with status 'active'
3. Waitlist preferences match cancelled appointment
4. No existing active holds for waitlist entries

### Issue: Worker not expiring holds

**Check:**
1. Server logs for "Starting waitlist hold expiration worker"
2. Worker running without errors
3. `hold_until` timestamps are in the past

### Issue: Database errors

**Check:**
1. Migration `042_waitlist_holds_updated_at.sql` applied
2. All foreign key references valid
3. Check constraints satisfied

---

## Success Criteria Summary

All test scenarios should pass with:
- ✅ Correct status transitions
- ✅ Proper audit logging without PHI
- ✅ No race conditions
- ✅ Efficient database queries
- ✅ Automatic expiration working
- ✅ Manual operations working
- ✅ Statistics accurate
- ✅ Error handling robust
