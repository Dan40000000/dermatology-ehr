import jwt from 'jsonwebtoken';
import { requirePatientAuth, cleanupExpiredSessions } from '../patientPortalAuth';
import { pool } from '../../db/pool';

jest.mock('../../config/env', () => ({
  env: {
    jwtSecret: 'test-secret',
    tenantHeader: 'x-tenant-id',
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

const makeReq = (overrides: Record<string, any> = {}) => ({
  headers: {},
  header: jest.fn(),
  get: jest.fn(),
  method: 'GET',
  path: '/portal',
  ip: '1.1.1.1',
  ...overrides,
});

const signToken = (tenantId = 'tenant-1') =>
  jwt.sign(
    {
      accountId: 'account-1',
      patientId: 'patient-1',
      tenantId,
      email: 'patient@example.com',
    },
    'test-secret'
  );

describe('patientPortalAuth middleware', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('rejects missing authentication token', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing authentication token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects missing tenant header', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue(undefined),
    });
    const res = makeRes();
    const next = jest.fn();

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant header: x-tenant-id' });
  });

  it('rejects invalid authentication token', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer invalid.token' },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
  });

  it('rejects tenant mismatch', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-2'),
    });
    const res = makeRes();
    const next = jest.fn();

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid tenant' });
  });

  it('rejects when session is missing', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({ rows: [] });

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired session' });
  });

  it('rejects inactive accounts', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          account_id: 'account-1',
          patient_id: 'patient-1',
          email: 'patient@example.com',
          first_name: 'Pat',
          last_name: 'Ient',
          is_active: false,
          locked_until: null,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          last_activity: new Date().toISOString(),
        },
      ],
    });

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account is inactive' });
  });

  it('rejects locked accounts', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();
    const lockedUntil = new Date(Date.now() + 60_000).toISOString();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          account_id: 'account-1',
          patient_id: 'patient-1',
          email: 'patient@example.com',
          first_name: 'Pat',
          last_name: 'Ient',
          is_active: true,
          locked_until: lockedUntil,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          last_activity: new Date().toISOString(),
        },
      ],
    });

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Account is temporarily locked due to failed login attempts',
      lockedUntil,
    });
  });

  it('expires sessions that are past expiration', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            account_id: 'account-1',
            patient_id: 'patient-1',
            email: 'patient@example.com',
            first_name: 'Pat',
            last_name: 'Ient',
            is_active: true,
            locked_until: null,
            expires_at: new Date(Date.now() - 60_000).toISOString(),
            last_activity: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired' });
    expect(queryMock.mock.calls[1][0]).toContain('DELETE FROM patient_portal_sessions');
  });

  it('expires sessions that are inactive too long', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
    });
    const res = makeRes();
    const next = jest.fn();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            account_id: 'account-1',
            patient_id: 'patient-1',
            email: 'patient@example.com',
            first_name: 'Pat',
            last_name: 'Ient',
            is_active: true,
            locked_until: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_activity: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    await requirePatientAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired due to inactivity' });
    expect(queryMock.mock.calls[1][0]).toContain('DELETE FROM patient_portal_sessions');
  });

  it('authenticates and logs portal access', async () => {
    const token = signToken('tenant-1');
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` },
      header: jest.fn().mockReturnValue('tenant-1'),
      get: jest.fn().mockReturnValue('agent'),
    });
    const res = makeRes();
    const next = jest.fn();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            account_id: 'account-1',
            patient_id: 'patient-1',
            email: 'patient@example.com',
            first_name: 'Pat',
            last_name: 'Ient',
            is_active: true,
            locked_until: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_activity: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await requirePatientAuth(req as any, res as any, next);

    expect(req.patient).toEqual({
      accountId: 'account-1',
      patientId: 'patient-1',
      tenantId: 'tenant-1',
      email: 'patient@example.com',
      firstName: 'Pat',
      lastName: 'Ient',
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryMock.mock.calls[1][0]).toContain('UPDATE patient_portal_sessions');
    expect(queryMock.mock.calls[2][0]).toContain('INSERT INTO audit_log');
    expect(next).toHaveBeenCalled();
  });
});

describe('cleanupExpiredSessions', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('logs cleanup count', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    queryMock.mockResolvedValueOnce({ rowCount: 2 });

    await cleanupExpiredSessions();

    expect(queryMock).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Cleaned up 2 expired patient portal sessions');
    logSpy.mockRestore();
  });

  it('logs errors without throwing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockRejectedValueOnce(new Error('db down'));

    await cleanupExpiredSessions();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
