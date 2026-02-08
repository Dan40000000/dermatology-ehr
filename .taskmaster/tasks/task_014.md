# Task ID: 14

**Title:** Security Middleware Stack (UNIVERSAL-006)

**Status:** in_progress

**Dependencies:** 13

**Priority:** high

**Description:** Implement baseline security controls for PII, tenant isolation, privileged endpoints, and input sanitization.

**Details:**

Add backend security modules for encryption, tenant enforcement, secret management, admin auth for health endpoints, and input sanitization; update frontend token handling to HttpOnly cookies.

**Test Strategy:**

Unit tests for encryption and sanitization; integration tests enforce tenant isolation and admin auth; security regression checks for critical routes.

## Subtasks

### 14.1. PII encryption for SSN and sensitive fields

**Status:** completed  
**Dependencies:** None  

Encrypt SSNs and other PII at rest with controlled accessors.

**Details:**

Implement AES-256 encryption helpers, migrate SSN storage to encrypted columns or accessors, and backfill existing data.

### 14.2. Tenant isolation and privileged endpoint auth

**Status:** pending  
**Dependencies:** 14.1  

Enforce tenant filtering and require admin auth on sensitive endpoints.

**Details:**

Apply tenant_id enforcement in services and repositories, protect /health/init-db and /health/sync-data, and add middleware coverage.

### 14.3. Input sanitization, secret management, and frontend token storage

**Status:** pending  
**Dependencies:** 14.2  

Reduce injection risk, centralize secrets, and move tokens to HttpOnly cookies.

**Details:**

Add request sanitizers for SQL and XSS, move secrets to config or secret manager, and shift frontend auth tokens to HttpOnly cookie flow.
