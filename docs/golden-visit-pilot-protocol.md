# Golden Visit synthetic pilot protocol

Use this protocol only with an isolated staging tenant and synthetic patients. Do not enter real patient information, copy transcripts into tickets, or use a production tenant as a substitute for staging. The [Friday testing guide](friday-testing-guide.md) contains a reusable synthetic dermatology conversation.

## Prerequisites

1. Confirm the deployed frontend and backend contain the Golden Visit revision under test. Record the exact Git SHA and deployment revision.
2. Confirm staging database isolation, test identities for front desk, MA or nurse, provider, billing, and patient portal, and the synthetic patient's appointment.
3. Confirm the AI provider is intentionally enabled for this staging tenant, or mark AI-dependent steps unavailable. Keep credentials in the approved secret store, never in the worksheet or shell history.
4. Assign a facilitator and two or three practicing dermatology clinicians. Do not present developer-only testing as clinician validation.

## Visit exercise

For each clinician, use a new synthetic appointment. Record pass, fail, or blocked for each step, plus the elapsed time and a short observation without PHI.

1. Front desk schedules and checks in the synthetic patient; MA rooms the patient and records vitals. Confirm the encounter shows the correct patient and appointment.
2. Provider reviews the pre-visit brief. Ask what was useful, what was missing, and whether any item was misleading. Verify allergies, medications, diagnoses, open orders, and urgent result cues against the synthetic chart.
3. Provider records the scripted visit after documenting consent. Verify the live status and transcript, then stop recording. Confirm recording stops on encounter closure as well.
4. Provider reviews the generated note section by section. Check negation, uncertainty, laterality, medication details, exam findings, and follow-up against the script. Record every clinically meaningful correction.
5. Provider requests a Magic Edit of one selected section. Inspect before/after text, evidence excerpts, and missing-data warnings. Apply only one selected change; verify an unselected section remains unchanged. If AI is unavailable, verify the original note remains intact and the UI states why.
6. In a second browser session, change the draft after the preview is created. Verify the stale preview cannot overwrite that change. Confirm approved or rejected notes cannot be silently edited.
7. Provider chooses which suggested diagnoses, orders, tasks, and billing-review items to post. Verify only chosen items appear in the respective work queues; no prescription, message, claim, or signature is executed automatically.
8. Provider reviews and approves the patient summary, then explicitly shares it to the synthetic patient portal. Verify an unapproved linked summary cannot be shared, and the patient sees only the approved content.
9. Complete checkout. Reconcile appointment, encounter, note, selected orders/tasks, billing-review item, summary share, and result follow-up state.

## Measurements and findings

Record these for each visit without storing clinical narrative in the report:

- Time from opening the encounter to a clinician-accepted note.
- Number of clinically meaningful note corrections and number of Magic Edit suggestions accepted.
- Number of selected follow-up items created correctly; number missing, duplicated, or created without selection.
- Number of patient/chart identity mismatches, unsupported facts, wrong laterality, or misleading evidence labels.
- Number of confusing or blocked actions; whether the clinician needed facilitator help.
- Clinician rating from 1 (unusable) to 5 (ready for a controlled pilot), with one reason for the rating.

For every failure, record the step number, role, timestamp, environment revision, expected result, actual result, and severity. Use an internal issue link or synthetic entity ID; do not paste a transcript, screenshot with PHI, or credential into a ticket.

## Stop conditions and sign-off

Stop the exercise and block real-PHI use for any wrong-patient association, unauthorized disclosure, unsupported clinical fact presented as verified, automatic clinical or financial action without approval, lost note changes, inaccessible critical action, or broken result follow-up. Follow the [production-readiness runbook](production-readiness-runbook.md) for the broader release gates.

The facilitator records which clinicians actually participated and whether each completed the exercise. Clinical, privacy, and security owners review the findings and decide whether another synthetic iteration is required. This worksheet is not a HIPAA compliance determination or a substitute for an organizational risk analysis.
