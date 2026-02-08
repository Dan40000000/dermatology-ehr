# Task ID: 15

**Title:** Service Layer + Response Envelope (UNIVERSAL-001)

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Standardize backend service layer with BaseService, ResponseEnvelope, and async route handling.

**Details:**

Add BaseService for transactions and error mapping, create ResponseEnvelope helpers, implement asyncHandler wrapper, and wire ServiceContainer usage across routes.

**Test Strategy:**

Unit tests for BaseService and ResponseEnvelope; route tests validate consistent error format.

## Subtasks

### 15.1. Add BaseService, ResponseEnvelope, and asyncHandler utilities

**Status:** pending  
**Dependencies:** None  

Create core service utilities and document usage patterns.

**Details:**

Add BaseService, ResponseEnvelope, and asyncHandler utilities in backend/src/lib (or backend/src/core) to standardize transactions and error responses.

### 15.2. Wire ServiceContainer into routes and services

**Status:** pending  
**Dependencies:** 15.1  

Use DI for service instantiation across routes.

**Details:**

Register services in ServiceProvider, inject into route handlers, and remove ad hoc instantiation to ensure consistent lifecycles.

### 15.3. Migrate high-traffic routes to the service layer

**Status:** pending  
**Dependencies:** 15.2  

Refactor core routes to use BaseService and ResponseEnvelope.

**Details:**

Refactor patients, appointments, billing, and prescriptions routes to use the service layer with consistent error handling.
