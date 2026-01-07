import request from 'supertest';
import express from 'express';
import os from 'os';
import { healthRouter } from '../health';
import { pool } from '../../db/pool';
import { register } from '../../lib/metrics';

// Mock logger
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
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

const queryMock = pool.query as jest.Mock;
const metricsMock = register.metrics as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  metricsMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  metricsMock.mockResolvedValue('# Metrics');
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
    });

    it('should return not ready when database is unavailable', async () => {
      queryMock.mockRejectedValueOnce(new Error('db down'));
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'not ready');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information when dependencies are healthy', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/health/detailed');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('memory');
      expect(res.body.checks).toHaveProperty('cpu');
    });

    it('should flag warnings and unhealthy status when checks fail', async () => {
      queryMock.mockRejectedValueOnce(new Error('db down'));

      const totalMemSpy = jest.spyOn(os, 'totalmem').mockReturnValue(1000);
      const freeMemSpy = jest.spyOn(os, 'freemem').mockReturnValue(50);
      const loadAvgSpy = jest.spyOn(os, 'loadavg').mockReturnValue([10, 8, 6]);
      const cpuSpy = jest.spyOn(os, 'cpus').mockReturnValue([
        {
          model: 'test',
          speed: 1000,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        },
      ] as os.CpuInfo[]);

      const res = await request(app).get('/health/detailed');
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'unhealthy');
      expect(res.body.checks.database).toHaveProperty('status', 'unhealthy');
      expect(res.body.checks.memory).toHaveProperty('status', 'warning');
      expect(res.body.checks.cpu).toHaveProperty('status', 'warning');

      totalMemSpy.mockRestore();
      freeMemSpy.mockRestore();
      loadAvgSpy.mockRestore();
      cpuSpy.mockRestore();
    });

    it('should include response time', async () => {
      const res = await request(app).get('/health/detailed');
      expect(res.body).toHaveProperty('responseTime');
      expect(typeof res.body.responseTime).toBe('number');
      expect(res.body.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/metrics', () => {
    it('should return metrics output', async () => {
      const res = await request(app).get('/health/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('# Metrics');
    });

    it('should handle metrics errors', async () => {
      metricsMock.mockRejectedValueOnce(new Error('metrics failed'));
      const res = await request(app).get('/health/metrics');
      expect(res.status).toBe(500);
    });
  });
});
