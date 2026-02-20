import request from 'supertest';
import express from 'express';
import ambientScribeRouter from '../ambientScribe';
import { pool } from '../../db/pool';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = String(req.headers['x-test-role'] || 'provider');
    req.user = { id: 'user-1', tenantId: 'tenant-1', role };
    return next();
  },
}));

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/ambient', ambientScribeRouter);

const queryMock = pool.query as jest.Mock;
const SENSITIVE_READ_ENDPOINTS = [
  '/api/ambient/transcripts/transcript-1',
  '/api/ambient/notes/note-1',
  '/api/ambient/patient-summaries/patient-1',
] as const;
const CLINICAL_ROLES = ['provider', 'admin', 'ma'] as const;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Ambient Scribe Route AuthZ', () => {
  it('blocks front desk users from listing ambient recordings', async () => {
    const res = await request(app)
      .get('/api/ambient/recordings')
      .set('x-test-role', 'front_desk');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient role');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('blocks front desk users from starting ambient recording', async () => {
    const res = await request(app)
      .post('/api/ambient/recordings/start')
      .set('x-test-role', 'front_desk')
      .send({
        patientId: 'patient-1',
        providerId: 'provider-1',
        consentObtained: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient role');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('allows provider role through middleware (non-403)', async () => {
    const res = await request(app)
      .post('/api/ambient/recordings/start')
      .set('x-test-role', 'provider')
      .send({
        // intentionally invalid to prove middleware passed role gate and reached validation
        patientId: 'patient-1',
      });

    expect(res.status).toBe(400);
  });

  it.each(SENSITIVE_READ_ENDPOINTS)(
    'blocks front desk users from sensitive read endpoint %s',
    async (path) => {
      const res = await request(app)
        .get(path)
        .set('x-test-role', 'front_desk');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient role');
      expect(queryMock).not.toHaveBeenCalled();
    }
  );

  it.each(
    CLINICAL_ROLES.flatMap((role) =>
      SENSITIVE_READ_ENDPOINTS.map((path) => ({ role, path }))
    )
  )(
    'allows %s role through middleware for sensitive read endpoint %s (non-403)',
    async ({ role, path }) => {
      const res = await request(app)
        .get(path)
        .set('x-test-role', role);

      expect(res.status).not.toBe(403);
      expect(queryMock).toHaveBeenCalled();
    }
  );
});
