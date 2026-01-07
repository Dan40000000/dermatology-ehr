const rateLimitMock = jest.fn((options) => options);

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: rateLimitMock,
}));

jest.mock('../../services/audit', () => ({
  createAuditLog: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  checkPatientNotificationLimit,
  incrementPatientNotificationCount,
  getPatientNotificationStats,
  smsRateLimiter,
  emailRateLimiter,
  bulkNotificationLimiter,
} from '../notificationRateLimiter';
import { createAuditLog } from '../../services/audit';
import { logger } from '../../lib/logger';

describe('notificationRateLimiter', () => {
  const auditMock = createAuditLog as jest.Mock;
  const loggerWarn = (logger as any).warn as jest.Mock;
  const loggerError = (logger as any).error as jest.Mock;

  beforeEach(() => {
    auditMock.mockReset();
    loggerWarn.mockReset();
    loggerError.mockReset();
  });

  it('tracks notification limits and resets windows', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const first = await checkPatientNotificationLimit('tenant-1', 'patient-1', 'sms', 2, 1000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    await incrementPatientNotificationCount('tenant-1', 'patient-1', 'sms');
    const second = await checkPatientNotificationLimit('tenant-1', 'patient-1', 'sms', 2, 1000);
    expect(second.remaining).toBe(1);

    jest.setSystemTime(new Date('2024-01-01T00:00:02Z'));
    const third = await checkPatientNotificationLimit('tenant-1', 'patient-1', 'sms', 2, 1000);
    expect(third.remaining).toBe(2);

    jest.useRealTimers();
  });

  it('returns stats for sms and email counts', async () => {
    await incrementPatientNotificationCount('tenant-2', 'patient-2', 'sms');
    await incrementPatientNotificationCount('tenant-2', 'patient-2', 'email');

    const stats = await getPatientNotificationStats('tenant-2', 'patient-2');
    expect(stats.sms.count).toBe(1);
    expect(stats.email.count).toBe(1);
  });

  it('allows rate limiter to pass through when missing identifiers', async () => {
    const req = { headers: {}, body: {}, params: {} } as any;
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    await smsRateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks sms when limit exceeded', async () => {
    for (let i = 0; i < 100; i += 1) {
      await incrementPatientNotificationCount('tenant-3', 'patient-3', 'sms');
    }

    const req = {
      headers: { 'x-tenant-id': 'tenant-3' },
      body: { patientId: 'patient-3' },
      params: {},
      ip: '127.0.0.1',
      user: { id: 'user-3' },
    } as any;
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    await smsRateLimiter(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'SMS rate limit exceeded for this patient' })
    );
    expect(auditMock).toHaveBeenCalled();
  });

  it('allows email requests under the limit', async () => {
    const req = {
      headers: { 'x-tenant-id': 'tenant-4' },
      body: { patientId: 'patient-4' },
      params: {},
      ip: '127.0.0.1',
      user: { id: 'user-4' },
    } as any;
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    await emailRateLimiter(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('logs bulk notification rate limit events', async () => {
    const req = { user: { tenantId: 'tenant-5', id: 'user-5' }, ip: '127.0.0.1', path: '/bulk', method: 'POST' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    const handler = (bulkNotificationLimiter as any).handler as (req: any, res: any) => Promise<void>;
    await handler(req, res);

    expect(auditMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Bulk notification rate limit exceeded' })
    );
  });
});
