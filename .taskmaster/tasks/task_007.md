# Task ID: 7

**Title:** Rx UI for ePA Requests

**Status:** pending

**Dependencies:** 6

**Priority:** high

**Description:** Integrate ePA into Rx workflow: submit request, track status/history, upload docs.

**Details:**

Rx form: 'Request PA' button → modal with payer/member select, submit via adapter. Status badge updates via polling/websockets. History accordion, doc upload drag-drop to attachments[]. Errors toast notifications.

**Test Strategy:**

E2E: Rx → PA submit → status changes → approve/deny flows; verify history/attachments persist.

## Subtasks

### 7.1. Rx Form Integration with PA Modal

**Status:** pending  
**Dependencies:** None  

Add 'Request PA' button to Rx form, open modal with payer/member selection, and submit request via ePA adapter.

**Details:**

Implement button click handler to open modal; add dropdowns for payer_id and member_id selection from available options; call PriorAuthAdapter.submit() on form submit with rx_id, selected payer/member; close modal on success.

### 7.2. Status Polling/WebSockets and History UI

**Status:** pending  
**Dependencies:** 7.1  

Update status badge via polling or WebSockets, implement history accordion displaying request timeline.

**Details:**

Add status badge component that polls adapter.poll_status() every 5s or listens to WebSocket events for prior_auth_requests updates; render history accordion from history JSON field with timestamps/status changes; support both polling fallback and WebSocket preferred.

### 7.3. Document Upload Drag-Drop and Error Handling

**Status:** pending  
**Dependencies:** 7.1  

Implement drag-drop file upload to attachments array, show toast notifications for errors.

**Details:**

Use HTML5 drag-drop API or library for file uploads; on drop, call PriorAuthAdapter.attach_doc() with file; append to attachments[] JSON on success; implement toast notifications for errors (network, file size, adapter failures) using toast library.
