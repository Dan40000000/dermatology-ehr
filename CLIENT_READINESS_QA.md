# Client Readiness QA Checklist

Purpose: prove the system can survive a normal dermatology office day before a client demo or pilot.

Run this after meaningful changes to scheduling, notes, diagnoses, billing, claims, texting, payments, analytics, or role permissions.

## 1. Core Office-Day Flow

- [ ] Log in as front desk.
- [ ] Confirm Command Center defaults to the current business day.
- [ ] Open Schedule and confirm the same appointment count appears there.
- [ ] Check in the first patient.
- [ ] Confirm the patient moves from scheduled to checked in / waiting.
- [ ] Room the patient as MA or nurse.
- [ ] Start the encounter as provider.
- [ ] Save a note with chief complaint, HPI, exam, assessment, and plan.
- [ ] Add at least one ICD-10 diagnosis.
- [ ] Mark one diagnosis as primary when multiple diagnoses are present.
- [ ] Add CPT / charge codes that match the encounter.
- [ ] Confirm charges include diagnosis pointers or diagnosis codes.
- [ ] Sign or finalize the note.
- [ ] Confirm the encounter appears on Notes and patient chart history.
- [ ] Confirm billing can see the visit in the review / claims workflow.
- [ ] Create or release the claim.
- [ ] Confirm the claim appears on Claims / Clearinghouse.
- [ ] Post a patient payment, payer payment, adjustment, or denial.
- [ ] Confirm Revenue, Collections, Claims, and Analytics update for the same date range.

## 2. Diagnosis QA

- [ ] A patient can have more than one diagnosis on the problem list.
- [ ] Encounter diagnoses are distinct from long-term problem-list history.
- [ ] AI-suggested diagnoses remain labeled as clinician review required until accepted.
- [ ] Provider can confirm, edit, remove, or mark a diagnosis primary.
- [ ] Primary diagnosis is visible in the chart and billing flow.
- [ ] Diagnosis codes flow into charges and claim diagnosis pointers.
- [ ] Claims cannot be released if charge lines are missing required diagnosis support.
- [ ] Diagnosis history remains visible on prior dates.

## 3. Billing Code QA

- [ ] AI billing suggestions can be reviewed before submission.
- [ ] Billing suggestions never become official charges without staff/provider confirmation.
- [ ] E/M codes, procedure codes, modifiers, quantities, and line amounts are visible.
- [ ] Procedure plus office visit prompts for modifier 25 when appropriate.
- [ ] Biopsy, destruction, injection, excision, repair, cosmetic, and office-visit examples can be represented.
- [ ] Each charge line carries at least one related ICD-10 code for insurance claims.
- [ ] Self-pay/cosmetic charges stay out of insurance claim submission unless explicitly configured.
- [ ] Claim release fails loudly when required billing data is missing.

## 4. Texting QA

- [ ] SMS settings show active Twilio credentials and the practice messaging number.
- [ ] A2P brand status is approved.
- [ ] A2P campaign status is verified before live production texting.
- [ ] Consent page states that SMS opt-in is optional and not required for treatment, payment, registration, or appointments.
- [ ] Patient SMS preference shows opted in, opted out, or pending consent.
- [ ] Staff cannot text a patient without valid consent.
- [ ] Patient can opt out with STOP.
- [ ] Patient can request help with HELP.
- [ ] Patient can re-opt in with START or YES.
- [ ] Incoming texts route into the clinical inbox / text messages workflow.
- [ ] Outbound messages create an audit record and a message record.
- [ ] Delivery failures show as failed or undelivered, not as silently successful.
- [ ] Appointment reminders and billing texts use approved templates and include opt-out instructions.

## 5. Revenue And Collections QA

- [ ] Revenue page defaults to the current day and supports date-range selection.
- [ ] Revenue page separates earned revenue, collected cash, open balance, store revenue, and insurance variance.
- [ ] Clicking a revenue category opens line-level detail.
- [ ] Procedure revenue drill-down shows patient, date, CPT/detail, total revenue, collected amount, balance, and status.
- [ ] Collections page matches payments and A/R for the same date range.
- [ ] Claims page matches claim statuses and payer workflow.
- [ ] Store revenue appears separately from clinical revenue.
- [ ] Bad debt / collections referrals are visible when balances are moved to collections.
- [ ] Expected payer amount vs actual payer payment is tracked as variance.

## 6. Role Pass

- [ ] Admin can see all modules, role settings, and command-center settings.
- [ ] Provider can see schedule, patient chart, notes, diagnoses, orders, prescriptions, and clinically relevant queues.
- [ ] Provider cannot see irrelevant financial cards unless allowed.
- [ ] Front desk can see schedule, check-in, patient demographics, reminders, and operational command-center cards.
- [ ] Front desk cannot see restricted financial cards unless allowed.
- [ ] Billing can see claims, clearinghouse, payments, revenue, collections, and coding queues.
- [ ] MA / nurse can room patients, update vitals, tasks, and clinical prep items.
- [ ] Patient portal users see only their own data, appointments, bills, documents, intake, and store.

## 7. Failure States

- [ ] If a backend endpoint fails, the UI says data unavailable instead of showing a misleading zero.
- [ ] If an integration is in mock/test mode, the UI labels it clearly.
- [ ] If Twilio live sending is disabled, staff sees why.
- [ ] If a claim cannot release, the exact missing requirement is shown.
- [ ] If AI suggestions exist, clinician-review state is visible.
- [ ] If a date is not today, check-in warns before changing appointment status.
- [ ] If role access blocks a page, command-center cards do not route to that page.

## 8. Pilot Packet

- [ ] Demo tenant ID and role logins.
- [ ] One-page office-day script.
- [ ] Known test patients and dates.
- [ ] What is live vs test mode.
- [ ] Integration status for Stedi, Stripe, Twilio, eRx, fax, labs, and clearinghouse.
- [ ] Support contact and bug-reporting workflow.
- [ ] End-of-day reconciliation expectations.

## Signoff

- Date:
- Tester:
- Environment:
- Git SHA:
- Railway deployment:
- Blocking issues:
- Non-blocking issues:
