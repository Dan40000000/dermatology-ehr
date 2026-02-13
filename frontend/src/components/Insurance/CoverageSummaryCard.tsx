import React from 'react';

interface EligibilityData {
  isActive?: boolean;
  planName?: string;
  memberId?: string;
  groupNumber?: string;
  copay?: string | number;
  deductible?: string | number;
  deductibleMet?: string | number;
  coinsurance?: string | number;
  effectiveDate?: string;
  terminationDate?: string;
  lastChecked?: string;
  hasIssues?: boolean;
  issueNotes?: string;
}

interface CoverageSummaryCardProps {
  eligibility: EligibilityData;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function CoverageSummaryCard({ eligibility, onRefresh, isRefreshing }: CoverageSummaryCardProps) {
  const formatCurrency = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '—';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const statusColor = eligibility.isActive ? '#059669' : eligibility.hasIssues ? '#dc2626' : '#6b7280';
  const statusText = eligibility.isActive ? 'Active' : eligibility.hasIssues ? 'Issues Found' : 'Unknown';
  const statusBg = eligibility.isActive ? '#d1fae5' : eligibility.hasIssues ? '#fee2e2' : '#f3f4f6';

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      backgroundColor: '#fff',
      padding: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
          Coverage Summary
        </h3>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.875rem',
            backgroundColor: isRefreshing ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          {isRefreshing ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite' }}>&#8635;</span>
              Checking...
            </>
          ) : (
            <>&#8635; Verify Eligibility</>
          )}
        </button>
      </div>

      <div style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        backgroundColor: statusBg,
        color: statusColor,
        fontSize: '0.875rem',
        fontWeight: 500,
        marginBottom: '1rem',
      }}>
        {statusText}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Plan</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {eligibility.planName || '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Member ID</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {eligibility.memberId || '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Group #</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {eligibility.groupNumber || '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Copay</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {formatCurrency(eligibility.copay)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Deductible</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {formatCurrency(eligibility.deductible)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Deductible Met</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {formatCurrency(eligibility.deductibleMet)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Coinsurance</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {eligibility.coinsurance ? `${eligibility.coinsurance}%` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Effective Date</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            {formatDate(eligibility.effectiveDate)}
          </div>
        </div>
      </div>

      {eligibility.lastChecked && (
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
          Last verified: {formatDate(eligibility.lastChecked)}
        </div>
      )}

      {eligibility.hasIssues && eligibility.issueNotes && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          backgroundColor: '#fef2f2',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          color: '#b91c1c',
        }}>
          <strong>Issues:</strong> {eligibility.issueNotes}
        </div>
      )}
    </div>
  );
}
