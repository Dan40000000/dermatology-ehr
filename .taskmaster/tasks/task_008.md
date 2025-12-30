# Task ID: 8

**Title:** Fax Database and Adapter MVP

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Implement faxes table and mock fax adapter with inbound webhook.

**Details:**

DB: `faxes` (id, direction enum(in,out), status enum(queued,sent,delivered,failed), from/to numbers, doc_id, error_msg, timestamps). Adapter: FaxAdapter send(pdf, to), receive webhook → create fax + attach doc to patient/doc queue. Mock: store files locally, simulate delays/errors.

**Test Strategy:**

Unit: adapter send/receive; webhook POST handling creates records correctly; integration: full inbound → doc queue.

## Subtasks

### 8.1. Create faxes table migration

**Status:** pending  
**Dependencies:** None  

Generate and run database migration to create the faxes table with specified fields, enums, indexes, and constraints.

**Details:**

Use Rails migration: create_table :faxes with id (primary key), direction enum('in','out'), status enum('queued','sent','delivered','failed'), from_number, to_number, doc_id, error_msg (nullable), created_at, updated_at. Add indexes on direction, status, doc_id. Implement check constraints for valid enums and timestamps.

### 8.2. Implement FaxAdapter with mock send/receive

**Status:** pending  
**Dependencies:** 8.1  

Develop FaxAdapter class with send(pdf, to) and receive webhook methods, using local file storage and simulated delays/errors.

**Details:**

Create mock FaxAdapter: send() stores PDF locally, updates fax status asynchronously (queued→sent→delivered/failed with random errors/delays 1-5s), returns fax ID. Receive() handles webhook payload to create fax record and queue doc. Use local dir for files, simulate via threads/async.

### 8.3. Build inbound webhook endpoint and doc queue integration

**Status:** pending  
**Dependencies:** 8.1, 8.2  

Add POST /webhooks/fax_inbound endpoint to process incoming faxes, create records via adapter, and attach to patient/doc queue.

**Details:**

Implement Rails/Sinatra endpoint: validate signature if needed, parse JSON (fax_id, status, direction, numbers, pdf_url), call adapter.receive(), integrate with existing doc queue (e.g., Sidekiq/Redis) to attach to patient/doc. Log errors, return 200.
