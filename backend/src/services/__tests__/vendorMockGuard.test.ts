import { assertSyntheticVendorMockAllowed, assertVendorBaaEnabled } from '../vendorMockGuard';

const originalEnv = process.env;

describe('vendorMockGuard', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEPLOYMENT_ENV;
    delete process.env.APP_ENV;
    delete process.env.RAILWAY_ENVIRONMENT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows synthetic adapters outside production', () => {
    process.env.NODE_ENV = 'test';
    expect(() => assertSyntheticVendorMockAllowed('Test workflow')).not.toThrow();
  });

  it('blocks synthetic adapters in production even when the legacy override is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_VENDOR_MOCK_FALLBACKS = 'true';

    expect(() => assertSyntheticVendorMockAllowed('Test workflow')).toThrow(
      /mock adapter is disabled in production/i
    );
  });

  it('requires an explicit vendor BAA attestation in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TEST_VENDOR_BAA_ENABLED;

    expect(() => assertVendorBaaEnabled('Test vendor', 'TEST_VENDOR_BAA_ENABLED')).toThrow(
      /effective vendor BAA/i
    );

    process.env.TEST_VENDOR_BAA_ENABLED = 'true';
    expect(() => assertVendorBaaEnabled('Test vendor', 'TEST_VENDOR_BAA_ENABLED')).not.toThrow();
  });
});
