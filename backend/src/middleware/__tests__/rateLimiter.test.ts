const rateLimitMock = jest.fn((options) => options);

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: rateLimitMock,
}));

import { apiLimiter, authLimiter, portalLimiter, uploadLimiter } from '../rateLimiter';

describe('rateLimiter presets', () => {
  it('configures api limiter', () => {
    expect(apiLimiter.max).toBe(100);
    expect(apiLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(apiLimiter.standardHeaders).toBe(true);
    expect(apiLimiter.legacyHeaders).toBe(false);
  });

  it('configures auth limiter', () => {
    expect(authLimiter.max).toBe(5);
    expect(authLimiter.skipSuccessfulRequests).toBe(true);
    expect(authLimiter.message).toContain('login attempts');
  });

  it('configures portal limiter', () => {
    expect(portalLimiter.max).toBe(50);
    expect(portalLimiter.message).toContain('patient portal');
  });

  it('configures upload limiter', () => {
    expect(uploadLimiter.max).toBe(20);
    expect(uploadLimiter.message).toContain('file uploads');
  });

  it('creates four limiters', () => {
    expect(rateLimitMock).toHaveBeenCalledTimes(4);
  });
});
