import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchPostVisitCodingReview,
  fetchProviders,
  type PostVisitCodingIssue,
  type PostVisitCodingReviewItem,
  type PostVisitCodingReviewResponse,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Provider } from '../types';

const issueLabels: Record<PostVisitCodingIssue, string> = {
  missing_diagnosis: 'Missing diagnosis',
  missing_primary_diagnosis: 'No primary diagnosis',
  missing_charge: 'Missing CPT',
  missing_cpt_code: 'Blank CPT',
  diagnosis_link_needed: 'Needs Dx link',
  note_unsigned: 'Unsigned note',
  superbill_open: 'Superbill open',
  claim_not_created: 'Claim not created',
  claim_coding_review: 'Claim in coding review',
};

const issueDescriptions: Record<PostVisitCodingIssue, string> = {
  missing_diagnosis: 'The visit cannot support billing until a clinician confirms at least one diagnosis.',
  missing_primary_diagnosis: 'The visit has diagnoses, but no primary diagnosis is marked.',
  missing_charge: 'No procedure or E/M charge has been added yet.',
  missing_cpt_code: 'A charge exists but is missing a CPT code.',
  diagnosis_link_needed: 'Charges should be linked to supporting diagnosis codes before claim release.',
  note_unsigned: 'The clinical note still needs provider signature or lock.',
  superbill_open: 'The superbill is still draft/open and needs billing review.',
  claim_not_created: 'Charges exist but the claim has not been created yet.',
  claim_coding_review: 'A claim exists but is still being reviewed before release.',
};

const issueOrder: PostVisitCodingIssue[] = [
  'missing_diagnosis',
  'missing_primary_diagnosis',
  'missing_charge',
  'missing_cpt_code',
  'diagnosis_link_needed',
  'note_unsigned',
  'superbill_open',
  'claim_not_created',
  'claim_coding_review',
];

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return local.toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDollars(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);
}

function titleCase(value: string | null | undefined) {
  if (!value) return 'None';
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function severityStyles(severity: PostVisitCodingReviewItem['severity']) {
  if (severity === 'high') {
    return { background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
  }
  if (severity === 'medium') {
    return { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' };
  }
  return { background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
}

function getProviderName(provider: Provider) {
  return provider.fullName || provider.name || provider.id;
}

export function PostVisitCodingReviewPage() {
  const { session } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialToday = useMemo(() => todayIsoDate(), []);
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || initialToday);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || searchParams.get('startDate') || initialToday);
  const [providerId, setProviderId] = useState(searchParams.get('providerId') || '');
  const [includeCleared, setIncludeCleared] = useState(searchParams.get('includeCleared') === 'true');
  const [selectedIssue, setSelectedIssue] = useState<PostVisitCodingIssue | 'all'>(
    (searchParams.get('issue') as PostVisitCodingIssue | null) || 'all',
  );
  const [providers, setProviders] = useState<Provider[]>([]);
  const [data, setData] = useState<PostVisitCodingReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStartDate(searchParams.get('startDate') || initialToday);
    setEndDate(searchParams.get('endDate') || searchParams.get('startDate') || initialToday);
    setProviderId(searchParams.get('providerId') || '');
    setIncludeCleared(searchParams.get('includeCleared') === 'true');
    setSelectedIssue((searchParams.get('issue') as PostVisitCodingIssue | null) || 'all');
  }, [initialToday, searchParams]);

  const loadReview = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [reviewResponse, providerResponse] = await Promise.all([
        fetchPostVisitCodingReview(session.tenantId, session.accessToken, {
          startDate,
          endDate,
          providerId: providerId || undefined,
          includeCleared,
          limit: 300,
        }),
        fetchProviders(session.tenantId, session.accessToken).catch(() => ({ providers: [] })),
      ]);
      setData(reviewResponse);
      setProviders(Array.isArray(providerResponse.providers) ? providerResponse.providers : []);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to load post-visit coding review');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [endDate, includeCleared, providerId, session, showError, startDate]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const updateSearch = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    if (selectedIssue === 'all') return items;
    return items.filter((item) => item.issues.includes(selectedIssue));
  }, [data?.items, selectedIssue]);

  const totalChargeCents = useMemo(
    () => filteredItems.reduce((sum, item) => sum + (Number(item.totalChargeCents) || 0), 0),
    [filteredItems],
  );

  const ownerCounts = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        acc[item.recommendedOwner] += 1;
        return acc;
      },
      { provider: 0, clinical_coding: 0, billing: 0 },
    );
  }, [filteredItems]);

  const selectIssue = (issue: PostVisitCodingIssue | 'all') => {
    setSelectedIssue(issue);
    updateSearch({ issue: issue === 'all' ? null : issue });
  };

  const applyDateChange = (field: 'startDate' | 'endDate', value: string) => {
    if (field === 'startDate') {
      setStartDate(value);
      updateSearch({ startDate: value });
    } else {
      setEndDate(value);
      updateSearch({ endDate: value });
    }
  };

  const applyProviderChange = (value: string) => {
    setProviderId(value);
    updateSearch({ providerId: value || null });
  };

  const applyIncludeCleared = (value: boolean) => {
    setIncludeCleared(value);
    updateSearch({ includeCleared: value ? 'true' : null });
  };

  if (!session) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Post-Visit Coding Review</h1>
        <p style={{ color: '#6b7280' }}>Sign in to review coding work.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, color: '#111827' }}>Post-Visit Coding Review</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#4b5563', maxWidth: '760px' }}>
            Daily safety queue for visits that need provider, clinical coding, or billing cleanup before claim release.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReview}
          disabled={loading}
          style={{
            alignSelf: 'flex-start',
            padding: '0.65rem 0.9rem',
            borderRadius: '0.5rem',
            border: '1px solid #c7d2fe',
            background: loading ? '#eef2ff' : '#4f46e5',
            color: loading ? '#4338ca' : '#ffffff',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <section
        aria-label="Coding review filters"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          background: '#ffffff',
          marginBottom: '1rem',
        }}
      >
        <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontWeight: 700 }}>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => applyDateChange('startDate', event.target.value)}
            style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontWeight: 700 }}>
          End date
          <input
            type="date"
            value={endDate}
            onChange={(event) => applyDateChange('endDate', event.target.value)}
            style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontWeight: 700 }}>
          Provider
          <select
            value={providerId}
            onChange={(event) => applyProviderChange(event.target.value)}
            style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#ffffff' }}
          >
            <option value="">All providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {getProviderName(provider)}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#374151',
            fontWeight: 700,
            paddingTop: '1.6rem',
          }}
        >
          <input
            type="checkbox"
            checked={includeCleared}
            onChange={(event) => applyIncludeCleared(event.target.checked)}
          />
          Include cleared visits
        </label>
      </section>

      <section
        aria-label="Coding review summary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <button type="button" onClick={() => selectIssue('all')} aria-pressed={selectedIssue === 'all'} style={summaryButtonStyle(selectedIssue === 'all')}>
          <span style={summaryLabelStyle}>Open visits</span>
          <strong style={summaryValueStyle}>{data?.summary.total ?? 0}</strong>
        </button>
        <div style={summaryCardStyle}>
          <span style={summaryLabelStyle}>Filtered charges</span>
          <strong style={summaryValueStyle}>{formatDollars(totalChargeCents)}</strong>
        </div>
        <div style={summaryCardStyle}>
          <span style={summaryLabelStyle}>Provider-owned</span>
          <strong style={summaryValueStyle}>{ownerCounts.provider}</strong>
        </div>
        <div style={summaryCardStyle}>
          <span style={summaryLabelStyle}>Billing-owned</span>
          <strong style={summaryValueStyle}>{ownerCounts.billing}</strong>
        </div>
      </section>

      <section aria-label="Coding issue filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {issueOrder.map((issue) => {
          const count = data?.summary.issueCounts[issue] || 0;
          const active = selectedIssue === issue;
          return (
            <button
              key={issue}
              type="button"
              onClick={() => selectIssue(issue)}
              aria-pressed={active}
              title={issueDescriptions[issue]}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '999px',
                border: active ? '1px solid #3730a3' : '1px solid #d1d5db',
                background: active ? '#eef2ff' : '#ffffff',
                color: active ? '#3730a3' : '#374151',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {issueLabels[issue]} ({count})
            </button>
          );
        })}
      </section>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#111827' }}>Work queue</h2>
          <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{filteredItems.length} visits shown</span>
        </div>
        {loading && !data ? (
          <div style={{ padding: '2rem', color: '#6b7280' }}>Loading coding review...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '2rem', color: '#4b5563' }}>
            No post-visit coding issues match the current filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', color: '#4b5563', textAlign: 'left' }}>
                  <th style={thStyle}>Patient / Service</th>
                  <th style={thStyle}>Provider</th>
                  <th style={thStyle}>Clinical</th>
                  <th style={thStyle}>Coding</th>
                  <th style={thStyle}>Billing</th>
                  <th style={thStyle}>Issues</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.encounterId} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 800, color: '#111827' }}>{item.patientName}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.88rem' }}>{formatDateTime(item.serviceAt)}</div>
                      {item.chiefComplaint && <div style={{ color: '#374151', fontSize: '0.88rem' }}>{item.chiefComplaint}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: '#111827', fontWeight: 700 }}>{item.providerName}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.88rem' }}>Owner: {titleCase(item.recommendedOwner)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>Note: {titleCase(item.encounterStatus)}</div>
                      <div>Dx: {item.diagnosisCodes.length ? item.diagnosisCodes.join(', ') : 'None'}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>CPT: {item.cptCodes.length ? item.cptCodes.join(', ') : 'None'}</div>
                      <div>Charges: {item.chargeCount}</div>
                      <div>{formatDollars(item.totalChargeCents)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>Superbill: {titleCase(item.superbillStatus)}</div>
                      <div>Claim: {titleCase(item.claimStatus)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span
                          style={{
                            ...severityStyles(item.severity),
                            border: '1px solid',
                            borderRadius: '999px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                          }}
                        >
                          {titleCase(item.severity)}
                        </span>
                        {item.issues.map((issue) => (
                          <span
                            key={`${item.encounterId}-${issue}`}
                            title={issueDescriptions[issue]}
                            style={{
                              background: '#f3f4f6',
                              color: '#374151',
                              borderRadius: '999px',
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                            }}
                          >
                            {issueLabels[issue]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => navigate(item.reviewRoute)} style={actionButtonStyle}>
                        Open visit
                      </button>
                      {item.claimRoute && (
                        <button type="button" onClick={() => navigate(item.claimRoute!)} style={{ ...actionButtonStyle, marginLeft: '0.4rem' }}>
                          Claim
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const summaryLabelStyle = {
  color: '#6b7280',
  fontSize: '0.82rem',
  fontWeight: 800,
  textTransform: 'uppercase',
} as const;

const summaryValueStyle = {
  display: 'block',
  color: '#111827',
  fontSize: '1.65rem',
  marginTop: '0.25rem',
} as const;

const summaryCardStyle = {
  display: 'block',
  textAlign: 'left',
  padding: '1rem',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  background: '#ffffff',
} as const;

function summaryButtonStyle(active: boolean) {
  return {
    ...summaryCardStyle,
    border: active ? '1px solid #4f46e5' : summaryCardStyle.border,
    background: active ? '#eef2ff' : summaryCardStyle.background,
    cursor: 'pointer',
  };
}

const thStyle = {
  padding: '0.7rem 0.85rem',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  borderBottom: '1px solid #e5e7eb',
} as const;

const tdStyle = {
  padding: '0.8rem 0.85rem',
  verticalAlign: 'top',
  color: '#374151',
  fontSize: '0.9rem',
} as const;

const actionButtonStyle = {
  padding: '0.48rem 0.65rem',
  borderRadius: '0.375rem',
  border: '1px solid #c7d2fe',
  background: '#eef2ff',
  color: '#3730a3',
  fontWeight: 800,
  cursor: 'pointer',
} as const;
