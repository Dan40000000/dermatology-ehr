import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Modal } from '../components/ui';
import {
  fetchRegistryDashboard,
  fetchMelanomaRegistry,
  fetchPsoriasisRegistry,
  fetchAcneRegistry,
  fetchChronicTherapyRegistry,
  fetchRegistryAlerts,
  fetchPasiHistory,
  recordRecallContact,
} from '../api';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPhoneDisplay } from '../utils/phone';

export type RegistryType = 'dashboard' | 'melanoma' | 'psoriasis' | 'acne' | 'chronic_therapy' | 'alerts';

type RegistryPageProps = {
  embedded?: boolean;
  queryParamName?: string;
};

type MelanomaRegistryPatient = {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn?: string | null;
  dob?: string | null;
  email?: string | null;
  phone?: string | null;
  diagnosis_date?: string | null;
  ajcc_stage?: string | null;
  breslow_depth_mm?: number | null;
  sentinel_node_biopsy_performed?: boolean | null;
  sentinel_node_status?: string | null;
  next_scheduled_exam?: string | null;
  recurrence_status?: string | null;
  recall_id?: string | null;
  recall_status?: string | null;
  recall_due_date?: string | null;
  last_reminder_type?: string | null;
  last_reminder_sent_at?: string | null;
  last_reminder_delivery_status?: string | null;
  contact_attempts?: number | null;
  text_thread_id?: string | null;
  text_thread_status?: string | null;
};

const defaultMelanomaRecallSms =
  'Dermatology DEMO Office: You are overdue for your melanoma follow-up skin exam. Please call us or reply to schedule. Reply STOP to opt out.';

const REGISTRY_TAB_QUERY_MAP: Record<string, RegistryType> = {
  dashboard: 'dashboard',
  disease: 'dashboard',
  registries: 'dashboard',
  melanoma: 'melanoma',
  psoriasis: 'psoriasis',
  acne: 'acne',
  isotretinoin: 'acne',
  chronic_therapy: 'chronic_therapy',
  'chronic-therapy': 'chronic_therapy',
  chronictherapy: 'chronic_therapy',
  alerts: 'alerts',
};

export function RegistryPage({ embedded = false, queryParamName = 'tab' }: RegistryPageProps = {}) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RegistryType>('dashboard');

  // Dashboard data
  const [dashboard, setDashboard] = useState<any>(null);

  // Registry data
  const [melanomaPatients, setMelanomaPatients] = useState<MelanomaRegistryPatient[]>([]);
  const [psoriasisPatients, setPsoriasisPatients] = useState<any[]>([]);
  const [acnePatients, setAcnePatients] = useState<any[]>([]);
  const [chronicTherapyPatients, setChronicTherapyPatients] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Selected patient for details
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [pasiHistory, setPasiHistory] = useState<any[]>([]);
  const [melanomaActionPatientId, setMelanomaActionPatientId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await fetchRegistryDashboard(session.tenantId, session.accessToken);
      setDashboard(data);
    } catch (err: any) {
      showError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadMelanoma = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchMelanomaRegistry(session.tenantId, session.accessToken);
      setMelanomaPatients(res.data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load melanoma registry');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadPsoriasis = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchPsoriasisRegistry(session.tenantId, session.accessToken);
      setPsoriasisPatients(res.data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load psoriasis registry');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadAcne = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchAcneRegistry(session.tenantId, session.accessToken, true);
      setAcnePatients(res.data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load acne registry');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadChronicTherapy = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchChronicTherapyRegistry(session.tenantId, session.accessToken);
      setChronicTherapyPatients(res.data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load chronic therapy registry');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadAlerts = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchRegistryAlerts(session.tenantId, session.accessToken);
      setAlerts(res.alerts || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadPasiHistoryForPatient = useCallback(async (patientId: string) => {
    if (!session) return;
    try {
      const res = await fetchPasiHistory(session.tenantId, session.accessToken, patientId);
      setPasiHistory(res.data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load PASI history');
    }
  }, [session, showError]);

  useEffect(() => {
    const requestedTab = searchParams.get(queryParamName);
    if (!requestedTab) return;

    const normalized = requestedTab.toLowerCase();
    const mappedTab = REGISTRY_TAB_QUERY_MAP[normalized];
    if (!mappedTab) return;

    if (mappedTab !== activeTab) {
      setActiveTab(mappedTab);
    }

    if (mappedTab !== normalized) {
      const params = new URLSearchParams(searchParams);
      params.set(queryParamName, mappedTab);
      setSearchParams(params, { replace: true });
    }
  }, [activeTab, queryParamName, searchParams, setSearchParams]);

  const setRegistryTab = useCallback((tab: RegistryType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set(queryParamName, tab);
    if (embedded) {
      params.set('tab', 'registry');
    }
    setSearchParams(params, { replace: true });
  }, [embedded, queryParamName, searchParams, setSearchParams]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboard();
    } else if (activeTab === 'melanoma') {
      loadMelanoma();
    } else if (activeTab === 'psoriasis') {
      loadPsoriasis();
    } else if (activeTab === 'acne') {
      loadAcne();
    } else if (activeTab === 'chronic_therapy') {
      loadChronicTherapy();
    } else if (activeTab === 'alerts') {
      loadAlerts();
    }
  }, [activeTab, loadDashboard, loadMelanoma, loadPsoriasis, loadAcne, loadChronicTherapy, loadAlerts]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const formatReminderType = (value: string | null | undefined) => {
    switch ((value || '').toLowerCase()) {
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
  };

  const formatDeliveryStatus = (value: string | null | undefined) => {
    switch ((value || '').toLowerCase()) {
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
        return value || '';
    }
  };

  const buildTelHref = (phone: string | null | undefined) => {
    const normalized = String(phone || '').replace(/[^\d+]/g, '');
    return normalized ? `tel:${normalized}` : undefined;
  };

  const getDaysUntil = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getSeverityBadgeColor = (score: number | null | undefined, maxScore: number) => {
    if (!score) return 'bg-gray-100 text-gray-800';
    const percent = (score / maxScore) * 100;
    if (percent < 25) return 'bg-green-100 text-green-800';
    if (percent < 50) return 'bg-yellow-100 text-yellow-800';
    if (percent < 75) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const toNumber = (value: unknown) => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  };

  const getRegistryCount = (registryType: RegistryType | 'acne') =>
    toNumber(dashboard?.registryCounts?.find((reg: any) => reg.registry_type === registryType)?.patient_count);

  const registrySummaryCards = dashboard ? [
    {
      id: 'melanoma' as RegistryType,
      title: 'Melanoma',
      count: toNumber(dashboard.registrySummaries?.melanoma?.totalPatients) || getRegistryCount('melanoma'),
      accent: '#0f766e',
      bg: '#f0fdfa',
      metrics: [
        { label: 'Due this week', value: toNumber(dashboard.registrySummaries?.melanoma?.followupsDue) },
        { label: 'Overdue', value: toNumber(dashboard.registrySummaries?.melanoma?.overdueFollowups) },
        { label: 'Need staging', value: toNumber(dashboard.registrySummaries?.melanoma?.unstagedPatients) },
      ],
    },
    {
      id: 'psoriasis' as RegistryType,
      title: 'Psoriasis',
      count: toNumber(dashboard.registrySummaries?.psoriasis?.totalPatients) || getRegistryCount('psoriasis'),
      accent: '#4338ca',
      bg: '#eef2ff',
      metrics: [
        { label: 'On biologic', value: toNumber(dashboard.registrySummaries?.psoriasis?.biologicPatients) },
        { label: 'Labs overdue', value: toNumber(dashboard.registrySummaries?.psoriasis?.labsOverdue) },
        { label: 'Missing PASI baseline', value: toNumber(dashboard.registrySummaries?.psoriasis?.missingBaselinePasi) },
      ],
    },
    {
      id: 'acne' as RegistryType,
      title: 'Acne / Isotretinoin',
      count: toNumber(dashboard.registrySummaries?.acne?.totalPatients) || getRegistryCount('acne'),
      accent: '#b45309',
      bg: '#fffbeb',
      metrics: [
        { label: 'iPLEDGE enrolled', value: toNumber(dashboard.registrySummaries?.acne?.ipledgeEnrolled) },
        { label: 'Pregnancy tests due', value: toNumber(dashboard.registrySummaries?.acne?.pregnancyTestsDue) },
        { label: 'Labs overdue', value: toNumber(dashboard.registrySummaries?.acne?.labsOverdue) },
      ],
    },
    {
      id: 'chronic_therapy' as RegistryType,
      title: 'Chronic Therapy',
      count: toNumber(dashboard.registrySummaries?.chronicTherapy?.totalPatients) || getRegistryCount('chronic_therapy'),
      accent: '#7c3aed',
      bg: '#faf5ff',
      metrics: [
        { label: 'Labs overdue', value: toNumber(dashboard.registrySummaries?.chronicTherapy?.labsOverdue) },
        { label: 'Labs due soon', value: toNumber(dashboard.registrySummaries?.chronicTherapy?.labsDueSoon) },
        { label: 'Biologic therapies', value: toNumber(dashboard.registrySummaries?.chronicTherapy?.biologicTherapies) },
      ],
    },
  ] : [];

  const actionCards = dashboard ? [
    {
      label: 'Melanoma follow-ups due',
      value: toNumber(dashboard.alerts?.melanomaDue),
      bg: '#fffbeb',
      border: '#fef3c7',
      color: '#92400e',
    },
    {
      label: 'Melanoma follow-ups overdue',
      value: toNumber(dashboard.alerts?.melanomaOverdue),
      bg: '#fef2f2',
      border: '#fecaca',
      color: '#991b1b',
    },
    {
      label: 'Registry labs overdue',
      value: toNumber(dashboard.alerts?.labsOverdue),
      bg: '#eef2ff',
      border: '#c7d2fe',
      color: '#3730a3',
    },
    {
      label: 'Pregnancy tests due',
      value: toNumber(dashboard.alerts?.pregnancyTestsDue),
      bg: '#faf5ff',
      border: '#ddd6fe',
      color: '#5b21b6',
    },
  ] : [];

  const qualityCards = dashboard ? [
    {
      label: 'Melanoma Staging Rate (MIPS 137)',
      value: `${toNumber(dashboard.qualityMetrics?.melanoma_staging_rate).toFixed(1)}%`,
    },
    {
      label: 'Psoriasis PASI Documentation (MIPS 485)',
      value: `${toNumber(dashboard.qualityMetrics?.psoriasis_pasi_rate).toFixed(1)}%`,
    },
    {
      label: 'Systemic Therapy Labs Compliance',
      value: `${toNumber(dashboard.qualityMetrics?.labs_compliance_rate).toFixed(1)}%`,
    },
    {
      label: 'Isotretinoin Monitoring Up to Date',
      value: `${toNumber(dashboard.qualityMetrics?.isotretinoin_monitoring_rate).toFixed(1)}%`,
    },
  ] : [];

  const getAlertAppearance = (alertType: string | null | undefined) => {
    switch (alertType) {
      case 'melanoma_followup_overdue':
      case 'psoriasis_labs_overdue':
      case 'chronic_therapy_labs_overdue':
      case 'isotretinoin_labs_overdue':
        return {
          borderLeft: '4px solid #dc2626',
          background: '#fef2f2',
          label: 'Overdue',
          color: '#991b1b',
        };
      case 'pregnancy_test_due':
        return {
          borderLeft: '4px solid #7c3aed',
          background: '#faf5ff',
          label: 'Due soon',
          color: '#5b21b6',
        };
      default:
        return {
          borderLeft: '4px solid #f59e0b',
          background: '#fffbeb',
          label: 'Needs review',
          color: '#92400e',
        };
    }
  };

  const handleSendMelanomaRecallSms = useCallback(async (patient: MelanomaRegistryPatient) => {
    if (!session) return;
    if (!patient.recall_id) {
      showError('No melanoma recall is linked for this patient yet');
      return;
    }

    setMelanomaActionPatientId(patient.patient_id);
    try {
      await recordRecallContact(session.tenantId, session.accessToken, patient.recall_id, {
        contactMethod: 'sms',
        notes: 'Melanoma registry SMS sent from disease registry',
        messageContent: defaultMelanomaRecallSms,
      });
      showSuccess(`Recall SMS sent to ${patient.patient_name}`);
      await loadMelanoma();
    } catch (err: any) {
      showError(err.message || 'Failed to send melanoma recall SMS');
    } finally {
      setMelanomaActionPatientId(null);
    }
  }, [loadMelanoma, session, showError, showSuccess]);

  return (
    <div className={embedded ? 'registry-embedded' : 'content-card'}>
      <div className="section-header">
        <div>
          <div className="eyebrow">Disease Registry System</div>
          {embedded ? <h2>Patient Registries</h2> : <h1>Patient Registries</h1>}
          <p className="muted">
            Track disease-specific cohorts, outcomes, and quality metrics for dermatology conditions.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '2rem', padding: '0 1.5rem' }}>
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'melanoma', label: 'Melanoma' },
            { id: 'psoriasis', label: 'Psoriasis' },
            { id: 'acne', label: 'Acne/Isotretinoin' },
            { id: 'chronic_therapy', label: 'Chronic Therapy' },
            { id: 'alerts', label: 'Alerts' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRegistryTab(tab.id as RegistryType)}
              style={{
                padding: '1rem 0',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                color: activeTab === tab.id ? '#2563eb' : '#6b7280',
                fontWeight: activeTab === tab.id ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading dashboard...</p>
          ) : dashboard ? (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Registry Overview
                </h2>
                <p className="muted" style={{ marginBottom: '1rem' }}>
                  These counts are pulled from the live disease registry tables, so they match the registry tabs below.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  {registrySummaryCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => setRegistryTab(card.id)}
                      style={{
                        padding: '1.25rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        background: '#fff',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.35rem' }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111827' }}>
                            {card.count}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>active patients</div>
                        </div>
                        <div
                          style={{
                            alignSelf: 'flex-start',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '999px',
                            background: card.bg,
                            color: card.accent,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          Open
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: '0.55rem' }}>
                        {card.metrics.map((metric) => (
                          <div
                            key={metric.label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            <span style={{ color: '#6b7280' }}>{metric.label}</span>
                            <span style={{ color: '#111827', fontWeight: 600 }}>{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Registry Dashboards
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                  {registrySummaryCards.map((card) => (
                    <div
                      key={`${card.id}-dashboard`}
                      style={{
                        border: `1px solid ${card.bg === '#fff' ? '#e5e7eb' : card.bg}`,
                        borderRadius: '10px',
                        background: card.bg,
                        padding: '1.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{card.title}</div>
                        <button
                          onClick={() => setRegistryTab(card.id)}
                          className="ghost"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                        >
                          Open
                        </button>
                      </div>
                      <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {card.metrics.map((metric) => (
                          <div
                            key={`${card.id}-${metric.label}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              padding: '0.55rem 0.7rem',
                              borderRadius: '8px',
                              background: '#fff',
                            }}
                          >
                            <span style={{ color: '#4b5563', fontSize: '0.875rem' }}>{metric.label}</span>
                            <span style={{ color: card.accent, fontWeight: 700 }}>{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Action Items</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {actionCards.map((card) => (
                    <div
                      key={card.label}
                      style={{ padding: '1rem', border: `1px solid ${card.border}`, borderRadius: '8px', background: card.bg }}
                    >
                      <div style={{ fontSize: '0.875rem', color: card.color, marginBottom: '0.5rem' }}>
                        {card.label}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: card.color }}>
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => setRegistryTab('alerts')}
                    className="ghost"
                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.875rem' }}
                  >
                    Open Alerts
                  </button>
                </div>
              </div>

              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Quality Metrics (MIPS)
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {qualityCards.map((metric) => (
                    <div key={metric.label} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        {metric.label}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No data available" description="Dashboard data will appear once registries are populated." />
          )}
        </div>
      )}

      {/* Melanoma Registry Tab */}
      {activeTab === 'melanoma' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading melanoma registry...</p>
          ) : melanomaPatients.length === 0 ? (
            <EmptyState
              title="No melanoma patients"
              description="Melanoma patients will appear here once they are added to the registry."
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Diagnosis Date</th>
                    <th>AJCC Stage</th>
                    <th>Breslow Depth</th>
                    <th>Sentinel Node</th>
                    <th>Next Exam</th>
                    <th>Status</th>
                    <th>Outreach</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {melanomaPatients.map((patient) => {
                    const daysUntil = getDaysUntil(patient.next_scheduled_exam);
                    const isOverdue = daysUntil !== null && daysUntil < 0;
                    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;
                    const telHref = buildTelHref(patient.phone);
                    const hasTextThread = Boolean(patient.text_thread_id);
                    const isSendingSms = melanomaActionPatientId === patient.patient_id;

                    return (
                      <tr key={patient.id}>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {patient.patient_name}
                          </Link>
                          <div className="muted tiny">{patient.email || formatPhoneDisplay(patient.phone) || 'No contact on file'}</div>
                        </td>
                        <td>{patient.mrn}</td>
                        <td>{formatDate(patient.diagnosis_date)}</td>
                        <td>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: patient.ajcc_stage ? '#dbeafe' : '#f3f4f6',
                              color: patient.ajcc_stage ? '#1e40af' : '#6b7280',
                            }}
                          >
                            {patient.ajcc_stage || 'Not staged'}
                          </span>
                        </td>
                        <td>{patient.breslow_depth_mm ? `${patient.breslow_depth_mm}mm` : '--'}</td>
                        <td>
                          {patient.sentinel_node_biopsy_performed
                            ? patient.sentinel_node_status || 'Unknown'
                            : 'Not performed'}
                        </td>
                        <td>
                          <span style={{ color: isOverdue ? '#dc2626' : isDueSoon ? '#f59e0b' : '#6b7280' }}>
                            {formatDate(patient.next_scheduled_exam)}
                            {daysUntil !== null && (
                              <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                ({daysUntil > 0 ? `in ${daysUntil}d` : `${Math.abs(daysUntil)}d overdue`})
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: patient.recurrence_status === 'no_recurrence' ? '#d1fae5' : '#fee2e2',
                              color: patient.recurrence_status === 'no_recurrence' ? '#065f46' : '#991b1b',
                            }}
                          >
                            {patient.recurrence_status?.replace('_', ' ') || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          {patient.last_reminder_type ? (
                            <>
                              <span
                                className="pill"
                                style={{
                                  background:
                                    patient.last_reminder_delivery_status === 'failed' || patient.last_reminder_delivery_status === 'bounced'
                                      ? '#fee2e2'
                                      : patient.last_reminder_type === 'sms'
                                        ? '#dbeafe'
                                        : '#f3f4f6',
                                  color:
                                    patient.last_reminder_delivery_status === 'failed' || patient.last_reminder_delivery_status === 'bounced'
                                      ? '#991b1b'
                                      : patient.last_reminder_type === 'sms'
                                        ? '#1d4ed8'
                                        : '#4b5563',
                                }}
                              >
                                {formatReminderType(patient.last_reminder_type)}
                              </span>
                              <div className="muted tiny" style={{ marginTop: '0.35rem' }}>
                                {formatDateTime(patient.last_reminder_sent_at)}
                                {patient.last_reminder_delivery_status ? ` • ${formatDeliveryStatus(patient.last_reminder_delivery_status)}` : ''}
                              </div>
                            </>
                          ) : (
                            <div className="muted tiny">No outreach sent yet</div>
                          )}
                          <div className="muted tiny" style={{ marginTop: '0.35rem' }}>
                            {patient.contact_attempts || 0} attempt(s)
                            {patient.recall_status ? ` • Recall ${patient.recall_status}` : ''}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <Link className="btn-sm" to={`/text-messages?patientId=${patient.patient_id}`}>
                              {hasTextThread ? 'Open Text' : 'Text Patient'}
                            </Link>
                            {patient.recall_id && (
                              <button
                                type="button"
                                className="btn-sm btn-primary"
                                onClick={() => handleSendMelanomaRecallSms(patient)}
                                disabled={isSendingSms || !patient.phone}
                                title={!patient.phone ? 'Patient has no phone number' : undefined}
                              >
                                {isSendingSms ? 'Sending...' : 'Send Recall SMS'}
                              </button>
                            )}
                            {telHref && (
                              <a className="btn-sm btn-secondary" href={telHref}>
                                Call
                              </a>
                            )}
                            <Link to={`/patients/${patient.patient_id}`} className="btn-sm btn-secondary">
                              Chart
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Psoriasis Registry Tab */}
      {activeTab === 'psoriasis' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading psoriasis registry...</p>
          ) : psoriasisPatients.length === 0 ? (
            <EmptyState
              title="No psoriasis patients"
              description="Psoriasis patients will appear here once they are added to the registry."
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Type</th>
                    <th>Current PASI</th>
                    <th>BSA %</th>
                    <th>DLQI</th>
                    <th>Treatment</th>
                    <th>Biologic</th>
                    <th>Next Labs</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {psoriasisPatients.map((patient) => {
                    const daysUntil = getDaysUntil(patient.next_lab_due);
                    const isOverdue = daysUntil !== null && daysUntil < 0;

                    return (
                      <tr key={patient.id}>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {patient.patient_name}
                          </Link>
                        </td>
                        <td>{patient.mrn}</td>
                        <td>{patient.psoriasis_type || '--'}</td>
                        <td>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                            }}
                            className={getSeverityBadgeColor(patient.current_pasi_score, 72)}
                          >
                            {patient.current_pasi_score?.toFixed(1) || '--'}
                          </span>
                        </td>
                        <td>{patient.current_bsa_percent?.toFixed(1) || '--'}%</td>
                        <td>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                            }}
                            className={getSeverityBadgeColor(patient.current_dlqi_score, 30)}
                          >
                            {patient.current_dlqi_score || '--'}
                          </span>
                        </td>
                        <td>{patient.current_treatment_type?.replace('_', ' ') || '--'}</td>
                        <td>{patient.biologic_name || '--'}</td>
                        <td>
                          <span style={{ color: isOverdue ? '#dc2626' : '#6b7280' }}>
                            {formatDate(patient.next_lab_due)}
                            {daysUntil !== null && isOverdue && (
                              <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                ({Math.abs(daysUntil)}d overdue)
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ghost"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                            onClick={() => {
                              setSelectedPatient(patient);
                              loadPasiHistoryForPatient(patient.patient_id);
                            }}
                          >
                            PASI History
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Acne/Isotretinoin Registry Tab */}
      {activeTab === 'acne' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading acne registry...</p>
          ) : acnePatients.length === 0 ? (
            <EmptyState
              title="No patients on isotretinoin"
              description="Patients on isotretinoin will appear here for iPLEDGE tracking."
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Sex</th>
                    <th>iPLEDGE ID</th>
                    <th>Start Date</th>
                    <th>Next Preg Test</th>
                    <th>Next Labs</th>
                    <th>Cumulative Dose</th>
                    <th>Response</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {acnePatients.map((patient) => {
                    const pregDaysUntil = getDaysUntil(patient.next_pregnancy_test_due);
                    const labDaysUntil = getDaysUntil(patient.next_lab_due);
                    const isPregOverdue = pregDaysUntil !== null && pregDaysUntil < 0;
                    const isLabOverdue = labDaysUntil !== null && labDaysUntil < 0;

                    return (
                      <tr key={patient.id}>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {patient.patient_name}
                          </Link>
                        </td>
                        <td>{patient.mrn}</td>
                        <td>{patient.sex}</td>
                        <td>{patient.ipledge_id || 'Not enrolled'}</td>
                        <td>{formatDate(patient.isotretinoin_start_date)}</td>
                        <td>
                          {patient.pregnancy_category === 'can_get_pregnant' ? (
                            <span style={{ color: isPregOverdue ? '#dc2626' : '#6b7280' }}>
                              {formatDate(patient.next_pregnancy_test_due)}
                              {pregDaysUntil !== null && isPregOverdue && (
                                <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                  (OVERDUE)
                                </span>
                              )}
                            </span>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>
                          <span style={{ color: isLabOverdue ? '#dc2626' : '#6b7280' }}>
                            {formatDate(patient.next_lab_due)}
                          </span>
                        </td>
                        <td>
                          {patient.cumulative_dose_mg && patient.target_cumulative_dose_mg
                            ? `${patient.cumulative_dose_mg}/${patient.target_cumulative_dose_mg}mg`
                            : '--'}
                        </td>
                        <td>{patient.treatment_response || '--'}</td>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} className="ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Chronic Therapy Registry Tab */}
      {activeTab === 'chronic_therapy' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading chronic therapy registry...</p>
          ) : chronicTherapyPatients.length === 0 ? (
            <EmptyState
              title="No patients on chronic therapy"
              description="Patients on long-term systemic therapy will appear here."
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Diagnosis</th>
                    <th>Medication</th>
                    <th>Class</th>
                    <th>Dose</th>
                    <th>Start Date</th>
                    <th>Lab Frequency</th>
                    <th>Next Labs</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chronicTherapyPatients.map((patient) => {
                    const daysUntil = getDaysUntil(patient.next_lab_due);
                    const isOverdue = daysUntil !== null && daysUntil < 0;
                    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 14;

                    return (
                      <tr key={patient.id}>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {patient.patient_name}
                          </Link>
                        </td>
                        <td>{patient.mrn}</td>
                        <td>{patient.primary_diagnosis?.replace('_', ' ') || '--'}</td>
                        <td>{patient.medication_name}</td>
                        <td>{patient.medication_class?.replace('_', ' ') || '--'}</td>
                        <td>{patient.current_dose || '--'}</td>
                        <td>{formatDate(patient.start_date)}</td>
                        <td>{patient.lab_frequency?.replace('_', ' ') || '--'}</td>
                        <td>
                          <span
                            style={{
                              color: isOverdue ? '#dc2626' : isDueSoon ? '#f59e0b' : '#6b7280',
                              fontWeight: isOverdue || isDueSoon ? '600' : '400',
                            }}
                          >
                            {formatDate(patient.next_lab_due)}
                            {daysUntil !== null && (
                              <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                {isOverdue
                                  ? `(${Math.abs(daysUntil)}d overdue)`
                                  : isDueSoon
                                  ? `(due in ${daysUntil}d)`
                                  : ''}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} className="ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div style={{ padding: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading alerts...</p>
          ) : alerts.length === 0 ? (
            <EmptyState title="No alerts" description="All registry items are up to date." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {alerts.map((alert, index) => (
                <div
                  key={index}
                  style={{
                    padding: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    borderLeft: getAlertAppearance(alert.alert_type).borderLeft,
                    background: getAlertAppearance(alert.alert_type).background,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: '600' }}>{alert.patient_name}</div>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: getAlertAppearance(alert.alert_type).color,
                            background: '#fff',
                          }}
                        >
                          {getAlertAppearance(alert.alert_type).label}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        MRN: {alert.mrn}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#111827' }}>{alert.alert_message}</div>
                      {alert.medication_name && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Medication: {alert.medication_name}
                        </div>
                      )}
                      {(alert.next_scheduled_exam || alert.next_lab_due || alert.next_pregnancy_test_due) && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Due: {formatDate(alert.next_scheduled_exam || alert.next_lab_due || alert.next_pregnancy_test_due)}
                        </div>
                      )}
                    </div>
                    <Link
                      to={`/patients/${alert.patient_id}`}
                      className="ghost"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      View Patient
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PASI History Modal */}
      {selectedPatient && (
        <Modal
          isOpen={!!selectedPatient}
          onClose={() => {
            setSelectedPatient(null);
            setPasiHistory([]);
          }}
          title={`PASI Score History - ${selectedPatient.patient_name}`}
        >
          <div>
            {pasiHistory.length === 0 ? (
              <p className="muted">No PASI score history available.</p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>PASI</th>
                      <th>BSA %</th>
                      <th>PGA</th>
                      <th>DLQI</th>
                      <th>Itch (0-10)</th>
                      <th>Treatment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasiHistory.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.assessment_date)}</td>
                        <td>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                            }}
                            className={getSeverityBadgeColor(record.pasi_score, 72)}
                          >
                            {record.pasi_score?.toFixed(1) || '--'}
                          </span>
                        </td>
                        <td>{record.bsa_percent?.toFixed(1) || '--'}</td>
                        <td>{record.pga_score || '--'}</td>
                        <td>{record.dlqi_score || '--'}</td>
                        <td>{record.itch_severity || '--'}</td>
                        <td>{record.treatment_at_time || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
