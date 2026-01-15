import { useState } from 'react';

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

const ANALYTICS_CATEGORIES: AnalyticsCategory[] = [
  { id: 'administrative', name: 'Administrative', description: 'Visit volume, scheduling, staff productivity', icon: '' },
  { id: 'provider', name: 'Provider', description: 'Outcomes, E&M distribution, referrals', icon: '' },
  { id: 'financial', name: 'Financial', description: 'Reimbursement, charges/payments, A/R', icon: '' },
];

const MOCK_REVENUE_BY_PAYER: ChartData[] = [
  { label: 'Blue Cross', value: 4250000, change: 8.5 },
  { label: 'Aetna', value: 2850000, change: -2.3 },
  { label: 'Medicare', value: 3120000, change: 5.1 },
  { label: 'UnitedHealthcare', value: 2450000, change: 12.4 },
  { label: 'Cigna', value: 1980000, change: 3.2 },
  { label: 'Self-Pay', value: 890000, change: 15.8 },
];

const MOCK_PROCEDURES_REVENUE: ChartData[] = [
  { label: '99214 - Office Visit Mod', value: 2850000 },
  { label: '99213 - Office Visit Est', value: 2150000 },
  { label: '11102 - Tangential Biopsy', value: 1850000 },
  { label: '17311 - Mohs Surgery', value: 3250000 },
  { label: '96372 - Injection', value: 950000 },
  { label: '17000 - Destruction', value: 1450000 },
];

const MOCK_MONTHLY_REVENUE: { month: string; charges: number; payments: number; adjustments: number }[] = [
  { month: 'Aug', charges: 12500000, payments: 10250000, adjustments: 1250000 },
  { month: 'Sep', charges: 11800000, payments: 9800000, adjustments: 1100000 },
  { month: 'Oct', charges: 13200000, payments: 11100000, adjustments: 1350000 },
  { month: 'Nov', charges: 12100000, payments: 10400000, adjustments: 1200000 },
  { month: 'Dec', charges: 10500000, payments: 8900000, adjustments: 980000 },
  { month: 'Jan', charges: 14200000, payments: 12750000, adjustments: 1400000 },
];

export function PremiumAnalytics({ onExportReport }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('financial');
  const [dateRange, setDateRange] = useState<'mtd' | 'qtd' | 'ytd' | 'custom'>('mtd');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const maxRevenue = Math.max(...MOCK_REVENUE_BY_PAYER.map(d => d.value));
  const maxProcedureRevenue = Math.max(...MOCK_PROCEDURES_REVENUE.map(d => d.value));
  const maxMonthlyValue = Math.max(...MOCK_MONTHLY_REVENUE.map(d => Math.max(d.charges, d.payments)));

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
                onClick={() => setDateRange(range)}
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
              <div style={{ fontSize: '2rem', fontWeight: '800' }}>$142,000</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <span style={{ color: '#bbf7d0' }}>+12.4%</span> vs last period
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Payments</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>$127,500</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                +8.7% vs last period
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Adjustments</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#dc2626' }}>$14,000</div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                9.8% of charges
              </div>
            </div>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>Net Collection Rate</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>94.5%</div>
              <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>
                +1.2% vs last period
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
            {/* Revenue by Payer */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Revenue by Payer
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {MOCK_REVENUE_BY_PAYER.map((item, index) => (
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

            {/* Revenue by Procedure */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
                Revenue by Procedure
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {MOCK_PROCEDURES_REVENUE.map((item, index) => (
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
                Monthly Revenue Trend
              </h3>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#10b981' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Charges</span>
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
              {MOCK_MONTHLY_REVENUE.map((month) => (
                <div key={month.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '200px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: `${(month.charges / maxMonthlyValue) * 180}px`,
                        background: '#10b981',
                        borderRadius: '4px 4px 0 0',
                      }}
                      title={`Charges: ${formatCurrency(month.charges)}`}
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
