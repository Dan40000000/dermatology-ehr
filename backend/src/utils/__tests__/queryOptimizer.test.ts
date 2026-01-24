jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { pool } from '../../db/pool';
import { logger } from '../../lib/logger';
import {
  analyzeQuery,
  findMissingIndexes,
  getTableStats,
  getUnusedIndexes,
  getCacheHitRatio,
  generatePerformanceReport,
  vacuumAnalyze,
  enableSlowQueryLog,
} from '../queryOptimizer';

const queryMock = pool.query as jest.Mock;
const loggerInfo = logger.info as jest.Mock;
const loggerError = logger.error as jest.Mock;

describe('queryOptimizer utilities', () => {
  beforeEach(() => {
    queryMock.mockReset();
    loggerInfo.mockReset();
    loggerError.mockReset();
  });

  it('analyzes query plans and generates suggestions', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          'QUERY PLAN': [
            {
              'Planning Time': 150,
              'Execution Time': 2000,
              Plan: {
                'Total Cost': 20000,
                NodeType: 'Nested Loop',
                Plans: [{ NodeType: 'Seq Scan' }],
              },
            },
          ],
        },
      ],
    });

    const result = await analyzeQuery('SELECT * FROM patients');
    expect(result.plan.executionTime).toBe(2000);
    expect(result.plan.totalCost).toBe(20000);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Query is slow'),
        expect.stringContaining('Sequential scan detected'),
        expect.stringContaining('Nested loop join detected'),
        expect.stringContaining('High query cost'),
        expect.stringContaining('High planning time'),
      ])
    );
  });

  it('logs and rethrows analyzeQuery errors', async () => {
    queryMock.mockRejectedValueOnce(new Error('fail'));
    await expect(analyzeQuery('SELECT 1')).rejects.toThrow('fail');
    expect(loggerError).toHaveBeenCalled();
  });

  it('finds missing indexes and handles errors', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tablename: 'patients', attname: 'email', seq_scan: 200 }],
    });
    const results = await findMissingIndexes();
    expect(results).toEqual([
      {
        table: 'patients',
        column: 'email',
        seqScans: 200,
        suggestion: 'CREATE INDEX idx_patients_email ON patients(email);',
      },
    ]);

    queryMock.mockRejectedValueOnce(new Error('fail'));
    await expect(findMissingIndexes()).resolves.toEqual([]);
    expect(loggerError).toHaveBeenCalled();
  });

  it('returns table stats and handles errors', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          tablename: 'patients',
          row_count: 10,
          total_size: '10 MB',
          index_size: '1 MB',
          seq_scan: 2,
          idx_scan: 5,
        },
      ],
    });

    const stats = await getTableStats();
    expect(stats).toEqual([
      {
        table: 'patients',
        rowCount: 10,
        totalSize: '10 MB',
        indexSize: '1 MB',
        seqScans: 2,
        indexScans: 5,
      },
    ]);

    queryMock.mockRejectedValueOnce(new Error('fail'));
    await expect(getTableStats()).resolves.toEqual([]);
  });

  it('returns unused indexes and handles errors', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tablename: 'patients', indexname: 'idx_patients_email', index_size: '1 MB', idx_scan: 5 }],
    });

    const unused = await getUnusedIndexes();
    expect(unused).toEqual([
      {
        table: 'patients',
        index: 'idx_patients_email',
        indexSize: '1 MB',
        scans: 5,
      },
    ]);

    queryMock.mockRejectedValueOnce(new Error('fail'));
    await expect(getUnusedIndexes()).resolves.toEqual([]);
  });

  it('calculates cache hit ratio and handles errors', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ratio: '0.85', heap_hit: 100, heap_read: 20 }],
    });
    const lowRatio = await getCacheHitRatio();
    expect(lowRatio.cacheHitRatio).toBe(85);
    expect(lowRatio.recommendation).toContain('low');

    queryMock.mockResolvedValueOnce({
      rows: [{ ratio: '0.96', heap_hit: 100, heap_read: 2 }],
    });
    const highRatio = await getCacheHitRatio();
    expect(highRatio.recommendation).toContain('good');

    queryMock.mockRejectedValueOnce(new Error('fail'));
    const fallback = await getCacheHitRatio();
    expect(fallback).toEqual({
      cacheHitRatio: 0,
      buffersUsed: 'Unknown',
      recommendation: 'Unable to calculate cache hit ratio',
    });
  });

  it('generates performance report recommendations', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            tablename: 'patients',
            row_count: 20000,
            total_size: '100 MB',
            index_size: '10 MB',
            seq_scan: 50,
            idx_scan: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ tablename: 'patients', attname: 'email', seq_scan: 200 }],
      })
      .mockResolvedValueOnce({
        rows: [{ tablename: 'patients', indexname: 'idx_patients_email', index_size: '1 MB', idx_scan: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ratio: '0.85', heap_hit: 100, heap_read: 20 }],
      });

    const report = await generatePerformanceReport();
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations.join(' ')).toContain('indexes');
    expect(loggerInfo).toHaveBeenCalledWith('Generating database performance report');
  });

  it('runs vacuum analyze and handles errors', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ tablename: 'patients' }, { tablename: 'appointments' }],
      })
      .mockResolvedValue({});
    await vacuumAnalyze(['patients', 'appointments']);
    expect(queryMock).toHaveBeenCalledWith('VACUUM ANALYZE patients');
    expect(queryMock).toHaveBeenCalledWith('VACUUM ANALYZE appointments');

    queryMock.mockResolvedValue({});
    await vacuumAnalyze();
    expect(queryMock).toHaveBeenCalledWith('VACUUM ANALYZE');

    queryMock.mockRejectedValueOnce(new Error('fail'));
    await expect(vacuumAnalyze()).rejects.toThrow('fail');
    expect(loggerError).toHaveBeenCalled();
  });

  it('enables slow query logging and logs errors', async () => {
    queryMock.mockResolvedValueOnce({});
    await enableSlowQueryLog(500);
    expect(loggerInfo).toHaveBeenCalledWith('Slow query logging enabled', { threshold: 500 });

    queryMock.mockRejectedValueOnce(new Error('fail'));
    await enableSlowQueryLog(500);
    expect(loggerError).toHaveBeenCalled();
  });
});
