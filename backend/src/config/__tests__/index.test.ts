const originalEnv = process.env;

const loadConfig = () => {
  let mod: typeof import('../index');
  jest.isolateModules(() => {
    mod = require('../index');
  });
  return mod!.config;
};

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('config validation', () => {
  it('throws when required env vars are missing in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = '';
    process.env.DATABASE_URL = '';
    process.env.JWT_SECRET = '';
    process.env.CSRF_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.SENTRY_DSN = 'https://example.com/123';
    process.env.STORAGE_PROVIDER = 'local';

    expect(() => loadConfig()).toThrow(/Missing required environment variable/);
  });

  it('loads defaults in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_PASSWORD = 'test-db-pass';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.PORT = '';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const config = loadConfig();

    expect(config.env).toBe('development');
    expect(config.isDevelopment).toBe(true);
    expect(config.port).toBe(4000);
    expect(config.database.host).toBe('localhost');

    logSpy.mockRestore();
  });

  it('throws in production when s3 bucket is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'test-db-pass';
    process.env.DB_SSL_ENABLED = 'true';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.CSRF_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.ENCRYPTION_KEY = 'x'.repeat(32);
    process.env.PHI_ENCRYPTION_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://example.com/123';
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = '';

    expect(() => loadConfig()).toThrow(/AWS_S3_BUCKET/);
  });

  it('warns when https api url uses disabled ssl', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'test-db-pass';
    process.env.DB_SSL_ENABLED = 'true';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.CSRF_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.ENCRYPTION_KEY = 'x'.repeat(32);
    process.env.PHI_ENCRYPTION_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://example.com/123';
    process.env.STORAGE_PROVIDER = 'local';
    process.env.API_URL = 'https://example.com';
    process.env.SSL_ENABLED = 'false';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = loadConfig();

    expect(config.apiUrl).toBe('https://example.com');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('does not throw when SENTRY_DSN is missing in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'test-db-pass';
    process.env.DB_SSL_ENABLED = 'true';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.CSRF_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.ENCRYPTION_KEY = 'x'.repeat(32);
    process.env.PHI_ENCRYPTION_ENABLED = 'true';
    process.env.SENTRY_DSN = '';
    process.env.STORAGE_PROVIDER = 'local';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => loadConfig()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'WARNING: SENTRY_DSN is not set in production; error forensics will be limited.'
    );

    warnSpy.mockRestore();
  });

  it('includes localhost origins in development even when CORS_ORIGIN is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = 'https://staging.dermapp.example';

    const config = loadConfig();

    expect(config.cors.origin).toContain('https://staging.dermapp.example');
    expect(config.cors.origin).toContain('http://localhost:5173');
    expect(config.cors.origin).toContain('http://localhost:5174');
    expect(config.cors.origin).toContain('http://localhost:5175');
  });

  it('deduplicates CORS origins after merge', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = 'https://staging.dermapp.example,http://localhost:5173';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    const config = loadConfig();
    const originSet = new Set(config.cors.origin);

    expect(config.cors.origin.length).toBe(originSet.size);
    expect(config.cors.origin.filter((origin) => origin === 'http://localhost:5173')).toHaveLength(1);
  });
});
