# E2E Testing with Playwright

Comprehensive end-to-end testing suite for the DermApp EHR system using Playwright.

## Overview

This testing suite covers all critical user flows including:
- Authentication and session management
- Patient management (CRUD operations)
- Appointment scheduling and management
- Clinical workflows (encounters, vitals, diagnoses)
- Admin functions (user management, settings, audit logs)

## Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Running backend server (port 4000)
- Running frontend server (port 5173)

### Installation

```bash
# Install Playwright and dependencies
npm run playwright:install

# Or manually
npx playwright install --with-deps
```

## Running Tests

### Quick Start

```bash
# Run all E2E tests (Chromium only)
npm run test:e2e

# Run with UI mode for debugging
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Debug specific test
npm run test:e2e:debug
```

### Run Specific Test Suites

```bash
# Authentication tests
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

### Run Across Different Browsers

```bash
# All browsers (Chromium, Firefox, WebKit)
npm run test:e2e:all

# Specific browser
npm run test:e2e:chrome
npm run test:e2e:firefox
npm run test:e2e:webkit

# Mobile devices
npm run test:e2e:mobile
```

### CI/CD

```bash
# Run all tests suitable for CI
npm run test:ci
```

## Test Structure

```
e2e/
├── fixtures/
│   ├── auth.fixture.ts      # Authentication fixture for authenticated tests
│   └── testData.ts           # Test data and credentials
├── pages/
│   ├── BasePage.ts           # Base page object class
│   ├── LoginPage.ts          # Login page object
│   ├── HomePage.ts           # Home/dashboard page object
│   ├── PatientsPage.ts       # Patient list page object
│   ├── NewPatientPage.ts     # New patient form page object
│   ├── PatientDetailPage.ts  # Patient detail page object
│   ├── SchedulePage.ts       # Schedule/calendar page object
│   ├── AppointmentPage.ts    # Appointment form page object
│   ├── EncounterPage.ts      # Clinical encounter page object
│   └── AdminPage.ts          # Admin page object
├── tests/
│   ├── auth-comprehensive.spec.ts        # Authentication tests
│   ├── patient-management.spec.ts        # Patient CRUD tests
│   ├── appointments.spec.ts              # Appointment tests
│   ├── clinical-workflows.spec.ts        # Clinical workflow tests
│   └── admin.spec.ts                     # Admin function tests
└── playwright.config.ts      # Playwright configuration
```

## Page Object Model

This test suite uses the Page Object Model (POM) pattern for better maintainability:

- **BasePage**: Common methods used across all pages
- **Page Objects**: Encapsulate page-specific logic and selectors
- **Test Files**: Focus on test scenarios, not implementation details

### Example Usage

```typescript
import { test } from '../fixtures/auth.fixture';
import { PatientsPage } from '../pages/PatientsPage';

test('should create new patient', async ({ authenticatedPage }) => {
  const patientsPage = new PatientsPage(authenticatedPage);
  await patientsPage.goto();
  await patientsPage.clickNewPatient();
  // ... test logic
});
```

## Test Data

Test data is centralized in `fixtures/testData.ts`:

```typescript
import { TEST_USERS, TEST_PATIENT, generateUniquePatient } from '../fixtures/testData';

// Use predefined test users
await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);

// Generate unique patient data
const patient = generateUniquePatient();
```

## Authentication Fixture

The `auth.fixture.ts` provides an authenticated session for tests that don't need to test login:

```typescript
import { test } from '../fixtures/auth.fixture';

test('should access patients page', async ({ authenticatedPage }) => {
  // Already logged in!
  await authenticatedPage.goto('/patients');
});
```

## Best Practices

### 1. Use Page Objects

Always interact with pages through page objects, not direct selectors:

```typescript
// Good
await patientsPage.clickNewPatient();

// Bad
await page.click('button#new-patient');
```

### 2. Wait for Stability

Use proper waits instead of arbitrary timeouts:

```typescript
// Good
await page.waitForLoadState('networkidle');
await expect(element).toBeVisible();

// Bad
await page.waitForTimeout(2000);
```

### 3. Unique Test Data

Generate unique data to avoid conflicts:

```typescript
const patient = generateUniquePatient(); // Has unique email and name
```

### 4. Clean Up

Tests should be independent and not rely on previous test state.

### 5. Assertions

Use meaningful assertions with proper timeout:

```typescript
await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
```

## Debugging

### UI Mode

```bash
npm run test:e2e:ui
```

This opens Playwright's UI where you can:
- Step through tests
- See screenshots and videos
- Time travel through test execution
- Debug failed tests

### Debug Mode

```bash
npm run test:e2e:debug
```

Opens Playwright Inspector for step-by-step debugging.

### Codegen

Record browser interactions to generate test code:

```bash
npm run playwright:codegen
```

## Reports

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

Reports include:
- Test results summary
- Failed test screenshots
- Test videos (for failures)
- Execution traces

## Configuration

Key configuration options in `playwright.config.ts`:

- **baseURL**: Frontend application URL (default: http://localhost:5173)
- **timeout**: Test timeout (default: 60s)
- **retries**: Number of retries on failure (2 in CI, 0 in dev)
- **workers**: Parallel test execution (4 in dev, 1 in CI)
- **screenshot/video**: Captured only on failure

### Environment Variables

```bash
# Use custom base URL
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

# Skip starting dev server (if already running)
SKIP_SERVER=true npm run test:e2e

# Run in CI mode
CI=true npm run test:e2e
```

## Troubleshooting

### Tests Failing Locally

1. Ensure both backend and frontend are running
2. Check console for errors
3. Run in headed mode to see what's happening
4. Check test data is valid

### Timeouts

If tests are timing out:
1. Increase timeout in playwright.config.ts
2. Check network conditions
3. Look for slow API responses

### Flaky Tests

If tests are flaky:
1. Add proper waits (avoid hardcoded timeouts)
2. Use `waitForLoadState('networkidle')`
3. Check for race conditions
4. Add retries for specific tests

### Authentication Issues

If auth tests fail:
1. Verify test credentials in testData.ts
2. Check backend is seeded with test users
3. Verify JWT tokens are being properly stored

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npm run playwright:install
      - name: Run backend
        run: npm run dev --prefix backend &
      - name: Run frontend
        run: npm run dev --prefix frontend &
      - name: Wait for servers
        run: npx wait-on http://localhost:4000 http://localhost:5173
      - name: Run E2E tests
        run: npm run test:ci
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Contributing

When adding new tests:

1. Follow the existing page object pattern
2. Add new page objects for new pages
3. Use the auth fixture for authenticated tests
4. Generate unique test data
5. Add proper assertions with timeouts
6. Document any new test utilities

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
