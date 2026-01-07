jest.mock('../../lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

import { cacheService, CacheKeys, CacheTTL } from '../cacheService';

describe('cacheService', () => {
  beforeEach(async () => {
    await cacheService.clear();
    cacheService.resetStats();
  });

  afterAll(() => {
    cacheService.stopCleanup();
  });

  it('stores and retrieves cache entries', async () => {
    await cacheService.set('test:key', { ok: true }, 60);
    const value = await cacheService.get('test:key');

    expect(value).toEqual({ ok: true });
    const stats = cacheService.getStats();
    expect(stats.hits).toBe(1);
  });

  it('tracks cache misses', async () => {
    const value = await cacheService.get('missing:key');

    expect(value).toBeNull();
    expect(cacheService.getStats().misses).toBe(1);
  });

  it('expires entries based on ttl', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000);
    await cacheService.set('expiring:key', 'value', 1);

    nowSpy.mockReturnValue(3000);
    const value = await cacheService.get('expiring:key');

    expect(value).toBeNull();
    expect(cacheService.getStats().evictions).toBeGreaterThan(0);
    nowSpy.mockRestore();
  });

  it('deletes entries by pattern', async () => {
    await cacheService.set('patient:1', 'a');
    await cacheService.set('patient:2', 'b');
    await cacheService.set('provider:1', 'c');

    const deleted = await cacheService.delPattern('patient:*');

    expect(deleted).toBe(2);
    expect(await cacheService.get('patient:1')).toBeNull();
    expect(await cacheService.get('provider:1')).toBe('c');
  });

  it('checks for key existence', async () => {
    await cacheService.set('exists:key', 'value');

    expect(await cacheService.exists('exists:key')).toBe(true);
    expect(await cacheService.exists('missing:key')).toBe(false);
  });

  it('fetches and caches values with getOrSet', async () => {
    const fetchFn = jest.fn().mockResolvedValue('result');

    const first = await cacheService.getOrSet('fetch:key', fetchFn, 60);
    const second = await cacheService.getOrSet('fetch:key', fetchFn, 60);

    expect(first).toBe('result');
    expect(second).toBe('result');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('clears cache and resets stats', async () => {
    await cacheService.set('clear:key', 'value');

    await cacheService.clear();
    const stats = cacheService.getStats();

    expect(stats.keys).toBe(0);
    expect(stats.size).toBe(0);
  });

  it('builds consistent cache keys', () => {
    expect(CacheKeys.patient('1')).toBe('patient:1');
    expect(CacheKeys.patientList('tenant', 2)).toBe('patients:tenant:page:2');
    expect(CacheKeys.appointmentsByProvider('p1', '2024-01-01')).toBe('appointments:provider:p1:date:2024-01-01');
    expect(CacheKeys.icd10Codes('rash')).toBe('icd10:search:rash');
    expect(CacheKeys.icd10Codes()).toBe('icd10:all');
  });

  it('exposes cache ttl constants', () => {
    expect(CacheTTL.SHORT).toBe(60);
    expect(CacheTTL.MEDIUM).toBe(300);
    expect(CacheTTL.LONG).toBe(3600);
    expect(CacheTTL.VERY_LONG).toBe(86400);
    expect(CacheTTL.SESSION).toBe(7200);
  });
});
