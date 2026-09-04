import { pool } from '../../db/pool';
import { QualityMeasuresService } from '../qualityMeasuresService';

jest.mock('../../db/pool', () => ({
  pool: {
    connect: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const poolConnectMock = pool.connect as jest.Mock;
const service = new QualityMeasuresService();

function makeClient() {
  return {
    query: jest.fn(),
    release: jest.fn(),
  };
}

describe('trackPromotingInteroperability', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-03T12:00:00Z'));
    poolConnectMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a single atomic delta upsert and returns the persisted counters', async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ numerator: '6', denominator: '8', performance_rate: '75.00' }],
    });
    poolConnectMock.mockResolvedValueOnce(client);

    const result = await service.trackPromotingInteroperability(
      'tenant-a',
      'e-Prescribing',
      true,
      true,
      'user-a',
    );

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO promoting_interoperability_tracking');
    expect(sql).toContain('ON CONFLICT (tenant_id, measure_name, tracking_period_start)');
    expect(sql).toContain('numerator = promoting_interoperability_tracking.numerator + EXCLUDED.numerator');
    expect(sql).toContain('denominator = promoting_interoperability_tracking.denominator + EXCLUDED.denominator');
    expect(sql).toContain('RETURNING numerator, denominator, performance_rate');
    expect(sql).not.toMatch(/SELECT\s+\*\s+FROM\s+promoting_interoperability_tracking/i);
    expect(values).toEqual([
      expect.any(String),
      'tenant-a',
      'e-Prescribing',
      1,
      1,
      '2026-01-01',
      '2026-12-31',
    ]);
    expect(result).toEqual({
      measureName: 'e-Prescribing',
      numerator: 6,
      denominator: 8,
      performanceRate: 75,
      isRequired: true,
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('passes zero deltas through the same upsert without changing existing totals', async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ numerator: 4, denominator: 5, performance_rate: '80.00' }],
    });
    poolConnectMock.mockResolvedValueOnce(client);

    await service.trackPromotingInteroperability(
      'tenant-a',
      'HIE: Receiving',
      false,
      false,
    );

    const [, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(values).toEqual([
      expect.any(String),
      'tenant-a',
      'HIE: Receiving',
      0,
      0,
      '2026-01-01',
      '2026-12-31',
    ]);
  });
});
