import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting Configuration for Large Medical Practices
 *
 * Designed to support:
 * - 100+ concurrent doctors/staff
 * - 1000s of patients
 * - High-volume appointment days
 * - Multiple locations
 *
 * Rate limits are generous by default but can be adjusted via environment variables.
 * For development, set DISABLE_RATE_LIMIT=true in .env
 */

// Check if rate limiting is disabled (useful for development/testing)
const isRateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true';

// Helper to create a disabled limiter
const createLimiter = (options: Parameters<typeof rateLimit>[0]) => {
  if (isRateLimitDisabled) {
    return rateLimit({
      ...options,
      max: 999999, // Effectively disabled
    });
  }
  return rateLimit(options);
};

// General API rate limit - Very generous for large practices
// 10,000 requests per 15 minutes per IP (allows ~11 requests/second sustained)
export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000', 10),
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for successful requests to authenticated endpoints
  skip: (req) => req.headers.authorization !== undefined,
});

// Auth rate limit - Still protective against brute force but allows legitimate use
// 100 login attempts per 15 minutes (supports many staff logging in at shift change)
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '100', 10),
  skipSuccessfulRequests: true, // Only count failed attempts
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Validate option disabled since we handle IPv6 safely via the default key generator
  validate: { xForwardedForHeader: false },
});

// Patient portal rate limit - Generous for patient access
// 1,000 requests per 15 minutes per IP
export const portalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.PORTAL_RATE_LIMIT_MAX || '1000', 10),
  message: 'Too many requests to patient portal, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limit - Higher for clinical workflows
// 200 uploads per 15 minutes (supports batch photo uploads, document scanning)
export const uploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '200', 10),
  message: 'Too many file uploads, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Burst limiter for high-frequency operations (like real-time search)
// 500 requests per minute
export const burstLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.BURST_RATE_LIMIT_MAX || '500', 10),
  message: 'Request rate too high, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});
