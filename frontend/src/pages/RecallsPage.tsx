import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel, Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  bulkNotifyRecalls,
  exportRecalls,
  fetchDueRecalls,
  fetchRecallCampaigns,
  fetchRecallStats,
  generateAllRecalls,
  recordRecallContact,
  updateRecallStatus,
  type PatientRecall,
  type RecallCampaign,
  type RecallStats,
} from '../api';

type FilterType = 'all' | 'today' | 'overdue' | 'completed';

const FILTERS: Array<{ key: FilterType; label: string }> = [
  { key: 'all', label: 'All active' },
  { key: 'today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

const RECALL_STATUSES: PatientRecall['status'][] = ['pending', 'contacted', 'scheduled', 'completed', 'dismissed'];

const defaultSmsMessage =
  'Dermatology DEMO Office: You are due for a dermatology follow-up visit. Please call us or reply to schedule. Reply STOP to opt out.';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function getRecallValue(recall: PatientRecall, camelKey: keyof PatientRecall, snakeKey: string): string | undefined {
  return asString(recall[camelKey]) || asString((recall as any)[snakeKey]);
}

function getPatientName(recall: PatientRecall): string {
  const firstName = getRecallValue(recall, 'firstName', 'first_name') || '';
  const lastName = getRecallValue(recall, 'lastName', 'last_name') || '';
  const name = `${lastName}, ${firstName}`.replace(/^,\s*/, '').trim();
  return name || 'Unknown patient';
}

function getPatientId(recall: PatientRecall): string | undefined {
  return getRecallValue(recall, 'patientId', 'patient_id');
}

function getDueDate(recall: PatientRecall): string {
  return getRecallValue(recall, 'dueDate', 'due_date') || getRecallValue(recall, 'recallDate' as keyof PatientRecall, 'recall_date') || '';
}

function formatDate(dateValue?: string): string {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString();
}

function formatDateTime(dateValue?: string): string {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatReminderType(reminderType?: string): string {
  switch ((reminderType || '').toLowerCase()) {
    case 'sms':
      return 'Text';
    case 'phone':
      return 'Call';
    case 'mail':
      return 'Mail';
    case 'portal':
      return 'Portal';
    case 'email':
      return 'Email';
    default:
      return 'Outreach';
  }
}

function formatDeliveryStatus(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'delivered':
      return 'Delivered';
    case 'sent':
      return 'Sent';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'bounced':
      return 'Bounced';
    case 'opted_out':
      return 'Opted out';
    default:
      return status || '';
  }
}

function buildTelHref(phone?: string): string | undefined {
  const normalized = String(phone || '').replace(/[^\d+]/g, '');
  return normalized ? `tel:${normalized}` : undefined;
}

function dateKey(dateValue?: string): string {
  return dateValue ? dateValue.slice(0, 10) : '';
}

function isDueOrOverdue(recall: PatientRecall): boolean {
  const dueDate = dateKey(getDueDate(recall));
  return Boolean(dueDate && dueDate <= todayDateString());
}

function isOpenStatus(recall: PatientRecall): boolean {
  return !['completed', 'dismissed'].includes(recall.status);
}

export function RecallsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCampaignId = searchParams.get('campaignId') || '';

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [recalls, setRecalls] = useState<PatientRecall[]>([]);
  const [campaigns, setCampaigns] = useState<RecallCampaign[]>([]);
  const [stats, setStats] = useState<RecallStats | null>(null);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'today' || filterParam === 'overdue' || filterParam === 'completed') {
      setActiveFilter(filterParam);
    } else {
      setActiveFilter('all');
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const recallFilters: {
        startDate?: string;
        endDate?: string;
        campaignId?: string;
        status?: string;
      } = {};

      if (activeFilter === 'today') {
        recallFilters.startDate = todayDateString();
        recallFilters.endDate = todayDateString();
      } else if (activeFilter === 'overdue') {
        recallFilters.endDate = yesterdayDateString();
      } else if (activeFilter === 'completed') {
        recallFilters.status = 'completed';
      }

      if (selectedCampaignId) {
        recallFilters.campaignId = selectedCampaignId;
      }
      const effectiveRecallFilters = Object.keys(recallFilters).length > 0 ? recallFilters : undefined;

      const [recallsRes, campaignsRes, statsRes] = await Promise.all([
        fetchDueRecalls(session.tenantId, session.accessToken, effectiveRecallFilters),
        fetchRecallCampaigns(session.tenantId, session.accessToken),
        fetchRecallStats(session.tenantId, session.accessToken),
      ]);

      setRecalls(recallsRes.recalls || []);
      setCampaigns(campaignsRes.campaigns || []);
      setStats(statsRes);
    } catch (err: any) {
      showError(err.message || 'Failed to load recalls');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, selectedCampaignId, session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const visibleRecalls = useMemo(() => {
    if (activeFilter === 'all') {
      return selectedCampaignId ? recalls : recalls.filter(isOpenStatus);
    }
    return recalls;
  }, [activeFilter, recalls, selectedCampaignId]);

  const filterOptions = useMemo(
    () =>
      FILTERS.map((filter) =>
        selectedCampaignId && filter.key === 'all'
          ? { ...filter, label: 'All patients' }
          : filter,
      ),
    [selectedCampaignId],
  );

  const actionableSmsRecalls = useMemo(
    () => visibleRecalls.filter((recall) => isOpenStatus(recall) && isDueOrOverdue(recall) && Boolean(recall.phone)),
    [visibleRecalls],
  );

  const summary = useMemo(() => {
    const today = todayDateString();
    return {
      activeCampaigns: campaigns.filter((campaign) => campaign.isActive).length,
      open: visibleRecalls.filter(isOpenStatus).length,
      dueToday: visibleRecalls.filter((recall) => isOpenStatus(recall) && dateKey(getDueDate(recall)) === today).length,
      overdue: visibleRecalls.filter((recall) => {
        const dueDate = dateKey(getDueDate(recall));
        return isOpenStatus(recall) && Boolean(dueDate) && dueDate < today;
      }).length,
    };
  }, [campaigns, visibleRecalls]);
  const activeCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.isActive), [campaigns]);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );
  const campaignStatsById = useMemo(() => {
    const entries = stats?.byCampaign || [];
    return new Map(entries.map((entry) => [entry.id, entry]));
  }, [stats]);
  const selectedCampaignStats = selectedCampaignId ? campaignStatsById.get(selectedCampaignId) : undefined;
  const selectedCohortStatusCounts = useMemo(() => {
    const fallbackCounts = RECALL_STATUSES.reduce<Record<PatientRecall['status'], number>>(
      (acc, status) => {
        acc[status] = recalls.filter((recall) => recall.status === status).length;
        return acc;
      },
      { pending: 0, contacted: 0, scheduled: 0, completed: 0, dismissed: 0 },
    );

    return {
      total: selectedCampaignStats?.total_recalls ?? recalls.length,
      pending: selectedCampaignStats?.pending ?? fallbackCounts.pending,
      contacted: selectedCampaignStats?.contacted ?? fallbackCounts.contacted,
      scheduled: selectedCampaignStats?.scheduled ?? fallbackCounts.scheduled,
      completed: selectedCampaignStats?.completed ?? fallbackCounts.completed,
      dismissed: selectedCampaignStats?.dismissed ?? fallbackCounts.dismissed,
    };
  }, [recalls, selectedCampaignStats]);

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
    const nextParams = new URLSearchParams(searchParams);
    if (filter === 'all') {
      nextParams.delete('filter');
    } else {
      nextParams.set('filter', filter);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleCampaignSelect = (campaignId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (selectedCampaignId === campaignId) {
      nextParams.delete('campaignId');
    } else {
      nextParams.set('campaignId', campaignId);
      nextParams.delete('filter');
      setActiveFilter('all');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const clearCampaign = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('campaignId');
    setSearchParams(nextParams, { replace: true });
  };

  const handleGenerate = async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      const result = await generateAllRecalls(session.tenantId, session.accessToken);
      showSuccess(`Generated ${result.totalCreated || 0} recall(s)`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to generate recalls');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkSms = async () => {
    if (!session || actionableSmsRecalls.length === 0) return;
    setActionLoading(true);
    try {
      const result = await bulkNotifyRecalls(session.tenantId, session.accessToken, {
        recallIds: actionableSmsRecalls.map((recall) => recall.id),
        notificationType: 'sms',
        messageTemplate: defaultSmsMessage,
      });
      if (result.failed > 0) {
        showError(`Sent ${result.successful}; ${result.failed} failed. Check patient SMS consent and Twilio status.`);
      } else {
        showSuccess(`Sent ${result.successful} recall SMS reminder(s)`);
      }
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send SMS reminders');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendSms = async (recall: PatientRecall) => {
    if (!session) return;
    setActionLoading(true);
    try {
      await recordRecallContact(session.tenantId, session.accessToken, recall.id, {
        contactMethod: 'sms',
        notes: 'Recall SMS sent from Recall worklist',
        messageContent: defaultSmsMessage,
      });
      showSuccess(`SMS sent to ${getPatientName(recall)}`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send recall SMS');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (recall: PatientRecall, status: string) => {
    if (!session) return;
    try {
      await updateRecallStatus(session.tenantId, session.accessToken, recall.id, { status });
      showSuccess('Recall status updated');
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update recall');
    }
  };

  const handleExport = async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      const blob = await exportRecalls(session.tenantId, session.accessToken, {
        status: activeFilter === 'completed' ? 'completed' : undefined,
        campaignId: selectedCampaignId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recalls-${todayDateString()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showSuccess('Recall CSV exported');
    } catch (err: any) {
      showError(err.message || 'Failed to export recalls');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="content-card">
        <Skeleton height="3rem" />
        <Skeleton height="12rem" />
        <Skeleton height="18rem" />
      </div>
    );
  }

  return (
    <div className="content-card recalls-page">
      <div className="section-header">
        <div>
          <div className="eyebrow">Recalls</div>
          <h1>Recall Worklist</h1>
          <p className="muted">
            Track melanoma surveillance, follow-up recalls, staff reminders, and patient outreach.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={handleExport} disabled={actionLoading}>
            Export CSV
          </button>
          <button type="button" className="ghost" onClick={handleGenerate} disabled={actionLoading}>
            Generate Recalls
          </button>
          <button
            type="button"
            onClick={handleBulkSms}
            disabled={actionLoading || actionableSmsRecalls.length === 0}
            title={actionableSmsRecalls.length === 0 ? 'No due SMS-ready recalls in this view' : undefined}
          >
            Send SMS to Due Patients ({actionableSmsRecalls.length})
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div className="stat-card">
            <div className="stat-value">{summary.open}</div>
            <div className="stat-label">Open recalls</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.dueToday}</div>
            <div className="stat-label">Due today</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.overdue}</div>
            <div className="stat-label">Overdue</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.activeCampaigns}</div>
            <div className="stat-label">Active campaigns</div>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {filterOptions.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => handleFilterChange(filter.key)}
            style={{
              padding: '0.75rem 0.25rem',
              background: 'none',
              border: 'none',
              borderBottom:
                activeFilter === filter.key
                  ? '3px solid var(--primary-color, #0f766e)'
                  : '3px solid transparent',
              color: activeFilter === filter.key ? 'var(--primary-color, #0f766e)' : 'var(--text-color, #4b5563)',
              fontWeight: activeFilter === filter.key ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
        <Panel
          title={selectedCampaign ? `${selectedCampaign.name} surveillance cohort` : 'Recall Programs'}
          actions={selectedCampaign ? (
            <button type="button" className="ghost" onClick={clearCampaign}>
              Show all programs
            </button>
          ) : (
            <Link to="/reminders?tab=campaigns">Manage campaigns</Link>
          )}
        >
          {activeCampaigns.length === 0 ? (
            <div className="empty-state">
              <h3>No recall campaigns configured.</h3>
              <p className="muted">Create programs like Annual Skin Check or Melanoma Surveillance to track cohorts.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
              {activeCampaigns.map((campaign) => {
                const campaignStats = campaignStatsById.get(campaign.id);
                const isSelected = selectedCampaignId === campaign.id;
                const total = campaignStats?.total_recalls || 0;
                const open = (campaignStats?.pending || 0) + (campaignStats?.contacted || 0) + (campaignStats?.scheduled || 0);
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => handleCampaignSelect(campaign.id)}
                    style={{
                      textAlign: 'left',
                      border: isSelected ? '2px solid #0f766e' : '1px solid #d1d5db',
                      background: isSelected ? '#ecfdf5' : '#ffffff',
                      borderRadius: '14px',
                      padding: '1rem',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 12px 28px rgba(15, 118, 110, 0.15)' : '0 6px 18px rgba(15, 23, 42, 0.06)',
                    }}
                    aria-pressed={isSelected}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#111827' }}>{campaign.name}</div>
                        <div className="muted tiny">{campaign.recallType} · every {campaign.intervalMonths || 0} mo</div>
                      </div>
                      <span className="pill">{open} open</span>
                    </div>
                    {campaign.description && (
                      <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
                        {campaign.description}
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '0.85rem' }}>
                      {[
                        ['Total', total],
                        ['Pending', campaignStats?.pending || 0],
                        ['Contacted', campaignStats?.contacted || 0],
                        ['Done', campaignStats?.completed || 0],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.55rem', textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, color: '#111827' }}>{value}</div>
                          <div className="muted tiny">{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.85rem', color: '#0f766e', fontWeight: 700, fontSize: '0.85rem' }}>
                      {isSelected ? 'Showing these patients' : 'View enrolled patients'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title={selectedCampaign ? `${selectedCampaign.name} patients (${visibleRecalls.length})` : `Patients on recall (${visibleRecalls.length})`}
          actions={selectedCampaign ? <button type="button" className="ghost" onClick={clearCampaign}>Clear program filter</button> : <Link to="/reminders?tab=campaigns">Manage campaigns</Link>}
        >
          {selectedCampaign && (
            <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1rem' }}>
              <div className="muted">
                Showing every patient enrolled in <strong>{selectedCampaign.name}</strong>. Use the status tabs above to narrow the cohort.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {[
                  ['Total', selectedCohortStatusCounts.total],
                  ['Pending', selectedCohortStatusCounts.pending],
                  ['Contacted', selectedCohortStatusCounts.contacted],
                  ['Scheduled', selectedCohortStatusCounts.scheduled],
                  ['Completed', selectedCohortStatusCounts.completed],
                  ['Dismissed', selectedCohortStatusCounts.dismissed],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{value}</div>
                    <div className="muted tiny">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {visibleRecalls.length === 0 ? (
            <div className="empty-state">
              <h3>No recalls match this view</h3>
              <p className="muted">Melanoma and follow-up recall examples will appear here when seeded or generated.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Diagnosis / Recall</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Staff Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecalls.map((recall) => {
                    const dueDate = getDueDate(recall);
                    const dueDateKey = dateKey(dueDate);
                    const overdue = isOpenStatus(recall) && Boolean(dueDateKey) && dueDateKey < todayDateString();
                    const phone = getRecallValue(recall, 'phone', 'phone');
                    const patientId = getPatientId(recall);
                    const recallType = getRecallValue(recall, 'recallType', 'recall_type') || recall.campaignName || 'Recall';
                    const lastReminderType = recall.lastReminderType;
                    const lastReminderSentAt = recall.lastReminderSentAt;
                    const lastReminderDeliveryStatus = recall.lastReminderDeliveryStatus;
                    const hasTextThread = Boolean(recall.textThreadId);
                    const telHref = buildTelHref(phone);
                    return (
                      <tr key={recall.id}>
                        <td>
                          {patientId ? (
                            <Link to={`/patients/${patientId}?tab=clinical-summary`}>
                              <strong>{getPatientName(recall)}</strong>
                            </Link>
                          ) : (
                            <strong>{getPatientName(recall)}</strong>
                          )}
                          <div className="muted tiny">{recall.email || phone || 'No contact on file'}</div>
                        </td>
                        <td>
                          <div>{recall.campaignName || 'Manual Recall'}</div>
                          <div className="muted tiny">{recallType}</div>
                        </td>
                        <td>
                          <span className={overdue ? 'pill danger' : 'pill'}>{formatDate(dueDate)}</span>
                        </td>
                        <td>
                          <span className={`pill ${recall.status}`}>{recall.status}</span>
                        </td>
                        <td>
                          <div>{phone || 'No phone'}</div>
                          {lastReminderType ? (
                            <div className="muted tiny">
                              {formatReminderType(lastReminderType)}: {formatDateTime(lastReminderSentAt)}
                              {lastReminderDeliveryStatus ? ` • ${formatDeliveryStatus(lastReminderDeliveryStatus)}` : ''}
                            </div>
                          ) : (
                            <div className="muted tiny">No outreach sent yet</div>
                          )}
                          <div className="muted tiny">
                            {recall.notificationCount || recall.contactAttempts || 0} attempt(s)
                          </div>
                        </td>
                        <td>
                          <div>{recall.notes || recall.doctorNotes || 'Needs staff follow-up'}</div>
                          {recall.lastContactDate && (
                            <div className="muted tiny">Last contact: {formatDate(recall.lastContactDate)}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {patientId && (
                              <Link className="btn-sm" to={`/text-messages?patientId=${patientId}`}>
                                {hasTextThread ? 'Open Text Thread' : 'Text Patient'}
                              </Link>
                            )}
                            {telHref && (
                              <a className="btn-sm" href={telHref}>
                                Call Patient
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              onClick={() => handleSendSms(recall)}
                              disabled={actionLoading || !phone || !isOpenStatus(recall)}
                            >
                              Send Recall SMS
                            </button>
                            <select
                              className="btn-sm"
                              value={recall.status}
                              onChange={(event) => handleStatusChange(recall, event.target.value)}
                              disabled={actionLoading}
                            >
                              {['pending', 'contacted', 'scheduled', 'completed', 'dismissed'].map((status) => (
                                <option key={status} value={status}>
                                  {status.charAt(0).toUpperCase() + status.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Recall Program Snapshot">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Campaigns</h3>
              {activeCampaigns.length === 0 ? (
                <p className="muted">No recall campaigns configured.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {activeCampaigns.map((campaign) => (
                    <li key={campaign.id}>
                      <strong>{campaign.name}</strong> ({campaign.intervalMonths || 0} mo)
                      <div className="muted tiny">{campaign.recallType}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Performance</h3>
              <p className="muted">
                Total recalls: <strong>{stats?.overall.total_recalls || 0}</strong>
              </p>
              <p className="muted">
                Contact rate: <strong>{stats?.overall.contactRate || 0}%</strong>
              </p>
              <p className="muted">
                Scheduled/completed conversion: <strong>{stats?.overall.conversionRate || 0}%</strong>
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
