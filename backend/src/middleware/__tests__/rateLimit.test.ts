import { rateLimit } from '../rateLimit';

describe('rateLimit', () => {
  const originalDisableRateLimit = process.env.DISABLE_RATE_LIMIT;

  beforeEach(() => {
    process.env.DISABLE_RATE_LIMIT = 'false';
  });

  afterEach(() => {
    if (originalDisableRateLimit === undefined) {
      delete process.env.DISABLE_RATE_LIMIT;
    } else {
      process.env.DISABLE_RATE_LIMIT = originalDisableRateLimit;
    }
  });

  it('limits requests within a window', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);

    const limiter = rateLimit({ windowMs: 1000, max: 2 });
    const req = { ip: '1.2.3.4', path: '/test' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });

    nowSpy.mockRestore();
  });

  it('resets bucket after window expires', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    const req = { ip: '5.6.7.8', path: '/reset' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    nowSpy.mockReturnValue(1000);
    limiter(req, res, next);

    nowSpy.mockReturnValue(2500);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();

    nowSpy.mockRestore();
  });
});
