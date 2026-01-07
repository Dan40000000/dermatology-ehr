import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, buildQueryString } from '../apiClient';
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

  it('builds query strings with arrays and filters empty values', () => {
    const query = buildQueryString({
      search: 'term',
      empty: '',
      nil: null,
      values: [1, 2],
    });

    expect(query).toBe('?search=term&values=1&values=2');
  });

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

  it('sends POST requests with JSON payloads', async () => {
    fetchWithTimeoutMock.mockResolvedValue({} as Response);
    handleApiResponseMock.mockResolvedValue({ ok: true });

    const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
    await client.post('/submit', { name: 'Avery' });

    const [, options] = fetchWithTimeoutMock.mock.calls[0];
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ name: 'Avery' }));
  });

  it('uses retry helper when enabled', async () => {
    fetchWithTimeoutMock.mockResolvedValue({} as Response);
    handleApiResponseMock.mockResolvedValue({ ok: true });
    withRetryMock.mockImplementation(async (fn) => fn());

    const client = new ApiClient({ tenantId: 'tenant-1', accessToken: 'token-1' });
    await client.get('/retry', { retry: true, maxRetries: 2 });

    expect(withRetryMock).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 2 });
  });

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
  });
});
