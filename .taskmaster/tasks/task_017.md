# Task ID: 17

**Title:** Contract-First Development (UNIVERSAL-003)

**Status:** pending

**Dependencies:** 13

**Priority:** high

**Description:** Introduce shared API contracts using Zod schemas, response types, and request validation.

**Details:**

Create shared/contracts schemas and errors, add validateRequest middleware, and generate OpenAPI from schemas.

**Test Strategy:**

Schema unit tests and route validation tests; OpenAPI generation CI check.

## Subtasks

### 17.1. Define shared Zod schemas for core domains

**Status:** pending  
**Dependencies:** None  

Create contract schemas for key entities and responses.

**Details:**

Add shared/contracts/schemas for patients, appointments, encounters, billing, and auth plus shared response types.

### 17.2. Add request and response validation middleware

**Status:** pending  
**Dependencies:** 17.1  

Validate requests and responses against shared contracts.

**Details:**

Implement validateRequest middleware, standardize error mapping, and enforce response envelopes for core routes.

### 17.3. Generate OpenAPI and add CI enforcement

**Status:** pending  
**Dependencies:** 17.2  

Generate API docs from schemas and keep them in sync.

**Details:**

Add script to generate OpenAPI from Zod schemas and wire a CI check to ensure specs are updated.
