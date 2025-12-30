# Dermatology EHR Parity Quest (RPG PRD)

## Roles
- **Product Owner (Quest Giver):** Defines parity goals and acceptance.
- **Backend Engineer (Blacksmith):** Forges APIs, DB migrations, services, integrations.
- **Frontend Engineer (Artisan):** Crafts UI flows for scheduler, waitlist, Rx PA, fax, portal.
- **Clinical SME (Lorekeeper):** Validates workflows match dermatology practice.
- **Ops/SRE (Guardian):** Monitoring, queues, retries, rate limits, logs.
- **Compliance/Security (Sentinel):** HIPAA/PHI guardrails, audit logs.

## Problems (Monsters)
- Missing parity features: time blocks, waitlist auto-fill, ePA, fax.
- Portal pre-check-in needs polish/status sync.
- Rx workflows lack prior auth; document workflows lack fax in/out.
- Need traceable tasks, dependencies, and automated analysis/expansion.

## Goals (Win Conditions)
- Add provider/location time blocks that block booking and show in scheduler.
- Waitlist auto-fill: detect openings, notify patients, schedule, and mark resolved.
- ePA MVP: submit PA for Rx, track statuses/history, attach docs (mock adapter swappable).
- Fax MVP: send/receive via adapter; inbound → document queue; statuses and errors visible.
- Portal: show/check pre-check-in state and confirm appointment on completion.
- Generate TaskMaster tasks, expanded with complexity analysis, organized under a sprint tag.

## Quests (Tasks)
1. **Time Blocks Upgrade**
   - DB/index check; conflict detection in availability/booking.
   - API: CRUD with recurrence support; cancel/update.
   - UI: scheduler surface to view/create blocks; color coding; tooltips.
   - Tests: block vs appointment overlap; recurrence; cancellation.

2. **Waitlist Auto-Fill & Notify**
   - Add worker/service to scan cancellations/open slots.
   - Matching logic (provider/location/type, preferred times/days, priority).
   - Notifications via SMS/email/portal; hold window; status transitions; audit.
   - UI: show matches, manual “fill from waitlist,” contact log.

3. **ePA (Prior Auth) MVP**
   - DB: `prior_auth_requests` (rx/payer/member/status/history/attachments).
   - Adapter interface with mock provider; pluggable real vendor later.
   - Rx UI: request PA, show status, history, upload supporting docs.
   - Tests: state machine (submitted→pending→approved/denied/addl_info), mock responses.

4. **Fax MVP**
   - DB: `faxes` (direction/status/from/to/doc_id/error/timestamps).
   - Adapter interface with mock provider; inbound webhook to doc queue/patient attach.
   - UI: Fax inbox/outbox tab under Documents; send/retry/view/download.
   - Tests: send/receive happy path, error surface, webhook ingestion.

5. **Portal Pre-Check-In Polish**
   - Portal appointments show pre-check-in state; allow resume/complete.
   - Backend: tighten session lifecycle, audit, appointment status sync to confirmed.
   - Optional: send confirmation email/SMS on completion.

6. **TaskMaster Automation**
   - Parse PRD, run complexity analysis with research, expand tasks, validate deps.
   - Generate task files, create sprint tag, commit .taskmaster artifacts.

## Constraints & Risks
- Avoid storing PHI in logs; ensure audit logs for key actions.
- External adapters (fax/ePA) may require sandbox keys; use mocks first.
- Notification costs/rate limits; throttle SMS/email.
- Scheduler conflict logic must be correct to prevent double-booking.

## Acceptance Criteria
- Time blocks prevent overlapping bookings; visible in scheduler; recurrence works; cancellations honored.
- Waitlist: cancellation triggers match + notification; accepting schedules and marks waitlist entry scheduled; audit/logs captured.
- ePA: submit from Rx, see status/history; mock adapter responses reflected; errors surfaced cleanly.
- Fax: can send a PDF and see status; inbound webhook produces a document item; errors visible.
- Portal: pre-check-in state visible; completion confirms appointment and updates session.
- TaskMaster: tasks generated/expanded, dependencies validated, sprint tag created, .taskmaster committed.
