const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.mock('../../db/pool', () => ({
  pool: {
    connect: mockConnect,
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
import { saveIntegrationConfig } from '../baseAdapter';

describe('saveIntegrationConfig', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
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
