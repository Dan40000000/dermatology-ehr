jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import { logger } from '../../lib/logger';
import {
  ApiError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  validateRequest,
  validators,
} from '../errorHandler';

const originalEnv = process.env;

describe('error handler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('formats unknown errors in production', () => {
    process.env.NODE_ENV = 'production';
    const req = { method: 'GET', originalUrl: '/test', headers: {} } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    errorHandler(new Error('boom'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('includes stack in development responses', () => {
    process.env.NODE_ENV = 'development';
    const req = { method: 'GET', originalUrl: '/test', headers: {} } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    errorHandler(new Error('boom'), req, res, jest.fn());

    const response = res.json.mock.calls[0][0];
    expect(response.error).toBe('boom');
    expect(response.stack).toBeDefined();
  });

  it('passes not found errors to next', () => {
    const req = { method: 'GET', path: '/missing' } as any;
    const next = jest.fn();

    notFoundHandler(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    const error = next.mock.calls[0][0] as ApiError;
    expect(error.statusCode).toBe(404);
  });

  it('wraps async errors via asyncHandler', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('fail');
    });
    const next = jest.fn();

    handler({} as any, {} as any, next);

    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('validates request data and throws validation error', () => {
    const schema = {
      name: validators.required('Name'),
      email: validators.email,
    };

    expect(() => validateRequest(schema, { email: 'bad' })).toThrow(ApiError);
  });

  it('provides common validators', () => {
    expect(validators.email('test@example.com')).toBeNull();
    expect(validators.email('bad-email')).toBe('Invalid email format');
    expect(validators.minLength(3)('ab')).toBe('Must be at least 3 characters');
    expect(validators.max(5)(10)).toBe('Must be no more than 5');
    expect(validators.oneOf(['a', 'b'])('c')).toBe('Must be one of: a, b');
    expect(validators.pattern(/^\d+$/, 'digits only')('abc')).toBe('digits only');
  });
});
