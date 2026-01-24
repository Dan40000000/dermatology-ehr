import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { InsuranceStatusBadge } from '../components/Insurance';
import { useEligibilityByPatient } from '../hooks/useEligibilityByPatient';
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

type RxFilter = 'all' | 'pending' | 'ordered' | 'completed' | 'cancelled' | 'printed' | 'voided';
type TabType = 'prescriptions' | 'epa' | 'refills' | 'refillsDenied' | 'changeRequests' | 'auditConfirm';
type ERxStatus = 'any' | 'pending' | 'success' | 'error';

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

  // Enhanced filter states - matching EMA Rx page
  const [providerFilter, setProviderFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [visitFilter, setVisitFilter] = useState('');
  const [dobFilter, setDobFilter] = useState('');
  const [writtenDateFrom, setWrittenDateFrom] = useState('');
  const [writtenDateTo, setWrittenDateTo] = useState('');
  const [erxStatusFilter, setErxStatusFilter] = useState<ERxStatus>('any');
  const [controlledSubstanceFilter, setControlledSubstanceFilter] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(25);

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

  const eligibilityPatientIds = useMemo(
    () => prescriptions.map((rx) => rx.patientId),
    [prescriptions]
  );
  const { eligibilityByPatient, eligibilityLoading } = useEligibilityByPatient(session, eligibilityPatientIds);

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

  const getPatientInsurance = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient?.insurance) return null;
    if (typeof patient.insurance === 'string') return patient.insurance;
    if (patient.insurance.planName) return patient.insurance.planName;
    return 'On file';
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
    setProviderFilter('');
    setPatientFilter('');
    setVisitFilter('');
    setDobFilter('');
    setWrittenDateFrom('');
    setWrittenDateTo('');
    setErxStatusFilter('any');
    setControlledSubstanceFilter(false);
  };

  // Stats
  const pendingCount = prescriptions.filter((r) => r.status === 'pending').length;
  const sentCount = prescriptions.filter((r) => r.status === 'ordered').length;
  const filledCount = prescriptions.filter((r) => r.status === 'completed').length;
  const refillPendingCount = refillRequests.filter((r) => r.status === 'pending').length;
  const changePendingCount = changeRequests.filter((r) => r.status === 'pending_review').length;

  // Pagination calculations
  const totalRecords = filteredRx.length;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedRx = filteredRx.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm, providerFilter, patientFilter, writtenDateFrom, writtenDateTo, erxStatusFilter, controlledSubstanceFilter]);

  return (
    <div className="prescriptions-page" style={{
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      {/* Action Bar - Enhanced with Icons */}
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
          <span style={{ fontSize: '1.2rem' }}>➕</span>
          Add New Rx
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
        }} onMouseEnter={(e) => {
          if (selectedRx.size > 0) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          <span style={{ fontSize: '1.1rem' }}>📧</span>
          ePrescribe Selected {selectedRx.size > 0 && `(${selectedRx.size})`}
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
        }} onMouseEnter={(e) => {
          if (selectedRx.size > 0) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          <span style={{ fontSize: '1.1rem' }}>🔄</span>
          Refill Selected {selectedRx.size > 0 && `(${selectedRx.size})`}
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
        }} onMouseEnter={(e) => {
          if (selectedRx.size > 0) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          <span style={{ fontSize: '1.1rem' }}>🖨️</span>
          Print Selected {selectedRx.size > 0 && `(${selectedRx.size})`}
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

      {/* Enhanced Tabs - EMA Style */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '1rem 1.5rem',
        background: 'rgba(255,255,255,0.9)',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
        border: '2px solid #c4b5fd',
        overflowX: 'auto'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('prescriptions')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'prescriptions' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'prescriptions' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'prescriptions' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'prescriptions' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          Rx
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('epa')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'epa' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'epa' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'epa' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'epa' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          ePA
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('refills')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'refills' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'refills' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'refills' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'refills' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          Refill Req. {refillPendingCount > 0 && `(${refillPendingCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('refillsDenied')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'refillsDenied' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'refillsDenied' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'refillsDenied' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'refillsDenied' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          Refill Req. Denied with New Rx to follow
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('changeRequests')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'changeRequests' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'changeRequests' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'changeRequests' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'changeRequests' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          Rx Change Requests {changePendingCount > 0 && `(${changePendingCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('auditConfirm')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: activeTab === 'auditConfirm' ? '3px solid #7c3aed' : '3px solid transparent',
            background: activeTab === 'auditConfirm' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
            color: activeTab === 'auditConfirm' ? '#7c3aed' : '#6b7280',
            fontWeight: activeTab === 'auditConfirm' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
        >
          Rx Audit Confirmation
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

      {/* Enhanced Filter Panel - EMA Style Rx Management */}
      {activeTab === 'prescriptions' && (
        <div style={{
          background: '#ffffff',
          padding: '1.5rem',
          borderRadius: '10px',
          marginBottom: '1.5rem',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
          border: '2px solid #c4b5fd'
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔍</span>
            Rx Management Filter Panel
          </h3>

          {/* Row 1: Provider, Written Date From */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div className="ema-filter-group">
              <label className="ema-filter-label">Provider</label>
              <input
                type="text"
                className="ema-filter-input"
                placeholder="Last, First"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%'
                }}
              />
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Written Date From *</label>
              <input
                type="date"
                className="ema-filter-input"
                value={writtenDateFrom}
                onChange={(e) => setWrittenDateFrom(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* Row 2: Status, Written Date To */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div className="ema-filter-group">
              <label className="ema-filter-label">Status</label>
              <select
                className="ema-filter-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as RxFilter)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%',
                  background: '#ffffff'
                }}
              >
                <option value="all">Any</option>
                <option value="pending">Pending</option>
                <option value="printed">Printed</option>
                <option value="ordered">eRx</option>
                <option value="voided">Voided</option>
                <option value="cancelled">Canceled eRx</option>
              </select>
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Written Date To</label>
              <input
                type="date"
                className="ema-filter-input"
                value={writtenDateTo}
                onChange={(e) => setWrittenDateTo(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* Row 3: Patient, Visit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div className="ema-filter-group">
              <label className="ema-filter-label">Patient</label>
              <input
                type="text"
                className="ema-filter-input"
                placeholder="Last, First"
                value={patientFilter}
                onChange={(e) => setPatientFilter(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%'
                }}
              />
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Visit</label>
              <select
                className="ema-filter-select"
                value={visitFilter}
                onChange={(e) => setVisitFilter(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%',
                  background: '#ffffff'
                }}
              >
                <option value="">All Visits</option>
                <option value="office">Office Visit</option>
                <option value="telehealth">Telehealth</option>
                <option value="followup">Follow-up</option>
              </select>
            </div>
          </div>

          {/* Row 4: eRx Status, Date of Birth */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div className="ema-filter-group">
              <label htmlFor="erx-status-filter" className="ema-filter-label">eRx</label>
              <select
                id="erx-status-filter"
                className="ema-filter-select"
                value={erxStatusFilter}
                onChange={(e) => setErxStatusFilter(e.target.value as ERxStatus)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%',
                  background: '#ffffff'
                }}
              >
                <option value="any">Any</option>
                <option value="pending">Pending</option>
                <option value="error">Errors</option>
                <option value="success">Success</option>
              </select>
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">Date of Birth</label>
              <input
                type="date"
                className="ema-filter-input"
                value={dobFilter}
                onChange={(e) => setDobFilter(e.target.value)}
                style={{
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* Row 5: Controlled Substance checkbox */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={controlledSubstanceFilter}
                onChange={(e) => setControlledSubstanceFilter(e.target.checked)}
                style={{
                  width: '1.125rem',
                  height: '1.125rem',
                  cursor: 'pointer'
                }}
              />
              Controlled Substance
            </label>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                // Apply filters logic (already happens through state)
                showSuccess('Filters applied');
              }}
              style={{
                padding: '0.625rem 1.5rem',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(124, 58, 237, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(124, 58, 237, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(124, 58, 237, 0.3)';
              }}
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                padding: '0.625rem 1.5rem',
                background: '#ffffff',
                color: '#6b7280',
                border: '2px solid #d1d5db',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              Clear Filters
            </button>
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
          <>
            <div style={{
              background: '#ffffff',
              borderRadius: '10px',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
              border: '2px solid #c4b5fd',
              overflow: 'hidden'
            }}>
              <table className="ema-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRx.size === paginatedRx.length && paginatedRx.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Patient</th>
                    <th>
                      Coverage
                      {eligibilityLoading && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#9ca3af' }}>
                          updating...
                        </span>
                      )}
                    </th>
                    <th>Drug</th>
                    <th>Written On</th>
                    <th>Last Update</th>
                    <th>Written By</th>
                    <th>Status</th>
                    <th>Additional Detail</th>
                    <th>ePA Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRx.map((rx) => {
                    const lines = (rx.details || '').split('\n');
                    const medication = lines[0] || '';
                    const qty = lines.find((l) => l.startsWith('Qty:'))?.replace('Qty: ', '') || '';
                    const sig = lines.find((l) => l.startsWith('Sig:'))?.replace('Sig: ', '') || '';
                    const refills = lines.find((l) => l.startsWith('Refills:'))?.replace('Refills: ', '') || '0';
                    const paRequest = getPAStatusForRx(rx.id);
                    const eligibility = eligibilityByPatient[rx.patientId];
                    const insuranceLabel = getPatientInsurance(rx.patientId);

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
                          <a href="#" className="ema-patient-link" style={{
                            color: '#0369a1',
                            textDecoration: 'none',
                            fontWeight: 600
                          }}>
                            {getPatientName(rx.patientId)}
                          </a>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <InsuranceStatusBadge
                              status={eligibility?.verification_status}
                              verifiedAt={eligibility?.verified_at}
                              hasIssues={eligibility?.has_issues}
                              size="sm"
                            />
                            {insuranceLabel ? (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                {insuranceLabel}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>No insurance</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{medication}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Qty: {qty} | Refills: {refills}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                          {new Date(rx.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                          {new Date(rx.updatedAt || rx.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                          Dr. {session?.userName || 'Provider'}
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
                            style={{
                              padding: '0.375rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textTransform: 'capitalize'
                            }}
                          >
                            {rx.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {sig}
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
                                padding: '0.375rem 0.625rem',
                                background: '#eff6ff',
                                color: '#3b82f6',
                                border: '1px solid #3b82f6',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              Request PA
                            </button>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                            {rx.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendErx(rx)}
                                  style={{
                                    padding: '0.375rem 0.625rem',
                                    background: 'linear-gradient(135deg, #0369a1, #0284c7)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  Send eRx
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    padding: '0.375rem 0.625rem',
                                    background: '#ffffff',
                                    color: '#6b7280',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
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
                                  padding: '0.375rem 0.625rem',
                                  background: '#ffffff',
                                  color: '#6b7280',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
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
            </div>

            {/* Pagination Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              background: '#ffffff',
              borderRadius: '10px',
              marginTop: '1rem',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
              border: '2px solid #c4b5fd',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              {/* Total Counter */}
              <div style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151'
              }}>
                Total Matching Rx: <span style={{ color: '#7c3aed', fontWeight: 700 }}>{totalRecords}</span>
              </div>

              {/* Pagination Info & Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                {/* Records per page */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <label style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#374151'
                  }}>
                    Records per page:
                  </label>
                  <select
                    value={recordsPerPage}
                    onChange={(e) => {
                      setRecordsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '0.375rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Page info */}
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151'
                }}>
                  Page {currentPage} of {totalPages || 1}
                </div>

                {/* Navigation buttons */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: currentPage === 1 ? '#f3f4f6' : '#ffffff',
                      color: currentPage === 1 ? '#9ca3af' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: currentPage === 1 ? '#f3f4f6' : '#ffffff',
                      color: currentPage === 1 ? '#9ca3af' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: currentPage === totalPages || totalPages === 0 ? '#f3f4f6' : '#ffffff',
                      color: currentPage === totalPages || totalPages === 0 ? '#9ca3af' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: currentPage === totalPages || totalPages === 0 ? '#f3f4f6' : '#ffffff',
                      color: currentPage === totalPages || totalPages === 0 ? '#9ca3af' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </>
        ))}

      {/* ePA (electronic Prior Authorization) Tab */}
      {activeTab === 'epa' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : paRequests.length === 0 ? (
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
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Prior Authorization Requests</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>All PA requests have been processed</p>
          </div>
        ) : (
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
            border: '2px solid #c4b5fd',
            overflow: 'hidden'
          }}>
            <table className="ema-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Drug</th>
                  <th>Provider</th>
                  <th>Request Date</th>
                  <th>Status</th>
                  <th>Insurance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paRequests.map((pa) => (
                  <tr key={pa.id}>
                    <td>
                      <a href="#" className="ema-patient-link" style={{
                        color: '#0369a1',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}>
                        {pa.patientName || 'Unknown Patient'}
                      </a>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{pa.medication_name || 'Unknown Medication'}</div>
                    </td>
                    <td>{pa.provider_name || 'Dr. Provider'}</td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {new Date(pa.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <PAStatusBadge status={pa.status} size="md" />
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{pa.insurance_name || 'N/A'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleViewPADetail(pa.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: '#7c3aed',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
            border: '2px solid #c4b5fd',
            overflow: 'hidden'
          }}>
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
                      <a href="#" className="ema-patient-link" style={{
                        color: '#0369a1',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}>
                        {refill.patientFirstName} {refill.patientLastName}
                      </a>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{refill.medication_name}</div>
                      {refill.strength && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{refill.strength}</div>}
                    </td>
                    <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                      {new Date(refill.requested_date).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                      {refill.original_rx_date ? new Date(refill.original_rx_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{refill.providerName || 'N/A'}</td>
                    <td>
                      <span
                        className={`ema-status ${
                          refill.status === 'approved'
                            ? 'established'
                            : refill.status === 'denied'
                            ? 'cancelled'
                            : 'pending'
                        }`}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}
                      >
                        {refill.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {refill.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveRefill(refill.id)}
                              style={{
                                padding: '0.375rem 0.625rem',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
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
                                padding: '0.375rem 0.625rem',
                                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              Deny
                            </button>
                            <button
                              type="button"
                              style={{
                                padding: '0.375rem 0.625rem',
                                background: '#ffffff',
                                color: '#6b7280',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              View Original
                            </button>
                          </>
                        )}
                        {refill.status === 'denied' && refill.denial_reason && (
                          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
                            {refill.denial_reason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* Refill Requests Denied with New Rx to Follow Tab */}
      {activeTab === 'refillsDenied' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : (
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
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Denied Refill Requests</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>Denied refill requests requiring new prescriptions will appear here</p>
          </div>
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
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
            border: '2px solid #c4b5fd',
            overflow: 'hidden'
          }}>
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
                      <a href="#" className="ema-patient-link" style={{
                        color: '#0369a1',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}>
                        {change.patientFirstName} {change.patientLastName}
                      </a>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{change.original_drug}</div>
                      {change.original_strength && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{change.original_strength}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#374151' }}>{change.change_type}</div>
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
                    <td style={{ fontSize: '0.875rem' }}>{change.pharmacy_name || 'N/A'}</td>
                    <td style={{ fontSize: '0.875rem', color: '#374151' }}>
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
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}
                      >
                        {change.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {change.status === 'pending_review' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveChange(change.id)}
                              style={{
                                padding: '0.375rem 0.625rem',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
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
                                padding: '0.375rem 0.625rem',
                                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              Deny
                            </button>
                          </>
                        )}
                        {change.response_notes && (
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
                            {change.response_notes}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* Rx Audit Confirmation Tab */}
      {activeTab === 'auditConfirm' &&
        (loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : (
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
            border: '2px solid #c4b5fd',
            overflow: 'hidden'
          }}>
            <table className="ema-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Drug</th>
                  <th>Written On</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Audit Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions
                  .filter((rx) => !(rx as any).audit_confirmed_at)
                  .slice(0, 50)
                  .map((rx) => {
                    const lines = (rx.details || '').split('\n');
                    const medication = lines[0] || '';

                    return (
                      <tr key={rx.id}>
                        <td>
                          <a href="#" className="ema-patient-link" style={{
                            color: '#0369a1',
                            textDecoration: 'none',
                            fontWeight: 600
                          }}>
                            {getPatientName(rx.patientId)}
                          </a>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{medication}</div>
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                          {new Date(rx.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>Dr. {session?.userName || 'Provider'}</td>
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
                          <span style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: '#fef3c7',
                            color: '#b45309'
                          }}>
                            Pending Audit
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleAuditConfirm(rx)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            Confirm Audit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {prescriptions.filter((rx) => !(rx as any).audit_confirmed_at).length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#6b7280'
              }}>
                All prescriptions have been audited
              </div>
            )}
          </div>
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
