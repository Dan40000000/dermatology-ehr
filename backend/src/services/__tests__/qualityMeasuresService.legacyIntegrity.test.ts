import { pool } from '../../db/pool';
import { MipsReferenceValidationError } from '../mipsService';
import { QualityMeasuresService } from '../qualityMeasuresService';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
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

const poolQueryMock = pool.query as jest.Mock;
const poolConnectMock = pool.connect as jest.Mock;
const service = new QualityMeasuresService();

function makeClient(query: jest.Mock) {
  return {
    query,
    release: jest.fn(),
  } as any;
}

beforeEach(() => {
  poolQueryMock.mockReset();
  poolConnectMock.mockReset();
});

describe('legacy quality-measures integrity', () => {
  it('subtracts one exclusion once and bounds a 2-met/1-excluded rate at 100%', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        measure_db_id: 'measure-db-a',
        measure_id: 'MIPS-A',
        measure_name: 'Synthetic quality measure',
        benchmark_data: { national_average: 75 },
        denominator_count: '3',
        numerator_count: '2',
        exclusion_count: '1',
      }],
    });

    const result = await service.calculateMeasureRate(
      'tenant-a',
      'MIPS-A',
      undefined,
      '2026-01-01',
      '2026-12-31',
    );

    expect(result.denominatorCount).toBe(2);
    expect(result.exclusionCount).toBe(1);
    expect(result.numeratorCount).toBe(2);
    expect(result.performanceRate).toBe(100);
    expect(String(poolQueryMock.mock.calls[0][0])).toContain('OR pmt.exclusion_applied = true');
  });

  it('rejects a cross-tenant patient before inserting tracking or events', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'measure-db-a' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // patient lookup
      .mockResolvedValueOnce({}); // ROLLBACK
    const client = makeClient(clientQuery);
    poolConnectMock.mockResolvedValueOnce(client);

    await expect(service.trackMeasurePerformance(
      'tenant-a',
      'patient-from-tenant-b',
      'MIPS-A',
      'encounter-a',
      'provider-a',
      {
        patientId: 'patient-from-tenant-b',
        measureId: 'MIPS-A',
        isDenominatorEligible: true,
        numeratorMet: true,
        exclusionApplied: false,
        sourceData: {},
      },
    )).rejects.toBeInstanceOf(MipsReferenceValidationError);

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_tracking'))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_events'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
