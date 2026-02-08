# Task ID: 13

**Title:** Centralized Config Layer (UNIVERSAL-002)

**Status:** completed

**Dependencies:** None

**Priority:** high

**Description:** Create shared config schema and validation to replace scattered env usage.

**Details:**

Inventory all env vars, define Zod schema in shared/config, add startup validation, document .env.schema, and update backend/frontend to consume config instead of hardcoded URLs or credentials.

**Test Strategy:**

Unit tests for schema parsing; integration test fails fast on missing required vars; smoke test validates config values in runtime.

## Subtasks

### 13.1. Inventory env vars and define schema

**Status:** completed  
**Dependencies:** None  

Audit backend, frontend, and scripts for env usage and codify the full config schema.

**Details:**

Create shared/config/schema.ts and .env.schema after cataloging all required and optional variables; mark defaults and sensitive entries.

### 13.2. Implement config loader and validation

**Status:** completed  
**Dependencies:** 13.1  

Build config loading with startup validation and clear error reporting.

**Details:**

Create shared/config/validate.ts plus services and features config files, load config at startup, and surface actionable errors on missing values.

### 13.3. Replace hardcoded config and update env examples

**Status:** completed  
**Dependencies:** 13.2  

Remove hardcoded URLs and credentials and update env templates.

**Details:**

Swap hardcoded endpoints to config lookups, update .env.local.example and .env.dev.example, and document feature flags if needed.
