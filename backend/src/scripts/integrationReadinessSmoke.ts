type CheckStatus = 'pass' | 'warn' | 'fail';

interface SmokeCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
  remediation?: string;
}

interface IntegrationSmokeReport {
  generatedAt: string;
  environment: string;
  checks: SmokeCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

type CliOptions = {
  strict: boolean;
  strictWarnings: boolean;
  skipDb: boolean;
  json: boolean;
};

const INTEGRATION_MOCK_FLAGS = [
  'USE_MOCK_SERVICES',
  'USE_MOCK_SMS',
  'USE_MOCK_TWILIO',
  'USE_MOCK_NOTIFICATIONS',
];

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
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
): SmokeCheck {
  return { id, status, title, detail, remediation };
}

function summarize(checks: SmokeCheck[]): IntegrationSmokeReport['summary'] {
  return checks.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

function evaluateStaticChecks(env: NodeJS.ProcessEnv): SmokeCheck[] {
  const checks: SmokeCheck[] = [];
  const environment = inferEnvironment(env);
  const productionLike = isProductionLike(environment);
  const missingConfigStatus: CheckStatus = productionLike ? 'fail' : 'warn';

  const enabledMockFlags = INTEGRATION_MOCK_FLAGS.filter((flag) => parseBool(env[flag]));
  checks.push(
    enabledMockFlags.length === 0
      ? check(
          'mocks:integration',
          'pass',
          'Integration mock flags',
          'No integration mock flags are enabled.'
        )
      : check(
          'mocks:integration',
          productionLike ? 'warn' : 'warn',
          'Integration mock flags',
          `Mock flags enabled: ${enabledMockFlags.join(', ')}.`,
          'Disable mock integration flags before non-mock staging/production signoff.'
        )
  );

  const twilioSid = (env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = (env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioPhone = (env.TWILIO_PHONE_NUMBER || '').trim();
  checks.push(
    twilioSid && twilioToken && twilioPhone
      ? check(
          'twilio:env',
          'pass',
          'Twilio environment variables',
          'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are present.'
        )
      : check(
          'twilio:env',
          missingConfigStatus,
          'Twilio environment variables',
          'One or more Twilio env vars are missing.',
          'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.'
        )
  );

  return checks;
}

async function tableExists(
  dbPool: { query: (sql: string, params?: any[]) => Promise<any> },
  tableName: string
): Promise<boolean> {
  const result = await dbPool.query('SELECT to_regclass($1) AS table_name', [tableName]);
  return Boolean(result.rows?.[0]?.table_name);
}

async function evaluateDatabaseChecks(env: NodeJS.ProcessEnv): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const environment = inferEnvironment(env);
  const productionLike = isProductionLike(environment);
  const missingConfigStatus: CheckStatus = productionLike ? 'fail' : 'warn';

  let closePoolFn: (() => Promise<void>) | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../db/pool') as {
      pool: { query: (sql: string, params?: any[]) => Promise<any> };
      closePool: () => Promise<void>;
    };
    const dbPool = db.pool;
    closePoolFn = db.closePool;

    await dbPool.query('SELECT 1');
    checks.push(check('db:connectivity', 'pass', 'Database connectivity', 'Database query succeeded.'));

    const smsSettingsTable = await tableExists(dbPool, 'public.sms_settings');
    if (!smsSettingsTable) {
      checks.push(
        check(
          'db:sms-settings-table',
          missingConfigStatus,
          'SMS settings table',
          'sms_settings table is missing.',
          'Run migrations before integration smoke checks.'
        )
      );
    } else {
      const smsSettingsCountResult = await dbPool.query(
        `SELECT COUNT(*)::int AS count
         FROM sms_settings
         WHERE is_active = true
           AND twilio_account_sid IS NOT NULL
           AND twilio_auth_token IS NOT NULL
           AND twilio_phone_number IS NOT NULL`
      );
      const activeSmsSettings = smsSettingsCountResult.rows?.[0]?.count || 0;
      checks.push(
        activeSmsSettings > 0
          ? check(
              'db:sms-configured',
              'pass',
              'Active Twilio SMS settings',
              `${activeSmsSettings} active sms_settings row(s) with Twilio credentials.`
            )
          : check(
              'db:sms-configured',
              missingConfigStatus,
              'Active Twilio SMS settings',
              'No active sms_settings rows with Twilio credentials were found.',
              'Enable SMS for at least one tenant and store Twilio credentials.'
            )
      );
    }

    const clearinghouseTable = await tableExists(dbPool, 'public.clearinghouse_configs');
    if (!clearinghouseTable) {
      checks.push(
        check(
          'db:clearinghouse-table',
          missingConfigStatus,
          'Clearinghouse config table',
          'clearinghouse_configs table is missing.',
          'Run migrations before clearinghouse smoke checks.'
        )
      );
    } else {
      const clearinghouseCounts = await dbPool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_active = true)::int AS active_count,
           COUNT(*) FILTER (WHERE is_active = true AND is_default = true)::int AS default_count
         FROM clearinghouse_configs`
      );
      const activeCount = clearinghouseCounts.rows?.[0]?.active_count || 0;
      const defaultCount = clearinghouseCounts.rows?.[0]?.default_count || 0;

      checks.push(
        activeCount > 0
          ? check(
              'db:clearinghouse-active',
              'pass',
              'Active clearinghouse configuration',
              `${activeCount} active clearinghouse config row(s) detected.`
            )
          : check(
              'db:clearinghouse-active',
              missingConfigStatus,
              'Active clearinghouse configuration',
              'No active clearinghouse configuration detected.',
              'Create at least one active clearinghouse configuration.'
            )
      );

      checks.push(
        defaultCount > 0
          ? check(
              'db:clearinghouse-default',
              'pass',
              'Default clearinghouse configuration',
              `${defaultCount} default active clearinghouse config row(s) detected.`
            )
          : check(
              'db:clearinghouse-default',
              missingConfigStatus,
              'Default clearinghouse configuration',
              'No default active clearinghouse configuration detected.',
              'Mark one active clearinghouse config as default.'
            )
      );
    }

    const integrationTable = await tableExists(dbPool, 'public.integration_configs');
    if (!integrationTable) {
      checks.push(
        check(
          'db:integration-table',
          missingConfigStatus,
          'Integration config table',
          'integration_configs table is missing.',
          'Run migrations to enable provider-level integration tracking.'
        )
      );
    } else {
      const providerCountsResult = await dbPool.query(
        `SELECT provider, COUNT(*)::int AS count
         FROM integration_configs
         WHERE is_active = true
           AND provider IN ('surescripts', 'availity', 'change_healthcare', 'trizetto', 'waystar')
         GROUP BY provider
         ORDER BY provider`
      );
      const providerCounts = providerCountsResult.rows as Array<{ provider: string; count: number }>;
      const providerLabels = providerCounts.map((row) => `${row.provider}:${row.count}`);
      const hasSurescripts = providerCounts.some((row) => row.provider === 'surescripts');
      const hasEligibility = providerCounts.some((row) => row.provider === 'availity');

      checks.push(
        hasSurescripts
          ? check(
              'db:surescripts-config',
              'pass',
              'Surescripts integration config',
              `Active Surescripts integration config present (${providerLabels.join(', ')}).`
            )
          : check(
              'db:surescripts-config',
              missingConfigStatus,
              'Surescripts integration config',
              'No active Surescripts integration config found in integration_configs.',
              'Create an active provider=surescripts integration config when subscription is live.'
            )
      );

      checks.push(
        hasEligibility
          ? check(
              'db:eligibility-config',
              'pass',
              'Eligibility integration config',
              `Active Availity integration config present (${providerLabels.join(', ')}).`
            )
          : check(
              'db:eligibility-config',
              'warn',
              'Eligibility integration config',
              'No active Availity integration config found in integration_configs.',
              'Create an active provider=availity integration config when subscription is live.'
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

function parseCliOptions(argv: string[]): CliOptions {
  return {
    strict: argv.includes('--strict'),
    strictWarnings: argv.includes('--strict-warnings'),
    skipDb: argv.includes('--skip-db'),
    json: argv.includes('--json'),
  };
}

function formatReport(report: IntegrationSmokeReport): string {
  const lines: string[] = [];
  lines.push('Integration Readiness Smoke Report');
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

export async function generateIntegrationSmokeReport(
  env: NodeJS.ProcessEnv,
  options?: { skipDb?: boolean }
): Promise<IntegrationSmokeReport> {
  const checks: SmokeCheck[] = [];
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

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const report = await generateIntegrationSmokeReport(process.env, { skipDb: options.skipDb });

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
