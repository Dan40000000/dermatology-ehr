# Time Blocks API Test Scenarios

This document provides comprehensive test scenarios for the Time Blocks CRUD API.

## Prerequisites

Before testing, ensure you have:
- A valid authentication token
- A tenant ID
- At least one provider ID
- At least one location ID

## Test Scenario 1: Create a One-Time Block

**Purpose**: Verify basic time block creation without recurrence

### Request
```http
POST /api/time-blocks
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "providerId": "provider-uuid-here",
  "locationId": "location-uuid-here",
  "title": "Conference",
  "blockType": "out_of_office",
  "description": "Attending dermatology conference",
  "startTime": "2025-02-15T08:00:00Z",
  "endTime": "2025-02-15T17:00:00Z",
  "isRecurring": false
}
```

### Expected Response
- Status: `201 Created`
- Body contains `timeBlock` object with `id`
- Audit log entry created for `time_block_create`

### Validation Checks
- Time block is created with status `active`
- `createdBy` field populated with current user ID
- `createdAt` and `updatedAt` timestamps are set

---

## Test Scenario 2: Create Daily Recurring Lunch Block

**Purpose**: Test daily recurrence pattern

### Request
```http
POST /api/time-blocks
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "providerId": "provider-uuid-here",
  "title": "Lunch Break",
  "blockType": "lunch",
  "description": "Daily lunch hour",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "daily",
    "until": "2025-12-31"
  }
}
```

### Expected Response
- Status: `201 Created`
- `recurrencePattern` stored as JSON string
- `recurrenceEndDate` set to "2025-12-31"

---

## Test Scenario 3: Create Weekly Team Meeting

**Purpose**: Test weekly recurrence with specific days

### Request
```http
POST /api/time-blocks
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "providerId": "provider-uuid-here",
  "locationId": "location-uuid-here",
  "title": "Team Standup",
  "blockType": "meeting",
  "description": "Weekly team meeting every Monday and Wednesday",
  "startTime": "2025-01-20T09:00:00Z",
  "endTime": "2025-01-20T09:30:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "weekly",
    "days": [1, 3],
    "until": "2025-12-31"
  }
}
```

### Expected Response
- Status: `201 Created`
- Pattern correctly stored with days [1, 3] (Monday and Wednesday)

---

## Test Scenario 4: Create Biweekly Admin Time

**Purpose**: Test biweekly recurrence pattern

### Request
```http
POST /api/time-blocks
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "providerId": "provider-uuid-here",
  "title": "Administrative Tasks",
  "blockType": "admin",
  "description": "Biweekly admin time every Friday",
  "startTime": "2025-01-17T14:00:00Z",
  "endTime": "2025-01-17T16:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "biweekly",
    "days": [5],
    "until": "2025-12-31"
  }
}
```

### Expected Response
- Status: `201 Created`
- Biweekly pattern stored correctly

---

## Test Scenario 5: Create Monthly Continuing Education

**Purpose**: Test monthly recurrence with specific day of month

### Request
```http
POST /api/time-blocks
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "providerId": "provider-uuid-here",
  "title": "Continuing Education",
  "blockType": "continuing_education",
  "description": "Monthly CE webinar on the 15th",
  "startTime": "2025-01-15T18:00:00Z",
  "endTime": "2025-01-15T20:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "monthly",
    "dayOfMonth": 15,
    "until": "2025-12-31"
  }
}
```

### Expected Response
- Status: `201 Created`
- Monthly pattern with day 15 stored correctly

---

## Test Scenario 6: Conflict Detection - Time Block Overlap

**Purpose**: Verify conflict detection with existing time blocks

### Setup
First create a time block:
```http
POST /api/time-blocks
{
  "providerId": "provider-uuid-here",
  "title": "Meeting 1",
  "blockType": "meeting",
  "startTime": "2025-02-20T10:00:00Z",
  "endTime": "2025-02-20T11:00:00Z",
  "isRecurring": false
}
```

### Conflict Request
Try to create overlapping block:
```http
POST /api/time-blocks
{
  "providerId": "provider-uuid-here",
  "title": "Meeting 2",
  "blockType": "meeting",
  "startTime": "2025-02-20T10:30:00Z",
  "endTime": "2025-02-20T11:30:00Z",
  "isRecurring": false
}
```

### Expected Response
- Status: `409 Conflict`
- Error message: "Conflict detected with existing time block"
- Response includes `conflictType: "time_block"`

---

## Test Scenario 7: Conflict Detection - Appointment Overlap

**Purpose**: Verify conflict detection with existing appointments

### Prerequisites
- Existing appointment for the provider at a specific time

### Request
Try to create a time block during an appointment:
```http
POST /api/time-blocks
{
  "providerId": "provider-with-appointment",
  "title": "Blocked Time",
  "blockType": "blocked",
  "startTime": "<same-as-appointment-start>",
  "endTime": "<same-as-appointment-end>",
  "isRecurring": false
}
```

### Expected Response
- Status: `409 Conflict`
- Error message: "Conflict detected with existing appointment"
- Response includes `conflictType: "appointment"`

---

## Test Scenario 8: List Time Blocks with Filters

**Purpose**: Test query filtering capabilities

### Request 1: Filter by Provider
```http
GET /api/time-blocks?providerId=provider-uuid-here
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
```

### Request 2: Filter by Date Range
```http
GET /api/time-blocks?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z
```

### Request 3: Filter by Location
```http
GET /api/time-blocks?locationId=location-uuid-here
```

### Request 4: Combined Filters
```http
GET /api/time-blocks?providerId=provider-uuid&startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&status=active
```

### Expected Responses
- Status: `200 OK`
- Returns array of time blocks matching filters
- Includes provider and location names (joined data)

---

## Test Scenario 9: Expand Recurring Blocks

**Purpose**: Test recurrence expansion for calendar views

### Setup
Create a weekly recurring block (Mon, Wed, Fri):
```http
POST /api/time-blocks
{
  "providerId": "provider-uuid-here",
  "title": "Office Hours",
  "blockType": "blocked",
  "startTime": "2025-01-06T09:00:00Z",
  "endTime": "2025-01-06T17:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "weekly",
    "days": [1, 3, 5],
    "until": "2025-12-31"
  }
}
```

### Query with Expansion
```http
GET /api/time-blocks?providerId=provider-uuid&startDate=2025-01-01&endDate=2025-01-31&expand=true
```

### Expected Response
- Status: `200 OK`
- Returns individual instances for each Mon/Wed/Fri in January
- Each instance has:
  - `isInstance: true`
  - `parentId`: Original block ID
  - Specific `startTime` and `endTime` for that occurrence

---

## Test Scenario 10: Get Single Time Block

**Purpose**: Retrieve specific block details

### Request
```http
GET /api/time-blocks/<block-id>
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
```

### Expected Response
- Status: `200 OK`
- Returns complete time block details
- Includes `providerName` and `locationName`
- Includes `createdBy` information

### Error Case
```http
GET /api/time-blocks/non-existent-uuid
```
- Status: `404 Not Found`
- Error message: "Time block not found"

---

## Test Scenario 11: Update Time Block

**Purpose**: Test partial updates to existing blocks

### Request 1: Update Title and Description
```http
PATCH /api/time-blocks/<block-id>
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json

{
  "title": "Updated Meeting Title",
  "description": "New description"
}
```

### Request 2: Update Time (No Conflict)
```http
PATCH /api/time-blocks/<block-id>
{
  "startTime": "2025-02-20T14:00:00Z",
  "endTime": "2025-02-20T15:00:00Z"
}
```

### Request 3: Update Location
```http
PATCH /api/time-blocks/<block-id>
{
  "locationId": "new-location-uuid"
}
```

### Expected Responses
- Status: `200 OK`
- Returns updated time block
- `updatedAt` timestamp updated
- Audit log entry created for `time_block_update`

---

## Test Scenario 12: Update with Conflict

**Purpose**: Verify conflict detection during updates

### Setup
Two time blocks exist for same provider at different times

### Request
Try to update one to overlap with the other:
```http
PATCH /api/time-blocks/<block-1-id>
{
  "startTime": "<overlapping-with-block-2>",
  "endTime": "<overlapping-with-block-2>"
}
```

### Expected Response
- Status: `409 Conflict`
- Error indicates conflict type
- Original block remains unchanged

---

## Test Scenario 13: Cancel Time Block via PATCH

**Purpose**: Test soft delete via status update

### Request
```http
PATCH /api/time-blocks/<block-id>
{
  "status": "cancelled"
}
```

### Expected Response
- Status: `200 OK`
- Block status changed to `cancelled`
- Audit log entry created for `time_block_cancel`

### Verification
```http
GET /api/time-blocks?status=cancelled
```
Should return the cancelled block

---

## Test Scenario 14: Delete Time Block

**Purpose**: Test hard delete endpoint (actually soft delete)

### Request
```http
DELETE /api/time-blocks/<block-id>
Authorization: Bearer <your-token>
x-tenant-id: <your-tenant-id>
```

### Expected Response
- Status: `200 OK`
- Message: "Time block deleted successfully"
- Audit log entry created for `time_block_delete`

### Verification
Block should have status `cancelled` in database

---

## Test Scenario 15: Validation Errors

**Purpose**: Test input validation

### Test 1: Missing Required Fields
```http
POST /api/time-blocks
{
  "title": "Missing Provider"
}
```
Expected: `400 Bad Request` with validation details

### Test 2: Invalid Block Type
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Test",
  "blockType": "invalid_type",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:00:00Z"
}
```
Expected: `400 Bad Request` - invalid enum value

### Test 3: End Time Before Start Time
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Test",
  "blockType": "blocked",
  "startTime": "2025-01-15T13:00:00Z",
  "endTime": "2025-01-15T12:00:00Z"
}
```
Expected: `400 Bad Request` - "End time must be after start time"

### Test 4: Recurring Without Pattern
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Test",
  "blockType": "blocked",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:00:00Z",
  "isRecurring": true
}
```
Expected: `400 Bad Request` - "Recurrence pattern required when isRecurring is true"

---

## Test Scenario 16: Authorization Tests

**Purpose**: Verify role-based access control

### Test 1: Unauthorized User
Request without authentication token
Expected: `401 Unauthorized`

### Test 2: Wrong Tenant
Request with valid token but wrong tenant ID
Expected: `403 Forbidden`

### Test 3: Insufficient Role
Try to create/update/delete with role `ma` (not authorized)
Expected: `403 Insufficient role`

---

## Test Scenario 17: Tenant Isolation

**Purpose**: Verify data isolation between tenants

### Setup
1. Create time block as Tenant A
2. Try to access as Tenant B

### Request
```http
GET /api/time-blocks/<tenant-a-block-id>
Authorization: Bearer <tenant-b-token>
x-tenant-id: <tenant-b-id>
```

### Expected Response
- Status: `404 Not Found`
- Tenant B cannot see Tenant A's blocks

---

## Performance Test Scenarios

### Test 1: Large Date Range Query
```http
GET /api/time-blocks?startDate=2025-01-01&endDate=2025-12-31
```
Should complete in reasonable time (< 1 second for moderate data)

### Test 2: Expansion Performance
```http
GET /api/time-blocks?startDate=2025-01-01&endDate=2025-12-31&expand=true
```
Should handle expansion without timeout (max 365 instances per block)

---

## Edge Cases

### Edge Case 1: Midnight Boundaries
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Overnight",
  "blockType": "blocked",
  "startTime": "2025-01-15T23:00:00Z",
  "endTime": "2025-01-16T01:00:00Z",
  "isRecurring": false
}
```
Should handle blocks spanning midnight

### Edge Case 2: Same Start and End Time
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Zero Duration",
  "blockType": "blocked",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T12:00:00Z"
}
```
Expected: `400 Bad Request` - end must be after start

### Edge Case 3: Very Long Recurrence
```http
POST /api/time-blocks
{
  "providerId": "uuid",
  "title": "Long Recurrence",
  "blockType": "lunch",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "daily",
    "until": "2030-12-31"
  }
}
```
Should create successfully (expansion limited to 365 instances)

---

## Automated Testing Checklist

- [ ] All CRUD operations work correctly
- [ ] Recurrence patterns (daily, weekly, biweekly, monthly) expand correctly
- [ ] Conflict detection catches time block overlaps
- [ ] Conflict detection catches appointment overlaps
- [ ] Validation catches all error cases
- [ ] Audit logs created for all mutations
- [ ] Tenant isolation enforced
- [ ] Role-based access control works
- [ ] Query filters work correctly
- [ ] Expansion parameter works
- [ ] Soft delete (cancel) works
- [ ] Provider and location names included in responses
- [ ] Date range queries perform well
- [ ] Error messages are clear and helpful
