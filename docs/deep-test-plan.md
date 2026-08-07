# Deep Test Plan

Purpose: validate that the dermatology app works as a connected practice-management system, not just as isolated pages.

Scope: local app, current branch/worktree, fake/demo data only. Vendor-dependent workflows are verified to the adapter boundary unless real credentials are available.

## Automated Gate

Run these before manual testing:

```bash
npm run build
npm --prefix backend test -- --runInBand
npm run test:frontend:release
npm run test:e2e:smoke
npm run test:e2e:insurance
npm run test:backup
npm run integrations:smoke
```

CI additionally runs the frontend suite in four isolated Vitest shards, executes every migration against a disposable PostgreSQL 16 database, enforces dependency audits at the critical severity threshold, and aggregates all jobs into a required release gate. The scheduled insurance-quality workflow repeats the estimate and portal accessibility tests in Chromium, Firefox, and WebKit.

Pass criteria:

- Backend build passes.
- Frontend build passes.
- Backend unit/integration tests pass.
- Frontend unit/component tests pass.
- All migrations apply cleanly to an empty real PostgreSQL database.
- E2E smoke passes.
- Insurance lifecycle, patient isolation, keyboard, mobile, and automated accessibility checks pass.
- Backup creation fails safely, encrypted artifacts decrypt cleanly, and restore tooling refuses a non-verification database.
- Integration smoke has no unexpected failures.
- Expected integration failures are limited to missing live vendor credentials or subscriptions.

## Critical Workflow Matrix

### Access And Security

- Login as provider, front desk, billing-capable user, and admin.
- Confirm protected pages redirect when logged out.
- Confirm provider cannot access admin-only pages.
- Confirm front desk cannot access AI scribe.
- Confirm back button does not restore protected data after logout.
- Confirm inactive/expired sessions require re-authentication.

### Scheduling And Office Flow

- Create appointment for current patient.
- Create appointment from patient portal self-scheduling.
- Check in patient from schedule.
- Confirm patient appears in waiting room.
- Move patient to room.
- Start encounter.
- End provider portion of visit.
- Confirm patient lands in checkout, even with zero due.
- Complete checkout.
- Confirm schedule, office flow, patient profile, and encounter status all agree.

### Patient Chart

- Open patient profile.
- Confirm demographics, insurance, preferred pharmacy, recalls, appointments, encounters, photos, documents, prescriptions, orders, and financials load.
- Add preferred pharmacy.
- Add recall enrollment.
- Confirm reminder/recall detail pages show enrolled patients and statuses.
- Confirm profile history shows saved AI/copilot summaries in a readable format.

### Encounter And Clinical Flow

- Start a visit from schedule and from patient profile.
- Add chief complaint, vitals, diagnosis, orders, procedure/charge, prescription, and follow-up task.
- Sign or complete the encounter through the intended workflow.
- Confirm orders appear on orders page.
- Confirm prescriptions appear on prescriptions page.
- Confirm billable orders create charge capture or billing review, depending on confidence and source.
- Confirm completed encounter cannot be edited incorrectly.

### AI Scribe And Copilot

- Start ambient scribe recording.
- Use a realistic doctor/patient script.
- Confirm live panel shows summary, symptoms, potential diagnoses, and testing/recommendations.
- Stop recording and wait for transcript/note completion.
- Review and edit the AI note.
- Post note to appointment.
- Confirm patient chart history updates.
- Confirm diagnoses and orders are created only when approved.
- Confirm CPT suggestions create billing review work queue items, not automatic claims.

### Billing And Revenue Cycle

- Add diagnosis and CPT/HCPCS charge to an encounter.
- Confirm charge appears in encounter billing panel.
- Confirm financial overview uses actual charges, not appointment-type estimate, when charges exist.
- Create claim from encounter charges.
- Confirm claim line items retain diagnosis codes and charge linkage.
- Scrub/release claim to submission-ready state.
- Post patient payment.
- Confirm bill/balance due updates.
- Confirm payment appears in financial pages and patient bill-pay flow.
- Confirm 30/60/90 aging buckets update from unpaid balances.

### Patient Portal

- Log in as current patient.
- Confirm upcoming appointments, intake/check-in, messages, billing, and prescriptions load.
- Submit check-in questionnaire.
- Confirm main schedule/check-in view receives the data.
- Book a guest/self-scheduled appointment.
- Confirm provider schedule receives the appointment.
- Use public bill-pay code.
- Confirm payment records flow back to financial pages.

### Communications And Feedback

- Send tester feedback from top-bar/issue suggestion.
- Confirm it appears in professional feedback inbox.
- Confirm no PHI is required to submit feedback.
- Create a text message template and scheduled message in mock mode.
- Confirm failures surface clearly and do not crash the page.

### Documents, Photos, Inventory

- Upload document.
- Confirm it appears on patient profile.
- Upload or view photo page.
- Confirm grid/list/timeline controls are visually separated and usable.
- Add procedure/inventory usage during encounter.
- Confirm inventory count or usage log updates.

## Known Vendor Boundaries

These are not blockers for demo testing if they are clearly marked:

- Eligibility is mock until real provider is configured.
- E-prescribing is mock until DoseSpot/Surescripts or another certified vendor is configured.
- Prior authorization is mock until vendor is configured.
- Stripe/payment processor needs live or test keys for real card processing.
- Phaxio needs credentials for real faxing.
- Surescripts needs subscription/config before live workflows.

## Bug Recording Rules

Record each issue with:

- Page name.
- User role.
- Patient or appointment used.
- Exact steps.
- Expected result.
- Actual result.
- Screenshot if visual.
- Console error if present.
- Whether it blocks testing or is cosmetic.
