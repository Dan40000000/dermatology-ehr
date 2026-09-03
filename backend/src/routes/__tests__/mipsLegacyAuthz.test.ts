import express from 'express';
import request from 'supertest';
import { mipsRouter } from '../mips';
import { qualityMeasuresRouter } from '../qualityMeasures';
import { pool } from '../../db/pool';
import { mipsService } from '../../services/mipsService';
import { qualityMeasuresService } from '../../services/qualityMeasuresService';
import { auditLog } from '../../services/audit';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-a',
      tenantId: 'tenant-a',
      role: String(req.headers['x-test-role'] || 'admin'),
    };
    req.tenantId = 'tenant-a';
    return next();
  },
}));

jest.mock('../../middleware/rateLimit', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/mipsService', () => ({
  mipsService: {
    recordMeasureStatus: jest.fn(),
    resolveProviderId: jest.fn(),
    estimateMIPSScore: jest.fn(),
  },
  MipsReferenceValidationError: class MipsReferenceValidationError extends Error {
    statusCode = 400;
    code = 'MIPS_REFERENCE_INVALID';
  },
}));

jest.mock('../../services/qualityMeasuresService', () => ({
  qualityMeasuresService: {
    getDermatologyMeasures: jest.fn(),
    trackPromotingInteroperability: jest.fn(),
  },
  DERM_MEASURES: {},
  PI_MEASURES: {},
}));

const app = express();
app.use(express.json());
app.use('/api/mips', mipsRouter);
app.use('/api/quality', qualityMeasuresRouter);

const queryMock = pool.query as jest.Mock;
const recordMeasureStatusMock = mipsService.recordMeasureStatus as jest.Mock;
const resolveProviderIdMock = mipsService.resolveProviderId as jest.Mock;
const estimateMipsScoreMock = mipsService.estimateMIPSScore as jest.Mock;
const trackPiMock = qualityMeasuresService.trackPromotingInteroperability as jest.Mock;

const REPORTING_ROLES = ['admin', 'provider', 'manager', 'compliance_officer'];
const NON_REPORTING_ROLES = ['ma', 'nurse', 'billing', 'front_desk'];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  recordMeasureStatusMock.mockReset();
  recordMeasureStatusMock.mockResolvedValue({
    id: 'status-a',
    patientId: 'patient-a',
    measureId: 'measure-a',
    status: 'met',
    statusDate: '2026-01-01',
    documentationData: {},
    performanceMet: true,
  });
  resolveProviderIdMock.mockReset();
  resolveProviderIdMock.mockResolvedValue('provider-a');
  estimateMipsScoreMock.mockReset();
  estimateMipsScoreMock.mockResolvedValue({
    estimated: 0,
    quality: 0,
    pi: 0,
    ia: 0,
    cost: 0,
    paymentAdjustment: 0,
    trajectory: 'stable',
    projectedYear: 2026,
  });
  trackPiMock.mockReset();
  trackPiMock.mockResolvedValue({
    measureName: 'e-Prescribing',
    numerator: 1,
    denominator: 1,
    performanceRate: 100,
    isRequired: true,
  });
  (auditLog as jest.Mock).mockReset();
  (auditLog as jest.Mock).mockResolvedValue(undefined);
});

describe('legacy MIPS reporting role matrix', () => {
  it.each(REPORTING_ROLES)('allows %s to read MIPS measures', async (role) => {
    const response = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', role);

    expect(response.status).toBe(200);
  });

  it.each(NON_REPORTING_ROLES)('returns 403 for %s on MIPS measure reads', async (role) => {
    const response = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', role);

    expect(response.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(REPORTING_ROLES)('allows %s to write patient measure status', async (role) => {
    const response = await request(app)
      .post('/api/mips/patient/patient-a/measure')
      .set('X-Test-Role', role)
      .send({ measureId: 'measure-a', status: 'met' });

    expect(response.status).toBe(200);
  });

  it.each(NON_REPORTING_ROLES)('returns 403 for %s on patient measure writes', async (role) => {
    const response = await request(app)
      .post('/api/mips/patient/patient-a/measure')
      .set('X-Test-Role', role)
      .send({ measureId: 'measure-a', status: 'met' });

    expect(response.status).toBe(403);
    expect(recordMeasureStatusMock).not.toHaveBeenCalled();
  });

  it.each(REPORTING_ROLES)('allows %s to read quality measures', async (role) => {
    const response = await request(app)
      .get('/api/quality/measures')
      .set('X-Test-Role', role);

    expect(response.status).toBe(200);
  });

  it.each(NON_REPORTING_ROLES)('returns 403 for %s on quality measure reads', async (role) => {
    const response = await request(app)
      .get('/api/quality/measures')
      .set('X-Test-Role', role);

    expect(response.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(REPORTING_ROLES)('allows %s to write PI tracking', async (role) => {
    const response = await request(app)
      .post('/api/quality/pi/track')
      .set('X-Test-Role', role)
      .send({ measureName: 'e-Prescribing', incrementNumerator: true, incrementDenominator: true });

    expect(response.status).toBe(200);
  });

  it.each(NON_REPORTING_ROLES)('returns 403 for %s on PI tracking writes', async (role) => {
    const response = await request(app)
      .post('/api/quality/pi/track')
      .set('X-Test-Role', role)
      .send({ measureName: 'e-Prescribing' });

    expect(response.status).toBe(403);
    expect(trackPiMock).not.toHaveBeenCalled();
  });

  it('keeps submission transport admin-only even for reporting roles', async () => {
    const providerResponse = await request(app)
      .post('/api/mips/submit')
      .set('X-Test-Role', 'provider')
      .send({});
    expect(providerResponse.status).toBe(403);

    const adminResponse = await request(app)
      .post('/api/mips/submit')
      .set('X-Test-Role', 'admin')
      .send({});
    expect(adminResponse.status).toBe(501);
  });

  it('maps provider ids to the user namespace for provider care-gap counts', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // measures
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }) // gaps
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 }); // patients

    const response = await request(app)
      .get('/api/mips/provider/provider-a/dashboard?year=2026')
      .set('X-Test-Role', 'provider');

    expect(response.status).toBe(200);
    expect(response.body.careGapCount).toBe(2);
    const gapSql = String(queryMock.mock.calls[1]?.[0]);
    expect(gapSql).toContain('SELECT user_id FROM providers');
    expect(queryMock.mock.calls[1]?.[1]).toEqual(['tenant-a', 'provider-a']);
  });
});
