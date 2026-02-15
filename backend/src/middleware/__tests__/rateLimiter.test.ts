const rateLimitMock = jest.fn((options) => options);

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: rateLimitMock,
}));

import { apiLimiter, authLimiter, portalLimiter, uploadLimiter, burstLimiter } from '../rateLimiter';

describe('rateLimiter presets', () => {
  it('configures api limiter with generous limits for large practices', () => {
    expect(apiLimiter.max).toBe(10000); // 10,000 requests per 15 min
    expect(apiLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(apiLimiter.standardHeaders).toBe(true);
    expect(apiLimiter.legacyHeaders).toBe(false);
  });

  it('configures auth limiter with increased limits for multiple staff', () => {
    expect(authLimiter.max).toBe(100); // 100 login attempts per 15 min
    expect(authLimiter.skipSuccessfulRequests).toBe(true);
    expect(authLimiter.message).toContain('login attempts');
  });

  it('configures portal limiter with generous patient access limits', () => {
    expect(portalLimiter.max).toBe(1000); // 1,000 requests per 15 min
    expect(portalLimiter.message).toContain('patient portal');
  });

  it('configures upload limiter with clinical workflow limits', () => {
    expect(uploadLimiter.max).toBe(200); // 200 uploads per 15 min
    expect(uploadLimiter.message).toContain('file uploads');
  });

  it('configures burst limiter for real-time operations', () => {
    expect(burstLimiter.max).toBe(500); // 500 requests per minute
    expect(burstLimiter.windowMs).toBe(60 * 1000);
  });

  it('creates five limiters', () => {
    expect(rateLimitMock).toHaveBeenCalledTimes(5);
  });
});
