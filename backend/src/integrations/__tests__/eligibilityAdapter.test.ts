import { EligibilityAdapter } from '../eligibilityAdapter';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EligibilityAdapter Availity auth', () => {
  let mockedFetch: jest.Mock;

  beforeAll(() => {
    global.fetch = jest.fn() as typeof fetch;
    mockedFetch = global.fetch as unknown as jest.Mock;
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'availity-token' }),
    } as Response);
  });

  it('uses client_secret_post with scope by default', async () => {
    const adapter = new EligibilityAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'availity',
      config: {
        id: 'cfg-1',
        tenantId: 'tenant-demo',
        integrationType: 'eligibility',
        provider: 'availity',
        config: {
          baseUrl: 'https://api.availity.com',
          tokenPath: '/v1/token',
          scope: 'scope-a scope-b',
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    await adapter.testConnection();

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.availity.com/v1/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        }),
        body: expect.any(String),
      })
    );

    const [, options] = mockedFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(options.headers.Authorization).toBeUndefined();

    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('scope')).toBe('scope-a scope-b');
  });

  it('supports legacy basic auth when explicitly configured', async () => {
    const adapter = new EligibilityAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'availity',
      config: {
        id: 'cfg-1',
        tenantId: 'tenant-demo',
        integrationType: 'eligibility',
        provider: 'availity',
        config: {
          baseUrl: 'https://api.availity.com',
          tokenPath: '/v1/token',
          tokenAuthMethod: 'basic',
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    await adapter.testConnection();

    const [, options] = mockedFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
    );

    const body = new URLSearchParams(options.body);
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
  });
});
