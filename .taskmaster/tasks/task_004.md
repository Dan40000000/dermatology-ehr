# Task ID: 4

**Title:** Waitlist Auto-Fill Worker Service

**Status:** pending

**Dependencies:** 1, 2

**Priority:** medium

**Description:** Implement background worker to scan cancellations/open slots and match waitlist entries.

**Details:**

Use Sidekiq/Resque worker: cron every 5min or trigger on cancellation. Query open slots (availability minus blocks/appointments). Match waitlist by provider/location/type/preferred_days/priority score (e.g., weighted SQL ORDER BY). Create hold slot, transition status to 'matched'. Configurable hold_window (24h). Log audits without PHI.

**Test Strategy:**

Unit tests: matching logic scores correctly; integration: simulate cancellation triggers scan, matches entry; test hold expiration auto-cancels.

## Subtasks

### 4.1. Set up Sidekiq WaitlistAutoFillWorker

**Status:** pending  
**Dependencies:** None  

Create the Sidekiq worker class with cron scheduling every 5 minutes and triggered enqueueing on cancellations.

**Details:**

Generate worker using `rails generate sidekiq:job waitlist_auto_fill`; include Sidekiq::Worker; add sidekiq_cron for 5min schedule; implement perform method skeleton; configure retry: 3, queue: 'waitlist'.

### 4.2. Implement open slots query logic

**Status:** pending  
**Dependencies:** 4.1  

Develop SQL query to find available slots by subtracting time blocks and existing appointments from provider/location availability.

**Details:**

Write service method: JOIN providers_availability with time_blocks and appointments on provider_id/location_id/time ranges; use date ranges for current day/week; apply WHERE not overlapping blocks/appointments; limit to configurable look-ahead window.

### 4.3. Build priority matching and scoring

**Status:** pending  
**Dependencies:** 4.1, 4.2  

Create matching logic using weighted SQL ORDER BY on provider/location/service_type/preferred_days/priority_score for waitlist entries.

**Details:**

Query waitlist entries with pending status; compute score: (provider_match*0.4 + location_match*0.3 + type_match*0.2 + days_match*0.1); ORDER BY score DESC LIMIT slots_count; handle one-to-one matching.

### 4.4. Handle hold creation, status transition, and audits

**Status:** pending  
**Dependencies:** 4.1, 4.2, 4.3  

Create hold records, update waitlist to 'matched', schedule expiration after hold_window, log audits without PHI.

**Details:**

Use transactions for atomicity; create holds table with slot_id/waitlist_id/hold_until; enqueue expiration job; update status; audit log: {waitlist_id, slot_id, matched_at, provider_id} excluding PHI; race condition: advisory locks on slots.
