# Beads Log

## Lane Summaries

- id: lane-backend-core
  lane: backend-core
  status: done
  result: Found placeholders for OCR/thumbnails/S3, stubbed HL7/interop, mock eRx checks, and missing outbound notifications.
  next: Convert backend gaps into prioritized build/test tasks.

- id: lane-frontend-ui
  lane: frontend-ui
  status: done
  result: Broken routes + unrouted pages (kiosk/portal/admin), several "coming soon" placeholders, and missing page tests.
  next: Wire routes/pages, replace placeholders with real flows, add tests.

- id: lane-data-model
  lane: data-model
  status: done
  result: db:migrate omits migrations for telehealth, portal intake/billing, inventory, and labs; seeds not run.
  next: Consolidate migrations/seed into migration runner or update workflow.

- id: lane-tests-qa
  lane: tests-qa
  status: done
  result: CI skips e2e, low coverage thresholds, gated/skipped tests, and Node version mismatch vs frontend.
  next: Add e2e job, raise coverage thresholds, enable integration tests.

- id: lane-mobile
  lane: mobile
  status: done
  result: Mobile flows not wired (appointments, messaging, billing, records), biometric/push/offline incomplete, no tests.
  next: Wire screens/APIs and add test harness.

- id: lane-infra-ci
  lane: infra-ci
  status: done
  result: Missing frontend Dockerfile, CI lacks services/e2e/migrations, node version mismatch, security scan non-blocking.
  next: Convert infra gaps into prioritized build/test/deploy tasks.

- id: lane-docs-vs-code
  lane: docs-vs-code
  status: done
  result: Doc link/path mismatches and infra claims (S3/ClamAV/CI-CD) don't match code; roadmap items unclear.
  next: Align docs or implement missing capabilities.

---

## Integration Policy (No Stubs)

All external integrations must be real or a high-fidelity surrogate that matches the real provider's API surface, data shape, error modes, and timing. The surrogate must be drop-in replaceable with the real integration.

---

## PATTERN ANALYSIS: Connecting the Dots

### Root Cause 1: NO UNIFIED SERVICE LAYER
**Symptoms appearing in:**
- 50+ routes with duplicate query building logic
- 20+ files with copy-pasted transaction patterns (BEGIN/COMMIT/ROLLBACK)
- Inconsistent error handling (8+ different error response formats)
- N+1 queries in billing, RCM, encounters
- No dependency injection (tight coupling)
- God objects (BillingService 370 lines, HL7Processor 250+ lines)

**Universal Solution: Service Container + Base Classes**
```
Create:
├── backend/src/core/
│   ├── ServiceContainer.ts      # IoC container for DI
│   ├── BaseService.ts           # Transaction, error handling, audit
│   ├── QueryBuilder.ts          # Dynamic parameterized queries
│   ├── ResponseEnvelope.ts      # Consistent { success, data, error, meta }
│   └── asyncHandler.ts          # Wrap all routes automatically
```
**Fixes 40+ individual issues with ONE architectural change.**

---

### Root Cause 2: NO CONFIG SINGLE SOURCE OF TRUTH
**Symptoms appearing in:**
- 84 env vars referenced, only 52 documented
- 4 different config patterns (backend/frontend/mobile/CLI)
- Hardcoded API URLs (OpenAI, Anthropic) in 6 locations
- Hardcoded credentials in 4 scripts
- AI services with silent fallback to mocks
- Third-party creds scattered across services
- No startup validation for critical services

**Universal Solution: Centralized Config Layer**
```
Create:
├── shared/config/
│   ├── schema.ts                # Zod schema for ALL config
│   ├── validate.ts              # Fail-fast startup validation
│   ├── services.ts              # All third-party service configs
│   └── features.ts              # Feature flags in one place
├── .env.schema                  # Machine-readable env documentation
```
**Fixes 32+ undocumented vars, 6 hardcoded URLs, 4 credential leaks.**

---

### Root Cause 3: NO API CONTRACT ENFORCEMENT
**Symptoms appearing in:**
- 10+ routes missing input validation
- Frontend .catch(() => ({})) losing error context
- Response types undefined (no TypeScript interfaces)
- Mismatched types (dob vs dateOfBirth, data vs patients)
- Error formats vary (error vs errors, string vs object)
- Missing OpenAPI docs for 5+ endpoint groups
- 'any' types and Record<string, any> in 20+ locations

**Universal Solution: Contract-First Development**
```
Create:
├── shared/contracts/
│   ├── schemas/                 # Zod schemas shared FE/BE
│   │   ├── patient.ts
│   │   ├── appointment.ts
│   │   └── ...
│   ├── responses.ts             # Standard response types
│   └── errors.ts                # Error code enum + formats
├── backend/src/middleware/
│   └── validateRequest.ts       # Auto-validate using schemas
├── scripts/
│   └── generate-openapi.ts      # Generate from Zod schemas
```
**Fixes type mismatches, missing validation, error inconsistency, docs gaps.**

---

### Root Cause 4: NO DATA LAYER ABSTRACTION
**Symptoms appearing in:**
- 65 migrations not executed (3 migration sources)
- Duplicate migration numbers causing conflicts
- 8 seed files never run
- deleted_at column missing on 15+ tables
- N+1 queries (queries in loops)
- SELECT * in 26+ locations
- Missing indexes for common queries
- Pool size too small (20 connections)
- No query optimization/monitoring in production

**Universal Solution: Repository Pattern + Migration Consolidation**
```
Create:
├── backend/src/repositories/
│   ├── BaseRepository.ts        # CRUD, pagination, soft delete
│   ├── PatientRepository.ts     # Patient-specific queries
│   └── ...
├── backend/src/db/
│   ├── migrator.ts              # Load ALL .sql from /migrations
│   ├── seeder.ts                # Run ALL seed files
│   └── indexes.ts               # Index management
```
**Fixes 65 orphaned migrations, N+1s, SELECT *, missing indexes.**

---

### Root Cause 5: NO FRONTEND DATA ARCHITECTURE
**Symptoms appearing in:**
- 80+ useState calls for API data (should use React Query)
- Duplicate API calls (fetchPatients in 40+ pages)
- Manual refetch instead of cache invalidation
- Prop drilling (4+ levels in FrontDesk components)
- No optimistic updates (or updates without rollback)
- WebSocket updates not synced with React Query
- 3 different data fetching patterns (fetch, api wrapper, React Query)
- Polling without deduplication (5 PA requests = 5 intervals)

**Universal Solution: React Query + State Architecture**
```
Create:
├── frontend/src/data/
│   ├── queries/                 # All React Query hooks
│   │   ├── usePatients.ts       # Already exists - expand pattern
│   │   ├── useAppointments.ts
│   │   └── ...
│   ├── mutations/               # All mutation hooks with invalidation
│   ├── subscriptions/           # WebSocket → React Query sync
│   └── queryClient.ts           # Centralized config
├── frontend/src/stores/         # Zustand for UI state only
│   ├── uiStore.ts               # Modals, filters, preferences
│   └── ...
```
**Fixes 80+ useState, duplicate fetches, stale data, race conditions.**

---

### Root Cause 6: NO SECURITY BASELINE
**Symptoms appearing in:**
- SSN stored plaintext (HIPAA violation)
- Hardcoded tenant "default" in HL7
- SQL injection in hl7Queue (INTERVAL interpolation)
- Hardcoded init secret in source code
- Unauthenticated /health/init-db and /health/sync-data
- Rate limiting missing on privileged endpoints
- localStorage for tokens (XSS attack surface)
- dangerouslySetInnerHTML in kiosk forms

**Universal Solution: Security Middleware Stack**
```
Create:
├── backend/src/security/
│   ├── encryption.ts            # AES-256 for PII (SSN)
│   ├── tenantIsolation.ts       # Enforce tenant on ALL queries
│   ├── secretManager.ts         # No hardcoded secrets
│   ├── adminAuth.ts             # Proper auth for /health endpoints
│   └── inputSanitizer.ts        # XSS, SQL injection prevention
├── frontend/src/security/
│   └── tokenStorage.ts          # HttpOnly cookie handler
```
**Fixes SSN exposure, SQL injection, hardcoded secrets, XSS risks.**

---

### Root Cause 7: NO TESTING INFRASTRUCTURE
**Symptoms appearing in:**
- Frontend coverage 0%, backend coverage 10%
- 6 E2E suites skipped (RUN_E2E never set)
- FHIR tests permanently skipped
- 13 Playwright specs not in CI
- 20+ route test files with only 1-2 cases
- Mobile has zero tests
- No integration test environment

**Universal Solution: Test Pyramid + CI Pipeline**
```
Create:
├── .github/workflows/
│   └── ci.yml                   # Add E2E, coverage gates
├── testing/
│   ├── fixtures/                # Shared test data
│   ├── factories/               # Entity factories
│   ├── mocks/                   # Service mocks
│   └── e2e/                     # E2E test setup
├── scripts/
│   └── test-all.sh              # Run full pyramid
```
**Fixes coverage gaps, skipped tests, missing E2E, mobile tests.**

---

### Root Cause 8: NO EXTERNAL SERVICE ABSTRACTION
**Symptoms appearing in:**
- Email logs only, never sends (7+ endpoints affected)
- Mock Stripe (95% success simulation)
- Mock Surescripts (fake NCPDP)
- Mock Availity (canned eligibility)
- Mock prior auth (random 40/30/20/10%)
- Mock HL7 (simulated ACK)
- Mock drug interactions (hardcoded list)
- AI services with silent mock fallback

**Universal Solution: Adapter Pattern with Feature Flags**
```
Create:
├── backend/src/adapters/
│   ├── interfaces/              # Contract for each service
│   │   ├── IEmailAdapter.ts
│   │   ├── IPaymentAdapter.ts
│   │   └── ...
│   ├── implementations/
│   │   ├── sendgrid/
│   │   ├── stripe/
│   │   ├── surescripts/
│   │   └── mock/                # High-fidelity mocks
│   └── AdapterFactory.ts        # Return real or mock by config
```
**Fixes ALL stub integrations with consistent pattern + easy swap.**

---

## UNIVERSAL SOLUTIONS DEPENDENCY GRAPH

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: FOUNDATION (Week 1-2)                     │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Config Layer    │  │ Security Stack  │  │ Migration Fix   │      │
│  │ (Root Cause 2)  │  │ (Root Cause 6)  │  │ (Root Cause 4)  │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                ▼                                     │
│                    ┌─────────────────────┐                          │
│                    │   Startup Validator │                          │
│                    │   (fail-fast boot)  │                          │
│                    └─────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: CORE PATTERNS (Week 3-4)                  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Service Layer   │  │ API Contracts   │  │ Repository Pat. │      │
│  │ (Root Cause 1)  │  │ (Root Cause 3)  │  │ (Root Cause 4)  │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                ▼                                     │
│                    ┌─────────────────────┐                          │
│                    │   Unified Backend   │                          │
│                    │   (DI + Contracts)  │                          │
│                    └─────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: DATA LAYER (Week 5-6)                     │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Frontend Data   │  │ External Adapt. │  │ Test Infra      │      │
│  │ (Root Cause 5)  │  │ (Root Cause 8)  │  │ (Root Cause 7)  │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                ▼                                     │
│                    ┌─────────────────────┐                          │
│                    │   Full Stack Ready  │                          │
│                    │   (Real + Tested)   │                          │
│                    └─────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## IMPACT MATRIX: Universal Solutions vs Individual Fixes

| Universal Solution | Individual Issues Fixed | Effort | Impact |
|-------------------|------------------------|--------|--------|
| Service Container + Base Classes | 40+ (errors, txn, queries, DI) | HIGH | CRITICAL |
| Centralized Config Layer | 32+ (undocumented, hardcoded, scattered) | MEDIUM | HIGH |
| Contract-First (Zod + Types) | 25+ (validation, types, errors) | MEDIUM | HIGH |
| Repository Pattern | 20+ (N+1, SELECT *, indexes) | HIGH | HIGH |
| React Query Architecture | 30+ (useState, dupes, stale) | HIGH | HIGH |
| Security Middleware Stack | 10+ (SSN, injection, secrets) | MEDIUM | CRITICAL |
| Test Infrastructure | 15+ (coverage, E2E, skipped) | MEDIUM | HIGH |
| Adapter Pattern | 12+ (all mock services) | HIGH | HIGH |

**Total: 8 universal solutions fix 184+ individual issues**

---

## CRITICAL PATH: Minimum Viable Fixes

If resources are limited, this sequence provides maximum safety with minimum effort:

### Week 1: Security + Config (MUST DO)
1. **SSN Encryption** - HIPAA compliance
2. **Remove hardcoded secrets** - Security baseline
3. **Tenant isolation fix** - Multi-tenant safety
4. **Config validation at startup** - Fail-fast

### Week 2: Data Integrity
5. **Migration consolidation** - Run all 65 migrations
6. **Add missing indexes** - Performance baseline
7. **Fix deleted_at columns** - Soft delete works

### Week 3: Quality Gates
8. **CI E2E enablement** - Tests actually run
9. **Coverage thresholds** - Frontend 50%, Backend 60%
10. **API response envelope** - Consistent errors

---

## DETAILED TASK BACKLOG

### UNIVERSAL-001: Service Container + Base Classes
```
lane: architecture
status: pending
severity: CRITICAL
effort: 5 days
fixes: 40+ issues
files_to_create:
  - backend/src/core/ServiceContainer.ts
  - backend/src/core/BaseService.ts
  - backend/src/core/QueryBuilder.ts
  - backend/src/core/ResponseEnvelope.ts
  - backend/src/core/asyncHandler.ts
dependencies: none
```

### UNIVERSAL-002: Centralized Config Layer
```
lane: architecture
status: pending
severity: HIGH
effort: 3 days
fixes: 32+ issues
files_to_create:
  - shared/config/schema.ts
  - shared/config/validate.ts
  - shared/config/services.ts
  - shared/config/features.ts
  - .env.schema
dependencies: none
```

### UNIVERSAL-003: Contract-First Development
```
lane: architecture
status: pending
severity: HIGH
effort: 4 days
fixes: 25+ issues
files_to_create:
  - shared/contracts/schemas/*.ts
  - shared/contracts/responses.ts
  - shared/contracts/errors.ts
  - backend/src/middleware/validateRequest.ts
dependencies: UNIVERSAL-002
```

### UNIVERSAL-004: Repository Pattern + Migration Fix
```
lane: data-model
status: pending
severity: CRITICAL
effort: 5 days
fixes: 20+ issues
files_to_create:
  - backend/src/repositories/BaseRepository.ts
  - backend/src/repositories/*.ts
  - backend/src/db/migrator.ts
  - backend/src/db/seeder.ts
dependencies: UNIVERSAL-001
```

### UNIVERSAL-005: React Query Architecture
```
lane: frontend-ui
status: pending
severity: HIGH
effort: 5 days
fixes: 30+ issues
files_to_create:
  - frontend/src/data/queries/*.ts
  - frontend/src/data/mutations/*.ts
  - frontend/src/data/subscriptions/*.ts
  - frontend/src/stores/*.ts
dependencies: UNIVERSAL-003
```

### UNIVERSAL-006: Security Middleware Stack
```
lane: security
status: pending
severity: CRITICAL
effort: 4 days
fixes: 10+ issues
files_to_create:
  - backend/src/security/encryption.ts
  - backend/src/security/tenantIsolation.ts
  - backend/src/security/secretManager.ts
  - backend/src/security/adminAuth.ts
  - backend/src/security/inputSanitizer.ts
  - frontend/src/security/tokenStorage.ts
dependencies: UNIVERSAL-002
```

### UNIVERSAL-007: Test Infrastructure
```
lane: tests-qa
status: pending
severity: HIGH
effort: 3 days
fixes: 15+ issues
files_to_create:
  - .github/workflows/ci.yml (update)
  - testing/fixtures/*.ts
  - testing/factories/*.ts
  - testing/mocks/*.ts
  - scripts/test-all.sh
dependencies: UNIVERSAL-001, UNIVERSAL-003
```

### UNIVERSAL-008: Adapter Pattern for External Services
```
lane: backend-core
status: pending
severity: HIGH
effort: 5 days
fixes: 12+ issues
files_to_create:
  - backend/src/adapters/interfaces/*.ts
  - backend/src/adapters/implementations/sendgrid/
  - backend/src/adapters/implementations/stripe/
  - backend/src/adapters/implementations/surescripts/
  - backend/src/adapters/implementations/mock/
  - backend/src/adapters/AdapterFactory.ts
dependencies: UNIVERSAL-001, UNIVERSAL-002
```

---

## LEGACY TASK BACKLOG (Individual Fixes)

These remain valid but are SUPERSEDED by universal solutions above:

### CRITICAL - Security/Compliance

- id: task-ssn-encryption
  lane: security
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-006
  file: backend/src/routes/patientPortal.ts:76-80

- id: task-hl7-tenant-routing
  lane: security
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-006
  file: backend/src/routes/hl7.ts:361

### CRITICAL - Database/Migrations

- id: task-migrations-consolidation
  lane: data-model
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-004

- id: task-deleted-at-columns
  lane: data-model
  status: pending
  severity: HIGH
  superseded_by: UNIVERSAL-004

### CRITICAL - Test Infrastructure

- id: task-frontend-coverage-thresholds
  lane: tests-qa
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-007
  file: frontend/vitest.config.ts:25-30

- id: task-ci-enable-e2e
  lane: infra-ci
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-007
  file: .github/workflows/ci.yml

### HIGH - External Integrations

- id: task-email-service-real
  lane: backend-core
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-008

- id: task-payment-stripe-real
  lane: backend-core
  status: pending
  severity: CRITICAL
  superseded_by: UNIVERSAL-008

- id: task-erx-surescripts-real
  lane: backend-core
  status: pending
  severity: HIGH
  superseded_by: UNIVERSAL-008

### HIGH - Frontend Architecture

- id: task-react-query-migration
  lane: frontend-ui
  status: pending
  severity: HIGH
  superseded_by: UNIVERSAL-005

- id: task-state-management
  lane: frontend-ui
  status: pending
  severity: HIGH
  superseded_by: UNIVERSAL-005

---

## NEW FINDINGS (Deep Dive #2)

### Architecture Issues
- 50+ routes with duplicate query building
- 20+ files with copy-pasted transactions
- 8+ different error response formats
- No dependency injection
- God objects (BillingService, HL7Processor)

### Configuration Issues
- 84 env vars, only 52 documented
- 4 different config patterns
- Hardcoded AI URLs in 6 locations
- Credentials in 4 scripts
- No startup validation

### API/Type Safety Issues
- 10+ routes missing validation
- Frontend .catch(() => ({})) pattern
- Response types undefined
- any types in 20+ locations
- OpenAPI docs incomplete

### State Management Issues
- 80+ useState for API data
- 40+ pages duplicate fetchPatients
- No cache invalidation
- WebSocket not synced with React Query
- Race conditions in updates

### Security Issues (New)
- SQL injection in hl7Queue.ts (INTERVAL)
- Hardcoded init secret
- Unauthenticated /health/init-db
- localStorage for tokens
- dangerouslySetInnerHTML in kiosk

### Performance Issues
- N+1 queries in billingService, rcmAnalytics
- LIMIT 10000 in reportService
- SELECT * in 26+ locations
- Pool size 20 (too small)
- Unbounded metrics array

---

## Statistics

**Universal Solutions: 8** (fix 184+ issues)
**Individual Tasks Superseded: 58**
**Effort Saved: ~70%** (by solving root causes)

### By Root Cause
- No Service Layer: 40 issues
- No Config SSOT: 32 issues
- No API Contracts: 25 issues
- No Data Abstraction: 20 issues
- No Frontend Data Arch: 30 issues
- No Security Baseline: 10 issues
- No Test Infrastructure: 15 issues
- No Service Adapters: 12 issues

---

## Ralph Loop Trace
traceId: trc_20260124_022303Z_p983y5wn
