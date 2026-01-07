const compressionFilterMock = jest.fn(() => true);
const compressionMock = Object.assign(jest.fn((options) => options), {
  filter: compressionFilterMock,
});

jest.mock('compression', () => ({
  __esModule: true,
  default: compressionMock,
}));

import { compressionMiddleware, shouldCompress, compressionStats } from '../compression';

describe('compression helpers', () => {
  beforeEach(() => {
    compressionFilterMock.mockClear();
    compressionStats.reset();
  });

  it('identifies compressible content types', () => {
    expect(shouldCompress('text/html')).toBe(true);
    expect(shouldCompress('application/json')).toBe(true);
    expect(shouldCompress('image/png')).toBe(false);
    expect(shouldCompress(undefined)).toBe(false);
  });

  it('tracks compression stats', () => {
    compressionStats.record(2048, 1024);
    compressionStats.record(1024, 1024);

    const stats = compressionStats.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.compressedRequests).toBe(1);
    expect(stats.originalSizeKB).toBe(3);
    expect(stats.compressedSizeKB).toBe(2);
    expect(stats.savingsKB).toBe(1);
    expect(stats.compressionRatio).toBeLessThan(1);
  });

  it('filters out requests without accept-encoding', () => {
    const req = { headers: {} } as any;
    const res = { getHeader: jest.fn() } as any;

    expect(compressionMiddleware.filter(req, res)).toBe(false);
  });

  it('filters out server-sent events', () => {
    const req = { headers: { 'accept-encoding': 'gzip', accept: 'text/event-stream' } } as any;
    const res = { getHeader: jest.fn() } as any;

    expect(compressionMiddleware.filter(req, res)).toBe(false);
  });

  it('filters out no-transform responses', () => {
    const req = { headers: { 'accept-encoding': 'gzip' } } as any;
    const res = { getHeader: jest.fn().mockReturnValue('no-transform') } as any;

    expect(compressionMiddleware.filter(req, res)).toBe(false);
  });

  it('delegates to compression filter for other responses', () => {
    const req = { headers: { 'accept-encoding': 'gzip' } } as any;
    const res = { getHeader: jest.fn() } as any;

    expect(compressionMiddleware.filter(req, res)).toBe(true);
    expect(compressionFilterMock).toHaveBeenCalledWith(req, res);
  });
});
