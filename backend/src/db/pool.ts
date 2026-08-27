import { Pool, QueryResult } from "pg";
import { env } from "../config/env";
import config from "../config";
import { logger } from "../lib/logger";
import { queryPerformanceMonitor } from "../middleware/performanceMonitoring";
import { hashValue, safeErrorCode } from "../utils/phiRedaction";

/**
 * Optimized PostgreSQL connection pool configuration
 *
 * Pool settings are tuned for:
 * - High concurrency (up to 20 connections)
 * - Connection reuse
 * - Automatic connection cleanup
 * - Query timeout protection
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: config.database.ssl.enabled
    ? { rejectUnauthorized: config.database.ssl.rejectUnauthorized }
    : undefined,

  // Connection pool settings
  max: 20, // Maximum number of connections in the pool
  min: 2, // Minimum number of connections to keep alive
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 30000, // Timeout when acquiring connection (30 seconds - increased for Railway)

  // Query timeout
  statement_timeout: 30000, // Abort queries that take longer than 30 seconds

  // Connection settings
  keepAlive: true, // Enable TCP keep-alive
  keepAliveInitialDelayMillis: 10000, // Wait 10s before first keep-alive probe
  // Test suites may import the real pool in isolated Jest module contexts.
  // Idle sockets must not keep the completed test process alive.
  allowExitOnIdle: process.env.NODE_ENV === 'test',

  // Application name for pg_stat_activity tracking
  application_name: 'dermatology-ehr',
});

/**
 * Pool event handlers
 */

// Handle pool errors
pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL pool error", {
    errorCode: safeErrorCode(err),
  });
});

// Track connection events
pool.on("connect", (client) => {
  logger.debug("New database connection established");

  // Set session parameters for new connections
  client.query(`
    SET timezone = 'UTC';
    SET statement_timeout = '30s';
  `).catch(err => {
    logger.error("Error setting session parameters", { errorCode: safeErrorCode(err) });
  });
});

pool.on("acquire", () => {
  logger.debug("Database connection acquired from pool");
});

pool.on("remove", () => {
  logger.debug("Database connection removed from pool");
});

/**
 * Enhanced query wrapper with performance monitoring
 * Note: We use type assertions to work around pg Pool's complex overloaded query signatures
 */
const originalQuery = pool.query.bind(pool) as typeof pool.query;

// Create a wrapper that adds performance monitoring
const wrappedQuery = async (queryTextOrConfig: string | { text: string }, values?: unknown[]): Promise<QueryResult> => {
  const startTime = Date.now();
  const queryText = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig?.text || 'Unknown';

  try {
    const result = values
      ? await (originalQuery as any)(queryTextOrConfig, values)
      : await (originalQuery as any)(queryTextOrConfig);

    const duration = Date.now() - startTime;

    // Record query performance
    queryPerformanceMonitor.recordQuery({
      query: queryText,
      duration,
      timestamp: new Date(),
      rowCount: result.rowCount || 0,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error("Database query error", {
      queryCode: `SQL_${hashValue(queryText).toUpperCase()}`,
      duration,
      errorCode: safeErrorCode(error),
    });

    throw error;
  }
};

// Assign wrapped query to pool (with type assertion to bypass strict typing)
(pool as any).query = wrappedQuery;

/**
 * Get pool statistics
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Graceful pool shutdown
 */
let poolClosed = false;

export async function closePool(): Promise<void> {
  if (poolClosed) return;
  poolClosed = true;
  logger.info("Closing database connection pool");
  await pool.end();
  logger.info("Database connection pool closed");
}
