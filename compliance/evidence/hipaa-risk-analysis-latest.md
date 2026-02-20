# HIPAA Risk Analysis Snapshot

- Updated: 2026-02-16
- Scope: `derm-app` staging/production architecture
- Owner: Security + Platform
- Method: Threat/risk review mapped to administrative, physical, and technical safeguards

## High-Risk Items

1. Vendor contract readiness for all PHI-processing services.
2. Standing privileged access paths in cloud/admin tooling.
3. Staging-to-production change controls without explicit compliance sign-off gate.

## Current Mitigations

- PHI redaction in logs and audit metadata.
- SSN plaintext lockout and encrypted/last4 model in patient flows.
- Role and dual-role RBAC enforcement for financial and admin boundaries.
- Ambient scribe flow tests plus release-gate automation.

## Required Before Production PHI Scale-Up

1. Complete and verify BAA inventory artifacts for all PHI vendors.
2. Enforce just-in-time privileged access with immutable review logs.
3. Run incident tabletop and confirm breach notification decision workflow.
