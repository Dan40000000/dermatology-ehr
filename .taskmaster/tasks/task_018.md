# Task ID: 18

**Title:** Frontend Data Architecture (UNIVERSAL-005)

**Status:** pending

**Dependencies:** 17

**Priority:** high

**Description:** Standardize frontend data fetching with React Query, typed hooks, and UI state stores.

**Details:**

Set up queryClient, consolidate queries and mutations, integrate contract types, and migrate pages to hooks with cache invalidation.

**Test Strategy:**

Hook unit tests, React Query cache behavior tests, and key E2E flows for data freshness.

## Subtasks

### 18.1. Create query client and API wrapper

**Status:** pending  
**Dependencies:** None  

Centralize React Query configuration and typed API calls.

**Details:**

Add frontend/src/data/queryClient.ts, a typed API wrapper, and shared defaults for retries, caching, and error handling.

### 18.2. Implement core query and mutation hooks

**Status:** pending  
**Dependencies:** 18.1  

Create hooks for core workflows using shared contracts.

**Details:**

Add usePatients, useAppointments, useEncounters, and useBilling hooks with cache invalidation and optimistic updates.

### 18.3. Migrate pages to hooks and UI store

**Status:** pending  
**Dependencies:** 18.2  

Replace duplicate fetches and move UI state to stores.

**Details:**

Refactor core pages to use query hooks, remove redundant useState fetches, and move UI-only state to a store.
