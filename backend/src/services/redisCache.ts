/**
 * Redis Cache Service
 *
 * Production-ready Redis caching layer with fallback to in-memory cache.
 * This service automatically uses Redis when available, otherwise falls back
 * to the in-memory cache for development.
 *
 * Features:
 * - Automatic Redis connection with retry logic
 * - Graceful fallback to in-memory cache
 * - TTL (Time To Live) support
 * - Pattern-based invalidation
 * - Cache statistics
 * - Connection health monitoring
 */

import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { cacheService as inMemoryCache } from './cacheService';

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  type: 'redis' | 'memory';
}

class RedisCacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    type: 'memory',
  };

  constructor() {
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;

    // If no Redis URL provided, use in-memory cache
    if (!redisUrl) {
      logger.info('No REDIS_URL provided, using in-memory cache');
      this.stats.type = 'memory';
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 10) {
            logger.error('Redis connection failed after 10 retries, falling back to in-memory cache');
            this.isConnected = false;
            this.stats.type = 'memory';
            return null; // Stop retrying
          }
          const delay = Math.min(times * 100, 3000);
          return delay;
        },
        reconnectOnError: (err: Error) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            // Reconnect when Redis is in readonly mode
            return true;
          }
          return false;
        },
      });

      // Event handlers
      this.redis.on('connect', () => {
        logger.info('Redis connected successfully');
        this.isConnected = true;
        this.stats.type = 'redis';
      });

      this.redis.on('ready', () => {
        logger.info('Redis ready to accept commands');
      });

      this.redis.on('error', (err: Error) => {
        logger.error('Redis connection error', { error: err.message });
        this.stats.errors++;
        // Don't mark as disconnected on error, let retryStrategy handle it
      });

      this.redis.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

    } catch (error) {
      logger.error('Failed to initialize Redis', { error: (error as Error).message });
      this.redis = null;
      this.isConnected = false;
      this.stats.type = 'memory';
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.isConnected && this.redis) {
        const value = await this.redis.get(key);
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return JSON.parse(value) as T;
      } else {
        // Fallback to in-memory cache
        return await inMemoryCache.get<T>(key);
      }
    } catch (error) {
      logger.error('Redis get error, falling back to memory cache', {
        key,
        error: (error as Error).message,
      });
      this.stats.errors++;
      return await inMemoryCache.get<T>(key);
    }
  }

  /**
   * Set value in cache with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (this.isConnected && this.redis) {
        if (ttl > 0) {
          await this.redis.setex(key, ttl, serialized);
        } else {
          await this.redis.set(key, serialized);
        }
        this.stats.sets++;
      } else {
        // Fallback to in-memory cache
        await inMemoryCache.set(key, value, ttl);
      }
    } catch (error) {
      logger.error('Redis set error, falling back to memory cache', {
        key,
        error: (error as Error).message,
      });
      this.stats.errors++;
      await inMemoryCache.set(key, value, ttl);
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      if (this.isConnected && this.redis) {
        await this.redis.del(key);
        this.stats.deletes++;
      } else {
        await inMemoryCache.del(key);
      }
    } catch (error) {
      logger.error('Redis delete error', { key, error: (error as Error).message });
      this.stats.errors++;
      await inMemoryCache.del(key);
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * Pattern can include wildcards (*) e.g., "patients:*", "*:123"
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      if (this.isConnected && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length === 0) {
          return 0;
        }
        await this.redis.del(...keys);
        this.stats.deletes += keys.length;
        logger.debug('Redis pattern delete', { pattern, count: keys.length });
        return keys.length;
      } else {
        return await inMemoryCache.delPattern(pattern);
      }
    } catch (error) {
      logger.error('Redis pattern delete error', {
        pattern,
        error: (error as Error).message,
      });
      this.stats.errors++;
      return await inMemoryCache.delPattern(pattern);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.isConnected && this.redis) {
        const result = await this.redis.exists(key);
        return result === 1;
      } else {
        return await inMemoryCache.exists(key);
      }
    } catch (error) {
      logger.error('Redis exists error', { key, error: (error as Error).message });
      this.stats.errors++;
      return await inMemoryCache.exists(key);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet<T = any>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number; isConnected: boolean } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      isConnected: this.isConnected,
    };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      if (this.isConnected && this.redis) {
        await this.redis.flushdb();
        logger.info('Redis cache cleared');
      } else {
        await inMemoryCache.clear();
      }
    } catch (error) {
      logger.error('Redis clear error', { error: (error as Error).message });
      this.stats.errors++;
      await inMemoryCache.clear();
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.deletes = 0;
    this.stats.errors = 0;
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getClient(): Redis | null {
    return this.isConnected ? this.redis : null;
  }

  /**
   * Check Redis connection health
   */
  async healthCheck(): Promise<{ healthy: boolean; type: string; latency?: number }> {
    if (!this.isConnected || !this.redis) {
      return { healthy: true, type: 'memory' };
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      return { healthy: true, type: 'redis', latency };
    } catch (error) {
      logger.error('Redis health check failed', { error: (error as Error).message });
      return { healthy: false, type: 'redis' };
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      logger.info('Redis connection closed');
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCacheService();

/**
 * Cache key builders for consistent naming
 */
export const CacheKeys = {
  // Patient cache keys
  patient: (id: string) => `patient:${id}`,
  patientList: (tenantId: string, page: number = 1) => `patients:${tenantId}:page:${page}`,
  patientEncounters: (patientId: string) => `patient:${patientId}:encounters`,

  // Appointment cache keys
  appointment: (id: string) => `appointment:${id}`,
  appointmentsByProvider: (providerId: string, date: string) =>
    `appointments:provider:${providerId}:date:${date}`,
  appointmentsByLocation: (locationId: string, date: string) =>
    `appointments:location:${locationId}:date:${date}`,
  appointmentsList: (tenantId: string, filters: string) =>
    `appointments:${tenantId}:${filters}`,

  // Lookup data (long TTL)
  icd10Codes: (search?: string) => search ? `icd10:search:${search}` : 'icd10:all',
  cptCodes: (search?: string) => search ? `cpt:search:${search}` : 'cpt:all',
  medications: (search?: string) => search ? `meds:search:${search}` : 'meds:all',

  // Provider cache keys
  provider: (id: string) => `provider:${id}`,
  providers: (tenantId: string) => `providers:${tenantId}`,

  // Location cache keys
  location: (id: string) => `location:${id}`,
  locations: (tenantId: string) => `locations:${tenantId}`,

  // Appointment types
  appointmentTypes: (tenantId: string) => `appointment-types:${tenantId}`,

  // Dashboard/statistics
  dashboardStats: (tenantId: string) => `dashboard:${tenantId}`,
  providerStats: (providerId: string, period: string) =>
    `stats:provider:${providerId}:${period}`,
  revenueStats: (tenantId: string, period: string) =>
    `stats:revenue:${tenantId}:${period}`,

  // Session data
  session: (sessionId: string) => `session:${sessionId}`,
  userSessions: (userId: string) => `sessions:user:${userId}`,
};

/**
 * Cache TTL constants (in seconds)
 */
export const CacheTTL = {
  SHORT: 60,          // 1 minute - frequently changing data
  MEDIUM: 300,        // 5 minutes - moderate changes
  LONG: 3600,         // 1 hour - relatively static data
  VERY_LONG: 86400,   // 24 hours - rarely changing lookup data
  SESSION: 7200,      // 2 hours - session data
};

/**
 * Cache invalidation helpers
 */
export const invalidateCache = {
  patient: async (patientId: string, tenantId: string) => {
    await redisCache.del(CacheKeys.patient(patientId));
    await redisCache.delPattern(`patients:${tenantId}:page:*`);
  },

  appointment: async (appointmentId: string, tenantId: string) => {
    await redisCache.del(CacheKeys.appointment(appointmentId));
    await redisCache.delPattern(`appointments:${tenantId}:*`);
  },

  providers: async (tenantId: string) => {
    await redisCache.delPattern(`provider:*`);
    await redisCache.del(CacheKeys.providers(tenantId));
  },

  locations: async (tenantId: string) => {
    await redisCache.delPattern(`location:*`);
    await redisCache.del(CacheKeys.locations(tenantId));
  },

  appointmentTypes: async (tenantId: string) => {
    await redisCache.del(CacheKeys.appointmentTypes(tenantId));
  },
};
