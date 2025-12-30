# Task ID: 5

**Title:** Waitlist Notifications and UI

**Status:** pending

**Dependencies:** 4

**Priority:** medium

**Description:** Add notification delivery for matches and manual fill UI with status transitions.

**Details:**

SMS/Email/Portal via Twilio/SendGrid: template 'Slot available for Dr. X on DATE - reply YES'. Hold confirmation via link/SMS reply. UI: waitlist table shows matches, 'Fill' button calls API to schedule/mark resolved. Audit log: status changes.

**Test Strategy:**

E2E: trigger match, verify notification sent, accept schedules appointment, marks resolved; test rate limiting doesn't throttle.

## Subtasks

### 5.1. Implement Notification Delivery System

**Status:** pending  
**Dependencies:** None  

Develop SMS and Email notification delivery using Twilio and SendGrid with PHI-redacted templates for waitlist matches.

**Details:**

Create service for sending 'Slot available for Dr. X on DATE - reply YES' via Twilio SMS (HIPAA-eligible) and SendGrid Email (non-PHI). Add rate limiting, audit logging without PHI, and portal notifications. Use dynamic templates.

### 5.2. Build Confirmation Handling Logic

**Status:** pending  
**Dependencies:** 5.1  

Handle patient confirmations via SMS reply parsing and confirmation links to create holds and transition statuses.

**Details:**

Set up Twilio webhook for SMS replies ('YES'), parse and call API to create hold slot (24h window), update waitlist to 'confirmed'. Implement secure links in emails/SMS for portal confirmation. Ensure audit trails for all actions.

### 5.3. Develop Waitlist UI Table and Manual Fill

**Status:** pending  
**Dependencies:** 5.1  

Build frontend waitlist table displaying matches with 'Fill' buttons, status transitions, and API integration.

**Details:**

React table showing waitlist entries, matches highlighted, 'Fill' button triggers API to schedule appointment/mark resolved. Include status badges, audit log viewer. Handle loading/error states, responsive design.
