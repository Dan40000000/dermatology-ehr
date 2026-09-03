import { pool } from '../../db/pool';
import { MIPSService, MipsReferenceValidationError } from '../mipsService';

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
const service = new MIPSService();

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

describe('legacy MIPS integrity', () => {
  it('subtracts one exclusion once and bounds a 2-met/1-excluded rate at 100%', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'measure-db-a',
        measure_id: 'MIPS-A',
        measure_name: 'Synthetic quality measure',
        benchmark_data: { national_average: 75, top_decile: 95 },
        points: 10,
        denominator_count: '3',
        numerator_count: '2',
        exclusion_count: '1',
      }],
    });

    const result = await service.calculatePerformance(
      'tenant-a',
      undefined,
      'MIPS-A',
      '2026-01-01',
      '2026-12-31',
    );

    expect(result.denominatorCount).toBe(2);
    expect(result.exclusionCount).toBe(1);
    expect(result.numeratorCount).toBe(2);
    expect(result.performanceRate).toBe(100);
    expect(result.performanceRate).toBeGreaterThanOrEqual(0);
    expect(result.performanceRate).toBeLessThanOrEqual(100);
    expect(String(poolQueryMock.mock.calls[0][0])).toContain("'excluded'");
  });

  it('rejects a cross-tenant patient before inserting status', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'measure-db-a' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // patient lookup
      .mockResolvedValueOnce({}); // ROLLBACK
    const client = makeClient(clientQuery);
    poolConnectMock.mockResolvedValueOnce(client);

    await expect(service.recordMeasureStatus(
      'tenant-a',
      'patient-from-tenant-b',
      'measure-db-a',
      undefined,
      'met',
    )).rejects.toBeInstanceOf(MipsReferenceValidationError);

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_status'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rejects an encounter belonging to another patient before inserting status', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'measure-db-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'patient-a' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // mismatched encounter lookup
      .mockResolvedValueOnce({}); // ROLLBACK
    const client = makeClient(clientQuery);
    poolConnectMock.mockResolvedValueOnce(client);

    await expect(service.recordMeasureStatus(
      'tenant-a',
      'patient-a',
      'measure-db-a',
      'encounter-for-patient-b',
      'met',
    )).rejects.toBeInstanceOf(MipsReferenceValidationError);

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_status'))).toBe(false);
  });

  it('rejects a provider outside the caller tenant before inserting status', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'measure-db-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'patient-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'encounter-a' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // provider lookup
      .mockResolvedValueOnce({}); // ROLLBACK
    const client = makeClient(clientQuery);
    poolConnectMock.mockResolvedValueOnce(client);

    await expect(service.recordMeasureStatus(
      'tenant-a',
      'patient-a',
      'measure-db-a',
      'encounter-a',
      'met',
      undefined,
      undefined,
      undefined,
      'provider-from-tenant-b',
    )).rejects.toBeInstanceOf(MipsReferenceValidationError);

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_status'))).toBe(false);
  });

  it('validates references before committing a status upsert', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'measure-db-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'patient-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'encounter-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'provider-a' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // alert update
      .mockResolvedValueOnce({}); // COMMIT
    const client = makeClient(clientQuery);
    poolConnectMock.mockResolvedValueOnce(client);

    const result = await service.recordMeasureStatus(
      'tenant-a',
      'patient-a',
      'measure-db-a',
      'encounter-a',
      'met',
      'documented',
      undefined,
      { source: 'synthetic' },
      'provider-a',
    );

    expect(result).toMatchObject({
      patientId: 'patient-a',
      measureId: 'measure-db-a',
      encounterId: 'encounter-a',
      status: 'met',
      performanceMet: true,
    });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO patient_measure_status'))).toBe(true);
    expect(clientQuery.mock.calls[clientQuery.mock.calls.length - 1]?.[0]).toBe('COMMIT');
  });
});
