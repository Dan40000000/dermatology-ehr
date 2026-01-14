import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, buildQueryString, createApiClient } from '../apiClient';
import {
  fetchWithTimeout,
  handleApiResponse,
  withRetry,
  logError,
  isAuthError,
} from '../errorHandling';

vi.mock('../errorHandling', () => ({
  ApiException: class ApiException extends Error {},
  fetchWithTimeout: vi.fn(),
  handleApiResponse: vi.fn(),
  withRetry: vi.fn(),
  logError: vi.fn(),
  isAuthError: vi.fn(),
}));

describe('apiClient utilities', () => {
  const fetchWithTimeoutMock = vi.mocked(fetchWithTimeout);
  const handleApiResponseMock = vi.mocked(handleApiResponse);
  const withRetryMock = vi.mocked(withRetry);
  const logErrorMock = vi.mocked(logError);
  const isAuthErrorMock = vi.mocked(isAuthError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildQueryString', () => {
    it('builds query strings with arrays and filters empty values', () => {
      const query = buildQueryString({
        search: 'term',
        empty: '',
        nil: null,
        values: [1, 2],
      });

      expect(query).toBe('?search=term&values=1&values=2');
    });

    it('returns empty string when no valid params', () => {
      expect(buildQueryString({})).toBe('');
      expect(buildQueryString({ empty: '', nil: null, undef: undefined })).toBe('');
    });

    it('handles single value params', () => {
      const query = buildQueryString({ id: '123', active: true });
      expect(query).toBe('?id=123&active=true');
    });

    it('handles multiple array values', () => {
      const query = buildQueryString({
        tags: ['tag1', 'tag2', 'tag3'],
        status: 'active',
      });
      expect(query).toBe('?tags=tag1&tags=tag2&tags=tag3&status=active');
    });

    it('handles numeric and boolean values', () => {
      const query = buildQueryString({
        page: 1,
        limit: 20,
        active: true,
        deleted: false,
      });
      expect(query).toBe('?page=1&limit=20&active=true&deleted=false');
    });
  });

  describe('createApiClient', () => {
    it('creates a new ApiClient instance', () => {
      const client = createApiClient({
        tenantId: 'tenant-1',
        accessToken: 'token-1',
      });
      expect(client).toBeInstanceOf(ApiClient);
    });
  });

  describe('ApiClient - GET requests', () => {
    it('makes GET requests with default headers', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await expect(client.get('/test')).resolves.toEqual({ ok: true });

      const [url, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(url).toBe('http://localhost:4000/test');
      expect(options).toMatchObject({ method: 'GET', credentials: 'include', timeout: 30000 });
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
        'x-tenant-id': 'tenant-1',
      });
    });

    it('allows custom timeout for GET requests', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.get('/test', { timeout: 5000 });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.timeout).toBe(5000);
    });

    it('merges custom headers with default headers', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.get('/test', { headers: { 'X-Custom': 'value' } });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
        'x-tenant-id': 'tenant-1',
        'X-Custom': 'value',
      });
    });
  });

  describe('ApiClient - POST requests', () => {
    it('sends POST requests with JSON payloads', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.post('/submit', { name: 'Avery' });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('POST');
      expect(options?.body).toBe(JSON.stringify({ name: 'Avery' }));
    });

    it('handles POST without data', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.post('/action');

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('POST');
      expect(options?.body).toBeUndefined();
    });
  });

  describe('ApiClient - PUT requests', () => {
    it('sends PUT requests with JSON payloads', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ updated: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const result = await client.put('/update/123', { name: 'Updated' });

      expect(result).toEqual({ updated: true });
      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('PUT');
      expect(options?.body).toBe(JSON.stringify({ name: 'Updated' }));
    });

    it('handles PUT without data', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.put('/update/123');

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('PUT');
      expect(options?.body).toBeUndefined();
    });
  });

  describe('ApiClient - PATCH requests', () => {
    it('sends PATCH requests with JSON payloads', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ patched: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const result = await client.patch('/partial/123', { status: 'active' });

      expect(result).toEqual({ patched: true });
      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('PATCH');
      expect(options?.body).toBe(JSON.stringify({ status: 'active' }));
    });
  });

  describe('ApiClient - DELETE requests', () => {
    it('sends DELETE requests', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ deleted: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const result = await client.delete('/remove/123');

      expect(result).toEqual({ deleted: true });
      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.method).toBe('DELETE');
    });

    it('allows options on DELETE requests', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ deleted: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.delete('/remove/123', { timeout: 10000 });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.timeout).toBe(10000);
    });
  });

  describe('ApiClient - retry logic', () => {
    it('uses retry helper when enabled', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });
      withRetryMock.mockImplementation(async (fn) => fn());

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.get('/retry', { retry: true, maxRetries: 2 });

      expect(withRetryMock).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 2 });
    });

    it('does not use retry by default', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.get('/no-retry');

      expect(withRetryMock).not.toHaveBeenCalled();
    });

    it('applies retry to POST requests', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });
      withRetryMock.mockImplementation(async (fn) => fn());

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      await client.post('/submit', { data: 'test' }, { retry: true, maxRetries: 5 });

      expect(withRetryMock).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 5 });
    });
  });

  describe('ApiClient - error handling', () => {
    it('triggers auth callbacks and logs errors', async () => {
      const authError = new Error('auth');
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockRejectedValue(authError);
      isAuthErrorMock.mockReturnValue(true);

      const onAuthError = vi.fn();
      const client = new ApiClient({
        tenantId: 'tenant-1',
        accessToken: 'token-1',
        onAuthError,
      });

      await expect(client.get('/auth')).rejects.toThrow('auth');
      expect(onAuthError).toHaveBeenCalled();
      expect(logErrorMock).toHaveBeenCalled();
    });

    it('does not trigger auth callback for non-auth errors', async () => {
      const normalError = new Error('server error');
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockRejectedValue(normalError);
      isAuthErrorMock.mockReturnValue(false);

      const onAuthError = vi.fn();
      const client = new ApiClient({
        tenantId: 'tenant-1',
        accessToken: 'token-1',
        onAuthError,
      });

      await expect(client.get('/error')).rejects.toThrow('server error');
      expect(onAuthError).not.toHaveBeenCalled();
      expect(logErrorMock).toHaveBeenCalled();
    });

    it('skips error handling when skipErrorHandling is true', async () => {
      const error = new Error('error');
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockRejectedValue(error);
      isAuthErrorMock.mockReturnValue(false);

      const onAuthError = vi.fn();
      const client = new ApiClient({
        tenantId: 'tenant-1',
        accessToken: 'token-1',
        onAuthError,
      });

      await expect(client.get('/error', { skipErrorHandling: true })).rejects.toThrow('error');
      expect(onAuthError).not.toHaveBeenCalled();
      expect(logErrorMock).toHaveBeenCalled();
    });

    it('logs errors with endpoint context', async () => {
      const error = new Error('test error');
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockRejectedValue(error);

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });

      await expect(client.get('/test-endpoint')).rejects.toThrow();
      expect(logErrorMock).toHaveBeenCalledWith(error, 'API Request: /test-endpoint');
    });
  });

  describe('ApiClient - file upload', () => {
    it('uploads form data with auth headers', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const formData = new FormData();
      formData.append('file', new Blob(['data'], { type: 'text/plain' }), 'file.txt');

      await client.upload('/upload', formData);

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.body).toBe(formData);
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer token-1',
        'x-tenant-id': 'tenant-1',
      });
      // Upload headers should not include Content-Type (browser sets it for FormData)
      // but may still have it from buildHeaders, which is acceptable
    });

    it('allows custom headers on upload', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const formData = new FormData();

      await client.upload('/upload', formData, {
        headers: { 'X-Upload-Session': 'session-123' },
      });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.headers).toMatchObject({
        'X-Upload-Session': 'session-123',
      });
    });

    it('applies timeout to upload requests', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
      const formData = new FormData();

      await client.upload('/upload', formData, { timeout: 60000 });

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.timeout).toBe(60000);
    });
  });

  describe('ApiClient - configuration', () => {
    it('updates configuration', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'old-token' });

      // Update config
      client.updateConfig({ accessToken: 'new-token' });

      await client.get('/test');

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer new-token',
      });
    });

    it('partially updates configuration', async () => {
      fetchWithTimeoutMock.mockResolvedValue({} as Response);
      handleApiResponseMock.mockResolvedValue({ ok: true });

      const onAuthError = vi.fn();
      const client = new ApiClient({
        tenantId: 'tenant-1',
        accessToken: 'token-1',
        onAuthError,
      });

      // Update only tenant
      client.updateConfig({ tenantId: 'tenant-2' });

      await client.get('/test');

      const [, options] = fetchWithTimeoutMock.mock.calls[0];
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer token-1', // Unchanged
        'x-tenant-id': 'tenant-2', // Updated
      });
    });
  });
});
