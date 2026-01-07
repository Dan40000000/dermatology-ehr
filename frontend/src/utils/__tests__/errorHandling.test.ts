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

describe('errorHandling utilities', () => {
  it('builds ApiException details', () => {
    const error = new ApiException({
      message: 'Oops',
      status: 500,
      code: 'E500',
      details: { field: 'bad' },
      isNetworkError: true,
      isTimeout: true,
    });

    expect(error.message).toBe('Oops');
    expect(error.status).toBe(500);
    expect(error.code).toBe('E500');
    expect(error.details).toEqual({ field: 'bad' });
    expect(error.isNetworkError).toBe(true);
    expect(error.isTimeout).toBe(true);
  });

  it('parses JSON and text error responses', async () => {
    const jsonResponse = new Response(
      JSON.stringify({ error: 'Bad request', code: 'E400', details: { field: 'bad' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );

    const parsedJson = await parseErrorResponse(jsonResponse);
    expect(parsedJson).toMatchObject({
      message: 'Bad request',
      status: 400,
      code: 'E400',
      details: { field: 'bad' },
    });

    const textResponse = new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    });
    const parsedText = await parseErrorResponse(textResponse);
    expect(parsedText.message).toBe('Not found');
  });

  it('handles error parsing failures', async () => {
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
  });

  it('formats status messages and error messages', () => {
    expect(getStatusMessage(400)).toContain('Invalid request');
    expect(getStatusMessage(999)).toContain('unexpected error');

    expect(getErrorMessage(new ApiException({ message: 'API failed' }))).toBe('API failed');
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('plain')).toBe('plain');
    expect(getErrorMessage({})).toBe('An unexpected error occurred');
  });

  it('detects error types', () => {
    const apiError = new ApiException({ message: 'Network', isNetworkError: true, status: 401 });
    expect(isNetworkError(apiError)).toBe(true);
    expect(isAuthError(apiError)).toBe(true);
    expect(isPermissionError(apiError)).toBe(false);

    const permissionError = new ApiException({ message: 'Denied', status: 403 });
    expect(isPermissionError(permissionError)).toBe(true);

    const validationError = new ApiException({ message: 'Bad', status: 422 });
    expect(isValidationError(validationError)).toBe(true);

    const networkTypeError = new TypeError('Failed to fetch');
    expect(isNetworkError(networkTypeError)).toBe(true);
  });

  it('extracts validation errors', () => {
    const apiError = new ApiException({
      message: 'Validation failed',
      details: { errors: { name: 'Required' } },
    });
    expect(extractValidationErrors(apiError)).toEqual({ name: 'Required' });
    expect(extractValidationErrors(new Error('nope'))).toBeNull();
  });

  it('defaultShouldRetry respects retry rules', () => {
    expect(defaultShouldRetry(new Error('fail'), 3)).toBe(false);
    expect(defaultShouldRetry(new TypeError('network'), 1)).toBe(true);
    expect(defaultShouldRetry(new ApiException({ message: 'Server', status: 500 }), 1)).toBe(true);
    expect(defaultShouldRetry(new ApiException({ message: 'Client', status: 400 }), 1)).toBe(false);
  });

  it('retries with backoff and resolves', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('fail');
      }
      return 'ok';
    });

    const promise = withRetry(fn, {
      maxAttempts: 2,
      delayMs: 10,
      backoff: false,
      shouldRetry: () => true,
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    vi.useRealTimers();
  });

  it('fetchWithTimeout handles success, timeout, and network errors', async () => {
    const originalFetch = global.fetch;

    const okResponse = new Response('ok', { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(okResponse);
    await expect(fetchWithTimeout('http://example.com')).resolves.toBe(okResponse);

    vi.useFakeTimers();
    global.fetch = vi.fn((_, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        (error as Error & { name: string }).name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;

    const timeoutPromise = fetchWithTimeout('http://example.com', { timeout: 10 });
    const timeoutExpectation = expect(timeoutPromise).rejects.toMatchObject({ isTimeout: true });
    await vi.advanceTimersByTimeAsync(10);
    await timeoutExpectation;
    vi.useRealTimers();

    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithTimeout('http://example.com')).rejects.toMatchObject({ isNetworkError: true });

    global.fetch = originalFetch;
  });

  it('handles API responses and logs errors', async () => {
    const jsonResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(handleApiResponse<{ ok: boolean }>(jsonResponse)).resolves.toEqual({ ok: true });

    const textResponse = new Response('ok', { status: 200 });
    await expect(handleApiResponse(textResponse)).resolves.toBe('ok');

    const errorResponse = new Response('bad', { status: 500 });
    await expect(handleApiResponse(errorResponse)).rejects.toBeInstanceOf(ApiException);

    const originalDev = (import.meta.env as any).DEV;
    (import.meta.env as any).DEV = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new ApiException({ message: 'fail', status: 500 }));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    (import.meta.env as any).DEV = originalDev;
  });
});
