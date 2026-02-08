import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchDirectMessages,
  sendDirectMessage,
  fetchDirectContacts,
  createDirectContact,
  markDirectMessageRead,
  fetchDirectMessageAttachments,
  fetchDirectStats,
} from '../api-direct';
import { API_BASE_URL } from '../utils/apiBase';

const tenantId = 'tenant-1';
const token = 'token-1';

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('api-direct', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    {
      name: 'fetchDirectMessages',
      call: () => fetchDirectMessages(tenantId, token, 'inbox'),
      url: `${API_BASE_URL}/api/direct/messages?folder=inbox`,
    },
    {
      name: 'sendDirectMessage',
      call: () =>
        sendDirectMessage(tenantId, token, {
          toAddress: 'doc@example.com',
          subject: 'Hello',
        }),
      url: `${API_BASE_URL}/api/direct/send`,
      method: 'POST',
      body: JSON.stringify({ toAddress: 'doc@example.com', subject: 'Hello' }),
      contentType: true,
    },
    {
      name: 'fetchDirectContacts',
      call: () =>
        fetchDirectContacts(tenantId, token, {
          search: 'Smith',
          favoritesOnly: true,
        }),
      url: `${API_BASE_URL}/api/direct/contacts?search=Smith&favoritesOnly=true`,
    },
    {
      name: 'createDirectContact',
      call: () =>
        createDirectContact(tenantId, token, {
          providerName: 'Dr. Smith',
          directAddress: 'doc@example.com',
        }),
      url: `${API_BASE_URL}/api/direct/contacts`,
      method: 'POST',
      body: JSON.stringify({
        providerName: 'Dr. Smith',
        directAddress: 'doc@example.com',
      }),
      contentType: true,
    },
    {
      name: 'markDirectMessageRead',
      call: () => markDirectMessageRead(tenantId, token, 'message-1', true),
      url: `${API_BASE_URL}/api/direct/messages/message-1`,
      method: 'PATCH',
      body: JSON.stringify({ read: true }),
      contentType: true,
    },
    {
      name: 'fetchDirectMessageAttachments',
      call: () => fetchDirectMessageAttachments(tenantId, token, 'message-1'),
      url: `${API_BASE_URL}/api/direct/messages/message-1/attachments`,
    },
    {
      name: 'fetchDirectStats',
      call: () => fetchDirectStats(tenantId, token),
      url: `${API_BASE_URL}/api/direct/stats`,
    },
  ])('calls $name with expected request details', async ({ call, url, method, body, contentType }) => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(options?.credentials).toBe('include');

    if (method) {
      expect(options?.method).toBe(method);
    } else {
      expect(options?.method).toBeUndefined();
    }

    if (body) {
      expect(options?.body).toBe(body);
    }

    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers['x-tenant-id']).toBe(tenantId);
    if (contentType) {
      expect(headers['Content-Type']).toBe('application/json');
    }
  });

  it('surfaces errors from sendDirectMessage', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);

    await expect(
      sendDirectMessage(tenantId, token, { toAddress: 'doc@example.com', subject: 'Hello' })
    ).rejects.toThrow('bad');
  });
});
