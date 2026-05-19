import { useState } from 'react';
import type { CSSProperties } from 'react';

type DashboardRangePreset = 'today' | 'week' | 'mtd' | 'custom';

interface RCMMetrics {
  totalClinicalCollections: number;
  storeRevenueCents?: number;
  badDebtCents?: number;
  collectionsReferralBalanceCents?: number;
  collectionsReferralCount?: number;
  netCollectionRatio: number;
  adjustmentsWriteoffs: number;
  daysSalesOutstanding: number;
  firstPassClaimRate: number;
  denialRate: number;
  avgDaysToPay: number;
  claimsInQueue: number;
  pendingAppeals: number;
}

interface ARAgingBucket {
  label: string;
  range: string;
  amountCents: number;
  count: number;
  percentage: number;
  color: string;
}

interface Props {
  metrics?: RCMMetrics;
  arAging?: ARAgingBucket[];
  onDrillDown?: (metric: string) => void;
  activeDrillDown?: string | null;
  rangeControl?: {
    preset: DashboardRangePreset;
    startDate: string;
    endDate: string;
    rangeLabel: string;
    loading?: boolean;
    currentWeekRangeLabel: string;
    currentWeekClinicalCollectionsCents: number;
    onPresetChange: (preset: DashboardRangePreset) => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    onApplyCustomRange: () => void;
  };
}

const DEFAULT_METRICS: RCMMetrics = {
  totalClinicalCollections: 12750000, // $127,500
  storeRevenueCents: 0,
  badDebtCents: 0,
  collectionsReferralBalanceCents: 0,
  collectionsReferralCount: 0,
  netCollectionRatio: 94.5,
  adjustmentsWriteoffs: 425000, // $4,250
  daysSalesOutstanding: 28,
  firstPassClaimRate: 96.8,
  denialRate: 3.2,
  avgDaysToPay: 14,
  claimsInQueue: 45,
  pendingAppeals: 8,
};

const DEFAULT_AR_AGING: ARAgingBucket[] = [
  { label: 'Current', range: '0-30 days', amountCents: 4250000, count: 45, percentage: 40, color: '#047857' },
  { label: '31-60', range: '31-60 days', amountCents: 2125000, count: 22, percentage: 20, color: '#92400e' },
  { label: '61-90', range: '61-90 days', amountCents: 1062500, count: 12, percentage: 10, color: '#c2410c' },
  { label: '91-120', range: '91-120 days', amountCents: 1593750, count: 15, percentage: 15, color: '#b91c1c' },
  { label: '120+', range: '120+ days', amountCents: 1593750, count: 18, percentage: 15, color: '#dc2626' },
];

const accessibleBucketColor = (color: string): string => {
  const palette: Record<string, string> = {
    '#10b981': '#047857',
    '#f59e0b': '#92400e',
    '#f97316': '#c2410c',
    '#ef4444': '#b91c1c',
  };
  return palette[color.toLowerCase()] || color;
};

export function RCMDashboard({ metrics = DEFAULT_METRICS, arAging = DEFAULT_AR_AGING, onDrillDown, activeDrillDown, rangeControl }: Props) {
  const [showTrends, setShowTrends] = useState(false);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const totalAR = arAging.reduce((sum, bucket) => sum + bucket.amountCents, 0);
  const clinicalCollectionsLabel = rangeControl?.preset === 'today'
    ? 'Today Clinical Collections'
    : rangeControl?.preset === 'week'
      ? 'Current Week Clinical Collections'
      : rangeControl?.preset === 'mtd'
        ? 'MTD Clinical Collections'
        : 'Selected Range Clinical Collections';

  const drillableCardStyle = (metric: string, base: CSSProperties): CSSProperties => ({
    ...base,
    outline: activeDrillDown === metric ? '3px solid rgba(5, 150, 105, 0.32)' : 'none',
    position: 'relative',
  });

  const secondaryCardStyle = (metric: string, base: CSSProperties): CSSProperties =>
    drillableCardStyle(metric, {
      ...base,
      cursor: 'pointer',
      border: activeDrillDown === metric ? '2px solid #10b981' : '1px solid transparent',
      transition: 'all 0.2s ease',
    });

  return (
    <div className="rcm-dashboard">
      {/* Header with Period Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: '800',
            color: '#111827',
            marginBottom: '0.25rem',
          }}>Revenue Cycle Management</h2>
          <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
            Key performance indicators for {rangeControl?.rangeLabel || 'your practice'}
          </p>
          {rangeControl && (
            <div style={{ marginTop: '0.55rem', color: '#047857', fontSize: '0.84rem', fontWeight: 800 }}>
              Current week: {rangeControl.currentWeekRangeLabel} · {formatCurrency(rangeControl.currentWeekClinicalCollectionsCents)} clinical collections
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {rangeControl && (
            <div style={{
              background: '#f3f4f6',
              borderRadius: '10px',
              padding: '6px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '6px',
              minWidth: '430px',
              maxWidth: '520px',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: '5px' }}>
                {([
                  ['today', 'Current Day'],
                  ['week', 'Current Week'],
                  ['mtd', 'MTD'],
                ] as Array<[DashboardRangePreset, string]>).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => rangeControl.onPresetChange(preset)}
                    style={{
                      padding: '0.48rem 0.65rem',
                      border: 'none',
                      borderRadius: '7px',
                      background: rangeControl.preset === preset ? '#047857' : 'transparent',
                      color: rangeControl.preset === preset ? 'white' : '#374151',
                      fontWeight: '800',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  aria-label="Overview start date"
                  value={rangeControl.startDate}
                  onChange={(event) => rangeControl.onStartDateChange(event.target.value)}
                  style={{
                    minWidth: 0,
                    padding: '0.46rem 0.55rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '7px',
                    background: '#ffffff',
                    color: '#374151',
                    fontWeight: 700,
                  }}
                />
                <span style={{ color: '#374151', fontWeight: 800 }}>to</span>
                <input
                  type="date"
                  aria-label="Overview end date"
                  value={rangeControl.endDate}
                  onChange={(event) => rangeControl.onEndDateChange(event.target.value)}
                  style={{
                    minWidth: 0,
                    padding: '0.46rem 0.55rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '7px',
                    background: '#ffffff',
                    color: '#374151',
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={rangeControl.onApplyCustomRange}
                  disabled={rangeControl.loading}
                  style={{
                    padding: '0.48rem 0.8rem',
                    border: 'none',
                    borderRadius: '7px',
                    background: rangeControl.loading ? '#9ca3af' : '#0f766e',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.82rem',
                    cursor: rangeControl.loading ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rangeControl.loading ? 'Loading...' : 'Apply'}
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowTrends(!showTrends)}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              background: showTrends ? '#f0fdf4' : 'white',
              color: '#374151',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>Trends</span>
          </button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        {/* Month-to-Date Clinical Collections */}
        <div
          onClick={() => onDrillDown?.('collections')}
          style={drillableCardStyle('collections', {
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            borderRadius: '16px',
            padding: '1.5rem',
            color: 'white',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(5, 150, 105, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '0.5rem', fontWeight: '600' }}>
            {clinicalCollectionsLabel}
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            {formatCurrency(metrics.totalClinicalCollections)}
          </div>
          {showTrends && (
            <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#bbf7d0' }}>+8.5%</span>
              <span style={{ opacity: 0.8 }}>vs prior MTD</span>
            </div>
          )}
        </div>

        {/* Net Collection Ratio */}
        <div
          onClick={() => onDrillDown?.('collection-ratio')}
          style={drillableCardStyle('collection-ratio', {
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            Net Collection Ratio
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{
              fontSize: '2.25rem',
              fontWeight: '800',
              color: metrics.netCollectionRatio >= 95 ? '#059669' : metrics.netCollectionRatio >= 90 ? '#f59e0b' : '#ef4444',
            }}>
              {metrics.netCollectionRatio.toFixed(1)}
            </span>
            <span style={{ fontSize: '1.25rem', color: '#6b7280' }}>%</span>
          </div>
          <div style={{
            marginTop: '0.75rem',
            height: '8px',
            background: '#f3f4f6',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${metrics.netCollectionRatio}%`,
              height: '100%',
              background: metrics.netCollectionRatio >= 95 ? '#10b981' : metrics.netCollectionRatio >= 90 ? '#f59e0b' : '#ef4444',
              borderRadius: '4px',
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.5rem' }}>
            Industry benchmark: 95%
          </div>
        </div>

        {/* Days Sales Outstanding */}
        <div
          onClick={() => onDrillDown?.('dso')}
          style={drillableCardStyle('dso', {
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            Days Sales Outstanding (DSO)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{
              fontSize: '2.25rem',
              fontWeight: '800',
              color: metrics.daysSalesOutstanding <= 30 ? '#059669' : metrics.daysSalesOutstanding <= 45 ? '#f59e0b' : '#ef4444',
            }}>
              {metrics.daysSalesOutstanding}
            </span>
            <span style={{ fontSize: '1rem', color: '#6b7280' }}>days</span>
          </div>
          {showTrends && (
            <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
              -3 days from last month
            </div>
          )}
        </div>

        {/* First Pass Claim Rate */}
        <div
          onClick={() => onDrillDown?.('first-pass')}
          style={drillableCardStyle('first-pass', {
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
            First Pass Claim Rate
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{
              fontSize: '2.25rem',
              fontWeight: '800',
              color: '#059669',
            }}>
              {metrics.firstPassClaimRate.toFixed(1)}
            </span>
            <span style={{ fontSize: '1.25rem', color: '#6b7280' }}>%</span>
          </div>
          <div style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '0.5rem',
            fontSize: '0.75rem',
          }}>
            <span style={{
              padding: '0.25rem 0.5rem',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: '4px',
              fontWeight: '600',
            }}>
              Clean Claims
            </span>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div
          onClick={() => onDrillDown?.('adjustments')}
          style={secondaryCardStyle('adjustments', {
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Adjustments & Write-offs
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
            {formatCurrency(metrics.adjustmentsWriteoffs)}
          </div>
        </div>

        <div
          onClick={() => onDrillDown?.('store-revenue')}
          style={secondaryCardStyle('store-revenue', {
          background: '#ecfdf5',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#047857', marginBottom: '0.5rem' }}>
            Store Revenue
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#047857' }}>
            {formatCurrency(metrics.storeRevenueCents || 0)}
          </div>
        </div>

        <div
          onClick={() => onDrillDown?.('bad-debt')}
          style={secondaryCardStyle('bad-debt', {
          background: '#fff7ed',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#9a3412', marginBottom: '0.5rem' }}>
            Bad Debt / Loss
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#c2410c' }}>
            {formatCurrency(metrics.badDebtCents || 0)}
          </div>
        </div>

        <div
          onClick={() => onDrillDown?.('collections-referrals')}
          style={secondaryCardStyle('collections-referrals', {
          background: '#fee2e2',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.5rem' }}>
            Sent to Collections
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#b91c1c' }}>
            {formatCurrency(metrics.collectionsReferralBalanceCents || 0)}
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#991b1b' }}>
            {metrics.collectionsReferralCount || 0} account{(metrics.collectionsReferralCount || 0) === 1 ? '' : 's'}
          </div>
        </div>

        <div
          onClick={() => onDrillDown?.('denial-rate')}
          style={secondaryCardStyle('denial-rate', {
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Denial Rate
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: metrics.denialRate <= 5 ? '#047857' : '#92400e' }}>
            {metrics.denialRate.toFixed(1)}%
          </div>
        </div>

        <div
          onClick={() => onDrillDown?.('avg-days-to-pay')}
          style={secondaryCardStyle('avg-days-to-pay', {
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '1.25rem',
        })}>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Avg Days to Pay
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#374151' }}>
            {metrics.avgDaysToPay} days
          </div>
        </div>

        <div style={{
          background: '#fef3c7',
          borderRadius: '12px',
          padding: '1.25rem',
          cursor: 'pointer',
          border: activeDrillDown === 'claims-queue' ? '2px solid #10b981' : '1px solid transparent',
        }}
        onClick={() => onDrillDown?.('claims-queue')}
        >
          <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '0.5rem' }}>
            Claims in Queue
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#92400e' }}>
            {metrics.claimsInQueue}
          </div>
        </div>

        <div style={{
          background: '#fee2e2',
          borderRadius: '12px',
          padding: '1.25rem',
          cursor: 'pointer',
          border: activeDrillDown === 'appeals' ? '2px solid #10b981' : '1px solid transparent',
        }}
        onClick={() => onDrillDown?.('appeals')}
        >
          <div style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.5rem' }}>
            At-Risk Claims
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
            {metrics.pendingAppeals}
          </div>
        </div>
      </div>

      {/* A/R Aging Section */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        border: '2px solid #e5e7eb',
        padding: '1.5rem',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
              Accounts Receivable Aging
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Total A/R: {formatCurrency(totalAR)}
            </p>
          </div>
          <button
            onClick={() => onDrillDown?.('ar-aging')}
            style={{
              padding: '0.5rem 1rem',
              background: '#047857',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            View Details
          </button>
        </div>

        {/* Aging Bar Chart */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex',
            height: '40px',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            {arAging.map((bucket) => (
              <div
                key={bucket.label}
                style={{
                  width: `${bucket.percentage}%`,
                  background: accessibleBucketColor(bucket.color),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={`${bucket.label}: ${formatCurrency(bucket.amountCents)} (${bucket.count} accounts)`}
                onClick={() => onDrillDown?.('ar-aging')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {bucket.percentage >= 10 && `${bucket.percentage}%`}
              </div>
            ))}
          </div>
        </div>

        {/* Aging Buckets Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1rem',
        }}>
          {arAging.map((bucket) => (
            <div
              key={bucket.label}
              onClick={() => onDrillDown?.(`ar-${bucket.label.toLowerCase()}`)}
              style={{
                padding: '1rem',
                borderRadius: '8px',
                border: '2px solid #f3f4f6',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = bucket.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#f3f4f6';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: accessibleBucketColor(bucket.color),
                }} />
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>
                  {bucket.range}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>
                {formatCurrency(bucket.amountCents)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {bucket.count} accounts
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
