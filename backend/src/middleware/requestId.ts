/**
 * Request ID Tracking Middleware
 *
 * Generates and tracks unique request IDs for correlating related audit events
 * and log entries across distributed operations
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request to include requestId
declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Middleware to generate and attach request ID
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if request ID already exists in header (from load balancer or proxy)
  const existingRequestId = req.headers['x-request-id'] as string;

  // Generate new request ID or use existing one
  const requestId = existingRequestId || crypto.randomUUID();

  // Attach to request object
  req.requestId = requestId;

  // Add to response headers for client tracking
  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string | undefined {
  return req.requestId;
}
