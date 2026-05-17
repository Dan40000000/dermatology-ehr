# Monday Clinical Inbox Day Run

Run date: Monday, May 18, 2026
Assumed kickoff: 8:00 AM America/Denver
Owner: Codex-assisted QA session

## Purpose

Run the Clinical Inbox through a full clinic-day simulation and keep a structured record of how the daily office flows behave end to end. The goal is to assess whether the inbox correctly coordinates scheduling, messages, clinical work, Rx/ePA, results, faxes, billing, clearinghouse, and analytics without losing accountability.

## Evidence Commands

```bash
npm --prefix frontend run build
npm --prefix frontend test -- --run src/pages/__tests__/home.test.tsx src/pages/__tests__/clinicalInbox.test.tsx src/pages/__tests__/schedule.test.tsx
CI=1 npx playwright test -c e2e/playwright.config.ts e2e/tests/full-clinic-day.spec.ts --project=chromium
git diff --check
```

## Flow Tracker

| Area | Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- |
| Schedule | Full clinic day loads scheduled patients at correct times | Patients, providers, locations, visit types, no-shows, cancellations, and completed visits render correctly | Not started |  |
| Schedule | New patient is booked into the day | Appointment is created at the intended time and appears in downstream patient/schedule context | Not started |  |
| Check-in | Patient check-in and patient flow status | Check-in updates front desk and patient flow state | Not started |  |
| Clinical Inbox | Portal message triage | Thread loads, marks read, supports reply/internal note, and status/priority updates | Not started |  |
| Clinical Inbox | SMS queue handling | Unread text appears, can be marked read, and drops from unread work | Not started |  |
| Clinical Inbox | Intramail handling | Mail thread loads, marks read, and supports reply | Not started |  |
| Clinical Inbox | Task handling | Open tasks appear and can be completed | Not started |  |
| Clinical Inbox | Refill handling | Pending refill appears, approves, and creates/updates Rx state | Not started |  |
| Clinical Inbox | ePA handling | ePA work appears with payer/status context | Not started |  |
| Clinical Inbox | Order handling | Open lab/order appears and can be completed | Not started |  |
| Clinical Inbox | Biopsy safety handling | Critical pathology item appears and creates follow-up task | Not started |  |
| Clinical Inbox | Fax handling | Unread/unlinked fax appears and can be marked read | Not started |  |
| Patient Chart | Patient links from inbox | Patient chart opens from patient-linked work | Not started |  |
| Rx | Prescriptions from the day | New and refill-generated prescriptions are visible | Not started |  |
| Claims | Claims generated from completed encounters | Claims appear with correct patient, payer, status, and amounts | Not started |  |
| Financials | Revenue, billing queue, and insurance analytics | Financial pages reflect the simulated day and payer work | Not started |  |
| Clearinghouse | ERA, EFT, and reports | Clearinghouse tabs render expected ERA/EFT/report state | Not started |  |
| Analytics | Operational and financial analytics | Analytics reflect appointments, revenue, claims, and work queue state | Not started |  |

## Expanded Impact Checklist

Use this as the impact map for the Monday run. Each major action should either update the relevant downstream surface or prove why it should not.

| Trigger | Must Impact | Evidence To Capture | Status |
| --- | --- | --- | --- |
| New patient booking | Schedule, patient chart, front desk queue, analytics new-patient count | Appointment row, patient profile, appointment analytics | Not started |
| Check-in | Front desk state, patient flow, encounter readiness, copay/past balance handling | Check-in status, patient flow status, payment/defer result | Not started |
| Provider starts encounter | Encounter, notes, orders, prescriptions, diagnosis/coding, patient timeline | Encounter status, note sections, linked diagnosis/order/Rx | Not started |
| Encounter completion | Claims, charges, billing, analytics, patient chart timeline | Claim/charge created, revenue analytics updated | Not started |
| Portal message arrives | Clinical Inbox, patient chart, secure message thread, unread counts | Inbox item, thread detail, mark-read, reply/internal note | Not started |
| SMS arrives | Clinical Inbox, text message workspace, consent/audit state | Unread SMS item, mark-read, thread state | Not started |
| Intramail arrives | Clinical Inbox, mail workspace, staff accountability | Mail detail, mark-read, reply | Not started |
| Refill request arrives | Clinical Inbox, Rx module, patient med list, audit trail | Refill item, approve/deny result, generated Rx | Not started |
| ePA needs info | Clinical Inbox, ePA page, payer analytics where applicable | ePA item, payer/status/reason, source link | Not started |
| Lab/order pending | Clinical Inbox, orders, patient chart, analytics | Order item, completion result, patient chart link | Not started |
| Biopsy/pathology result | Clinical Inbox, biopsy safety, task queue, patient chart, analytics | Critical result item, follow-up task, biopsy status | Not started |
| Fax received | Clinical Inbox, fax inbox, document routing, patient chart if linked | Fax item, mark-read/linking result | Not started |
| Claim denied | Financial work queue, claims, insurance analytics, clearinghouse | Denial item, payer scorecard, claim detail | Not started |
| ERA/EFT received | Clearinghouse, financials, claims payments, reports | ERA/EFT rows, posting/reconciliation, closing report | Not started |
| End-of-day close | Analytics, financials, clearinghouse reports, open work count | Daily report, unresolved item list, residual risk | Not started |

## Prescription And eRx Checklist

The day run should include more than one type of prescription event so we prove the Rx flows are not only visible, but connected.

| Scenario | Test Patient | Expected Impact | Status | Notes |
| --- | --- | --- | --- | --- |
| New eRx from encounter | Acne/new patient | Prescription appears in Rx, patient chart, and encounter context with electronic delivery status | Not started | Tretinoin or doxycycline |
| Printed/manual Rx | Psoriasis/telehealth patient | Prescription appears with print/manual status without pretending it was electronically transmitted | Not started | Clobetasol example |
| Refill approval from Clinical Inbox | Eczema patient | Refill request changes to approved and creates/updates prescription record | Not started | Triamcinolone example |
| Refill denial | Any existing medication | Denial reason is captured and request leaves pending queue | Not started | Add if time permits |
| Medication change request | Pharmacy-driven change | Change request appears, can be approved/denied, and audit state is retained | Not started | Add if time permits |
| ePA required | Biologic/topical failure patient | ePA appears with payer, status, missing info, and source link | Not started | Adalimumab example |
| ePA needs info resolved | Biologic patient | Status moves out of needs-info after documentation is attached/submitted | Not started | Add if route supports it |
| Pharmacy transmission failure | Any eRx | Error state is visible and creates retry/follow-up work | Not started | Simulate failed send if route supports it |
| Duplicate prescription prevention | Same patient and med | UI/API avoids accidental duplicate send or makes duplicate obvious | Not started | Safety check |
| Allergy/contraindication warning | Patient with documented allergy | Warning is visible before prescription finalization | Not started | Add if allergy data exists |
| Patient instructions | Any Rx | Sig, quantity, refills, pharmacy, and indication are visible and readable | Not started | Visual/detail check |
| Audit trail | All Rx events | User/action/time/status is traceable where audit exists | Not started | Check audit log if available |

## Day Script Additions

Add these events to the simulated clinic day so the checklist has real actions behind it.

| Time | Event | Flow To Validate |
| --- | --- | --- |
| 8:00 AM | New acne patient visit | Book, check in, encounter, diagnosis, eRx, claim |
| 8:30 AM | Psoriasis telehealth follow-up | Encounter, printed/manual Rx, ePA needs-info |
| 9:15 AM | Lesion biopsy visit | Order/pathology safety setup, claim, follow-up task |
| 10:00 AM | Mohs surgery visit | Procedure claim, wound-care intramail, patient chart |
| 11:30 AM | Cosmetic visit | Self-pay charge/payment, analytics revenue split |
| 1:00 PM | Eczema follow-up | Refill request, SMS, refill approval, Rx update |
| 2:15 PM | No-show skin check | Schedule no-show, fee/analytics impact |
| 3:15 PM | Cancelled cosmetic appointment | Cancellation status, cancellation/no-show analytics |
| 4:00 PM | Added same-day new patient | Late booking, encounter completion, claim generation |
| 5:00 PM | Results/fax cleanup | Biopsy follow-up, fax read/linking, remaining work count |

## Evidence Rules

- Every pass should have one visible UI assertion and one downstream data/API assertion where possible.
- Every failure should record the source flow, expected result, actual result, severity, and whether it was fixed during the run.
- Any prescription send path should record delivery method, delivery status, patient, provider, pharmacy, medication, and whether an ePA or follow-up task was created.
- End-of-day assessment should list unresolved inbox items by source, priority, patient, and next action.

## Issue Log

| ID | Severity | Flow | Finding | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | Add findings during Monday run | Open |  |

## Run Summary Template

Completed at:

Passed flows:

Failed flows:

Bugs fixed during run:

Bugs deferred:

Residual risk:

Decision:
