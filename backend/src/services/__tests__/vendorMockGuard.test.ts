import { assertSyntheticVendorMockAllowed } from '../vendorMockGuard';

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
});
