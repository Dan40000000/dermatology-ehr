# Task ID: 10

**Title:** Portal Pre-Check-In Enhancements

**Status:** pending

**Dependencies:** None

**Priority:** medium

**Description:** Polish portal to show/resume/complete pre-check-in with backend session sync.

**Details:**

Portal appointments list: precheckin_status badge. Resume/complete buttons → API updates session, sets appointment 'confirmed', optional SMS/email. Backend: session expiry 24h, audit logs for completions.

**Test Strategy:**

E2E: start precheckin → portal shows state → complete → appointment confirmed + notification.

## Subtasks

### 10.1. Implement Backend Session Sync and Expiry Logic

**Status:** pending  
**Dependencies:** None  

Develop backend logic for pre-check-in session management including 24-hour expiry, API endpoints for resume/complete actions that update session and set appointment to 'confirmed', with optional SMS/email notifications and audit logging.

**Details:**

Create session model with expiry timestamp (24h from start). API: POST /api/precheckin/:session_id/resume, POST /api/precheckin/:session_id/complete → update appointment.confirmed=true, send optional SMS/email via service, log audit entry without PHI. Handle expired sessions with 410 Gone.
