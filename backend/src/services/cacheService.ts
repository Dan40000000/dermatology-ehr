/**
 * Cache Service - Mock Redis Implementation
 *
 * This service provides an in-memory caching layer that mimics Redis functionality.
 * In production, replace with actual Redis client (ioredis or node-redis).
 *
 * Features:
 * - TTL (Time To Live) support
 * - Pattern-based invalidation
 * - Cache statistics
 * - Automatic cleanup of expired entries
 */

import { logger } from '../lib/logger';

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  key: string;
  size: number; // approximate size in bytes
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  keys: number;
}

class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0,
    keys: 0,
  };

  private maxSize: number = 100 * 1024 * 1024; // 100MB default
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start automatic cleanup of expired entries every 60 seconds
    this.startCleanup();
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.size -= entry.size;
      this.stats.keys--;
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set value in cache with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    const size = this.estimateSize(value);

    // Check if we need to evict entries
    await this.evictIfNeeded(size);

    const expiresAt = Date.now() + (ttl * 1000);

    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.stats.size -= oldEntry.size;
    } else {
      this.stats.keys++;
    }

    this.cache.set(key, { value, expiresAt, key, size });
    this.stats.size += size;
    this.stats.sets++;

    logger.debug('Cache set', { key, ttl, size });
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.size -= entry.size;
      this.stats.keys--;
      this.stats.deletes++;
      logger.debug('Cache delete', { key });
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * Pattern can include wildcards (*) e.g., "patients:*", "*:123"
   */
  async delPattern(pattern: string): Promise<number> {
    const regex = this.patternToRegex(pattern);
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        await this.del(key);
        count++;
      }
    }

    logger.debug('Cache pattern delete', { pattern, count });
    return count;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      await this.del(key);
      return false;
    }

    return true;
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
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      keys: 0,
    };
    logger.info('Cache cleared');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.deletes = 0;
    this.stats.evictions = 0;
  }

  /**
   * Private helper: Convert glob pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Private helper: Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    const str = JSON.stringify(value);
    return str.length * 2; // Approximate, JS uses UTF-16
  }

  /**
   * Private helper: Evict entries if cache is too large
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    if (this.stats.size + newEntrySize <= this.maxSize) {
      return;
    }

    // Sort by expiration time, evict entries that expire soonest
    const entries = Array.from(this.cache.values()).sort(
      (a, b) => a.expiresAt - b.expiresAt
    );

    for (const entry of entries) {
      if (this.stats.size + newEntrySize <= this.maxSize) {
        break;
      }
      await this.del(entry.key);
      this.stats.evictions++;
    }
  }

  /**
   * Private helper: Start automatic cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every 60 seconds
    this.cleanupInterval.unref();
  }

  /**
   * Private helper: Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.size -= entry.size;
        this.stats.keys--;
        this.stats.evictions++;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { cleaned, remaining: this.stats.keys });
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

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
 * Migration note: To use Redis in production
 *
 * 1. Install: npm install ioredis
 * 2. Replace implementation with:
 *
 * import Redis from 'ioredis';
 *
 * const redis = new Redis({
 *   host: process.env.REDIS_HOST || 'localhost',
 *   port: parseInt(process.env.REDIS_PORT || '6379'),
 *   password: process.env.REDIS_PASSWORD,
 *   db: parseInt(process.env.REDIS_DB || '0'),
 * });
 *
 * 3. Update methods to use redis commands:
 *    - get: await redis.get(key)
 *    - set: await redis.setex(key, ttl, JSON.stringify(value))
 *    - del: await redis.del(key)
 *    - delPattern: await redis.keys(pattern).then(keys => redis.del(...keys))
 */
