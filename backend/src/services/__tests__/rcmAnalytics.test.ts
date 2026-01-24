import { pool } from '../../db/pool';
import { RCMAnalyticsService } from '../rcmAnalytics';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('RCMAnalyticsService', () => {
  const tenantId = 'tenant-1';
  const startDate = new Date('2024-01-01T00:00:00Z');
  const endDate = new Date('2024-01-31T23:59:59Z');
  const prevStart = new Date('2023-12-01T00:00:00Z');
  const prevEnd = new Date('2023-12-31T23:59:59Z');

  beforeEach(() => {
    queryMock.mockReset();
  });

  it('calculates KPIs for current and previous periods', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: '10000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '6000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1000' }] })
      .mockResolvedValueOnce({ rows: [{ avg_days: '25.5', total_ar: '4000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '10', denied: '2' }] })
      .mockResolvedValueOnce({ rows: [{ clean: '7' }] })
      .mockResolvedValueOnce({ rows: [{ total: '8000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '4000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '500' }] })
      .mockResolvedValueOnce({ rows: [{ avg_days: '30', total_ar: '3000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '8', denied: '1' }] })
      .mockResolvedValueOnce({ rows: [{ clean: '6' }] });

    const result = await RCMAnalyticsService.calculateKPIs(
      tenantId,
      startDate,
      endDate,
      prevStart,
      prevEnd
    );

    expect(result.current.totalCharges).toBe(10000);
    expect(result.current.totalCollections).toBe(7000);
    expect(result.current.collectionRate).toBeCloseTo(70);
    expect(result.current.daysInAR).toBeCloseTo(25.5);
    expect(result.current.denialRate).toBeCloseTo(20);
    expect(result.current.cleanClaimRate).toBeCloseTo(70);
    expect(result.current.totalAR).toBe(4000);

    expect(result.previous.totalCharges).toBe(8000);
    expect(result.previous.totalCollections).toBe(4500);
    expect(result.previous.collectionRate).toBeCloseTo(56.25);
    expect(result.previous.denialRate).toBeCloseTo(12.5);
  });

  it('builds A/R aging buckets and totals', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          current: '100',
          days31_60: '50',
          days61_90: '25',
          days91_120: '10',
          days120_plus: '5',
        },
      ],
    });

    const result = await RCMAnalyticsService.getARAgingData(tenantId);

    expect(result).toEqual({
      current: 100,
      days31_60: 50,
      days61_90: 25,
      days91_120: 10,
      days120Plus: 5,
      total: 190,
    });
  });

  it('returns collections trend with computed gaps and weekly granularity', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { date: '2024-W01', collections: '500', charges: '800', gap: '300' },
        { date: '2024-W02', collections: '600', charges: '900', gap: '300' },
      ],
    });

    const result = await RCMAnalyticsService.getCollectionsTrend(
      tenantId,
      startDate,
      endDate,
      'weekly'
    );

    expect(queryMock.mock.calls[0][1][3]).toBe('1 week');
    expect(queryMock.mock.calls[0][1][4]).toBe('weekly');
    expect(queryMock.mock.calls[0][1][5]).toBe('YYYY-"W"IW');
    expect(result).toEqual([
      { date: '2024-W01', collections: 500, charges: 800, gap: 300 },
      { date: '2024-W02', collections: 600, charges: 900, gap: 300 },
    ]);
  });

  it('summarizes denial analysis with percentages and recovery rate', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { reason: 'Missing Prior Authorization', count: '3', amount: '300' },
          { reason: 'Duplicate Claim', count: '0', amount: '0' },
          { reason: 'Other', count: '2', amount: '200' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_denials: '5', total_amount: '500' }] });

    const result = await RCMAnalyticsService.getDenialAnalysis(tenantId, startDate, endDate);

    expect(result.totalDenials).toBe(5);
    expect(result.totalDenialAmount).toBe(500);
    expect(result.recoveryRate).toBe(35.0);
    expect(result.topReasons).toEqual([
      {
        reason: 'Missing Prior Authorization',
        count: 3,
        amount: 300,
        percentage: 60,
      },
      {
        reason: 'Other',
        count: 2,
        amount: 200,
        percentage: 40,
      },
    ]);
  });

  it('calculates payer performance metrics', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          payer_name: 'Aetna',
          charges: '10000',
          payments: '7500',
          denials: '2',
          claim_count: '10',
          avg_days: '14',
        },
      ],
    });

    const result = await RCMAnalyticsService.getPayerPerformance(tenantId, startDate, endDate);

    expect(result).toEqual([
      {
        payerName: 'Aetna',
        charges: 10000,
        payments: 7500,
        denials: 2,
        denialRate: 20,
        avgDaysToPay: 14,
        collectionRate: 75,
      },
    ]);
  });

  it('calculates provider productivity metrics', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          provider_id: 'provider-1',
          provider_name: 'Dr Demo',
          encounters: '5',
          patients: '4',
          charges: '20000',
          collections: '15000',
          denials: '1',
          total_claims: '10',
        },
      ],
    });

    const result = await RCMAnalyticsService.getProviderProductivity(tenantId, startDate, endDate);

    expect(result).toEqual([
      {
        providerId: 'provider-1',
        providerName: 'Dr Demo',
        encounters: 5,
        patients: 4,
        charges: 20000,
        collections: 15000,
        chargesPerPatient: 5000,
        collectionRate: 75,
        denialRate: 10,
      },
    ]);
  });

  it('maps action items with optional fields', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'action-1',
          type: 'denial',
          priority: 'high',
          title: 'Review denial',
          description: 'Claim rejected',
          patient_id: 'patient-1',
          patient_name: 'Ana Derm',
          amount_cents: '5000',
          due_date: '2024-02-15',
          status: 'open',
        },
        {
          id: 'action-2',
          type: 'follow_up',
          priority: 'low',
          title: 'Call patient',
          description: 'Payment plan',
          patient_id: null,
          patient_name: null,
          amount_cents: null,
          due_date: null,
          status: 'in_progress',
        },
      ],
    });

    const result = await RCMAnalyticsService.getActionItems(tenantId, 10);

    expect(result).toEqual([
      {
        id: 'action-1',
        type: 'denial',
        priority: 'high',
        title: 'Review denial',
        description: 'Claim rejected',
        patientId: 'patient-1',
        patientName: 'Ana Derm',
        amountCents: 5000,
        dueDate: '2024-02-15',
        status: 'open',
      },
      {
        id: 'action-2',
        type: 'follow_up',
        priority: 'low',
        title: 'Call patient',
        description: 'Payment plan',
        patientId: null,
        patientName: null,
        amountCents: undefined,
        dueDate: null,
        status: 'in_progress',
      },
    ]);
  });

  it('combines financial events and sorts by date', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            due_date: '2024-02-10',
            type: 'payment_plan',
            description: 'Payment Plan Due: Ana Derm',
            amount_cents: '1000',
            status: 'pending',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            date: '2024-02-05',
            type: 'prior_auth_expiring',
            description: 'Prior Auth Expires: Ana Derm',
            status: 'expiring',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            statement_date: '2024-02-01',
            type: 'statement_run',
            description: 'Monthly Statement Run',
            status: 'scheduled',
          },
        ],
      });

    const result = await RCMAnalyticsService.getFinancialEvents(tenantId, startDate, endDate);

    expect(result).toEqual([
      {
        date: '2024-02-01',
        type: 'statement_run',
        description: 'Monthly Statement Run',
        status: 'scheduled',
      },
      {
        date: '2024-02-05',
        type: 'prior_auth_expiring',
        description: 'Prior Auth Expires: Ana Derm',
        status: 'expiring',
      },
      {
        date: '2024-02-10',
        type: 'payment_plan',
        description: 'Payment Plan Due: Ana Derm',
        amountCents: 1000,
        status: 'pending',
      },
    ]);
  });

  it('maps benchmark metrics by name', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          metric_name: 'denial_rate',
          benchmark_value: '5',
          percentile_25: '3',
          percentile_50: '4',
          percentile_75: '6',
          percentile_90: '8',
        },
      ],
    });

    const result = await RCMAnalyticsService.getBenchmarks('Dermatology');

    expect(result).toEqual({
      denial_rate: {
        benchmark: 5,
        p25: 3,
        p50: 4,
        p75: 6,
        p90: 8,
      },
    });
  });

  it('generates alerts when KPIs exceed benchmarks', () => {
    const alerts = RCMAnalyticsService.generateAlerts(
      {
        totalCharges: 0,
        totalCollections: 0,
        collectionRate: 50,
        daysInAR: 45,
        denialRate: 12,
        cleanClaimRate: 70,
        netCollectionRate: 0,
        totalAR: 0,
      },
      {
        denial_rate: { p75: 10 },
        days_in_ar: { p75: 30 },
        collection_rate: { p25: 60 },
        clean_claim_rate: { p50: 80 },
      }
    );

    expect(alerts).toHaveLength(4);
    expect(alerts[0]).toMatch(/High denial rate/);
  });

  it('returns no alerts when metrics are healthy', () => {
    const alerts = RCMAnalyticsService.generateAlerts(
      {
        totalCharges: 0,
        totalCollections: 0,
        collectionRate: 85,
        daysInAR: 20,
        denialRate: 3,
        cleanClaimRate: 95,
        netCollectionRate: 0,
        totalAR: 0,
      },
      {
        denial_rate: { p75: 10 },
        days_in_ar: { p75: 30 },
        collection_rate: { p25: 60 },
        clean_claim_rate: { p50: 80 },
      }
    );

    expect(alerts).toEqual([]);
  });
});
