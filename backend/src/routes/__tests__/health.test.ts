import request from 'supertest';
import express from 'express';
import { healthRouter } from '../health';

// Mock logger
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock metrics (if it exists)
jest.mock('../../lib/metrics', () => ({
  register: {
    contentType: 'text/plain',
    metrics: jest.fn().mockResolvedValue('# Metrics'),
  },
}), { virtual: true });

const app = express();
app.use('/health', healthRouter);

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'alive');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status when database is available', async () => {
      const res = await request(app).get('/health/ready');
      // May be 200 or 503 depending on database availability
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const res = await request(app).get('/health/detailed');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('memory');
      expect(res.body.checks).toHaveProperty('cpu');
    });

    it('should include response time', async () => {
      const res = await request(app).get('/health/detailed');
      expect(res.body).toHaveProperty('responseTime');
      expect(typeof res.body.responseTime).toBe('number');
      expect(res.body.responseTime).toBeGreaterThanOrEqual(0);
    });
  });
});
