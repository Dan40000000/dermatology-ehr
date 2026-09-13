# Golden Visit v1 release evidence — 2026-09-13

This record concerns the synthetic-data release review for [pull request 12](https://github.com/Dan40000000/dermatology-ehr/pull/12). It is not a real-PHI pilot approval or a HIPAA compliance determination. No real patient records were inspected or used in these checks.

## Verified in this checkout

- Backend lint/typecheck and safe-error-logging guard passed. The backend suite passed 262 suites and 4,529 tests; 7 suites are intentionally skipped.
- Frontend typecheck and production build passed. The frontend suite passed 123 files and 1,218 tests.
- A fresh root install passed `npm audit` with zero reported vulnerabilities after the development-tool lockfile update.
- The synthetic/mock Chromium smoke passed all 23 cases after a fresh `npm ci`. It covered role boundaries, schedule-to-encounter navigation, ambient auto-stop, and several write flows. It did **not** connect to a live backend or AI provider.
- `git diff --check` passed after the final whitespace correction.

## Non-mock staging status

The reachable pilot-live and production frontend/API health endpoints responded successfully during this review. Neither deployed app contained this Golden Visit revision: the tested Magic Edit route returned 404, and the deployed frontend bundles lacked the new feature markers. This checkout has no injected `AMBIENT_FLOW_*` test identity, tenant, or AI-provider configuration. The ambient staging runner's dry run therefore stopped with missing base URL, tenant, email, and password. No write-heavy visit was run against those environments.

The existing ambient runner validates recording through summary after a synthetic account is configured, but it does not cover scheduling, check-in, Magic Edit, clinician-selected actions, portal sharing, or checkout. Use the [Golden Visit synthetic pilot protocol](golden-visit-pilot-protocol.md) for the complete manual exercise after an isolated staging target is deployed.

## Readiness and real-PHI stop conditions

`npm run hipaa:staging-readiness:strict-warnings -- --skip-db --json` exited 1 locally: 11 checks passed, 7 warned, and 0 failed. It ran in `development` mode with database checks skipped, so it is not authoritative for deployed staging. Warnings included missing local auth/session secrets, Sentry DSN, audit-retention setting, backup configuration, and upload scanning.

The repository review also identified these items that require remediation or documented, independently verified controls before real-PHI use:

1. Production-like staff and portal cookies use `SameSite=None`, while no server-side CSRF validation was identified in the application routes. Confirm an effective cross-site request defense for cookie-authenticated mutations.
2. Staff access JWT validation does not check an active/deactivated user state on each request. Confirm an immediate access-revocation design and test deprovisioning.
3. Module-access evaluation falls back to default role permissions when its settings query fails. Review and test fail-closed behavior for a database/settings outage.
4. Current vendor inventory marks several PHI-capable services `REVIEW_NEEDED`, including AI and monitoring providers; a repository file is not a signed BAA or proof of covered-mode configuration. Verify each actual vendor, endpoint, region, retention setting, and contract with privacy/security owners.
5. Confirm deployed database TLS, audit retention and review, storage/backup encryption, malware scanning, restore drill, and recovery objectives with operating evidence. Existing local or dated evidence does not establish the current deployed revision's posture.
6. Update the documented risk analysis for the material Golden Visit AI/workflow change and obtain the appropriate privacy, security, clinical, and healthcare-counsel review.

The [production-readiness runbook](production-readiness-runbook.md) remains the operational checklist. Do not merge or deploy this PR to a real-PHI environment on the strength of automated tests alone.

## What remains to complete the requested pilot

1. Provide or create an isolated synthetic staging environment and deploy the reviewed PR revision there, preserving the deployed Git SHA as evidence.
2. Inject staging-only test identities and AI configuration through an approved secret manager. Run the ambient runner and the complete [synthetic visit protocol](golden-visit-pilot-protocol.md); record pass/fail and recovery behavior without transcript or credentials in the report.
3. Have two or three practicing dermatology clinicians perform the synthetic exercise. Record elapsed time, correction burden, missed or unapproved actions, usability issues, and their signed assessment.
4. Clear the code and operational stop conditions above, then make a separate real-PHI go/no-go decision with the accountable clinical, privacy, security, and legal owners.
