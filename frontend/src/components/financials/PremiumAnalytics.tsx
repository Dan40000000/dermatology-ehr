import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchCollectionsTrend } from '../../api/financials';
import { getClinicBusinessDate } from '../../utils/practiceDateTime';

interface AnalyticsCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface ChartData {
  label: string;
  value: number;
  change?: number;
}

interface Props {
  onExportReport?: (reportType: string) => void;
}

type PremiumDateRange = 'mtd' | 'qtd' | 'ytd' | 'custom';

interface TrendPoint {
  bucketStartDate: string;
  revenueEarnedCents?: number;
  paymentsCollectedCents?: number;
  patientPaymentsCents?: number;
  payerPaymentsCents?: number;
  storePaymentsCents?: number;
  badDebtCents?: number;
}

interface TrendSummary {
  totalRevenueEarnedCents?: number;
  totalPaymentsCollectedCents?: number;
  totalPatientPaymentsCents?: number;
  totalPayerPaymentsCents?: number;
  totalStorePaymentsCents?: number;
  totalBadDebtCents?: number;
  collectionRate?: number;
  revenueCategories?: Array<{
    key: string;
    label: string;
    revenueCents: number;
    itemCount: number;
  }>;
}

const ANALYTICS_CATEGORIES: AnalyticsCategory[] = [
  { id: 'administrative', name: 'Administrative', description: 'Visit volume, scheduling, staff productivity', icon: '' },
  { id: 'provider', name: 'Provider', description: 'Outcomes, E&M distribution, referrals', icon: '' },
  { id: 'financial', name: 'Financial', description: 'Reimbursement, charges/payments, A/R', icon: '' },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(baseIsoDate: string, days: number): string {
  const date = new Date(`${baseIsoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function startOfQuarter(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1)));
}

function getPremiumRange(range: PremiumDateRange, customStartDate?: string, customEndDate?: string) {
  const today = getClinicBusinessDate();
  const current = new Date(`${today}T00:00:00Z`);
  if (range === 'mtd') {
    return {
      startDate: toIsoDate(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))),
      endDate: today,
    };
  }
  if (range === 'qtd') {
    return { startDate: startOfQuarter(today), endDate: today };
  }
  if (range === 'ytd') {
    return {
      startDate: toIsoDate(new Date(Date.UTC(current.getUTCFullYear(), 0, 1))),
      endDate: today,
    };
  }
  return {
    startDate: customStartDate || addDays(today, -29),
    endDate: customEndDate || today,
  };
}

function rangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function aggregateTrend(points: TrendPoint[]) {
  const shouldUseMonths = points.length > 62;
  const map = new Map<string, { month: string; charges: number; payments: number; adjustments: number }>();
  points.forEach((point) => {
    const bucket = shouldUseMonths ? String(point.bucketStartDate || '').slice(0, 7) : String(point.bucketStartDate || '').slice(5, 10);
    const current = map.get(bucket) || { month: bucket, charges: 0, payments: 0, adjustments: 0 };
    current.charges += Number(point.revenueEarnedCents || 0);
    current.payments += Number(point.paymentsCollectedCents || 0);
    current.adjustments += Number(point.badDebtCents || 0);
    map.set(bucket, current);
  });
  return Array.from(map.values()).slice(-14);
}

export function PremiumAnalytics({ onExportReport }: Props) {
  const { session } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('financial');
  const [dateRange, setDateRange] = useState<PremiumDateRange>('mtd');
  const initialRange = getPremiumRange('mtd');
  const [customStartDate, setCustomStartDate] = useState(addDays(initialRange.endDate, -29));
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  const applyPreset = (range: PremiumDateRange) => {
    setDateRange(range);
    if (range === 'custom') {
      return;
    }
    setAppliedRange(getPremiumRange(range, customStartDate, customEndDate));
  };

  const applyCustomRange = () => {
    const nextRange = getPremiumRange('custom', customStartDate, customEndDate);
    if (nextRange.startDate > nextRange.endDate) {
      setError('Start date must be before end date.');
      return;
    }
    setDateRange('custom');
    setAppliedRange(nextRange);
  };

  const loadAnalytics = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const trendResponse = await fetchCollectionsTrend(
        { tenantId: session.tenantId, accessToken: session.accessToken },
        { startDate: appliedRange.startDate, endDate: appliedRange.endDate, granularity: 'day' },
      );
      setTrendData(Array.isArray(trendResponse?.data) ? trendResponse.data : []);
      setTrendSummary((trendResponse?.summary || null) as TrendSummary | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load premium analytics');
    } finally {
      setLoading(false);
    }
  }, [appliedRange.endDate, appliedRange.startDate, session]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const totalCharges = Number(trendSummary?.totalRevenueEarnedCents || 0);
  const totalPayments = Number(trendSummary?.totalPaymentsCollectedCents || 0);
  const totalAdjustments = Number(trendSummary?.totalBadDebtCents || 0);
  const netCollectionRate = totalCharges > 0 ? (totalPayments / totalCharges) * 100 : Number(trendSummary?.collectionRate || 0);
  const revenueGap = Math.max(0, totalCharges - totalPayments - totalAdjustments);

  const collectionSourceRows: ChartData[] = useMemo(() => ([
    { label: 'Payer Payments', value: Number(trendSummary?.totalPayerPaymentsCents || 0) },
    { label: 'Patient Payments', value: Number(trendSummary?.totalPatientPaymentsCents || 0) },
    { label: 'Store Payments', value: Number(trendSummary?.totalStorePaymentsCents || 0) },
    { label: 'Open Revenue Gap', value: revenueGap },
  ].filter((row) => row.value > 0)), [revenueGap, trendSummary]);

  const revenueCategoryRows: ChartData[] = useMemo(() => (
    (trendSummary?.revenueCategories || []).map((category) => ({
      label: category.label,
      value: Number(category.revenueCents || 0),
    })).filter((row) => row.value > 0)
  ), [trendSummary]);

  const trendBars = useMemo(() => aggregateTrend(trendData), [trendData]);
  const maxRevenue = Math.max(1, ...collectionSourceRows.map(d => d.value));
  const maxProcedureRevenue = Math.max(1, ...revenueCategoryRows.map(d => d.value));
  const maxMonthlyValue = Math.max(1, ...trendBars.map(d => Math.max(d.charges, d.payments, d.adjustments)));

  return (
    <div className="premium-analytics">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '2rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', marginBottom: '0.25rem' }}>
            Premium Analytics
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
            Comprehensive insights into your practice performance
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => onExportReport?.('pdf')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'white',
              color: '#374151',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Export PDF
          </button>
          <button
            onClick={() => onExportReport?.('excel')}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1.25rem',
        background: '#f9fafb',
        borderRadius: '12px',
        flexWrap: 'wrap',
      }}>
        {/* Date Range */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            Date Range
          </label>
          <div style={{
            display: 'flex',
            background: 'white',
            borderRadius: '8px',
            border: '2px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            {(['mtd', 'qtd', 'ytd', 'custom'] as const).map(range => (
              <button
                key={range}
                onClick={() => applyPreset(range)}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: dateRange === range ? '#059669' : 'white',
                  color: dateRange === range ? 'white' : '#6b7280',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {range}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '0.45rem', color: '#6b7280', fontSize: '0.78rem', fontWeight: 600 }}>
            {rangeLabel(appliedRange.startDate, appliedRange.endDate)}
          </div>
          {dateRange === 'custom' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem', alignItems: 'center' }}>
              <input
                aria-label="Premium analytics start date"
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                style={{ padding: '0.45rem 0.6rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontWeight: 600 }}
              />
              <input
                aria-label="Premium analytics end date"
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                style={{ padding: '0.45rem 0.6rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontWeight: 600 }}
              />
              <button
                type="button"
                onClick={applyCustomRange}
                style={{
                  padding: '0.48rem 0.8rem',
                  border: 'none',
                  background: '#059669',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Apply Range
              </button>
            </div>
          )}
        </div>

        {/* Provider Filter */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            Provider
          </label>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.9rem',
              minWidth: '180px',
              background: 'white',
            }}
          >
            <option value="all">All Providers</option>
            <option value="p1">Dr. Sarah Johnson</option>
            <option value="p2">Dr. Michael Chen</option>
            <option value="p3">Dr. Emily Rodriguez</option>
          </select>
        </div>

        {/* Location Filter */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            Location
          </label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.9rem',
              minWidth: '180px',
              background: 'white',
            }}
          >
            <option value="all">All Locations</option>
            <option value="l1">Main Clinic</option>
            <option value="l2">West Branch</option>
            <option value="l3">Downtown Office</option>
          </select>
        </div>
      </div>

      {(loading || error) && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.8rem 1rem',
          borderRadius: '10px',
          border: error ? '1px solid #fecaca' : '1px solid #d1fae5',
          background: error ? '#fef2f2' : '#f0fdf4',
          color: error ? '#991b1b' : '#047857',
          fontWeight: 700,
        }}>
          {error || 'Refreshing analytics...'}
        </div>
      )}

      {/* Category Tabs */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {ANALYTICS_CATEGORIES.map(category => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            style={{
              flex: 1,
              padding: '1.25rem',
              background: activeCategory === category.id ? '#059669' : 'white',
              color: activeCategory === category.id ? 'white' : '#374151',
              border: activeCategory === category.id ? 'none' : '2px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (activeCategory !== category.id) {
                e.currentTarget.style.borderColor = '#059669';
              }
            }}
            onMouseLeave={(e) => {
              if (activeCategory !== category.id) {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{category.icon}</div>
            <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>{category.name}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{category.description}</div>
          </button>
        ))}
      </div>

      {/* Financial Analytics */}
      {activeCategory === 'financial' && (
        <div>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              borderRadius: '16px',
              padding: '1.5rem',
              color: 'white',
            }}>
              <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Charges</div>
              <div style={{ fontSize: '2rem', fontWeight: '800' }}>{formatCurrency(totalCharges)}</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Earned revenue in range
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Payments</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>{formatCurrency(totalPayments)}</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                Patient, payer, and store cash
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Loss / Write-Offs</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#dc2626' }}>{formatCurrency(totalAdjustments)}</div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                {totalCharges > 0 ? `${((totalAdjustments / totalCharges) * 100).toFixed(1)}% of charges` : 'No charge base yet'}
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Net Collection Rate</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>{netCollectionRate.toFixed(1)}%</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                {formatCurrency(revenueGap)} open gap
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2rem',
            marginBottom: '2rem',
          }}>
            {/* Collections by Source */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Collections by Source
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {collectionSourceRows.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No collection activity in this range.</div>
                ) : collectionSourceRows.map((item, index) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.9rem', color: '#374151' }}>{item.label}</span>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(item.value)}</span>
                        {item.change && (
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: item.change > 0 ? '#059669' : '#dc2626',
                          }}>
                            {item.change > 0 ? '+' : ''}{item.change}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      height: '8px',
                      background: '#f3f4f6',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${(item.value / maxRevenue) * 100}%`,
                        height: '100%',
                        background: `hsl(${160 - index * 15}, 70%, 45%)`,
                        borderRadius: '4px',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue by Category */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Revenue by Category
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {revenueCategoryRows.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No categorized revenue in this range.</div>
                ) : revenueCategoryRows.map((item) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#374151' }}>{item.label}</span>
                      <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(item.value)}</span>
                    </div>
                    <div style={{
                      height: '8px',
                      background: '#f3f4f6',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${(item.value / maxProcedureRevenue) * 100}%`,
                        height: '100%',
                        background: '#10b981',
                        borderRadius: '4px',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly Trend Chart */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>
                Revenue and Collections Trend
              </h3>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#10b981' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Revenue</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#3b82f6' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Payments</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#ef4444' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Adjustments</span>
                </div>
              </div>
            </div>

            {/* Simple Bar Chart */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '1rem',
              height: '250px',
              padding: '0 1rem',
            }}>
              {trendBars.length === 0 ? (
                <div style={{ color: '#6b7280', alignSelf: 'center' }}>No trend rows in this range.</div>
              ) : trendBars.map((month) => (
                <div key={month.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '200px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: `${(month.charges / maxMonthlyValue) * 180}px`,
                        background: '#10b981',
                        borderRadius: '4px 4px 0 0',
                      }}
                      title={`Revenue: ${formatCurrency(month.charges)}`}
                    />
                    <div
                      style={{
                        width: '24px',
                        height: `${(month.payments / maxMonthlyValue) * 180}px`,
                        background: '#3b82f6',
                        borderRadius: '4px 4px 0 0',
                      }}
                      title={`Payments: ${formatCurrency(month.payments)}`}
                    />
                    <div
                      style={{
                        width: '24px',
                        height: `${(month.adjustments / maxMonthlyValue) * 180}px`,
                        background: '#ef4444',
                        borderRadius: '4px 4px 0 0',
                      }}
                      title={`Adjustments: ${formatCurrency(month.adjustments)}`}
                    />
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                    {month.month}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Administrative Analytics */}
      {activeCategory === 'administrative' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Visits</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#111827' }}>847</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                +5.2% vs last month
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>New Patients</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#111827' }}>124</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                +12.7% vs last month
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>No-Show Rate</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#f59e0b' }}>4.8%</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                -0.8% vs last month
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Avg Wait Time</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#111827' }}>12 min</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                -3 min vs last month
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2rem',
          }}>
            {/* Visit Volume by Day */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Visit Volume by Day
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '150px' }}>
                {[
                  { day: 'Mon', visits: 38 },
                  { day: 'Tue', visits: 42 },
                  { day: 'Wed', visits: 35 },
                  { day: 'Thu', visits: 45 },
                  { day: 'Fri', visits: 40 },
                ].map((d) => (
                  <div key={d.day} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        width: '40px',
                        height: `${(d.visits / 45) * 100}px`,
                        background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                        borderRadius: '4px 4px 0 0',
                        marginBottom: '0.5rem',
                      }}
                    />
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{d.day}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#111827' }}>{d.visits}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CPT Code Distribution */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Top CPT Codes
              </h3>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.5rem 0', textAlign: 'left', color: '#6b7280' }}>Code</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'right', color: '#6b7280' }}>Count</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'right', color: '#6b7280' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { code: '99214', desc: 'Office Visit Mod', count: 245, pct: 28.9 },
                    { code: '99213', desc: 'Office Visit Est', count: 198, pct: 23.4 },
                    { code: '11102', desc: 'Tangential Biopsy', count: 156, pct: 18.4 },
                    { code: '17000', desc: 'Destruction', count: 134, pct: 15.8 },
                    { code: '96372', desc: 'Injection', count: 114, pct: 13.5 },
                  ].map(row => (
                    <tr key={row.code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem 0' }}>
                        <span style={{ fontWeight: '600', color: '#111827' }}>{row.code}</span>
                        <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>{row.desc}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0', textAlign: 'right', color: '#111827' }}>{row.count}</td>
                      <td style={{ padding: '0.75rem 0', textAlign: 'right', color: '#059669', fontWeight: '600' }}>{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Provider Analytics */}
      {activeCategory === 'provider' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            {[
              { name: 'Dr. Sarah Johnson', visits: 312, revenue: 8750000, rating: 4.9 },
              { name: 'Dr. Michael Chen', visits: 287, revenue: 7250000, rating: 4.8 },
              { name: 'Dr. Emily Rodriguez', visits: 248, revenue: 6500000, rating: 4.9 },
            ].map(provider => (
              <div key={provider.name} style={{
                background: 'white',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '2px solid #e5e7eb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                      {provider.name}
                    </h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ color: '#f59e0b' }}>{'★'.repeat(Math.floor(provider.rating))}</span>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{provider.rating}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Visits</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>{provider.visits}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Revenue</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#059669' }}>{formatCurrency(provider.revenue)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* E&M Distribution */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #e5e7eb',
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
              E&M Code Distribution
            </h3>
            <div style={{ display: 'flex', gap: '2rem' }}>
              {[
                { code: '99211', pct: 5, desc: 'Level 1' },
                { code: '99212', pct: 12, desc: 'Level 2' },
                { code: '99213', pct: 35, desc: 'Level 3' },
                { code: '99214', pct: 38, desc: 'Level 4' },
                { code: '99215', pct: 10, desc: 'Level 5' },
              ].map(level => (
                <div key={level.code} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    width: '100%',
                    height: `${level.pct * 3}px`,
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                    borderRadius: '8px 8px 0 0',
                    marginBottom: '0.75rem',
                    minHeight: '20px',
                  }} />
                  <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#111827' }}>{level.code}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{level.desc}</div>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#059669', marginTop: '0.25rem' }}>{level.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
