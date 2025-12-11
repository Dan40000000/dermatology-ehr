# Testing Documentation

**Dermatology EHR System - Comprehensive Testing Guide**

Last Updated: 2025-12-08

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Running Tests](#running-tests)
3. [Test Types](#test-types)
4. [Coverage Requirements](#coverage-requirements)
5. [Writing Tests](#writing-tests)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## Testing Strategy

### Testing Pyramid

```
           /\
          /  \        E2E Tests (10%)
         /____\       - Critical user journeys
        /      \      - Cross-browser testing
       /________\     Integration Tests (20%)
      /          \    - API workflows
     /____________\   - Database integration
    /              \  Unit Tests (70%)
   /________________\ - Components, functions
                      - Business logic
```

### Goals

- **Coverage:** Minimum 70% code coverage
- **Quality:** All critical paths tested
- **Speed:** Unit tests < 5 seconds, E2E < 5 minutes
- **Reliability:** < 1% flaky tests
- **Accessibility:** WCAG 2.1 AA compliance

---

## Running Tests

### All Tests

```bash
# Run all tests (backend + frontend + E2E)
npm run test:all

# Run with coverage
npm run test -- --coverage
```

### Backend Tests (Jest)

```bash
cd backend

# Run all tests
npm test

# Watch mode (for development)
npm run test:watch

# Coverage report
npm run test:coverage

# CI mode (for continuous integration)
npm run test:ci
```

### Frontend Tests (Vitest)

```bash
cd frontend

# Run all tests
npm test

# Watch mode with UI
npm run test:ui

# Coverage report
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run E2E tests
npm run test:e2e

# Run with UI mode
npm run test:e2e:ui

# Run specific browser
npx playwright test --project=chromium

# Run specific test file
npx playwright test e2e/tests/auth.spec.ts

# Debug mode
npx playwright test --debug
```

### Performance Tests

```bash
cd backend

# Run load test on health endpoint
node performance/load-test.js /health

# Test authenticated endpoint (provide JWT token)
node performance/load-test.js /api/patients YOUR_JWT_TOKEN

# Custom configuration
# Edit performance/load-test.js to adjust parameters
```

---

## Test Types

### 1. Unit Tests

**Purpose:** Test individual functions and components in isolation

**Location:**
- Backend: `/backend/src/**/__tests__/*.test.ts`
- Frontend: `/frontend/src/**/__tests__/*.test.tsx`

**Examples:**

**Backend Unit Test:**
```typescript
// backend/src/utils/__tests__/fileUpload.test.ts
describe('validateFile', () => {
  it('should reject files exceeding max size', () => {
    const mockFile = {
      size: MAX_FILE_SIZE + 1,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const result = validateFile(mockFile);
    expect(result.valid).toBe(false);
  });
});
```

**Frontend Unit Test:**
```typescript
// frontend/src/components/ui/__tests__/Button.test.tsx
describe('Button Component', () => {
  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### 2. Integration Tests

**Purpose:** Test interaction between multiple components/modules

**Location:** `/backend/src/__tests__/integration/`

**Example:**
```typescript
// backend/src/__tests__/integration/patient-workflow.test.ts
describe('Patient Workflow', () => {
  it('should create patient and schedule appointment', async () => {
    // Create patient
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send(patientData);

    // Schedule appointment for patient
    const appointmentRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: patientRes.body.id,
        ...appointmentData
      });

    expect(appointmentRes.status).toBe(201);
  });
});
```

### 3. E2E Tests (End-to-End)

**Purpose:** Test complete user workflows across the entire application

**Location:** `/e2e/tests/`

**Scenarios:**
- `auth.spec.ts` - Login, logout, session management
- `patients.spec.ts` - Patient CRUD operations
- `appointments.spec.ts` - Appointment scheduling
- `accessibility.spec.ts` - WCAG compliance

**Example:**
```typescript
// e2e/tests/patients.spec.ts
test('should create new patient', async ({ page }) => {
  await page.goto('/patients');
  await page.click('text=New Patient');
  await page.fill('input[name="firstName"]', 'John');
  await page.fill('input[name="lastName"]', 'Doe');
  await page.click('button:has-text("Save")');
  await expect(page.locator('text=Patient created')).toBeVisible();
});
```

### 4. Accessibility Tests

**Purpose:** Ensure WCAG 2.1 AA compliance

**Tool:** axe-core with Playwright

**Location:** `/e2e/tests/accessibility.spec.ts`

**Example:**
```typescript
test('dashboard should be accessible', async ({ page }) => {
  await page.goto('/dashboard');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

### 5. Performance Tests

**Purpose:** Measure response times and throughput under load

**Tool:** Autocannon

**Location:** `/backend/performance/`

**Metrics:**
- P50 Latency: < 100ms
- P95 Latency: < 500ms
- P99 Latency: < 1000ms
- Throughput: > 100 req/s

---

## Coverage Requirements

### Minimum Coverage Thresholds

| Metric | Backend | Frontend |
|--------|---------|----------|
| Lines | 70% | 70% |
| Functions | 70% | 70% |
| Branches | 70% | 70% |
| Statements | 70% | 70% |

### Coverage Reports

**Backend (Jest):**
```bash
cd backend && npm run test:coverage
# Report: backend/coverage/index.html
```

**Frontend (Vitest):**
```bash
cd frontend && npm run test:coverage
# Report: frontend/coverage/index.html
```

### Viewing Reports

```bash
# Backend
open backend/coverage/index.html

# Frontend
open frontend/coverage/index.html
```

### Excluded from Coverage

- Type definition files (`*.d.ts`)
- Configuration files (`*.config.*`)
- Migration scripts
- Seed data
- Main entry point (`index.ts`)
- Mock data

---

## Writing Tests

### Best Practices

1. **Follow AAA Pattern**
   - **Arrange:** Set up test data
   - **Act:** Execute the code under test
   - **Assert:** Verify the results

2. **Test One Thing**
   - Each test should verify one specific behavior
   - Use descriptive test names

3. **Use Meaningful Names**
   ```typescript
   // Good
   it('should reject invalid email addresses')

   // Bad
   it('test1')
   ```

4. **Avoid Test Interdependence**
   - Tests should run independently
   - Use `beforeEach` for setup, `afterEach` for cleanup

5. **Mock External Dependencies**
   - Database calls
   - API requests
   - File system operations

### Backend Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  let testData: any;

  beforeEach(() => {
    // Setup
    testData = { /* ... */ };
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', () => {
    // Arrange
    const input = testData.validInput;

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expectedValue);
  });

  it('should handle error case', () => {
    const invalidInput = testData.invalidInput;

    expect(() => {
      functionUnderTest(invalidInput);
    }).toThrow('Expected error message');
  });
});
```

### Frontend Test Template

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  it('should render with props', () => {
    render(<ComponentName prop="value" />);
    expect(screen.getByText('expected text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<ComponentName onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and setup
    await page.goto('/feature-page');
  });

  test('should complete user flow', async ({ page }) => {
    // Act
    await page.click('text=Button');
    await page.fill('input[name="field"]', 'value');
    await page.click('button:has-text("Submit")');

    // Assert
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci
          npm ci

      - name: Run backend tests
        run: cd backend && npm run test:ci

      - name: Run frontend tests
        run: cd frontend && npm run test:coverage

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```bash
# Install husky
npm install --save-dev husky

# Setup pre-commit hook
npx husky install
npx husky add .git/hooks/pre-commit "npm test"
```

---

## Troubleshooting

### Common Issues

**1. Tests fail with "Cannot find module"**

```bash
# Solution: Clear Jest cache
cd backend
npx jest --clearCache

# Or: Clear Vitest cache
cd frontend
rm -rf node_modules/.vitest
```

**2. E2E tests timeout**

```bash
# Solution: Increase timeout in playwright.config.ts
use: {
  timeout: 60000, // 60 seconds
}
```

**3. Database connection errors in tests**

```bash
# Solution: Check test database setup
# Ensure DATABASE_URL is set for test environment
export DATABASE_URL="postgresql://localhost/derm_test"
```

**4. Frontend tests fail with "document is not defined"**

```bash
# Solution: Ensure jsdom is set in vitest.config.ts
test: {
  environment: 'jsdom',
}
```

**5. Coverage below threshold**

```bash
# Solution: Identify uncovered code
cd backend && npm run test:coverage
# Open coverage/index.html
# Add tests for red/yellow highlighted code
```

### Debug Mode

**Jest (Backend):**
```bash
cd backend
node --inspect-brk node_modules/.bin/jest --runInBand
```

**Vitest (Frontend):**
```bash
cd frontend
npm run test:ui
# Use browser DevTools for debugging
```

**Playwright (E2E):**
```bash
npx playwright test --debug
# Use Playwright Inspector
```

---

## Test Data Management

### Fixtures

```typescript
// backend/src/__tests__/fixtures/patients.ts
export const validPatient = {
  firstName: 'John',
  lastName: 'Doe',
  dob: '1990-01-01',
  email: 'john.doe@example.com',
};

export const invalidPatient = {
  firstName: '', // Missing required field
};
```

### Mock Data

```typescript
// frontend/src/test/mocks/api.ts
export const mockPatients = [
  { id: '1', firstName: 'John', lastName: 'Doe' },
  { id: '2', firstName: 'Jane', lastName: 'Smith' },
];
```

---

## Continuous Improvement

### Review Metrics

- **Test Coverage:** Track over time
- **Test Execution Time:** Optimize slow tests
- **Flaky Tests:** Identify and fix
- **Bug Escape Rate:** Tests missed in production

### Regular Tasks

- **Weekly:** Review failed tests
- **Monthly:** Update test data
- **Quarterly:** Review coverage targets
- **Annually:** Audit test strategy

---

## Resources

### Documentation

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)

### Best Practices

- [Testing Best Practices by Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

---

## Contact

**Questions about testing?** Contact the development team.

**Report flaky tests:** Create an issue with `[FLAKY]` label

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-08 | Initial testing infrastructure |

---

**Last Updated:** 2025-12-08
**Next Review:** 2026-03-08
