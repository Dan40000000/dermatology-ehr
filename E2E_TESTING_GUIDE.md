# E2E Testing Quick Start Guide

This guide will help you quickly get started with running the comprehensive E2E tests for DermApp.

## Prerequisites

Before running E2E tests, ensure:

1. Node.js 20+ is installed
2. All dependencies are installed: `npm install`
3. Backend server is running on port 4000
4. Frontend server is running on port 5173

## Quick Commands

### Run All Tests (Recommended)

```bash
# Run comprehensive E2E tests in Chromium (fastest)
npm run test:e2e
```

### Run with Visual Feedback

```bash
# See tests running in browser
npm run test:e2e:headed

# Interactive UI mode (best for debugging)
npm run test:e2e:ui
```

### Run Specific Test Suites

```bash
# Authentication tests only
npm run test:e2e:auth

# Patient management tests
npm run test:e2e:patients

# Appointment tests
npm run test:e2e:appointments

# Clinical workflow tests
npm run test:e2e:clinical

# Admin functions tests
npm run test:e2e:admin
```

### Cross-Browser Testing

```bash
# Test across all browsers (takes longer)
npm run test:e2e:all

# Test on mobile devices
npm run test:e2e:mobile
```

## What Gets Tested

### Authentication (30+ tests)
- Login page display and validation
- Invalid login attempts with various scenarios
- Successful login with different user roles
- Session persistence across page reloads
- Session sharing across browser tabs
- Logout functionality
- Security measures (password masking, redirect protection)

### Patient Management (25+ tests)
- Patient list display and loading
- Search and filter functionality
- Create new patient with validation
- Required vs optional fields
- Email and phone validation
- View patient details
- Navigate patient tabs
- Edit patient information

### Appointments (20+ tests)
- Calendar view (day/week/month)
- Navigation between dates
- Create new appointment
- Required field validation
- Check-in patient
- Reschedule appointment
- Cancel appointment
- Mark as no-show
- Filter by provider and type

### Clinical Workflows (20+ tests)
- Start new encounter
- Add vitals with validation
- Add diagnosis with ICD codes
- Create comprehensive clinical notes
- HPI, ROS, Exam, Assessment, Plan sections
- Use note templates
- Save as draft
- Sign and finalize encounter
- Lock encounter (prevent editing)

### Admin Functions (15+ tests)
- Access admin page
- User management
- Add new users
- View user list with roles
- Settings management
- Audit log access and filtering
- Reports generation

## Test Results

After running tests, you'll see:

1. **Console Output**: Real-time test progress
2. **HTML Report**: Detailed results with screenshots
3. **Test Artifacts**: Videos and traces for failed tests

View the HTML report:
```bash
npm run test:e2e:report
```

## Troubleshooting

### "Cannot connect to server"
- Ensure backend is running: `npm run dev --prefix backend`
- Ensure frontend is running: `npm run dev --prefix frontend`

### "Tests timing out"
- Check server logs for errors
- Verify database is accessible
- Run with `--headed` to see what's happening

### "Authentication failing"
- Verify test credentials exist in database
- Check that demo user (admin@demo.com / demo123) is seeded
- Review backend auth logs

### "Flaky tests"
- Run again - some network latency can cause intermittent failures
- Check test data conflicts (multiple test runs)
- Review test-results folder for details

## Development Workflow

### Before Committing Code

```bash
# Run full test suite
npm run test:all
```

This runs:
1. Backend unit tests
2. Frontend unit tests
3. E2E tests

### Writing New Tests

1. Add page objects to `e2e/pages/`
2. Add test data to `e2e/fixtures/testData.ts`
3. Write tests in `e2e/tests/`
4. Follow existing patterns

### Debugging Failed Tests

```bash
# Use UI mode for best debugging experience
npm run test:e2e:ui

# Or debug mode for step-by-step
npm run test:e2e:debug
```

## CI/CD

Tests run automatically in CI:

```bash
npm run test:ci
```

This:
- Runs in headless mode
- Retries failed tests twice
- Generates reports
- Uploads artifacts

## Need Help?

1. Check `e2e/README.md` for detailed documentation
2. Review existing tests in `e2e/tests/`
3. Check Playwright docs: https://playwright.dev
4. Look at test artifacts in `test-results/`

## Test Coverage Summary

Total Test Scenarios: **110+**

- Authentication: 30 scenarios
- Patient Management: 25 scenarios
- Appointments: 20 scenarios
- Clinical Workflows: 20 scenarios
- Admin Functions: 15 scenarios

All critical user journeys are covered with positive, negative, and edge case testing.
