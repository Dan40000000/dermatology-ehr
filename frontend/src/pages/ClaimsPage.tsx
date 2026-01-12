import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchClaims, fetchClaimDetail, updateClaimStatus, postClaimPayment, fetchPatients } from '../api';
import type { Claim, ClaimWithDetails, ClaimStatus, Patient } from '../types';

type ActiveTab = 'claims' | 'payments';

export function ClaimsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('claims');
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<ClaimWithDetails | null>(null);
  const [showClaimDetail, setShowClaimDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentPayer, setPaymentPayer] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [claimsRes, patientsRes] = await Promise.all([
        fetchClaims(session.tenantId, session.accessToken, statusFilter !== 'all' ? { status: statusFilter } : {}),
        fetchPatients(session.tenantId, session.accessToken),
      ]);
      setClaims(claimsRes.claims || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, statusFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadClaimDetail = async (claimId: string) => {
    if (!session) return;

    try {
      const detail = await fetchClaimDetail(session.tenantId, session.accessToken, claimId);
      setSelectedClaim(detail);
      setShowClaimDetail(true);
    } catch (err: any) {
      showError(err.message || 'Failed to load claim details');
    }
  };

  const handleUpdateStatus = async (claimId: string, status: ClaimStatus, notes?: string) => {
    if (!session) return;

    try {
      await updateClaimStatus(session.tenantId, session.accessToken, claimId, { status, notes });
      showSuccess(`Claim status updated to ${status}`);
      loadData();
      if (selectedClaim && selectedClaim.claim.id === claimId) {
        loadClaimDetail(claimId);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to update claim status');
    }
  };

  const handlePostPayment = async () => {
    if (!session || !selectedClaim) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showError('Invalid payment amount');
      return;
    }

    try {
      await postClaimPayment(session.tenantId, session.accessToken, selectedClaim.claim.id, {
        amountCents: Math.round(amount * 100),
        paymentDate,
        paymentMethod: paymentMethod || undefined,
        payer: paymentPayer || undefined,
        checkNumber: checkNumber || undefined,
        notes: paymentNotes || undefined,
      });
      showSuccess('Payment posted successfully');
      setShowPaymentModal(false);
      resetPaymentForm();
      loadData();
      loadClaimDetail(selectedClaim.claim.id);
    } catch (err: any) {
      showError(err.message || 'Failed to post payment');
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('');
    setPaymentPayer('');
    setCheckNumber('');
    setPaymentNotes('');
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getStatusColor = (status: ClaimStatus) => {
    switch (status) {
      case 'draft': return 'gray';
      case 'ready': return 'blue';
      case 'submitted': return 'yellow';
      case 'accepted': return 'green';
      case 'rejected': return 'red';
      case 'paid': return 'green';
      default: return 'gray';
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const filteredClaims = claims.filter((claim) => {
    if (!claim) return false;
    if (statusFilter !== 'all' && claim.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const patientName = getPatientName(claim.patientId).toLowerCase();
      const claimNumber = (claim.claimNumber || '').toLowerCase();
      const providerName = (claim.providerName || '').toLowerCase();
      return (
        claimNumber.includes(search) ||
        patientName.includes(search) ||
        providerName.includes(search)
      );
    }
    return true;
  });

  const totalClaimAmount = filteredClaims.reduce((sum, c) => sum + (c?.totalCents || 0), 0);
  const paidClaims = filteredClaims.filter((c) => c && c.status === 'paid');
  const submittedClaims = filteredClaims.filter((c) => c && c.status === 'submitted');

  if (loading) {
    return (
      <div className="claims-page">
        <div className="page-header">
          <h1>Claims Management</h1>
        </div>
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="claims-page">
      <div className="page-header">
        <h1>Claims Management</h1>
      </div>

      {/* Stats */}
      <div className="financial-stats">
        <div className="stat-card">
          <div className="stat-value">{filteredClaims.length}</div>
          <div className="stat-label">Total Claims</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatCurrency(totalClaimAmount)}</div>
          <div className="stat-label">Total Billed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{submittedClaims.length}</div>
          <div className="stat-label">Submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{paidClaims.length}</div>
          <div className="stat-label">Paid</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="financial-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'claims' ? 'active' : ''}`}
          onClick={() => setActiveTab('claims')}
        >
          Claims List
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Payment Posting
        </button>
      </div>

      {/* Claims List Tab */}
      {activeTab === 'claims' && (
        <Panel title="">
          <div className="claims-filters">
            <div className="filter-row">
              <div className="form-field">
                <label>Status Filter</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | 'all')}>
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="submitted">Submitted</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="form-field">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search by claim #, patient, or provider..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="claims-table">
            <table>
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Provider</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Payer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                      No claims found
                    </td>
                  </tr>
                ) : (
                  filteredClaims.map((claim) => (
                    <tr key={claim.id}>
                      <td className="strong">{claim.claimNumber}</td>
                      <td className="muted">{new Date(claim.createdAt).toLocaleDateString()}</td>
                      <td>{getPatientName(claim.patientId)}</td>
                      <td className="muted">{claim.providerName || '-'}</td>
                      <td>{formatCurrency(claim.totalCents)}</td>
                      <td>
                        <span className={`pill ${getStatusColor(claim.status)}`}>{claim.status}</span>
                      </td>
                      <td className="muted">{claim.payer || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="btn-sm btn-secondary"
                            onClick={() => loadClaimDetail(claim.id)}
                          >
                            View
                          </button>
                          {claim.status !== 'paid' && (
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              onClick={() => {
                                loadClaimDetail(claim.id);
                                setTimeout(() => setShowPaymentModal(true), 100);
                              }}
                            >
                              Post Payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Payment Posting Tab */}
      {activeTab === 'payments' && (
        <Panel title="Recent Payments">
          <div className="payments-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Claim #</th>
                  <th>Patient</th>
                  <th>Payer</th>
                  <th>Check #</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {claims.flatMap((claim) =>
                  selectedClaim && selectedClaim.claim.id === claim.id
                    ? selectedClaim.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="muted">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                          <td className="strong">{claim.claimNumber}</td>
                          <td>{getPatientName(claim.patientId)}</td>
                          <td className="muted">{payment.payer || '-'}</td>
                          <td className="muted">{payment.checkNumber || '-'}</td>
                          <td className="positive">{formatCurrency(payment.amountCents)}</td>
                          <td className="muted tiny">{payment.notes || '-'}</td>
                        </tr>
                      ))
                    : []
                ).slice(0, 50)}
                {claims.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                      No payments recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Claim Detail Modal */}
      <Modal
        isOpen={showClaimDetail}
        title={selectedClaim ? `Claim ${selectedClaim.claim.claimNumber}` : 'Claim Detail'}
        onClose={() => {
          setShowClaimDetail(false);
          setSelectedClaim(null);
        }}
        size="lg"
      >
        {selectedClaim && (
          <div className="claim-detail">
            <div className="claim-info-section">
              <h3>Claim Information</h3>
              <div className="grid">
                <div className="field">
                  <span className="label">Patient:</span>
                  <span className="value">{getPatientName(selectedClaim.claim.patientId)}</span>
                </div>
                <div className="field">
                  <span className="label">DOB:</span>
                  <span className="value">{selectedClaim.claim.dob ? new Date(selectedClaim.claim.dob).toLocaleDateString() : '-'}</span>
                </div>
                <div className="field">
                  <span className="label">Insurance:</span>
                  <span className="value">{selectedClaim.claim.insurancePlanName || 'Self-Pay'}</span>
                </div>
                <div className="field">
                  <span className="label">Provider:</span>
                  <span className="value">{selectedClaim.claim.providerName || '-'}</span>
                </div>
                <div className="field">
                  <span className="label">Status:</span>
                  <span className={`pill ${getStatusColor(selectedClaim.claim.status)}`}>{selectedClaim.claim.status}</span>
                </div>
                <div className="field">
                  <span className="label">Total:</span>
                  <span className="value strong">{formatCurrency(selectedClaim.claim.totalCents)}</span>
                </div>
              </div>

              <div className="status-actions">
                <label>Update Status:</label>
                <div className="status-buttons">
                  {(['ready', 'submitted', 'accepted', 'rejected'] as ClaimStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn-sm ${selectedClaim.claim.status === status ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleUpdateStatus(selectedClaim.claim.id, status)}
                      disabled={selectedClaim.claim.status === status}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="claim-info-section">
              <h3>Diagnoses</h3>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ICD-10</th>
                    <th>Description</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.diagnoses.map((dx, idx) => (
                    <tr key={dx.id}>
                      <td>{idx + 1}</td>
                      <td>{dx.icd10Code}</td>
                      <td>{dx.description}</td>
                      <td>{dx.isPrimary ? 'Yes' : ''}</td>
                    </tr>
                  ))}
                  {selectedClaim.diagnoses.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>No diagnoses</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="claim-info-section">
              <h3>Procedures</h3>
              <table>
                <thead>
                  <tr>
                    <th>CPT</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.charges.map((charge) => (
                    <tr key={charge.id}>
                      <td>{charge.cptCode}</td>
                      <td>{charge.description}</td>
                      <td>{charge.quantity}</td>
                      <td>{formatCurrency(charge.feeCents * charge.quantity)}</td>
                    </tr>
                  ))}
                  {selectedClaim.charges.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>No charges</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="claim-info-section">
              <h3>Payments</h3>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payer</th>
                    <th>Method</th>
                    <th>Check #</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                      <td>{payment.payer || '-'}</td>
                      <td>{payment.paymentMethod || '-'}</td>
                      <td>{payment.checkNumber || '-'}</td>
                      <td className="positive">{formatCurrency(payment.amountCents)}</td>
                    </tr>
                  ))}
                  {selectedClaim.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>No payments</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: '10px', fontWeight: 'bold' }}>
                Total Paid: {formatCurrency(selectedClaim.payments.reduce((sum, p) => sum + p.amountCents, 0))}
              </div>
            </div>

            <div className="claim-info-section">
              <h3>Status History</h3>
              <div className="status-history">
                {selectedClaim.statusHistory.map((history) => (
                  <div key={history.id} className="history-item">
                    <span className={`pill ${getStatusColor(history.status)}`}>{history.status}</span>
                    <span className="muted tiny">{new Date(history.changedAt).toLocaleString()}</span>
                    {history.notes && <span className="muted tiny">{history.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowClaimDetail(false)}
          >
            Close
          </button>
          {selectedClaim && selectedClaim.claim.status !== 'paid' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setShowClaimDetail(false);
                setShowPaymentModal(true);
              }}
            >
              Post Payment
            </button>
          )}
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        title="Post Payment"
        onClose={() => {
          setShowPaymentModal(false);
          resetPaymentForm();
        }}
      >
        {selectedClaim && (
          <div className="modal-form">
            <div className="payment-claim-info">
              <div className="info-row">
                <span className="label">Claim #:</span>
                <span className="value">{selectedClaim.claim.claimNumber}</span>
              </div>
              <div className="info-row">
                <span className="label">Patient:</span>
                <span className="value">{getPatientName(selectedClaim.claim.patientId)}</span>
              </div>
              <div className="info-row">
                <span className="label">Claim Total:</span>
                <span className="value">{formatCurrency(selectedClaim.claim.totalCents)}</span>
              </div>
              <div className="info-row">
                <span className="label">Total Paid:</span>
                <span className="value">{formatCurrency(selectedClaim.payments.reduce((sum, p) => sum + p.amountCents, 0))}</span>
              </div>
              <div className="info-row">
                <span className="label">Balance:</span>
                <span className="value strong">
                  {formatCurrency(selectedClaim.claim.totalCents - selectedClaim.payments.reduce((sum, p) => sum + p.amountCents, 0))}
                </span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Payment Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>Payment Date *</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">Select...</option>
                  <option value="check">Check</option>
                  <option value="eft">EFT</option>
                  <option value="credit">Credit Card</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div className="form-field">
                <label>Payer</label>
                <input
                  type="text"
                  value={paymentPayer}
                  onChange={(e) => setPaymentPayer(e.target.value)}
                  placeholder="Insurance company or patient name"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Check Number</label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Notes</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional notes about this payment"
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowPaymentModal(false);
              resetPaymentForm();
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handlePostPayment}>
            Post Payment
          </button>
        </div>
      </Modal>
    </div>
  );
}
