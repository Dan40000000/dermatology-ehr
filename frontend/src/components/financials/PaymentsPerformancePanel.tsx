import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { fetchARAging, fetchCollectionsTrend, fetchPaymentsSummary } from '../../api/financials';

type Granularity = 'day' | 'week' | 'month';
type PresetKey = '7d' | '30d' | '90d' | 'ytd' | '1y' | 'custom';

interface TrendPoint {
  bucketStartDate: string;
  bucketEndDate: string;
  paymentsCollectedCents: number;
  revenueEarnedCents: number;
  patientPaymentsCents: number;
  payerPaymentsCents: number;
  paymentCount: number;
  billCount: number;
}

interface TrendSummary {
  totalPaymentsCollectedCents: number;
  totalRevenueEarnedCents: number;
  totalPatientPaymentsCents: number;
  totalPayerPaymentsCents: number;
  totalPaymentCount: number;
  totalBillCount: number;
  dayCount: number;
  avgDailyPaymentsCollectedCents: number;
  avgDailyRevenueEarnedCents: number;
  collectionRate: number;
}

interface PaymentMixPoint {
  method: string;
  amountCents: number;
  count: number;
}

interface ARAgingBucket {
  key: string;
  label: string;
  billCount: number;
  totalBalanceCents: number;
  patientBalanceCents: number;
  insuranceBalanceCents: number;
  percentageOfTotal: number;
}

interface ARAgingTotals {
  totalBalanceCents: number;
  patientBalanceCents: number;
  insuranceBalanceCents: number;
  over90BalanceCents: number;
  patientSharePercent: number;
  insuranceSharePercent: number;
  over90Percent: number;
}

const EMPTY_SUMMARY: TrendSummary = {
  totalPaymentsCollectedCents: 0,
  totalRevenueEarnedCents: 0,
  totalPatientPaymentsCents: 0,
  totalPayerPaymentsCents: 0,
  totalPaymentCount: 0,
  totalBillCount: 0,
  dayCount: 0,
  avgDailyPaymentsCollectedCents: 0,
  avgDailyRevenueEarnedCents: 0,
  collectionRate: 0,
};

const EMPTY_AR_TOTALS: ARAgingTotals = {
  totalBalanceCents: 0,
  patientBalanceCents: 0,
  insuranceBalanceCents: 0,
  over90BalanceCents: 0,
  patientSharePercent: 0,
  insuranceSharePercent: 0,
  over90Percent: 0,
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getPresetRange(preset: PresetKey): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = toIsoDate(today);

  if (preset === '7d') {
    return { startDate: toIsoDate(shiftDays(today, -6)), endDate };
  }
  if (preset === '90d') {
    return { startDate: toIsoDate(shiftDays(today, -89)), endDate };
  }
  if (preset === 'ytd') {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  if (preset === '1y') {
    return { startDate: toIsoDate(shiftDays(today, -364)), endDate };
  }

  // 30d default
  return { startDate: toIsoDate(shiftDays(today, -29)), endDate };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);
}

function formatAmount(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPointLabel(dateValue: string, granularity: Granularity): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  if (granularity === 'month') {
    return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  if (granularity === 'week') {
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeMethod(method: string): string {
  return method
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PaymentsPerformancePanel() {
  const { session } = useAuth();
  const [preset, setPreset] = useState<PresetKey>('30d');
  const initialRange = getPresetRange('30d');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TrendSummary>(EMPTY_SUMMARY);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [paymentMix, setPaymentMix] = useState<PaymentMixPoint[]>([]);
  const [arAgingBuckets, setARAgingBuckets] = useState<ARAgingBucket[]>([]);
  const [arAgingTotals, setARAgingTotals] = useState<ARAgingTotals>(EMPTY_AR_TOTALS);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [trendRes, paymentSummaryRes, arAgingRes] = await Promise.all([
        fetchCollectionsTrend(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          {
            startDate,
            endDate,
            granularity,
          },
        ),
        fetchPaymentsSummary(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          {
            startDate,
            endDate,
          },
        ),
        fetchARAging(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          {
            asOfDate: endDate,
          },
        ),
      ]);

      setTrendPoints(Array.isArray(trendRes?.data) ? trendRes.data : []);
      setSummary({ ...EMPTY_SUMMARY, ...(trendRes?.summary || {}) });

      const patientMixRows = Array.isArray(paymentSummaryRes?.patientPaymentsByMethod)
        ? paymentSummaryRes.patientPaymentsByMethod
        : [];

      const normalizedPatientMix: PaymentMixPoint[] = patientMixRows.map((row: any) => ({
        method: normalizeMethod(String(row.paymentMethod || 'Unknown')),
        amountCents: Number(row.totalCents || 0),
        count: Number(row.count || 0),
      }));

      const payerAppliedCents = Number(paymentSummaryRes?.payerPaymentsSummary?.appliedCents || 0);
      const payerCount = Number(paymentSummaryRes?.payerPaymentsSummary?.count || 0);
      if (payerAppliedCents > 0) {
        normalizedPatientMix.push({
          method: 'Payer Applied',
          amountCents: payerAppliedCents,
          count: payerCount,
        });
      }

      normalizedPatientMix.sort((a, b) => b.amountCents - a.amountCents);
      setPaymentMix(normalizedPatientMix);

      const nextARAgingBuckets: ARAgingBucket[] = Array.isArray(arAgingRes?.buckets)
        ? arAgingRes.buckets.map((bucket: any) => ({
            key: String(bucket.key || ''),
            label: String(bucket.label || bucket.key || ''),
            billCount: Number(bucket.billCount || 0),
            totalBalanceCents: Number(bucket.totalBalanceCents || 0),
            patientBalanceCents: Number(bucket.patientBalanceCents || 0),
            insuranceBalanceCents: Number(bucket.insuranceBalanceCents || 0),
            percentageOfTotal: Number(bucket.percentageOfTotal || 0),
          }))
        : [];
      setARAgingBuckets(nextARAgingBuckets);
      setARAgingTotals({ ...EMPTY_AR_TOTALS, ...(arAgingRes?.totals || {}) });
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (fetchError) {
      setError('Unable to load payment performance history');
      setTrendPoints([]);
      setPaymentMix([]);
      setARAgingBuckets([]);
      setARAgingTotals(EMPTY_AR_TOTALS);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [session, startDate, endDate, granularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = useMemo(
    () =>
      trendPoints.map((point) => ({
        label: formatPointLabel(point.bucketStartDate, granularity),
        date: point.bucketStartDate,
        payments: Number((point.paymentsCollectedCents / 100).toFixed(2)),
        revenue: Number((point.revenueEarnedCents / 100).toFixed(2)),
      })),
    [trendPoints, granularity],
  );

  const paymentMixData = useMemo(
    () =>
      paymentMix.map((mix) => ({
        method: mix.method,
        amount: Number((mix.amountCents / 100).toFixed(2)),
        count: mix.count,
      })),
    [paymentMix],
  );

  const arAgingChartData = useMemo(
    () =>
      arAgingBuckets.map((bucket) => ({
        label: bucket.label,
        total: Number((bucket.totalBalanceCents / 100).toFixed(2)),
        patient: Number((bucket.patientBalanceCents / 100).toFixed(2)),
        insurance: Number((bucket.insuranceBalanceCents / 100).toFixed(2)),
        billCount: bucket.billCount,
      })),
    [arAgingBuckets],
  );

  const applyPreset = (nextPreset: PresetKey) => {
    setPreset(nextPreset);
    if (nextPreset === 'custom') {
      return;
    }
    const range = getPresetRange(nextPreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleDateInput = (type: 'start' | 'end', value: string) => {
    setPreset('custom');
    if (type === 'start') {
      setStartDate(value);
      return;
    }
    setEndDate(value);
  };

  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '14px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Payments Performance</h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
            Daily collections vs earned revenue with flexible history windows
          </p>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>
          {updatedAt ? `Updated ${updatedAt}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {[
          { key: '7d', label: '7D' },
          { key: '30d', label: '30D' },
          { key: '90d', label: '90D' },
          { key: 'ytd', label: 'YTD' },
          { key: '1y', label: '1Y' },
        ].map((option) => (
          <button
            key={option.key}
            onClick={() => applyPreset(option.key as PresetKey)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: preset === option.key ? '#059669' : 'white',
              color: preset === option.key ? 'white' : '#374151',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Start
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateInput('start', e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.4rem 0.55rem', fontSize: '0.8rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
          End
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateInput('end', e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.4rem 0.55rem', fontSize: '0.8rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Grouping
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.4rem 0.55rem', fontSize: '0.8rem', background: 'white' }}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <button
          onClick={loadData}
          style={{
            border: '1px solid #059669',
            color: '#059669',
            background: 'white',
            borderRadius: '6px',
            padding: '0.45rem 0.8rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.65rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Payments Collected</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#065f46' }}>{formatCurrency(summary.totalPaymentsCollectedCents)}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Revenue Earned</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(summary.totalRevenueEarnedCents)}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Collection Rate</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: summary.collectionRate >= 90 ? '#065f46' : '#b45309' }}>
            {summary.collectionRate}%
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Avg Daily Collected</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#374151' }}>{formatCurrency(summary.avgDailyPaymentsCollectedCents)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Total A/R</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#7c2d12' }}>{formatCurrency(arAgingTotals.totalBalanceCents)}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Patient A/R</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0369a1' }}>
            {formatCurrency(arAgingTotals.patientBalanceCents)} ({arAgingTotals.patientSharePercent}%)
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Insurance A/R</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1d4ed8' }}>
            {formatCurrency(arAgingTotals.insuranceBalanceCents)} ({arAgingTotals.insuranceSharePercent}%)
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '0.75rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>90+ Day A/R</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#b91c1c' }}>
            {formatCurrency(arAgingTotals.over90BalanceCents)} ({arAgingTotals.over90Percent}%)
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '0.75rem', minHeight: '280px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Collections vs Revenue Trend
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(value) => formatAmount(Number(value))}
              />
              <Tooltip
                formatter={(value: any, name: string) => [
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)),
                  name === 'payments' ? 'Payments Collected' : 'Revenue Earned',
                ]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
              />
              <Legend
                formatter={(value) => (value === 'payments' ? 'Payments Collected' : 'Revenue Earned')}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="revenue"
                fill="#bfdbfe"
                stroke="#3b82f6"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="payments"
                name="payments"
                fill="#bbf7d0"
                stroke="#059669"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '0.75rem', minHeight: '280px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Payment Method Mix
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={paymentMixData} layout="vertical" margin={{ top: 4, right: 10, left: 16, bottom: 4 }}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(value) => formatAmount(Number(value))} />
              <YAxis dataKey="method" type="category" width={86} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip
                formatter={(value: any) =>
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
                }
              />
              <Bar dataKey="amount" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '0.75rem', minHeight: '280px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            A/R Aging by Bucket (Patient vs Insurance)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={arAgingChartData} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(value) => formatAmount(Number(value))} />
              <Tooltip
                formatter={(value: any, name: string) => [
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)),
                  name === 'patient' ? 'Patient A/R' : 'Insurance A/R',
                ]}
              />
              <Legend
                formatter={(value) => (value === 'patient' ? 'Patient A/R' : 'Insurance A/R')}
              />
              <Bar dataKey="patient" stackId="aging" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="insurance" stackId="aging" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '0.75rem', minHeight: '280px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Aging Buckets
          </div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {arAgingBuckets.map((bucket) => (
              <div
                key={bucket.key}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0.55rem 0.6rem',
                  background: '#f9fafb',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#374151' }}>{bucket.label}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{bucket.billCount} bills</div>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{formatCurrency(bucket.totalBalanceCents)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.72rem', color: '#4b5563' }}>
                  <span>Pt: {formatCurrency(bucket.patientBalanceCents)}</span>
                  <span>Ins: {formatCurrency(bucket.insuranceBalanceCents)}</span>
                  <span>{bucket.percentageOfTotal}%</span>
                </div>
              </div>
            ))}
            {arAgingBuckets.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>No open A/R balances in this range.</div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>Loading payment history...</div>
      )}
    </div>
  );
}
