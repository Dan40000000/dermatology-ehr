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
} from '../api';
import { Link } from 'react-router-dom';

type RegistryType = 'dashboard' | 'melanoma' | 'psoriasis' | 'acne' | 'chronic_therapy' | 'alerts';

export function RegistryPage() {
  const { session } = useAuth();
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RegistryType>('dashboard');

  // Dashboard data
  const [dashboard, setDashboard] = useState<any>(null);

  // Registry data
  const [melanomaPatients, setMelanomaPatients] = useState<any[]>([]);
  const [psoriasisPatients, setPsoriasisPatients] = useState<any[]>([]);
  const [acnePatients, setAcnePatients] = useState<any[]>([]);
  const [chronicTherapyPatients, setChronicTherapyPatients] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Selected patient for details
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [pasiHistory, setPasiHistory] = useState<any[]>([]);

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

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Disease Registry System</div>
          <h1>Patient Registries</h1>
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
              onClick={() => setActiveTab(tab.id as RegistryType)}
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
              {/* Registry Counts */}
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Registry Overview
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  {dashboard.registryCounts?.map((reg: any) => (
                    <div
                      key={reg.registry_type}
                      style={{
                        padding: '1.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#fff',
                      }}
                    >
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        {reg.name}
                      </div>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111827' }}>
                        {reg.patient_count}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>patients</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alerts Summary */}
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Action Items</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div style={{ padding: '1rem', border: '1px solid #fef3c7', borderRadius: '8px', background: '#fffbeb' }}>
                    <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem' }}>
                      Melanoma Follow-ups Due
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#92400e' }}>
                      {dashboard.alerts?.melanomaDue || 0}
                    </div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2' }}>
                    <div style={{ fontSize: '0.875rem', color: '#991b1b', marginBottom: '0.5rem' }}>
                      Labs Overdue
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#991b1b' }}>
                      {dashboard.alerts?.labsOverdue || 0}
                    </div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid #ddd6fe', borderRadius: '8px', background: '#faf5ff' }}>
                    <div style={{ fontSize: '0.875rem', color: '#5b21b6', marginBottom: '0.5rem' }}>
                      Pregnancy Tests Due
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#5b21b6' }}>
                      {dashboard.alerts?.pregnancyTestsDue || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quality Metrics */}
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                  Quality Metrics (MIPS)
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Melanoma Staging Rate (MIPS 137)
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                      {dashboard.qualityMetrics?.melanoma_staging_rate?.toFixed(1) || 0}%
                    </div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Psoriasis PASI Documentation (MIPS 485)
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                      {dashboard.qualityMetrics?.psoriasis_pasi_rate?.toFixed(1) || 0}%
                    </div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Systemic Therapy Labs Compliance
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                      {dashboard.qualityMetrics?.labs_compliance_rate?.toFixed(1) || 0}%
                    </div>
                  </div>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {melanomaPatients.map((patient) => {
                    const daysUntil = getDaysUntil(patient.next_scheduled_exam);
                    const isOverdue = daysUntil !== null && daysUntil < 0;
                    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;

                    return (
                      <tr key={patient.id}>
                        <td>
                          <Link to={`/patients/${patient.patient_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                            {patient.patient_name}
                          </Link>
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
                    borderLeft: alert.alert_type === 'labs_overdue' ? '4px solid #dc2626' : '4px solid #f59e0b',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{alert.patient_name}</div>
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
