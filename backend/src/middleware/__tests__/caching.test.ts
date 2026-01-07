const cacheServiceMock = {
  get: jest.fn(),
  set: jest.fn(),
  delPattern: jest.fn(),
};

jest.mock('../../services/cacheService', () => ({
  cacheService: cacheServiceMock,
  CacheTTL: {
    SHORT: 60,
    MEDIUM: 300,
    LONG: 3600,
    VERY_LONG: 86400,
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { logger } from '../../lib/logger';
import { pool } from '../../db/pool';
import {
  cache,
  CachePresets,
  invalidateAppointmentCache,
  invalidateCache,
  invalidateCacheAfter,
  invalidatePatientCache,
  invalidateTenantCache,
  warmupCache,
} from '../caching';

const makeReq = (overrides: any = {}) =>
  ({
    method: 'GET',
    path: '/patients',
    query: {},
    user: { id: 'user-1', role: 'admin', tenantId: 'tenant-1' },
    ...overrides,
  }) as any;

const makeRes = () =>
  ({
    statusCode: 200,
    setHeader: jest.fn(),
    json: jest.fn(function (this: any, body: any) {
      return body;
    }),
    send: jest.fn(function (this: any, body: any) {
      return body;
    }),
  }) as any;

describe('caching middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheServiceMock.get.mockResolvedValue(null);
    cacheServiceMock.set.mockResolvedValue(undefined);
    cacheServiceMock.delPattern.mockResolvedValue(1);
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  it('skips caching for non-GET requests', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    const next = jest.fn();

    await cache()(req, res, next);

    expect(cacheServiceMock.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('skips caching when condition fails', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await cache({ condition: () => false })(req, res, next);

    expect(cacheServiceMock.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('returns cached responses on hit', async () => {
    cacheServiceMock.get.mockResolvedValueOnce({ ok: true });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await cache()(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('stores cache on miss', async () => {
    const req = makeReq({ query: { page: '1' } });
    const res = makeRes();
    const next = jest.fn();

    await cache()(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
    expect(next).toHaveBeenCalled();

    res.json({ ok: true });

    expect(cacheServiceMock.set).toHaveBeenCalledWith(
      'api:tenant-1:/patients:page=1',
      { ok: true },
      300
    );
  });

  it('continues without caching on cache errors', async () => {
    cacheServiceMock.get.mockRejectedValueOnce(new Error('boom'));
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await cache()(req, res, next);

    expect(logger.error).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('invalidates cache after successful response', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await invalidateCacheAfter(['patients:*'])(req, res, next);

    res.json({ ok: true });

    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('patients:*');
  });

  it('supports no-cache preset', async () => {
    const res = makeRes();
    const next = jest.fn();

    CachePresets.noCache()(makeReq(), res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate');
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'DISABLED');
    expect(next).toHaveBeenCalled();
  });

  it('invalidates tenant, patient, and appointment caches', async () => {
    await invalidateTenantCache('tenant-1');
    await invalidatePatientCache('tenant-1', 'patient-1');
    await invalidateAppointmentCache('tenant-1', 'provider-1', 'location-1');

    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('api:tenant-1:*');
    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('*patient:patient-1*');
    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('*patients:tenant-1*');
    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('*appointments:tenant-1*');
    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('*appointments:provider:provider-1*');
    expect(cacheServiceMock.delPattern).toHaveBeenCalledWith('*appointments:location:location-1*');
  });

  it('returns cache invalidation count and handles errors', async () => {
    cacheServiceMock.delPattern.mockResolvedValueOnce(2);
    await expect(invalidateCache('patients:*')).resolves.toBe(2);

    cacheServiceMock.delPattern.mockRejectedValueOnce(new Error('fail'));
    await expect(invalidateCache('patients:*')).resolves.toBe(0);
  });

  it('handles warmup errors gracefully', async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await warmupCache('tenant-1');

    expect(logger.error).toHaveBeenCalledWith(
      'Cache warmup error',
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
  });
});
