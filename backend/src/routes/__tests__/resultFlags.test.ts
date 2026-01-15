/**
 * Tests for Result Flags API endpoints
 */

import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import { resultFlagsRouter } from '../resultFlags';
import { pool } from '../../db/pool';

// Mock dependencies
jest.mock('../../db/pool');
jest.mock('../../lib/logger');
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      tenantId: 'test-tenant',
      role: 'provider',
    };
    next();
  },
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/result-flags', resultFlagsRouter);

describe('Result Flags API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PATCH /api/result-flags/orders/:id', () => {
    it('should update result flag for an order', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ result_flag: 'none' }] }) // Current flag
          .mockResolvedValueOnce({ // Update query
            rows: [{
              id: 'order-123',
              resultFlag: 'abnormal',
              resultFlagUpdatedAt: new Date().toISOString(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }) // Audit insert
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .patch('/api/result-flags/orders/order-123')
        .send({
          resultFlag: 'abnormal',
          changeReason: 'Lab values outside normal range',
        });

      expect(response.status).toBe(200);
      expect(response.body.resultFlag).toBe('abnormal');
      expect(mockClient.query).toHaveBeenCalledTimes(5); // BEGIN, SELECT, UPDATE, INSERT, COMMIT
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 404 if order not found', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // SELECT - no rows means not found
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .patch('/api/result-flags/orders/nonexistent-id')
        .send({
          resultFlag: 'normal',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Order not found');
    });

    it('should validate result flag type', async () => {
      const response = await request(app)
        .patch('/api/result-flags/orders/order-123')
        .send({
          resultFlag: 'invalid-flag',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/result-flags/lab-orders/:id', () => {
    it('should update result flag for a lab order', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ result_flag: 'none' }] }) // SELECT current flag
          .mockResolvedValueOnce({ // UPDATE
            rows: [{
              id: 'lab-order-123',
              resultFlag: 'cancerous',
              resultFlagUpdatedAt: new Date().toISOString(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }) // INSERT audit
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .patch('/api/result-flags/lab-orders/lab-order-123')
        .send({
          resultFlag: 'cancerous',
          changeReason: 'Pathology report shows malignant melanoma',
        });

      expect(response.status).toBe(200);
      expect(response.body.resultFlag).toBe('cancerous');
    });
  });

  describe('GET /api/result-flags/audit', () => {
    it('should fetch audit trail for result flag changes', async () => {
      const mockAuditEntries = [
        {
          id: 'audit-1',
          tenant_id: 'test-tenant',
          order_id: 'order-123',
          old_flag: 'none',
          new_flag: 'abnormal',
          changed_by: 'user-123',
          changed_by_name: 'Dr. Smith',
          created_at: new Date().toISOString(),
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockAuditEntries });

      const response = await request(app)
        .get('/api/result-flags/audit')
        .query({ order_id: 'order-123', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].new_flag).toBe('abnormal');
    });
  });

  describe('GET /api/result-flags/stats', () => {
    it('should return statistics about result flags', async () => {
      const mockOrderStats = [
        { result_flag: 'normal', count: 50 },
        { result_flag: 'abnormal', count: 10 },
      ];

      const mockLabOrderStats = [
        { result_flag: 'benign', count: 30 },
        { result_flag: 'cancerous', count: 5 },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockOrderStats })
        .mockResolvedValueOnce({ rows: mockLabOrderStats });

      const response = await request(app).get('/api/result-flags/stats');

      expect(response.status).toBe(200);
      expect(response.body.orders).toEqual(mockOrderStats);
      expect(response.body.labOrders).toEqual(mockLabOrderStats);
    });
  });

  describe('Authorization', () => {
    it('should require authentication', async () => {
      // This test would need to mock the auth middleware differently
      // to test unauthorized access
    });

    it('should require provider or admin role', async () => {
      // This test would need to mock the rbac middleware differently
      // to test role-based access control
    });
  });

  describe('Transaction handling', () => {
    it('should rollback on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ result_flag: 'none' }] })
          .mockRejectedValueOnce(new Error('Database error')),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .patch('/api/result-flags/orders/order-123')
        .send({
          resultFlag: 'abnormal',
        });

      expect(response.status).toBe(500);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
