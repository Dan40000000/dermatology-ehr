/**
 * ETag Middleware for HTTP Caching
 *
 * Generates ETags for responses to enable client-side caching
 * and conditional requests (If-None-Match)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Generate ETag from response data
 */
export function generateETag(data: any): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
}

/**
 * ETag middleware for cacheable responses
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction) {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to add ETag
  res.json = function (body: any) {
    // Only add ETag for GET requests
    if (req.method === 'GET') {
      const etag = generateETag(body);
      res.setHeader('ETag', etag);

      // Check If-None-Match header
      const clientETag = req.headers['if-none-match'];
      if (clientETag === etag) {
        // Return 304 Not Modified
        res.status(304).end();
        return res;
      }

      // Set Cache-Control header for cacheable resources
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes default
      }
    }

    return originalJson(body);
  };

  next();
}

/**
 * ETag middleware for specific cache duration
 */
export function etagWithCache(maxAge: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      if (req.method === 'GET') {
        const etag = generateETag(body);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', `private, max-age=${maxAge}`);

        const clientETag = req.headers['if-none-match'];
        if (clientETag === etag) {
          res.status(304).end();
          return res;
        }
      }

      return originalJson(body);
    };

    next();
  };
}
