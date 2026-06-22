import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { crmLogin, fetchCrmAccount, type CrmClient, type CrmOverview, type CrmUser } from '../api';

const CRM_TOKEN_KEY = 'perry_crm_token';
const CRM_USER_KEY = 'perry_crm_user';

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #f8fafc 0%, #ecfeff 45%, #eef2ff 100%)',
  padding: '32px 18px',
};

const containerStyle: CSSProperties = {
  maxWidth: '1180px',
  margin: '0 auto',
};

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '11px 12px',
  fontSize: '1rem',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #0f766e',
  background: '#0f766e',
  color: '#ffffff',
  borderRadius: '6px',
  minHeight: '42px',
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
};

function formatMoney(cents: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function statusStyle(status: string): CSSProperties {
  const color =
    status === 'active' ? ['#dcfce7', '#166534']
      : status === 'pilot' || status === 'trialing' ? ['#dbeafe', '#1d4ed8']
        : ['#f3f4f6', '#374151'];
  return {
    display: 'inline-flex',
    borderRadius: '999px',
    padding: '3px 9px',
    fontSize: '0.78rem',
    fontWeight: 800,
    background: color[0],
    color: color[1],
    textTransform: 'capitalize',
  };
}

function readStoredUser(): CrmUser | null {
  try {
    const raw = localStorage.getItem(CRM_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ClientAccountPage() {
  const [token, setToken] = useState(() => localStorage.getItem(CRM_TOKEN_KEY) || '');
  const [user, setUser] = useState<CrmUser | null>(() => readStoredUser());
  const [account, setAccount] = useState<({ mode: 'owner' } & CrmOverview) | { mode: 'client'; client: CrmClient } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (nextToken = token) => {
    if (!nextToken) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchCrmAccount(nextToken);
      setAccount(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
      localStorage.removeItem(CRM_TOKEN_KEY);
      localStorage.removeItem(CRM_USER_KEY);
      setToken('');
      setUser(null);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadAccount(token);
  }, [loadAccount, token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = await crmLogin(email, password);
      localStorage.setItem(CRM_TOKEN_KEY, payload.token);
      localStorage.setItem(CRM_USER_KEY, JSON.stringify(payload.user));
      setToken(payload.token);
      setUser(payload.user);
      await loadAccount(payload.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(CRM_TOKEN_KEY);
    localStorage.removeItem(CRM_USER_KEY);
    setToken('');
    setUser(null);
    setAccount(null);
  };

  return (
    <div style={shellStyle}>
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '24px' }}>
          <Link to="/" style={{ color: '#0f766e', fontWeight: 800, textDecoration: 'none' }}>Back</Link>
          {user && (
            <button type="button" onClick={logout} style={{ ...buttonStyle, background: '#ffffff', color: '#0f766e' }}>
              Sign out
            </button>
          )}
        </div>

        {!token ? (
          <div style={{ ...cardStyle, maxWidth: '460px', margin: '56px auto 0', padding: '28px' }}>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem' }}>Client Account</h1>
            <p style={{ margin: '8px 0 22px', color: '#64748b' }}>Manage your Perry Software account, subscriptions, and AI usage.</p>
            {error && <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>{error}</div>}
            <form onSubmit={submit} style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#334155', fontWeight: 700 }}>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" style={inputStyle} required />
              </label>
              <label style={{ display: 'grid', gap: '6px', color: '#334155', fontWeight: 700 }}>
                Password
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" style={inputStyle} required />
              </label>
              <button type="submit" style={buttonStyle} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '18px' }}>
            <div style={{ ...cardStyle, padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem' }}>
                    {account?.mode === 'client' ? account.client.accountName : 'Perry Software CRM'}
                  </h1>
                  <p style={{ margin: '8px 0 0', color: '#64748b' }}>
                    {user?.fullName} · {user?.role === 'owner' ? 'Owner access' : 'Client access'}
                  </p>
                </div>
                <button type="button" onClick={() => void loadAccount()} style={{ ...buttonStyle, background: '#ffffff', color: '#0f766e' }} disabled={loading}>
                  Refresh
                </button>
              </div>
            </div>

            {error && <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px' }}>{error}</div>}
            {loading && !account ? <div style={{ ...cardStyle, padding: '24px', color: '#64748b' }}>Loading account...</div> : null}
            {account?.mode === 'owner' ? <OwnerView overview={account} /> : account?.mode === 'client' ? <ClientView client={account.client} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function OwnerView({ overview }: { overview: CrmOverview }) {
  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <Metric label="Clients" value={String(overview.summary.totalClients)} detail={`${overview.summary.activeClients} active/pilot`} />
        <Metric label="AI spend MTD" value={formatMoney(overview.summary.aiSpendCents)} detail={`${formatMoney(overview.summary.openAiSpendCents)} OpenAI`} />
        <Metric label="Amazon Voice" value={formatMoney(overview.summary.amazonVoiceSpendCents)} detail="Voice/transcription" />
        <Metric label="Perry-paid vendors" value={formatMoney(overview.summary.perryPaidSubscriptionCents)} detail="Tracked subscriptions" />
      </div>
      {overview.clients.map((client) => <ClientView key={client.id} client={client} compact />)}
    </div>
  );
}

function ClientView({ client, compact = false }: { client: CrmClient; compact?: boolean }) {
  return (
    <div style={{ ...cardStyle, padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>{client.accountName}</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>{client.implementationStage}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={statusStyle(client.status)}>{client.status}</span>
          <span style={statusStyle(client.subscriptionStatus)}>{client.subscriptionStatus}</span>
        </div>
      </div>

      {client.productUrl && (
        <a href={client.productUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', marginTop: '12px', color: '#0f766e', fontWeight: 800 }}>
          Open app
        </a>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginTop: '16px' }}>
        <Metric label="OpenAI" value={formatMoney(client.metrics.openAiSpendCents)} detail="Month-to-date" />
        <Metric label="Amazon Voice" value={formatMoney(client.metrics.amazonVoiceSpendCents)} detail="Month-to-date" />
        <Metric label="Plan" value={client.planName} detail={`${formatMoney(client.monthlyFeeCents)} / month`} />
        <Metric label="AI Keys" value={String(client.metrics.activeAiKeys)} detail="Active records" />
      </div>

      {!compact && <Tables client={client} />}
      {compact && (
        <div style={{ marginTop: '16px' }}>
          <Tables client={client} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
      <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: '6px', color: '#111827', fontSize: '1.25rem', fontWeight: 850 }}>{value}</div>
      <div style={{ marginTop: '4px', color: '#64748b', fontSize: '0.84rem' }}>{detail}</div>
    </div>
  );
}

function Tables({ client }: { client: CrmClient }) {
  return (
    <div style={{ display: 'grid', gap: '14px', marginTop: '18px' }}>
      <MiniTable
        title="Subscriptions"
        empty="No subscriptions."
        rows={client.subscriptions.map((sub) => [
          sub.vendor,
          sub.description,
          sub.paidBy.replace(/_/g, ' '),
          formatMoney(sub.amountCents),
          sub.status,
        ])}
      />
      <MiniTable
        title="AI Keys"
        empty="No AI key records."
        rows={client.aiKeys.map((key) => [
          key.provider,
          key.label,
          key.environment,
          key.maskedKey || '-',
          key.status.replace(/_/g, ' '),
        ])}
      />
      <MiniTable
        title="AI Usage"
        empty="No AI usage this month."
        rows={client.aiUsage.map((usage) => [
          usage.provider === 'aws_healthscribe' ? 'Amazon Voice' : usage.provider,
          String(usage.requests),
          `${Math.round(usage.estimatedAudioSeconds)}s`,
          formatMoney(usage.estimatedCostCents),
          usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleString() : '-',
        ])}
      />
    </div>
  );
}

function MiniTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 850, color: '#111827' }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ padding: '14px', color: '#64748b' }}>{empty}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#111827' }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
