import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import {
  fetchOrders,
  fetchPatients,
  createOrder,
  sendErx,
  fetchRefillRequestsNew,
  fetchRxChangeRequests,
  approveRefillRequest,
  denyRefillRequest,
  approveRxChangeRequest,
  denyRxChangeRequest,
  bulkSendErx,
  bulkPrintRx,
  bulkRefillRx,
  fetchPrescriptionsEnhanced,
  requestMedicationChange,
  confirmAudit,
  fetchPARequests,
} from '../api';
import type { Order, Patient } from '../types';
import { PARequestModal, PAStatusBadge, PADetailModal, DrugInteractionChecker } from '../components/prescriptions';

type RxFilter = 'all' | 'pending' | 'ordered' | 'completed' | 'cancelled';
type TabType = 'prescriptions' | 'refills' | 'changeRequests';
type ERxStatus = 'pending' | 'success' | 'error';

const COMMON_DERM_MEDS = [
  { name: 'Tretinoin 0.025% cream', category: 'Retinoid' },
  { name: 'Tretinoin 0.05% cream', category: 'Retinoid' },
  { name: 'Hydrocortisone 2.5% cream', category: 'Steroid' },
  { name: 'Triamcinolone 0.1% cream', category: 'Steroid' },
  { name: 'Clobetasol 0.05% cream', category: 'Steroid' },
  { name: 'Mupirocin 2% ointment', category: 'Antibiotic' },
  { name: 'Clindamycin 1% gel', category: 'Antibiotic' },
  { name: 'Doxycycline 100mg capsule', category: 'Antibiotic' },
  { name: 'Ketoconazole 2% cream', category: 'Antifungal' },
  { name: 'Terbinafine 1% cream', category: 'Antifungal' },
  { name: 'Fluorouracil 5% cream', category: 'Chemotherapy' },
  { name: 'Imiquimod 5% cream', category: 'Immunomodulator' },
  { name: 'Tacrolimus 0.1% ointment', category: 'Immunomodulator' },
  { name: 'Methotrexate 2.5mg tablet', category: 'Systemic' },
  { name: 'Isotretinoin 40mg capsule', category: 'Systemic' },
];

const FREQUENCIES = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every other day',
  'Once weekly',
  'As needed',
];

const QUANTITIES = ['15g', '30g', '45g', '60g', '90g', '30 tabs', '60 tabs', '90 tabs'];

const DENIAL_REASONS = [
  'Contraindication',
  'Step Therapy Required',
  'Formulary Issue',
  'Prior Authorization Required',
  'Maximum Refills Reached',
  'Medication Discontinued',
  'Patient Needs Evaluation',
  'Other',
];

const CHANGE_TYPES = [
  'New Medication',
  'Dosage Change',
  'Frequency Change',
  'Generic Substitution',
  'Brand Name Required',
];

export function PrescriptionsPageEnhanced() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('prescriptions');
  const [prescriptions, setPrescriptions] = useState<Order[]>([]);
  const [refillRequests, setRefillRequests] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<RxFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRx, setSelectedRx] = useState<Set<string>>(new Set());

  // Enhanced filter states
  const [writtenDateFrom, setWrittenDateFrom] = useState('');
  const [writtenDateTo, setWrittenDateTo] = useState('');
  const [erxStatusFilter, setErxStatusFilter] = useState<ERxStatus | ''>('');
  const [controlledSubstanceFilter, setControlledSubstanceFilter] = useState(false);

  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showDenyChangeModal, setShowDenyChangeModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [sending, setSending] = useState(false);

  // PA Request states
  const [showPARequestModal, setShowPARequestModal] = useState(false);
  const [showPADetailModal, setShowPADetailModal] = useState(false);
  const [selectedRxForPA, setSelectedRxForPA] = useState<Order | undefined>(undefined);
  const [paRequests, setPaRequests] = useState<any[]>([]);
  const [selectedPARequestId, setSelectedPARequestId] = useState<string | null>(null);

  const [newRx, setNewRx] = useState({
    patientId: '',
    medication: '',
    strength: '',
    quantity: '30g',
    frequency: 'Twice daily',
    refills: '0',
    instructions: '',
    pharmacy: '',
  });

  const [denyForm, setDenyForm] = useState({
    reason: '',
    notes: '',
  });

  const [changeForm, setChangeForm] = useState({
    changeType: '',
    details: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        fetchPrescriptionsEnhanced(session.tenantId, session.accessToken, {
          status: filter !== 'all' ? filter : undefined,
          erxStatus: erxStatusFilter || undefined,
          isControlled: controlledSubstanceFilter || undefined,
          writtenDateFrom: writtenDateFrom || undefined,
          writtenDateTo: writtenDateTo || undefined,
          search: searchTerm || undefined,
        }),
        fetchPatients(session.tenantId, session.accessToken),
        fetchPARequests(session.tenantId, session.accessToken),
      ];

      if (activeTab === 'refills') {
        promises.push(fetchRefillRequestsNew(session.tenantId, session.accessToken));
      } else if (activeTab === 'changeRequests') {
        promises.push(fetchRxChangeRequests(session.tenantId, session.accessToken));
      }

      const results = await Promise.all(promises);
      const prescriptionsRes = results[0];
      const patientsRes = results[1];
      const paRequestsRes = results[2];

      setPrescriptions(prescriptionsRes.prescriptions || []);
      setPatients(patientsRes.patients || []);
      setPaRequests(paRequestsRes || []);

      if (activeTab === 'refills' && results[3]) {
        setRefillRequests(results[3].refillRequests || []);
      } else if (activeTab === 'changeRequests' && results[3]) {
        setChangeRequests(results[3].rxChangeRequests || []);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [session, showError, activeTab, filter, erxStatusFilter, controlledSubstanceFilter, writtenDateFrom, writtenDateTo, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRx = async () => {
    if (!session || !newRx.patientId || !newRx.medication) {
      showError('Please fill in required fields');
      return;
    }

    setSending(true);
    try {
      const details = `${newRx.medication} ${newRx.strength}\nQty: ${newRx.quantity}\nSig: ${newRx.frequency}\nRefills: ${newRx.refills}${newRx.instructions ? `\nInstructions: ${newRx.instructions}` : ''}`;

      await createOrder(session.tenantId, session.accessToken, {
        patientId: newRx.patientId,
        type: 'rx',
        details,
        notes: newRx.pharmacy ? `Pharmacy: ${newRx.pharmacy}` : undefined,
        status: 'pending',
      });

      showSuccess('Prescription created');
      setShowNewRxModal(false);
      setNewRx({
        patientId: '',
        medication: '',
        strength: '',
        quantity: '30g',
        frequency: 'Twice daily',
        refills: '0',
        instructions: '',
        pharmacy: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create prescription');
    } finally {
      setSending(false);
    }
  };

  const handleSendErx = async (rx: Order) => {
    if (!session) return;

    try {
      await sendErx(session.tenantId, session.accessToken, {
        orderId: rx.id,
        patientId: rx.patientId,
      });
      showSuccess('Prescription sent electronically');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send e-prescription');
    }
  };

  const handleApproveRefill = async (refillId: string) => {
    if (!session) return;

    try {
      await approveRefillRequest(session.tenantId, session.accessToken, refillId);
      showSuccess('Refill approved');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to approve refill');
    }
  };

  const handleDenyRefill = async () => {
    if (!session || !selectedPrescription || !denyForm.reason) {
      showError('Please select a denial reason');
      return;
    }

    setSending(true);
    try {
      await denyRefillRequest(
        session.tenantId,
        session.accessToken,
        selectedPrescription.id,
        denyForm.reason,
        denyForm.notes || undefined
      );
      showSuccess('Refill denied');
      setShowDenyModal(false);
      setDenyForm({ reason: '', notes: '' });
      setSelectedPrescription(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to deny refill');
    } finally {
      setSending(false);
    }
  };

  const handleApproveChange = async (changeId: string, responseNotes?: string) => {
    if (!session) return;

    try {
      await approveRxChangeRequest(session.tenantId, session.accessToken, changeId, { responseNotes });
      showSuccess('Change request approved');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to approve change request');
    }
  };

  const handleDenyChange = async () => {
    if (!session || !selectedPrescription || !denyForm.notes) {
      showError('Please provide denial notes');
      return;
    }

    setSending(true);
    try {
      await denyRxChangeRequest(session.tenantId, session.accessToken, selectedPrescription.id, denyForm.notes);
      showSuccess('Change request denied');
      setShowDenyChangeModal(false);
      setDenyForm({ reason: '', notes: '' });
      setSelectedPrescription(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to deny change request');
    } finally {
      setSending(false);
    }
  };

  const handleRequestChange = async () => {
    if (!session || !selectedPrescription || !changeForm.changeType || !changeForm.details) {
      showError('Please fill in all fields');
      return;
    }

    setSending(true);
    try {
      await requestMedicationChange(session.tenantId, session.accessToken, selectedPrescription.id, changeForm);
      showSuccess('Change request submitted');
      setShowChangeModal(false);
      setChangeForm({ changeType: '', details: '' });
      setSelectedPrescription(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to request change');
    } finally {
      setSending(false);
    }
  };

  const handleAuditConfirm = async (rx: any) => {
    if (!session) return;

    try {
      await confirmAudit(session.tenantId, session.accessToken, rx.id);
      showSuccess('Audit confirmation recorded');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to confirm audit');
    }
  };

  const handleBulkSendErx = async () => {
    if (!session || selectedRx.size === 0) {
      showError('No prescriptions selected');
      return;
    }

    try {
      const result = await bulkSendErx(session.tenantId, session.accessToken, Array.from(selectedRx));
      showSuccess(`Sent ${result.successCount} of ${result.totalCount} prescriptions`);
      if (result.failureCount > 0) {
        showError(`${result.failureCount} prescriptions failed to send`);
      }
      setSelectedRx(new Set());
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send bulk prescriptions');
    }
  };

  const handleBulkPrint = async () => {
    if (!session || selectedRx.size === 0) {
      showError('No prescriptions selected');
      return;
    }

    try {
      await bulkPrintRx(session.tenantId, session.accessToken, Array.from(selectedRx));
      showSuccess(`${selectedRx.size} prescriptions marked for printing`);
      setSelectedRx(new Set());
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to print prescriptions');
    }
  };

  const handleBulkRefill = async () => {
    if (!session || selectedRx.size === 0) {
      showError('No prescriptions selected');
      return;
    }

    try {
      const result = await bulkRefillRx(session.tenantId, session.accessToken, Array.from(selectedRx));
      showSuccess(`Created ${result.successCount} refills`);
      if (result.failureCount > 0) {
        showError(`${result.failureCount} refills failed to create`);
      }
      setSelectedRx(new Set());
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create bulk refills');
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getPAStatusForRx = (rxId: string) => {
    const paRequest = paRequests.find((pa) => pa.prescription_id === rxId);
    return paRequest || null;
  };

  const handleRequestPA = (rx: Order) => {
    setSelectedRxForPA(rx);
    setShowPARequestModal(true);
  };

  const handleViewPADetail = (paRequestId: string) => {
    setSelectedPARequestId(paRequestId);
    setShowPADetailModal(true);
  };

  const filteredRx = prescriptions.filter((rx) => {
    if (filter !== 'all' && rx.status !== filter) return false;
    if (searchTerm) {
      const patientName = getPatientName(rx.patientId).toLowerCase();
      const details = (rx.details || '').toLowerCase();
      if (!patientName.includes(searchTerm.toLowerCase()) && !details.includes(searchTerm.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  const toggleRxSelection = (rxId: string) => {
    const newSelected = new Set(selectedRx);
    if (newSelected.has(rxId)) {
      newSelected.delete(rxId);
    } else {
      newSelected.add(rxId);
    }
    setSelectedRx(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRx.size === filteredRx.length) {
      setSelectedRx(new Set());
    } else {
      setSelectedRx(new Set(filteredRx.map((r) => r.id)));
    }
  };

  const clearFilters = () => {
    setFilter('all');
    setSearchTerm('');
    setWrittenDateFrom('');
    setWrittenDateTo('');
    setErxStatusFilter('');
    setControlledSubstanceFilter(false);
  };

  // Stats
  const pendingCount = prescriptions.filter((r) => r.status === 'pending').length;
  const sentCount = prescriptions.filter((r) => r.status === 'ordered').length;
  const filledCount = prescriptions.filter((r) => r.status === 'completed').length;
  const refillPendingCount = refillRequests.filter((r) => r.status === 'pending').length;
  const changePendingCount = changeRequests.filter((r) => r.status === 'pending_review').length;

  return (
    <div className="prescriptions-page" style={{
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      {/* Action Bar */}
      <div className="ema-action-bar" style={{
        background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px rgba(139, 92, 246, 0.3)',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <button type="button" className="ema-action-btn" onClick={() => setShowNewRxModal(true)} style={{
          background: 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: '#7c3aed',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          <span className="icon" style={{ fontSize: '1.2rem' }}>+</span>
          New Prescription
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0} onClick={handleBulkSendErx} style={{
          background: selectedRx.size === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: selectedRx.size === 0 ? '#9ca3af' : '#7c3aed',
          cursor: selectedRx.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span className="icon" style={{ fontSize: '1.1rem' }}>ePrescribe Selected ({selectedRx.size})</span>
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0} onClick={handleBulkRefill} style={{
          background: selectedRx.size === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: selectedRx.size === 0 ? '#9ca3af' : '#7c3aed',
          cursor: selectedRx.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          Refill Selected ({selectedRx.size})
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0} onClick={handleBulkPrint} style={{
          background: selectedRx.size === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: selectedRx.size === 0 ? '#9ca3af' : '#7c3aed',
          cursor: selectedRx.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          Print Selected ({selectedRx.size})
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData} style={{
          background: 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: '#7c3aed',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          Refresh
        </button>
      </div>

      {/* Section Header */}
      <div className="ema-section-header" style={{
        background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
        color: '#ffffff',
        padding: '1rem 1.5rem',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        fontSize: '1.25rem',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>Rx</span>
        Prescriptions (eRx)
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        padding: '1rem 1.5rem',
        background: 'rgba(255,255,255,0.9)',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
        border: '2px solid #c4b5fd'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('prescriptions')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'prescriptions' ? '2px solid #0369a1' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'prescriptions' ? '#0369a1' : '#6b7280',
            fontWeight: activeTab === 'prescriptions' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          All Prescriptions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('refills')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'refills' ? '2px solid #0369a1' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'refills' ? '#0369a1' : '#6b7280',
            fontWeight: activeTab === 'refills' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Refill Requests {refillPendingCount > 0 && `(${refillPendingCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('changeRequests')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'changeRequests' ? '2px solid #0369a1' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'changeRequests' ? '#0369a1' : '#6b7280',
            fontWeight: activeTab === 'changeRequests' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Rx Change Requests {changePendingCount > 0 && `(${changePendingCount})`}
        </button>
      </div>

      {/* Stats Row */}
      {activeTab === 'prescriptions' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div
            className="stat-card-teal"
            style={{
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
              padding: '1.25rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
              border: '2px solid rgba(255,255,255,0.4)',
              transition: 'all 0.3s ease',
              opacity: filter === 'all' ? 1 : 0.8
            }}
            onClick={() => setFilter('all')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.25)';
            }}
          >
            <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{prescriptions.length}</div>
            <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Rx</div>
          </div>
          <div
            className="stat-card-teal"
            style={{
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)',
              padding: '1.25rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
              border: '2px solid rgba(255,255,255,0.4)',
              transition: 'all 0.3s ease',
              opacity: filter === 'pending' ? 1 : 0.8
            }}
            onClick={() => setFilter('pending')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.25)';
            }}
          >
            <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{pendingCount}</div>
            <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</div>
          </div>
          <div
            className="stat-card-teal"
            style={{
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
              padding: '1.25rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
              border: '2px solid rgba(255,255,255,0.4)',
              transition: 'all 0.3s ease',
              opacity: filter === 'ordered' ? 1 : 0.8
            }}
            onClick={() => setFilter('ordered')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.25)';
            }}
          >
            <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{sentCount}</div>
            <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent</div>
          </div>
          <div
            className="stat-card-teal"
            style={{
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '1.25rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              border: '2px solid rgba(255,255,255,0.4)',
              transition: 'all 0.3s ease',
              opacity: filter === 'completed' ? 1 : 0.8
            }}
            onClick={() => setFilter('completed')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
            }}
          >
            <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{filledCount}</div>
            <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filled</div>
          </div>
        </div>
      )}

      {/* Enhanced Filter Panel */}
      {activeTab === 'prescriptions' && (
        <div className="ema-filter-panel">
          <div className="ema-filter-row">
            <div className="ema-filter-group">
              <label className="ema-filter-label">Search</label>
              <input
                type="text"
                className="ema-filter-input"
                placeholder="Search prescriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Status</label>
              <select
                className="ema-filter-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as RxFilter)}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="ordered">Sent</option>
                <option value="completed">Filled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="ema-filter-group">
              <label htmlFor="erx-status-filter" className="ema-filter-label">eRx Status</label>
              <select
                id="erx-status-filter"
                className="ema-filter-select"
                value={erxStatusFilter}
                onChange={(e) => setErxStatusFilter(e.target.value as ERxStatus | '')}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Written Date (From)</label>
              <input
                type="date"
                className="ema-filter-input"
                value={writtenDateFrom}
                onChange={(e) => setWrittenDateFrom(e.target.value)}
              />
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Written Date (To)</label>
              <input
                type="date"
                className="ema-filter-input"
                value={writtenDateTo}
                onChange={(e) => setWrittenDateTo(e.target.value)}
              />
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">
                <input
                  type="checkbox"
                  checked={controlledSubstanceFilter}
                  onChange={(e) => setControlledSubstanceFilter(e.target.checked)}
                  style={{ marginRight: '0.5rem' }}
                />
                Controlled Substances Only
              </label>
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">&nbsp;</label>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prescriptions Table */}
      {activeTab === 'prescriptions' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : filteredRx.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#ffffff',
              margin: '1rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Prescriptions Found</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>
              {filter !== 'all' ? 'Try adjusting your filters' : 'Create your first prescription'}
            </p>
          </div>
        ) : (
          <table className="ema-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedRx.size === filteredRx.length && filteredRx.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Patient</th>
                <th>Medication</th>
                <th>Sig</th>
                <th>Qty / Refills</th>
                <th>Status</th>
                <th>PA Status</th>
                <th>Audit</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRx.map((rx) => {
                const lines = (rx.details || '').split('\n');
                const medication = lines[0] || '';
                const qty = lines.find((l) => l.startsWith('Qty:'))?.replace('Qty: ', '') || '';
                const sig = lines.find((l) => l.startsWith('Sig:'))?.replace('Sig: ', '') || '';
                const refills = lines.find((l) => l.startsWith('Refills:'))?.replace('Refills: ', '') || '0';
                const paRequest = getPAStatusForRx(rx.id);

                return (
                  <tr
                    key={rx.id}
                    style={{
                      background: rx.status === 'completed' ? '#f0fdf4' : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRx.has(rx.id)}
                        onChange={() => toggleRxSelection(rx.id)}
                      />
                    </td>
                    <td>
                      <a href="#" className="ema-patient-link">
                        {getPatientName(rx.patientId)}
                      </a>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{medication}</div>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{sig}</td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {qty} / {refills} refills
                    </td>
                    <td>
                      <span
                        className={`ema-status ${
                          rx.status === 'completed'
                            ? 'established'
                            : rx.status === 'ordered'
                            ? 'pending'
                            : rx.status === 'cancelled'
                            ? 'cancelled'
                            : 'pending'
                        }`}
                      >
                        {rx.status}
                      </span>
                    </td>
                    <td>
                      {paRequest ? (
                        <div
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleViewPADetail(paRequest.id)}
                          title="Click to view PA details"
                        >
                          <PAStatusBadge status={paRequest.status} size="sm" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestPA(rx)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#eff6ff',
                            color: '#3b82f6',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          Request PA
                        </button>
                      )}
                    </td>
                    <td>
                      {(rx as any).audit_confirmed_at ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          Confirmed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAuditConfirm(rx)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Confirm
                        </button>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {new Date(rx.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {rx.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSendErx(rx)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: '#0369a1',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Send eRx
                            </button>
                            <button
                              type="button"
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Print
                            </button>
                          </>
                        )}
                        {rx.status === 'ordered' && (
                          <button
                            type="button"
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Resend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {/* Refill Requests Table */}
      {activeTab === 'refills' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : refillRequests.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#ffffff',
              margin: '1rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Refill Requests</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>All refill requests have been processed</p>
          </div>
        ) : (
          <table className="ema-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Drug</th>
                <th>Requested Date</th>
                <th>Original Rx Date</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refillRequests.map((refill) => (
                <tr key={refill.id}>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {refill.patientFirstName} {refill.patientLastName}
                    </a>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{refill.medication_name}</div>
                    {refill.strength && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{refill.strength}</div>}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {new Date(refill.requested_date).toLocaleDateString()}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {refill.original_rx_date ? new Date(refill.original_rx_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td>{refill.providerName || 'N/A'}</td>
                  <td>
                    <span
                      className={`ema-status ${
                        refill.status === 'approved'
                          ? 'established'
                          : refill.status === 'denied'
                          ? 'cancelled'
                          : 'pending'
                      }`}
                    >
                      {refill.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {refill.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveRefill(refill.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPrescription(refill);
                              setShowDenyModal(true);
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Deny
                          </button>
                          <button
                            type="button"
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            View Original
                          </button>
                        </>
                      )}
                      {refill.status === 'denied' && refill.denial_reason && (
                        <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                          {refill.denial_reason}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {/* Rx Change Requests Table */}
      {activeTab === 'changeRequests' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : changeRequests.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#ffffff',
              margin: '1rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Change Requests</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>All change requests have been processed</p>
          </div>
        ) : (
          <table className="ema-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Original Drug</th>
                <th>Requested Change</th>
                <th>Pharmacy</th>
                <th>Request Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {changeRequests.map((change) => (
                <tr key={change.id}>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {change.patientFirstName} {change.patientLastName}
                    </a>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{change.original_drug}</div>
                    {change.original_strength && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{change.original_strength}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{change.change_type}</div>
                    {change.requested_drug && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {change.requested_drug} {change.requested_strength}
                      </div>
                    )}
                    {change.change_reason && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                        Reason: {change.change_reason}
                      </div>
                    )}
                  </td>
                  <td>{change.pharmacy_name || 'N/A'}</td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {new Date(change.request_date).toLocaleDateString()}
                  </td>
                  <td>
                    <span
                      className={`ema-status ${
                        change.status === 'approved' || change.status === 'approved_with_modification'
                          ? 'established'
                          : change.status === 'denied'
                          ? 'cancelled'
                          : 'pending'
                      }`}
                    >
                      {change.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {change.status === 'pending_review' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveChange(change.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPrescription(change);
                              setShowDenyChangeModal(true);
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Deny
                          </button>
                        </>
                      )}
                      {change.response_notes && (
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {change.response_notes}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {/* New Rx Modal */}
      <Modal isOpen={showNewRxModal} title="New Prescription" onClose={() => setShowNewRxModal(false)} size="lg">
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={newRx.patientId}
              onChange={(e) => setNewRx((prev) => ({ ...prev, patientId: e.target.value }))}
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Medication *</label>
            <select
              value={newRx.medication}
              onChange={(e) => setNewRx((prev) => ({ ...prev, medication: e.target.value }))}
            >
              <option value="">Select medication...</option>
              {COMMON_DERM_MEDS.map((med) => (
                <option key={med.name} value={med.name}>
                  {med.name} ({med.category})
                </option>
              ))}
            </select>
            <DrugInteractionChecker
              medicationName={newRx.medication}
              patientId={newRx.patientId}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Quantity</label>
              <select
                value={newRx.quantity}
                onChange={(e) => setNewRx((prev) => ({ ...prev, quantity: e.target.value }))}
              >
                {QUANTITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Frequency</label>
              <select
                value={newRx.frequency}
                onChange={(e) => setNewRx((prev) => ({ ...prev, frequency: e.target.value }))}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Refills</label>
              <select
                value={newRx.refills}
                onChange={(e) => setNewRx((prev) => ({ ...prev, refills: e.target.value }))}
              >
                {['0', '1', '2', '3', '4', '5', '6', '11'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Additional Instructions</label>
            <textarea
              value={newRx.instructions}
              onChange={(e) => setNewRx((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="Apply to affected area..."
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>Pharmacy</label>
            <input
              type="text"
              value={newRx.pharmacy}
              onChange={(e) => setNewRx((prev) => ({ ...prev, pharmacy: e.target.value }))}
              placeholder="CVS, Walgreens, etc."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowNewRxModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateRx} disabled={sending}>
            {sending ? 'Creating...' : 'Create Prescription'}
          </button>
        </div>
      </Modal>

      {/* Deny Refill Modal */}
      <Modal isOpen={showDenyModal} title="Deny Refill Request" onClose={() => setShowDenyModal(false)} size="md">
        <div className="modal-form">
          <div className="form-field">
            <label>Denial Reason *</label>
            <select
              value={denyForm.reason}
              onChange={(e) => setDenyForm((prev) => ({ ...prev, reason: e.target.value }))}
            >
              <option value="">Select reason...</option>
              {DENIAL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Additional Notes</label>
            <textarea
              value={denyForm.notes}
              onChange={(e) => setDenyForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Provide additional details..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowDenyModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleDenyRefill} disabled={sending}>
            {sending ? 'Denying...' : 'Deny Refill'}
          </button>
        </div>
      </Modal>

      {/* Deny Change Request Modal */}
      <Modal
        isOpen={showDenyChangeModal}
        title="Deny Change Request"
        onClose={() => setShowDenyChangeModal(false)}
        size="md"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Response Notes *</label>
            <textarea
              value={denyForm.notes}
              onChange={(e) => setDenyForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Provide reason for denial..."
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowDenyChangeModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleDenyChange} disabled={sending}>
            {sending ? 'Denying...' : 'Deny Change Request'}
          </button>
        </div>
      </Modal>

      {/* Request Change Modal */}
      <Modal
        isOpen={showChangeModal}
        title="Request Medication Change"
        onClose={() => setShowChangeModal(false)}
        size="md"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Change Type *</label>
            <select
              value={changeForm.changeType}
              onChange={(e) => setChangeForm((prev) => ({ ...prev, changeType: e.target.value }))}
            >
              <option value="">Select change type...</option>
              {CHANGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Change Details *</label>
            <textarea
              value={changeForm.details}
              onChange={(e) => setChangeForm((prev) => ({ ...prev, details: e.target.value }))}
              placeholder="Describe the requested change..."
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowChangeModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleRequestChange} disabled={sending}>
            {sending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </Modal>

      {/* PA Request Modal */}
      <PARequestModal
        isOpen={showPARequestModal}
        onClose={() => {
          setShowPARequestModal(false);
          setSelectedRxForPA(undefined);
        }}
        onSuccess={() => {
          loadData();
        }}
        prescription={selectedRxForPA}
      />

      {/* PA Detail Modal */}
      {selectedPARequestId && (
        <PADetailModal
          isOpen={showPADetailModal}
          onClose={() => {
            setShowPADetailModal(false);
            setSelectedPARequestId(null);
          }}
          paRequestId={selectedPARequestId}
          onUpdate={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
