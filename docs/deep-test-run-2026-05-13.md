# Deep Test Run - 2026-05-13

Scope: local automated deep test pass for the current dirty worktree.

## Commands

```bash
npm run build
npm --prefix backend test -- --runInBand
npm --prefix frontend test -- --run --maxWorkers=2 --testTimeout=15000
npm run test:e2e:smoke
npm run integrations:smoke
```

## Results

### Build

Result: PASS.

Notes:

- Backend TypeScript build passed.
- Frontend Vite production build passed.
- Existing Vite warning remains: some generated chunks are larger than 500 kB after minification. This is a performance optimization item, not a Friday functional blocker.

### Backend Tests

Command:

```bash
npm --prefix backend test -- --runInBand
```

Result: PASS.

Summary:

- Test suites: 246 passed, 6 skipped, 252 total.
- Tests: 4,282 passed, 97 skipped, 4,379 total.

Notes:

- Console errors in the output are from intentional mocked failure-path tests and passed assertions.

### Frontend Tests

Command:

```bash
npm --prefix frontend test -- --run --maxWorkers=2 --testTimeout=15000
```

Result: PASS.

Summary:

- Test files: 106 passed.
- Tests: 1,129 passed.

Notes:

- The suite emits existing React `act(...)` warnings and expected mocked error logs.
- The constrained-worker command is the reliable local command for the full frontend suite.

### Browser Smoke

Command:

```bash
npm run test:e2e:smoke
```

Result: PASS.

Summary:

- 21 of 21 Playwright smoke tests passed.

Coverage included:

- Auth/role protection.
- Admin write flows.
- Ambient auto-stop smoke.
- Schedule rendering/write smoke.
- Patient detail to encounter transition.
- Financial/claims hub rendering.
- Financial write smoke.
- Documents write smoke.
- Referrals write smoke.
- Text messaging write smoke.

### Integration Readiness

Command:

```bash
npm run integrations:smoke
```

Result: EXPECTED CONFIG GAPS ONLY.

Summary:

- Pass: 9.
- Warn: 3.
- Fail: 3.

Expected warnings:

- `ELIGIBILITY_PROVIDER=mock`.
- `PRESCRIBING_PROVIDER=mock`.
- `PRIOR_AUTH_PROVIDER=mock`.

Expected failures:

- Missing Stripe env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
- Missing Phaxio env vars: `PHAXIO_API_KEY`, `PHAXIO_API_SECRET`, `PHAXIO_FROM_NUMBER`.
- No active Surescripts integration config.

Non-subscription positives:

- Database connectivity passed.
- Twilio env vars present.
- SES/SMTP env vars present.
- Active/default clearinghouse config present.
- Eligibility integration config present.

### Staging/HIPAA Readiness

Command:

```bash
npm run hipaa:staging-readiness
```

Result: ENVIRONMENT HARDENING GAPS.

Summary:

- Pass: 29.
- Warn: 0.
- Fail: 2.

Failures:

- Database TLS is not enforced for a production-like environment.
- CORS origins include localhost in a production-like environment.

Interpretation:

- These are not Friday fake-data testing blockers.
- They must be fixed before any real PHI production/staging environment.

## Expected Subscription/Config Findings

These are expected until live vendor setup is complete:

- Stripe env vars may be missing.
- Phaxio env vars may be missing.
- Surescripts config may be missing.
- Eligibility, prescribing, and prior authorization may still use mock providers.

## Non-Subscription Gaps Found

No app-flow blockers were found in the automated deep pass.

Items to watch manually Friday:

- AI scribe medical quality and categorization still needs human review because automated tests cannot judge clinical nuance.
- Data parity between local and Railway should be checked immediately before cloud testing if Friday testing is done on Railway.
- Large frontend chunks are a performance optimization target if testers report slow initial load.
- Production-like environment needs DB TLS and CORS hardening before real PHI use.
