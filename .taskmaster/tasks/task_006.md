# Task ID: 6

**Title:** ePA Database and Adapter Interface

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Create prior_auth_requests table and pluggable mock adapter for ePA MVP.

**Details:**

DB migration: `prior_auth_requests` (id, rx_id, payer_id, member_id, status enum(submitted,pending,approved,denied,addl_info), history JSON, attachments JSON[], submitted_at). Adapter: abstract class PriorAuthAdapter with submit(req), poll_status(id), attach_doc(id,doc). Mock impl: async delays, random outcomes.

**Test Strategy:**

Migration tests; adapter unit tests: full state machine cycle with mock responses.

## Subtasks

### 6.1. Create prior_auth_requests DB Migration

**Status:** pending  
**Dependencies:** None  

Develop and run database migration to create the prior_auth_requests table with specified schema including enums and JSON fields.

**Details:**

Implement Rails migration or equivalent SQL for table: id (primary key), rx_id, payer_id, member_id, status enum('submitted','pending','approved','denied','addl_info'), history JSON, attachments JSON[], submitted_at timestamp. Add any necessary indexes on rx_id, payer_id, member_id.

### 6.2. Implement PriorAuthAdapter and Mock

**Status:** pending  
**Dependencies:** 6.1  

Define abstract PriorAuthAdapter class and concrete MockPriorAuthAdapter with async methods for submit, poll_status, and attach_doc simulating real-world behavior.

**Details:**

Abstract class: async submit(req), poll_status(id), attach_doc(id, doc). Mock impl: use async delays (e.g., 1-5s random), random status outcomes (approved/denied/etc.), store state in memory/DB for polling, simulate history/attachments JSON updates.
