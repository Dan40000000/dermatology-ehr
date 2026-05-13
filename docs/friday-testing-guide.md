# Friday Testing Guide

Use this when you test the app Friday. The goal is to act like a derm office for one fake patient from scheduling through checkout and billing.

## Before You Start

- Use fake patients only.
- Do not enter real PHI.
- If something breaks, submit it through the in-app feedback/issue button and also write it down here.
- Do not worry about missing live subscriptions for eRx, eligibility, prior auth, Stripe, Phaxio, or Surescripts. Those are known setup items.

## Quick Pass/Fail Legend

- PASS: worked as expected.
- FAIL: broken or blocked workflow.
- WARN: worked, but confusing, ugly, slow, or not office-friendly.
- SKIP: vendor subscription or credentials required.

## Test 1: Login And Session Safety

- Open the app.
- Click Provider Login.
- Confirm it goes to login if you are logged out.
- Log in.
- Open provider home.
- Log out.
- Press browser back.
- Click Provider Login again.
- Expected: it should require login again and should not restore protected data.

Result:

Notes:

## Test 2: Schedule To Waiting Room

- Go to Schedule.
- Create or pick a fake patient appointment.
- Check the patient in.
- Go to Office Flow or Waiting Room.
- Expected: checked-in patient appears in waiting room.
- Move patient to a room.
- Expected: patient moves from waiting room to room status.

Result:

Notes:

## Test 3: Encounter To Checkout

- Open the roomed patient appointment.
- Start or open the encounter.
- Add vitals if available.
- Add chief complaint: changing mole and itchy rash.
- Add diagnosis codes if available.
- Add a procedure/order, such as shave biopsy or dermatopathology.
- Add a prescription, such as topical steroid or ketoconazole shampoo.
- End the provider part of the visit.
- Expected: patient goes to checkout, not directly completed.
- Complete checkout.
- Expected: patient becomes completed only after checkout.

Result:

Notes:

## Test 4: AI Scribe

Use this script or your own natural version:

```text
Doctor: Hi, what brought you in today?
Patient: I have a spot on my right shoulder that looks darker and has changed over the last couple months. It does not really hurt, but it has bled once after I scratched it.
Doctor: Any personal or family history of skin cancer?
Patient: My dad had melanoma. I have had a lot of sunburns.
Doctor: I also see some redness and flaking around your nose and eyebrows. Is that itchy?
Patient: Yes, it comes and goes, especially when I am stressed.
Doctor: For the shoulder spot, I recommend a shave biopsy today and sending it to pathology. For the face rash, this looks like seborrheic dermatitis. I will start ketoconazole shampoo a few times weekly and a mild topical steroid only for flares.
Patient: Do I need to come back?
Doctor: We will call with biopsy results. If it is abnormal, we will plan the next step. Otherwise I want a full skin check in six months because of your family history.
```

Check these:

- Live transcript appears.
- Live summary appears.
- Live symptoms include changing/darker shoulder spot, bleeding, facial redness/flaking/itching.
- Potential diagnosis includes melanoma rule-out or atypical nevus, plus seborrheic dermatitis.
- Testing/recommendations include shave biopsy and pathology, not shampoo as a test.
- Final AI note is editable.
- Posting the note saves to the appointment and patient history.
- CPT suggestions go to billing review, not automatic billing.

Result:

Notes:

## Test 5: Patient Profile

- Open the test patient profile.
- Confirm appointment history shows the encounter.
- Confirm AI/copilot summary is readable and organized.
- Confirm prescriptions are visible.
- Confirm orders are visible.
- Confirm recalls/reminders are visible.
- Add or verify preferred pharmacy.
- Add patient to a recall campaign.
- Open the recall/reminders page and click the campaign.
- Expected: you can see the patient list and statuses.

Result:

Notes:

## Test 6: Billing And Financial Flow

- From the encounter, confirm charges exist or create a charge manually.
- Confirm diagnosis code is attached to insurance charge.
- Go to Financials.
- Expected: charge/revenue appears in the correct place.
- Create or view claim.
- Expected: claim has CPT, ICD, units, and charge amount.
- If balance is patient responsibility, go to bill pay.
- Use public bill-pay code if available.
- Record a payment in test/mock mode.
- Expected: payment appears in financials and reduces balance.

Result:

Notes:

## Test 7: Patient Portal

- Open patient portal.
- Log in as current fake patient if available.
- Confirm appointments load.
- Submit check-in/intake.
- Expected: schedule/check-in side sees the submitted information.
- Try self-scheduling as guest or patient.
- Expected: appointment appears on provider schedule.
- Try bill pay if a balance/code exists.

Result:

Notes:

## Test 8: Feedback And Issue Suggestion

- Click issue/suggestion/feedback.
- Submit: "Friday tester feedback smoke test".
- Include a screenshot if the UI allows.
- Expected: feedback appears in the admin/professional feedback inbox.

Result:

Notes:

## Final Decision

- Would a derm office understand how to use this without us explaining every click?
- Did any workflow get stuck?
- Did any page show stale or mismatched data?
- Did any financial number not trace back to an encounter, charge, payment, claim, or bill?
- Did any AI output look medically unsafe, badly categorized, or hard to edit?

Overall result:

Top fixes needed before wider testing:
