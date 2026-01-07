/**
 * Response Compression Middleware
 *
 * Compresses HTTP responses using gzip/brotli to reduce bandwidth
 * and improve response times for clients
 */

import compression from 'compression';
import { Request, Response } from 'express';

/**
 * Compression middleware with optimized settings
 *
 * Features:
 * - Compresses responses > 1KB
 * - Uses level 6 compression (balance of speed vs. size)
 * - Skips compression for already compressed formats
 * - Supports gzip and deflate
 */
export const compressionMiddleware = compression({
  // Compression level (0-9, where 6 is a good balance)
  level: 6,

  // Only compress responses larger than 1KB
  threshold: 1024,

  // Filter function - decide which responses to compress
  filter: (req: Request, res: Response) => {
    // Don't compress if client doesn't support it
    if (!req.headers['accept-encoding']) {
      return false;
    }

    // Don't compress Server-Sent Events
    if (req.headers['accept'] === 'text/event-stream') {
      return false;
    }

    // Don't compress if no-transform cache-control header is set
    const cacheControl = res.getHeader('Cache-Control');
    if (cacheControl && typeof cacheControl === 'string' && cacheControl.includes('no-transform')) {
      return false;
    }

    // Use compression's default filter for everything else
    return compression.filter(req, res);
  },

  // Memory level (1-9, where 8 is default)
  memLevel: 8,

  // Compression strategy (Z_DEFAULT_STRATEGY is best for most cases)
  strategy: require('zlib').constants.Z_DEFAULT_STRATEGY,
});

/**
 * Custom compression for specific content types
 */
export function shouldCompress(contentType: string | undefined): boolean {
  if (!contentType) return false;

  const compressibleTypes = [
    'text/html',
    'text/css',
    'text/plain',
    'text/xml',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'application/x-javascript',
    'image/svg+xml',
  ];

  return compressibleTypes.some(type => contentType.includes(type));
}

/**
 * Compression statistics tracker
 */
class CompressionStats {
  private originalSize: number = 0;
  private compressedSize: number = 0;
  private requestCount: number = 0;
  private compressedCount: number = 0;

  record(original: number, compressed: number): void {
    this.originalSize += original;
    this.compressedSize += compressed;
    this.requestCount++;
    if (compressed < original) {
      this.compressedCount++;
    }
  }

  getStats() {
    const savingsBytes = this.originalSize - this.compressedSize;
    const savingsPercent = this.originalSize > 0
      ? (savingsBytes / this.originalSize) * 100
      : 0;

    return {
      totalRequests: this.requestCount,
      compressedRequests: this.compressedCount,
      originalSizeKB: Math.round(this.originalSize / 1024),
      compressedSizeKB: Math.round(this.compressedSize / 1024),
      savingsKB: Math.round(savingsBytes / 1024),
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      compressionRatio: this.originalSize > 0
        ? Math.round((this.compressedSize / this.originalSize) * 100) / 100
        : 1,
    };
  }

  reset(): void {
    this.originalSize = 0;
    this.compressedSize = 0;
    this.requestCount = 0;
    this.compressedCount = 0;
  }
}

export const compressionStats = new CompressionStats();
