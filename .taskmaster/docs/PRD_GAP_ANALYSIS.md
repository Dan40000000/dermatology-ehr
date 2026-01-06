# EMA Gap Closure PRD

## Overview
This PRD maps the ModMed EMA blueprint to the current repo implementation and defines the work needed to close the gaps. It focuses on missing modules, API coverage (FHIR/HL7), multi-tenant alignment, and UI/UX parity (touch-first + adaptive learning).

## Goals
- Achieve parity with the 29-module navigation set and expose all required modules in the primary UI (including Forms and Templates).
- Expand FHIR R4 coverage to the documented 23 resources, including Bulk Export ($export).
- Expand HL7 v2.x message support to match documented ADT/SIU/DFT/ORM/ORU flows.
- Align multi-tenant architecture with the documented model (schema-per-tenant or an approved alternative with equivalent isolation).
- Implement touch-first UI patterns and integrate adaptive learning suggestions in clinical flows.

## Non-Goals (for this phase)
- Native iPad client build.
- Full enterprise SSO (SAML/Keycloak) unless required by compliance review.

## Current Gaps (Summary)
- Missing modules: Registry, Referrals, Protocols, Preferences, Help, Recalls (as standalone module), Forms.
- Templates module exists but is not exposed as a primary navigation item.
- Admin/Quality pages exist but are not exposed in main navigation.
- FHIR: only 8 resources implemented; no Bulk export.
- HL7: limited ADT/SIU/ORU; missing DFT/ORM and several ADT/SIU triggers.
- Multi-tenant: row-level tenant_id, not schema-per-tenant as documented.
- UI/UX: no touch-first/iPad layout patterns; adaptive learning not surfaced in UI.

## Epics / Tasks
1) **Navigation & Module Parity**
   - Add missing modules (Registry, Referrals, Protocols, Preferences, Help, Recalls, Forms) with routes and placeholder pages.
   - Expose Templates, Admin, and Quality in main navigation.
   - Ensure module access controls and roles are defined for new modules.

2) **FHIR Resource Coverage Expansion**
   - Implement missing FHIR resources (AllergyIntolerance, CarePlan, CareTeam, Coverage, Device, DiagnosticReport, DocumentReference, Goal, Immunization, Location, Medication, MedicationRequest, PractitionerRole, Provenance, RelatedPerson, ServiceRequest).
   - Add search parameters and pagination per resource.
   - Maintain conformance statements and OperationOutcome on errors.

3) **FHIR Bulk Export ($export)**
   - Add /fhir/$export with async status polling.
   - Produce NDJSON output and manifest.
   - Enforce scope rules for patient/provider/bulk contexts.

4) **FHIR OAuth Scopes & App Types**
   - Implement patient/provider/bulk app flows with scopes.
   - Add app registration and consent stubs for future vendor onboarding.

5) **HL7 v2.x Coverage Expansion**
   - Add ADT A01/A11/A13/A31 and SIU S14/S17 processing.
   - Add DFT^P03 and ORM/ORU processing where applicable.
   - Ensure ACK/NACK handling and robust validation.

6) **HL7 Transport & Reliability**
   - Add MLLP listener (configurable) and ingestion queue.
   - Implement retry/backoff and dead-letter handling for failed messages.

7) **Multi-Tenant Alignment**
   - Evaluate schema-per-tenant migration feasibility vs. current tenant_id approach.
   - If required, implement schema-per-tenant with migration tooling.
   - Update docs and runtime configuration accordingly.

8) **Adaptive Learning UI Integration**
   - Surface adaptive diagnosis/procedure suggestions in clinical workflows.
   - Wire UI to existing adaptive learning endpoints.

9) **Touch-First UI Parity**
   - Enforce minimum 44px touch targets in key clinical flows.
   - Add iPad-friendly layout options (split views where possible).
   - Implement high-contrast and gesture-friendly affordances.

10) **Regulatory/Quality Reporting Parity**
   - Ensure MIPS/QPP reporting flows are accessible from UI.
   - Tie quality reporting to existing measures APIs where possible.

11) **Referrals & Registry Data Model**
   - Add schema + CRUD for referrals and registry cohorts.
   - Provide basic UI for tracking referrals and registries.

12) **Protocols & Preferences**
   - Add clinical protocol templates and preference storage per user.
   - Provide admin-configurable protocol sets.

13) **Recalls Module Completion**
   - Separate Recalls from Reminders with dedicated page/workflow.
   - Implement recall campaigns, recall status, and tracking.

14) **Documentation + Conformance**
   - Update repo docs to reflect parity status and implemented modules.
   - Add conformance tests for FHIR/HL7 changes.

## Acceptance Criteria
- All 29 modules are present as routes and visible (role-appropriate) in navigation.
- FHIR supports the documented 23 resources plus Bulk Export.
- HL7 supports the documented ADT/SIU/DFT/ORM/ORU flows with ACK/NACK.
- Adaptive learning suggestions are visible in at least one core clinical workflow.
- Touch-first UI patterns applied to clinical workflows and verified on tablet viewport.
- Documentation updated to reflect new coverage.
