import express from 'express';
import request from 'supertest';
import { mipsReadinessRouter } from '../mipsReadiness';
import { mipsRouter } from '../mips';
import { pool } from '../../db/pool';
import { auditLog } from '../../services/audit';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ error: 'Missing token' });
    const tenantId = String(req.headers['x-test-tenant'] || 'tenant-a');
    req.user = { id: 'user-a', tenantId, role: 'admin' };
    req.tenantId = tenantId;
    return next();
  },
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/rateLimit', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use('/api/mips/readiness', mipsReadinessRouter);
app.use('/api/mips', mipsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  auditMock.mockReset();
  auditMock.mockResolvedValue(undefined);
});

const profileRow = {
  id: 'profile-a',
  tenant_id: 'tenant-a',
  performance_year: 2026,
  selected_quality_measure_ids: ['AAD12'],
  selected_cost_measure_ids: ['COST_MR_1'],
  selected_ia_ids: ['IA_MVP'],
  category_config: {
    qualityStartDate: '2026-01-01',
    qualityEndDate: '2026-12-31',
    iaStartDate: '2026-01-01',
    iaEndDate: '2026-03-31',
  },
  eligibility_inputs: {
    newlyEnrolled: false,
    qualifiedParticipant: false,
    allowedCharges: 0,
    beneficiaryCount: 0,
    coveredServices: 0,
  },
};

describe('MIPS readiness routes', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/mips/readiness?year=2026');
    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported years before touching the database', async () => {
    const response = await request(app)
      .get('/api/mips/readiness?year=2025')
      .set('Authorization', 'Bearer test-token');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_MIPS_YEAR');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns tenant-scoped aggregate overview with explicit non-submission states', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [profileRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 'evidence-a',
        tenant_id: 'tenant-a',
        performance_year: 2026,
        category: 'quality',
        measure_id: 'AAD12',
        evidence_type: 'pathology',
        source_type: 'synthetic',
        source_id: 'path-a',
        observed_at: '2026-03-01',
        recorded_at: '2026-03-01',
        status: 'candidate',
        metadata: { biopsyDate: '2026-03-01', pathologyReportDate: '2026-03-08' },
      }] });

    const response = await request(app)
      .get('/api/mips/readiness?year=2026')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-a');

    expect(response.status).toBe(200);
    expect(response.body.year).toBe(2026);
    expect(response.body.catalog.paymentYear).toBe(2028);
    expect(response.body.profile.selectedQualityMeasureIds).toEqual(['AAD12']);
    expect(response.body.eligibility.status).toBe('voluntary');
    expect(response.body.submissionState).toBe('not_submitted');
    expect(response.body.exportState).toBe('not_ready');
    expect(response.body.registryPartner.state).toBe('external_not_connected');
    expect(response.body.evidenceSummary.count).toBe(1);
    expect(response.body.evidenceSummary.byCategory.quality).toBe(1);
    expect(response.body.evidence).toBeUndefined();
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-a', 2026]);
    expect(queryMock.mock.calls[1][1]).toEqual(['tenant-a', 2026]);
  });

  it('does not present candidate completeness counts as complete', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [profileRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 'completeness-candidate',
        tenant_id: 'tenant-a',
        performance_year: 2026,
        category: 'quality',
        measure_id: null,
        evidence_type: 'data_completeness',
        source_type: 'synthetic',
        source_id: 'aggregate-2026',
        recorded_at: '2026-07-01T00:00:00Z',
        status: 'candidate',
        metadata: { completeCount: 75, eligibleCount: 100 },
      }] });

    const response = await request(app)
      .get('/api/mips/readiness?year=2026')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.dataCompleteness.status).toBe('unknown');
    expect(response.body.dataCompleteness.reasons.join(' ')).toMatch(/human verification/i);
    expect(response.body.categories.quality.status).toBe('action_needed');
  });

  it('upserts profile for the authenticated tenant and audits the mutation', async () => {
    queryMock.mockResolvedValueOnce({ rows: [profileRow] });
    const response = await request(app)
      .put('/api/mips/readiness/profile')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-a')
      .send({
        year: 2026,
        selectedQualityMeasureIds: ['AAD12'],
        selectedCostMeasureIds: ['COST_MR_1'],
        selectedImprovementActivityIds: ['IA_MVP'],
        eligibilityInputs: { newlyEnrolled: false, qualifiedParticipant: false },
        categoryConfiguration: {
          qualityStartDate: '2026-01-01',
          qualityEndDate: '2026-12-31',
          iaStartDate: '2026-01-01',
          iaEndDate: '2026-03-31',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.profile.id).toBe('profile-a');
    expect(queryMock.mock.calls[0][1][1]).toBe('tenant-a');
    expect(queryMock.mock.calls[0][1][2]).toBe(2026);
    expect(String(queryMock.mock.calls[0][0])).toContain('ON CONFLICT (tenant_id, performance_year)');
    expect(auditMock).toHaveBeenCalledWith('tenant-a', 'user-a', 'mips_readiness_profile_updated', 'mips_readiness_profile', 'profile-a');
  });

  it('rejects direct identifiers/raw text in evidence metadata without a query or audit', async () => {
    const response = await request(app)
      .post('/api/mips/readiness/evidence')
      .set('Authorization', 'Bearer test-token')
      .send({
        year: 2026,
        category: 'quality',
        measureId: 'AAD12',
        evidenceType: 'manual_attestation',
        sourceType: 'qpp_manual',
        metadata: { rawText: 'synthetic note' },
      });

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('creates and lists structured evidence tenant-scoped', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const createResponse = await request(app)
      .post('/api/mips/readiness/evidence')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-b')
      .send({
        year: 2026,
        category: 'quality',
        measureId: 'AAD12',
        evidenceType: 'manual_attestation',
        sourceType: 'qpp_manual',
        observedAt: '2026-03-01',
        metadata: {},
        status: 'candidate',
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.evidence.sourceId).toMatch(/^manual:/);
    expect(queryMock.mock.calls[0][1][1]).toBe('tenant-b');
    expect(auditMock).toHaveBeenCalledWith('tenant-b', 'user-a', 'mips_readiness_evidence_created', 'mips_readiness_evidence', expect.any(String));

    queryMock.mockResolvedValueOnce({ rows: [{
      id: 'evidence-b', tenant_id: 'tenant-b', performance_year: 2026, category: 'cost',
      measure_id: 'COST_MR_1', evidence_type: 'cost-summary', source_type: 'claims', source_id: 'cost-b',
      status: 'pending', metadata: { eligibleCount: 1 },
    }] });
    const listResponse = await request(app)
      .get('/api/mips/readiness/evidence?year=2026&category=cost')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-b');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.evidence[0].sourceId).toBe('cost-b');
    expect(queryMock.mock.calls[1][1].slice(0, 2)).toEqual(['tenant-b', 2026]);
    expect(String(queryMock.mock.calls[1][0])).toContain('tenant_id = $1');
  });

  it('requires the review endpoint for verified status and rejects untyped metadata', async () => {
    const verifiedAtCreate = await request(app)
      .post('/api/mips/readiness/evidence')
      .set('Authorization', 'Bearer test-token')
      .send({
        year: 2026,
        category: 'quality',
        measureId: 'AAD12',
        evidenceType: 'manual_attestation',
        sourceType: 'qpp_manual',
        metadata: {},
        status: 'verified',
      });
    expect(verifiedAtCreate.status).toBe(400);

    const untypedMetadata = await request(app)
      .post('/api/mips/readiness/evidence')
      .set('Authorization', 'Bearer test-token')
      .send({
        year: 2026,
        category: 'quality',
        measureId: 'AAD12',
        evidenceType: 'manual_attestation',
        sourceType: 'qpp_manual',
        metadata: { customField: 'not allowed' },
        status: 'candidate',
      });
    expect(untypedMetadata.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('reviews an automation candidate explicitly and keeps the tenant boundary in the update', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      id: 'auto-evidence-a', tenant_id: 'tenant-a', performance_year: 2026, category: 'quality',
      measure_id: '440', evidence_type: 'pathology_turnaround', source_type: 'biopsy',
      source_id: 'synthetic-biopsy-a', status: 'verified', origin: 'automation',
      automation_rule_id: 'mips-440-biopsy-v2026.1', source_revision: 2,
      metadata: { computedStatus: 'met', requiresHumanVerification: true },
      reviewed_at: '2026-09-02T12:00:00Z', updated_at: '2026-09-02T12:00:00Z',
    }] });
    const response = await request(app)
      .patch('/api/mips/readiness/evidence/auto-evidence-a/review?year=2026')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-a')
      .send({ status: 'verified', sourceRevision: 2 });
    expect(response.status).toBe(200);
    expect(response.body.evidence).toMatchObject({
      id: 'auto-evidence-a', origin: 'automation', status: 'verified',
      automationRuleId: 'mips-440-biopsy-v2026.1', sourceRevision: 2,
    });
    expect(queryMock.mock.calls[0][1]).toEqual(['verified', 'user-a', 'auto-evidence-a', 'tenant-a', 2026, 2]);
    expect(auditMock).toHaveBeenCalledWith('tenant-a', 'user-a', 'mips_readiness_evidence_reviewed', 'mips_readiness_evidence', 'auto-evidence-a');
  });

  it('refuses a review when the evidence source revision changed', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(app)
      .patch('/api/mips/readiness/evidence/auto-evidence-a/review?year=2026')
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'verified', sourceRevision: 1 });
    expect(response.status).toBe(409);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('returns aggregate automation coverage without patient rows', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{
        id: 'run-a', status: 'completed', connector_summary: [], candidates_created: 2,
        candidates_updated: 1, candidates_unchanged: 3, started_at: '2026-09-02T12:00:00Z',
        completed_at: '2026-09-02T12:00:01Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ source_type: 'biopsy', status: 'candidate', count: 2 }] });
    const response = await request(app)
      .get('/api/mips/readiness/automation?year=2026')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-a');
    expect(response.status).toBe(200);
    expect(response.body.coverage.map((item: any) => item.id)).toEqual(['176', '440', 'AAD6', '485/486']);
    expect(response.body.safety).toMatchObject({ automaticCredit: false, externalSubmission: false });
    expect(JSON.stringify(response.body)).not.toMatch(/patient[_-]?id/i);
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-a', 2026]);
    expect(queryMock.mock.calls[1][1]).toEqual(['tenant-a', 2026]);
  });

  it('rejects out-of-scale itch assessment data before opening a transaction', async () => {
    const response = await request(app)
      .post('/api/mips/readiness/itch-assessments')
      .set('Authorization', 'Bearer test-token')
      .send({
        patientId: '11111111-1111-4111-8111-111111111111',
        encounterId: '22222222-2222-4222-8222-222222222222',
        conditionCode: 'atopic_dermatitis', instrumentCode: 'WI-NRS',
        instrumentVersion: 'practice-v1', score: 12, scaleMin: 0, scaleMax: 10,
        assessmentDate: '2026-09-02', phase: 'baseline', clientEventId: 'synthetic-event-1',
      });
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('records a tenant-owned itch assessment and creates an automatic candidate in one transaction', async () => {
    const assessment = {
      id: 'assessment-a', patient_id: '11111111-1111-4111-8111-111111111111',
      condition_code: 'atopic_dermatitis', instrument_code: 'practice_numeric_itch_scale',
      instrument_version: 'practice-v1', score: '7', scale_min: '0', scale_max: '10',
      assessment_date: '2026-09-02', phase: 'baseline', source_revision: 1,
      updated_at: '2026-09-02T12:00:00Z',
    };
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: assessment.patient_id }] })
        .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }] })
        .mockResolvedValueOnce({ rows: [assessment] })
        .mockResolvedValueOnce({ rows: [assessment] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'itch-evidence-a', status: 'candidate' }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    connectMock.mockResolvedValueOnce(client);
    const response = await request(app)
      .post('/api/mips/readiness/itch-assessments')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Tenant', 'tenant-a')
      .send({
        patientId: assessment.patient_id,
        encounterId: '22222222-2222-4222-8222-222222222222',
        conditionCode: 'atopic_dermatitis', instrumentCode: 'practice_numeric_itch_scale',
        instrumentVersion: 'practice-v1', score: 7, scaleMin: 0, scaleMax: 10,
        assessmentDate: '2026-09-02', phase: 'baseline', clientEventId: 'synthetic-event-baseline',
      });
    expect(response.status).toBe(201);
    expect(response.body.assessment).toMatchObject({ conditionCode: 'atopic_dermatitis', score: 7, phase: 'baseline' });
    expect(response.body.candidateCapture).toMatchObject({ action: 'created', status: 'candidate' });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO mips_readiness_evidence'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('labels preview as draft JSON-only and never submitted', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await request(app)
      .get('/api/mips/readiness/preview?year=2026')
      .set('Authorization', 'Bearer test-token');
    expect(response.status).toBe(200);
    expect(response.body.draft).toBe(true);
    expect(response.body.nonSubmission).toBe(true);
    expect(response.body.submissionState).toBe('not_submitted');
    expect(response.body.transportState).toBe('not_configured');
    expect(response.body.manifest).toBeTruthy();
  });

  it('keeps the legacy MIPS submission endpoint non-successful and side-effect free', async () => {
    const response = await request(app)
      .post('/api/mips/submit')
      .set('Authorization', 'Bearer test-token')
      .send({ year: 2026 });
    expect(response.status).toBe(501);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('MIPS_SUBMISSION_NOT_CONFIGURED');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
