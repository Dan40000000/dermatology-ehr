# BEADS Implementation Roadmap

## Purpose
Translate the BEADS universal solutions into TaskMaster work items and a phased delivery plan.

## Inputs
- BEADS.md
- BEADS_DIAGRAM.md
- docs/GASTOWN_BRIEFING.md
- docs/CONVO_ARCHITECTURE.md

## Current State (Already Landed)
- ServiceContainer and ServiceProvider in backend/src/lib
- BaseRepository, QueryBuilder, and TransactionHelper in backend/src/lib/repository
- Mock service adapters and local dev sandbox (docker-compose.dev.yml, scripts/setup-dev.sh)
- BEADS documentation and diagrams are in place

## TaskMaster Mapping (master context)

| Universal Solution | TaskMaster ID | Dependencies | Primary Deliverables |
| --- | --- | --- | --- |
| UNIVERSAL-002 Centralized Config Layer | 13 | None | Shared config schema, startup validation, .env.schema, no hardcoded URLs |
| UNIVERSAL-006 Security Middleware Stack | 14 | 13 | PII encryption, tenant isolation, admin auth for privileged endpoints |
| UNIVERSAL-001 Service Layer + Base Classes | 15 | None | BaseService, ResponseEnvelope, asyncHandler, DI usage |
| UNIVERSAL-004 Repository Pattern + Migration Fix | 16 | 15 | Migrator/seeder, core repositories, inline SQL removal |
| UNIVERSAL-003 Contract-First Development | 17 | 13 | Shared Zod schemas, request validation, OpenAPI generation |
| UNIVERSAL-005 React Query Architecture | 18 | 17 | Query client, typed hooks, cache invalidation patterns |
| UNIVERSAL-007 Test Infrastructure | 19 | 15, 17 | Fixtures/factories, CI test pyramid, coverage gates |
| UNIVERSAL-008 Adapter Pattern for Integrations | 20 | 13, 15 | Adapter interfaces, real implementations, high-fidelity mocks |

## Phased Plan

### Phase 1: Foundation (Config + Security)
- Task 13: Centralized Config Layer (UNIVERSAL-002)
- Task 14: Security Middleware Stack (UNIVERSAL-006)

Exit criteria:
- Config schema validates at startup with clear errors
- Hardcoded URLs and credentials removed
- PII encryption and tenant isolation enforced

### Phase 2: Core Patterns (Service + Contracts + Repository Adoption)
- Task 15: Service Layer + Response Envelope (UNIVERSAL-001)
- Task 17: Contract-First Development (UNIVERSAL-003)
- Task 16: Repository Adoption + Migration Consolidation (UNIVERSAL-004)

Exit criteria:
- BaseService and ResponseEnvelope used in core routes
- Shared contracts validate requests and responses
- Migrations run from a single runner and repositories replace inline SQL

### Phase 3: Data Layer and Quality Gates
- Task 18: Frontend Data Architecture (UNIVERSAL-005)
- Task 20: External Adapters for Integrations (UNIVERSAL-008)
- Task 19: Test Infrastructure (UNIVERSAL-007)

Exit criteria:
- React Query hooks drive core pages with cache invalidation
- Real service adapters are enabled via config and feature flags
- CI runs unit, integration, and E2E tests with coverage thresholds

## Start Here
1. Begin Task 13 by cataloging env vars and building the shared schema.
2. In parallel, draft the service layer API surface for Task 15.
3. Once Task 13 lands, start Task 14 and Task 17.
