# Smoke Test Checklist
## Dermatology EHR System - Post-Deployment Verification

**Purpose:** Quick verification that critical functionality works after deployment or bug fixes
**Duration:** 30-45 minutes
**Frequency:** After every deployment, after critical bug fixes, after major updates

---

## Pre-Test Setup

### Prerequisites
- [ ] Application deployed and running
- [ ] Database migrations completed
- [ ] Test user accounts created
- [ ] Sample test data available (or create during test)
- [ ] Browser/environment ready

### Test Credentials

**Use these test accounts (CHANGE in production):**
- Admin: admin@demo.practice / Password123!
- Provider: provider@demo.practice / Password123!
- MA: ma@demo.practice / Password123!
- Front Desk: frontdesk@demo.practice / Password123!

**Tenant ID:** tenant-demo

---

## 1. System Health Checks (5 min)

### Backend Health
- [ ] Navigate to `http://localhost:4000/health` (or production URL)
- [ ] **Expected:** JSON response with `{"status":"ok"}`
- [ ] **Pass Criteria:** 200 status code, no errors

### Frontend Loading
- [ ] Navigate to `http://localhost:5173` (or production URL)
- [ ] **Expected:** Login page loads
- [ ] **Pass Criteria:** No error overlay, no console errors

### Database Connection
- [ ] Backend logs show successful database connection
- [ ] No database connection errors in logs

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 2. Authentication & Authorization (5 min)

### Login
- [ ] Navigate to login page
- [ ] Enter credentials: admin@demo.practice / Password123!
- [ ] Click "Sign In"
- [ ] **Expected:** Redirect to dashboard/home page
- [ ] **Pass Criteria:** Successful login, no errors

### Session Management
- [ ] Verify user name appears in header/navbar
- [ ] Check that proper role is displayed (Admin)
- [ ] **Pass Criteria:** User identity correct

### Logout
- [ ] Click logout/sign out
- [ ] **Expected:** Redirect to login page
- [ ] **Pass Criteria:** Cannot access protected pages

### Re-Login
- [ ] Log in again as Provider: provider@demo.practice / Password123!
- [ ] **Expected:** Successful login
- [ ] **Pass Criteria:** Different role (Provider) displayed

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 3. Patient Management (5 min)

### View Patient List
- [ ] Navigate to Patients page
- [ ] **Expected:** Patient list loads (may be empty)
- [ ] **Pass Criteria:** No errors, page renders

### Create New Patient
- [ ] Click "New Patient" or similar button
- [ ] Fill in required fields:
  - First Name: Test
  - Last Name: Patient
  - DOB: 01/01/1990
  - Email: test.patient@example.com
  - Phone: 555-1234
- [ ] Click "Save" or "Create"
- [ ] **Expected:** Success message, patient created
- [ ] **Pass Criteria:** Patient appears in list

### View Patient Detail
- [ ] Click on newly created patient
- [ ] **Expected:** Patient detail page loads
- [ ] **Pass Criteria:** Correct information displayed

### Search Patient
- [ ] Use search box to find "Test Patient"
- [ ] **Expected:** Patient appears in results
- [ ] **Pass Criteria:** Search works

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**
**Patient ID Created:**

---

## 4. Appointment Scheduling (5 min)

### View Schedule
- [ ] Navigate to Schedule page
- [ ] **Expected:** Calendar view loads
- [ ] **Pass Criteria:** Current date visible, no errors

### Create Appointment
- [ ] Click on a time slot or "New Appointment"
- [ ] Select patient: Test Patient (from previous step)
- [ ] Select provider
- [ ] Select appointment type (e.g., "Follow-up")
- [ ] Select date/time (e.g., tomorrow at 10:00 AM)
- [ ] Click "Save" or "Schedule"
- [ ] **Expected:** Appointment created, appears on calendar
- [ ] **Pass Criteria:** Appointment visible

### View Appointment Details
- [ ] Click on newly created appointment
- [ ] **Expected:** Appointment details modal/page opens
- [ ] **Pass Criteria:** Correct information shown

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**
**Appointment ID Created:**

---

## 5. Clinical Documentation (5 min)

### Create Encounter
- [ ] Navigate to Patients > [Test Patient] > Encounters
- [ ] Or go to Encounters page and select patient
- [ ] Click "New Encounter" or "Start Visit"
- [ ] **Expected:** Encounter form opens
- [ ] **Pass Criteria:** Form renders

### Complete Basic SOAP Note
- [ ] **Chief Complaint:** "Rash on arm"
- [ ] **HPI:** "Started 2 days ago, itchy"
- [ ] **Assessment:** "Contact dermatitis"
- [ ] **Plan:** "Apply hydrocortisone cream"
- [ ] Click "Save" or "Sign"
- [ ] **Expected:** Note saved successfully
- [ ] **Pass Criteria:** Success message, note in history

### View Note History
- [ ] Navigate to Notes page or patient notes
- [ ] **Expected:** New note appears in list
- [ ] **Pass Criteria:** Note accessible

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**
**Encounter ID Created:**

---

## 6. Prescriptions (5 min)

### Create Prescription
- [ ] Navigate to Prescriptions page or within encounter
- [ ] Click "New Prescription"
- [ ] **Patient:** Test Patient
- [ ] **Medication:** Select any medication (e.g., "Hydrocortisone Cream 1%")
- [ ] **Directions:** "Apply to affected area twice daily"
- [ ] **Quantity:** 30g
- [ ] **Refills:** 2
- [ ] Click "Save" (don't e-prescribe in smoke test)
- [ ] **Expected:** Prescription created
- [ ] **Pass Criteria:** Appears in prescription list

### View Prescription List
- [ ] Navigate to Prescriptions page
- [ ] Filter by patient if needed
- [ ] **Expected:** New prescription visible
- [ ] **Pass Criteria:** Correct information displayed

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 7. Lab Orders (Optional - 3 min)

### Create Lab Order
- [ ] Navigate to Labs or Orders page
- [ ] Click "New Lab Order"
- [ ] **Patient:** Test Patient
- [ ] Select a lab test (e.g., "CBC")
- [ ] Click "Order" or "Save"
- [ ] **Expected:** Lab order created
- [ ] **Pass Criteria:** Order appears in list

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning / ⏭️ Skipped
**Notes:**

---

## 8. Communication Features (5 min)

### Internal Messaging
- [ ] Navigate to Mail or Messages page
- [ ] Click "New Message"
- [ ] **To:** Select another user (e.g., admin)
- [ ] **Subject:** "Test Message"
- [ ] **Body:** "This is a smoke test message"
- [ ] Click "Send"
- [ ] **Expected:** Message sent successfully
- [ ] **Pass Criteria:** Message in sent folder

### SMS (If configured)
- [ ] Navigate to Text Messages page
- [ ] **Expected:** Page loads
- [ ] **Pass Criteria:** No errors (don't send actual SMS in smoke test)

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 9. Patient Portal (Optional - 5 min)

### Portal Access
- [ ] Open patient portal URL (different from staff app)
- [ ] Or navigate to Kiosk mode
- [ ] **Expected:** Patient login page or check-in screen
- [ ] **Pass Criteria:** Page loads

### Portal Login (If patient account exists)
- [ ] Login with test patient credentials
- [ ] **Expected:** Portal dashboard loads
- [ ] **Pass Criteria:** Patient can access their information

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning / ⏭️ Skipped
**Notes:**

---

## 10. Administrative Features (3 min)

### Dashboard/Analytics
- [ ] Navigate to Home or Dashboard
- [ ] **Expected:** Statistics and charts load
- [ ] **Pass Criteria:** No errors, data displays

### Audit Log
- [ ] Navigate to Audit Log page (Admin only)
- [ ] **Expected:** Recent activities shown
- [ ] **Pass Criteria:** Login events visible

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 11. Error Handling (3 min)

### Network Resilience
- [ ] Pause network (browser DevTools > Network > Offline)
- [ ] Try to navigate to a page
- [ ] **Expected:** Error message displayed (not blank screen)
- [ ] Re-enable network
- [ ] **Pass Criteria:** App recovers gracefully

### Invalid Data Handling
- [ ] Try to create patient with missing required field
- [ ] **Expected:** Validation error message
- [ ] **Pass Criteria:** Clear error, no crash

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Notes:**

---

## 12. Performance Check (2 min)

### Page Load Times
- [ ] Open browser DevTools > Network tab
- [ ] Refresh Dashboard/Home page
- [ ] Note load time
- [ ] **Expected:** < 3 seconds
- [ ] **Pass Criteria:** Acceptable performance

### Search Performance
- [ ] Search for patient with 1-2 characters
- [ ] Note response time
- [ ] **Expected:** < 1 second
- [ ] **Pass Criteria:** Quick response

**Status:** ✅ Pass / ❌ Fail / ⚠️ Warning
**Page Load Time:** ______ seconds
**Search Time:** ______ ms

---

## 13. Browser Compatibility (Optional - 5 min per browser)

### Primary Browser: Safari
- [ ] Run smoke test in Safari
- [ ] **Status:** ✅ Pass / ❌ Fail / ⏭️ Skipped

### Chrome
- [ ] Run smoke test in Chrome
- [ ] **Status:** ✅ Pass / ❌ Fail / ⏭️ Skipped

### Firefox
- [ ] Run smoke test in Firefox
- [ ] **Status:** ✅ Pass / ❌ Fail / ⏭️ Skipped

### Mobile Safari (iOS)
- [ ] Run smoke test on iPhone/iPad
- [ ] **Status:** ✅ Pass / ❌ Fail / ⏭️ Skipped

**Notes:**

---

## Final Checks

### Console Errors
- [ ] Open browser DevTools > Console
- [ ] Check for JavaScript errors (red messages)
- [ ] **Pass Criteria:** No critical errors (warnings OK)

### Backend Logs
- [ ] Check backend error logs
- [ ] `tail -f backend/logs/error.log`
- [ ] **Pass Criteria:** No unexpected errors

### Database Integrity
- [ ] Verify test data was created correctly
- [ ] Check that foreign key relationships work
- [ ] **Pass Criteria:** No database errors

---

## Overall Results

### Summary
- **Total Tests:** ~13 categories
- **Passed:** _____ / 13
- **Failed:** _____ / 13
- **Warnings:** _____ / 13
- **Skipped:** _____ / 13

### Pass Criteria
- **Go/No-Go:** >= 11/13 passing (85%)
- **Critical Must Pass:**
  - System Health (section 1)
  - Authentication (section 2)
  - Patient Management (section 3)
  - Appointment Scheduling (section 4)

### Overall Status
- [ ] ✅ **PASS** - System ready for use
- [ ] ⚠️ **PASS WITH WARNINGS** - Usable but issues noted
- [ ] ❌ **FAIL** - Critical issues, do not deploy

---

## Issues Found During Smoke Test

| # | Section | Issue Description | Severity | Status |
|---|---------|------------------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Post-Test Cleanup (Optional)

### Delete Test Data
- [ ] Delete test patient "Test Patient"
- [ ] Delete test appointment
- [ ] Delete test encounter
- [ ] Delete test prescription
- [ ] Delete test message

**Or:**
- [ ] Keep test data for further testing
- [ ] Mark test data appropriately

---

## Sign-Off

### Test Execution
- **Tester Name:** _________________________
- **Test Date:** _________________________
- **Test Time:** _________________________
- **Environment:** □ Local Dev  □ Staging  □ Production
- **Browser:** _________________________
- **OS:** _________________________

### Test Results
- **Overall Result:** ✅ Pass / ⚠️ Pass with Warnings / ❌ Fail
- **Notes:**


### Approval (For Production)
- **Approved By:** _________________________
- **Date:** _________________________
- **Signature:** _________________________

---

## Appendix A: Quick Command Reference

### Start Application (Development)
```bash
# Backend
cd backend
npm run dev

# Frontend (new terminal)
cd frontend
npm run dev
```

### Check Logs
```bash
# Error log
tail -f backend/logs/error.log

# Combined log
tail -f backend/logs/combined.log

# Audit log
tail -f backend/logs/audit.log
```

### Database
```bash
# Run migrations
cd backend
npm run db:migrate

# Seed test data
npm run db:seed
```

### Health Check (API)
```bash
# Simple health check
curl http://localhost:4000/health

# Detailed health check
curl http://localhost:4000/api/health/detailed

# With auth (after logging in)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: tenant-demo" \
     http://localhost:4000/api/patients
```

---

## Appendix B: Troubleshooting

### Frontend Won't Load
1. Check browser console for errors
2. Verify backend is running: `curl http://localhost:4000/health`
3. Check for syntax errors in code
4. Clear browser cache
5. Restart frontend dev server

### Backend Won't Start
1. Check backend logs: `tail -f backend/logs/error.log`
2. Verify database is running: `psql -U derm_user -d derm_db`
3. Check for port conflicts: `lsof -i :4000`
4. Verify environment variables: `cat backend/.env`
5. Check middleware compatibility (see Bug #2)

### Cannot Login
1. Verify credentials match defaults
2. Check backend authentication endpoint
3. Check browser network tab for 401/403 errors
4. Verify JWT secret is set
5. Check database users table

### Database Errors
1. Verify migrations ran: `ls backend/migrations/*.sql`
2. Check PostgreSQL version: `psql --version`
3. Verify connection string in .env
4. Check database logs
5. Try re-running migrations

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-29 | Initial smoke test checklist |

---

**Checklist End**
**Keep this document updated as new critical features are added**
