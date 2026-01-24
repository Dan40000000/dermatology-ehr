import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiException,
  parseErrorResponse,
  getStatusMessage,
  getErrorMessage,
  isNetworkError,
  isAuthError,
  isPermissionError,
  isValidationError,
  extractValidationErrors,
  defaultShouldRetry,
  withRetry,
  fetchWithTimeout,
  handleApiResponse,
  logError,
} from '../errorHandling';

describe('ApiException', () => {
  it('creates exception with all properties', () => {
    const error = new ApiException({
      message: 'Oops',
      status: 500,
      code: 'E500',
      details: { field: 'bad' },
      isNetworkError: true,
      isTimeout: true,
    });

    expect(error.message).toBe('Oops');
    expect(error.name).toBe('ApiException');
    expect(error.status).toBe(500);
    expect(error.code).toBe('E500');
    expect(error.details).toEqual({ field: 'bad' });
    expect(error.isNetworkError).toBe(true);
    expect(error.isTimeout).toBe(true);
  });

  it('defaults optional flags to false', () => {
    const error = new ApiException({
      message: 'Simple error',
      status: 404,
    });

    expect(error.isNetworkError).toBe(false);
    expect(error.isTimeout).toBe(false);
  });

  it('extends Error class', () => {
    const error = new ApiException({ message: 'Test' });
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ApiException).toBe(true);
  });
});

describe('parseErrorResponse', () => {
  it('parses JSON error responses', async () => {
    const jsonResponse = new Response(
      JSON.stringify({ error: 'Bad request', code: 'E400', details: { field: 'bad' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );

    const parsed = await parseErrorResponse(jsonResponse);
    expect(parsed.message).toBe('Bad request');
    expect(parsed.status).toBe(400);
    expect(parsed.code).toBe('E400');
    // details is set to errorData.details when it exists
    expect(parsed.details).toEqual({ field: 'bad' });
  });

  it('parses JSON with message field', async () => {
    const jsonResponse = new Response(
      JSON.stringify({ message: 'Validation error', code: 'VAL001' }),
      { status: 422, headers: { 'content-type': 'application/json' } }
    );

    const parsed = await parseErrorResponse(jsonResponse);
    expect(parsed.message).toBe('Validation error');
    expect(parsed.code).toBe('VAL001');
  });

  it('parses text error responses', async () => {
    const textResponse = new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    });

    const parsed = await parseErrorResponse(textResponse);
    expect(parsed.message).toBe('Not found');
    expect(parsed.status).toBe(404);
  });

  it('falls back to status message when no error data', async () => {
    const response = new Response('', {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed.message).toBe('A server error occurred. Please try again later.');
  });

  it('handles parsing failures gracefully', async () => {
    const response = {
      status: 500,
      headers: { get: () => 'application/json' },
      json: () => {
        throw new Error('parse failed');
      },
      text: async () => 'ignored',
    } as unknown as Response;

    const parsed = await parseErrorResponse(response);
    expect(parsed.message).toBe('An unexpected error occurred');
    expect(parsed.status).toBe(500);
  });

  it('handles non-JSON content type', async () => {
    const response = new Response('Server error occurred', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed.message).toBe('Server error occurred');
  });
});

describe('getStatusMessage', () => {
  it('returns messages for client errors', () => {
    expect(getStatusMessage(400)).toBe('Invalid request. Please check your input and try again.');
    expect(getStatusMessage(401)).toBe('Your session has expired. Please log in again.');
    expect(getStatusMessage(403)).toBe('You do not have permission to perform this action.');
    expect(getStatusMessage(404)).toBe('The requested resource was not found.');
    expect(getStatusMessage(409)).toBe('This action conflicts with existing data.');
    expect(getStatusMessage(422)).toBe('Validation failed. Please check your input.');
    expect(getStatusMessage(429)).toBe('Too many requests. Please wait a moment and try again.');
  });

  it('returns messages for server errors', () => {
    expect(getStatusMessage(500)).toBe('A server error occurred. Please try again later.');
    expect(getStatusMessage(502)).toBe('Service temporarily unavailable. Please try again later.');
    expect(getStatusMessage(503)).toBe('Service temporarily unavailable. Please try again later.');
    expect(getStatusMessage(504)).toBe('Request timeout. Please try again.');
  });

  it('returns default message for unknown status codes', () => {
    expect(getStatusMessage(999)).toBe('An unexpected error occurred. Please try again.');
    expect(getStatusMessage(418)).toBe('An unexpected error occurred. Please try again.');
  });
});

describe('getErrorMessage', () => {
  it('extracts message from ApiException', () => {
    const error = new ApiException({ message: 'API failed' });
    expect(getErrorMessage(error)).toBe('API failed');
  });

  it('extracts message from Error', () => {
    const error = new Error('boom');
    expect(getErrorMessage(error)).toBe('boom');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('plain error')).toBe('plain error');
  });

  it('returns default message for unknown error types', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage(123)).toBe('An unexpected error occurred');
  });
});

describe('isNetworkError', () => {
  it('detects network errors from ApiException', () => {
    const networkError = new ApiException({ message: 'Network', isNetworkError: true });
    expect(isNetworkError(networkError)).toBe(true);

    const nonNetworkError = new ApiException({ message: 'Not network', isNetworkError: false });
    expect(isNetworkError(nonNetworkError)).toBe(false);
  });

  it('detects network errors from TypeError', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('network error occurred'))).toBe(true);
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns false for non-network TypeErrors', () => {
    expect(isNetworkError(new TypeError('Cannot read property'))).toBe(false);
  });

  it('returns false for other error types', () => {
    expect(isNetworkError(new Error('general error'))).toBe(false);
    expect(isNetworkError('error string')).toBe(false);
  });
});

describe('isAuthError', () => {
  it('detects 401 errors from ApiException', () => {
    const authError = new ApiException({ message: 'Unauthorized', status: 401 });
    expect(isAuthError(authError)).toBe(true);
  });

  it('returns false for non-401 errors', () => {
    expect(isAuthError(new ApiException({ message: 'Forbidden', status: 403 }))).toBe(false);
    expect(isAuthError(new ApiException({ message: 'Server error', status: 500 }))).toBe(false);
  });

  it('returns false for non-ApiException errors', () => {
    expect(isAuthError(new Error('error'))).toBe(false);
    expect(isAuthError('error')).toBe(false);
  });
});

describe('isPermissionError', () => {
  it('detects 403 errors from ApiException', () => {
    const permissionError = new ApiException({ message: 'Denied', status: 403 });
    expect(isPermissionError(permissionError)).toBe(true);
  });

  it('returns false for non-403 errors', () => {
    expect(isPermissionError(new ApiException({ message: 'Unauthorized', status: 401 }))).toBe(false);
    expect(isPermissionError(new ApiException({ message: 'Server error', status: 500 }))).toBe(false);
  });

  it('returns false for non-ApiException errors', () => {
    expect(isPermissionError(new Error('error'))).toBe(false);
  });
});

describe('isValidationError', () => {
  it('detects 400 and 422 errors from ApiException', () => {
    expect(isValidationError(new ApiException({ message: 'Bad request', status: 400 }))).toBe(true);
    expect(isValidationError(new ApiException({ message: 'Validation failed', status: 422 }))).toBe(true);
  });

  it('returns false for non-validation errors', () => {
    expect(isValidationError(new ApiException({ message: 'Unauthorized', status: 401 }))).toBe(false);
    expect(isValidationError(new ApiException({ message: 'Server error', status: 500 }))).toBe(false);
  });

  it('returns false for non-ApiException errors', () => {
    expect(isValidationError(new Error('error'))).toBe(false);
  });
});

describe('extractValidationErrors', () => {
  it('extracts validation errors from ApiException details', () => {
    const apiError = new ApiException({
      message: 'Validation failed',
      details: { errors: { name: 'Required', email: 'Invalid format' } },
    });

    expect(extractValidationErrors(apiError)).toEqual({
      name: 'Required',
      email: 'Invalid format',
    });
  });

  it('returns null when no errors in details', () => {
    const apiError = new ApiException({
      message: 'Validation failed',
      details: { message: 'Some other data' },
    });

    expect(extractValidationErrors(apiError)).toBeNull();
  });

  it('returns null for non-ApiException errors', () => {
    expect(extractValidationErrors(new Error('nope'))).toBeNull();
    expect(extractValidationErrors('error')).toBeNull();
  });

  it('returns null when ApiException has no details', () => {
    const apiError = new ApiException({ message: 'Error' });
    expect(extractValidationErrors(apiError)).toBeNull();
  });
});

describe('defaultShouldRetry', () => {
  it('does not retry after max attempts', () => {
    expect(defaultShouldRetry(new Error('fail'), 3)).toBe(false);
    expect(defaultShouldRetry(new Error('fail'), 5)).toBe(false);
  });

  it('retries network errors', () => {
    const networkError = new ApiException({ message: 'Network', isNetworkError: true });
    expect(defaultShouldRetry(networkError, 1)).toBe(true);
    expect(defaultShouldRetry(new TypeError('Failed to fetch'), 1)).toBe(true);
  });

  it('retries 5xx server errors', () => {
    expect(defaultShouldRetry(new ApiException({ message: 'Server', status: 500 }), 1)).toBe(true);
    expect(defaultShouldRetry(new ApiException({ message: 'Gateway', status: 502 }), 1)).toBe(true);
    expect(defaultShouldRetry(new ApiException({ message: 'Unavailable', status: 503 }), 1)).toBe(true);
    expect(defaultShouldRetry(new ApiException({ message: 'Timeout', status: 504 }), 1)).toBe(true);
  });

  it('does not retry 4xx client errors', () => {
    expect(defaultShouldRetry(new ApiException({ message: 'Client', status: 400 }), 1)).toBe(false);
    expect(defaultShouldRetry(new ApiException({ message: 'Unauthorized', status: 401 }), 1)).toBe(false);
    expect(defaultShouldRetry(new ApiException({ message: 'Not found', status: 404 }), 1)).toBe(false);
  });

  it('does not retry generic errors', () => {
    expect(defaultShouldRetry(new Error('generic error'), 1)).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first attempt if successful', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = withRetry(fn);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('fail');
      }
      return 'ok';
    });

    const promise = withRetry(fn, {
      maxAttempts: 3,
      delayMs: 10,
      backoff: false,
      shouldRetry: () => true,
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('applies exponential backoff', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('fail');
      }
      return 'ok';
    });

    const promise = withRetry(fn, {
      maxAttempts: 3,
      delayMs: 100,
      backoff: true,
      shouldRetry: () => true,
    });

    // First attempt - immediate
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second attempt - 100ms delay (delayMs * 2^0)
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Third attempt - 200ms delay (delayMs * 2^1)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBe('ok');
  });

  it('throws error when max attempts exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = withRetry(fn, {
      maxAttempts: 3,
      delayMs: 10,
      backoff: false,
      shouldRetry: () => true,
    });
    const assertion = expect(promise).rejects.toThrow('persistent failure');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, {
      maxAttempts: 5,
      delayMs: 10,
      shouldRetry: (error, attempt) => attempt < 2, // Only retry once
    });
    const assertion = expect(promise).rejects.toThrow('fail');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it('stops retrying when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiException({ message: 'Client error', status: 400 }));

    const promise = withRetry(fn, {
      maxAttempts: 5,
      shouldRetry: defaultShouldRetry, // Won't retry 400 errors
    });
    const assertion = expect(promise).rejects.toThrow('Client error');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(1); // No retries for 400
  });

  it('uses default configuration', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new ApiException({ message: 'Server error', status: 500 });
      }
      return 'ok';
    });

    const promise = withRetry(fn); // Use defaults
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
  });
});

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns response on successful fetch', async () => {
    const okResponse = new Response('ok', { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(okResponse);

    const result = await fetchWithTimeout('http://example.com');
    expect(result).toBe(okResponse);
  });

  it('passes through fetch options', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    global.fetch = mockFetch;

    await fetchWithTimeout('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      })
    );
  });

  it('throws timeout error when request exceeds timeout', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn((_, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        (error as Error & { name: string }).name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;

    const timeoutPromise = fetchWithTimeout('http://example.com', { timeout: 100 });
    const expectation = expect(timeoutPromise).rejects.toMatchObject({
      message: 'Request timeout. Please try again.',
      isTimeout: true,
    });

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
  });

  it('throws network error on fetch TypeError', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchWithTimeout('http://example.com')).rejects.toMatchObject({
      message: 'Network error. Please check your connection and try again.',
      isNetworkError: true,
    });
  });

  it('rethrows other errors', async () => {
    const customError = new Error('Custom error');
    global.fetch = vi.fn().mockRejectedValue(customError);

    await expect(fetchWithTimeout('http://example.com')).rejects.toBe(customError);
  });

  it('uses default timeout of 30 seconds', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    global.fetch = mockFetch;

    await fetchWithTimeout('http://example.com');

    // Can't directly test timeout value, but we can verify it doesn't fail
    expect(mockFetch).toHaveBeenCalled();
  });

  it('clears timeout on successful response', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    global.fetch = vi.fn().mockResolvedValue(new Response('ok'));

    const promise = fetchWithTimeout('http://example.com', { timeout: 5000 });
    await vi.runAllTimersAsync();
    await promise;

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe('handleApiResponse', () => {
  it('returns JSON data from successful response', async () => {
    const jsonResponse = new Response(JSON.stringify({ ok: true, data: 'test' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const result = await handleApiResponse<{ ok: boolean; data: string }>(jsonResponse);
    expect(result).toEqual({ ok: true, data: 'test' });
  });

  it('returns text data from successful non-JSON response', async () => {
    const textResponse = new Response('plain text response', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });

    const result = await handleApiResponse(textResponse);
    expect(result).toBe('plain text response');
  });

  it('throws ApiException for error responses', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: 'Bad request', code: 'E400' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }
    );

    await expect(handleApiResponse(errorResponse)).rejects.toMatchObject({
      message: 'Bad request',
      status: 400,
      code: 'E400',
    });
  });

  it('throws ApiException for non-ok status codes', async () => {
    const errorResponse = new Response('Server error', { status: 500 });

    await expect(handleApiResponse(errorResponse)).rejects.toBeInstanceOf(ApiException);
  });
});

describe('logError', () => {
  const originalDev = (import.meta.env as any).DEV;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    (import.meta.env as any).DEV = originalDev;
  });

  it('logs errors in development mode', () => {
    (import.meta.env as any).DEV = true;

    logError(new Error('test error'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Error]:', expect.any(Error));
  });

  it('logs errors with context in development mode', () => {
    (import.meta.env as any).DEV = true;

    logError(new Error('test error'), 'API Request');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Error - API Request]:', expect.any(Error));
  });

  it('logs ApiException details in development mode', () => {
    (import.meta.env as any).DEV = true;

    const apiError = new ApiException({
      message: 'API failed',
      status: 500,
      code: 'E500',
      details: { field: 'test' },
      isNetworkError: true,
      isTimeout: false,
    });

    logError(apiError, 'Test context');

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Error - Test context]:', apiError);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      status: 500,
      code: 'E500',
      details: { field: 'test' },
      isNetworkError: true,
      isTimeout: false,
    });
  });

  it('does not log in production mode', () => {
    (import.meta.env as any).DEV = false;

    logError(new Error('test error'));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('handles errors without context', () => {
    (import.meta.env as any).DEV = true;

    logError(new Error('test error'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Error]:', expect.any(Error));
  });
});
