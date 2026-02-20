import fs from 'fs';
import path from 'path';

type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
  remediation?: string;
}

export interface ReadinessReport {
  generatedAt: string;
  environment: string;
  checks: ReadinessCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

const MOCK_FLAG_KEYS = [
  'USE_MOCK_SERVICES',
  'USE_MOCK_STORAGE',
  'USE_MOCK_SMS',
  'USE_MOCK_NOTIFICATIONS',
  'USE_MOCK_VIRUS_SCAN',
  'USE_MOCK_EMAIL',
  'USE_MOCK_TWILIO',
  'USE_MOCK_SLACK',
  'USE_MOCK_TEAMS',
  'USE_MOCK_CLAMAV',
];

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function inferEnvironment(env: NodeJS.ProcessEnv): string {
  return (
    env.DEPLOYMENT_ENV ||
    env.APP_ENV ||
    env.RAILWAY_ENVIRONMENT ||
    env.NODE_ENV ||
    'development'
  ).toLowerCase();
}

function isProductionLike(environment: string): boolean {
  return environment === 'production' || environment === 'staging';
}

function check(
  id: string,
  status: CheckStatus,
  title: string,
  detail: string,
  remediation?: string
): ReadinessCheck {
  return { id, status, title, detail, remediation };
}

function summarize(checks: ReadinessCheck[]): ReadinessReport['summary'] {
  return checks.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

type EvidenceFileRule = {
  relativePath: string;
  maxAgeDays: number;
};

const EVIDENCE_FILE_RULES: EvidenceFileRule[] = [
  { relativePath: 'compliance/evidence/vendor-baa-inventory.csv', maxAgeDays: 180 },
  { relativePath: 'compliance/evidence/hipaa-risk-analysis-latest.md', maxAgeDays: 365 },
  { relativePath: 'compliance/evidence/access-review-log.md', maxAgeDays: 90 },
  { relativePath: 'compliance/evidence/incident-response-tabletop.md', maxAgeDays: 180 },
];

function extractMostRecentIsoDate(contents: string): Date | null {
  const pattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
  let latest: Date | null = null;
  let match = pattern.exec(contents);
  while (match) {
    const candidate = new Date(`${match[1]}T00:00:00Z`);
    if (!Number.isNaN(candidate.getTime())) {
      if (!latest || candidate.getTime() > latest.getTime()) {
        latest = candidate;
      }
    }
    match = pattern.exec(contents);
  }
  return latest;
}

function daysSince(date: Date, now = new Date()): number {
  const millisInDay = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - date.getTime()) / millisInDay);
}

function evaluateEvidenceFiles(repoRoot: string, env: NodeJS.ProcessEnv): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const now = new Date();
  const overrideMaxAgeDays = parseNumber(env.EVIDENCE_MAX_AGE_DAYS, 0);

  for (const rule of EVIDENCE_FILE_RULES) {
    const relativePath = rule.relativePath;
    const fullPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      checks.push(
        check(
          `evidence:${relativePath}`,
          'fail',
          `Evidence file present: ${relativePath}`,
          'Required compliance evidence file is missing.',
          `Create ${relativePath} and commit current evidence or ownership notes.`
        )
      );
      continue;
    }

    const contents = fs.readFileSync(fullPath, 'utf8');
    if (/TODO|TBD|PENDING/i.test(contents)) {
      checks.push(
        check(
          `evidence:${relativePath}`,
          'warn',
          `Evidence file complete: ${relativePath}`,
          'File exists but still contains TODO/TBD/PENDING placeholders.',
          `Replace placeholders in ${relativePath} with current evidence before go-live.`
        )
      );
      continue;
    }

    checks.push(
      check(
        `evidence:${relativePath}`,
        'pass',
        `Evidence file complete: ${relativePath}`,
        'File exists and does not contain placeholder markers.'
      )
    );

    const freshnessWindowDays = overrideMaxAgeDays > 0 ? overrideMaxAgeDays : rule.maxAgeDays;
    const latestEvidenceDate = extractMostRecentIsoDate(contents);
    if (!latestEvidenceDate) {
      checks.push(
        check(
          `evidence:freshness:${relativePath}`,
          'warn',
          `Evidence freshness: ${relativePath}`,
          'No ISO date stamp detected in evidence file.',
          `Add an ISO date (YYYY-MM-DD) and keep it within ${freshnessWindowDays} days.`
        )
      );
      continue;
    }

    const ageDays = daysSince(latestEvidenceDate, now);
    if (ageDays <= freshnessWindowDays) {
      checks.push(
        check(
          `evidence:freshness:${relativePath}`,
          'pass',
          `Evidence freshness: ${relativePath}`,
          `Most recent evidence date ${latestEvidenceDate.toISOString().slice(0, 10)} is ${ageDays} day(s) old (<= ${freshnessWindowDays}).`
        )
      );
      continue;
    }

    checks.push(
      check(
        `evidence:freshness:${relativePath}`,
        'warn',
        `Evidence freshness: ${relativePath}`,
        `Most recent evidence date ${latestEvidenceDate.toISOString().slice(0, 10)} is ${ageDays} day(s) old (> ${freshnessWindowDays}).`,
        `Refresh ${relativePath} evidence and reviewer sign-off.`
      )
    );
  }

  return checks;
}

function evaluateStaticChecks(env: NodeJS.ProcessEnv): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const environment = inferEnvironment(env);
  const productionLike = isProductionLike(environment);

  const phiEncryptionEnabled =
    parseBool(env.PHI_ENCRYPTION_ENABLED) || parseBool(env.ENABLE_PHI_ENCRYPTION);
  const encryptionKeyLength = (env.ENCRYPTION_KEY || '').length;
  const databaseUrl = env.DATABASE_URL || '';
  const dbSslEnabled = parseBool(env.DB_SSL_ENABLED);
  const databaseUrlForcesSsl = /(sslmode=require|sslmode=verify-full|ssl=true)/i.test(databaseUrl);
  const corsOrigins = splitOrigins(env.CORS_ORIGIN || env.FRONTEND_URL);
  const hasWildcardCors = corsOrigins.includes('*');
  const hasLocalhostCors = corsOrigins.some((origin) => /localhost|127\.0\.0\.1/i.test(origin));
  const docsEnabled = parseBool(env.ENABLE_API_DOCS);
  const playgroundEnabled = parseBool(env.ENABLE_PLAYGROUND);
  const apiUrl = env.API_URL || '';
  const storageProvider = (env.STORAGE_PROVIDER || 'local').toLowerCase();
  const auditRetentionDays = parseNumber(env.AUDIT_LOG_RETENTION_DAYS, 0);
  const backupEnabled = parseBool(env.BACKUP_ENABLED);
  const virusScanEnabled = parseBool(env.VIRUS_SCAN_ENABLED);

  if (productionLike) {
    checks.push(
      phiEncryptionEnabled
        ? check('crypto:phi', 'pass', 'PHI encryption enabled', 'PHI encryption flag is enabled.')
        : check(
            'crypto:phi',
            'fail',
            'PHI encryption enabled',
            'PHI encryption is disabled for a production-like environment.',
            'Set PHI_ENCRYPTION_ENABLED=true and provide ENCRYPTION_KEY.'
          )
    );

    checks.push(
      encryptionKeyLength >= 32
        ? check('crypto:key-length', 'pass', 'Encryption key length', 'ENCRYPTION_KEY length is at least 32.')
        : check(
            'crypto:key-length',
            'fail',
            'Encryption key length',
            `ENCRYPTION_KEY length is ${encryptionKeyLength}, expected at least 32.`,
            'Set a 32+ character ENCRYPTION_KEY sourced from a managed secret store.'
          )
    );

    checks.push(
      dbSslEnabled || databaseUrlForcesSsl
        ? check('db:tls', 'pass', 'Database TLS enforced', 'DB TLS is enabled through DB_SSL_ENABLED or DATABASE_URL sslmode.')
        : check(
            'db:tls',
            'fail',
            'Database TLS enforced',
            'Database TLS is not enforced for a production-like environment.',
            'Enable DB_SSL_ENABLED=true or enforce sslmode=require in DATABASE_URL.'
          )
    );

    if (corsOrigins.length === 0) {
      checks.push(
        check(
          'cors:origins',
          'fail',
          'CORS origins explicit',
          'No explicit CORS origin is configured.',
          'Set CORS_ORIGIN to trusted frontend origins.'
        )
      );
    } else if (hasWildcardCors) {
      checks.push(
        check(
          'cors:origins',
          'fail',
          'CORS origins explicit',
          'Wildcard CORS origin (*) detected.',
          'Replace wildcard with explicit allow-list origins.'
        )
      );
    } else if (hasLocalhostCors) {
      checks.push(
        check(
          'cors:origins',
          'fail',
          'CORS origins explicit',
          'Localhost origin detected in production-like environment.',
          'Remove localhost/127.0.0.1 origins from CORS_ORIGIN.'
        )
      );
    } else {
      checks.push(check('cors:origins', 'pass', 'CORS origins explicit', `Configured origins: ${corsOrigins.join(', ')}`));
    }

    checks.push(
      docsEnabled
        ? check(
            'surface:api-docs',
            'warn',
            'Production API docs exposure',
            'ENABLE_API_DOCS is true.',
            'Set ENABLE_API_DOCS=false for production; expose docs only on secured internal network.'
          )
        : check('surface:api-docs', 'pass', 'Production API docs exposure', 'ENABLE_API_DOCS is false.')
    );

    checks.push(
      playgroundEnabled
        ? check(
            'surface:playground',
            'warn',
            'Production playground exposure',
            'ENABLE_PLAYGROUND is true.',
            'Set ENABLE_PLAYGROUND=false for production.'
          )
        : check('surface:playground', 'pass', 'Production playground exposure', 'ENABLE_PLAYGROUND is false.')
    );

    checks.push(
      apiUrl.startsWith('https://')
        ? check('transport:https', 'pass', 'External API URL uses HTTPS', `API_URL=${apiUrl}`)
        : check(
            'transport:https',
            'fail',
            'External API URL uses HTTPS',
            `API_URL=${apiUrl || '(unset)'} does not use https.`,
            'Set API_URL to the externally reachable HTTPS endpoint.'
          )
    );

    checks.push(
      storageProvider === 's3'
        ? check('storage:provider', 'pass', 'Object storage provider', 'STORAGE_PROVIDER is s3.')
        : check(
            'storage:provider',
            'warn',
            'Object storage provider',
            `STORAGE_PROVIDER is ${storageProvider}.`,
            'Use s3-backed encrypted object storage for production PHI/document handling.'
          )
    );
  } else {
    checks.push(
      check(
        'env:mode',
        'warn',
        'Production-like mode check',
        `Environment is ${environment}. Run this checker with production/staging env vars for authoritative readiness.`
      )
    );
  }

  const weakSecrets: string[] = [];
  if ((env.JWT_SECRET || '').length < 32) weakSecrets.push('JWT_SECRET');
  if ((env.CSRF_SECRET || '').length < 32) weakSecrets.push('CSRF_SECRET');
  if ((env.SESSION_SECRET || '').length < 32) weakSecrets.push('SESSION_SECRET');
  checks.push(
    weakSecrets.length === 0
      ? check('auth:secret-length', 'pass', 'Auth/session secret length', 'JWT/CSRF/session secrets are 32+ chars.')
      : check(
          'auth:secret-length',
          productionLike ? 'fail' : 'warn',
          'Auth/session secret length',
          `Weak or missing secrets: ${weakSecrets.join(', ')}`,
          'Set strong 32+ character secrets through the secret manager.'
        )
  );

  const mockFlagsEnabled = MOCK_FLAG_KEYS.filter((key) => parseBool(env[key]));
  checks.push(
    mockFlagsEnabled.length === 0
      ? check('runtime:mocks', 'pass', 'Mock service flags disabled', 'No mock service flags are enabled.')
      : check(
          'runtime:mocks',
          productionLike ? 'fail' : 'warn',
          'Mock service flags disabled',
          `Enabled mock flags: ${mockFlagsEnabled.join(', ')}`,
          'Disable all mock flags before staging/prod deployment.'
        )
  );

  checks.push(
    (env.SENTRY_DSN || '').trim().length > 0
      ? check('monitoring:sentry', 'pass', 'Sentry DSN configured', 'SENTRY_DSN is configured.')
      : check(
          'monitoring:sentry',
          productionLike ? 'warn' : 'warn',
          'Sentry DSN configured',
          'SENTRY_DSN is missing.',
          'Configure SENTRY_DSN for incident triage and breach forensics support.'
        )
  );

  checks.push(
    auditRetentionDays >= 2190
      ? check(
          'audit:retention',
          'pass',
          'Audit retention window',
          `AUDIT_LOG_RETENTION_DAYS=${auditRetentionDays} (>= 2190 target).`
        )
      : check(
          'audit:retention',
          productionLike ? 'warn' : 'warn',
          'Audit retention window',
          `AUDIT_LOG_RETENTION_DAYS=${auditRetentionDays} (< 2190 target).`,
          'Increase retention and align final policy with legal counsel/compliance.'
        )
  );

  checks.push(
    backupEnabled
      ? check('backup:enabled', 'pass', 'Backup schedule enabled', 'BACKUP_ENABLED=true.')
      : check(
          'backup:enabled',
          productionLike ? 'warn' : 'warn',
          'Backup schedule enabled',
          'BACKUP_ENABLED is false.',
          'Enable encrypted backups and verify restore runbooks.'
        )
  );

  checks.push(
    (env.BACKUP_BUCKET || '').trim().length > 0
      ? check('backup:bucket', 'pass', 'Backup bucket configured', `BACKUP_BUCKET=${env.BACKUP_BUCKET}`)
      : check(
          'backup:bucket',
          productionLike ? 'warn' : 'warn',
          'Backup bucket configured',
          'BACKUP_BUCKET is missing.',
          'Configure an encrypted backup bucket with restricted IAM access.'
        )
  );

  checks.push(
    virusScanEnabled
      ? check('uploads:virus-scan', 'pass', 'Virus scanning enabled', 'VIRUS_SCAN_ENABLED=true.')
      : check(
          'uploads:virus-scan',
          productionLike ? 'warn' : 'warn',
          'Virus scanning enabled',
          'VIRUS_SCAN_ENABLED is false.',
          'Enable malware scanning for uploaded files in staging/prod.'
        )
  );

  if (storageProvider === 's3') {
    checks.push(
      (env.AWS_S3_BUCKET || '').trim().length > 0
        ? check('storage:s3-bucket', 'pass', 'S3 bucket configured', `AWS_S3_BUCKET=${env.AWS_S3_BUCKET}`)
        : check(
            'storage:s3-bucket',
            productionLike ? 'fail' : 'warn',
            'S3 bucket configured',
            'AWS_S3_BUCKET is missing while STORAGE_PROVIDER=s3.',
            'Set AWS_S3_BUCKET to the PHI storage bucket.'
          )
    );
    checks.push(
      (env.AWS_REGION || '').trim().length > 0
        ? check('storage:s3-region', 'pass', 'S3 region configured', `AWS_REGION=${env.AWS_REGION}`)
        : check(
            'storage:s3-region',
            productionLike ? 'fail' : 'warn',
            'S3 region configured',
            'AWS_REGION is missing while STORAGE_PROVIDER=s3.',
            'Set AWS_REGION for S3 operations and KMS policy alignment.'
          )
    );
  }

  const repoRoot = path.resolve(__dirname, '../../..');
  checks.push(...evaluateEvidenceFiles(repoRoot, env));

  return checks;
}

async function evaluateDatabaseChecks(env: NodeJS.ProcessEnv): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];
  const environment = inferEnvironment(env);
  const productionLike = isProductionLike(environment);

  let closePoolFn: (() => Promise<void>) | null = null;
  try {
    // Use require here so ts-node transpile-only mode resolves local TS modules reliably.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../db/pool') as {
      pool: {
        query: (sql: string) => Promise<any>;
      };
      closePool: () => Promise<void>;
    };
    const pool = db.pool;
    closePoolFn = db.closePool;

    await pool.query('SELECT 1');
    checks.push(check('db:connectivity', 'pass', 'Database connectivity', 'Database query succeeded.'));

    const ssnColumns = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'patients'
         AND column_name IN ('ssn', 'ssn_last4', 'ssn_encrypted')`
    );
    const columnSet = new Set<string>(ssnColumns.rows.map((row: { column_name: string }) => row.column_name));
    const hasExpectedColumns = columnSet.has('ssn') && columnSet.has('ssn_last4') && columnSet.has('ssn_encrypted');
    checks.push(
      hasExpectedColumns
        ? check('db:ssn-columns', 'pass', 'SSN storage schema', 'patients table includes ssn, ssn_last4, ssn_encrypted.')
        : check(
            'db:ssn-columns',
            productionLike ? 'fail' : 'warn',
            'SSN storage schema',
            'Expected SSN columns are missing from patients table.',
            'Run migrations and verify SSN storage model.'
          )
    );

    const plaintextSsnCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM patients
       WHERE ssn IS NOT NULL`
    );
    const plaintextSsnCount = plaintextSsnCountResult.rows[0]?.count || 0;
    checks.push(
      plaintextSsnCount === 0
        ? check('db:ssn-plaintext', 'pass', 'Legacy plaintext SSN', 'No plaintext SSN values present in patients.ssn.')
        : check(
            'db:ssn-plaintext',
            productionLike ? 'fail' : 'warn',
            'Legacy plaintext SSN',
            `${plaintextSsnCount} row(s) still contain plaintext SSN data.`,
            'Run SSN backfill/lockdown migration and scrub remaining plaintext values.'
          )
    );

    const auditTableResult = await pool.query(`SELECT to_regclass('public.audit_log') AS table_name`);
    const auditTableExists = Boolean(auditTableResult.rows[0]?.table_name);
    checks.push(
      auditTableExists
        ? check('db:audit-table', 'pass', 'Audit log table', 'audit_log table is present.')
        : check(
            'db:audit-table',
            productionLike ? 'fail' : 'warn',
            'Audit log table',
            'audit_log table is missing.',
            'Run migrations to create audit logging tables.'
          )
    );

    if (auditTableExists) {
      const auditIndexResult = await pool.query(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'audit_log'
           AND indexdef ILIKE '%created_at%'`
      );
      checks.push(
        (auditIndexResult.rowCount || 0) > 0
          ? check('db:audit-index', 'pass', 'Audit log time index', 'audit_log has at least one created_at index.')
          : check(
              'db:audit-index',
              'warn',
              'Audit log time index',
              'No created_at index detected on audit_log.',
              'Add/verify index to support retention and forensic queries.'
            )
      );

      const recentAuditRows = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM audit_log
         WHERE created_at >= NOW() - INTERVAL '30 days'`
      );
      const recentCount = recentAuditRows.rows[0]?.count || 0;
      checks.push(
        recentCount > 0
          ? check('db:audit-activity', 'pass', 'Recent audit activity', `${recentCount} audit_log row(s) in last 30 days.`)
          : check(
              'db:audit-activity',
              'warn',
              'Recent audit activity',
              'No audit_log rows found in last 30 days.',
              'Verify audit hooks are active in staging traffic.'
            )
      );
    }
  } catch (error: any) {
    checks.push(
      check(
        'db:connectivity',
        'fail',
        'Database connectivity',
        `Database checks failed: ${error?.message || 'unknown error'}`,
        'Provide reachable DB credentials or run with --skip-db for env-only checks.'
      )
    );
  } finally {
    if (closePoolFn) {
      await closePoolFn();
    }
  }

  return checks;
}

export async function generateReadinessReport(
  env: NodeJS.ProcessEnv,
  options?: { skipDb?: boolean }
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  checks.push(...evaluateStaticChecks(env));
  if (!options?.skipDb) {
    checks.push(...(await evaluateDatabaseChecks(env)));
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: inferEnvironment(env),
    checks,
    summary: summarize(checks),
  };
}

function formatReport(report: ReadinessReport): string {
  const lines: string[] = [];
  lines.push('HIPAA Staging/Production Readiness Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Environment: ${report.environment}`);
  lines.push('');

  for (const item of report.checks) {
    const marker = item.status === 'pass' ? '[PASS]' : item.status === 'warn' ? '[WARN]' : '[FAIL]';
    lines.push(`${marker} ${item.title}`);
    lines.push(`  - ${item.detail}`);
    if (item.remediation) {
      lines.push(`  - Remediation: ${item.remediation}`);
    }
  }

  lines.push('');
  lines.push(`Summary: pass=${report.summary.pass} warn=${report.summary.warn} fail=${report.summary.fail}`);
  return lines.join('\n');
}

type CliOptions = {
  strict: boolean;
  strictWarnings: boolean;
  skipDb: boolean;
  json: boolean;
};

function parseCliOptions(argv: string[]): CliOptions {
  return {
    strict: argv.includes('--strict'),
    strictWarnings: argv.includes('--strict-warnings'),
    skipDb: argv.includes('--skip-db'),
    json: argv.includes('--json'),
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const report = await generateReadinessReport(process.env, { skipDb: options.skipDb });

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(formatReport(report));
  }

  const shouldFailForWarnings = options.strictWarnings && report.summary.warn > 0;
  const shouldFailForFailures = (options.strict || options.strictWarnings) && report.summary.fail > 0;
  if (shouldFailForWarnings || shouldFailForFailures) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
