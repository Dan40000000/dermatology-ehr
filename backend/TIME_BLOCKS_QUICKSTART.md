# Time Blocks API - Quick Start Guide

## Setup

The Time Blocks API is already integrated into the application. No additional setup required!

**Route**: `http://localhost:3000/api/time-blocks` (or your configured backend URL)

**Authentication**: All requests require:
- `Authorization: Bearer <token>` header
- `x-tenant-id: <tenant-id>` header

## Quick Examples

### 1. Create a Simple Block (One-Time)

```bash
curl -X POST http://localhost:3000/api/time-blocks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-uuid",
    "title": "Conference",
    "blockType": "out_of_office",
    "description": "Annual dermatology conference",
    "startTime": "2025-02-15T08:00:00Z",
    "endTime": "2025-02-15T17:00:00Z",
    "isRecurring": false
  }'
```

### 2. Create Daily Lunch Blocks

```bash
curl -X POST http://localhost:3000/api/time-blocks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-uuid",
    "title": "Lunch Break",
    "blockType": "lunch",
    "startTime": "2025-01-15T12:00:00Z",
    "endTime": "2025-01-15T13:00:00Z",
    "isRecurring": true,
    "recurrencePattern": {
      "pattern": "daily",
      "until": "2025-12-31"
    }
  }'
```

### 3. Create Weekly Team Meeting (Every Monday)

```bash
curl -X POST http://localhost:3000/api/time-blocks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-uuid",
    "locationId": "location-uuid",
    "title": "Team Standup",
    "blockType": "meeting",
    "description": "Weekly team meeting",
    "startTime": "2025-01-06T09:00:00Z",
    "endTime": "2025-01-06T09:30:00Z",
    "isRecurring": true,
    "recurrencePattern": {
      "pattern": "weekly",
      "days": [1],
      "until": "2025-12-31"
    }
  }'
```

**Days of week**: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday

### 4. Get All Blocks for a Provider

```bash
curl -X GET "http://localhost:3000/api/time-blocks?providerId=provider-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

### 5. Get Provider Schedule for January 2025 (Expanded)

```bash
curl -X GET "http://localhost:3000/api/time-blocks?providerId=provider-uuid&startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z&expand=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

With `expand=true`, recurring blocks are expanded into individual instances.

### 6. Get a Specific Block

```bash
curl -X GET http://localhost:3000/api/time-blocks/BLOCK_UUID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

### 7. Update a Block

```bash
curl -X PATCH http://localhost:3000/api/time-blocks/BLOCK_UUID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Extended Lunch",
    "endTime": "2025-01-15T13:30:00Z"
  }'
```

### 8. Cancel a Block

```bash
curl -X PATCH http://localhost:3000/api/time-blocks/BLOCK_UUID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "cancelled"
  }'
```

Or use DELETE:

```bash
curl -X DELETE http://localhost:3000/api/time-blocks/BLOCK_UUID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

## Block Types

Choose from:
- `blocked` - Generic blocked time
- `lunch` - Lunch breaks
- `meeting` - Meetings
- `admin` - Administrative tasks
- `continuing_education` - Training/CE
- `out_of_office` - Out of office

## Recurrence Patterns

### Daily
Every day until specified date:
```json
{
  "pattern": "daily",
  "until": "2025-12-31"
}
```

### Weekly
Specific days of the week:
```json
{
  "pattern": "weekly",
  "days": [1, 3, 5],
  "until": "2025-12-31"
}
```
Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

### Biweekly
Every other week on specific days:
```json
{
  "pattern": "biweekly",
  "days": [2, 4],
  "until": "2025-12-31"
}
```

### Monthly
Specific day of each month:
```json
{
  "pattern": "monthly",
  "dayOfMonth": 15,
  "until": "2025-12-31"
}
```

## Common Scenarios

### Scenario 1: Block Out Lunch Every Weekday

```json
{
  "providerId": "...",
  "title": "Lunch",
  "blockType": "lunch",
  "startTime": "2025-01-06T12:00:00Z",
  "endTime": "2025-01-06T13:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "weekly",
    "days": [1, 2, 3, 4, 5],
    "until": "2025-12-31"
  }
}
```

### Scenario 2: Monthly All-Staff Meeting (First Monday)

1. Find the first Monday of the month (e.g., 2025-01-06)
2. Create block:

```json
{
  "providerId": "...",
  "title": "All-Staff Meeting",
  "blockType": "meeting",
  "startTime": "2025-01-06T08:00:00Z",
  "endTime": "2025-01-06T09:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "monthly",
    "dayOfMonth": 6,
    "until": "2025-12-31"
  }
}
```

### Scenario 3: Half-Day Block for Administrative Tasks

```json
{
  "providerId": "...",
  "title": "Chart Review",
  "blockType": "admin",
  "startTime": "2025-01-15T13:00:00Z",
  "endTime": "2025-01-15T17:00:00Z",
  "isRecurring": false
}
```

### Scenario 4: Out of Office for Vacation

```json
{
  "providerId": "...",
  "title": "Vacation",
  "blockType": "out_of_office",
  "startTime": "2025-07-01T00:00:00Z",
  "endTime": "2025-07-15T23:59:59Z",
  "isRecurring": false
}
```

## Conflict Handling

If you try to create a block that conflicts with:
- An existing time block, OR
- An existing appointment

You'll get a `409 Conflict` response:

```json
{
  "error": "Conflict detected with existing appointment",
  "conflictType": "appointment"
}
```

**Resolution Options**:
1. Choose a different time
2. Cancel the conflicting block/appointment first
3. Update the existing block instead of creating a new one

## Frontend Integration Tips

### Calendar View

Use expanded query for calendar display:

```javascript
const getProviderSchedule = async (providerId, startDate, endDate) => {
  const response = await fetch(
    `/api/time-blocks?providerId=${providerId}&startDate=${startDate}&endDate=${endDate}&expand=true`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    }
  );
  return response.json();
};
```

### Conflict Prevention

Before scheduling an appointment, check for blocks:

```javascript
const checkAvailability = async (providerId, startTime, endTime) => {
  // Get blocks for the time range
  const response = await fetch(
    `/api/time-blocks?providerId=${providerId}&startDate=${startTime}&endDate=${endTime}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    }
  );
  const { timeBlocks } = await response.json();

  // If any blocks found, time is not available
  return timeBlocks.length === 0;
};
```

### Creating Blocks from UI

```javascript
const createTimeBlock = async (blockData) => {
  try {
    const response = await fetch('/api/time-blocks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(blockData)
    });

    if (response.status === 409) {
      const error = await response.json();
      alert(`Conflict: ${error.error}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Error creating time block:', error);
    throw error;
  }
};
```

## Response Formats

### Success Response (List)
```json
{
  "timeBlocks": [
    {
      "id": "uuid",
      "providerId": "uuid",
      "providerName": "Dr. Smith",
      "locationId": "uuid",
      "locationName": "Main Clinic",
      "title": "Lunch Break",
      "blockType": "lunch",
      "description": "Daily lunch",
      "startTime": "2025-01-15T12:00:00Z",
      "endTime": "2025-01-15T13:00:00Z",
      "isRecurring": true,
      "recurrencePattern": "{...}",
      "status": "active",
      "createdAt": "2025-01-01T10:00:00Z",
      "updatedAt": "2025-01-01T10:00:00Z"
    }
  ]
}
```

### Success Response (Single)
```json
{
  "timeBlock": { /* same structure as above */ }
}
```

### Error Response
```json
{
  "error": "Validation error",
  "details": { /* Zod validation details */ }
}
```

## Permissions

**Who Can Create/Update/Delete?**
- Admins
- Providers (for their own blocks)
- Front desk staff

**Who Can View?**
- All authenticated users can view blocks

## Tips & Best Practices

1. **Use Recurrence**: For regular blocks (lunch, meetings), use recurrence instead of creating individual blocks
2. **Check Expand**: Use `expand=true` only when you need individual instances (e.g., calendar views)
3. **Date Ranges**: Always use date ranges in queries to limit result size
4. **Soft Delete**: Blocks are soft-deleted (cancelled), so you can recover them if needed
5. **Conflict Detection**: Let the API handle conflict detection - it checks both blocks and appointments
6. **Time Zones**: All times are in UTC (ISO 8601 format)
7. **Validation**: The API validates all inputs - check for 400 errors

## Troubleshooting

### "401 Unauthorized"
- Check your Bearer token is valid
- Ensure token hasn't expired

### "403 Forbidden"
- Check your role (need admin, provider, or front_desk for mutations)
- Verify tenant ID matches your token

### "404 Not Found"
- UUID doesn't exist, or
- Block belongs to different tenant

### "409 Conflict"
- Time overlaps with existing block or appointment
- Check `conflictType` in response
- Choose different time or cancel conflicting item

### "400 Bad Request"
- Validation error
- Check `details` in response for specific issues
- Common: invalid UUID, end time before start time, missing required fields

## Next Steps

- See **TIME_BLOCKS_API.md** for complete API documentation
- See **TIME_BLOCKS_TEST_SCENARIOS.md** for comprehensive test cases
- See **TIME_BLOCKS_IMPLEMENTATION_SUMMARY.md** for technical details

## Support

For issues or questions:
1. Check the full API documentation
2. Review test scenarios for examples
3. Check browser/server console for error details
4. Verify authentication and permissions
