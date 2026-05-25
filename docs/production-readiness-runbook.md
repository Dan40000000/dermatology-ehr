# Production Readiness Runbook

Last updated: 2026-05-24

This runbook is the final operating pass before a dermatology office uses the system with real patients.

## Release Checks

1. Confirm `main` is clean and pushed to GitHub.
2. Confirm GitHub CI is green.
3. Run backend unit tests that cover auth, claims, SMS, coding review, access settings, and patient records.
4. Run frontend tests for Command Center, schedule, encounters, claims, financials, store, text messages, admin access control, and post-visit coding review.
5. Run build checks for frontend and backend TypeScript.
6. Run accessibility smoke tests on login, Command Center, patients, schedule, patient access needs, public booking, and post-visit coding review.
7. Run `npm run hipaa:staging-readiness:strict-warnings` from the repo root.
8. Verify Railway frontend and backend health endpoints, public app load, API auth, and production database connectivity.

## Operational Smoke

- Log in as admin, provider, front desk, billing, manager, medical assistant, nurse, and compliance officer.
- Confirm each role sees only useful Command Center cards and navigation items.
- Create or complete a visit through schedule, check-in, rooming, provider note, diagnosis, CPT charge, claim, payment, and analytics.
- Confirm the post-visit coding review queue catches an unsigned note, missing diagnosis, missing CPT, and unlinked diagnosis.
- Send a test SMS only to an approved internal/test recipient with consent recorded.
- Verify failed vendor calls show data-unavailable states rather than zero-count metrics.
- Verify day/date filters return yesterday, today, week-to-date, month-to-date, and custom ranges where supported.

## Data Reconciliation

- Command Center schedule count equals Front Desk schedule for the selected business date.
- Revenue page charges match charge rows and claim generation inputs.
- Collections page payments match patient payments, payer payments, store payments, and adjustments.
- Claims/Clearinghouse work queues match claim statuses, ERA/EFT records, and reconciliation state.
- Store operations orders match payment records, shipment state, and inventory deductions.
- Lab/pathology counters match the actual open order and unresolved-result tables.

## Stop Conditions

- Any patient-facing critical accessibility issue.
- Any route that exposes PHI to a role without permission.
- Any vendor used with PHI without signed customer/vendor authorization.
- Any billing or clinical queue that silently converts API failure into a zero-count state.
- Any production deploy where local HEAD, GitHub `main`, and Railway service revision do not match.
