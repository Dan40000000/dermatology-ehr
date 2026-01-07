/**
 * Caching Middleware
 *
 * Provides HTTP response caching for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService, CacheTTL } from '../services/cacheService';
import { logger } from '../lib/logger';
import { AuthedRequest } from './auth';

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  varyBy?: string[]; // Request properties to include in cache key
}

/**
 * Cache middleware factory
 *
 * Usage:
 *   router.get('/patients', cache({ ttl: 300 }), async (req, res) => {...})
 */
export function cache(options: CacheOptions = {}) {
  const {
    ttl = CacheTTL.MEDIUM,
    keyGenerator,
    condition,
    varyBy = [],
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (condition && !condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : generateCacheKey(req, varyBy);

    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Cache hit', { key: cacheKey });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }

      // Cache miss - intercept response
      logger.debug('Cache miss', { key: cacheKey });
      res.setHeader('X-Cache', 'MISS');

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (body: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, body, ttl).catch((err) => {
            logger.error('Cache set error', { error: err.message, key: cacheKey });
          });
        }

        // Call original json method
        return originalJson(body);
      };

      next();
    } catch (error: any) {
      logger.error('Cache middleware error', { error: error.message });
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request, varyBy: string[]): string {
  const authedReq = req as AuthedRequest;
  const tenantId = authedReq.user?.tenantId || 'public';

  // Base key: tenant + path
  let key = `api:${tenantId}:${req.path}`;

  // Add query parameters
  const queryKeys = Object.keys(req.query).sort();
  if (queryKeys.length > 0) {
    const queryString = queryKeys
      .map((k) => `${k}=${req.query[k]}`)
      .join('&');
    key += `:${queryString}`;
  }

  // Add custom vary-by parameters
  for (const field of varyBy) {
    if (field === 'user' && authedReq.user?.id) {
      key += `:user:${authedReq.user.id}`;
    } else if (field === 'role' && authedReq.user?.role) {
      key += `:role:${authedReq.user.role}`;
    } else if ((req as any)[field]) {
      key += `:${field}:${(req as any)[field]}`;
    }
  }

  return key;
}

/**
 * Invalidate cache for a specific pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    const count = await cacheService.delPattern(pattern);
    logger.info('Cache invalidated', { pattern, count });
    return count;
  } catch (error: any) {
    logger.error('Cache invalidation error', { error: error.message, pattern });
    return 0;
  }
}

/**
 * Middleware to invalidate cache after mutations
 *
 * Usage:
 *   router.post('/patients', invalidateCacheAfter(['patients:*']), async (req, res) => {...})
 */
export function invalidateCacheAfter(patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json/send methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Invalidate cache after successful response
    const invalidate = async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patterns) {
          await invalidateCache(pattern);
        }
      }
    };

    // Override json
    res.json = function (body: any) {
      invalidate().catch((err) =>
        logger.error('Cache invalidation error', { error: err.message })
      );
      return originalJson(body);
    };

    // Override send
    res.send = function (body: any) {
      invalidate().catch((err) =>
        logger.error('Cache invalidation error', { error: err.message })
      );
      return originalSend(body);
    };

    next();
  };
}

/**
 * Preset cache configurations for common use cases
 */
export const CachePresets = {
  /**
   * Cache for lookup/reference data (ICD codes, CPT codes, medications)
   * Very long TTL since this data rarely changes
   */
  lookupData: () =>
    cache({
      ttl: CacheTTL.VERY_LONG,
      condition: (req) => !req.query.nocache,
    }),

  /**
   * Cache for list endpoints (patients, appointments, etc.)
   * Medium TTL with cache busting on mutations
   */
  listData: (ttl: number = CacheTTL.MEDIUM) =>
    cache({
      ttl,
      varyBy: ['user'], // Different cache per user
      condition: (req) => !req.query.nocache,
    }),

  /**
   * Cache for individual resources
   * Longer TTL for relatively stable data
   */
  resource: (ttl: number = CacheTTL.LONG) =>
    cache({
      ttl,
      condition: (req) => !req.query.nocache,
    }),

  /**
   * Cache for dashboard/statistics
   * Short TTL since data changes frequently
   */
  dashboard: () =>
    cache({
      ttl: CacheTTL.SHORT,
      varyBy: ['user', 'role'],
      condition: (req) => !req.query.nocache,
    }),

  /**
   * No caching - always fetch fresh data
   */
  noCache: () => (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Cache', 'DISABLED');
    next();
  },
};

/**
 * Helper to invalidate all caches for a tenant
 */
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  await invalidateCache(`api:${tenantId}:*`);
}

/**
 * Helper to invalidate patient-related caches
 */
export async function invalidatePatientCache(
  tenantId: string,
  patientId?: string
): Promise<void> {
  if (patientId) {
    await invalidateCache(`*patient:${patientId}*`);
    await invalidateCache(`*patients:${tenantId}*`);
  } else {
    await invalidateCache(`*patients:${tenantId}*`);
  }
}

/**
 * Helper to invalidate appointment-related caches
 */
export async function invalidateAppointmentCache(
  tenantId: string,
  providerId?: string,
  locationId?: string
): Promise<void> {
  await invalidateCache(`*appointments:${tenantId}*`);
  if (providerId) {
    await invalidateCache(`*appointments:provider:${providerId}*`);
  }
  if (locationId) {
    await invalidateCache(`*appointments:location:${locationId}*`);
  }
}

/**
 * Warmup function - pre-populate cache with frequently accessed data
 */
export async function warmupCache(tenantId: string): Promise<void> {
  logger.info('Starting cache warmup', { tenantId });

  try {
    // Import here to avoid circular dependencies
    const { pool } = await import('../db/pool');

    // Warmup providers
    const providers = await pool.query(
      'SELECT * FROM providers WHERE tenant_id = $1 AND deleted_at IS NULL',
      [tenantId]
    );
    await cacheService.set(`providers:${tenantId}`, providers.rows, CacheTTL.LONG);

    // Warmup locations
    const locations = await pool.query(
      'SELECT * FROM locations WHERE tenant_id = $1 AND deleted_at IS NULL',
      [tenantId]
    );
    await cacheService.set(`locations:${tenantId}`, locations.rows, CacheTTL.LONG);

    // Warmup appointment types
    const appointmentTypes = await pool.query(
      'SELECT * FROM appointment_types WHERE tenant_id = $1 AND deleted_at IS NULL',
      [tenantId]
    );
    await cacheService.set(`appointment_types:${tenantId}`, appointmentTypes.rows, CacheTTL.LONG);

    logger.info('Cache warmup completed', { tenantId });
  } catch (error: any) {
    logger.error('Cache warmup error', { error: error.message, tenantId });
  }
}
