# Task ID: 19

**Title:** Test Infrastructure (UNIVERSAL-007)

**Status:** pending

**Dependencies:** 15, 17

**Priority:** high

**Description:** Build fixtures, factories, and CI pipeline for unit, integration, and E2E tests with coverage gates.

**Details:**

Add shared fixtures and factories, update GitHub Actions to run the full test pyramid, and provide scripts/test-all.sh.

**Test Strategy:**

CI run proves unit, integration, and E2E suites pass and coverage thresholds are enforced.

## Subtasks

### 19.1. Create fixtures, factories, and mocks

**Status:** pending  
**Dependencies:** None  

Establish shared test data for backend and frontend suites.

**Details:**

Add testing/fixtures, testing/factories, and testing/mocks with reusable data builders for core entities.

### 19.2. Update CI workflows for full test pyramid

**Status:** pending  
**Dependencies:** 19.1  

Run unit, integration, and E2E tests in CI with coverage gates.

**Details:**

Update .github/workflows to run backend, frontend, and e2e suites with coverage thresholds and required services.

### 19.3. Add local test-all script and docs

**Status:** pending  
**Dependencies:** 19.2  

Provide a single script to run the full test pyramid locally.

**Details:**

Add scripts/test-all.sh with environment setup and update TESTING.md to document the workflow.
