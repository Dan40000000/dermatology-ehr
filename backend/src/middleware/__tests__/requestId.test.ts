import crypto from 'crypto';
import { getRequestId, requestIdMiddleware } from '../requestId';

describe('requestId middleware', () => {
  it('uses existing request id header', () => {
    const req = { headers: { 'x-request-id': 'req-123' } } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    expect(next).toHaveBeenCalled();
  });

  it('generates a request id when missing', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('req-456');
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-456');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-456');
    expect(getRequestId(req)).toBe('req-456');

    uuidSpy.mockRestore();
  });
});
