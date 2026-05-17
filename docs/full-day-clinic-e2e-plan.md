# Full-Day Clinic E2E Scenario

This scenario lives in `e2e/tests/full-clinic-day.spec.ts`. It is designed to exercise the day-to-day flow of a dermatology office from scheduling through end-of-day financial reporting.

## Scenario Date

- Clinic day: May 16, 2026
- Tenant: `tenant-demo`
- Test patient created during the flow: Jordan Taylor

## Staff Coverage

- Dr. Maya Patel, MD: medical dermatology and new patient evaluation
- Riley Johnson, PA-C: general dermatology and telehealth follow-up
- Dr. Owen Sinclair, MD: Mohs surgery
- Sarah Mitchell, PA-C: cosmetic dermatology

## Patient Mix

- New acne patient with office visit, diagnoses, charges, prescriptions, and submitted claim
- Psoriasis telehealth follow-up with printed prescription and accepted claim
- Lesion biopsy with missing modifier denial and billing work queue item
- Mohs case with paid Medicare claim, ERA, and EFT
- Cosmetic injectable self-pay visit with patient collection
- Pediatric eczema check-in with pending prescription
- No-show skin check
- Cancelled cosmetic visit
- New patient created inside the test, then scheduled, documented, diagnosed, charged, prescribed, and completed

## Flow Coverage

- Schedule renders multi-provider day view, appointment types, locations, completed visits, checked-in visits, no-shows, and cancellations
- Patient registration creates a new active patient and exposes that patient in the patient search table
- Appointment creation places the new patient onto the clinic day
- Encounter creation and completion connects patient, provider, appointment, HPI, exam, assessment, diagnosis, charge, and prescription
- Rx page shows both seeded prescriptions and the prescription created during the flow
- Claims page shows submitted, accepted, paid, ready, and denied claims, including denial work
- Financials bills tab shows patient balances and billing review work queue
- Financials insurance tab shows payer time, money, denials, underpayments, and at-risk claims by insurance company
- Clearinghouse page shows ERA, EFT, and report generation
- Analytics page shows financial reports, claim pipeline, A/R, schedule leakage, provider performance, billing work queue, and operational drill-downs

## Key Assertions

- New patient flow returns `Jordan Taylor`
- New appointment and encounter IDs are generated
- Analytics new-patient count updates
- Claim count, prescription count, work queue count, and closing charges all include seeded plus newly created data
- Cross-page UI assertions verify the same clinical and revenue-cycle records appear in Schedule, Patients, Rx, Claims, Financials, Clearinghouse, and Analytics

## Run Command

```bash
CI=1 SKIP_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test --config=e2e/playwright.config.ts full-clinic-day.spec.ts --project=chromium
```

Start or reuse the Vite frontend dev server on port 5173 before running with `SKIP_SERVER=1`.
