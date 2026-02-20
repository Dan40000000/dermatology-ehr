import { generateReadinessReport } from '../stagingReadinessCheck';

describe('stagingReadinessCheck', () => {
  it('flags critical failures in insecure production-like configuration', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
        PHI_ENCRYPTION_ENABLED: 'false',
        DB_SSL_ENABLED: 'false',
        DATABASE_URL: 'postgres://demo:demo@localhost:5432/derm',
        CORS_ORIGIN: '*',
        JWT_SECRET: 'short',
        CSRF_SECRET: 'short',
        SESSION_SECRET: 'short',
        API_URL: 'http://api.example.com',
      },
      { skipDb: true }
    );

    expect(report.summary.fail).toBeGreaterThan(0);
    expect(report.checks.find((item) => item.id === 'crypto:phi')?.status).toBe('fail');
    expect(report.checks.find((item) => item.id === 'db:tls')?.status).toBe('fail');
    expect(report.checks.find((item) => item.id === 'cors:origins')?.status).toBe('fail');
  });

  it('passes critical controls for hardened production-like configuration', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
        PHI_ENCRYPTION_ENABLED: 'true',
        ENCRYPTION_KEY: 'x'.repeat(64),
        DB_SSL_ENABLED: 'true',
        CORS_ORIGIN: 'https://app.derm.example',
        JWT_SECRET: 'y'.repeat(64),
        CSRF_SECRET: 'z'.repeat(64),
        SESSION_SECRET: 'w'.repeat(64),
        API_URL: 'https://api.derm.example',
        ENABLE_API_DOCS: 'false',
        ENABLE_PLAYGROUND: 'false',
        STORAGE_PROVIDER: 's3',
        AWS_S3_BUCKET: 'derm-ehr-prod',
        AWS_REGION: 'us-east-1',
      },
      { skipDb: true }
    );

    expect(report.checks.find((item) => item.id === 'crypto:phi')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'db:tls')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'cors:origins')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'auth:secret-length')?.status).toBe('pass');
  });

  it('warns when run in non-production-like environment', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'development',
      },
      { skipDb: true }
    );

    expect(report.checks.find((item) => item.id === 'env:mode')?.status).toBe('warn');
  });
});
