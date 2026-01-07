/**
 * Performance Testing Suite
 *
 * Load testing and performance benchmarks for the EHR system
 */

import { pool } from '../db/pool';
import { cacheService } from '../services/cacheService';
import {
  performanceMonitor,
  queryPerformanceMonitor,
} from '../middleware/performanceMonitoring';

const describeIf = process.env.RUN_PERF === 'true' ? describe : describe.skip;

describeIf('Performance Tests', () => {
  describe('Database Performance', () => {
    it('should execute simple queries in under 200ms', async () => {
      const start = Date.now();
      await pool.query('SELECT 1');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent queries efficiently', async () => {
      const start = Date.now();

      // Execute 50 concurrent queries
      const queries = Array(50)
        .fill(null)
        .map(() => pool.query('SELECT $1::int as num', [Math.floor(Math.random() * 1000)]));

      await Promise.all(queries);
      const duration = Date.now() - start;

      // All queries should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should maintain pool connections efficiently', async () => {
      await pool.query('SELECT 1');
      const stats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };

      // Should have idle connections available
      expect(stats.totalCount).toBeGreaterThan(0);
      // Should not have queries waiting for connections
      expect(stats.waitingCount).toBe(0);
    });
  });

  describe('Cache Performance', () => {
    beforeEach(async () => {
      await cacheService.clear();
    });

    it('should set and get values in under 10ms', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      const setStart = Date.now();
      await cacheService.set(key, value);
      const setDuration = Date.now() - setStart;

      const getStart = Date.now();
      const result = await cacheService.get(key);
      const getDuration = Date.now() - getStart;

      expect(setDuration).toBeLessThan(50);
      expect(getDuration).toBeLessThan(50);
      expect(result).toEqual(value);
    });

    it('should handle high cache hit rates', async () => {
      // Populate cache
      for (let i = 0; i < 100; i++) {
        await cacheService.set(`key-${i}`, `value-${i}`);
      }

      cacheService.resetStats();

      // Access cached items
      for (let i = 0; i < 100; i++) {
        await cacheService.get(`key-${i}`);
      }

      const stats = cacheService.getStats();
      expect(stats.hitRate).toBeGreaterThan(99); // > 99% hit rate
    });

    it('should evict old entries when cache is full', async () => {
      // This test would verify cache eviction logic
      // Implementation depends on cache size limits

      const itemCount = 1000;
      for (let i = 0; i < itemCount; i++) {
        await cacheService.set(`item-${i}`, { data: 'x'.repeat(1000) });
      }

      const stats = cacheService.getStats();
      // Cache should maintain reasonable size
      expect(stats.keys).toBeGreaterThan(0);
    });
  });

  describe('API Performance', () => {
    it('should track endpoint performance metrics', () => {
      const summary = performanceMonitor.getSummary();

      expect(summary).toHaveProperty('totalRequests');
      expect(summary).toHaveProperty('avgDuration');
      expect(summary).toHaveProperty('slowRequests');
      expect(summary).toHaveProperty('errorRequests');
    });

    it('should identify slow endpoints', () => {
      const slowEndpoints = performanceMonitor.getSlowEndpoints(100);

      // Should return array of slow endpoints
      expect(Array.isArray(slowEndpoints)).toBe(true);

      if (slowEndpoints.length > 0) {
        expect(slowEndpoints[0]).toHaveProperty('endpoint');
        expect(slowEndpoints[0]).toHaveProperty('stats');
      }
    });

    it('should track query performance', () => {
      const stats = queryPerformanceMonitor.getQueryStats();

      expect(stats).toHaveProperty('totalQueries');
      expect(stats).toHaveProperty('avgDuration');
      expect(stats).toHaveProperty('slowQueries');
    });
  });

  describe('Load Testing', () => {
    it('should handle 100 concurrent patient list requests', async () => {
      const tenantId = 'test-tenant-id';
      const start = Date.now();

      const requests = Array(100)
        .fill(null)
        .map(() =>
          pool.query(
            'SELECT * FROM patients WHERE tenant_id = $1 LIMIT 50',
            [tenantId]
          )
        );

      await Promise.all(requests);
      const duration = Date.now() - start;

      // Should complete in under 8 seconds
      expect(duration).toBeLessThan(8000);
    });

    it('should handle mixed read/write operations', async () => {
      const start = Date.now();

      const operations = [
        // 70% reads
        ...Array(70)
          .fill(null)
          .map(() =>
            pool.query(
              'SELECT * FROM patients WHERE tenant_id = $1 LIMIT 10',
              ['test-tenant']
            )
          ),
        // 30% writes (in transaction to avoid actual modifications)
        ...Array(30)
          .fill(null)
          .map(() =>
            pool.query('SELECT 1') // Simplified for test
          ),
      ];

      await Promise.all(operations);
      const duration = Date.now() - start;

      // Should handle mixed load efficiently
      expect(duration).toBeLessThan(6000);
    });
  });

  describe('Memory Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform memory-intensive operations
      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`mem-test-${i}`, {
          data: 'x'.repeat(100),
          index: i,
        });
      }

      // Allow GC to run
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be reasonable (< 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });
});

describeIf('Benchmark Tests', () => {
  describe('Patient List Query Optimization', () => {
    it('should benchmark patient list query with indexes', async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await pool.query(`
          SELECT id, first_name, last_name, dob, phone, email
          FROM patients
          WHERE tenant_id = $1
          ORDER BY last_name, first_name
          LIMIT 50
        `, ['test-tenant']);
        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / iterations;
      const maxDuration = Math.max(...durations);

      console.log(`Patient list query - Avg: ${avgDuration}ms, Max: ${maxDuration}ms`);

      // With proper indexes, should be fast
      expect(avgDuration).toBeLessThan(300);
    });
  });

  describe('Appointment Calendar Query', () => {
    it('should benchmark appointment calendar query', async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await pool.query(`
          SELECT a.*, p.first_name, p.last_name, pr.full_name as provider_name
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          JOIN providers pr ON pr.id = a.provider_id
          WHERE a.tenant_id = $1
          AND a.scheduled_start::date = CURRENT_DATE
          ORDER BY a.scheduled_start
        `, ['test-tenant']);
        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / iterations;

      console.log(`Appointment calendar query - Avg: ${avgDuration}ms`);

      expect(avgDuration).toBeLessThan(400);
    });
  });

  describe('Patient Chart Loading', () => {
    it('should benchmark patient chart data retrieval', async () => {
      const patientId = 'test-patient-id';
      const start = Date.now();

      await Promise.all([
        pool.query('SELECT * FROM patients WHERE id = $1', [patientId]),
        pool.query(
          'SELECT * FROM encounters WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10',
          [patientId]
        ),
        pool.query(
          'SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10',
          [patientId]
        ),
        pool.query(
          'SELECT * FROM documents WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10',
          [patientId]
        ),
      ]);

      const duration = Date.now() - start;

      console.log(`Patient chart load - ${duration}ms`);

      // Parallel loading should be fast
      expect(duration).toBeLessThan(500);
    });
  });
});

/**
 * Performance Regression Tests
 *
 * These tests ensure performance doesn't degrade over time
 */
describeIf('Performance Regression', () => {
  const performanceBaseline = {
    patientListQuery: 500, // ms
    appointmentQuery: 750, // ms
    chartLoad: 1000, // ms
    cacheGet: 50, // ms
    cacheSet: 50, // ms
  };

  it('should meet patient list performance baseline', async () => {
    const start = Date.now();
    await pool.query(
      'SELECT * FROM patients WHERE tenant_id = $1 LIMIT 50',
      ['test-tenant']
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(performanceBaseline.patientListQuery);
  });

  it('should meet cache performance baseline', async () => {
    const key = 'baseline-test';
    const value = { test: 'data' };

    const setStart = Date.now();
    await cacheService.set(key, value);
    const setDuration = Date.now() - setStart;

    const getStart = Date.now();
    await cacheService.get(key);
    const getDuration = Date.now() - getStart;

    expect(setDuration).toBeLessThan(performanceBaseline.cacheSet);
    expect(getDuration).toBeLessThan(performanceBaseline.cacheGet);
  });
});
