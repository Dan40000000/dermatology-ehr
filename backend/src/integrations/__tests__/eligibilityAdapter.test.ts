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

describe('EligibilityAdapter Stedi eligibility', () => {
  let mockedFetch: jest.Mock;

  beforeAll(() => {
    global.fetch = jest.fn() as typeof fetch;
    mockedFetch = global.fetch as unknown as jest.Mock;
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ec_test_123',
        tradingPartnerServiceId: 'AHS',
        payer: { name: 'Stedi Test Payer' },
        subscriber: {
          memberId: '123456789',
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: '19000101',
          groupNumber: 'GRP-1',
        },
        planDateInformation: {
          planBegin: '20260101',
        },
        benefitsInformation: [
          {
            code: '1',
            name: 'Active Coverage',
            planCoverage: 'Open Access Plus',
            serviceTypeCodes: ['30'],
            serviceTypes: ['Health Benefit Plan Coverage'],
          },
          {
            code: 'B',
            name: 'Co-Payment',
            benefitAmount: '40',
            coverageLevelCode: 'IND',
            inPlanNetworkIndicatorCode: 'Y',
            serviceTypes: ['Professional (Physician) Visit - Office'],
          },
          {
            code: 'C',
            name: 'Deductible',
            benefitAmount: '250',
            coverageLevelCode: 'IND',
            inPlanNetworkIndicatorCode: 'Y',
          },
          {
            code: 'G',
            name: 'Out of Pocket (Stop Loss)',
            benefitAmount: '3000',
            coverageLevelCode: 'IND',
            inPlanNetworkIndicatorCode: 'Y',
          },
          {
            code: 'A',
            name: 'Co-Insurance',
            benefitPercent: '0.1',
            coverageLevelCode: 'IND',
            inPlanNetworkIndicatorCode: 'Y',
          },
        ],
      }),
    } as Response);
  });

  function createStediAdapter() {
    const adapter = new EligibilityAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'stedi',
      config: {
        id: 'cfg-stedi',
        tenantId: 'tenant-demo',
        integrationType: 'eligibility',
        provider: 'stedi',
        config: {
          baseUrl: 'https://healthcare.us.stedi.com/2024-04-01',
          eligibilityPath: '/change/medicalnetwork/eligibility/v3',
          environment: 'test',
          useApprovedMockRequestForEligibility: true,
          mapTestResponseToRequestedPatient: true,
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      apiKey: 'stedi-test-key',
    });

    return adapter;
  }

  it('tests Stedi with the healthcare endpoint and Stedi API key authorization', async () => {
    const adapter = createStediAdapter();

    await adapter.testConnection();

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Key stedi-test-key',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: expect.any(String),
      })
    );

    const [, options] = mockedFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.tradingPartnerServiceId).toBe('60054');
    expect(body.subscriber).toEqual(expect.objectContaining({
      firstName: 'John',
      lastName: 'Doe',
      memberId: 'AETNA9wcSu',
    }));
    expect(body.dependents).toEqual([
      expect.objectContaining({
        firstName: 'Jordan',
        lastName: 'Doe',
        dateOfBirth: '20010714',
      }),
    ]);
  });

  it('maps Stedi benefits into the app eligibility response shape', async () => {
    const adapter = createStediAdapter();

    const result = await adapter.checkEligibility({
      patientId: 'patient-1',
      payerId: 'AHS',
      memberId: 'member-1',
      patientFirstName: 'James',
      patientLastName: 'Ward',
      patientDob: '1980-02-03',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('active');
    expect(result.payer.payerName).toBe('Stedi Test Payer');
    expect(result.patient).toEqual(expect.objectContaining({
      memberId: 'member-1',
      firstName: 'James',
      lastName: 'Ward',
      dob: '1980-02-03',
    }));
    expect(result.coverage.planName).toBe('Open Access Plus');
    expect(result.benefits.copays?.specialist).toBe(4000);
    expect(result.benefits.deductible?.individual?.total).toBe(25000);
    expect(result.benefits.outOfPocketMax?.individual?.total).toBe(300000);
    expect(result.benefits.coinsurance?.percentage).toBe(10);
  });
});
