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

  it('treats a localhost staging database as a local mirror and ignores localhost CORS origins', async () => {
    const report = await generateReadinessReport(
      {
        DEPLOYMENT_ENV: 'staging',
        PHI_ENCRYPTION_ENABLED: 'true',
        ENCRYPTION_KEY: 'x'.repeat(64),
        DB_SSL_ENABLED: 'false',
        DATABASE_URL: 'postgres://demo:demo@localhost:5432/derm',
        CORS_ORIGIN: 'https://staging.dermapp.example,http://localhost:5173,http://127.0.0.1:5173',
        JWT_SECRET: 'y'.repeat(64),
        CSRF_SECRET: 'z'.repeat(64),
        SESSION_SECRET: 'w'.repeat(64),
        API_URL: 'https://api.staging.dermapp.example',
        ENABLE_API_DOCS: 'false',
        ENABLE_PLAYGROUND: 'false',
        STORAGE_PROVIDER: 's3',
        AWS_S3_BUCKET: 'derm-ehr-staging',
        AWS_REGION: 'us-east-1',
      },
      { skipDb: true }
    );

    const dbTls = report.checks.find((item) => item.id === 'db:tls');
    const cors = report.checks.find((item) => item.id === 'cors:origins');

    expect(dbTls?.status).toBe('warn');
    expect(cors?.status).toBe('pass');
    expect(cors?.detail).toContain('https://staging.dermapp.example');
    expect(cors?.detail).toContain('Localhost origins are ignored');
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

  it('blocks production-like readiness while PHI vendor BAAs remain review-needed', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
      },
      { skipDb: true }
    );

    const vendorCheck = report.checks.find((item) => item.id === 'vendor:baa-inventory');
    expect(vendorCheck?.status).toBe('fail');
    expect(vendorCheck?.detail).toContain('OpenAI: status=REVIEW_NEEDED');
    expect(vendorCheck?.detail).not.toContain('Railway: status=REVIEW_NEEDED');
  });

  it('accepts a positive policy-defined backup retention window without claiming HIPAA mandates six years of backups', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
        BACKUP_RETENTION_DAYS: '90',
      },
      { skipDb: true }
    );

    const retentionCheck = report.checks.find((item) => item.id === 'backup:retention');
    expect(retentionCheck?.status).toBe('pass');
    expect(retentionCheck?.detail).toContain('BACKUP_RETENTION_DAYS=90');
    expect(retentionCheck?.detail).not.toContain('2190');
  });

  it('blocks production-like readiness when no backup retention window is configured', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
      },
      { skipDb: true }
    );

    const retentionCheck = report.checks.find((item) => item.id === 'backup:retention');
    expect(retentionCheck?.status).toBe('fail');
    expect(retentionCheck?.remediation).toContain('medical-record law');
  });

  it('blocks the legacy vendor mock override in production-like readiness', async () => {
    const report = await generateReadinessReport(
      {
        NODE_ENV: 'production',
        ALLOW_VENDOR_MOCK_FALLBACKS: 'true',
      },
      { skipDb: true }
    );

    const mockCheck = report.checks.find((item) => item.id === 'runtime:mocks');
    expect(mockCheck?.status).toBe('fail');
    expect(mockCheck?.detail).toContain('ALLOW_VENDOR_MOCK_FALLBACKS');
  });
});
