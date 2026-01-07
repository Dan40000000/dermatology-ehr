const makeMetric = (opts: any) => ({
  opts,
  inc: jest.fn(),
  observe: jest.fn(),
  set: jest.fn(),
});

const Histogram = jest.fn().mockImplementation(makeMetric);
const Counter = jest.fn().mockImplementation(makeMetric);
const Gauge = jest.fn().mockImplementation(makeMetric);
const collectDefaultMetrics = jest.fn();

class Registry {}

jest.mock('prom-client', () => ({
  __esModule: true,
  default: { Registry, collectDefaultMetrics, Histogram, Counter, Gauge },
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
  Gauge,
}));

import {
  httpRequestDuration,
  httpRequestTotal,
  databaseQueryDuration,
  authAttempts,
  cacheHits,
  cacheMisses,
  auditLogTotal,
  trackHttpRequest,
  trackDatabaseQuery,
  trackAuthAttempt,
  trackCacheHit,
  trackCacheMiss,
  trackAuditEvent,
} from '../metrics';

describe('metrics helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks http request metrics', () => {
    trackHttpRequest('GET', '/health', 200, 0.42);

    expect(httpRequestTotal.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
      status_code: 200,
    });
    expect(httpRequestDuration.observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/health', status_code: 200 },
      0.42
    );
  });

  it('tracks database query timing', () => {
    trackDatabaseQuery('select', 1.2);

    expect(databaseQueryDuration.observe).toHaveBeenCalledWith(
      { query_type: 'select' },
      1.2
    );
  });

  it('tracks auth attempts and cache metrics', () => {
    trackAuthAttempt('success', 'password');
    trackCacheHit('appointments');
    trackCacheMiss('appointments');
    trackAuditEvent('login', 'admin');

    expect(authAttempts.inc).toHaveBeenCalledWith({ status: 'success', method: 'password' });
    expect(cacheHits.inc).toHaveBeenCalledWith({ cache_name: 'appointments' });
    expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_name: 'appointments' });
    expect(auditLogTotal.inc).toHaveBeenCalledWith({ event_type: 'login', user_role: 'admin' });
  });
});
