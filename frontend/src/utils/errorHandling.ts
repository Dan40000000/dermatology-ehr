/**
 * Error Handling Utilities
 * Centralized error handling for the dermatology EHR application
 */

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
  isNetworkError?: boolean;
  isTimeout?: boolean;
}

/**
 * Custom error class for API errors
 */
export class ApiException extends Error {
  status?: number;
  code?: string;
  details?: any;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
    this.isNetworkError = error.isNetworkError || false;
    this.isTimeout = error.isTimeout || false;
  }
}

/**
 * Parse error response from API
 */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let errorData: any = {};

  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json();
    } else {
      const text = await response.text();
      errorData = { message: text };
    }
  } catch (e) {
    // Failed to parse error response
    errorData = { message: 'An unexpected error occurred' };
  }

  return {
    message: errorData.error || errorData.message || getStatusMessage(response.status),
    status: response.status,
    code: errorData.code,
    details: errorData.details || errorData,
  };
}

/**
 * Get user-friendly message for HTTP status codes
 */
export function getStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Your session has expired. Please log in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with existing data.';
    case 422:
      return 'Validation failed. Please check your input.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'A server error occurred. Please try again later.';
    case 502:
      return 'Service temporarily unavailable. Please try again later.';
    case 503:
      return 'Service temporarily unavailable. Please try again later.';
    case 504:
      return 'Request timeout. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Get user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiException) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiException) {
    return error.isNetworkError;
  }

  if (error instanceof TypeError) {
    // Network errors often manifest as TypeErrors in fetch
    return error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  }

  return false;
}

/**
 * Check if error requires authentication
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof ApiException) {
    return error.status === 401;
  }

  return false;
}

/**
 * Check if error is a permission error
 */
export function isPermissionError(error: unknown): boolean {
  if (error instanceof ApiException) {
    return error.status === 403;
  }

  return false;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof ApiException) {
    return error.status === 400 || error.status === 422;
  }

  return false;
}

/**
 * Extract validation errors from API response
 */
export function extractValidationErrors(error: unknown): Record<string, string> | null {
  if (error instanceof ApiException && error.details?.errors) {
    return error.details.errors;
  }

  return null;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Default retry predicate - retry on network errors and 5xx errors
 */
export function defaultShouldRetry(error: unknown, attempt: number): boolean {
  if (attempt >= 3) return false;

  if (isNetworkError(error)) return true;

  if (error instanceof ApiException) {
    const status = error.status;
    // Retry on server errors, but not on client errors
    return status ? status >= 500 && status < 600 : false;
  }

  return false;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = true,
    shouldRetry = defaultShouldRetry,
  } = config;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts && shouldRetry(error, attempt)) {
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper for fetch requests
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 30000, ...fetchInit } = init || {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiException({
        message: 'Request timeout. Please try again.',
        isTimeout: true,
      });
    }

    // Network error
    if (error instanceof TypeError) {
      throw new ApiException({
        message: 'Network error. Please check your connection and try again.',
        isNetworkError: true,
      });
    }

    throw error;
  }
}

/**
 * Handle API response with error parsing
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new ApiException(error);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text() as any;
}

/**
 * Log error for debugging (can be extended to send to error tracking service)
 */
export function logError(error: unknown, context?: string): void {
  if (import.meta.env.DEV) {
    console.error(`[Error${context ? ` - ${context}` : ''}]:`, error);

    if (error instanceof ApiException) {
      console.error('Error details:', {
        status: error.status,
        code: error.code,
        details: error.details,
        isNetworkError: error.isNetworkError,
        isTimeout: error.isTimeout,
      });
    }
  }

  // In production, this could send to error tracking service like Sentry
  // if (import.meta.env.PROD) {
  //   sendToErrorTracking(error, context);
  // }
}
