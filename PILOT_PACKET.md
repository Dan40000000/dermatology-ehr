# Pilot Packet

Use this for a client demo or controlled pilot of the dermatology EHR.

## Environment

- Tenant: `tenant-demo`
- Frontend: Railway production or local dev server depending on test plan
- API: Railway production or local backend depending on test plan
- Data: demo dermatology office data only unless a signed client pilot has been approved

## Demo Role Logins

All demo users use tenant `tenant-demo`.

| Role | Email | Password |
| --- | --- | --- |
| Owner / Admin | `admin@demo.practice` | `Password123!` |
| Physician | `provider@demo.practice` | `Password123!` |
| RN / Nurse | `nurse@demo.practice` | `Password123!` |
| Office Manager | `manager@demo.practice` | `Password123!` |
| Front Desk | `frontdesk@demo.practice` | `Password123!` |
| Medical Assistant | `ma@demo.practice` | `Password123!` |
| Billing | `billing@demo.practice` | `Password123!` |

## Known Test Patients

Use these patients when a test needs realistic dermatology coverage.

| Patient ID | Scenario |
| --- | --- |
| `demo-acne-001` | Acne visit, medication and follow-up workflow |
| `demo-acne-002` | Severe acne / isotretinoin-style workflow |
| `demo-eczema-001` | Pediatric atopic dermatitis workflow |
| `demo-eczema-002` | Patch testing / contact dermatitis workflow |
| `demo-psoriasis-001` | Biologic medication and prior authorization workflow |
| `demo-cancer-001` | Skin cancer history / surveillance workflow |
| `demo-cancer-003` | Biopsy pending / pathology follow-up workflow |
| `demo-cosmetic-001` | Cosmetic/product revenue workflow |
| `demo-complex-001` | Multi-condition patient workflow |

## One-Page Office-Day Script

1. Log in as Front Desk.
2. Open Command Center and confirm today defaults correctly.
3. Open Schedule and check in the first scheduled patient.
4. Confirm non-current-day check-in warning appears if testing a past/future date.
5. Room the patient as MA or Nurse.
6. Enter vitals, clinical prep notes, orders, and task updates.
7. Log in as Provider.
8. Open the encounter from Schedule, Office Flow, or Patient Chart.
9. Save note content: chief complaint, HPI, exam, assessment, plan.
10. Add at least one ICD-10 diagnosis; add a second diagnosis when clinically relevant.
11. Mark the primary diagnosis.
12. Review AI suggestions; do not treat AI output as official until confirmed.
13. Add CPT/charge codes and confirm diagnosis pointers exist.
14. Sign/finalize the encounter.
15. Log in as Billing.
16. Open Claims/Clearinghouse and review coding queue, claim status, ERA/EFT/reconciliation tabs.
17. Release or correct claims only when required payer, diagnosis, and charge fields are complete.
18. Post a patient payment, payer payment, adjustment, denial, or bad-debt referral.
19. Open Revenue and Collections for the same date range and confirm totals reconcile.
20. Open Analytics/Historical Trends and confirm visit, revenue, no-show, cancellation, and payer metrics update.
21. Open Store Operations and review orders, payments, shipping status, and slow-moving inventory alerts.
22. Open Clinical Inbox and verify messages, texts, orders, refills, labs/pathology, tasks, and faxes route to the right work queues.

## What Is Live vs Test Mode

| Area | Status |
| --- | --- |
| Core EHR workflow | Software-ready for demo/pilot |
| Diagnosis review | AI-assisted, provider-confirmed |
| Billing code suggestions | AI-assisted, staff/provider-confirmed |
| Claims UI and clearinghouse workflow | Software-ready; live payer behavior depends on vendor config |
| Stedi/eligibility | Active eligibility integration config exists |
| Twilio SMS | Account/service/settings active; A2P campaign is `IN_PROGRESS`, not `VERIFIED` |
| Stripe payments | DB integration row exists; local env keys are missing in this workspace |
| eRx/Surescripts | Not live; production config not active |
| Fax/Phaxio | Not live in local env; required env vars missing |
| Labs/pathology | Internal workflow-ready; outside lab vendor interface is not live |
| Store | Internal order/inventory/revenue flow-ready; Stripe settlement requires live keys |

## Support And Bug Reporting

For every issue found during pilot:

1. Record the role, patient, appointment, page URL, and timestamp.
2. Capture the expected result and actual result.
3. Include screenshots for visual/UI issues.
4. Include the claim/order/message/encounter ID when relevant.
5. Mark severity:
   - P0: data loss, PHI exposure, incorrect patient, system unavailable
   - P1: blocks office-day workflow or billing/revenue flow
   - P2: workaround exists but should be fixed before expansion
   - P3: polish, copy, layout, or reporting improvement
6. Confirm whether the issue reproduces locally and on Railway before closing.

## End-Of-Day Reconciliation

At the end of each demo/pilot day:

1. Schedule count equals Command Center daily appointment count.
2. Completed appointments equal completed encounters.
3. Signed notes equal completed provider encounters.
4. Encounter diagnoses and charge lines are present before claim release.
5. Claims count by status matches Claims/Clearinghouse drill-downs.
6. Patient payments and payer payments match Collections for the same date range.
7. Earned clinical revenue, collected cash, store revenue, open balance, and bad debt are separated on Revenue/Collections.
8. Store orders reconcile to Store Operations and product revenue.
9. Text messages show consent state, outbound record, inbound reply routing, and failed/undelivered states.
10. Clinical Inbox has no hidden orphan work: labs/pathology, prescriptions/ePA, messages, faxes, tasks, and orders all have visible queues.

## Launch Gates Before Real Client Production

- Twilio A2P campaign status is `VERIFIED`.
- `SMS_LIVE_SEND_ENABLED=true` is set only after Twilio verification.
- Stripe live/test keys are configured for the intended environment.
- Surescripts/eRx contract and live config are complete if eRx is in scope.
- Fax vendor env/config is complete if fax is in scope.
- Deployed DB TLS is verified against the production database, not only a local mirror.
- Role access is reviewed with the client practice owner.
- Vendor BAAs and compliance evidence are current.
