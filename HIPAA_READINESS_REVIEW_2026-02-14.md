# HIPAA Readiness Review (2026-02-14)

This is a technical readiness review, not legal advice.

## Authoritative Requirements Reviewed

- HIPAA Privacy Rule overview (uses/disclosures, safeguards, patient rights):
  https://www.hhs.gov/hipaa/for-professionals/privacy/index.html
- HIPAA Security Rule overview (administrative/physical/technical safeguards):
  https://www.hhs.gov/hipaa/for-professionals/security/index.html
- Security Rule guidance by safeguard:
  https://www.hhs.gov/hipaa/for-professionals/security/guidance/index.html
- Minimum Necessary standard:
  https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html
- Cloud computing under HIPAA and BAAs:
  https://www.hhs.gov/hipaa/for-professionals/special-topics/cloud-computing/index.html
- Business associates and required contracts:
  https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html
- Breach Notification Rule:
  https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html
- Guidance on technologies/methodologies that render PHI unusable, unreadable, indecipherable:
  https://www.hhs.gov/hipaa/for-professionals/breach-notification/guidance/index.html

## Current Technical Status

### Implemented in code

- Multi-tenant auth boundary with tenant header and JWT verification.
- Role-based access controls in route layer.
- PHI redaction in application and audit logging.
- Audit logging framework with PHI-access event model.
- SSN encrypted/last4 storage path available in app code.
- New hardening in this pass:
  - Removed runtime fallback reads from legacy plaintext SSN in patient and portal verification routes.
  - Added migration + SQL migration to wipe legacy plaintext SSN and enforce `patients.ssn IS NULL` via constraint.
  - Strengthened SSN input validation (supports only 4 or 9 digits after normalization).
  - Added patient data access audit hooks for create/view/update/delete flows.
  - Added DB TLS configuration controls (`DB_SSL_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED`) and production validation gate.

### Still operational / policy dependent (not solvable by code alone)

- Signed BAAs with each HIPAA-relevant vendor (cloud host, SMS, email, AI providers, backups, logging vendors).
- Formal Security Rule risk analysis and periodic review documentation.
- Workforce access governance (joiner/mover/leaver, periodic access recertification).
- Incident response and breach response runbooks with timed drills.
- Data retention and disposal policies aligned to legal requirements.
- Immutable centralized log retention and monitoring program.

## Cloud Target State (including “operator should not access PHI” goal)

To meet the requirement that even platform operators should not casually access PHI:

1. Run production in dedicated cloud accounts/projects with strict IAM separation.
2. Disable standing human DB access; use just-in-time break-glass workflow with approvals and full audit.
3. Keep PHI encrypted at field level where feasible; manage keys in cloud KMS/HSM with rotation and scoped decrypt permissions.
4. Enforce TLS everywhere (client->API, API->DB, API->queues/storage).
5. Keep admin consoles and support tooling PHI-minimized by default.
6. Alert on privileged access, bulk exports, and unusual PHI query patterns.

## Risk Summary

- **Lowered risk:** plaintext SSN persistence/read fallback paths.
- **Remaining highest risk class:** operational governance and vendor-contract controls (BAAs, access operations, incident process).

