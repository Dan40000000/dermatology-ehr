/**
 * Query Optimizer Utilities
 *
 * Helpers for analyzing and optimizing database queries
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

interface QueryPlan {
  planningTime: number;
  executionTime: number;
  totalCost: number;
  plan: any;
  query: string;
}

interface QueryAnalysis {
  query: string;
  plan: QueryPlan;
  suggestions: string[];
}

/**
 * Analyze query performance using EXPLAIN ANALYZE
 */
export async function analyzeQuery(
  query: string,
  params?: any[]
): Promise<QueryAnalysis> {
  const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;

  try {
    const result = await pool.query(explainQuery, params);
    const planData = result.rows[0]['QUERY PLAN'][0];

    const plan: QueryPlan = {
      planningTime: planData['Planning Time'],
      executionTime: planData['Execution Time'],
      totalCost: planData.Plan['Total Cost'],
      plan: planData.Plan,
      query,
    };

    const suggestions = generateOptimizationSuggestions(plan);

    return {
      query,
      plan,
      suggestions,
    };
  } catch (error: any) {
    logger.error('Query analysis error', {
      error: error.message,
      query: query.substring(0, 200),
    });
    throw error;
  }
}

/**
 * Generate optimization suggestions based on query plan
 */
function generateOptimizationSuggestions(plan: QueryPlan): string[] {
  const suggestions: string[] = [];

  // Check execution time
  if (plan.executionTime > 1000) {
    suggestions.push(
      `Query is slow (${plan.executionTime.toFixed(2)}ms). Consider adding indexes or optimizing WHERE clauses.`
    );
  }

  // Check for sequential scans
  const hasSeqScan = JSON.stringify(plan.plan).includes('Seq Scan');
  if (hasSeqScan) {
    suggestions.push(
      'Sequential scan detected. Consider adding appropriate indexes on filtered columns.'
    );
  }

  // Check for nested loops without indexes
  const hasNestedLoop = JSON.stringify(plan.plan).includes('Nested Loop');
  if (hasNestedLoop) {
    suggestions.push(
      'Nested loop join detected. Ensure foreign key columns are indexed.'
    );
  }

  // Check for high cost
  if (plan.totalCost > 10000) {
    suggestions.push(
      `High query cost (${plan.totalCost.toFixed(2)}). Consider query restructuring or partitioning.`
    );
  }

  // Check planning time
  if (plan.planningTime > 100) {
    suggestions.push(
      `High planning time (${plan.planningTime.toFixed(2)}ms). Consider prepared statements.`
    );
  }

  return suggestions;
}

/**
 * Find missing indexes by analyzing query patterns
 */
export async function findMissingIndexes(): Promise<Array<{
  table: string;
  column: string;
  seqScans: number;
  suggestion: string;
}>> {
  const query = `
    SELECT
      schemaname,
      tablename,
      attname,
      n_tup_ins + n_tup_upd + n_tup_del as writes,
      seq_scan,
      seq_tup_read,
      idx_scan,
      CASE
        WHEN seq_scan > 0 AND idx_scan = 0 THEN 'High'
        WHEN seq_scan > idx_scan THEN 'Medium'
        ELSE 'Low'
      END as priority
    FROM pg_stat_user_tables t
    JOIN pg_attribute a ON a.attrelid = t.relid
    WHERE schemaname = 'public'
      AND seq_scan > 100
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY seq_scan DESC, tablename
    LIMIT 50;
  `;

  try {
    const result = await pool.query(query);

    return result.rows.map((row) => ({
      table: row.tablename,
      column: row.attname,
      seqScans: row.seq_scan,
      suggestion: `CREATE INDEX idx_${row.tablename}_${row.attname} ON ${row.tablename}(${row.attname});`,
    }));
  } catch (error: any) {
    logger.error('Error finding missing indexes', { error: error.message });
    return [];
  }
}

/**
 * Get table statistics
 */
export async function getTableStats(): Promise<Array<{
  table: string;
  rowCount: number;
  totalSize: string;
  indexSize: string;
  seqScans: number;
  indexScans: number;
}>> {
  const query = `
    SELECT
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
      pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size,
      pg_stat_get_live_tuples(schemaname||'.'||tablename::regclass) AS row_count,
      seq_scan,
      idx_scan
    FROM pg_tables t
    LEFT JOIN pg_stat_user_tables s ON s.tablename = t.tablename
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  `;

  try {
    const result = await pool.query(query);

    return result.rows.map((row) => ({
      table: row.tablename,
      rowCount: row.row_count || 0,
      totalSize: row.total_size || '0 bytes',
      indexSize: row.index_size || '0 bytes',
      seqScans: row.seq_scan || 0,
      indexScans: row.idx_scan || 0,
    }));
  } catch (error: any) {
    logger.error('Error getting table stats', { error: error.message });
    return [];
  }
}

/**
 * Get unused indexes (candidates for removal)
 */
export async function getUnusedIndexes(): Promise<Array<{
  table: string;
  index: string;
  indexSize: string;
  scans: number;
}>> {
  const query = `
    SELECT
      schemaname,
      tablename,
      indexname,
      pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS index_size,
      idx_scan
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND idx_scan < 50
      AND indexname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;
  `;

  try {
    const result = await pool.query(query);

    return result.rows.map((row) => ({
      table: row.tablename,
      index: row.indexname,
      indexSize: row.index_size,
      scans: row.idx_scan || 0,
    }));
  } catch (error: any) {
    logger.error('Error getting unused indexes', { error: error.message });
    return [];
  }
}

/**
 * Get cache hit ratio
 */
export async function getCacheHitRatio(): Promise<{
  cacheHitRatio: number;
  buffersUsed: string;
  recommendation: string;
}> {
  const query = `
    SELECT
      sum(heap_blks_read) as heap_read,
      sum(heap_blks_hit) as heap_hit,
      sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
    FROM pg_statio_user_tables;
  `;

  try {
    const result = await pool.query(query);
    const row = result.rows[0];

    const ratio = row.ratio ? parseFloat(row.ratio) * 100 : 0;

    let recommendation = '';
    if (ratio < 90) {
      recommendation = 'Cache hit ratio is low. Consider increasing shared_buffers in PostgreSQL configuration.';
    } else if (ratio < 95) {
      recommendation = 'Cache hit ratio is acceptable but could be improved.';
    } else {
      recommendation = 'Cache hit ratio is good.';
    }

    return {
      cacheHitRatio: Math.round(ratio * 100) / 100,
      buffersUsed: `${row.heap_hit || 0} hits, ${row.heap_read || 0} reads`,
      recommendation,
    };
  } catch (error: any) {
    logger.error('Error getting cache hit ratio', { error: error.message });
    return {
      cacheHitRatio: 0,
      buffersUsed: 'Unknown',
      recommendation: 'Unable to calculate cache hit ratio',
    };
  }
}

/**
 * Generate comprehensive database performance report
 */
export async function generatePerformanceReport(): Promise<{
  tableStats: any[];
  missingIndexes: any[];
  unusedIndexes: any[];
  cacheHitRatio: any;
  recommendations: string[];
}> {
  logger.info('Generating database performance report');

  const [tableStats, missingIndexes, unusedIndexes, cacheHitRatio] = await Promise.all([
    getTableStats(),
    findMissingIndexes(),
    getUnusedIndexes(),
    getCacheHitRatio(),
  ]);

  const recommendations: string[] = [];

  // Add recommendations based on findings
  if (missingIndexes.length > 0) {
    recommendations.push(
      `Found ${missingIndexes.length} tables with high sequential scans. Consider adding indexes.`
    );
  }

  if (unusedIndexes.length > 0) {
    recommendations.push(
      `Found ${unusedIndexes.length} unused indexes. Consider removing them to save space and improve write performance.`
    );
  }

  if (cacheHitRatio.cacheHitRatio < 90) {
    recommendations.push(cacheHitRatio.recommendation);
  }

  // Check for large tables without indexes
  const largeTablesWithLowIndexUse = tableStats.filter(
    (t) => t.rowCount > 10000 && t.seqScans > t.indexScans
  );

  if (largeTablesWithLowIndexUse.length > 0) {
    recommendations.push(
      `Found ${largeTablesWithLowIndexUse.length} large tables with more sequential scans than index scans.`
    );
  }

  return {
    tableStats,
    missingIndexes,
    unusedIndexes,
    cacheHitRatio,
    recommendations,
  };
}

/**
 * Run VACUUM ANALYZE on specified tables
 */
export async function vacuumAnalyze(tables?: string[]): Promise<void> {
  try {
    if (tables && tables.length > 0) {
      for (const table of tables) {
        logger.info(`Running VACUUM ANALYZE on ${table}`);
        await pool.query(`VACUUM ANALYZE ${table}`);
      }
    } else {
      logger.info('Running VACUUM ANALYZE on all tables');
      await pool.query('VACUUM ANALYZE');
    }

    logger.info('VACUUM ANALYZE completed successfully');
  } catch (error: any) {
    logger.error('VACUUM ANALYZE error', { error: error.message });
    throw error;
  }
}

/**
 * Enable query logging for slow queries
 */
export async function enableSlowQueryLog(threshold: number = 1000): Promise<void> {
  try {
    await pool.query(`
      ALTER DATABASE current
      SET log_min_duration_statement = ${threshold};
    `);

    logger.info('Slow query logging enabled', { threshold });
  } catch (error: any) {
    logger.error('Error enabling slow query log', { error: error.message });
  }
}
