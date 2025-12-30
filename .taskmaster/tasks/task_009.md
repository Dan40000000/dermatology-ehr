# Task ID: 9

**Title:** Fax UI Inbox/Outbox

**Status:** pending

**Dependencies:** 8

**Priority:** medium

**Description:** Add Documents tab for fax send/retry/view/download.

**Details:**

New tabs: Inbox (inbound faxes), Outbox (outbound). List with status icons, retry failed sends, download PDF viewer. Send modal: select doc/PDF upload, to number, call adapter.

**Test Strategy:**

E2E: send fax → status updates → download; receive webhook → appears in inbox; retry failed.

## Subtasks

### 9.1. Implement Inbox/Outbox Tabs with Status Lists and PDF Viewer

**Status:** pending  
**Dependencies:** None  

Create UI tabs for Inbox (inbound faxes) and Outbox (outbound faxes) displaying lists with status icons and integrated PDF viewer for viewing documents.

**Details:**

Use React components for tabbed interface; fetch fax lists via API with status filtering (pending, sent, failed, received); render status icons (e.g., green check, red X); embed PDF viewer (e.g., react-pdf) for preview; ensure responsive design and loading states.

### 9.2. Build Send Modal, Retry Logic, and Download Handling

**Status:** pending  
**Dependencies:** 9.1  

Develop send modal for fax dispatch, implement retry for failed outbound faxes, and handle PDF downloads from both tabs.

**Details:**

Send modal: form with document selector/PDF upload, recipient number input, submit calls fax adapter API; retry button for failed outbox items triggers re-send API; download generates blob URL from fax PDF endpoint; add confirmation dialogs and error toasts.
