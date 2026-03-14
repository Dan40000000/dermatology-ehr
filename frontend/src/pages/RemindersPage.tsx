import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import {
  fetchRecallCampaigns,
  createRecallCampaign,
  updateRecallCampaign,
  deleteRecallCampaign,
  generateRecalls,
  generateAllRecalls,
  fetchDueRecalls,
  fetchRecallHistory,
  fetchRecallStats,
  updateRecallStatus,
  recordRecallContact,
  exportRecalls,
  fetchPatients,
  type RecallCampaign,
  type PatientRecall,
  type ReminderLogEntry,
  type RecallStats,
  type Patient,
} from '../api';

const RECALL_TYPES = [
  'Annual Skin Check',
  'Post-Procedure Follow-up',
  'Medication Refill',
  'Lab Result Follow-up',
  'Chronic Condition Check-in',
];

const STATUS_OPTIONS = ['pending', 'contacted', 'scheduled', 'completed', 'dismissed'];
const CONTACT_METHODS = ['email', 'sms', 'phone', 'mail', 'portal'];
const TAB_OPTIONS = ['campaigns', 'due', 'history', 'stats'] as const;
type ReminderTab = (typeof TAB_OPTIONS)[number];

export function RemindersPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReminderTab>('campaigns');

  // Campaigns
  const [campaigns, setCampaigns] = useState<RecallCampaign[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<RecallCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    recallType: RECALL_TYPES[0],
    intervalMonths: 12,
    isActive: true,
  });

  // Due Recalls
  const [dueRecalls, setDueRecalls] = useState<PatientRecall[]>([]);
  const [recallFilters, setRecallFilters] = useState({
    startDate: '',
    endDate: '',
    campaignId: '',
    status: '',
  });

  // Contact Modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedRecall, setSelectedRecall] = useState<PatientRecall | null>(null);
  const [contactForm, setContactForm] = useState({
    contactMethod: 'phone',
    notes: '',
    messageContent: '',
  });

  // History
  const [history, setHistory] = useState<ReminderLogEntry[]>([]);
  const [historyFilters, setHistoryFilters] = useState({
    campaignId: '',
    startDate: '',
    endDate: '',
  });

  // Stats
  const [stats, setStats] = useState<RecallStats | null>(null);

  // Patients for reference
  const [patients, setPatients] = useState<Patient[]>([]);

  const loadCampaigns = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchRecallCampaigns(session.tenantId, session.accessToken);
      setCampaigns(res.campaigns);
    } catch (err: any) {
      showError(err.message || 'Failed to load campaigns');
    }
  }, [session, showError]);

  const loadDueRecalls = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchDueRecalls(session.tenantId, session.accessToken, recallFilters);
      setDueRecalls(res.recalls);
    } catch (err: any) {
      showError(err.message || 'Failed to load due recalls');
    }
  }, [session, recallFilters, showError]);

  const loadHistory = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchRecallHistory(session.tenantId, session.accessToken, historyFilters);
      setHistory(res.history);
    } catch (err: any) {
      showError(err.message || 'Failed to load history');
    }
  }, [session, historyFilters, showError]);

  const loadStats = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchRecallStats(session.tenantId, session.accessToken);
      setStats(res);
    } catch (err: any) {
      showError(err.message || 'Failed to load stats');
    }
  }, [session, showError]);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(res.data || res.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load patients');
    }
  }, [session, showError]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCampaigns(), loadDueRecalls(), loadPatients(), loadStats()]);
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, loadDueRecalls, loadPatients, loadStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const statusParam = searchParams.get('status');
    const filterParam = searchParams.get('filter');

    if (tabParam && TAB_OPTIONS.includes(tabParam as ReminderTab) && tabParam !== activeTab) {
      setActiveTab(tabParam as ReminderTab);
    }

    if (statusParam && STATUS_OPTIONS.includes(statusParam) && statusParam !== recallFilters.status) {
      setRecallFilters((prev) => ({ ...prev, status: statusParam }));
    }

    if (filterParam === 'completed' && recallFilters.status !== 'completed') {
      setRecallFilters((prev) => ({ ...prev, status: 'completed' }));
      if (activeTab !== 'due') {
        setActiveTab('due');
      }
    }
  }, [activeTab, recallFilters.status, searchParams]);

  useEffect(() => {
    if (activeTab === 'due') {
      loadDueRecalls();
    } else if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'stats') {
      loadStats();
    }
  }, [activeTab, loadDueRecalls, loadHistory, loadStats]);

  const handleTabChange = (tab: ReminderTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  // Campaign Actions
  const handleCreateCampaign = async () => {
    if (!session) return;
    if (!campaignForm.name || !campaignForm.recallType) {
      showError('Name and recall type are required');
      return;
    }

    try {
      if (editingCampaign) {
        await updateRecallCampaign(session.tenantId, session.accessToken, editingCampaign.id, campaignForm);
        showSuccess('Campaign updated successfully');
      } else {
        await createRecallCampaign(session.tenantId, session.accessToken, campaignForm);
        showSuccess('Campaign created successfully');
      }

      setShowCampaignModal(false);
      setEditingCampaign(null);
      setCampaignForm({
        name: '',
        description: '',
        recallType: RECALL_TYPES[0],
        intervalMonths: 12,
        isActive: true,
      });
      loadCampaigns();
    } catch (err: any) {
      showError(err.message || 'Failed to save campaign');
    }
  };

  const handleEditCampaign = (campaign: RecallCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || '',
      recallType: campaign.recallType,
      intervalMonths: campaign.intervalMonths,
      isActive: campaign.isActive,
    });
    setShowCampaignModal(true);
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!session) return;
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await deleteRecallCampaign(session.tenantId, session.accessToken, campaignId);
      showSuccess('Campaign deleted successfully');
      loadCampaigns();
    } catch (err: any) {
      showError(err.message || 'Failed to delete campaign');
    }
  };

  const handleToggleCampaign = async (campaign: RecallCampaign) => {
    if (!session) return;
    try {
      await updateRecallCampaign(session.tenantId, session.accessToken, campaign.id, {
        isActive: !campaign.isActive,
      });
      showSuccess(`Campaign ${!campaign.isActive ? 'activated' : 'deactivated'}`);
      loadCampaigns();
    } catch (err: any) {
      showError(err.message || 'Failed to update campaign');
    }
  };

  const handleGenerateRecalls = async (campaignId: string) => {
    if (!session) return;
    try {
      const result = await generateRecalls(session.tenantId, session.accessToken, campaignId);
      showSuccess(`Generated ${result.created} recalls`);
      loadDueRecalls();
      loadStats();
    } catch (err: any) {
      showError(err.message || 'Failed to generate recalls');
    }
  };

  const handleGenerateAllRecalls = async () => {
    if (!session) return;
    try {
      const result = await generateAllRecalls(session.tenantId, session.accessToken);
      showSuccess(`Processed ${result.campaigns} campaigns, created ${result.totalCreated} recalls`);
      loadDueRecalls();
      loadStats();
    } catch (err: any) {
      showError(err.message || 'Failed to generate recalls');
    }
  };

  // Recall Actions
  const handleContactPatient = (recall: PatientRecall) => {
    setSelectedRecall(recall);
    setContactForm({
      contactMethod: 'phone',
      notes: '',
      messageContent: '',
    });
    setShowContactModal(true);
  };

  const handleRecordContact = async () => {
    if (!session || !selectedRecall) return;

    try {
      await recordRecallContact(
        session.tenantId,
        session.accessToken,
        selectedRecall.id,
        contactForm
      );
      showSuccess('Contact recorded successfully');
      setShowContactModal(false);
      setSelectedRecall(null);
      loadDueRecalls();
      loadHistory();
    } catch (err: any) {
      showError(err.message || 'Failed to record contact');
    }
  };

  const handleUpdateStatus = async (recallId: string, status: string) => {
    if (!session) return;

    try {
      await updateRecallStatus(session.tenantId, session.accessToken, recallId, { status });
      showSuccess(`Status updated to ${status}`);
      loadDueRecalls();
      loadStats();
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    }
  };

  const handleExport = async () => {
    if (!session) return;

    try {
      const blob = await exportRecalls(session.tenantId, session.accessToken, {
        campaignId: recallFilters.campaignId,
        status: recallFilters.status,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recalls-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showSuccess('Recalls exported successfully');
    } catch (err: any) {
      showError(err.message || 'Failed to export recalls');
    }
  };

  if (loading) {
    return (
      <div className="reminders-page">
        <div className="page-header">
          <h1>Reminders & Recalls</h1>
        </div>
        <Skeleton variant="card" height={60} />
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="reminders-page">
      <div className="page-header">
        <h1>Reminders & Recalls</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'campaigns' && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleGenerateAllRecalls}
              >
                Generate All Recalls
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditingCampaign(null);
                  setCampaignForm({
                    name: '',
                    description: '',
                    recallType: RECALL_TYPES[0],
                    intervalMonths: 12,
                    isActive: true,
                  });
                  setShowCampaignModal(true);
                }}
              >
                + New Campaign
              </button>
            </>
          )}
          {activeTab === 'due' && (
            <button type="button" className="btn-secondary" onClick={handleExport}>
              Export to CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="reminder-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.overall.total_pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.overall.total_contacted}</div>
            <div className="stat-label">Contacted</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.overall.total_scheduled}</div>
            <div className="stat-label">Scheduled</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.overall.contactRate.toFixed(1)}%</div>
            <div className="stat-label">Contact Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.overall.conversionRate.toFixed(1)}%</div>
            <div className="stat-label">Conversion Rate</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="reminder-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => handleTabChange('campaigns')}
        >
          Campaigns ({campaigns.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'due' ? 'active' : ''}`}
          onClick={() => handleTabChange('due')}
        >
          Due for Recall ({dueRecalls.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => handleTabChange('history')}
        >
          Contact History
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => handleTabChange('stats')}
        >
          Statistics
        </button>
      </div>

      {/* Campaign Management Tab */}
      {activeTab === 'campaigns' && (
        <div className="campaigns-list">
          {campaigns.length === 0 ? (
            <Panel title="">
              <div className="empty-state">
                <div className="empty-icon"></div>
                <h3>No campaigns yet</h3>
                <p className="muted">Create your first recall campaign</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowCampaignModal(true)}
                >
                  + New Campaign
                </button>
              </div>
            </Panel>
          ) : (
            <div className="campaign-cards">
              {campaigns.map((campaign) => {
                const campaignStats = stats?.byCampaign.find((s) => s.id === campaign.id);
                return (
                  <div key={campaign.id} className="campaign-card">
                    <div className="campaign-header">
                      <div>
                        <h3>{campaign.name}</h3>
                        <div className="muted tiny">{campaign.recallType}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={campaign.isActive}
                            onChange={() => handleToggleCampaign(campaign)}
                          />
                          <span className="slider"></span>
                        </label>
                        <span className="tiny">{campaign.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>

                    {campaign.description && (
                      <p className="campaign-description muted">{campaign.description}</p>
                    )}

                    <div className="campaign-interval">
                      <strong>Interval:</strong> Every {campaign.intervalMonths} months
                    </div>

                    {campaignStats && (
                      <div className="campaign-stats-mini">
                        <div className="stat-mini">
                          <span className="stat-mini-value">{campaignStats.total_recalls}</span>
                          <span className="stat-mini-label">Total</span>
                        </div>
                        <div className="stat-mini">
                          <span className="stat-mini-value">{campaignStats.pending}</span>
                          <span className="stat-mini-label">Pending</span>
                        </div>
                        <div className="stat-mini">
                          <span className="stat-mini-value">{campaignStats.contacted}</span>
                          <span className="stat-mini-label">Contacted</span>
                        </div>
                        <div className="stat-mini">
                          <span className="stat-mini-value">{campaignStats.scheduled}</span>
                          <span className="stat-mini-label">Scheduled</span>
                        </div>
                      </div>
                    )}

                    <div className="campaign-actions">
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => handleGenerateRecalls(campaign.id)}
                        disabled={!campaign.isActive}
                      >
                        Generate Recalls
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => handleEditCampaign(campaign)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-danger"
                        onClick={() => handleDeleteCampaign(campaign.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Due for Recall Tab */}
      {activeTab === 'due' && (
        <div>
          {/* Filters */}
          <Panel title="Filters">
            <div className="form-row">
              <div className="form-field">
                <label>Campaign</label>
                <select
                  value={recallFilters.campaignId}
                  onChange={(e) =>
                    setRecallFilters({ ...recallFilters, campaignId: e.target.value })
                  }
                >
                  <option value="">All Campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Status</label>
                <select
                  value={recallFilters.status}
                  onChange={(e) => setRecallFilters({ ...recallFilters, status: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={recallFilters.startDate}
                  onChange={(e) =>
                    setRecallFilters({ ...recallFilters, startDate: e.target.value })
                  }
                />
              </div>

              <div className="form-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={recallFilters.endDate}
                  onChange={(e) => setRecallFilters({ ...recallFilters, endDate: e.target.value })}
                />
              </div>

              <div className="form-field" style={{ alignSelf: 'flex-end' }}>
                <button type="button" className="btn-primary" onClick={loadDueRecalls}>
                  Apply Filters
                </button>
              </div>
            </div>
          </Panel>

          {/* Recalls Table */}
          <Panel title={`Due Recalls (${dueRecalls.length})`}>
            {dueRecalls.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"></div>
                <h3>No recalls due</h3>
                <p className="muted">All patients are up to date</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Campaign</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Last Contact</th>
                      <th>Attempts</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueRecalls.map((recall) => (
                      <tr key={recall.id}>
                        <td>
                          <div>
                            <strong>
                              {recall.lastName}, {recall.firstName}
                            </strong>
                          </div>
                          <div className="muted tiny">
                            {recall.phone || recall.email || 'No contact'}
                          </div>
                        </td>
                        <td>
                          <div>{recall.campaignName || 'N/A'}</div>
                          <div className="muted tiny">{recall.recallType || ''}</div>
                        </td>
                        <td>{new Date(recall.dueDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`pill ${recall.status}`}>{recall.status}</span>
                        </td>
                        <td>
                          {recall.lastContactDate
                            ? new Date(recall.lastContactDate).toLocaleDateString()
                            : '-'}
                          {recall.contactMethod && (
                            <div className="muted tiny">{recall.contactMethod}</div>
                          )}
                        </td>
                        <td>{recall.contactAttempts || 0}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              onClick={() => handleContactPatient(recall)}
                            >
                              Contact
                            </button>
                            <select
                              className="btn-sm"
                              value={recall.status}
                              onChange={(e) => handleUpdateStatus(recall.id, e.target.value)}
                              style={{ minWidth: '100px' }}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s.charAt(0).toUpperCase() + s.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Contact History Tab */}
      {activeTab === 'history' && (
        <div>
          {/* Filters */}
          <Panel title="Filters">
            <div className="form-row">
              <div className="form-field">
                <label>Campaign</label>
                <select
                  value={historyFilters.campaignId}
                  onChange={(e) =>
                    setHistoryFilters({ ...historyFilters, campaignId: e.target.value })
                  }
                >
                  <option value="">All Campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={historyFilters.startDate}
                  onChange={(e) =>
                    setHistoryFilters({ ...historyFilters, startDate: e.target.value })
                  }
                />
              </div>

              <div className="form-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={historyFilters.endDate}
                  onChange={(e) =>
                    setHistoryFilters({ ...historyFilters, endDate: e.target.value })
                  }
                />
              </div>

              <div className="form-field" style={{ alignSelf: 'flex-end' }}>
                <button type="button" className="btn-primary" onClick={loadHistory}>
                  Apply Filters
                </button>
              </div>
            </div>
          </Panel>

          {/* History Log */}
          <Panel title={`Contact History (${history.length})`}>
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"></div>
                <h3>No contact history</h3>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date/Time</th>
                      <th>Patient</th>
                      <th>Campaign</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.sentAt).toLocaleString()}</td>
                        <td>
                          {entry.lastName}, {entry.firstName}
                        </td>
                        <td>{entry.campaignName || 'N/A'}</td>
                        <td>
                          <span className="pill">{entry.reminderType}</span>
                        </td>
                        <td>
                          <span className={`pill ${entry.deliveryStatus}`}>
                            {entry.deliveryStatus}
                          </span>
                        </td>
                        <td className="muted tiny">
                          {entry.messageContent?.substring(0, 50) || '-'}
                          {entry.messageContent && entry.messageContent.length > 50 && '...'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && stats && (
        <div>
          <Panel title="Overall Statistics">
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.total_recalls}</div>
                <div className="stat-box-label">Total Recalls</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.total_pending}</div>
                <div className="stat-box-label">Pending</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.total_contacted}</div>
                <div className="stat-box-label">Contacted</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.total_scheduled}</div>
                <div className="stat-box-label">Scheduled</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.total_completed}</div>
                <div className="stat-box-label">Completed</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.contactRate.toFixed(1)}%</div>
                <div className="stat-box-label">Contact Rate</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-value">{stats.overall.conversionRate.toFixed(1)}%</div>
                <div className="stat-box-label">Conversion Rate</div>
              </div>
            </div>
          </Panel>

          <Panel title="By Campaign">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Pending</th>
                    <th>Contacted</th>
                    <th>Scheduled</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byCampaign.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <strong>{campaign.name}</strong>
                      </td>
                      <td className="muted">{campaign.recallType}</td>
                      <td>{campaign.total_recalls}</td>
                      <td>{campaign.pending}</td>
                      <td>{campaign.contacted}</td>
                      <td>{campaign.scheduled}</td>
                      <td>{campaign.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* Campaign Modal */}
      <Modal
        isOpen={showCampaignModal}
        title={editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
        onClose={() => {
          setShowCampaignModal(false);
          setEditingCampaign(null);
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Campaign Name *</label>
            <input
              type="text"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
              placeholder="e.g., Annual Skin Check 2024"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={campaignForm.description}
              onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>Recall Type *</label>
            <select
              value={campaignForm.recallType}
              onChange={(e) => setCampaignForm({ ...campaignForm, recallType: e.target.value })}
            >
              {RECALL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Interval (months) *</label>
            <input
              type="number"
              min="1"
              max="120"
              value={campaignForm.intervalMonths}
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, intervalMonths: parseInt(e.target.value) || 12 })
              }
            />
            <small className="muted">
              Patients will be recalled {campaignForm.intervalMonths} months after their last visit
            </small>
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={campaignForm.isActive}
                onChange={(e) => setCampaignForm({ ...campaignForm, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowCampaignModal(false);
              setEditingCampaign(null);
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateCampaign}>
            {editingCampaign ? 'Update' : 'Create'} Campaign
          </button>
        </div>
      </Modal>

      {/* Contact Modal */}
      <Modal
        isOpen={showContactModal}
        title="Record Contact"
        onClose={() => {
          setShowContactModal(false);
          setSelectedRecall(null);
        }}
      >
        {selectedRecall && (
          <div className="modal-form">
            <div className="contact-patient-info">
              <h4>
                {selectedRecall.lastName}, {selectedRecall.firstName}
              </h4>
              <div className="muted">{selectedRecall.phone || selectedRecall.email}</div>
              <div className="muted tiny">{selectedRecall.campaignName}</div>
            </div>

            <div className="form-field">
              <label>Contact Method *</label>
              <select
                value={contactForm.contactMethod}
                onChange={(e) => setContactForm({ ...contactForm, contactMethod: e.target.value })}
              >
                {CONTACT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Notes</label>
              <textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                placeholder="Call notes, patient response, etc..."
                rows={3}
              />
            </div>

            <div className="form-field">
              <label>Message Content (Optional)</label>
              <textarea
                value={contactForm.messageContent}
                onChange={(e) =>
                  setContactForm({ ...contactForm, messageContent: e.target.value })
                }
                placeholder="Content of email/SMS/voicemail sent..."
                rows={2}
              />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowContactModal(false);
              setSelectedRecall(null);
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleRecordContact}>
            Record Contact
          </button>
        </div>
      </Modal>

      <style>{`
        .reminders-page {
          padding: 1.5rem;
          background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%);
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .reminder-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
          animation: fadeIn 0.5s ease-out 0.1s both;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .stat-card {
          background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%);
          border: 2px solid #bae6fd;
          border-radius: 12px;
          padding: 1.25rem;
          text-align: center;
          box-shadow: 0 4px 6px rgba(56, 189, 248, 0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: linear-gradient(90deg, #0ea5e9, #38bdf8);
        }

        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 12px rgba(56, 189, 248, 0.2);
          border-color: #0ea5e9;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #0c4a6e;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .stat-label {
          font-size: 0.875rem;
          color: #0369a1;
          margin-top: 0.25rem;
          font-weight: 500;
        }

        .reminder-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: none;
          background: white;
          padding: 0.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .tab {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #64748b;
          transition: all 0.3s ease;
          position: relative;
        }

        .tab:hover {
          color: #0c4a6e;
          background: #f0f9ff;
        }

        .tab.active {
          color: white;
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          box-shadow: 0 4px 6px rgba(14, 165, 233, 0.3);
        }

        .campaign-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.25rem;
        }

        .campaign-card {
          background: white;
          border: 2px solid #e0f2fe;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
          animation: fadeIn 0.4s ease-out;
        }

        .campaign-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(14, 165, 233, 0.15);
          border-color: #0ea5e9;
        }

        .campaign-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .campaign-header h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1.125rem;
        }

        .campaign-description {
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .campaign-interval {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: #f9fafb;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .campaign-stats-mini {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 4px;
        }

        .stat-mini {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .stat-mini-value {
          font-size: 1.25rem;
          font-weight: bold;
          color: #1f2937;
        }

        .stat-mini-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .campaign-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: 0.4s;
          border-radius: 24px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.4s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #2563eb;
        }

        input:checked + .slider:before {
          transform: translateX(20px);
        }

        .pill {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .pill.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .pill.contacted {
          background: #dbeafe;
          color: #1e40af;
        }

        .pill.scheduled {
          background: #d1fae5;
          color: #065f46;
        }

        .pill.completed {
          background: #d1fae5;
          color: #065f46;
        }

        .pill.dismissed {
          background: #f3f4f6;
          color: #4b5563;
        }

        .pill.sent, .pill.delivered {
          background: #d1fae5;
          color: #065f46;
        }

        .pill.failed, .pill.bounced {
          background: #fee2e2;
          color: #991b1b;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .data-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .data-table tbody tr:hover {
          background: #f9fafb;
        }

        .table-responsive {
          overflow-x: auto;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }

        .stat-box {
          text-align: center;
          padding: 1.5rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .stat-box-value {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
        }

        .stat-box-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-top: 0.5rem;
        }

        .contact-patient-info {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .contact-patient-info h4 {
          margin: 0 0 0.5rem 0;
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .empty-state h3 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
        }

        .muted {
          color: #6b7280;
        }

        .tiny {
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}
