# Client Readiness QA Run - 2026-05-23

Environment: local workspace with staging-style backend env and mocked browser data where noted.
Git branch: `main`
Scope: eight-section client readiness pass from `CLIENT_READINESS_QA.md`.

## Executive Result

The product passed the core software readiness checks for demo/pilot workflows: office-day flow, diagnosis review, billing-code review, role access, financial drill-downs, claims queue navigation, store operations, texting UI flows, and backend route coverage.

Vendor/live-production gates are not all closed yet:

- Twilio A2P campaign is resubmitted and `IN_PROGRESS`, not `VERIFIED`.
- Stripe database integration exists, but local env lacks `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
- Phaxio fax env vars are missing locally.
- Surescripts/eRx production integration config is not active.
- Local HIPAA readiness cannot verify deployed DB TLS because this run used a local database mirror.

## Fixes Made During This Pass

- Fixed Claims `Exceptions` queue behavior so it only shows denied, rejected, appealed, or scrub-failed claims. Normal aging claims stay in the separate timely filing risk queue.
- Updated Command Center claim-exception copy to match backend counts and the claims page.

## Evidence Commands

```bash
npm run lint --prefix backend
```

Result: passed.

```bash
npm run test --prefix backend -- --runInBand --forceExit
```

Result: passed. 249 suites passed, 4,326 tests passed, 6 suites skipped.

```bash
cd frontend && npx tsc --noEmit
```

Result: passed.

```bash
npm run test --prefix frontend -- --run
```

Result: passed. 110 files passed, 1,153 tests passed.

```bash
npm run build --prefix backend
npm run build --prefix frontend
```

Result: both passed.

```bash
PLAYWRIGHT_MOCK_AUTH=1 PLAYWRIGHT_MOCK_DATA=1 npx playwright test --config=e2e/playwright.config.ts --project=chromium critical-smoke authz-smoke schedule-write-smoke financials-write-smoke text-messages-write-smoke admin-core-write-smoke admin-ai-write-smoke
```

Result: passed. 18 browser tests passed.

```bash
npm run staging:readiness --prefix backend
```

Result: 30 pass, 1 warning, 0 fail. Warning: local run cannot verify deployed DB TLS.

```bash
npm run integrations:smoke:strict-warnings --prefix backend
```

Result: 9 pass, 3 warn, 3 fail. Failures are missing live vendor env/config gates listed above.

## 1. Core Office-Day Flow

Status: passed for demo/pilot software readiness.

Evidence:

- Schedule page renders and supports appointment status/reschedule browser smoke.
- Patient detail can enter encounter workflow.
- Encounter unit tests cover vitals, orders, billing actions, AI draft application, signing, appointment checkout, and mistaken visit cancellation.
- Claims and financial browser smoke verifies claim status mutation and payment posting.
- Full frontend and backend test suites passed.

Residual risk:

- Real vendor claim submission/payment settlement still depends on live clearinghouse/Stripe production keys.

## 2. Diagnosis QA

Status: passed for in-app review behavior.

Evidence:

- Patient chart/problem-list behavior is covered by patient detail tests.
- Encounter tests cover saving clinical content and signing.
- AI note/billing suggestion flow is covered by encounter and backend AI note/live coding tests.
- Backend `liveEncounterCodingService` tests passed.
- Multiple diagnoses remain valid; provider still has to confirm, edit/remove, choose primary, and sign/finalize for official diagnosis.

Residual risk:

- Real clinical validation still requires provider review. AI suggestions must remain advisory.

## 3. Billing Code QA

Status: passed for software flow and claim-blocking surface.

Evidence:

- Encounter tests cover billing actions.
- Backend claims tests and claim scrubber tests passed.
- Backend CPT/modifier/live coding tests passed.
- Claims page release/readiness route tests passed.
- Financials and claims browser smoke posted payment and verified claim status changes.

Residual risk:

- Real payer-specific edits depend on clearinghouse/payer companion guide behavior.

## 4. Texting QA

Status: partially passed; live sending is gated by Twilio approval.

Evidence:

- Text Messages browser write smoke passed: conversation send, templates, scheduling, auto-response rules, settings, reminder/follow-up processors, and audit count.
- SMS consent backend tests passed.
- Twilio account is active/full.
- Messaging Service is configured with Railway production inbound/status webhooks.
- Public SMS consent page uses optional opt-in language and the checkbox is not required.
- A2P campaign was updated and resubmitted; current status is `IN_PROGRESS`.

Blocker:

- Do not enable unrestricted production live sends until Twilio campaign status is `VERIFIED`.

## 5. Revenue And Collections QA

Status: passed for current app logic and UI drill-downs.

Evidence:

- Backend financial metrics tests passed, including revenue details coverage.
- Frontend financial API tests passed.
- Financials page tests passed.
- Financials browser smoke passed claim status update and payment posting.
- Revenue drill-downs now have backend detail endpoints and frontend line-level rows.
- Store operations tests passed and product sales service tests/build passed.

Residual risk:

- Stripe env keys are missing locally, so true card settlement cannot be signed off from this environment.

## 6. Role Pass

Status: passed for browser-level access control.

Evidence:

- AuthZ browser smoke passed:
  - unauthenticated users redirected to login
  - provider blocked from admin and financials without billing role
  - provider with billing secondary role can access financials
  - MA blocked from financials
  - front desk blocked from financials and ambient scribe but can access claims
  - admin can access admin settings
- Home page tests cover role-filtered Command Center actions.

Residual risk:

- Every new module needs to keep using the same module-access checks and Command Center role filter.

## 7. Failure States

Status: passed for covered states.

Evidence:

- Schedule tests cover non-current-day check-in warning, no-show confirmation, status update errors, empty states, and missing data responses.
- Claims tests cover payment validation and exception queue filtering.
- Texting tests cover template/scheduled-message load failures and SMS consent missing flow.
- Patient portal and billing tests cover payment and assigned-form error states.
- Backend test suite includes error branches across billing, portal, claims, photos, ICD/CPT, audit, and SMS.

Residual risk:

- Some tests emit React `act(...)` warnings. They do not fail the suite, but they are test-hygiene debt.

## 8. Pilot Packet

Status: completed.

Evidence:

- `PILOT_PACKET.md` created with tenant, role logins, one-page office-day script, known test patients/dates, live-vs-test integration status, support workflow, and end-of-day reconciliation expectations.

## Current Integration Snapshot

- Stedi/eligibility: active eligibility integration config exists.
- Clearinghouse: active default clearinghouse config exists.
- Twilio/SMS: active settings exist; campaign is `IN_PROGRESS`; live sends remain gated.
- Stripe: active DB integration row exists; local env keys are missing.
- Phaxio/fax: env vars missing locally.
- Surescripts/eRx: production config not active.
- Sentry: configured.
- Database: connectivity passed.

## Signoff

Tester: Codex
Date: 2026-05-23
Result: software demo/pilot readiness passed with external-vendor gates noted above.
