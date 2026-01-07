/**
 * Error Handling Middleware
 * Centralized error handling for Express routes
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: any;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: any): ApiError {
    return new ApiError(message, 400, 'BAD_REQUEST', details);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(message, 403, 'FORBIDDEN');
  }

  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string, details?: any): ApiError {
    return new ApiError(message, 409, 'CONFLICT', details);
  }

  static validationError(message: string, errors: Record<string, string>): ApiError {
    return new ApiError(message, 422, 'VALIDATION_ERROR', { errors });
  }

  static tooManyRequests(message: string = 'Too many requests'): ApiError {
    return new ApiError(message, 429, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(message, 500, 'INTERNAL_ERROR', undefined, false);
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
  stack?: string;
}

/**
 * Format error for client response
 */
function formatErrorResponse(error: ApiError, includeStack: boolean): ErrorResponse {
  const response: ErrorResponse = {
    error: error.message,
    code: error.code,
    details: error.details,
  };

  // Only include stack trace in development
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Determine if error should be logged
 */
function shouldLogError(error: ApiError): boolean {
  // Don't log client errors (4xx) except for auth errors
  if (error.statusCode >= 400 && error.statusCode < 500) {
    return error.statusCode === 401 || error.statusCode === 403;
  }

  // Always log server errors (5xx)
  return true;
}

/**
 * Log error with appropriate level
 */
function logError(error: ApiError, req: Request): void {
  const context = {
    method: req.method,
    url: req.originalUrl,
    statusCode: error.statusCode,
    code: error.code,
    userId: (req as any).user?.id,
    tenantId: req.headers['x-tenant-id'],
  };

  if (error.statusCode >= 500) {
    logger.error('Server error', { error: error.message, stack: error.stack, ...context });
  } else if (error.statusCode === 401 || error.statusCode === 403) {
    logger.warn('Authentication/Authorization error', { error: error.message, ...context });
  } else {
    logger.info('Client error', { error: error.message, ...context });
  }
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Convert unknown errors to ApiError
  const error = err instanceof ApiError
    ? err
    : new ApiError(
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
        500,
        'INTERNAL_ERROR',
        undefined,
        false
      );

  // Log error if needed
  if (shouldLogError(error)) {
    logError(error, req);
  }

  // Determine if we should include stack trace
  const includeStack = process.env.NODE_ENV === 'development';

  // Send error response
  const response = formatErrorResponse(error, includeStack);
  res.status(error.statusCode).json(response);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error helper
 */
export function validateRequest(
  validation: Record<string, (value: any) => string | null>,
  data: Record<string, any>
): void {
  const errors: Record<string, string> = {};

  for (const [field, validator] of Object.entries(validation)) {
    const error = validator(data[field]);
    if (error) {
      errors[field] = error;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.validationError('Validation failed', errors);
  }
}

/**
 * Common validators
 */
export const validators = {
  required: (fieldName: string) => (value: any): string | null => {
    if (value === undefined || value === null || value === '') {
      return `${fieldName} is required`;
    }
    return null;
  },

  email: (value: any): string | null => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? null : 'Invalid email format';
  },

  minLength: (min: number) => (value: any): string | null => {
    if (!value) return null;
    return value.length >= min ? null : `Must be at least ${min} characters`;
  },

  maxLength: (max: number) => (value: any): string | null => {
    if (!value) return null;
    return value.length <= max ? null : `Must be no more than ${max} characters`;
  },

  min: (min: number) => (value: any): string | null => {
    if (value === null || value === undefined) return null;
    return Number(value) >= min ? null : `Must be at least ${min}`;
  },

  max: (max: number) => (value: any): string | null => {
    if (value === null || value === undefined) return null;
    return Number(value) <= max ? null : `Must be no more than ${max}`;
  },

  oneOf: (values: any[]) => (value: any): string | null => {
    if (!value) return null;
    return values.includes(value) ? null : `Must be one of: ${values.join(', ')}`;
  },

  pattern: (regex: RegExp, message: string) => (value: any): string | null => {
    if (!value) return null;
    return regex.test(value) ? null : message;
  },
};
