import { useMemo } from 'react';

export type SourceType = 'physician' | 'patient' | 'marketing' | 'web' | 'insurance' | 'other';

export interface SourcePerformanceData {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  revenueAttributed: number;
  avgPatientValue: number;
}

interface SourcePerformanceProps {
  data: SourcePerformanceData[];
  loading?: boolean;
}

export function SourcePerformance({ data, loading = false }: SourcePerformanceProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.totalReferrals - a.totalReferrals);
  }, [data]);

  const maxReferrals = useMemo(() => {
    return Math.max(...data.map((d) => d.totalReferrals), 1);
  }, [data]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatPercent = (rate: number) => {
    return `${(rate * 100).toFixed(1)}%`;
  };

  const getSourceTypeColor = (type: SourceType): string => {
    const colors: Record<SourceType, string> = {
      physician: '#3b82f6',
      patient: '#10b981',
      marketing: '#f59e0b',
      web: '#8b5cf6',
      insurance: '#06b6d4',
      other: '#6b7280',
    };
    return colors[type];
  };

  const getSourceTypeLabel = (type: SourceType): string => {
    const labels: Record<SourceType, string> = {
      physician: 'Physician',
      patient: 'Patient/Friend',
      marketing: 'Marketing',
      web: 'Web/Online',
      insurance: 'Insurance',
      other: 'Other',
    };
    return labels[type];
  };

  if (loading) {
    return (
      <div className="source-performance loading">
        <div className="loading-placeholder"></div>
        <div className="loading-placeholder"></div>
        <div className="loading-placeholder"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="source-performance empty">
        <p>No referral data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="source-performance">
      <div className="performance-grid">
        {sortedData.map((source) => (
          <div key={source.sourceId} className="source-card">
            <div className="source-header">
              <div className="source-info">
                <span
                  className="source-type-badge"
                  style={{ backgroundColor: getSourceTypeColor(source.sourceType) }}
                >
                  {getSourceTypeLabel(source.sourceType)}
                </span>
                <h4 className="source-name">{source.sourceName}</h4>
              </div>
              <div className="source-count">
                <span className="count-value">{source.totalReferrals}</span>
                <span className="count-label">referrals</span>
              </div>
            </div>

            <div className="source-bar-container">
              <div
                className="source-bar"
                style={{
                  width: `${(source.totalReferrals / maxReferrals) * 100}%`,
                  backgroundColor: getSourceTypeColor(source.sourceType),
                }}
              >
                <div
                  className="conversion-bar"
                  style={{
                    width: `${source.conversionRate * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="source-metrics">
              <div className="metric">
                <span className="metric-label">Converted</span>
                <span className="metric-value">{source.convertedReferrals}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Conv. Rate</span>
                <span className="metric-value highlight">
                  {formatPercent(source.conversionRate)}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Revenue</span>
                <span className="metric-value">{formatCurrency(source.revenueAttributed)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Avg Value</span>
                <span className="metric-value">{formatCurrency(source.avgPatientValue)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .source-performance {
          width: 100%;
        }

        .source-performance.loading {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .loading-placeholder {
          height: 120px;
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .source-performance.empty {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }

        .performance-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .source-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem;
          transition: box-shadow 0.2s;
        }

        .source-card:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .source-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .source-info {
          flex: 1;
        }

        .source-type-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          color: white;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .source-name {
          margin: 0.375rem 0 0 0;
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .source-count {
          text-align: right;
        }

        .count-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          line-height: 1;
        }

        .count-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .source-bar-container {
          height: 8px;
          background: #f3f4f6;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }

        .source-bar {
          height: 100%;
          border-radius: 4px;
          position: relative;
          min-width: 4px;
          transition: width 0.3s ease;
        }

        .conversion-bar {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          background: rgba(255, 255, 255, 0.5);
          border-radius: 0 4px 4px 0;
        }

        .source-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }

        .metric {
          text-align: center;
        }

        .metric-label {
          display: block;
          font-size: 0.6875rem;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
        }

        .metric-value.highlight {
          color: #10b981;
        }

        @media (max-width: 640px) {
          .source-metrics {
            grid-template-columns: repeat(2, 1fr);
          }

          .source-header {
            flex-direction: column;
            gap: 0.5rem;
          }

          .source-count {
            text-align: left;
          }

          .count-value {
            display: inline;
            font-size: 1.25rem;
          }

          .count-label {
            margin-left: 0.25rem;
          }
        }
      `}</style>
    </div>
  );
}
