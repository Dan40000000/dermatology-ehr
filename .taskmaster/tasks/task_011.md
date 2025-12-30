# Task ID: 11

**Title:** Compliance and Monitoring Setup

**Status:** pending

**Dependencies:** 2, 5, 7, 9

**Priority:** medium

**Description:** Implement HIPAA audit logs, PHI redaction, monitoring for queues/retries.

**Details:**

Audit log table for key actions (block create, PA submit, fax send). Lograge/Sentry without PHI (hash PII). Queue monitoring: Sidekiq dashboard, retries x3 then dead letter. Rate limits on notifications.

**Test Strategy:**

Verify logs redact PHI; simulate queue failure → retries → DLQ; load test rate limits.

## Subtasks

### 11.1. HIPAA Audit Log Table and Service

**Status:** pending  
**Dependencies:** None  

Design and implement database table and service for logging key HIPAA-compliant audit events like block creation, PA submission, and fax sending.

**Details:**

Create Rails migration for phi_access_log table using phi_attrs gem; define fields for user_id, action, timestamp, request_uuid; integrate automated logging in relevant models/services for block create, PA submit, fax send with immutable storage.

### 11.2. PHI Redaction in Lograge and Sentry

**Status:** pending  
**Dependencies:** None  

Configure Lograge and Sentry to hash or redact all PHI/PII before logging to ensure HIPAA compliance.

**Details:**

Implement phi_attrs for explicit PHI access control; add middleware to hash PII in logs; update Lograge formatter and Sentry DSN config to strip sensitive data; test with sample PHI payloads to confirm redaction.

### 11.3. Sidekiq Queue Monitoring and Retries

**Status:** pending  
**Dependencies:** None  

Set up Sidekiq dashboard for monitoring, configure retries (max 3) with dead letter queue (DLQ) for failed jobs.

**Details:**

Install Sidekiq web UI with authentication; configure sidekiq.yml for retry: 3, dead: true; create DLQ processing worker; integrate monitoring alerts for high retry/failure rates; log non-PHI queue events to audit system.

### 11.4. Notification Rate Limiting Configuration

**Status:** pending  
**Dependencies:** 11.1  

Implement rate limits on notification endpoints/services to prevent abuse while maintaining HIPAA audit logging.

**Details:**

Use Rack::Attack or Redis-based rate limiter on notification APIs/workers; set limits e.g., 100/hour per user/IP; log rate limit events to audit log without PHI; configure exceptions for critical alerts.
