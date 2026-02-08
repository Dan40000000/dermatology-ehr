# Task ID: 20

**Title:** External Adapters for Integrations (UNIVERSAL-008)

**Status:** pending

**Dependencies:** 13, 15

**Priority:** high

**Description:** Replace mocked integrations with adapter interfaces and real implementations behind feature flags.

**Details:**

Define adapter interfaces and factory, implement real adapters for email, SMS, storage, and payments, and migrate services to adapter usage with high-fidelity mocks.

**Test Strategy:**

Adapter contract tests; integration tests using sandbox or mock implementations; failover tests for disabled integrations.

## Subtasks

### 20.1. Define adapter interfaces and factory

**Status:** pending  
**Dependencies:** None  

Establish adapter contracts and selection logic.

**Details:**

Create adapter interfaces and an AdapterFactory that selects real or mock implementations based on config and feature flags.

### 20.2. Implement real adapters for priority services

**Status:** pending  
**Dependencies:** 20.1  

Add real adapters for the most critical integrations.

**Details:**

Implement adapters for SendGrid, Twilio, S3, and Stripe (or prioritized list) with proper error handling and retries.

### 20.3. Migrate service usage and tighten mocks

**Status:** pending  
**Dependencies:** 20.2  

Switch existing services to adapter usage and align mocks to real contracts.

**Details:**

Refactor call sites to use adapter interfaces, update mock adapters to match real payloads, and add parity tests.
