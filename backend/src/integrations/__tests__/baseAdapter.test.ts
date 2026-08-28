const mockClientQuery = jest.fn();
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.mock('../../db/pool', () => ({
  pool: {
    connect: mockConnect,
    query: mockQuery,
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

import { pool } from '../../db/pool';
import { logger } from '../../lib/logger';
import {
  BaseAdapter,
  IntegrationLogEntry,
  RetryOptions,
  saveIntegrationConfig,
} from '../baseAdapter';

class TestAdapter extends BaseAdapter {
  getIntegrationType(): string {
    return 'test-integration';
  }

  getProvider(): string {
    return 'test-provider';
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'ok' };
  }

  logForTest(entry: Omit<IntegrationLogEntry, 'tenantId' | 'integrationType'>): Promise<void> {
    return this.logIntegration(entry);
  }

  retryForTest<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T> {
    return this.withRetry(fn, options);
  }
}

describe('saveIntegrationConfig', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('RETURNING id')) {
        return Promise.resolve({ rows: [{ id: 'cfg-stedi' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    (logger.info as jest.Mock).mockReset();
    (logger.warn as jest.Mock).mockReset();
    (logger.error as jest.Mock).mockReset();
  });

  it('activates the selected provider and deactivates other providers for the same integration type', async () => {
    const id = await saveIntegrationConfig(
      'tenant-demo',
      'eligibility',
      'stedi',
      {
        environment: 'test',
        syncFrequencyMinutes: 60,
      },
      { apiKey: 'test-key' }
    );

    expect(id).toBe('cfg-stedi');
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('provider <> $3'),
      ['tenant-demo', 'eligibility', 'stedi']
    );
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('is_active = true'),
      expect.arrayContaining(['tenant-demo', 'eligibility', 'stedi', 60])
    );
    expect(mockClientQuery).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when saving fails', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('RETURNING id')) {
        return Promise.reject(new Error('insert failed'));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    await expect(
      saveIntegrationConfig(
        'tenant-demo',
        'eligibility',
        'stedi',
        { environment: 'test' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('insert failed');

    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe('BaseAdapter integration logging', () => {
  it('recursively sanitizes request and response data and stores only an opaque error code', async () => {
    const adapter = new TestAdapter({ tenantId: 'tenant-demo', useMock: true });
    const patientName = 'Synthetic Patient';
    const patientDate = '1987-04-23';
    const patientPhone = '555-010-1234';
    const providerErrorMessage = `Synthetic provider rejection for ${patientName}, ${patientDate}, ${patientPhone}`;

    await adapter.logForTest({
      direction: 'outbound',
      endpoint: '/synthetic-patients',
      method: 'POST',
      request: {
        patient: {
          fullName: patientName,
          dateOfBirth: patientDate,
          phone: patientPhone,
        },
        authorization: 'Bearer synthetic-token',
      },
      response: {
        body: {
          patientName,
          dateOfBirth: patientDate,
          phone: patientPhone,
          providerError: providerErrorMessage,
        },
        providerRequestId: 'provider-request-123',
      },
      status: 'error',
      statusCode: 502,
      errorMessage: providerErrorMessage,
      durationMs: 42,
      correlationId: 'correlation-synthetic-123',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    const serializedParams = JSON.stringify(params);

    expect(serializedParams).not.toContain(patientName);
    expect(serializedParams).not.toContain(patientDate);
    expect(serializedParams).not.toContain(patientPhone);
    expect(serializedParams).not.toContain(providerErrorMessage);
    expect(params[6]).toEqual(expect.stringContaining('[REDACTED]'));
    expect(params[7]).toEqual(expect.stringContaining('[DATE-REDACTED]'));
    expect(params[10]).toEqual(expect.stringMatching(/^ERR_[A-F0-9]{16}$/));
    expect(params[8]).toBe('error');
    expect(params[9]).toBe(502);
    expect(params[12]).toBe('correlation-synthetic-123');
  });

  it('uses opaque codes for log persistence failures and retry warning metadata', async () => {
    const adapter = new TestAdapter({ tenantId: 'tenant-demo', useMock: true });
    const providerErrorMessage = 'Synthetic provider error for Synthetic Patient on 1987-04-23 at 555-010-1234';
    const persistenceError = new Error(providerErrorMessage);
    mockQuery.mockRejectedValueOnce(persistenceError);

    await adapter.logForTest({
      direction: 'inbound',
      endpoint: '/synthetic-patients',
      method: 'GET',
      response: { providerError: providerErrorMessage },
      status: 'error',
      statusCode: 503,
      errorMessage: providerErrorMessage,
      correlationId: 'correlation-synthetic-456',
    });

    const persistenceMetadata = (logger.error as jest.Mock).mock.calls[0][1];
    expect(JSON.stringify(persistenceMetadata)).not.toContain(providerErrorMessage);
    expect(persistenceMetadata).toEqual(expect.objectContaining({
      errorCode: expect.stringMatching(/^ERR_[A-F0-9]{16}$/),
      correlationId: 'correlation-synthetic-456',
      status: 'error',
      statusCode: 503,
    }));
    expect(persistenceMetadata).not.toHaveProperty('error');

    let attempts = 0;
    const retryError = Object.assign(new Error(providerErrorMessage), {
      statusCode: 503,
      response: { data: { providerError: providerErrorMessage } },
    });

    await expect(
      adapter.retryForTest(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw retryError;
        }
        return 'ok';
      }, {
        maxRetries: 1,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 2,
        retryableStatuses: [503],
      })
    ).resolves.toBe('ok');

    const retryMetadata = (logger.warn as jest.Mock).mock.calls[0][1];
    expect(JSON.stringify(retryMetadata)).not.toContain(providerErrorMessage);
    expect(retryMetadata).toEqual(expect.objectContaining({
      errorCode: expect.stringMatching(/^ERR_[A-F0-9]{16}$/),
      statusCode: 503,
      correlationId: expect.any(String),
    }));
    expect(retryMetadata).not.toHaveProperty('error');
  });
});
