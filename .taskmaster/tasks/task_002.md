# Task ID: 2

**Title:** Time Blocks CRUD APIs

**Status:** pending

**Dependencies:** 1

**Priority:** high

**Description:** Implement RESTful APIs for creating, reading, updating, deleting time blocks with recurrence and cancellation logic.

**Details:**

Build endpoints: POST /api/time_blocks (create with optional recurrence), GET /api/time_blocks?provider_id=X&date=Y (list with expansions), PATCH /api/time_blocks/:id (update/cancel), DELETE /api/time_blocks/:id. Use service layer for recurrence expansion (e.g., 6 months ahead). Integrate conflict check against existing blocks/appointments. Return 409 on overlaps. Use JSON recurrence like {pattern: 'weekly', days: [1,3], until: '2026-06-01'}.

**Test Strategy:**

API tests: happy path CRUD; recurrence expansion matches expected instances; conflict detection blocks overlapping create/update; cancellation removes future instances; edge cases like same-minute overlaps.

## Subtasks

### 2.1. Implement POST /api/time_blocks Create Endpoint

**Status:** pending  
**Dependencies:** None  

Build the create endpoint with recurrence pattern parsing, validation, initial conflict check, and service layer integration for generating instances.

**Details:**

Parse JSON recurrence (e.g., {pattern: 'weekly', days: [1,3], until: '2026-06-01'}); validate inputs; call service to expand up to 6 months; check overlaps against existing blocks/appointments; return 409 on conflicts; use transactions.

### 2.2. Implement GET /api/time_blocks List Endpoint

**Status:** pending  
**Dependencies:** None  

Develop the list endpoint filtering by provider_id and date, with on-demand recurrence expansion and support for expansions.

**Details:**

Query time_blocks by provider_id and date range; use service layer to expand recurrences visible on that date (6 months logic); include expansions in response; add pagination if needed; optimize with indexes.

### 2.3. Implement PATCH /api/time_blocks/:id Update/Cancel

**Status:** pending  
**Dependencies:** None  

Create update and cancel logic for single instances or series, including conflict checks on updates and future instance handling.

**Details:**

Support partial updates via PATCH; handle cancel (set is_active=false or delete future instances); re-check conflicts on updates; optimistic concurrency if possible; integrate service for series updates.

### 2.4. Implement DELETE /api/time_blocks/:id and Integrations

**Status:** pending  
**Dependencies:** None  

Build delete endpoint with confirmation of no dependencies, full CRUD integration, error handling, and 409 responses for conflicts.

**Details:**

Soft/hard delete logic; ensure no active appointments overlap; integrate conflict checks across all endpoints; add auth/RBAC; consistent error responses; transaction safety for all operations.
