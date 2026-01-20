# Front Desk Dashboard - Quick Start Guide

## Accessing the Dashboard

1. Log in to the EHR system
2. Navigate to `/front-desk` or click "Front Desk" in the navigation menu
3. The dashboard will load with today's data automatically

## Dashboard Overview

### Top Section - Daily Stats
At the top, you'll see 7 key metrics:
- **Scheduled Today** - Total appointments booked
- **Patients Seen** - Completed vs total
- **Currently Arrived** - Patients in waiting room
- **No-Shows** - Patients who didn't arrive
- **Collections Today** - Total payments collected
- **Open Slots** - Available appointment slots remaining
- **Avg Wait Time** - Average time from arrival to rooming

### Main Panel - Today's Schedule
The left side shows all of today's appointments with:
- **Time** - Scheduled appointment time
- **Patient Name** - Full name
- **Visit Type & Provider** - Type of visit and seeing which provider
- **Status Badge** - Current appointment status (color-coded)
- **Indicators**:
  - ✓ = Insurance verified
  - ⚠ = Insurance pending
  - Clock icon = Wait time (if > 15 minutes)
  - Dollar amount = Outstanding balance (if > $100)

### Right Panel - Waiting Room
Shows patients who have checked in but aren't in a room yet:
- Patient name and provider
- Wait time (color-coded: green < 15 min, orange 15-20 min, red > 20 min)
- "Move to Room" button

### Right Panel - Upcoming Alerts
Shows the next 3-5 patients scheduled to arrive:
- Time until arrival
- Any issues requiring attention (insurance, balance)
- Copay amount

## Common Tasks

### Checking In a Patient (Fast Method - 30 seconds)

**When patient arrives:**
1. Find patient in schedule
2. Click the **"Check In"** button
3. Done! Patient appears in waiting room

**OR use keyboard shortcut:** Press **C** to check in the first scheduled patient

### Checking In with Payment (Full Method - 60 seconds)

1. Find patient in schedule and click row to expand
2. Click **"Check In"** button (or click patient name for modal)
3. In the modal:
   - ✓ Check "Demographics Confirmed"
   - Review insurance status
   - Enter payment amount (or click "Use Copay")
   - Add notes if needed
4. Click **"Complete Check-In"**

### Moving Patient to Room

**From Waiting Room panel:**
1. Find patient in waiting room
2. Click **"Move to Room"** button

**OR from Today's Schedule:**
1. Click row to expand patient
2. Click **"Move to Room"** button

### Checking Out a Patient

1. Find patient in schedule (status will show "With Provider")
2. Click row to expand
3. Click **"Check Out"** button
4. In the modal:
   - Review today's charges
   - Collect payment if needed
   - Schedule follow-up if needed
   - Ensure "Print visit summary" is checked
   - Add check-out notes if needed
5. Click **"Complete Check-Out"**

## Status Meanings

Appointments progress through these statuses:
- **Scheduled** (gray) - Patient hasn't arrived yet
- **Arrived** (blue) - Patient checked in, waiting
- **In Room** (purple) - Patient in exam room
- **With Provider** (indigo) - Provider is seeing patient
- **Completed** (green) - Visit finished, checked out
- **Cancelled** (red) - Appointment cancelled
- **No Show** (orange) - Patient didn't arrive

## Color Coding System

### Green = Good
- Insurance verified
- Normal wait times (< 15 min)
- No issues

### Yellow/Orange = Attention
- Insurance pending verification
- Moderate wait times (15-20 min)
- Requires attention

### Red = Problem
- Outstanding balance over $100
- Long wait times (> 20 min)
- Critical issues

## Keyboard Shortcuts

For faster navigation:
- **R** - Refresh all data manually
- **N** - Next patient (opens check-in for first scheduled)
- **C** - Quick check-in (first scheduled patient)

## Filtering the Schedule

Use the dropdown filters at the top of the schedule:
- **Status** - Show only specific appointment statuses
- **Provider** - Show only specific provider's appointments

## Auto-Refresh

The dashboard automatically refreshes every 30 seconds to show the latest data. You can also click the **"Refresh"** button or press **R** at any time.

## Best Practices

### Morning Setup
1. Open the Front Desk Dashboard
2. Review today's schedule
3. Check for any insurance verification issues (⚠ icons)
4. Note patients with outstanding balances
5. Identify any issues in "Upcoming Alerts"

### During the Day
1. Keep dashboard open and visible
2. Watch for new arrivals
3. Monitor waiting room for long waits (> 15 min)
4. Check patients in as they arrive
5. Move patients to rooms promptly
6. Check patients out completely before they leave

### End of Day
1. Review "Patients Seen" stat
2. Check for any no-shows
3. Review "Collections Today"
4. Follow up on any pending items

## Troubleshooting

### "Dashboard not loading"
- Check internet connection
- Refresh the page (F5)
- Clear browser cache if needed
- Contact IT if problem persists

### "Patient not showing in schedule"
- Verify appointment was created for today
- Check if filters are hiding the appointment
- Try clicking "Refresh" button

### "Wait time not updating"
- Dashboard auto-refreshes every 30 seconds
- Click "Refresh" button for immediate update
- Check that patient was properly checked in

### "Can't check in patient"
- Verify you have front_desk or admin role
- Ensure patient appointment is "Scheduled" status
- Check for any error messages

### "Payment not saving"
- Ensure you entered a valid amount
- Check that check-in completed successfully
- Contact billing if payment doesn't appear

## Getting Help

### In-App Help
- Click the **"Help"** icon in the top navigation
- View keyboard shortcuts reminder (top-right of dashboard)

### Support
- Contact front office manager
- Submit IT ticket for technical issues
- Reference this guide for common questions

## Tips for Efficiency

1. **Use keyboard shortcuts** - Much faster than clicking
2. **Keep filters clear** - Unless you need to focus on specific patients
3. **Expand rows for details** - Quickly see all patient info without opening modals
4. **Watch the waiting room panel** - Address long waits promptly
5. **Review upcoming alerts** - Prepare for patients arriving soon
6. **Collect payments at check-in** - Easier than at check-out
7. **Use quick check-in** - For simple arrivals without payment
8. **Print visit summaries** - Keep checked by default
9. **Add notes** - For anything unusual or important
10. **Monitor stats** - Stay aware of the day's progress

## Example Scenarios

### Scenario 1: Normal Check-In
```
9:00 AM - John Smith arrives for 9:00 appointment
→ Find John in schedule
→ Click "Check In" button
→ John appears in waiting room
→ Done! (15 seconds)
```

### Scenario 2: Check-In with Copay
```
9:15 AM - Mary Johnson arrives, needs to pay $40 copay
→ Click on Mary's row to expand
→ Click "Check In"
→ Check demographics confirmed
→ Click "Use Copay" button ($40 auto-fills)
→ Click "Complete Check-In"
→ Payment recorded, Mary in waiting room
→ Done! (45 seconds)
```

### Scenario 3: Long Wait Alert
```
9:30 AM - Notice Bob Davis has been waiting 18 minutes (orange indicator)
→ Check waiting room panel
→ See Bob waiting 18 min
→ Click "Move to Room" immediately
→ Alert resolved
```

### Scenario 4: Check-Out with Follow-Up
```
10:00 AM - Sarah Wilson ready to check out
→ Click Sarah's expanded row
→ Click "Check Out"
→ Review charges: $150, patient owes $30
→ Enter $30 payment
→ Check "Schedule follow-up"
→ Select date: 4 weeks from now
→ Ensure "Print visit summary" checked
→ Click "Complete Check-Out"
→ Done! (60 seconds)
```

## Dashboard Layout Reference

```
┌─────────────────────────────────────────────────────────┐
│                 FRONT DESK DASHBOARD                    │
│              Last updated: 9:45:23 AM         [Refresh] │
├─────────────────────────────────────────────────────────┤
│  TODAY'S OVERVIEW (7 stat cards)                        │
│  [Scheduled] [Seen] [Arrived] [No-Shows] [Collections] │
│  [Open Slots] [Avg Wait]                               │
├─────────────────────────────────────────────────────────┤
│                                              │           │
│  TODAY'S SCHEDULE                           │  WAITING  │
│  ┌──────────────────────────────────┐      │   ROOM    │
│  │ [Filters: Status | Provider]     │      │           │
│  ├──────────────────────────────────┤      │  3 pts    │
│  │ 9:00 AM - John Smith        ✓   │      │  waiting  │
│  │ 9:15 AM - Mary Johnson      ⚠   │      │           │
│  │ 9:30 AM - Bob Davis    [18min]  │      ├───────────┤
│  │ 9:45 AM - Sarah Wilson      ✓   │      │           │
│  │ (Click row to expand)            │      │ UPCOMING  │
│  └──────────────────────────────────┘      │  ALERTS   │
│                                              │           │
│                                              │  Next 5   │
│                                              │  patients │
└─────────────────────────────────────────────────────────┘
```

---

**Remember:** This dashboard is designed for speed and efficiency. With practice, you'll be able to check in a patient in under 30 seconds!
