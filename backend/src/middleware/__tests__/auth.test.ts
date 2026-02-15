import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthedRequest } from '../auth';

// Mock environment
const mockEnv = {
  jwtSecret: 'test-secret',
  tenantHeader: 'X-Tenant-Id',
};

jest.mock('../../config/env', () => ({
  env: {
    jwtSecret: 'test-secret',
    tenantHeader: 'X-Tenant-Id',
  },
}));

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      header: jest.fn(),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('requireAuth', () => {
    it('should reject request without authorization header', () => {
      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid bearer format', () => {
      mockReq.headers = { authorization: 'InvalidFormat token' };

      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing token' });
    });

    it('should reject request with invalid token', () => {
      mockReq.headers = { authorization: 'Bearer invalid.token.here' };
      (mockReq.header as jest.Mock).mockReturnValue('tenant-123');

      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should reject request with mismatched tenant', () => {
      const token = jwt.sign(
        { id: 'user-1', tenantId: 'tenant-123', role: 'admin' },
        mockEnv.jwtSecret
      );
      mockReq.headers = { authorization: `Bearer ${token}` };
      (mockReq.header as jest.Mock).mockReturnValue('tenant-456'); // Different tenant

      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid tenant' });
    });

    it('should accept valid token with matching tenant', () => {
      const payload = {
        id: 'user-1',
        tenantId: 'tenant-123',
        role: 'provider',
        secondaryRoles: ['admin'],
      };
      const token = jwt.sign(payload, mockEnv.jwtSecret);
      mockReq.headers = { authorization: `Bearer ${token}` };
      (mockReq.header as jest.Mock).mockReturnValue('tenant-123');

      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.id).toBe('user-1');
      expect(mockReq.user?.tenantId).toBe('tenant-123');
      expect(mockReq.user?.roles).toEqual(['provider', 'admin']);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject request without tenant header', () => {
      const token = jwt.sign(
        { id: 'user-1', tenantId: 'tenant-123', role: 'admin' },
        mockEnv.jwtSecret
      );
      mockReq.headers = { authorization: `Bearer ${token}` };
      (mockReq.header as jest.Mock).mockReturnValue(undefined);

      requireAuth(mockReq as AuthedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid tenant' });
    });
  });
});
