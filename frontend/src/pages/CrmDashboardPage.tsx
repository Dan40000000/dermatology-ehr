import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { KeyRound, RefreshCw, Server, WalletCards } from 'lucide-react';
import { fetchCrmOverview, type CrmClient, type CrmOverview } from '../api';
import { useAuth } from '../contexts/AuthContext';

const pageStyle: CSSProperties = {
  padding: '24px',
  maxWidth: '1440px',
  margin: '0 auto',
};

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  borderRadius: '6px',
  minHeight: '38px',
  padding: '8px 12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  fontWeight: 700,
};

const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#0f766e',
  background: '#ecfdf5',
  color: '#065f46',
};

function formatMoney(cents: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

function statusStyle(status: string): CSSProperties {
  const color =
    status === 'active' ? ['#dcfce7', '#166534']
      : status === 'pilot' || status === 'trialing' ? ['#dbeafe', '#1d4ed8']
        : status === 'at_risk' ? ['#fee2e2', '#991b1b']
          : ['#f3f4f6', '#374151'];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '3px 9px',
    background: color[0],
    color: color[1],
    fontSize: '0.78rem',
    fontWeight: 800,
    textTransform: 'capitalize',
  };
}

function SummaryCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: JSX.Element }) {
  return (
    <div style={{ ...cardStyle, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
          <div style={{ marginTop: '8px', color: '#111827', fontSize: '1.85rem', fontWeight: 850, lineHeight: 1.1 }}>{value}</div>
          <div style={{ marginTop: '8px', color: '#475569', fontSize: '0.9rem' }}>{detail}</div>
        </div>
        <div style={{ color: '#0f766e' }}>{icon}</div>
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string | JSX.Element>>;
  empty: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ padding: '12px 8px', borderBottom: '1px solid #f1f5f9', color: '#111827', verticalAlign: 'top' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: '18px 8px', color: '#64748b', textAlign: 'center' }}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CrmDashboardPage() {
  const { session } = useAuth();
  const [overview, setOverview] = useState<CrmOverview | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = useMemo(() => {
    if (!overview?.clients.length) return null;
    return overview.clients.find((client) => client.id === selectedClientId) || overview.clients[0];
  }, [overview, selectedClientId]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchCrmOverview(session.tenantId, session.accessToken);
      setOverview(payload);
      setSelectedClientId((current) => current || payload.clients[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CRM dashboard');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const clients = overview?.clients || [];

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem', fontWeight: 850 }}>CRM Command Center</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>Client accounts, platform costs, AI usage, and account management.</p>
        </div>
        <button type="button" style={buttonStyle} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div style={{ ...cardStyle, padding: '32px', color: '#64748b', textAlign: 'center' }}>Loading CRM...</div>
      ) : overview ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
            <SummaryCard label="Clients" value={String(overview.summary.totalClients)} detail={`${overview.summary.activeClients} active or pilot accounts`} icon={<Server size={26} />} />
            <SummaryCard label="Monthly Revenue" value={formatMoney(overview.summary.monthlyRecurringRevenueCents)} detail="Contracted client fees tracked here" icon={<WalletCards size={26} />} />
            <SummaryCard label="AI Spend MTD" value={formatMoney(overview.summary.aiSpendCents)} detail={`${formatMoney(overview.summary.openAiSpendCents)} OpenAI / ${formatMoney(overview.summary.amazonVoiceSpendCents)} Amazon Voice`} icon={<KeyRound size={26} />} />
            <SummaryCard label="Perry-Paid Tools" value={formatMoney(overview.summary.perryPaidSubscriptionCents)} detail={`${overview.summary.activeAiKeys} active AI key records`} icon={<WalletCards size={26} />} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)', gap: '18px', alignItems: 'start' }}>
            <aside style={{ ...cardStyle, padding: '14px' }}>
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#111827' }}>Accounts</h2>
              <div style={{ display: 'grid', gap: '8px' }}>
                {clients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    style={{
                      ...(selectedClient?.id === client.id ? activeButtonStyle : buttonStyle),
                      width: '100%',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                    }}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <span>
                      <span style={{ display: 'block' }}>{client.accountName}</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{client.environmentName || 'No environment'}</span>
                    </span>
                    <span style={statusStyle(client.status)}>{client.status.replace(/_/g, ' ')}</span>
                  </button>
                ))}
              </div>
            </aside>

            {selectedClient && <ClientDetail client={selectedClient} />}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ClientDetail({ client }: { client: CrmClient }) {
  return (
    <section style={{ display: 'grid', gap: '16px' }}>
      <div style={{ ...cardStyle, padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '1.35rem' }}>{client.accountName}</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>{client.implementationStage}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={statusStyle(client.subscriptionStatus)}>{client.subscriptionStatus}</span>
            <span style={statusStyle(client.status)}>{client.status}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <InfoBlock label="Contact" value={client.contactName || '-'} detail={client.contactEmail || client.contactPhone || ''} />
          <InfoBlock label="Plan" value={client.planName} detail={`${formatMoney(client.monthlyFeeCents)} monthly`} />
          <InfoBlock label="Environment" value={client.environmentName || '-'} detail={client.linkedTenantId || ''} />
          <InfoBlock label="Stripe" value={client.stripeCustomerId || 'Pending'} detail={client.stripeSubscriptionId || ''} />
        </div>

        {client.productUrl && (
          <a href={client.productUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', marginTop: '14px', color: '#0f766e', fontWeight: 800 }}>
            Open client app
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <SummaryCard label="OpenAI" value={formatMoney(client.metrics.openAiSpendCents)} detail="Month-to-date OpenAI credits used" icon={<KeyRound size={24} />} />
        <SummaryCard label="Amazon Voice" value={formatMoney(client.metrics.amazonVoiceSpendCents)} detail="Month-to-date voice/transcription expense" icon={<Server size={24} />} />
        <SummaryCard label="Subscriptions Paid" value={formatMoney(client.metrics.perryPaidSubscriptionCents)} detail={`${client.metrics.activeSubscriptions} active/trialing records`} icon={<WalletCards size={24} />} />
      </div>

      <div style={{ ...cardStyle, padding: '18px' }}>
        <h3 style={{ margin: '0 0 12px', color: '#111827' }}>AI Keys</h3>
        <DataTable
          headers={['Provider', 'Label', 'Environment', 'Masked Key', 'Budget', 'Status']}
          empty="No AI key records."
          rows={client.aiKeys.map((key) => [
            key.provider,
            <span><strong>{key.label}</strong><br /><small style={{ color: '#64748b' }}>{key.keyReference || '-'}</small></span>,
            key.environment,
            key.maskedKey || '-',
            key.monthlyBudgetCents === null ? 'Not set' : formatMoney(key.monthlyBudgetCents),
            <span style={statusStyle(key.status)}>{key.status.replace(/_/g, ' ')}</span>,
          ])}
        />
      </div>

      <div style={{ ...cardStyle, padding: '18px' }}>
        <h3 style={{ margin: '0 0 12px', color: '#111827' }}>Subscriptions & Vendor Costs</h3>
        <DataTable
          headers={['Vendor', 'Description', 'Category', 'Cycle', 'Paid By', 'Amount', 'Status']}
          empty="No subscription records."
          rows={client.subscriptions.map((sub) => [
            sub.vendor,
            sub.description,
            sub.category,
            sub.billingCycle.replace(/_/g, ' '),
            sub.paidBy.replace(/_/g, ' '),
            formatMoney(sub.amountCents),
            <span style={statusStyle(sub.status)}>{sub.status}</span>,
          ])}
        />
      </div>

      <div style={{ ...cardStyle, padding: '18px' }}>
        <h3 style={{ margin: '0 0 12px', color: '#111827' }}>AI Usage Rollup</h3>
        <DataTable
          headers={['Provider', 'Requests', 'Tokens', 'Audio', 'Spend', 'Last Used']}
          empty="No AI usage logged this month."
          rows={client.aiUsage.map((usage) => [
            usage.provider === 'aws_healthscribe' ? 'Amazon Voice' : usage.provider,
            String(usage.requests),
            new Intl.NumberFormat('en-US').format(usage.totalTokens),
            `${Math.round(usage.estimatedAudioSeconds)}s`,
            formatMoney(usage.estimatedCostCents),
            usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleString() : '-',
          ])}
        />
      </div>
    </section>
  );
}

function InfoBlock({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
      <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: '6px', color: '#111827', fontWeight: 850 }}>{value}</div>
      {detail && <div style={{ marginTop: '4px', color: '#64748b', fontSize: '0.85rem', wordBreak: 'break-word' }}>{detail}</div>}
    </div>
  );
}
