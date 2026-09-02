import { Pool } from 'pg';

const postgresIntegrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
const describePostgres = postgresIntegrationEnabled ? describe : describe.skip;

describePostgres('PostgreSQL migrations (real database)', () => {
  let adminPool: Pool | undefined;
  let applicationPool: Pool | undefined;
  let databaseName: string | undefined;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDbSslEnabled = process.env.DB_SSL_ENABLED;

  beforeAll(async () => {
    const configuredAdminUrl = process.env.POSTGRES_ADMIN_URL || process.env.DATABASE_URL;
    if (!configuredAdminUrl) {
      throw new Error('POSTGRES_ADMIN_URL or DATABASE_URL is required for the PostgreSQL integration suite');
    }

    const adminUrl = new URL(configuredAdminUrl);
    adminUrl.pathname = `/${process.env.POSTGRES_ADMIN_DATABASE || 'postgres'}`;
    adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });

    databaseName = `derm_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    const applicationUrl = new URL(adminUrl.toString());
    applicationUrl.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = applicationUrl.toString();
    process.env.DB_SSL_ENABLED = 'false';

    // The application pool reads its URL at module load time. Import it only
    // after the isolated database has been created so no shared database is
    // touched by the migration run.
    const { clearEnvCache } = require('../../config/validate') as typeof import('../../config/validate');
    clearEnvCache();
    const migrationModule = require('../migrate') as typeof import('../migrate');
    const poolModule = require('../pool') as typeof import('../pool');
    applicationPool = poolModule.pool;

    const migrationLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await migrationModule.runMigrations();
    } finally {
      migrationLog.mockRestore();
    }
  }, 120_000);

  afterAll(async () => {
    if (applicationPool) {
      await applicationPool.end();
    }

    if (adminPool && databaseName) {
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
    await adminPool?.end();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalDbSslEnabled === undefined) {
      delete process.env.DB_SSL_ENABLED;
    } else {
      process.env.DB_SSL_ENABLED = originalDbSslEnabled;
    }
  });

  it('runs every migration from an empty database, including interoperability hardening', async () => {
    const applied = await applicationPool!.query<{ name: string }>(
      'SELECT name FROM migrations ORDER BY applied_at, name',
    );

    expect(applied.rows.length).toBeGreaterThan(1);
    expect(applied.rows.map((row) => row.name)).toContain('223_insurance_estimate_program');
    expect(applied.rows.map((row) => row.name)).toContain('229_fhir_hl7_interoperability_schema');
    expect(applied.rows.map((row) => row.name)).toContain('230_mips_readiness_2026');
    expect(applied.rows.map((row) => row.name)).toContain('232_mips_workflow_automation');
  });

  it('creates the MIPS automation ledger, review fields, and structured itch schema', async () => {
    const columns = await applicationPool!.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('mips_readiness_evidence', 'mips_itch_assessments', 'mips_automation_runs')`,
    );
    const names = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    expect([...names]).toEqual(expect.arrayContaining([
      'mips_readiness_evidence.origin',
      'mips_readiness_evidence.automation_key',
      'mips_readiness_evidence.source_revision',
      'mips_readiness_evidence.reviewed_by',
      'mips_itch_assessments.client_event_id',
      'mips_itch_assessments.instrument_code',
      'mips_itch_assessments.instrument_version',
      'mips_automation_runs.connector_summary',
      'mips_automation_runs.candidates_stale',
    ]));

    const indexes = await applicationPool!.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('mips_readiness_evidence', 'mips_itch_assessments', 'mips_automation_runs')`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'idx_mips_readiness_evidence_automation_key',
      'idx_mips_itch_assessments_patient',
      'idx_mips_automation_runs_tenant_year',
    ]));
  });

  it('creates the production FHIR OAuth and HL7 queue schema', async () => {
    const columns = await applicationPool!.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT table_name, column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('fhir_oauth_tokens', 'hl7_messages')`,
    );

    const fhirColumns = new Set(
      columns.rows.filter((row) => row.table_name === 'fhir_oauth_tokens').map((row) => row.column_name),
    );
    const hl7Columns = new Set(
      columns.rows.filter((row) => row.table_name === 'hl7_messages').map((row) => row.column_name),
    );
    expect([...fhirColumns]).toEqual(expect.arrayContaining([
      'tenant_id', 'client_id', 'access_token', 'scope', 'patient_id', 'user_id', 'expires_at', 'last_used_at',
    ]));
    expect([...hl7Columns]).toEqual(expect.arrayContaining([
      'tenant_id', 'message_type', 'message_control_id', 'raw_message', 'parsed_data', 'status', 'retry_count',
    ]));
    expect(
      columns.rows.find((row) => row.table_name === 'hl7_messages' && row.column_name === 'message_control_id'),
    ).toMatchObject({ is_nullable: 'NO' });

    const indexes = await applicationPool!.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('fhir_oauth_tokens', 'hl7_messages')`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'idx_fhir_tokens_patient',
      'idx_hl7_messages_tenant_status',
      'idx_hl7_messages_retry',
    ]));
  });

  it('enforces insurance rate constraints and supports real inserts and updates', async () => {
    const columns = await applicationPool!.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'payer_contract_rates'`,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    expect([...columnNames]).toEqual(
      expect.arrayContaining([
        'tenant_id',
        'payer_id',
        'payer_name',
        'cpt_code',
        'allowed_amount_cents',
        'effective_date',
        'termination_date',
        'source',
        'is_active',
      ]),
    );

    const indexes = await applicationPool!.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'payer_contract_rates'`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'idx_payer_contract_rates_lookup',
        'idx_payer_contract_rates_payer_id',
      ]),
    );

    const validRate = await applicationPool!.query<{
      id: string;
      allowed_amount_cents: number;
      source: string;
    }>(
      `INSERT INTO payer_contract_rates (
         tenant_id, payer_id, payer_name, plan_name, cpt_code,
         allowed_amount_cents, effective_date, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, allowed_amount_cents, source`,
      ['tenant-demo', 'payer-demo', 'Acme Health', 'Gold', '99213', 12500, '2026-01-01', 'contract'],
    );
    expect(validRate.rows).toHaveLength(1);
    expect(validRate.rows[0]).toMatchObject({ allowed_amount_cents: 12500, source: 'contract' });

    const updatedRate = await applicationPool!.query<{ allowed_amount_cents: number; is_active: boolean }>(
      `UPDATE payer_contract_rates
       SET allowed_amount_cents = $1, is_active = $2
       WHERE id = $3
       RETURNING allowed_amount_cents, is_active`,
      [13000, false, validRate.rows[0].id],
    );
    expect(updatedRate.rows[0]).toEqual({ allowed_amount_cents: 13000, is_active: false });

    await expect(
      applicationPool!.query(
        `INSERT INTO payer_contract_rates
           (tenant_id, payer_name, cpt_code, allowed_amount_cents, effective_date)
         VALUES ('tenant-demo', 'Acme Health', '99214', -1, '2026-01-01')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      applicationPool!.query(
        `INSERT INTO payer_contract_rates
           (tenant_id, payer_name, cpt_code, allowed_amount_cents, effective_date, termination_date)
         VALUES ('tenant-demo', 'Acme Health', '99214', 1000, '2026-06-01', '2026-05-31')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      applicationPool!.query(
        `INSERT INTO payer_contract_rates
           (tenant_id, payer_name, cpt_code, allowed_amount_cents, effective_date, source)
         VALUES ('tenant-demo', 'Acme Health', '99214', 1000, '2026-01-01', 'not-a-source')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('exposes migration 223 estimate lifecycle columns with real updates', async () => {
    const estimate = await applicationPool!.query<{
      id: string;
      status: string;
      version: number;
      confidence_level: string;
      confidence_score: number;
      pricing_basis: string;
    }>(
      `INSERT INTO cost_estimates (
         tenant_id, patient_id, cpt_codes, estimated_allowed_amount,
         estimated_patient_responsibility, breakdown, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, version, confidence_level, confidence_score, pricing_basis`,
      [
        'tenant-demo',
        'demo-patient-1',
        JSON.stringify(['99213']),
        125,
        35,
        JSON.stringify({ allowed: 125, patient: 35 }),
        'u-admin',
      ],
    );

    expect(estimate.rows[0]).toMatchObject({
      status: 'draft',
      version: 1,
      confidence_level: 'planning',
      confidence_score: 40,
      pricing_basis: 'percentage_fallback',
    });

    const updated = await applicationPool!.query<{ status: string; confidence_score: number; version: number }>(
      `UPDATE cost_estimates
       SET status = $1, confidence_score = $2, version = version + 1,
           confidence_level = $3, pricing_basis = $4
       WHERE id = $5
       RETURNING status, confidence_score, version`,
      ['acknowledged', 88, 'high', 'contract_rate', estimate.rows[0].id],
    );

    expect(updated.rows[0]).toEqual({ status: 'acknowledged', confidence_score: 88, version: 2 });
  });
});
