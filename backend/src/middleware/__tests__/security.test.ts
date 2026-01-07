import helmet from 'helmet';
import {
  securityHeaders,
  additionalSecurityHeaders,
  sqlInjectionPrevention,
  xssPrevention,
  sessionSecurity,
  validatePasswordPolicy,
  bruteForceProtection,
  resetLoginAttempts,
} from '../security';
import { logger } from '../../lib/logger';

jest.mock('helmet', () => ({
  __esModule: true,
  default: jest.fn((options) => options),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('security middleware', () => {
  const loggerWarn = (logger as any).warn as jest.Mock;
  const loggerInfo = (logger as any).info as jest.Mock;

  beforeEach(() => {
    loggerWarn.mockReset();
    loggerInfo.mockReset();
    resetLoginAttempts('user-1');
  });

  it('configures helmet security headers', () => {
    const helmetMock = helmet as jest.Mock;
    expect(helmetMock).toHaveBeenCalled();
    expect((securityHeaders as any).hsts.maxAge).toBe(31536000);
    expect((securityHeaders as any).contentSecurityPolicy.directives.frameAncestors).toEqual(["'none'"]);
  });

  it('adds additional security headers and cache control', () => {
    const req = { path: '/api/patients', ip: '127.0.0.1' } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    additionalSecurityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    expect(res.setHeader).toHaveBeenCalledWith('X-HIPAA-Compliant', 'true');
    expect(next).toHaveBeenCalled();
  });

  it('blocks SQL injection patterns', () => {
    const req = { query: { search: "' OR 1=1 --" }, body: {}, path: '/api/test', ip: '1.1.1.1' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    sqlInjectionPrevention(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request parameters' });
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('blocks XSS patterns in body', () => {
    const req = { body: { note: '<script>alert(1)</script>' }, path: '/api/test', ip: '1.1.1.1' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    xssPrevention(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request data' });
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('expires sessions after timeout', () => {
    const destroy = jest.fn();
    const session = { lastActivity: Date.now() - 3 * 60 * 60 * 1000, destroy, userId: 'user-1' } as any;
    const req = { session, ip: '1.1.1.1' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();

    sessionSecurity(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired' });
    expect(destroy).toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalled();
  });

  it('updates session activity and stores ip', () => {
    const session = { lastActivity: Date.now(), userId: 'user-1' } as any;
    const req = { session, ip: '2.2.2.2' } as any;
    const res = {} as any;
    const next = jest.fn();

    sessionSecurity(req, res, next);

    expect(req.session.ip).toBe('2.2.2.2');
    expect(next).toHaveBeenCalled();
  });

  it('validates password policy', () => {
    const weak = validatePasswordPolicy('short');
    expect(weak.isValid).toBe(false);
    expect(weak.errors.length).toBeGreaterThan(0);

    const strong = validatePasswordPolicy('StrongPass123!');
    expect(strong.isValid).toBe(true);
  });

  it('tracks brute force attempts and reset', () => {
    const identifier = 'user-1';
    const first = bruteForceProtection(identifier);
    expect(first.allowed).toBe(true);

    for (let i = 0; i < 5; i += 1) {
      bruteForceProtection(identifier);
    }

    const blocked = bruteForceProtection(identifier);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remainingAttempts).toBe(0);

    resetLoginAttempts(identifier);
    const afterReset = bruteForceProtection(identifier);
    expect(afterReset.allowed).toBe(true);
  });
});
