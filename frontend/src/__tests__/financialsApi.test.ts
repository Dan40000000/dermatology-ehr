import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFinancialWorkQueue, postBillAction, resolveFinancialWorkQueueItem } from '../api/financials';
import { API_BASE_URL } from '../utils/apiBase';

const tenantId = 'tenant-1';
const accessToken = 'token-1';

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('financials API', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts bill follow-up actions with auth and tenant headers', async () => {
    await postBillAction(
      { tenantId, accessToken },
      'bill 1',
      { action: 'send_statement', note: 'Statement sent' },
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/bills/bill%201/actions`);
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ action: 'send_statement', note: 'Statement sent' }),
    });
  });

  it('fetches the financial work queue with auth and tenant headers', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [{ id: 'fwq-1' }] }));

    const result = await fetchFinancialWorkQueue({ tenantId, accessToken });

    expect(result.items).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/bills/work-queue?status=open`);
    expect(options).toMatchObject({
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
    });
  });

  it('resolves a financial work queue item', async () => {
    await resolveFinancialWorkQueueItem(
      { tenantId, accessToken },
      'fwq 1',
      'Claim corrected',
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/bills/work-queue/fwq%201/resolve`);
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ note: 'Claim corrected' }),
    });
  });

  it('surfaces backend bill action errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'No open balance available to write off' }),
    } as unknown as Response);

    await expect(
      postBillAction(
        { tenantId, accessToken },
        'bill-1',
        { action: 'write_off', amountCents: 1000 },
      ),
    ).rejects.toThrow('No open balance available to write off');
  });
});
