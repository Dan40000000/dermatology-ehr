# Task ID: 3

**Title:** Scheduler UI for Time Blocks

**Status:** pending

**Dependencies:** 2

**Priority:** high

**Description:** Update scheduler frontend to display time blocks with color coding, tooltips, and block booking conflicts.

**Details:**

In React/Vue scheduler component: fetch blocks via API, render as colored overlays on calendar grid, tooltips show details/recurrence. Disable drag-drop/book on blocked times. Use CSS classes for colors from block data. Add create/edit modals calling CRUD APIs. Ensure responsive for desktop/mobile.

**Test Strategy:**

E2E tests: view blocks in scheduler, create block, verify visual overlap blocking, tooltip content, mobile rendering; unit tests for component rendering with mock data.

## Subtasks

### 3.1. API Integration and Calendar Overlay Rendering

**Status:** pending  
**Dependencies:** None  

Fetch time blocks via API and render as colored overlays on the scheduler calendar grid using CSS classes from block data.

**Details:**

Integrate with Task 2 APIs (GET /api/time_blocks). Use React scheduler library (e.g., Kendo/Syncfusion) to display blocks as events/overlays. Apply dynamic CSS classes based on color_code field for visual distinction.

### 3.2. Tooltips, Drag-Drop Disable, and Responsive Design

**Status:** pending  
**Dependencies:** 3.1  

Implement tooltips showing block details/recurrence, disable drag-drop/booking on blocked times, and ensure responsive layout for desktop/mobile.

**Details:**

Add custom tooltips via scheduler event templates (details, recurrence_pattern). Configure scheduler editable=false or custom validation for blocked slots. Use media queries/CSS flex for mobile responsiveness across views (day/week/month).

### 3.3. Create/Edit Modals with Form Validation and CRUD APIs

**Status:** pending  
**Dependencies:** 3.1  

Add modals for creating/editing time blocks with form validation, calling CRUD APIs for provider/location blocks.

**Details:**

Build React modals triggered from scheduler UI. Forms validate start/end times, recurrence JSON, conflicts. Call POST/PATCH/DELETE to Task 2 APIs, refresh calendar on success. Include color_code/description fields.
