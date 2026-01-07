/**
 * Performance Monitoring Middleware
 *
 * Tracks API endpoint performance, slow queries, and system metrics
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { AuthedRequest } from './auth';

interface PerformanceMetric {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: Date;
  tenantId?: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
}

interface EndpointStats {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  slowCount: number; // requests > 1000ms
  lastAccessed: Date;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private endpointStats: Map<string, EndpointStats> = new Map();
  private maxMetrics: number = 10000; // Keep last 10k requests
  private slowQueryThreshold: number = 1000; // 1 second
  private metricsRetentionHours: number = 24;

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Update endpoint statistics
    const key = `${metric.method}:${metric.endpoint}`;
    const stats = this.endpointStats.get(key);

    if (stats) {
      stats.count++;
      stats.totalDuration += metric.duration;
      stats.avgDuration = stats.totalDuration / stats.count;
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
      stats.lastAccessed = metric.timestamp;

      if (metric.statusCode >= 400) {
        stats.errorCount++;
      }

      if (metric.duration > this.slowQueryThreshold) {
        stats.slowCount++;
      }
    } else {
      this.endpointStats.set(key, {
        count: 1,
        totalDuration: metric.duration,
        avgDuration: metric.duration,
        minDuration: metric.duration,
        maxDuration: metric.duration,
        errorCount: metric.statusCode >= 400 ? 1 : 0,
        slowCount: metric.duration > this.slowQueryThreshold ? 1 : 0,
        lastAccessed: metric.timestamp,
      });
    }

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow requests
    if (metric.duration > this.slowQueryThreshold) {
      logger.warn('Slow request detected', {
        endpoint: metric.endpoint,
        method: metric.method,
        duration: metric.duration,
        statusCode: metric.statusCode,
        tenantId: metric.tenantId,
      });
    }
  }

  /**
   * Get statistics for a specific endpoint
   */
  getEndpointStats(method: string, endpoint: string): EndpointStats | null {
    return this.endpointStats.get(`${method}:${endpoint}`) || null;
  }

  /**
   * Get all endpoint statistics
   */
  getAllStats(): Array<{ endpoint: string; method: string; stats: EndpointStats }> {
    const result: Array<{ endpoint: string; method: string; stats: EndpointStats }> = [];

    for (const [key, stats] of this.endpointStats.entries()) {
      const parts = key.split(':');
      const method = parts[0] || 'UNKNOWN';
      const endpoint = parts.slice(1).join(':') || 'UNKNOWN';
      result.push({ method, endpoint, stats });
    }

    // Sort by average duration (slowest first)
    return result.sort((a, b) => b.stats.avgDuration - a.stats.avgDuration);
  }

  /**
   * Get slow endpoints (avg duration > threshold)
   */
  getSlowEndpoints(threshold: number = 500): Array<{ endpoint: string; method: string; stats: EndpointStats }> {
    return this.getAllStats().filter((item) => item.stats.avgDuration > threshold);
  }

  /**
   * Get endpoints with high error rates
   */
  getErrorProneEndpoints(minErrorRate: number = 0.1): Array<{ endpoint: string; method: string; stats: EndpointStats; errorRate: number }> {
    return this.getAllStats()
      .map((item) => ({
        ...item,
        errorRate: item.stats.errorCount / item.stats.count,
      }))
      .filter((item) => item.errorRate >= minErrorRate)
      .sort((a, b) => b.errorRate - a.errorRate);
  }

  /**
   * Get recent metrics (last N requests)
   */
  getRecentMetrics(count: number = 100): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get metrics for a specific tenant
   */
  getTenantMetrics(tenantId: string, limit: number = 100): PerformanceMetric[] {
    return this.metrics
      .filter((m) => m.tenantId === tenantId)
      .slice(-limit);
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalRequests: number;
    avgDuration: number;
    slowRequests: number;
    errorRequests: number;
    uniqueEndpoints: number;
  } {
    const totalRequests = this.metrics.length;
    const avgDuration =
      totalRequests > 0
        ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests
        : 0;
    const slowRequests = this.metrics.filter(
      (m) => m.duration > this.slowQueryThreshold
    ).length;
    const errorRequests = this.metrics.filter((m) => m.statusCode >= 400).length;
    const uniqueEndpoints = this.endpointStats.size;

    return {
      totalRequests,
      avgDuration: Math.round(avgDuration),
      slowRequests,
      errorRequests,
      uniqueEndpoints,
    };
  }

  /**
   * Clear old metrics
   */
  cleanup(): void {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.metricsRetentionHours);

    this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);

    logger.info('Performance metrics cleanup completed', {
      remaining: this.metrics.length,
    });
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.metrics = [];
    this.endpointStats.clear();
    logger.info('Performance metrics reset');
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring middleware
 */
export function performanceMonitoring(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const authedReq = req as AuthedRequest;

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const metric: PerformanceMetric = {
      endpoint: req.route?.path || req.path,
      method: req.method,
      duration,
      statusCode: res.statusCode,
      timestamp: new Date(),
      tenantId: authedReq.user?.tenantId,
      userId: authedReq.user?.id,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    };

    performanceMonitor.recordMetric(metric);

    // Add performance header
    res.setHeader('X-Response-Time', `${duration}ms`);
  });

  next();
}

/**
 * Request timeout middleware
 * Automatically timeout long-running requests
 */
export function requestTimeout(timeout: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request timeout', {
          endpoint: req.path,
          method: req.method,
          timeout,
        });

        res.status(504).json({
          error: 'Request timeout',
          message: 'The request took too long to process',
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeoutId);
    });

    next();
  };
}

/**
 * Database query performance tracker
 */
interface QueryMetric {
  query: string;
  duration: number;
  timestamp: Date;
  tenantId?: string;
  rowCount?: number;
}

class QueryPerformanceMonitor {
  private queries: QueryMetric[] = [];
  private maxQueries: number = 1000;
  private slowQueryThreshold: number = 1000; // 1 second

  recordQuery(metric: QueryMetric): void {
    this.queries.push(metric);

    if (this.queries.length > this.maxQueries) {
      this.queries = this.queries.slice(-this.maxQueries);
    }

    if (metric.duration > this.slowQueryThreshold) {
      logger.warn('Slow database query detected', {
        duration: metric.duration,
        query: metric.query.substring(0, 200), // Truncate for logging
        tenantId: metric.tenantId,
      });
    }
  }

  getSlowQueries(limit: number = 50): QueryMetric[] {
    return this.queries
      .filter((q) => q.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getQueryStats(): {
    totalQueries: number;
    avgDuration: number;
    slowQueries: number;
  } {
    const totalQueries = this.queries.length;
    const avgDuration =
      totalQueries > 0
        ? this.queries.reduce((sum, q) => sum + q.duration, 0) / totalQueries
        : 0;
    const slowQueries = this.queries.filter(
      (q) => q.duration > this.slowQueryThreshold
    ).length;

    return {
      totalQueries,
      avgDuration: Math.round(avgDuration),
      slowQueries,
    };
  }

  reset(): void {
    this.queries = [];
  }
}

export const queryPerformanceMonitor = new QueryPerformanceMonitor();

/**
 * Cleanup old metrics periodically
 */
const cleanupInterval = setInterval(() => {
  performanceMonitor.cleanup();
}, 3600000); // Every hour
cleanupInterval.unref();

/**
 * Export performance stats endpoint handler
 */
export function getPerformanceStats(req: Request, res: Response): void {
  const { endpoint, method } = req.query;

  if (endpoint && method) {
    const stats = performanceMonitor.getEndpointStats(
      method as string,
      endpoint as string
    );
    res.json({ endpoint, method, stats });
    return;
  }

  const summary = performanceMonitor.getSummary();
  const slowEndpoints = performanceMonitor.getSlowEndpoints();
  const errorProneEndpoints = performanceMonitor.getErrorProneEndpoints();
  const queryStats = queryPerformanceMonitor.getQueryStats();
  const slowQueries = queryPerformanceMonitor.getSlowQueries(10);

  res.json({
    summary,
    slowEndpoints: slowEndpoints.slice(0, 20),
    errorProneEndpoints: errorProneEndpoints.slice(0, 20),
    database: {
      queryStats,
      slowQueries: slowQueries.map((q) => ({
        query: q.query.substring(0, 200),
        duration: q.duration,
        timestamp: q.timestamp,
      })),
    },
  });
}
