# End-to-End Integration Tests for Dermatology EHR Sprint Features

This directory contains comprehensive E2E integration tests for the five critical sprint features implemented in the Dermatology EHR system.

## Test Coverage

### 1. Time Blocks Flow (`timeBlocks.test.ts`)
Tests the complete time blocks feature including:
- Creating single and recurring time blocks
- Expanding recurrence patterns (daily, weekly, biweekly, monthly)
- Detecting scheduling conflicts with appointments
- Preventing overlapping time blocks
- Time block status management (active/cancelled)
- Tenant isolation for time blocks

**Key Test Scenarios:**
- Create non-recurring time block
- Create recurring time block with weekly pattern (Mon/Wed/Fri)
- Expand weekly, daily, and monthly recurrence patterns
- Detect conflicts when booking appointments during blocks
- Allow booking outside time blocks
- Verify tenant isolation

### 2. Waitlist Auto-Fill Flow (`waitlistAutoFill.test.ts`)
Tests the complete waitlist auto-fill feature including:
- Adding patients to waitlist with preferences
- Matching waitlist entries when appointments are cancelled
- Scoring algorithm with priority multipliers
- Creating and expiring holds
- Notification tracking
- Tenant isolation for waitlist

**Key Test Scenarios:**
- Add patient to waitlist with time/provider/location preferences
- Find perfect match when appointment cancelled
- Prioritize urgent patients over normal priority
- Reject mismatched appointment types
- Record notification when hold created
- Create hold with 24-hour expiration
- Expire old holds and return waitlist to active status
- Prevent duplicate active holds
- Verify tenant isolation

### 3. Prior Authorization Flow (`priorAuthorization.test.ts`)
Tests the complete prior authorization workflow using mock adapter:
- Creating prescriptions requiring PA
- Initiating PA requests with prescriber information
- Submitting PA through mock adapter
- Handling various response statuses (approved, submitted, needs_info, denied)
- Checking PA status
- Tenant isolation for PA requests

**Key Test Scenarios:**
- Create prescription with prior auth requirement
- Create PA request from prescription
- Submit PA through mock adapter
- Handle auto-approved response
- Handle needs_info response with required documents
- Handle denied response with appeal information
- Check status returns consistent results
- Track status check history
- Verify tenant isolation

### 4. Fax Flow (`fax.test.ts`)
Tests the complete fax workflow including:
- Sending outbound faxes through mock adapter
- Checking fax status updates
- Processing inbound fax webhooks
- Managing fax inbox
- Tenant isolation for faxes

**Key Test Scenarios:**
- Send fax through mock adapter
- Handle successful transmission
- Handle failed transmission with error message
- Check fax status
- Track status check timestamp
- Process inbound fax webhook
- Generate sample incoming fax
- List faxes in inbox
- Mark fax as read/unread
- Filter inbox by status
- Associate fax with patient
- Verify tenant isolation

### 5. Portal Pre-Check-In Flow (`portalPreCheckin.test.ts`)
Tests the complete patient portal pre-check-in workflow:
- Creating patient portal sessions
- Completing demographic updates
- Completing insurance verification
- Tracking check-in completion status
- Tenant isolation for portal sessions

**Key Test Scenarios:**
- Create portal session with token
- Validate session token and expiration
- Expire old sessions
- Update patient demographics through portal
- Record insurance information
- Handle patients without insurance
- Upload insurance card images
- Mark check-in as complete when all steps done
- Calculate check-in progress percentage
- Update appointment status after check-in
- Track time to complete check-in
- Verify tenant isolation

## Test Utilities (`helpers/testHelpers.ts`)

Common helper functions for test setup:
- `createTestTenant()` - Create isolated test tenant
- `createTestUser()` - Create test user with auth token
- `createTestPatient()` - Create test patient
- `createTestProvider()` - Create test provider
- `createTestLocation()` - Create test location
- `createTestAppointmentType()` - Create test appointment type
- `createTestAppointment()` - Create test appointment
- `createTestPrescription()` - Create test prescription
- `getAuthHeaders()` - Generate auth headers for API requests
- `cleanupTestTenant()` - Clean up all test data for tenant
- `waitForCondition()` - Polling helper for async operations
- `getFutureDate()` - Generate future dates for scheduling
- `createPatientPortalToken()` - Create JWT token for patient portal

## Running the Tests

### Run all E2E tests:
```bash
npm test -- --testPathPattern=e2e
```

### Run specific test suite:
```bash
# Time Blocks
npm test -- timeBlocks.test.ts

# Waitlist Auto-Fill
npm test -- waitlistAutoFill.test.ts

# Prior Authorization
npm test -- priorAuthorization.test.ts

# Fax
npm test -- fax.test.ts

# Portal Pre-Check-In
npm test -- portalPreCheckin.test.ts
```

### Run with coverage:
```bash
npm test -- --coverage --testPathPattern=e2e
```

### Run in watch mode:
```bash
npm test -- --watch --testPathPattern=e2e
```

## Test Architecture

### Mock Adapters
All tests use mock adapters that simulate external services without making real network calls:

- **MockPriorAuthAdapter**: Simulates prior authorization vendor API with randomized responses (40% approved, 30% submitted, 20% needs_info, 10% denied)
- **MockFaxAdapter**: Simulates fax service provider with 90% success rate and in-memory transmission tracking
- **Patient Portal**: Uses JWT tokens for session management

### Database Isolation
- Each test suite creates isolated tenants
- Test data is cleaned up in `afterAll()` hooks
- Tenant isolation is verified in dedicated test cases
- Tests use transactions where appropriate

### Test Data
- All test data uses UUIDs to avoid conflicts
- Dates are generated dynamically using `getFutureDate()`
- Patient/provider/location data uses realistic examples
- Tests create minimal required data for each scenario

## Tenant Isolation Testing

Each test suite includes dedicated tests to verify tenant isolation:

1. **Data Isolation**: Tenant A cannot query Tenant B's data
2. **Operation Isolation**: Operations on Tenant A's data don't affect Tenant B
3. **API Isolation**: API requests with Tenant A's credentials cannot access Tenant B's resources

### Tenant Isolation Patterns Tested:
- Database queries filtered by `tenant_id`
- Service methods respect tenant boundaries
- Hold/notification/status updates are tenant-scoped
- Portal sessions are tenant-specific

## CI/CD Integration

Tests are designed to run in CI environments:

- No external dependencies (all mocked)
- Deterministic test execution
- Proper cleanup prevents test pollution
- Tests are idempotent
- Suitable for parallel execution within tenant boundaries

### CI Command:
```bash
npm run test:ci
```

## Success Criteria

All tests must:
- ✅ Pass consistently in local and CI environments
- ✅ Demonstrate proper use of mock adapters
- ✅ Verify tenant isolation for all operations
- ✅ Clean up test data properly
- ✅ Complete within reasonable timeouts
- ✅ Cover happy path and error scenarios
- ✅ Test edge cases (expired sessions, conflicts, etc.)

## Database Schema Requirements

Tests assume the following tables exist:
- `tenants`
- `users`
- `patients`
- `providers`
- `locations`
- `appointment_types`
- `appointments`
- `time_blocks`
- `waitlist`
- `waitlist_holds`
- `prescriptions`
- `prior_auth_requests`
- `fax_inbox`
- `fax_outbox`
- `portal_checkin_sessions`
- `audit_logs`

See migration files in `/backend/src/db/migrations/` for complete schema.

## Environment Variables

Required for tests:
- `JWT_SECRET` - Set in test setup
- `TENANT_HEADER` - Set to 'X-Tenant-Id'
- `NODE_ENV` - Set to 'test'
- `LOG_LEVEL` - Set to 'error' to reduce noise

## Troubleshooting

### Tests failing with "relation does not exist"
Run migrations: `npm run db:migrate`

### Tests timing out
Increase test timeout in jest.config.js or specific test files

### Cleanup errors
Check that all foreign key relationships are handled in cleanup order

### Mock adapter issues
Verify that adapters are properly instantiated and don't make real network calls

## Next Steps

Future enhancements:
1. Add API-level tests using supertest
2. Add frontend E2E tests with Playwright
3. Add performance benchmarks
4. Add load testing for concurrent operations
5. Add integration with real vendor APIs (in separate test suite)
