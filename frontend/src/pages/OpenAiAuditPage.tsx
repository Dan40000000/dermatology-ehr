import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, DollarSign, RefreshCw, Save } from 'lucide-react';
import {
  fetchOpenAiUsageLogs,
  fetchOpenAiUsageSummary,
  updateOpenAiUsageSettings,
  type OpenAiUsageLog,
  type OpenAiUsageSummary,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

const pageStyle: CSSProperties = {
  padding: '24px',
  maxWidth: '1400px',
  margin: '0 auto',
};

const cardStyle: CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const inputStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '9px 10px',
  fontSize: '0.95rem',
  minHeight: '40px',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  background: 'white',
  color: '#111827',
  borderRadius: '6px',
  minHeight: '40px',
  padding: '8px 12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  fontWeight: 600,
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#0f766e',
  background: '#0f766e',
  color: 'white',
};

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthStart(): string {
  const now = new Date();
  return toDateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function today(): string {
  return toDateInput(new Date());
}

function sevenDaysAgo(): string {
  const value = new Date();
  value.setDate(value.getDate() - 6);
  return toDateInput(value);
}

function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'Not set';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents < 1 && cents > -1 ? 4 : 2,
    maximumFractionDigits: cents < 1 && cents > -1 ? 4 : 2,
  }).format(cents / 100);
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatFeature(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function centsToDollarInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String((value / 100).toFixed(2));
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div style={{ ...cardStyle, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
          <div style={{ marginTop: '8px', fontSize: '1.9rem', fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{value}</div>
          <div style={{ marginTop: '8px', color: '#4b5563', fontSize: '0.9rem' }}>{detail}</div>
        </div>
        <div style={{ color: '#0f766e' }}>{icon}</div>
      </div>
    </div>
  );
}

function UsageTable({ summary }: { summary: OpenAiUsageSummary }) {
  const maxCost = Math.max(...summary.byFeature.map((item) => item.estimatedCostCents), 0.0001);

  return (
    <div style={{ ...cardStyle, padding: '18px' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Usage by Feature</h2>
      <div style={{ overflowX: 'auto', marginTop: '14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '0.78rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Feature</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Requests</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Tokens</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Audio</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Cost</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Last Used</th>
            </tr>
          </thead>
          <tbody>
            {summary.byFeature.map((item) => (
              <tr key={item.feature}>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                  <div>{formatFeature(item.feature)}</div>
                  <div style={{ marginTop: '8px', height: '6px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(4, (item.estimatedCostCents / maxCost) * 100)}%`,
                        height: '100%',
                        background: '#0f766e',
                      }}
                    />
                  </div>
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>{formatNumber(item.requests)}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>{formatNumber(item.totalTokens)}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  {Math.round(item.estimatedAudioSeconds)}s
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                  {formatMoney(item.estimatedCostCents)}
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
            {summary.byFeature.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '22px 8px', color: '#6b7280', textAlign: 'center' }}>
                  No OpenAI usage in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsTable({ logs }: { logs: OpenAiUsageLog[] }) {
  return (
    <div style={{ ...cardStyle, padding: '18px' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Request Log</h2>
      <div style={{ overflowX: 'auto', marginTop: '14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '0.78rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Time</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Feature</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Model</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Status</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Tokens</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Cost</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>Resource</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                  {formatFeature(log.feature)}
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>{log.model || '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: '24px',
                      borderRadius: '999px',
                      padding: '2px 9px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      background: log.ok ? '#dcfce7' : '#fee2e2',
                      color: log.ok ? '#166534' : '#991b1b',
                    }}
                  >
                    {log.statusCode || '-'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>{formatNumber(log.totalTokens)}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                  {formatMoney(log.estimatedCostCents)}
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  {log.resourceType ? `${log.resourceType}${log.resourceId ? ` ${log.resourceId.slice(0, 8)}` : ''}` : '-'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '22px 8px', color: '#6b7280', textAlign: 'center' }}>
                  No requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OpenAiAuditPage() {
  const { session } = useAuth();
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(today());
  const [summary, setSummary] = useState<OpenAiUsageSummary | null>(null);
  const [logs, setLogs] = useState<OpenAiUsageLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [offset, setOffset] = useState(0);
  const [feature, setFeature] = useState('');
  const [model, setModel] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [balancePeriodStart, setBalancePeriodStart] = useState(monthStart());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const limit = 25;

  const featureOptions = useMemo(() => summary?.byFeature.map((item) => item.feature) || [], [summary]);
  const modelOptions = useMemo(() => summary?.byModel.map((item) => item.model).filter(Boolean) || [], [summary]);

  const load = useCallback(async (nextOffset = 0) => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryPayload, logsPayload] = await Promise.all([
        fetchOpenAiUsageSummary(session.tenantId, session.accessToken, { startDate, endDate }),
        fetchOpenAiUsageLogs(session.tenantId, session.accessToken, {
          startDate,
          endDate,
          feature: feature || undefined,
          model: model || undefined,
          limit,
          offset: nextOffset,
        }),
      ]);
      setSummary(summaryPayload);
      setLogs(logsPayload.logs);
      setTotalLogs(logsPayload.total);
      setOffset(nextOffset);
      setMonthlyBudget(centsToDollarInput(summaryPayload.settings.monthlyBudgetCents));
      setStartingBalance(centsToDollarInput(summaryPayload.settings.startingBalanceCents));
      setBalancePeriodStart(summaryPayload.settings.balancePeriodStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OpenAI usage');
    } finally {
      setLoading(false);
    }
  }, [endDate, feature, model, session, startDate]);

  useEffect(() => {
    void load(0);
  }, [load]);

  const saveSettings = async () => {
    if (!session) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload = await updateOpenAiUsageSettings(session.tenantId, session.accessToken, {
        monthlyBudgetCents: dollarsToCents(monthlyBudget),
        startingBalanceCents: dollarsToCents(startingBalance),
        balancePeriodStart,
      });
      setMonthlyBudget(centsToDollarInput(payload.settings.monthlyBudgetCents));
      setStartingBalance(centsToDollarInput(payload.settings.startingBalanceCents));
      setBalancePeriodStart(payload.settings.balancePeriodStart);
      setNotice('OpenAI balance settings saved.');
      await load(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OpenAI settings');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: 'today' | '7d' | 'mtd') => {
    if (preset === 'today') {
      setStartDate(today());
      setEndDate(today());
    } else if (preset === '7d') {
      setStartDate(sevenDaysAgo());
      setEndDate(today());
    } else {
      setStartDate(monthStart());
      setEndDate(today());
    }
    setOffset(0);
  };

  const summaryCards = summary ? [
    {
      label: 'Estimated Cost',
      value: formatMoney(summary.summary.estimatedCostCents),
      detail: `${formatNumber(summary.summary.totalRequests)} requests in range`,
      icon: <DollarSign size={26} />,
    },
    {
      label: 'Tracked Balance',
      value: formatMoney(summary.summary.estimatedRemainingBalanceCents),
      detail: `${formatMoney(summary.summary.balancePeriodUsageCents)} used since ${summary.settings.balancePeriodStart}`,
      icon: <Activity size={26} />,
    },
    {
      label: 'Monthly Budget',
      value: formatMoney(summary.summary.estimatedRemainingBudgetCents),
      detail: `${formatMoney(summary.summary.monthlyBudgetCents)} budget for selected range`,
      icon: <DollarSign size={26} />,
    },
    {
      label: 'Tokens',
      value: formatNumber(summary.summary.totalTokens),
      detail: `${formatNumber(summary.summary.totalPromptTokens)} prompt / ${formatNumber(summary.summary.totalCompletionTokens)} completion`,
      icon: <Activity size={26} />,
    },
  ] : [];

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#111827' }}>OpenAI Usage Audit</h1>
          <p style={{ margin: '6px 0 0', color: '#4b5563' }}>Requests, token usage, estimated cost, and tracked credit balance.</p>
        </div>
        <button type="button" style={buttonStyle} onClick={() => void load(0)} disabled={loading}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534' }}>
          {notice}
        </div>
      )}

      <div style={{ ...cardStyle, marginTop: '20px', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Start
            <input style={inputStyle} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            End
            <input style={inputStyle} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Feature
            <select style={inputStyle} value={feature} onChange={(event) => setFeature(event.target.value)}>
              <option value="">All features</option>
              {featureOptions.map((value) => (
                <option key={value} value={value}>{formatFeature(value)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Model
            <select style={inputStyle} value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="">All models</option>
              {modelOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={buttonStyle} onClick={() => applyPreset('today')}>Today</button>
            <button type="button" style={buttonStyle} onClick={() => applyPreset('7d')}>7D</button>
            <button type="button" style={buttonStyle} onClick={() => applyPreset('mtd')}>MTD</button>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={() => void load(0)} disabled={loading}>
            <RefreshCw size={17} />
            Apply
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginTop: '18px' }}>
        {summaryCards.map((item) => (
          <SummaryCard key={item.label} {...item} />
        ))}
      </div>

      <div style={{ ...cardStyle, marginTop: '18px', padding: '16px' }}>
        <h2 style={{ margin: '0 0 14px', fontSize: '1.1rem' }}>Balance Settings</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Monthly Budget
            <input style={inputStyle} inputMode="decimal" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} placeholder="150.00" />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Starting Balance
            <input style={inputStyle} inputMode="decimal" value={startingBalance} onChange={(event) => setStartingBalance(event.target.value)} placeholder="20.00" />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: '#374151', fontWeight: 700 }}>
            Balance Start
            <input style={inputStyle} type="date" value={balancePeriodStart} onChange={(event) => setBalancePeriodStart(event.target.value)} />
          </label>
          <button type="button" style={primaryButtonStyle} onClick={() => void saveSettings()} disabled={saving}>
            <Save size={17} />
            Save
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '18px', marginTop: '18px' }}>
        {summary && <UsageTable summary={summary} />}
        <LogsTable logs={logs} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
        <span style={{ color: '#4b5563' }}>
          Showing {totalLogs === 0 ? 0 : offset + 1} - {Math.min(offset + limit, totalLogs)} of {totalLogs}
        </span>
        <button type="button" style={buttonStyle} disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - limit))}>
          Previous
        </button>
        <button type="button" style={buttonStyle} disabled={offset + limit >= totalLogs || loading} onClick={() => void load(offset + limit)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default OpenAiAuditPage;
