/**
 * Jest Test Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.PORT = '4001';
process.env.TENANT_HEADER = 'X-Tenant-Id';
process.env.LOG_LEVEL = 'error'; // Reduce noise in test output
