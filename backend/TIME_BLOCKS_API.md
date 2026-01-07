# Time Blocks CRUD API Documentation

## Overview

The Time Blocks API provides comprehensive functionality for managing provider schedule blocks (lunch, meetings, admin time, etc.) with support for recurring patterns and conflict detection.

## Base URL
```
/api/time-blocks
```

## Authentication
All endpoints require authentication via Bearer token in the Authorization header and tenant identification via the `x-tenant-id` header.

## Endpoints

### 1. List Time Blocks
**GET** `/api/time-blocks`

Retrieve a list of time blocks with optional filtering and recurrence expansion.

#### Query Parameters
- `providerId` (optional): Filter by provider UUID
- `locationId` (optional): Filter by location UUID
- `startDate` (optional): Filter blocks starting after this date (ISO 8601)
- `endDate` (optional): Filter blocks ending before this date (ISO 8601)
- `status` (optional): Filter by status (`active` or `cancelled`). Default: `active`
- `expand` (optional): Set to `true` to expand recurring blocks into individual instances

#### Response
```json
{
  "timeBlocks": [
    {
      "id": "uuid",
      "tenantId": "tenant123",
      "providerId": "provider-uuid",
      "locationId": "location-uuid",
      "title": "Lunch Break",
      "blockType": "lunch",
      "description": "Daily lunch break",
      "startTime": "2025-01-15T12:00:00Z",
      "endTime": "2025-01-15T13:00:00Z",
      "isRecurring": true,
      "recurrencePattern": "{\"pattern\":\"daily\",\"until\":\"2026-01-15\"}",
      "recurrenceEndDate": "2026-01-15",
      "status": "active",
      "createdAt": "2025-01-01T10:00:00Z",
      "updatedAt": "2025-01-01T10:00:00Z",
      "providerName": "Dr. Smith",
      "locationName": "Main Clinic"
    }
  ]
}
```

### 2. Get Single Time Block
**GET** `/api/time-blocks/:id`

Retrieve a specific time block by ID.

#### Response
```json
{
  "timeBlock": {
    "id": "uuid",
    "tenantId": "tenant123",
    "providerId": "provider-uuid",
    "locationId": "location-uuid",
    "title": "Team Meeting",
    "blockType": "meeting",
    "description": "Weekly team standup",
    "startTime": "2025-01-15T09:00:00Z",
    "endTime": "2025-01-15T10:00:00Z",
    "isRecurring": true,
    "recurrencePattern": "{\"pattern\":\"weekly\",\"days\":[1],\"until\":\"2026-01-15\"}",
    "recurrenceEndDate": "2026-01-15",
    "status": "active",
    "createdAt": "2025-01-01T10:00:00Z",
    "updatedAt": "2025-01-01T10:00:00Z",
    "createdBy": "user-uuid",
    "providerName": "Dr. Smith",
    "locationName": "Main Clinic"
  }
}
```

#### Error Responses
- `404 Not Found`: Time block not found

### 3. Create Time Block
**POST** `/api/time-blocks`

Create a new time block with optional recurrence pattern.

#### Required Roles
- `admin`, `provider`, or `front_desk`

#### Request Body
```json
{
  "providerId": "provider-uuid",
  "locationId": "location-uuid",
  "title": "Lunch Break",
  "blockType": "lunch",
  "description": "Daily lunch hour",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:00:00Z",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "daily",
    "until": "2026-01-15"
  }
}
```

#### Block Types
- `blocked`: General blocked time
- `lunch`: Lunch break
- `meeting`: Meeting
- `admin`: Administrative time
- `continuing_education`: CE/training
- `out_of_office`: Out of office

#### Recurrence Pattern Structure

**Daily Pattern**
```json
{
  "pattern": "daily",
  "until": "2026-01-15"
}
```

**Weekly Pattern**
```json
{
  "pattern": "weekly",
  "days": [1, 3, 5],
  "until": "2026-01-15"
}
```
- `days`: Array of weekday numbers (0=Sunday, 1=Monday, ..., 6=Saturday)

**Biweekly Pattern**
```json
{
  "pattern": "biweekly",
  "days": [1, 3],
  "until": "2026-01-15"
}
```

**Monthly Pattern**
```json
{
  "pattern": "monthly",
  "dayOfMonth": 15,
  "until": "2026-12-15"
}
```
- `dayOfMonth`: Day of the month (1-31)

#### Response
```json
{
  "timeBlock": { /* time block object */ },
  "id": "newly-created-uuid"
}
```

#### Error Responses
- `400 Bad Request`: Validation error (invalid data)
- `409 Conflict`: Scheduling conflict with existing time block or appointment
  ```json
  {
    "error": "Conflict detected with existing appointment",
    "conflictType": "appointment"
  }
  ```

#### Validation Rules
- `endTime` must be after `startTime`
- If `isRecurring` is `true`, `recurrencePattern` is required
- Checks for conflicts with existing time blocks and appointments

### 4. Update Time Block
**PATCH** `/api/time-blocks/:id`

Update an existing time block. Can also be used to cancel a block.

#### Required Roles
- `admin`, `provider`, or `front_desk`

#### Request Body
All fields are optional. Only include fields you want to update.

```json
{
  "title": "Updated Lunch Break",
  "blockType": "lunch",
  "description": "Extended lunch",
  "startTime": "2025-01-15T12:00:00Z",
  "endTime": "2025-01-15T13:30:00Z",
  "locationId": "new-location-uuid",
  "isRecurring": true,
  "recurrencePattern": {
    "pattern": "daily",
    "until": "2026-06-01"
  },
  "recurrenceEndDate": "2026-06-01",
  "status": "active"
}
```

#### Cancel a Time Block
```json
{
  "status": "cancelled"
}
```

#### Response
```json
{
  "timeBlock": { /* updated time block object */ }
}
```

#### Error Responses
- `400 Bad Request`: No valid fields to update or validation error
- `404 Not Found`: Time block not found
- `409 Conflict`: Scheduling conflict when updating time (unless cancelling)

### 5. Delete Time Block
**DELETE** `/api/time-blocks/:id`

Soft delete a time block by setting its status to `cancelled`.

#### Required Roles
- `admin`, `provider`, or `front_desk`

#### Response
```json
{
  "message": "Time block deleted successfully",
  "id": "deleted-uuid"
}
```

#### Error Responses
- `404 Not Found`: Time block not found

## Features

### 1. Conflict Detection
The API automatically checks for scheduling conflicts when creating or updating time blocks:
- **Time Block Conflicts**: Checks if the provider already has an active time block during the requested time
- **Appointment Conflicts**: Checks if the provider has any appointments (excluding cancelled/no-show) during the requested time

Returns `409 Conflict` with conflict type information when a conflict is detected.

### 2. Recurrence Expansion
When querying with `expand=true` and date range parameters, recurring time blocks are expanded into individual instances:

```
GET /api/time-blocks?providerId=xxx&startDate=2025-01-01&endDate=2025-01-31&expand=true
```

Returns individual instances with:
- `isInstance`: `true` for expanded instances
- `parentId`: Original recurring block ID
- Actual `startTime` and `endTime` for each occurrence

### 3. Audit Logging
All create, update, and delete operations are automatically logged to the audit log with:
- `time_block_create`: New block created
- `time_block_update`: Block updated
- `time_block_cancel`: Block cancelled via PATCH
- `time_block_delete`: Block deleted via DELETE

### 4. Tenant Isolation
All operations automatically filter by tenant ID from the authenticated user, ensuring complete data isolation between tenants.

## Usage Examples

### Create a Daily Lunch Block
```bash
curl -X POST https://api.example.com/api/time-blocks \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: tenant123" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-uuid",
    "title": "Lunch",
    "blockType": "lunch",
    "startTime": "2025-01-15T12:00:00Z",
    "endTime": "2025-01-15T13:00:00Z",
    "isRecurring": true,
    "recurrencePattern": {
      "pattern": "daily",
      "until": "2026-01-15"
    }
  }'
```

### Create a Weekly Team Meeting
```bash
curl -X POST https://api.example.com/api/time-blocks \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: tenant123" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-uuid",
    "locationId": "location-uuid",
    "title": "Team Meeting",
    "blockType": "meeting",
    "description": "Weekly standup every Monday",
    "startTime": "2025-01-20T09:00:00Z",
    "endTime": "2025-01-20T10:00:00Z",
    "isRecurring": true,
    "recurrencePattern": {
      "pattern": "weekly",
      "days": [1],
      "until": "2026-01-20"
    }
  }'
```

### Get Provider Schedule with Expanded Recurrence
```bash
curl -X GET "https://api.example.com/api/time-blocks?providerId=provider-uuid&startDate=2025-01-01&endDate=2025-01-31&expand=true" \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: tenant123"
```

### Cancel a Time Block
```bash
curl -X PATCH https://api.example.com/api/time-blocks/<block-id> \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: tenant123" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "cancelled"
  }'
```

## Database Schema

The `time_blocks` table structure:

```sql
CREATE TABLE time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  block_type VARCHAR(50) NOT NULL DEFAULT 'blocked',
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(50),
  recurrence_end_date DATE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT valid_block_type CHECK (block_type IN ('blocked', 'lunch', 'meeting', 'admin', 'continuing_education', 'out_of_office')),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled'))
);
```

## Implementation Details

### Service Layer
The time block functionality is supported by `/src/services/timeBlockService.ts` which provides:

- `expandRecurrence()`: Expands recurring patterns into individual instances
- `hasTimeBlockConflict()`: Checks for conflicts with existing time blocks
- `hasAppointmentConflict()`: Checks for conflicts with appointments
- `hasSchedulingConflict()`: Combined conflict check (both blocks and appointments)
- `parseRecurrencePattern()`: Parses JSON recurrence patterns
- `getExpandedTimeBlocks()`: Retrieves and expands blocks for a date range

### Route Handler
The route is implemented in `/src/routes/timeBlocks.ts` and registered in the main application as:
```typescript
app.use("/api/time-blocks", timeBlocksRouter);
```

## Best Practices

1. **Always check for conflicts**: The API automatically checks, but you should handle 409 responses appropriately in your client
2. **Use recurrence for repeating blocks**: Instead of creating individual blocks, use recurrence patterns for better performance
3. **Expand judiciously**: Only use `expand=true` when you need individual instances (e.g., for calendar views)
4. **Soft delete**: Time blocks are soft-deleted (status=cancelled) to maintain audit history
5. **Date ranges**: Always specify date ranges in queries to avoid performance issues with large datasets
