import { useState } from 'react';
import { Modal } from '../ui';

type ClaimStatus = 'draft' | 'ready' | 'submitted' | 'accepted' | 'rejected' | 'paid' | 'denied' | 'appealed';

interface Claim {
  id: string;
  claimNumber: string;
  patientName: string;
  patientId: string;
  dos: string;
  payer: string;
  payerId: string;
  provider: string;
  totalChargesCents: number;
  allowedAmountCents: number;
  paidAmountCents: number;
  adjustmentCents: number;
  patientResponsibilityCents: number;
  status: ClaimStatus;
  submittedAt?: string;
  lastUpdated: string;
  procedures: string[];
  diagnoses: string[];
  denialReason?: string;
  denialCode?: string;
  timelyFilingDeadline: string;
}

interface ClaimScrubIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field?: string;
}

interface Props {
  onClaimSelect?: (claimId: string) => void;
  onSubmitClaims?: (claimIds: string[]) => void;
}

const MOCK_CLAIMS: Claim[] = [
  {
    id: '1',
    claimNumber: 'CLM-2026-001245',
    patientName: 'John Smith',
    patientId: 'p-1',
    dos: '2026-01-10',
    payer: 'Blue Cross Blue Shield',
    payerId: 'BCBS',
    provider: 'Dr. Sarah Johnson',
    totalChargesCents: 45000,
    allowedAmountCents: 38000,
    paidAmountCents: 30400,
    adjustmentCents: 7000,
    patientResponsibilityCents: 7600,
    status: 'paid',
    submittedAt: '2026-01-11',
    lastUpdated: '2026-01-14',
    procedures: ['99214', '11102'],
    diagnoses: ['L70.0', 'L82.1'],
    timelyFilingDeadline: '2026-04-10',
  },
  {
    id: '2',
    claimNumber: 'CLM-2026-001246',
    patientName: 'Emily Davis',
    patientId: 'p-2',
    dos: '2026-01-12',
    payer: 'Aetna',
    payerId: 'AETNA',
    provider: 'Dr. Michael Chen',
    totalChargesCents: 32500,
    allowedAmountCents: 0,
    paidAmountCents: 0,
    adjustmentCents: 0,
    patientResponsibilityCents: 0,
    status: 'submitted',
    submittedAt: '2026-01-13',
    lastUpdated: '2026-01-13',
    procedures: ['99213', '96372'],
    diagnoses: ['L40.0'],
    timelyFilingDeadline: '2026-04-12',
  },
  {
    id: '3',
    claimNumber: 'CLM-2026-001247',
    patientName: 'Robert Wilson',
    patientId: 'p-3',
    dos: '2026-01-08',
    payer: 'Medicare',
    payerId: 'MDCR',
    provider: 'Dr. Sarah Johnson',
    totalChargesCents: 85000,
    allowedAmountCents: 68000,
    paidAmountCents: 0,
    adjustmentCents: 0,
    patientResponsibilityCents: 0,
    status: 'denied',
    submittedAt: '2026-01-09',
    lastUpdated: '2026-01-12',
    procedures: ['17311', '17312', '88305'],
    diagnoses: ['C44.91', 'L57.0'],
    denialReason: 'Medical necessity not established',
    denialCode: 'CO-50',
    timelyFilingDeadline: '2026-04-08',
  },
  {
    id: '4',
    claimNumber: 'CLM-2026-001248',
    patientName: 'Maria Garcia',
    patientId: 'p-4',
    dos: '2026-01-14',
    payer: 'UnitedHealthcare',
    payerId: 'UHC',
    provider: 'Dr. Michael Chen',
    totalChargesCents: 28000,
    allowedAmountCents: 0,
    paidAmountCents: 0,
    adjustmentCents: 0,
    patientResponsibilityCents: 0,
    status: 'ready',
    lastUpdated: '2026-01-14',
    procedures: ['99213', '11102'],
    diagnoses: ['L30.9'],
    timelyFilingDeadline: '2026-04-14',
  },
  {
    id: '5',
    claimNumber: 'CLM-2026-001249',
    patientName: 'James Anderson',
    patientId: 'p-5',
    dos: '2026-01-09',
    payer: 'Cigna',
    payerId: 'CIGNA',
    provider: 'Dr. Sarah Johnson',
    totalChargesCents: 125000,
    allowedAmountCents: 0,
    paidAmountCents: 0,
    adjustmentCents: 0,
    patientResponsibilityCents: 0,
    status: 'draft',
    lastUpdated: '2026-01-14',
    procedures: ['17311', '17312', '17313', '88305', '88331'],
    diagnoses: ['C44.91', 'L57.0', 'D48.5'],
    timelyFilingDeadline: '2026-04-09',
  },
];

const MOCK_SCRUB_ISSUES: ClaimScrubIssue[] = [
  { severity: 'error', code: 'E001', message: 'Missing modifier for procedure 17312', field: 'procedure_modifier' },
  { severity: 'warning', code: 'W003', message: 'Diagnosis L57.0 may require additional documentation', field: 'diagnosis' },
  { severity: 'info', code: 'I001', message: 'Consider adding place of service code', field: 'pos' },
];

export function ClaimsManagement({ onClaimSelect, onSubmitClaims }: Props) {
  const [claims, setClaims] = useState<Claim[]>(MOCK_CLAIMS);
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'all'>('all');
  const [payerFilter, setPayerFilter] = useState<string>('all');
  const [showScrubModal, setShowScrubModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [selectedClaimForAppeal, setSelectedClaimForAppeal] = useState<Claim | null>(null);
  const [scrubResults, setScrubResults] = useState<ClaimScrubIssue[]>([]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusColor = (status: ClaimStatus) => {
    switch (status) {
      case 'draft': return { bg: '#f3f4f6', color: '#374151' };
      case 'ready': return { bg: '#dbeafe', color: '#1e40af' };
      case 'submitted': return { bg: '#fef3c7', color: '#92400e' };
      case 'accepted': return { bg: '#d1fae5', color: '#065f46' };
      case 'paid': return { bg: '#dcfce7', color: '#166534' };
      case 'rejected': return { bg: '#fee2e2', color: '#991b1b' };
      case 'denied': return { bg: '#fecaca', color: '#b91c1c' };
      case 'appealed': return { bg: '#e0e7ff', color: '#3730a3' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  const handleScrubClaims = () => {
    // Simulate scrubbing
    setScrubResults(MOCK_SCRUB_ISSUES);
    setShowScrubModal(true);
  };

  const handleSubmitClaims = () => {
    if (selectedClaims.size === 0) return;

    // Update claim statuses
    setClaims(claims.map(claim =>
      selectedClaims.has(claim.id) && (claim.status === 'ready' || claim.status === 'draft')
        ? { ...claim, status: 'submitted', submittedAt: new Date().toISOString().split('T')[0] }
        : claim
    ));

    onSubmitClaims?.(Array.from(selectedClaims));
    setSelectedClaims(new Set());
    setShowSubmitModal(false);
  };

  const handleFileAppeal = (claim: Claim) => {
    setSelectedClaimForAppeal(claim);
    setShowAppealModal(true);
  };

  const toggleSelectClaim = (claimId: string) => {
    const newSelected = new Set(selectedClaims);
    if (newSelected.has(claimId)) {
      newSelected.delete(claimId);
    } else {
      newSelected.add(claimId);
    }
    setSelectedClaims(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedClaims.size === filteredClaims.length) {
      setSelectedClaims(new Set());
    } else {
      setSelectedClaims(new Set(filteredClaims.map(c => c.id)));
    }
  };

  const filteredClaims = claims.filter(claim => {
    if (statusFilter !== 'all' && claim.status !== statusFilter) return false;
    if (payerFilter !== 'all' && claim.payerId !== payerFilter) return false;
    return true;
  });

  const uniquePayers = [...new Set(claims.map(c => ({ id: c.payerId, name: c.payer })))];

  // Calculate summary stats
  const totalSubmitted = claims.filter(c => c.status === 'submitted').length;
  const totalDenied = claims.filter(c => c.status === 'denied').length;
  const totalPending = claims.filter(c => ['draft', 'ready'].includes(c.status)).length;
  const totalPaidCents = claims.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.paidAmountCents, 0);

  return (
    <div className="claims-management">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
            Claims Management
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            Submit, track, and manage insurance claims
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleScrubClaims}
            disabled={selectedClaims.size === 0}
            style={{
              padding: '0.75rem 1.25rem',
              background: selectedClaims.size > 0 ? 'white' : '#f3f4f6',
              color: selectedClaims.size > 0 ? '#374151' : '#9ca3af',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: selectedClaims.size > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Scrub Claims ({selectedClaims.size})
          </button>
          <button
            onClick={() => setShowSubmitModal(true)}
            disabled={selectedClaims.size === 0}
            style={{
              padding: '0.75rem 1.25rem',
              background: selectedClaims.size > 0 ? '#059669' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: selectedClaims.size > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Submit Claims ({selectedClaims.size})
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          background: '#fef3c7',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #fde68a',
          cursor: 'pointer',
        }}
        onClick={() => setStatusFilter('submitted')}
        >
          <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '0.5rem', fontWeight: '600' }}>
            Awaiting Response
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f59e0b' }}>
            {totalSubmitted}
          </div>
        </div>
        <div style={{
          background: '#fee2e2',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #fecaca',
          cursor: 'pointer',
        }}
        onClick={() => setStatusFilter('denied')}
        >
          <div style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.5rem', fontWeight: '600' }}>
            Denied / Rejected
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#dc2626' }}>
            {totalDenied}
          </div>
        </div>
        <div style={{
          background: '#dbeafe',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #bfdbfe',
          cursor: 'pointer',
        }}
        onClick={() => setStatusFilter('ready')}
        >
          <div style={{ fontSize: '0.8rem', color: '#1e40af', marginBottom: '0.5rem', fontWeight: '600' }}>
            Ready to Submit
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2563eb' }}>
            {totalPending}
          </div>
        </div>
        <div style={{
          background: '#dcfce7',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #bbf7d0',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#166534', marginBottom: '0.5rem', fontWeight: '600' }}>
            Collected (MTD)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>
            {formatCurrency(totalPaidCents)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        background: '#f9fafb',
        borderRadius: '8px',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: '600' }}>
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '0.9rem',
              minWidth: '150px',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="submitted">Submitted</option>
            <option value="accepted">Accepted</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="denied">Denied</option>
            <option value="appealed">Appealed</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: '600' }}>
            Payer
          </label>
          <select
            value={payerFilter}
            onChange={(e) => setPayerFilter(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '0.9rem',
              minWidth: '200px',
            }}
          >
            <option value="all">All Payers</option>
            {uniquePayers.map(payer => (
              <option key={payer.id} value={payer.id}>{payer.name}</option>
            ))}
          </select>
        </div>
        {(statusFilter !== 'all' || payerFilter !== 'all') && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setPayerFilter('all');
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'white',
              color: '#6b7280',
              border: '2px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Claims Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={selectedClaims.size === filteredClaims.length && filteredClaims.length > 0}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Claim #</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Patient</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>DOS</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Payer</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Provider</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Charged</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Allowed</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Paid</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClaims.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                  No claims found
                </td>
              </tr>
            ) : (
              filteredClaims.map(claim => {
                const statusColors = getStatusColor(claim.status);
                return (
                  <tr
                    key={claim.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <td style={{ padding: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedClaims.has(claim.id)}
                        onChange={() => toggleSelectClaim(claim.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.8rem' }}>
                      {claim.claimNumber}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827' }}>
                      {claim.patientName}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                      {formatDate(claim.dos)}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#374151' }}>
                      {claim.payer}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                      {claim.provider}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#374151' }}>
                      {formatCurrency(claim.totalChargesCents)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#374151' }}>
                      {claim.allowedAmountCents > 0 ? formatCurrency(claim.allowedAmountCents) : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                      {claim.paidAmountCents > 0 ? formatCurrency(claim.paidAmountCents) : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: statusColors.bg,
                        color: statusColors.color,
                      }}>
                        {claim.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => onClaimSelect?.(claim.id)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                        {(claim.status === 'denied' || claim.status === 'rejected') && (
                          <button
                            onClick={() => handleFileAppeal(claim)}
                            style={{
                              padding: '0.4rem 0.75rem',
                              background: '#3730a3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: '600',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            Appeal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Scrub Results Modal */}
      <Modal
        isOpen={showScrubModal}
        title="Claim Scrub Results"
        onClose={() => setShowScrubModal(false)}
      >
        <div>
          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '0.9rem', color: '#374151' }}>
              <strong>{selectedClaims.size}</strong> claims scrubbed
            </div>
          </div>

          {scrubResults.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              background: '#dcfce7',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>All claims passed scrubbing</div>
              <p style={{ color: '#166534' }}>Ready for submission</p>
            </div>
          ) : (
            <div>
              {scrubResults.map((issue, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '0.75rem',
                    background: issue.severity === 'error' ? '#fee2e2' : issue.severity === 'warning' ? '#fef3c7' : '#f0f9ff',
                    border: `2px solid ${issue.severity === 'error' ? '#fecaca' : issue.severity === 'warning' ? '#fde68a' : '#bae6fd'}`,
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: issue.severity === 'error' ? '#dc2626' : issue.severity === 'warning' ? '#f59e0b' : '#0ea5e9',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    flexShrink: 0,
                  }}>
                    {issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '!' : 'i'}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                      {issue.code}: {issue.message}
                    </div>
                    {issue.field && (
                      <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                        Field: {issue.field}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button
              onClick={() => setShowScrubModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            {scrubResults.filter(r => r.severity === 'error').length === 0 && (
              <button
                onClick={() => {
                  setShowScrubModal(false);
                  setShowSubmitModal(true);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Proceed to Submit
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Submit Confirmation Modal */}
      <Modal
        isOpen={showSubmitModal}
        title="Submit Claims"
        onClose={() => setShowSubmitModal(false)}
      >
        <div>
          <div style={{
            background: '#f0fdf4',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669', marginBottom: '0.5rem' }}>
              {selectedClaims.size}
            </div>
            <div style={{ color: '#065f46' }}>
              claims ready to submit
            </div>
          </div>

          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
              Clearinghouse: Trizetto
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Claims will be submitted electronically and tracked in real-time.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowSubmitModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitClaims}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Submit Claims
            </button>
          </div>
        </div>
      </Modal>

      {/* Appeal Modal */}
      <Modal
        isOpen={showAppealModal}
        title="File Appeal"
        onClose={() => {
          setShowAppealModal(false);
          setSelectedClaimForAppeal(null);
        }}
      >
        {selectedClaimForAppeal && (
          <div>
            <div style={{
              background: '#fee2e2',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontWeight: '600', color: '#991b1b', marginBottom: '0.5rem' }}>
                Denial Reason: {selectedClaimForAppeal.denialCode}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#b91c1c' }}>
                {selectedClaimForAppeal.denialReason}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Appeal Reason
              </label>
              <textarea
                rows={4}
                placeholder="Explain why this claim should be reconsidered..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Supporting Documents
              </label>
              <div style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '2rem',
                textAlign: 'center',
                color: '#6b7280',
              }}>
                <p>Drag and drop files here or click to browse</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  Medical records, lab results, clinical notes
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAppealModal(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setClaims(claims.map(c =>
                    c.id === selectedClaimForAppeal.id ? { ...c, status: 'appealed' as ClaimStatus } : c
                  ));
                  setShowAppealModal(false);
                  setSelectedClaimForAppeal(null);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#3730a3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Submit Appeal
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
