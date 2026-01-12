import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Enhanced Security Headers Middleware
 *
 * Implements comprehensive security headers for HIPAA compliance
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
      upgradeInsecureRequests: [], // Force HTTPS
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true, // X-Content-Type-Options: nosniff
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true, // X-XSS-Protection
  hidePoweredBy: true, // Remove X-Powered-By header
  ieNoOpen: true, // X-Download-Options: noopen
  dnsPrefetchControl: { allow: false }, // X-DNS-Prefetch-Control: off
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }, // X-Permitted-Cross-Domain-Policies: none
});

/**
 * Additional security headers for enhanced protection
 */
export function additionalSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent page from being displayed in iframe (clickjacking protection)
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filter in browser
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Disable client-side caching for sensitive data
  if (req.path.includes('/api/patients') || req.path.includes('/api/encounters')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // Add custom security headers
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');

  // HIPAA compliance headers
  res.setHeader('X-HIPAA-Compliant', 'true');
  res.setHeader('X-PHI-Protected', 'true');

  next();
}

/**
 * SQL Injection Prevention
 * Validates and sanitizes inputs to prevent SQL injection
 */
export function sqlInjectionPrevention(req: Request, res: Response, next: NextFunction): void {
  const suspiciousPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // SQL meta-characters
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i, // SQL injection
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // SQL 'or' pattern
    /((\%27)|(\'))union/i, // UNION keyword
    /exec(\s|\+)+(s|x)p\w+/i, // Stored procedure execution
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  // Check query parameters
  if (checkValue(req.query)) {
    logger.warn('SQL injection attempt detected in query parameters', {
      path: req.path,
      query: req.query,
      ip: req.ip,
    });
    res.status(400).json({ error: 'Invalid request parameters' });
    return;
  }

  // Check body
  if (checkValue(req.body)) {
    logger.warn('SQL injection attempt detected in request body', {
      path: req.path,
      ip: req.ip,
    });
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  next();
}

/**
 * XSS Prevention
 * Sanitizes HTML and JavaScript in user inputs
 */
export function xssPrevention(req: Request, res: Response, next: NextFunction): void {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick=
    /<embed/gi,
    /<object/gi,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return xssPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (checkValue(req.body)) {
    logger.warn('XSS attempt detected', {
      path: req.path,
      ip: req.ip,
    });
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  next();
}

/**
 * Session Security Middleware
 * Implements session timeout and security checks
 */
export function sessionSecurity(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;

  if (session) {
    const now = Date.now();
    const sessionTimeout = 2 * 60 * 60 * 1000; // 2 hours

    // Check if session has expired
    if (session.lastActivity && (now - session.lastActivity) > sessionTimeout) {
      logger.info('Session expired', {
        userId: session.userId,
        lastActivity: new Date(session.lastActivity),
      });

      session.destroy();
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    // Update last activity
    session.lastActivity = now;

    // Check for session fixation (IP address change)
    if (session.ip && session.ip !== req.ip) {
      logger.warn('Session IP mismatch detected', {
        userId: session.userId,
        originalIp: session.ip,
        currentIp: req.ip,
      });

      // Optionally terminate session
      // session.destroy();
      // return res.status(401).json({ error: 'Security violation detected' });
    }

    // Store IP on first request
    if (!session.ip) {
      session.ip = req.ip;
    }
  }

  next();
}

/**
 * Password Policy Validator
 */
export function validatePasswordPolicy(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common passwords
  const commonPasswords = ['password', 'password123', 'admin', '12345678'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password is too common');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Brute Force Protection
 * Track failed login attempts and implement lockout
 */
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function bruteForceProtection(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  lockoutDuration?: number;
} {
  const maxAttempts = 5;
  const lockoutDuration = 15 * 60 * 1000; // 15 minutes
  const resetPeriod = 15 * 60 * 1000; // Reset after 15 minutes

  const now = Date.now();
  const attempts = loginAttempts.get(identifier);

  if (!attempts) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: now });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }

  // Reset if reset period has passed
  if (now - attempts.firstAttempt > resetPeriod) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: now });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }

  // Check if locked out
  if (attempts.count >= maxAttempts) {
    const lockoutRemaining = lockoutDuration - (now - attempts.firstAttempt);

    if (lockoutRemaining > 0) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutDuration: Math.ceil(lockoutRemaining / 1000),
      };
    } else {
      // Lockout period expired, reset
      loginAttempts.set(identifier, { count: 1, firstAttempt: now });
      return { allowed: true, remainingAttempts: maxAttempts - 1 };
    }
  }

  // Increment attempts
  attempts.count++;
  return {
    allowed: true,
    remainingAttempts: maxAttempts - attempts.count,
  };
}

export function resetLoginAttempts(identifier: string): void {
  loginAttempts.delete(identifier);
}
