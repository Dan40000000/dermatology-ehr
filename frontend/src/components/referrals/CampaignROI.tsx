import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

export type CampaignType = 'print' | 'digital' | 'social' | 'email' | 'tv' | 'radio' | 'referral_program' | 'event' | 'other';

export interface CampaignROIData {
  campaignId: string;
  campaignName: string;
  campaignType: CampaignType;
  budgetCents: number;
  spentCents: number;
  totalReferrals: number;
  conversions: number;
  revenueGenerated: number;
  costPerLead: number;
  costPerAcquisition: number;
  roi: number;
}

interface CampaignROIProps {
  campaignId: string;
}

export function CampaignROI({ campaignId }: CampaignROIProps) {
  const { session } = useAuth();
  const [data, setData] = useState<CampaignROIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadROI = useCallback(async () => {
    if (!session || !campaignId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/referral-sources/campaigns/${campaignId}/roi`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            [TENANT_HEADER_NAME]: session.tenantId,
          },
        }
      );

      if (!res.ok) {
        throw new Error('Failed to fetch campaign ROI');
      }

      const result = await res.json();
      setData(result.roi);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [session, campaignId]);

  useEffect(() => {
    loadROI();
  }, [loadROI]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getCampaignTypeLabel = (type: CampaignType): string => {
    const labels: Record<CampaignType, string> = {
      print: 'Print',
      digital: 'Digital',
      social: 'Social Media',
      email: 'Email',
      tv: 'TV',
      radio: 'Radio',
      referral_program: 'Referral Program',
      event: 'Event',
      other: 'Other',
    };
    return labels[type];
  };

  if (loading) {
    return (
      <div className="campaign-roi loading">
        <div className="loading-skeleton header"></div>
        <div className="loading-skeleton metrics"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="campaign-roi error">
        <p>Error: {error}</p>
        <button type="button" onClick={loadROI}>Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="campaign-roi empty">
        <p>Campaign not found</p>
      </div>
    );
  }

  const roiPositive = data.roi >= 0;
  const budgetUtilization = data.budgetCents > 0
    ? (data.spentCents / data.budgetCents) * 100
    : 0;

  return (
    <div className="campaign-roi">
      <div className="roi-header">
        <div className="campaign-info">
          <span className="campaign-type">{getCampaignTypeLabel(data.campaignType)}</span>
          <h3 className="campaign-name">{data.campaignName}</h3>
        </div>
        <div className={`roi-badge ${roiPositive ? 'positive' : 'negative'}`}>
          <span className="roi-label">ROI</span>
          <span className="roi-value">{formatPercent(data.roi)}</span>
        </div>
      </div>

      <div className="roi-summary">
        <div className="summary-row">
          <div className="summary-item">
            <span className="summary-label">Budget</span>
            <span className="summary-value">{formatCurrency(data.budgetCents)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Spent</span>
            <span className="summary-value">{formatCurrency(data.spentCents)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Revenue</span>
            <span className="summary-value highlight">{formatCurrency(data.revenueGenerated)}</span>
          </div>
        </div>

        <div className="budget-bar-container">
          <div className="budget-bar-label">
            <span>Budget Utilization</span>
            <span>{budgetUtilization.toFixed(0)}%</span>
          </div>
          <div className="budget-bar">
            <div
              className="budget-bar-fill"
              style={{ width: `${Math.min(budgetUtilization, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="roi-metrics">
        <div className="metric-card">
          <div className="metric-icon leads">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{data.totalReferrals}</span>
            <span className="metric-label">Total Leads</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon conversions">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{data.conversions}</span>
            <span className="metric-label">Conversions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon cpl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{formatCurrency(data.costPerLead)}</span>
            <span className="metric-label">Cost per Lead</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon cpa">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/>
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{formatCurrency(data.costPerAcquisition)}</span>
            <span className="metric-label">Cost per Acquisition</span>
          </div>
        </div>
      </div>

      <style>{`
        .campaign-roi {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1.5rem;
        }

        .campaign-roi.loading {
          padding: 1.5rem;
        }

        .loading-skeleton {
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 8px;
        }

        .loading-skeleton.header {
          height: 60px;
          margin-bottom: 1rem;
        }

        .loading-skeleton.metrics {
          height: 150px;
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .campaign-roi.error,
        .campaign-roi.empty {
          text-align: center;
          color: #6b7280;
        }

        .roi-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .campaign-info {
          flex: 1;
        }

        .campaign-type {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .campaign-name {
          margin: 0.5rem 0 0 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .roi-badge {
          text-align: center;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          min-width: 80px;
        }

        .roi-badge.positive {
          background: #dcfce7;
        }

        .roi-badge.negative {
          background: #fee2e2;
        }

        .roi-label {
          display: block;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
        }

        .roi-value {
          display: block;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .roi-badge.positive .roi-value {
          color: #16a34a;
        }

        .roi-badge.negative .roi-value {
          color: #dc2626;
        }

        .roi-summary {
          background: #f9fafb;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .summary-item {
          text-align: center;
        }

        .summary-label {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .summary-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .summary-value.highlight {
          color: #16a34a;
        }

        .budget-bar-container {
          margin-top: 0.5rem;
        }

        .budget-bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.375rem;
        }

        .budget-bar {
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
        }

        .budget-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #6B46C1, #8b5cf6);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .roi-metrics {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .metric-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #fafafa;
          border-radius: 8px;
        }

        .metric-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: white;
        }

        .metric-icon.leads {
          background: #3b82f6;
        }

        .metric-icon.conversions {
          background: #10b981;
        }

        .metric-icon.cpl {
          background: #f59e0b;
        }

        .metric-icon.cpa {
          background: #8b5cf6;
        }

        .metric-content {
          flex: 1;
        }

        .metric-content .metric-value {
          display: block;
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .metric-content .metric-label {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
        }

        @media (max-width: 640px) {
          .summary-row {
            grid-template-columns: 1fr;
          }

          .roi-metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
