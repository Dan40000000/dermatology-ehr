import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchPriorAuths,
  createPriorAuth,
  updatePriorAuth,
  submitPriorAuth,
  uploadPriorAuthDocument,
  checkPriorAuthStatus,
  fetchPatients,
} from '../api';
import '../styles/prior-auth.css';

interface PriorAuth {
  id: string;
  auth_number: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  medication_name: string;
  diagnosis_code: string;
  insurance_name: string;
  status: 'draft' | 'pending' | 'submitted' | 'approved' | 'denied' | 'more_info_needed';
  urgency: 'routine' | 'urgent' | 'stat';
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  denied_at: string | null;
  insurance_auth_number: string | null;
  denial_reason: string | null;
  provider_name: string;
  notes: string | null;
  clinical_justification: string;
  provider_npi: string;
}

interface StatusTimeline {
  date: string;
  event: string;
  status: 'completed' | 'in_progress' | 'action_required';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; description: string }> = {
  draft: { label: 'Draft', color: '#6b7280', bgColor: '#f3f4f6', description: 'Awaiting completion' },
  pending: { label: 'Pending Review', color: '#d97706', bgColor: '#fef3c7', description: 'Ready for submission' },
  submitted: { label: 'Submitted', color: '#2563eb', bgColor: '#dbeafe', description: 'Sent to payer' },
  approved: { label: 'Approved', color: '#059669', bgColor: '#d1fae5', description: 'Authorization granted' },
  denied: { label: 'Denied', color: '#dc2626', bgColor: '#fee2e2', description: 'Request denied' },
  more_info_needed: { label: 'Info Needed', color: '#ea580c', bgColor: '#ffedd5', description: 'Additional info required' },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  routine: { label: 'Routine', color: '#6b7280', bgColor: '#f3f4f6' },
  urgent: { label: 'Urgent', color: '#d97706', bgColor: '#fef3c7' },
  stat: { label: 'STAT', color: '#dc2626', bgColor: '#fee2e2' },
};

export function PriorAuthPage() {
  const { session } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  const [priorAuths, setPriorAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPA, setSelectedPA] = useState<PriorAuth | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (session) {
      loadPriorAuths();
    }
  }, [session]);

  const loadPriorAuths = async () => {
    if (!session) return;

    try {
      setLoading(true);
      const data = await fetchPriorAuths(session.tenantId, session.accessToken, {});
      setPriorAuths(data || []);
    } catch (error) {
      console.error('Failed to load prior authorizations:', error);
      showError('Failed to load prior authorizations');
    } finally {
      setLoading(false);
    }
  };

  // Filter PAs by status and search term
  const filteredPAs = priorAuths.filter((pa) => {
    const matchesStatus = selectedStatus === 'all' || pa.status === selectedStatus;
    const matchesSearch =
      searchTerm === '' ||
      `${pa.first_name} ${pa.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pa.medication_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pa.auth_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pa.insurance_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Calculate status counts
  const statusCounts = {
    all: priorAuths.length,
    draft: priorAuths.filter((pa) => pa.status === 'draft').length,
    pending: priorAuths.filter((pa) => pa.status === 'pending').length,
    submitted: priorAuths.filter((pa) => pa.status === 'submitted').length,
    approved: priorAuths.filter((pa) => pa.status === 'approved').length,
    denied: priorAuths.filter((pa) => pa.status === 'denied').length,
    more_info_needed: priorAuths.filter((pa) => pa.status === 'more_info_needed').length,
  };

  // Count items needing attention
  const needsAttention = statusCounts.pending + statusCounts.more_info_needed;

  const handleQuickSubmit = async (pa: PriorAuth, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Submit PA ${pa.auth_number} for ${pa.first_name} ${pa.last_name}?`)) return;

    try {
      await submitPriorAuth(session!.tenantId, session!.accessToken, pa.id);
      showSuccess('Prior authorization submitted to payer');
      loadPriorAuths();
    } catch (err: any) {
      showError(err.message || 'Failed to submit');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getDaysWaiting = (pa: PriorAuth) => {
    if (pa.status === 'approved' || pa.status === 'denied') return null;
    if (!pa.submitted_at) return null;
    const submitted = new Date(pa.submitted_at);
    const now = new Date();
    return Math.floor((now.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="epa-page">
        <div className="epa-loading">
          <div className="epa-spinner"></div>
          <p>Loading prior authorizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="epa-page">
      {/* Page Header */}
      <div className="epa-header">
        <div className="epa-header-content">
          <div className="epa-header-text">
            <h1>Electronic Prior Authorization</h1>
            <p>Manage medication prior authorization requests</p>
          </div>
          <button className="epa-btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New PA Request
          </button>
        </div>
      </div>

      {/* Attention Banner */}
      {needsAttention > 0 && (
        <div className="epa-attention-banner">
          <div className="epa-attention-icon">!</div>
          <div className="epa-attention-text">
            <strong>{needsAttention} request{needsAttention > 1 ? 's' : ''} need{needsAttention === 1 ? 's' : ''} attention</strong>
            <span>{statusCounts.pending} pending review, {statusCounts.more_info_needed} need additional info</span>
          </div>
          <button
            className="epa-attention-btn"
            onClick={() => setSelectedStatus('pending')}
          >
            Review Now
          </button>
        </div>
      )}

      {/* Status Filter Cards */}
      <div className="epa-status-cards">
        <div
          className={`epa-status-card ${selectedStatus === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedStatus('all')}
        >
          <div className="epa-status-card-count">{statusCounts.all}</div>
          <div className="epa-status-card-label">All Requests</div>
        </div>
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <div
            key={key}
            className={`epa-status-card ${selectedStatus === key ? 'active' : ''}`}
            onClick={() => setSelectedStatus(key)}
            style={{
              '--status-color': config.color,
              '--status-bg': config.bgColor,
            } as React.CSSProperties}
          >
            <div className="epa-status-card-count" style={{ color: config.color }}>
              {statusCounts[key as keyof typeof statusCounts]}
            </div>
            <div className="epa-status-card-label">{config.label}</div>
            {(key === 'pending' || key === 'more_info_needed') && statusCounts[key as keyof typeof statusCounts] > 0 && (
              <div className="epa-status-card-badge">Action</div>
            )}
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="epa-toolbar">
        <div className="epa-search">
          <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by patient, medication, PA#, or insurance..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="epa-search-clear" onClick={() => setSearchTerm('')}>
              X
            </button>
          )}
        </div>
        <div className="epa-toolbar-info">
          Showing {filteredPAs.length} of {priorAuths.length} requests
        </div>
      </div>

      {/* PA List */}
      <div className="epa-list-container">
        {filteredPAs.length === 0 ? (
          <div className="epa-empty-state">
            <div className="epa-empty-icon">
              <svg style={{ width: '64px', height: '64px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3>{searchTerm ? 'No matching requests' : 'No prior authorization requests'}</h3>
            <p>{searchTerm ? 'Try a different search term' : 'Create a new PA request to get started'}</p>
            {!searchTerm && (
              <button className="epa-btn-primary" onClick={() => setShowCreateModal(true)}>
                Create First Request
              </button>
            )}
          </div>
        ) : (
          <div className="epa-table-wrapper">
            <table className="epa-table">
              <thead>
                <tr>
                  <th>PA #</th>
                  <th>Patient</th>
                  <th>Medication</th>
                  <th>Insurance</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPAs.map((pa) => {
                  const statusConfig = STATUS_CONFIG[pa.status];
                  const urgencyConfig = URGENCY_CONFIG[pa.urgency];
                  const daysWaiting = getDaysWaiting(pa);

                  return (
                    <tr
                      key={pa.id}
                      onClick={() => {
                        setSelectedPA(pa);
                        setShowDetailModal(true);
                      }}
                    >
                      <td>
                        <div className="epa-cell-pa-number">
                          <span className="epa-pa-number">{pa.auth_number}</span>
                          {daysWaiting !== null && daysWaiting > 3 && (
                            <span className="epa-days-badge" title={`Waiting ${daysWaiting} days`}>
                              {daysWaiting}d
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="epa-cell-patient">
                          <span className="epa-patient-name">{pa.first_name} {pa.last_name}</span>
                          <span className="epa-patient-provider">{pa.provider_name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="epa-cell-medication">
                          <span className="epa-medication-name">{pa.medication_name}</span>
                          <span className="epa-diagnosis-code">{pa.diagnosis_code}</span>
                        </div>
                      </td>
                      <td>
                        <span className="epa-insurance">{pa.insurance_name}</span>
                      </td>
                      <td>
                        <span
                          className="epa-urgency-badge"
                          style={{
                            color: urgencyConfig.color,
                            backgroundColor: urgencyConfig.bgColor,
                          }}
                        >
                          {urgencyConfig.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className="epa-status-badge"
                          style={{
                            color: statusConfig.color,
                            backgroundColor: statusConfig.bgColor,
                          }}
                        >
                          {statusConfig.label}
                        </span>
                      </td>
                      <td>
                        <span className="epa-date">{formatDate(pa.created_at)}</span>
                      </td>
                      <td>
                        <div className="epa-actions" onClick={(e) => e.stopPropagation()}>
                          {(pa.status === 'draft' || pa.status === 'pending' || pa.status === 'more_info_needed') && (
                            <button
                              className="epa-action-btn submit"
                              onClick={(e) => handleQuickSubmit(pa, e)}
                              title="Submit to Payer"
                            >
                              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                            </button>
                          )}
                          <button
                            className="epa-action-btn view"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPA(pa);
                              setShowDetailModal(true);
                            }}
                            title="View Details"
                          >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
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

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePAModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadPriorAuths();
            showSuccess('Prior authorization created successfully');
          }}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedPA && (
        <DetailPAModal
          pa={selectedPA}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPA(null);
          }}
          onUpdate={() => {
            loadPriorAuths();
            showSuccess('Prior authorization updated');
          }}
        />
      )}
    </div>
  );
}

// Create PA Modal Component
function CreatePAModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [patients, setPatients] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    patientId: '',
    medicationName: '',
    diagnosisCode: '',
    insuranceName: '',
    providerNpi: '',
    clinicalJustification: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'stat',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    if (!session) return;
    try {
      setLoadingPatients(true);
      const data = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(Array.isArray(data) ? data : data?.patients || []);
    } catch (err) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.patientId) {
      setError('Please select a patient');
      return;
    }

    if (!formData.clinicalJustification || formData.clinicalJustification.length < 10) {
      setError('Clinical justification must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      await createPriorAuth(session!.tenantId, session!.accessToken, formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create prior authorization');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPatient = patients.find((p) => p.id === formData.patientId);

  const canProceedStep1 = formData.patientId && formData.medicationName && formData.diagnosisCode;
  const canProceedStep2 = formData.insuranceName && formData.providerNpi;

  return (
    <div className="epa-modal-overlay" onClick={onClose}>
      <div className="epa-modal" onClick={(e) => e.stopPropagation()}>
        <div className="epa-modal-header">
          <h2>New Prior Authorization Request</h2>
          <button className="epa-modal-close" onClick={onClose}>
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="epa-modal-steps">
          <div className={`epa-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
            <div className="epa-step-number">{step > 1 ? '' : '1'}</div>
            <div className="epa-step-label">Patient & Medication</div>
          </div>
          <div className="epa-step-line"></div>
          <div className={`epa-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
            <div className="epa-step-number">{step > 2 ? '' : '2'}</div>
            <div className="epa-step-label">Insurance & Provider</div>
          </div>
          <div className="epa-step-line"></div>
          <div className={`epa-step ${step >= 3 ? 'active' : ''}`}>
            <div className="epa-step-number">3</div>
            <div className="epa-step-label">Clinical Justification</div>
          </div>
        </div>

        {error && <div className="epa-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="epa-modal-form">
          {/* Step 1: Patient & Medication */}
          {step === 1 && (
            <div className="epa-form-step">
              <div className="epa-form-group">
                <label>Select Patient <span className="required">*</span></label>
                {loadingPatients ? (
                  <div className="epa-loading-inline">Loading patients...</div>
                ) : (
                  <select
                    value={formData.patientId}
                    onChange={(e) => {
                      const patient = patients.find((p) => p.id === e.target.value);
                      setFormData({
                        ...formData,
                        patientId: e.target.value,
                        insuranceName: patient?.insurance || formData.insuranceName,
                      });
                    }}
                  >
                    <option value="">Choose a patient...</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName || p.first_name} {p.lastName || p.last_name} - DOB: {new Date(p.dateOfBirth || p.date_of_birth).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="epa-form-group">
                <label>Medication Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.medicationName}
                  onChange={(e) => setFormData({ ...formData, medicationName: e.target.value })}
                  placeholder="e.g., Dupixent, Humira, Accutane"
                />
                <div className="epa-form-hint">
                  Common dermatology biologics: Dupixent, Humira, Enbrel, Cosentyx, Taltz, Skyrizi, Tremfya
                </div>
              </div>

              <div className="epa-form-group">
                <label>Diagnosis Code (ICD-10) <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.diagnosisCode}
                  onChange={(e) => setFormData({ ...formData, diagnosisCode: e.target.value })}
                  placeholder="e.g., L20.9, L40.0"
                />
                <div className="epa-form-hint">
                  Common codes: L20.9 (Atopic dermatitis), L40.0 (Psoriasis vulgaris), L40.5 (Psoriatic arthritis)
                </div>
              </div>

              <div className="epa-form-group">
                <label>Urgency <span className="required">*</span></label>
                <div className="epa-urgency-options">
                  {Object.entries(URGENCY_CONFIG).map(([key, config]) => (
                    <label
                      key={key}
                      className={`epa-urgency-option ${formData.urgency === key ? 'selected' : ''}`}
                      style={{ '--urgency-color': config.color } as React.CSSProperties}
                    >
                      <input
                        type="radio"
                        name="urgency"
                        value={key}
                        checked={formData.urgency === key}
                        onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
                      />
                      <span className="epa-urgency-label">{config.label}</span>
                      <span className="epa-urgency-time">
                        {key === 'routine' ? '72 hours' : key === 'urgent' ? '24 hours' : 'Same day'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Insurance & Provider */}
          {step === 2 && (
            <div className="epa-form-step">
              {selectedPatient && (
                <div className="epa-patient-summary">
                  <div className="epa-patient-summary-header">Selected Patient</div>
                  <div className="epa-patient-summary-content">
                    <strong>{selectedPatient.firstName || selectedPatient.first_name} {selectedPatient.lastName || selectedPatient.last_name}</strong>
                    <span>Medication: {formData.medicationName}</span>
                    <span>Diagnosis: {formData.diagnosisCode}</span>
                  </div>
                </div>
              )}

              <div className="epa-form-group">
                <label>Insurance Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.insuranceName}
                  onChange={(e) => setFormData({ ...formData, insuranceName: e.target.value })}
                  placeholder="e.g., United Healthcare, Cigna, Aetna"
                />
              </div>

              <div className="epa-form-group">
                <label>Provider NPI <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.providerNpi}
                  onChange={(e) => setFormData({ ...formData, providerNpi: e.target.value })}
                  placeholder="10-digit NPI number"
                  maxLength={10}
                />
                <div className="epa-form-hint">
                  The 10-digit National Provider Identifier for the prescribing provider
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Clinical Justification */}
          {step === 3 && (
            <div className="epa-form-step">
              <div className="epa-request-summary">
                <h4>Request Summary</h4>
                <div className="epa-summary-grid">
                  <div className="epa-summary-item">
                    <span className="label">Patient</span>
                    <span className="value">{selectedPatient?.firstName || selectedPatient?.first_name} {selectedPatient?.lastName || selectedPatient?.last_name}</span>
                  </div>
                  <div className="epa-summary-item">
                    <span className="label">Medication</span>
                    <span className="value">{formData.medicationName}</span>
                  </div>
                  <div className="epa-summary-item">
                    <span className="label">Diagnosis</span>
                    <span className="value">{formData.diagnosisCode}</span>
                  </div>
                  <div className="epa-summary-item">
                    <span className="label">Insurance</span>
                    <span className="value">{formData.insuranceName}</span>
                  </div>
                </div>
              </div>

              <div className="epa-form-group">
                <label>Clinical Justification <span className="required">*</span></label>
                <textarea
                  value={formData.clinicalJustification}
                  onChange={(e) => setFormData({ ...formData, clinicalJustification: e.target.value })}
                  placeholder="Explain medical necessity including:&#10;- Failed prior treatments&#10;- Disease severity and impact&#10;- Specific clinical findings&#10;- Why this medication is appropriate"
                  rows={8}
                />
                <div className="epa-form-hint">
                  <strong>Tips for approval:</strong> Include specific details about failed treatments,
                  disease severity scores (PASI, BSA, IGA), quality of life impact, and contraindications to alternatives.
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="epa-modal-footer">
            {step > 1 && (
              <button type="button" className="epa-btn-secondary" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                className="epa-btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              >
                Continue
              </button>
            )}
            {step === 3 && (
              <>
                <button type="button" className="epa-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="epa-btn-primary"
                  disabled={submitting || !formData.clinicalJustification}
                >
                  {submitting ? 'Creating...' : 'Create PA Request'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// Detail PA Modal Component
function DetailPAModal({
  pa,
  onClose,
  onUpdate,
}: {
  pa: PriorAuth;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { session } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'history'>('details');
  const [updating, setUpdating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [updateData, setUpdateData] = useState({
    status: pa.status,
    insuranceAuthNumber: pa.insurance_auth_number || '',
    denialReason: pa.denial_reason || '',
    notes: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('clinical_notes');
  const [documentNotes, setDocumentNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusConfig = STATUS_CONFIG[pa.status];
  const urgencyConfig = URGENCY_CONFIG[pa.urgency];

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePriorAuth(session!.tenantId, session!.accessToken, pa.id, updateData);
      onUpdate();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to update PA');
    } finally {
      setUpdating(false);
    }
  };

  const handleSubmitToPayer = async () => {
    if (!confirm('Submit this prior authorization to the payer? This action cannot be undone.')) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitPriorAuth(session!.tenantId, session!.accessToken, pa.id);
      showSuccess(response.message || 'Submitted successfully! Awaiting payer response...');

      setTimeout(async () => {
        await handleCheckStatus();
        onUpdate();
      }, 3000);
    } catch (err: any) {
      showError(err.message || 'Failed to submit PA');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const status = await checkPriorAuthStatus(session!.tenantId, session!.accessToken, pa.id);
      setStatusData(status);
      showInfo(`Status: ${status.payerStatus}`);
    } catch (err: any) {
      showError(err.message || 'Failed to check status');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile) {
      showError('Please select a file to upload');
      return;
    }

    setUploadingDoc(true);
    try {
      await uploadPriorAuthDocument(
        session!.tenantId,
        session!.accessToken,
        pa.id,
        selectedFile,
        documentType,
        documentNotes
      );
      showSuccess('Document uploaded successfully');
      setSelectedFile(null);
      setDocumentNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onUpdate();
    } catch (err: any) {
      showError(err.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  const canSubmit = ['draft', 'pending', 'more_info_needed'].includes(pa.status);
  const isSubmitted = ['submitted', 'approved', 'denied'].includes(pa.status);

  return (
    <div className="epa-modal-overlay" onClick={onClose}>
      <div className="epa-modal epa-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="epa-modal-header">
          <div className="epa-modal-header-info">
            <h2>PA #{pa.auth_number}</h2>
            <div className="epa-modal-badges">
              <span
                className="epa-status-badge"
                style={{ color: statusConfig.color, backgroundColor: statusConfig.bgColor }}
              >
                {statusConfig.label}
              </span>
              <span
                className="epa-urgency-badge"
                style={{ color: urgencyConfig.color, backgroundColor: urgencyConfig.bgColor }}
              >
                {urgencyConfig.label}
              </span>
            </div>
          </div>
          <button className="epa-modal-close" onClick={onClose}>
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="epa-modal-tabs">
          <button
            className={`epa-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`epa-tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents
          </button>
          <button
            className={`epa-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History & Actions
          </button>
        </div>

        <div className="epa-modal-content">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="epa-detail-grid">
              <div className="epa-detail-section">
                <h3>Patient Information</h3>
                <div className="epa-detail-row">
                  <span className="label">Name</span>
                  <span className="value">{pa.first_name} {pa.last_name}</span>
                </div>
                <div className="epa-detail-row">
                  <span className="label">Provider</span>
                  <span className="value">{pa.provider_name}</span>
                </div>
                <div className="epa-detail-row">
                  <span className="label">Provider NPI</span>
                  <span className="value">{pa.provider_npi}</span>
                </div>
              </div>

              <div className="epa-detail-section">
                <h3>Medication Details</h3>
                <div className="epa-detail-row">
                  <span className="label">Medication</span>
                  <span className="value">{pa.medication_name}</span>
                </div>
                <div className="epa-detail-row">
                  <span className="label">Diagnosis Code</span>
                  <span className="value">{pa.diagnosis_code}</span>
                </div>
                <div className="epa-detail-row">
                  <span className="label">Insurance</span>
                  <span className="value">{pa.insurance_name}</span>
                </div>
              </div>

              <div className="epa-detail-section epa-detail-full">
                <h3>Clinical Justification</h3>
                <div className="epa-justification-text">{pa.clinical_justification}</div>
              </div>

              {pa.insurance_auth_number && (
                <div className="epa-detail-section">
                  <h3>Authorization Details</h3>
                  <div className="epa-detail-row">
                    <span className="label">Insurance Auth #</span>
                    <span className="value epa-auth-number">{pa.insurance_auth_number}</span>
                  </div>
                </div>
              )}

              {pa.denial_reason && (
                <div className="epa-detail-section epa-denial-section">
                  <h3>Denial Information</h3>
                  <div className="epa-denial-reason">{pa.denial_reason}</div>
                </div>
              )}

              {pa.notes && (
                <div className="epa-detail-section epa-detail-full">
                  <h3>Notes</h3>
                  <div className="epa-notes-text">{pa.notes}</div>
                </div>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="epa-documents-section">
              <div className="epa-upload-area">
                <h3>Upload Supporting Documents</h3>
                <div className="epa-upload-form">
                  <div className="epa-form-row">
                    <div className="epa-form-group">
                      <label>Document Type</label>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                      >
                        <option value="clinical_notes">Clinical Notes</option>
                        <option value="lab_results">Lab Results</option>
                        <option value="photos">Clinical Photos</option>
                        <option value="treatment_history">Treatment History</option>
                        <option value="letter_medical_necessity">Letter of Medical Necessity</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="epa-form-group">
                      <label>Notes (Optional)</label>
                      <input
                        type="text"
                        value={documentNotes}
                        onChange={(e) => setDocumentNotes(e.target.value)}
                        placeholder="Brief description..."
                      />
                    </div>
                  </div>
                  <div className="epa-file-upload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="doc-upload"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="doc-upload" className="epa-file-upload-label">
                      <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>{selectedFile ? selectedFile.name : 'Choose file or drag here'}</span>
                    </label>
                  </div>
                  <button
                    className="epa-btn-primary"
                    onClick={handleDocumentUpload}
                    disabled={!selectedFile || uploadingDoc}
                  >
                    {uploadingDoc ? 'Uploading...' : 'Upload Document'}
                  </button>
                </div>
              </div>

              <div className="epa-documents-list">
                <h3>Uploaded Documents</h3>
                <div className="epa-empty-docs">
                  <p>No documents uploaded yet</p>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="epa-history-section">
              {/* Quick Actions */}
              <div className="epa-quick-actions">
                {canSubmit && (
                  <button
                    className="epa-action-card submit"
                    onClick={handleSubmitToPayer}
                    disabled={submitting}
                  >
                    <div className="epa-action-icon">
                      {submitting ? (
                        <div className="epa-spinner-small"></div>
                      ) : (
                        <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </div>
                    <div className="epa-action-text">
                      <strong>Submit to Payer</strong>
                      <span>Send PA request to insurance</span>
                    </div>
                  </button>
                )}

                {isSubmitted && (
                  <button
                    className="epa-action-card refresh"
                    onClick={handleCheckStatus}
                    disabled={checkingStatus}
                  >
                    <div className="epa-action-icon">
                      {checkingStatus ? (
                        <div className="epa-spinner-small"></div>
                      ) : (
                        <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </div>
                    <div className="epa-action-text">
                      <strong>Check Status</strong>
                      <span>Get update from payer</span>
                    </div>
                  </button>
                )}
              </div>

              {/* Status Response */}
              {statusData && (
                <div className="epa-status-response">
                  <h4>Payer Response</h4>
                  <div className="epa-status-details">
                    <div className="epa-status-row">
                      <span>Status:</span>
                      <strong>{statusData.payerStatus}</strong>
                    </div>
                    {statusData.insuranceAuthNumber && (
                      <div className="epa-status-row">
                        <span>Auth Number:</span>
                        <strong>{statusData.insuranceAuthNumber}</strong>
                      </div>
                    )}
                    {statusData.estimatedDecisionDate && (
                      <div className="epa-status-row">
                        <span>Est. Decision:</span>
                        <strong>{new Date(statusData.estimatedDecisionDate).toLocaleDateString()}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="epa-timeline">
                <h4>Request Timeline</h4>
                <div className="epa-timeline-items">
                  <div className="epa-timeline-item completed">
                    <div className="epa-timeline-dot"></div>
                    <div className="epa-timeline-content">
                      <strong>Request Created</strong>
                      <span>{new Date(pa.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {pa.submitted_at && (
                    <div className="epa-timeline-item completed">
                      <div className="epa-timeline-dot"></div>
                      <div className="epa-timeline-content">
                        <strong>Submitted to Payer</strong>
                        <span>{new Date(pa.submitted_at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {pa.approved_at && (
                    <div className="epa-timeline-item completed success">
                      <div className="epa-timeline-dot"></div>
                      <div className="epa-timeline-content">
                        <strong>Approved</strong>
                        <span>{new Date(pa.approved_at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {pa.denied_at && (
                    <div className="epa-timeline-item completed error">
                      <div className="epa-timeline-dot"></div>
                      <div className="epa-timeline-content">
                        <strong>Denied</strong>
                        <span>{new Date(pa.denied_at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Update */}
              <div className="epa-manual-update">
                <h4>Manual Status Update</h4>
                <div className="epa-update-form">
                  <div className="epa-form-group">
                    <label>Status</label>
                    <select
                      value={updateData.status}
                      onChange={(e) => setUpdateData({ ...updateData, status: e.target.value as any })}
                    >
                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      ))}
                    </select>
                  </div>

                  {updateData.status === 'approved' && (
                    <div className="epa-form-group">
                      <label>Insurance Auth Number</label>
                      <input
                        type="text"
                        value={updateData.insuranceAuthNumber}
                        onChange={(e) => setUpdateData({ ...updateData, insuranceAuthNumber: e.target.value })}
                        placeholder="Enter auth number from insurance"
                      />
                    </div>
                  )}

                  {(updateData.status === 'denied' || updateData.status === 'more_info_needed') && (
                    <div className="epa-form-group">
                      <label>{updateData.status === 'denied' ? 'Denial Reason' : 'Information Requested'}</label>
                      <textarea
                        value={updateData.denialReason}
                        onChange={(e) => setUpdateData({ ...updateData, denialReason: e.target.value })}
                        placeholder="Enter reason from insurance"
                        rows={3}
                      />
                    </div>
                  )}

                  <div className="epa-form-group">
                    <label>Add Notes</label>
                    <textarea
                      value={updateData.notes}
                      onChange={(e) => setUpdateData({ ...updateData, notes: e.target.value })}
                      placeholder="Additional notes..."
                      rows={2}
                    />
                  </div>

                  <button
                    className="epa-btn-secondary"
                    onClick={handleUpdate}
                    disabled={updating}
                  >
                    {updating ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="epa-modal-footer">
          <button className="epa-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PriorAuthPage;
