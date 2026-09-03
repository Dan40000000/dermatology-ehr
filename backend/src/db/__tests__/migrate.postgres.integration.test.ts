import { Pool } from 'pg';

const postgresIntegrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
const describePostgres = postgresIntegrationEnabled ? describe : describe.skip;

describePostgres('PostgreSQL migrations (real database)', () => {
  let adminPool: Pool | undefined;
  let applicationPool: Pool | undefined;
  let databaseName: string | undefined;
  let runMigrations: (() => Promise<void>) | undefined;
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
    runMigrations = migrationModule.runMigrations;
    const poolModule = require('../pool') as typeof import('../pool');
    applicationPool = poolModule.pool;

    const migrationLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runMigrations!();
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
    expect(applied.rows.map((row) => row.name)).toContain('233_biopsy_tracking_runtime');
    expect(applied.rows.map((row) => row.name)).toContain('234_mips_legacy_integrity');
  });

  it('creates the TEXT biopsy runtime schema, tenant-local specimen keys, and can be reapplied', async () => {
    const columns = await applicationPool!.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'biopsies', 'biopsy_alerts', 'biopsy_specimen_tracking',
            'biopsy_status_history', 'biopsy_review_checklists'
          )`,
    );
    const names = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    expect([...names]).toEqual(expect.arrayContaining([
      'biopsies.id', 'biopsies.tenant_id', 'biopsies.patient_id', 'biopsies.specimen_id',
      'biopsies.path_lab_id', 'biopsies.turnaround_time_days', 'biopsies.is_overdue',
      'biopsy_alerts.tenant_id', 'biopsy_specimen_tracking.tenant_id',
      'biopsy_status_history.tenant_id', 'biopsy_status_history.changed_by',
      'biopsy_review_checklists.tenant_id', 'biopsy_review_checklists.reviewed_by',
    ]));
    expect(columns.rows.find((row) => row.table_name === 'biopsies' && row.column_name === 'id')).toMatchObject({
      data_type: 'text',
    });

    const indexes = await applicationPool!.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
            'biopsies', 'biopsy_alerts', 'biopsy_specimen_tracking',
            'biopsy_status_history', 'biopsy_review_checklists'
          )`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'idx_biopsies_tenant_specimen_id',
      'idx_biopsy_specimen_tracking_tenant_biopsy',
      'idx_biopsy_status_history_tenant_biopsy',
      'idx_biopsy_review_checklists_tenant_biopsy',
    ]));

    // Re-run only 233 to exercise its CREATE IF NOT EXISTS guards.
    await applicationPool!.query(`DELETE FROM migrations WHERE name = '233_biopsy_tracking_runtime'`);
    await runMigrations!();

    const tenantA = `biopsy-test-a-${process.pid}-${Date.now()}`;
    const tenantB = `${tenantA}-b`;
    const userA = `${tenantA}-user`;
    const patientA = `${tenantA}-patient`;
    const patientB = `${tenantB}-patient`;
    const providerA = `${tenantA}-provider`;
    const providerB = `${tenantB}-provider`;
    const client = await applicationPool!.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4)', [tenantA, 'Biopsy A', tenantB, 'Biopsy B']);
      await client.query(
        `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4, 'provider', 'test-hash')`,
        [userA, tenantA, `${userA}@example.test`, 'Biopsy Test User'],
      );
      await client.query(
        `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4, 'provider', 'test-hash')`,
        [`${tenantB}-user`, tenantB, `${tenantB}-user@example.test`, 'Biopsy Test User B'],
      );
      await client.query(
        `INSERT INTO patients (id, tenant_id, first_name, last_name)
         VALUES ($1, $2, 'Biopsy', 'Patient A'), ($3, $4, 'Biopsy', 'Patient B')`,
        [patientA, tenantA, patientB, tenantB],
      );
      await client.query(
        `INSERT INTO providers (id, tenant_id, user_id, full_name)
         VALUES ($1, $2, $3, 'Biopsy Provider A'), ($4, $5, $6, 'Biopsy Provider B')`,
        [providerA, tenantA, userA, providerB, tenantB, `${tenantB}-user`],
      );
      const insert = (tenantId: string, patientId: string, providerId: string) => client.query(
        `INSERT INTO biopsies (
           tenant_id, patient_id, specimen_id, specimen_type, body_location,
           ordering_provider_id, path_lab
         ) VALUES ($1, $2, 'BX-TENANT-LOCAL', 'punch', 'arm', $3, 'Test Pathology')`,
        [tenantId, patientId, providerId],
      );
      await insert(tenantA, patientA, providerA);
      await client.query('SAVEPOINT duplicate_specimen');
      await expect(insert(tenantA, patientA, providerA)).rejects.toMatchObject({ code: '23505' });
      await client.query('ROLLBACK TO SAVEPOINT duplicate_specimen');
      await expect(insert(tenantB, patientB, providerB)).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('allocates tenant-local specimen IDs safely across concurrent biopsy creates', async () => {
    const { BiopsyService } = require('../../services/biopsyService') as typeof import('../../services/biopsyService');
    const tenantId = `biopsy-concurrency-${process.pid}-${Date.now()}`;
    const patientId = `${tenantId}-patient`;
    const providerId = `${tenantId}-provider`;
    const allocationDate = new Date('2026-09-03T12:00:00Z');
    const datePrefix = '20260903';

    await applicationPool!.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, 'Biopsy concurrency test']);
    await applicationPool!.query(
      `INSERT INTO patients (id, tenant_id, first_name, last_name)
       VALUES ($1, $2, 'Concurrency', 'Patient')`,
      [patientId, tenantId],
    );
    await applicationPool!.query(
      `INSERT INTO providers (id, tenant_id, full_name)
       VALUES ($1, $2, 'Concurrency Provider')`,
      [providerId, tenantId],
    );
    await applicationPool!.query(
      `INSERT INTO biopsies (
         tenant_id, patient_id, specimen_id, specimen_type, body_location,
         ordering_provider_id, path_lab, deleted_at
       ) VALUES
         ($1, $2, $3, 'punch', 'arm', $4, 'Test Pathology', NULL),
         ($1, $2, $5, 'punch', 'arm', $4, 'Test Pathology', NULL),
         ($1, $2, $6, 'punch', 'arm', $4, 'Test Pathology', CURRENT_TIMESTAMP),
         ($1, $2, $7, 'punch', 'arm', $4, 'Test Pathology', NULL)`,
      [
        tenantId,
        patientId,
        `BX-${datePrefix}-001`,
        providerId,
        `BX-${datePrefix}-003`,
        `BX-${datePrefix}-004`,
        `BX-${datePrefix}-legacy`,
      ],
    );

    const clientA = await applicationPool!.connect();
    const clientB = await applicationPool!.connect();
    const createBiopsy = async (client: typeof clientA): Promise<string> => {
      await client.query('BEGIN');
      try {
        const specimenId = await BiopsyService.generateSpecimenId({ tenantId, date: allocationDate }, client);
        await client.query(
          `INSERT INTO biopsies (
             tenant_id, patient_id, specimen_id, specimen_type, body_location,
             ordering_provider_id, path_lab
           ) VALUES ($1, $2, $3, 'punch', 'arm', $4, 'Test Pathology')`,
          [tenantId, patientId, specimenId, providerId],
        );
        await client.query('COMMIT');
        return specimenId;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    };

    try {
      const allocatedIds = await Promise.all([
        createBiopsy(clientA),
        createBiopsy(clientB),
      ]);
      expect(allocatedIds.sort()).toEqual([
        `BX-${datePrefix}-005`,
        `BX-${datePrefix}-006`,
      ]);

      const persisted = await applicationPool!.query<{ specimen_id: string }>(
        `SELECT specimen_id
           FROM biopsies
          WHERE tenant_id = $1
            AND specimen_id IN ($2, $3)
          ORDER BY specimen_id`,
        [tenantId, ...allocatedIds],
      );
      expect(persisted.rows.map((row) => row.specimen_id)).toEqual(allocatedIds);
    } finally {
      clientA.release();
      clientB.release();
      await applicationPool!.query('DELETE FROM biopsies WHERE tenant_id = $1', [tenantId]);
      await applicationPool!.query('DELETE FROM providers WHERE tenant_id = $1', [tenantId]);
      await applicationPool!.query('DELETE FROM patients WHERE tenant_id = $1', [tenantId]);
      await applicationPool!.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
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

  it('creates the legacy MIPS runtime schema and a valid status upsert target', async () => {
    const columns = await applicationPool!.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'quality_measures', 'patient_measure_status', 'patient_measure_tracking',
            'encounter_measure_checklist', 'mips_score_history', 'ia_activities',
            'promoting_interoperability_tracking', 'improvement_activities', 'qrda_reports'
          )`,
    );
    const names = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    expect([...names]).toEqual(expect.arrayContaining([
      'quality_measures.measure_id',
      'quality_measures.benchmark_data',
      'patient_measure_status.status_date',
      'patient_measure_status.documentation_data',
      'patient_measure_status.performance_met',
      'patient_measure_tracking.tracking_period_start',
      'encounter_measure_checklist.completion_status',
      'mips_score_history.reporting_year',
      'ia_activities.activity_name',
      'ia_activities.title',
      'promoting_interoperability_tracking.measure_name',
      'improvement_activities.attestation_status',
      'qrda_reports.summary_data',
    ]));
    expect(columns.rows.find((row) => row.table_name === 'patient_measure_status' && row.column_name === 'id')).toMatchObject({
      data_type: 'text',
    });
    expect(columns.rows.find((row) => row.table_name === 'patient_measure_status' && row.column_name === 'documentation')).toMatchObject({
      data_type: 'text',
    });

    const indexes = await applicationPool!.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
            'patient_measure_status', 'patient_measure_tracking',
            'encounter_measure_checklist', 'mips_score_history', 'ia_activities',
            'promoting_interoperability_tracking', 'improvement_activities', 'measure_performance',
            'quality_gaps'
          )`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'idx_patient_measure_status_tenant_patient_measure_encounter',
      'idx_patient_measure_tracking_tenant_measure_period',
      'idx_encounter_measure_checklist_tenant_encounter',
      'idx_mips_score_history_tenant_year',
      'idx_ia_activities_tenant_activity_start',
      'idx_promoting_interoperability_tenant_measure_period',
      'idx_improvement_activities_tenant_activity_start',
      'idx_measure_performance_tenant_provider_measure_period',
      'idx_quality_gaps_tenant_patient_measure_open',
    ]));
    expect(indexes.rows.find((row) => row.indexname === 'idx_patient_measure_status_tenant_patient_measure_encounter')?.indexdef)
      .toMatch(/UNIQUE INDEX.*tenant_id, patient_id, measure_id, reporting_year, encounter_id.*NULLS NOT DISTINCT/i);
    expect(indexes.rows.find((row) => row.indexname === 'idx_quality_gaps_tenant_patient_measure_open')?.indexdef)
      .toMatch(/UNIQUE INDEX.*tenant_id, patient_id, measure_id.*WHERE.*status.*open/i);

    const constraints = await applicationPool!.query<{ conname: string }>(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'encounter_measure_checklist'::regclass
          AND conname = 'encounter_measure_checklist_tenant_encounter_measure_unique'`,
    );
    expect(constraints.rows).toHaveLength(1);
    const obsoleteGapConstraint = await applicationPool!.query<{ conname: string }>(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'quality_gaps'::regclass
          AND conname = 'quality_gaps_tenant_id_patient_id_measure_id_status_key'`,
    );
    expect(obsoleteGapConstraint.rows).toHaveLength(0);

    const smokeSuffix = `${process.pid}-${Date.now()}`;
    const smokeTenant = `mips-legacy-${smokeSuffix}`;
    const smokeTenantB = `mips-legacy-b-${smokeSuffix}`;
    const smokeUser = `mips-legacy-user-${smokeSuffix}`;
    const smokePatient = `mips-legacy-patient-${smokeSuffix}`;
    const archivePatient = `mips-legacy-archive-patient-${smokeSuffix}`;
    const smokeProvider = `mips-legacy-provider-${smokeSuffix}`;
    const smokeEncounter = `mips-legacy-encounter-${smokeSuffix}`;
    const smokeMeasure = `MIPS-SMOKE-${smokeSuffix}`;
    const smokeStatus = `mips-legacy-status-${smokeSuffix}`;
    await applicationPool!.query(
      `INSERT INTO tenants (id, name) VALUES ($1, 'MIPS legacy smoke tenant')`,
      [smokeTenant],
    );
    await applicationPool!.query(
      `INSERT INTO tenants (id, name) VALUES ($1, 'MIPS legacy smoke tenant B')`,
      [smokeTenantB],
    );
    await applicationPool!.query(
      `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash)
       VALUES ($1, $2, $3, 'MIPS Legacy Smoke User', 'provider', 'test-hash')`,
      [smokeUser, smokeTenant, `${smokeUser}@example.test`],
    );
    await applicationPool!.query(
      `INSERT INTO patients (id, tenant_id, first_name, last_name)
       VALUES ($1, $2, 'MIPS', 'Smoke')`,
      [smokePatient, smokeTenant],
    );
    await applicationPool!.query(
      `INSERT INTO patients (id, tenant_id, first_name, last_name)
       VALUES ($1, $2, 'MIPS', 'Archive')`,
      [archivePatient, smokeTenant],
    );
    await applicationPool!.query(
      `INSERT INTO providers (id, tenant_id, user_id, full_name)
       VALUES ($1, $2, $3, 'MIPS Legacy Smoke Provider')`,
      [smokeProvider, smokeTenant, smokeUser],
    );
    await applicationPool!.query(
      `INSERT INTO encounters (id, tenant_id, patient_id, provider_id, status)
       VALUES ($1, $2, $3, $4, 'completed')`,
      [smokeEncounter, smokeTenant, smokePatient, smokeProvider],
    );
    await applicationPool!.query(
      `INSERT INTO quality_measures (
         id, measure_code, measure_name, category,
         numerator_criteria, denominator_criteria, exclusion_criteria,
         measure_id, benchmark_data, weight, points, is_active
       ) VALUES ($1, $2, 'MIPS Legacy Smoke Activity', 'ia', '{}', '{}', '{}', $2, '{}', 10, 10, true)`,
      [smokeMeasure, smokeMeasure],
    );

    // The active legacy status contract stores ordinary documentation text,
    // despite the historical 112 JSONB declaration.
    await applicationPool!.query(
      `INSERT INTO patient_measure_status (
         id, tenant_id, patient_id, measure_id, reporting_year,
         status, documentation, documentation_data, performance_met
       ) VALUES ($1, $2, $3, $4, 2026, 'met', 'plain text documentation', '{}', true)`,
      [smokeStatus, smokeTenant, smokePatient, smokeMeasure],
    );
    const statusSmoke = await applicationPool!.query<{ documentation: string }>(
      `SELECT documentation FROM patient_measure_status WHERE id = $1`,
      [smokeStatus],
    );
    expect(statusSmoke.rows[0]?.documentation).toBe('plain text documentation');

    const { mipsService } = require('../../services/mipsService') as typeof import('../../services/mipsService');

    // Exercise both nullable and encounter-scoped status upserts against the
    // NULL-safe conflict target.
    const noEncounterStatus = await mipsService.recordMeasureStatus(
      smokeTenant,
      smokePatient,
      smokeMeasure,
      undefined,
      'met',
      'service no-encounter status',
    );
    const noEncounterUpdate = await mipsService.recordMeasureStatus(
      smokeTenant,
      smokePatient,
      smokeMeasure,
      undefined,
      'not_met',
      'service no-encounter update',
    );
    expect(noEncounterStatus.id).toBe(smokeStatus);
    expect(noEncounterUpdate.id).toBe(smokeStatus);
    const historicalStatus = `mips-legacy-status-2025-${smokeSuffix}`;
    await applicationPool!.query(
      `INSERT INTO patient_measure_status (
         id, tenant_id, patient_id, measure_id, reporting_year,
         status, status_date, documentation, documentation_data, performance_met
       ) VALUES ($1, $2, $3, $4, 2025, 'met', '2025-06-30', 'historical status', '{}', true)`,
      [historicalStatus, smokeTenant, smokePatient, smokeMeasure],
    );
    await mipsService.recordMeasureStatus(
      smokeTenant,
      smokePatient,
      smokeMeasure,
      smokeEncounter,
      'met',
      'service encounter status',
    );
    await mipsService.recordMeasureStatus(
      smokeTenant,
      smokePatient,
      smokeMeasure,
      smokeEncounter,
      'not_met',
      'service encounter update',
    );
    const statusUpserts = await applicationPool!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM patient_measure_status
        WHERE tenant_id = $1 AND patient_id = $2 AND measure_id = $3`,
      [smokeTenant, smokePatient, smokeMeasure],
    );
    expect(statusUpserts.rows[0]?.count).toBe('3');
    const preservedHistoricalStatus = await applicationPool!.query<{ documentation: string }>(
      `SELECT documentation
         FROM patient_measure_status
        WHERE id = $1 AND reporting_year = 2025`,
      [historicalStatus],
    );
    expect(preservedHistoricalStatus.rows[0]?.documentation).toBe('historical status');

    // Closed gaps are an event history. Only the single active/open gap is
    // unique, so recurring episodes can close without colliding with prior
    // closed rows.
    await applicationPool!.query(
      `INSERT INTO quality_gaps (
         id, tenant_id, patient_id, provider_id, measure_id,
         gap_type, gap_description, status, closed_date
       ) VALUES
         ($1, $2, $3, $4, $5, 'performance', 'closed episode one', 'closed', NOW()),
         ($6, $2, $3, $4, $5, 'performance', 'closed episode two', 'closed', NOW()),
         ($7, $2, $3, $4, $5, 'performance', 'active episode', 'open', NULL)`,
      [
        `mips-gap-closed-1-${smokeSuffix}`,
        smokeTenant,
        smokePatient,
        smokeUser,
        smokeMeasure,
        `mips-gap-closed-2-${smokeSuffix}`,
        `mips-gap-open-${smokeSuffix}`,
      ],
    );
    await applicationPool!.query(
      `INSERT INTO quality_gaps (
         id, tenant_id, patient_id, provider_id, measure_id,
         gap_type, gap_description, status
       ) VALUES ($1, $2, $3, $4, $5, 'performance', 'updated active episode', 'open')
       ON CONFLICT (tenant_id, patient_id, measure_id) WHERE status = 'open'
       DO UPDATE SET gap_description = EXCLUDED.gap_description`,
      [`mips-gap-open-retry-${smokeSuffix}`, smokeTenant, smokePatient, smokeUser, smokeMeasure],
    );
    await applicationPool!.query(
      `UPDATE quality_gaps
          SET status = 'closed', closed_date = NOW()
        WHERE tenant_id = $1 AND patient_id = $2 AND measure_id = $3 AND status = 'open'`,
      [smokeTenant, smokePatient, smokeMeasure],
    );
    await applicationPool!.query(
      `INSERT INTO quality_gaps (
         id, tenant_id, patient_id, provider_id, measure_id,
         gap_type, gap_description, status
       ) VALUES ($1, $2, $3, $4, $5, 'performance', 'recurrent active episode', 'open')`,
      [`mips-gap-recurrent-${smokeSuffix}`, smokeTenant, smokePatient, smokeUser, smokeMeasure],
    );
    const recurrentGaps = await applicationPool!.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM quality_gaps
        WHERE tenant_id = $1 AND patient_id = $2 AND measure_id = $3
        GROUP BY status
        ORDER BY status`,
      [smokeTenant, smokePatient, smokeMeasure],
    );
    expect(recurrentGaps.rows).toEqual([
      { status: 'closed', count: '3' },
      { status: 'open', count: '1' },
    ]);

    // Exercise the real service upsert against the migrated IA table. The
    // historical title NOT NULL and global activity_id key must both remain
    // satisfied while the tenant/start-date conflict target is used.
    await mipsService.attestIAActivity(
      smokeTenant,
      smokeMeasure,
      smokeUser,
      '2026-01-01',
      '2026-12-31',
      { source: 'postgres-smoke' },
    );
    await mipsService.attestIAActivity(
      smokeTenant,
      smokeMeasure,
      smokeUser,
      '2026-01-01',
      '2026-12-31',
      { source: 'postgres-smoke-upsert' },
    );
    const iaSmoke = await applicationPool!.query<{ count: string; title: string; documentation: Record<string, unknown> }>(
      `SELECT
         (SELECT COUNT(*)::text FROM ia_activities
           WHERE tenant_id = $1 AND activity_id = $2 AND start_date = '2026-01-01') AS count,
         title, documentation
         FROM ia_activities
        WHERE tenant_id = $1 AND activity_id = $2 AND start_date = '2026-01-01'
        LIMIT 1`,
      [smokeTenant, smokeMeasure],
    );
    expect(iaSmoke.rows[0]?.count).toBe('1');
    expect(iaSmoke.rows[0]?.title).toBe('MIPS Legacy Smoke Activity');
    expect(iaSmoke.rows[0]?.documentation).toEqual({ source: 'postgres-smoke-upsert' });

    // Exercise the PI tracking conflict target with a real SQL upsert.
    const piTrackingId = `mips-legacy-pi-${smokeSuffix}`;
    await applicationPool!.query(
      `INSERT INTO promoting_interoperability_tracking (
         id, tenant_id, measure_name, numerator, denominator, performance_rate,
         tracking_period_start, tracking_period_end
       ) VALUES ($1, $2, 'e-Prescribing', 1, 2, 50, '2026-01-01', '2026-12-31')
       ON CONFLICT (tenant_id, measure_name, tracking_period_start)
       DO UPDATE SET numerator = EXCLUDED.numerator,
                     denominator = EXCLUDED.denominator,
                     performance_rate = EXCLUDED.performance_rate`,
      [piTrackingId, smokeTenant],
    );
    await applicationPool!.query(
      `INSERT INTO promoting_interoperability_tracking (
         id, tenant_id, measure_name, numerator, denominator, performance_rate,
         tracking_period_start, tracking_period_end
       ) VALUES ($1, $2, 'e-Prescribing', 2, 2, 100, '2026-01-01', '2026-12-31')
       ON CONFLICT (tenant_id, measure_name, tracking_period_start)
       DO UPDATE SET numerator = EXCLUDED.numerator,
                     denominator = EXCLUDED.denominator,
                     performance_rate = EXCLUDED.performance_rate`,
      [`${piTrackingId}-upsert`, smokeTenant],
    );
    const piSmoke = await applicationPool!.query<{ count: string; numerator: number; performance_rate: number }>(
      `SELECT COUNT(*)::text AS count, MAX(numerator) AS numerator, MAX(performance_rate)::float AS performance_rate
         FROM promoting_interoperability_tracking
        WHERE tenant_id = $1 AND measure_name = 'e-Prescribing' AND tracking_period_start = '2026-01-01'`,
      [smokeTenant],
    );
    expect(piSmoke.rows[0]).toMatchObject({ count: '1', numerator: 2, performance_rate: 100 });

    // Exercise the improvement-activity service upsert target.
    const { qualityMeasuresService } = require('../../services/qualityMeasuresService') as typeof import('../../services/qualityMeasuresService');
    const concurrentPiMeasure = `Concurrent PI ${smokeSuffix}`;
    await Promise.all(Array.from({ length: 20 }, () =>
      qualityMeasuresService.trackPromotingInteroperability(
        smokeTenant,
        concurrentPiMeasure,
        true,
        true,
        smokeUser,
      )
    ));
    const concurrentPi = await applicationPool!.query<{
      count: string;
      numerator: number;
      denominator: number;
      performance_rate: number;
    }>(
      `SELECT COUNT(*)::text AS count,
              MAX(numerator) AS numerator,
              MAX(denominator) AS denominator,
              MAX(performance_rate)::float AS performance_rate
         FROM promoting_interoperability_tracking
        WHERE tenant_id = $1 AND measure_name = $2`,
      [smokeTenant, concurrentPiMeasure],
    );
    expect(concurrentPi.rows[0]).toMatchObject({
      count: '1',
      numerator: 20,
      denominator: 20,
      performance_rate: 100,
    });

    await qualityMeasuresService.attestImprovementActivity(
      smokeTenant,
      smokeMeasure,
      smokeUser,
      '2026-01-01',
      '2026-12-31',
      { source: 'improvement-smoke' },
    );
    await qualityMeasuresService.attestImprovementActivity(
      smokeTenant,
      smokeMeasure,
      smokeUser,
      '2026-01-01',
      '2026-12-31',
      { source: 'improvement-smoke-upsert' },
    );
    const improvementSmoke = await applicationPool!.query<{ count: string; documentation: Record<string, unknown> }>(
      `SELECT COUNT(*)::text AS count, documentation
         FROM improvement_activities
        WHERE tenant_id = $1 AND activity_id = $2 AND start_date = '2026-01-01'
        GROUP BY documentation`,
      [smokeTenant, smokeMeasure],
    );
    expect(improvementSmoke.rows).toHaveLength(1);
    expect(improvementSmoke.rows[0]).toMatchObject({
      count: '1',
      documentation: { source: 'improvement-smoke-upsert' },
    });

    // Practice-level performance has a NULL provider_id. Verify the PG16
    // NULLS NOT DISTINCT target prevents duplicate cached rows.
    const performanceValues = (id: string, rate: number) => applicationPool!.query(
      `INSERT INTO measure_performance (
         id, tenant_id, provider_id, measure_id,
         reporting_period_start, reporting_period_end,
         numerator_count, denominator_count, exclusion_count, performance_rate
       ) VALUES ($1, $2, NULL, $3, '2026-01-01', '2026-12-31', $4, 2, 0, $5)
       ON CONFLICT (tenant_id, provider_id, measure_id, reporting_period_start, reporting_period_end)
       DO UPDATE SET numerator_count = EXCLUDED.numerator_count,
                     performance_rate = EXCLUDED.performance_rate`,
      [id, smokeTenant, smokeMeasure, rate === 100 ? 2 : 1, rate],
    );
    await performanceValues(`mips-legacy-performance-${smokeSuffix}`, 50);
    await performanceValues(`mips-legacy-performance-${smokeSuffix}-upsert`, 100);
    const performanceSmoke = await applicationPool!.query<{ count: string; performance_rate: number }>(
      `SELECT COUNT(*)::text AS count, MAX(performance_rate)::float AS performance_rate
         FROM measure_performance
        WHERE tenant_id = $1 AND provider_id IS NULL AND measure_id = $2`,
      [smokeTenant, smokeMeasure],
    );
    expect(performanceSmoke.rows[0]).toMatchObject({ count: '1', performance_rate: 100 });

    // Exercise the recovery path with a real duplicate no-encounter status.
    // The older row is archived with its full payload; the newest row remains
    // the live record when the NULL-safe target is rebuilt.
    const archiveStatusOld = `mips-legacy-archive-old-${smokeSuffix}`;
    const archiveStatusNew = `mips-legacy-archive-new-${smokeSuffix}`;
    const archiveStatusPriorYear = `mips-legacy-archive-2025-${smokeSuffix}`;
    const historicalBackfillStatus = `mips-legacy-backfill-2024-${smokeSuffix}`;
    await applicationPool!.query('DROP INDEX idx_patient_measure_status_tenant_patient_measure_encounter');
    await applicationPool!.query(
      `INSERT INTO patient_measure_status (
         id, tenant_id, patient_id, measure_id, reporting_year,
         status, status_date, completed_date, documentation, documentation_data,
         performance_met, updated_at, created_at
       ) VALUES
         ($1, $2, $3, $4, 2026, 'met', '2099-01-01', NULL, 'archived old documentation', '{}', true, '2099-01-01', '2099-01-01'),
         ($5, $2, $3, $4, 2026, 'not_met', '2099-01-02', NULL, 'kept newest documentation', '{}', false, '2099-01-02', '2099-01-02'),
         ($6, $2, $3, $4, 2025, 'met', '2025-01-02', NULL, 'prior-year documentation', '{}', true, '2025-01-02', '2025-01-02'),
         ($7, $2, $3, $4, 2024, 'met', NULL, '2024-05-01', 'historical backfill', '{}', false, NULL, '2024-05-01')`,
      [
        archiveStatusOld,
        smokeTenant,
        archivePatient,
        smokeMeasure,
        archiveStatusNew,
        archiveStatusPriorYear,
        historicalBackfillStatus,
      ],
    );
    await applicationPool!.query(`DELETE FROM migrations WHERE name = '234_mips_legacy_integrity'`);
    await runMigrations!();

    const archivedStatus = await applicationPool!.query<{ source_id: string; row_data: { documentation: string } }>(
      `SELECT source_id, row_data
         FROM mips_integrity_duplicate_archive
        WHERE tenant_id = $1
          AND source_table = 'patient_measure_status'
          AND reason = 'duplicate_patient_measure_status'
          AND source_id = $2`,
      [smokeTenant, archiveStatusOld],
    );
    expect(archivedStatus.rows).toHaveLength(1);
    expect(archivedStatus.rows[0]?.row_data.documentation).toBe('archived old documentation');
    const keptStatus = await applicationPool!.query<{ id: string; documentation: string; reporting_year: number }>(
      `SELECT id, documentation, reporting_year
         FROM patient_measure_status
        WHERE tenant_id = $1 AND patient_id = $2 AND measure_id = $3 AND encounter_id IS NULL
        ORDER BY reporting_year`,
      [smokeTenant, archivePatient, smokeMeasure],
    );
    expect(keptStatus.rows).toEqual([
      { id: historicalBackfillStatus, documentation: 'historical backfill', reporting_year: 2024 },
      { id: archiveStatusPriorYear, documentation: 'prior-year documentation', reporting_year: 2025 },
      { id: archiveStatusNew, documentation: 'kept newest documentation', reporting_year: 2026 },
    ]);
    const correctedBackfill = await applicationPool!.query<{ status_date: string; performance_met: boolean }>(
      `SELECT status_date::text, performance_met
         FROM patient_measure_status
        WHERE id = $1`,
      [historicalBackfillStatus],
    );
    expect(correctedBackfill.rows[0]).toEqual({ status_date: '2024-05-01', performance_met: true });

    // Archive identity is tenant-scoped: equal source IDs/reasons from two
    // tenants must not cause the second displaced row to be lost.
    await applicationPool!.query(
      `INSERT INTO mips_integrity_duplicate_archive (tenant_id, source_table, source_id, reason, row_data)
       VALUES
         ($1, 'synthetic', 'same-source-id', 'cross-tenant-test', '{}'),
         ($2, 'synthetic', 'same-source-id', 'cross-tenant-test', '{}')`,
      [smokeTenant, smokeTenantB],
    );
    const crossTenantArchive = await applicationPool!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM mips_integrity_duplicate_archive
        WHERE source_table = 'synthetic' AND source_id = 'same-source-id' AND reason = 'cross-tenant-test'`,
    );
    expect(crossTenantArchive.rows[0]?.count).toBe('2');

    await applicationPool!.query('DELETE FROM quality_gaps WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM patient_measure_status WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM mips_integrity_duplicate_archive WHERE tenant_id IN ($1, $2)', [smokeTenant, smokeTenantB]);
    await applicationPool!.query('DELETE FROM ia_activities WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM promoting_interoperability_tracking WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM improvement_activities WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM measure_performance WHERE tenant_id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM quality_measures WHERE id = $1', [smokeMeasure]);
    await applicationPool!.query('DELETE FROM encounters WHERE id = $1', [smokeEncounter]);
    await applicationPool!.query('DELETE FROM patients WHERE id = $1', [smokePatient]);
    await applicationPool!.query('DELETE FROM patients WHERE id = $1', [archivePatient]);
    await applicationPool!.query('DELETE FROM providers WHERE id = $1', [smokeProvider]);
    await applicationPool!.query('DELETE FROM users WHERE id = $1', [smokeUser]);
    await applicationPool!.query('DELETE FROM tenants WHERE id = $1', [smokeTenant]);
    await applicationPool!.query('DELETE FROM tenants WHERE id = $1', [smokeTenantB]);

    // The migration runner's idempotence guard must also hold for this
    // compatibility migration after the schema already exists.
    const reapplied = await applicationPool!.query<{ name: string }>(
      `SELECT name FROM migrations WHERE name = '234_mips_legacy_integrity'`,
    );
    expect(reapplied.rows).toHaveLength(1);
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
