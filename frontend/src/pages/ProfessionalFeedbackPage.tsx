import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/apiBase';
import { hasRole } from '../utils/roles';

type FeedbackStatus = 'new' | 'reviewed' | 'resolved' | 'archived';
type FeedbackType = 'issue' | 'suggestion';

interface FeedbackAttachment {
  id: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt?: string;
}

interface FeedbackItem {
  id: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  type: FeedbackType;
  severity: 'blocker' | 'annoying' | 'suggestion' | 'question';
  status: FeedbackStatus;
  message: string;
  pageUrl?: string;
  pathname?: string;
  userAgent?: string;
  viewport?: string;
  capturedAt?: string;
  emailRecipient?: string;
  emailStatus: 'pending' | 'sent' | 'failed' | 'skipped';
  emailError?: string;
  attachmentCount: number;
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
  attachments: FeedbackAttachment[];
}

interface FeedbackSummary {
  total: number;
  new_count: number;
  issue_count: number;
  suggestion_count: number;
  email_failed_count: number;
}

const statusLabels: Record<FeedbackStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
  archived: 'Archived',
};

const statusColors: Record<FeedbackStatus, { bg: string; text: string; border: string }> = {
  new: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  reviewed: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  resolved: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  archived: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

const emailColors: Record<FeedbackItem['emailStatus'], { bg: string; text: string; border: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  sent: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  failed: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  skipped: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '2rem',
  background:
    'radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 30%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 48%, #f0fdfa 100%)',
};

const shellStyle: CSSProperties = {
  maxWidth: '1380px',
  margin: '0 auto',
};

const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: '24px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  background: 'white',
  borderRadius: '999px',
  padding: '0.55rem 0.9rem',
  fontWeight: 700,
  color: '#334155',
  cursor: 'pointer',
};

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatBytes(value?: number): string {
  if (!value) return '0 KB';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: { bg: string; text: string; border: string };
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        padding: '0.22rem 0.65rem',
        fontSize: '0.75rem',
        fontWeight: 800,
        textTransform: 'capitalize',
      }}
    >
      {children}
    </span>
  );
}

export function ProfessionalFeedbackPage() {
  const { session, user } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const headers = useMemo(() => {
    if (!session) return null;
    return {
      Authorization: `Bearer ${session.accessToken}`,
      'x-tenant-id': session.tenantId,
    };
  }, [session]);

  const fetchFeedback = useCallback(async () => {
    if (!headers) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '100',
        status: statusFilter,
        type: typeFilter,
      });
      const response = await fetch(`${API_BASE_URL}/api/professional-feedback?${params}`, { headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load feedback');
      }
      const payload = await response.json();
      setFeedback(payload.feedback || []);
      setSummary(payload.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [headers, statusFilter, typeFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(user, 'admin')) {
    return <Navigate to="/home" replace />;
  }

  const updateFeedbackStatus = async (id: string, status: FeedbackStatus) => {
    if (!headers) return;
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/professional-feedback/${id}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update feedback');
      }
      const payload = await response.json();
      setFeedback((items) => items.map((item) => (item.id === id ? { ...item, ...payload.feedback } : item)));
      await fetchFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feedback');
    } finally {
      setSavingId(null);
    }
  };

  const openAttachment = async (item: FeedbackItem, attachment: FeedbackAttachment) => {
    if (!headers) return;
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/professional-feedback/${item.id}/attachments/${attachment.id}`, {
        headers,
      });
      if (!response.ok) {
        throw new Error('Failed to open attachment');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open attachment');
    }
  };

  const statCards = [
    { label: 'Total notes', value: summary?.total ?? feedback.length, color: '#0f172a' },
    { label: 'New', value: summary?.new_count ?? feedback.filter((item) => item.status === 'new').length, color: '#b45309' },
    { label: 'Issues', value: summary?.issue_count ?? feedback.filter((item) => item.type === 'issue').length, color: '#be123c' },
    {
      label: 'Suggestions',
      value: summary?.suggestion_count ?? feedback.filter((item) => item.type === 'suggestion').length,
      color: '#047857',
    },
    { label: 'Email failed', value: summary?.email_failed_count ?? 0, color: '#991b1b' },
  ];

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: '#0369a1', fontWeight: 900, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
            Tester Feedback Inbox
          </p>
          <h1 style={{ color: '#0f172a', fontSize: '2.4rem', lineHeight: 1.05, margin: '0.35rem 0' }}>
            Issue / Suggestion Notes
          </h1>
          <p style={{ color: '#475569', fontSize: '1rem', maxWidth: '760px', margin: 0 }}>
            Every tester submission is saved here even if outbound email is unavailable. Email delivery still runs in
            the background and will show as sent when SendGrid accepts it.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
          {statCards.map((stat) => (
            <div key={stat.label} style={{ ...cardStyle, padding: '1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ color: stat.color, fontSize: '2rem', fontWeight: 900, marginTop: '0.25rem' }}>{stat.value}</div>
            </div>
          ))}
        </section>

        <section style={{ ...cardStyle, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: '#334155' }}>Status</strong>
            {(['all', 'new', 'reviewed', 'resolved', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                style={{
                  ...buttonStyle,
                  background: statusFilter === status ? '#0f172a' : 'white',
                  color: statusFilter === status ? 'white' : '#334155',
                }}
              >
                {status === 'all' ? 'All' : statusLabels[status]}
              </button>
            ))}
            <span style={{ width: 1, height: 28, background: '#cbd5e1', margin: '0 0.4rem' }} />
            <strong style={{ color: '#334155' }}>Type</strong>
            {(['all', 'issue', 'suggestion'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                style={{
                  ...buttonStyle,
                  background: typeFilter === type ? '#0369a1' : 'white',
                  color: typeFilter === type ? 'white' : '#334155',
                }}
              >
                {type === 'all' ? 'All' : type}
              </button>
            ))}
            <button type="button" onClick={fetchFeedback} style={{ ...buttonStyle, marginLeft: 'auto' }} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </section>

        {error && (
          <div style={{ ...cardStyle, padding: '1rem', marginBottom: '1rem', borderColor: '#fecaca', color: '#991b1b' }}>
            {error}
          </div>
        )}

        <section style={{ display: 'grid', gap: '0.85rem' }}>
          {feedback.length === 0 && !loading ? (
            <div style={{ ...cardStyle, padding: '2rem', color: '#64748b', textAlign: 'center' }}>
              No tester feedback has been submitted for the current filters.
            </div>
          ) : (
            feedback.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <article key={item.id} style={{ ...cardStyle, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    style={{
                      width: '100%',
                      border: 0,
                      background: 'transparent',
                      textAlign: 'left',
                      padding: '1rem 1.1rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                          <Badge tone={item.type === 'issue' ? { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' } : { bg: '#dcfce7', text: '#166534', border: '#86efac' }}>
                            {item.type}
                          </Badge>
                          <Badge tone={statusColors[item.status]}>{statusLabels[item.status]}</Badge>
                          <Badge tone={emailColors[item.emailStatus]}>Email {item.emailStatus}</Badge>
                          {item.attachmentCount > 0 && (
                            <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 800 }}>
                              {item.attachmentCount} attachment{item.attachmentCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem' }}>
                          {item.message.length > 150 ? `${item.message.slice(0, 150)}...` : item.message}
                        </h2>
                        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                          {item.userName || item.userEmail || 'Unknown user'} · {item.userRole || 'unknown role'} · {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <span style={{ color: '#64748b', fontWeight: 900 }}>{expanded ? 'Close' : 'Open'}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '1rem 1.1rem 1.2rem' }}>
                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '1rem',
                          color: '#0f172a',
                          marginBottom: '1rem',
                        }}
                      >
                        {item.message}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem', color: '#334155' }}>
                        <div>
                          <strong>Page</strong>
                          <div style={{ marginTop: '0.25rem', wordBreak: 'break-word' }}>
                            {item.pageUrl ? (
                              <a href={item.pageUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontWeight: 700 }}>
                                {item.pathname || item.pageUrl}
                              </a>
                            ) : (
                              item.pathname || 'Unknown page'
                            )}
                          </div>
                        </div>
                        <div>
                          <strong>Captured</strong>
                          <div style={{ marginTop: '0.25rem' }}>{formatDate(item.capturedAt || item.createdAt)}</div>
                        </div>
                        <div>
                          <strong>Viewport</strong>
                          <div style={{ marginTop: '0.25rem' }}>{item.viewport || 'Unknown'}</div>
                        </div>
                        <div>
                          <strong>Email</strong>
                          <div style={{ marginTop: '0.25rem' }}>
                            {item.emailRecipient || 'No recipient'} · {item.emailStatus}
                          </div>
                          {item.emailError && (
                            <div style={{ marginTop: '0.35rem', color: '#991b1b', fontSize: '0.82rem' }}>{item.emailError}</div>
                          )}
                        </div>
                      </div>

                      {item.attachments.length > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                          <strong style={{ color: '#334155' }}>Attachments</strong>
                          <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            {item.attachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => openAttachment(item, attachment)}
                                style={{ ...buttonStyle, borderRadius: '12px' }}
                              >
                                {attachment.filename} · {formatBytes(attachment.sizeBytes)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        {(['new', 'reviewed', 'resolved', 'archived'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateFeedbackStatus(item.id, status)}
                            disabled={savingId === item.id || item.status === status}
                            style={{
                              ...buttonStyle,
                              background: item.status === status ? statusColors[status].bg : 'white',
                              color: item.status === status ? statusColors[status].text : '#334155',
                              borderColor: item.status === status ? statusColors[status].border : '#cbd5e1',
                              opacity: savingId === item.id ? 0.65 : 1,
                            }}
                          >
                            Mark {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

export default ProfessionalFeedbackPage;
