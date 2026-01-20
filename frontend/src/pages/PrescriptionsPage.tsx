import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import {
  fetchOrders,
  fetchPatients,
  createOrder,
  sendErx,
  fetchRefillRequests,
  denyRefill,
  requestMedicationChange,
  confirmAudit,
  fetchPARequests,
  checkPDMP,
  getLastPDMPCheck,
  fetchPatientMedicationHistory,
  checkFormulary,
} from '../api';
import type { Order, Patient } from '../types';
import { PARequestModal, PAStatusBadge, PADetailModal, DrugInteractionChecker } from '../components/prescriptions';

type RxFilter = 'all' | 'pending' | 'ordered' | 'completed' | 'cancelled';
type TabType = 'prescriptions' | 'refills';

const DERM_MEDICATIONS = [
  // TOPICAL CORTICOSTEROIDS - Class 1 (Super Potent)
  { name: 'Clobetasol 0.05% cream', category: 'Topical Steroid (Class 1)' },
  { name: 'Clobetasol 0.05% ointment', category: 'Topical Steroid (Class 1)' },
  { name: 'Betamethasone dipropionate 0.05% ointment', category: 'Topical Steroid (Class 1)' },

  // TOPICAL CORTICOSTEROIDS - Class 2 (Potent)
  { name: 'Betamethasone dipropionate 0.05% cream', category: 'Topical Steroid (Class 2)' },
  { name: 'Fluocinonide 0.05% cream', category: 'Topical Steroid (Class 2)' },
  { name: 'Fluocinonide 0.05% ointment', category: 'Topical Steroid (Class 2)' },

  // TOPICAL CORTICOSTEROIDS - Class 3-4 (Upper Mid-Strength)
  { name: 'Triamcinolone 0.1% cream', category: 'Topical Steroid (Class 4)' },
  { name: 'Triamcinolone 0.1% ointment', category: 'Topical Steroid (Class 4)' },
  { name: 'Fluticasone 0.05% cream', category: 'Topical Steroid (Class 4)' },

  // TOPICAL CORTICOSTEROIDS - Class 6-7 (Mild)
  { name: 'Hydrocortisone 2.5% cream', category: 'Topical Steroid (Class 7)' },
  { name: 'Hydrocortisone 2.5% ointment', category: 'Topical Steroid (Class 7)' },
  { name: 'Hydrocortisone 1% cream', category: 'Topical Steroid (Class 7)' },

  // TOPICAL RETINOIDS
  { name: 'Tretinoin 0.025% cream', category: 'Topical Retinoid' },
  { name: 'Tretinoin 0.05% cream', category: 'Topical Retinoid' },
  { name: 'Tretinoin 0.1% cream', category: 'Topical Retinoid' },
  { name: 'Tretinoin 0.025% gel', category: 'Topical Retinoid' },
  { name: 'Tretinoin 0.05% gel', category: 'Topical Retinoid' },
  { name: 'Tretinoin 0.1% gel', category: 'Topical Retinoid' },
  { name: 'Adapalene 0.1% gel', category: 'Topical Retinoid' },
  { name: 'Adapalene 0.3% gel', category: 'Topical Retinoid' },
  { name: 'Tazarotene 0.05% cream', category: 'Topical Retinoid' },
  { name: 'Tazarotene 0.1% cream', category: 'Topical Retinoid' },
  { name: 'Tazarotene 0.05% gel', category: 'Topical Retinoid' },
  { name: 'Tazarotene 0.1% gel', category: 'Topical Retinoid' },

  // TOPICAL ANTIBIOTICS
  { name: 'Mupirocin 2% ointment', category: 'Topical Antibiotic' },
  { name: 'Clindamycin 1% solution', category: 'Topical Antibiotic' },
  { name: 'Clindamycin 1% gel', category: 'Topical Antibiotic' },
  { name: 'Clindamycin 1% lotion', category: 'Topical Antibiotic' },
  { name: 'Erythromycin 2% solution', category: 'Topical Antibiotic' },
  { name: 'Metronidazole 0.75% gel', category: 'Topical Antibiotic' },
  { name: 'Metronidazole 1% gel', category: 'Topical Antibiotic' },
  { name: 'Metronidazole 0.75% cream', category: 'Topical Antibiotic' },
  { name: 'Metronidazole 1% cream', category: 'Topical Antibiotic' },

  // ORAL ANTIBIOTICS
  { name: 'Doxycycline 50mg capsule', category: 'Oral Antibiotic' },
  { name: 'Doxycycline 100mg capsule', category: 'Oral Antibiotic' },
  { name: 'Minocycline 50mg capsule', category: 'Oral Antibiotic' },
  { name: 'Minocycline 100mg capsule', category: 'Oral Antibiotic' },
  { name: 'Cephalexin 250mg capsule', category: 'Oral Antibiotic' },
  { name: 'Cephalexin 500mg capsule', category: 'Oral Antibiotic' },
  { name: 'Trimethoprim-sulfamethoxazole DS tablet', category: 'Oral Antibiotic' },

  // SYSTEMIC MEDICATIONS
  { name: 'Isotretinoin (Accutane) 10mg capsule', category: 'Systemic - Retinoid' },
  { name: 'Isotretinoin (Accutane) 20mg capsule', category: 'Systemic - Retinoid' },
  { name: 'Isotretinoin (Accutane) 40mg capsule', category: 'Systemic - Retinoid' },
  { name: 'Methotrexate 2.5mg tablet', category: 'Systemic - Immunosuppressant' },
  { name: 'Methotrexate 7.5mg tablet', category: 'Systemic - Immunosuppressant' },
  { name: 'Methotrexate 10mg tablet', category: 'Systemic - Immunosuppressant' },
  { name: 'Methotrexate 15mg tablet', category: 'Systemic - Immunosuppressant' },
  { name: 'Prednisone 5mg tablet', category: 'Systemic - Corticosteroid' },
  { name: 'Prednisone 10mg tablet', category: 'Systemic - Corticosteroid' },
  { name: 'Prednisone 20mg tablet', category: 'Systemic - Corticosteroid' },
  { name: 'Prednisone 50mg tablet', category: 'Systemic - Corticosteroid' },
  { name: 'Hydroxychloroquine 200mg tablet', category: 'Systemic - Antimalarial' },
  { name: 'Acitretin 10mg capsule', category: 'Systemic - Retinoid' },
  { name: 'Acitretin 25mg capsule', category: 'Systemic - Retinoid' },

  // BIOLOGICS
  { name: 'Dupixent (dupilumab) injection', category: 'Biologic - IL-4/IL-13' },
  { name: 'Humira (adalimumab) injection', category: 'Biologic - TNF Inhibitor' },
  { name: 'Enbrel (etanercept) injection', category: 'Biologic - TNF Inhibitor' },
  { name: 'Cosentyx (secukinumab) injection', category: 'Biologic - IL-17 Inhibitor' },
  { name: 'Taltz (ixekizumab) injection', category: 'Biologic - IL-17 Inhibitor' },
  { name: 'Skyrizi (risankizumab) injection', category: 'Biologic - IL-23 Inhibitor' },
  { name: 'Tremfya (guselkumab) injection', category: 'Biologic - IL-23 Inhibitor' },

  // ANTIFUNGALS - Oral
  { name: 'Terbinafine 250mg tablet', category: 'Oral Antifungal' },
  { name: 'Fluconazole 150mg tablet', category: 'Oral Antifungal' },
  { name: 'Fluconazole 200mg tablet', category: 'Oral Antifungal' },
  { name: 'Itraconazole 100mg capsule', category: 'Oral Antifungal' },

  // ANTIFUNGALS - Topical
  { name: 'Ketoconazole 2% cream', category: 'Topical Antifungal' },
  { name: 'Ketoconazole 2% shampoo', category: 'Topical Antifungal' },
  { name: 'Ciclopirox 8% nail lacquer', category: 'Topical Antifungal' },
  { name: 'Terbinafine 1% cream', category: 'Topical Antifungal' },

  // ANTIVIRALS
  { name: 'Valacyclovir 500mg tablet', category: 'Oral Antiviral' },
  { name: 'Valacyclovir 1g tablet', category: 'Oral Antiviral' },
  { name: 'Acyclovir 400mg tablet', category: 'Oral Antiviral' },
  { name: 'Acyclovir 800mg tablet', category: 'Oral Antiviral' },
  { name: 'Famciclovir 250mg tablet', category: 'Oral Antiviral' },
  { name: 'Famciclovir 500mg tablet', category: 'Oral Antiviral' },

  // ANTIHISTAMINES
  { name: 'Hydroxyzine 10mg tablet', category: 'Antihistamine' },
  { name: 'Hydroxyzine 25mg tablet', category: 'Antihistamine' },
  { name: 'Hydroxyzine 50mg tablet', category: 'Antihistamine' },
  { name: 'Diphenhydramine 25mg capsule', category: 'Antihistamine' },
  { name: 'Diphenhydramine 50mg capsule', category: 'Antihistamine' },
  { name: 'Cetirizine 10mg tablet', category: 'Antihistamine' },
  { name: 'Fexofenadine 180mg tablet', category: 'Antihistamine' },

  // TOPICAL IMMUNOMODULATORS
  { name: 'Tacrolimus 0.03% ointment', category: 'Topical Immunomodulator' },
  { name: 'Tacrolimus 0.1% ointment', category: 'Topical Immunomodulator' },
  { name: 'Pimecrolimus 1% cream', category: 'Topical Immunomodulator' },

  // OTHER TOPICALS
  { name: 'Calcipotriene 0.005% cream', category: 'Topical - Vitamin D Analog' },
  { name: 'Calcipotriene 0.005% ointment', category: 'Topical - Vitamin D Analog' },
  { name: 'Salicylic acid 6% cream', category: 'Topical - Keratolytic' },
  { name: 'Urea 40% cream', category: 'Topical - Keratolytic/Moisturizer' },
  { name: 'Imiquimod 5% cream', category: 'Topical - Immune Response Modifier' },
  { name: '5-Fluorouracil 5% cream', category: 'Topical - Chemotherapy' },
  { name: 'Benzoyl peroxide 5% gel', category: 'Topical - Antibacterial' },
  { name: 'Benzoyl peroxide 10% gel', category: 'Topical - Antibacterial' },
  { name: 'Azelaic acid 15% gel', category: 'Topical - Antibacterial/Keratolytic' },
  { name: 'Azelaic acid 20% cream', category: 'Topical - Antibacterial/Keratolytic' },
];

// Controlled substance schedules for PDMP checking
const CONTROLLED_SUBSTANCES: Record<string, string> = {
  'Hydrocodone': 'Schedule II',
  'Oxycodone': 'Schedule II',
  'Morphine': 'Schedule II',
  'Fentanyl': 'Schedule II',
  'Methylphenidate': 'Schedule II',
  'Amphetamine': 'Schedule II',
  'Codeine': 'Schedule III',
  'Ketamine': 'Schedule III',
  'Testosterone': 'Schedule III',
  'Alprazolam': 'Schedule IV',
  'Lorazepam': 'Schedule IV',
  'Diazepam': 'Schedule IV',
  'Clonazepam': 'Schedule IV',
  'Zolpidem': 'Schedule IV',
  'Tramadol': 'Schedule IV',
  'Carisoprodol': 'Schedule IV',
  'Phentermine': 'Schedule IV',
};

// Helper function to check if medication is controlled
const isControlledSubstance = (medication: string): { isControlled: boolean; schedule?: string } => {
  for (const [substance, schedule] of Object.entries(CONTROLLED_SUBSTANCES)) {
    if (medication.toLowerCase().includes(substance.toLowerCase())) {
      return { isControlled: true, schedule };
    }
  }
  return { isControlled: false };
};

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

export function PrescriptionsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('prescriptions');
  const [prescriptions, setPrescriptions] = useState<Order[]>([]);
  const [refillRequests, setRefillRequests] = useState<any[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<RxFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRx, setSelectedRx] = useState<Set<string>>(new Set());

  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showRxHistoryModal, setShowRxHistoryModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [sending, setSending] = useState(false);

  // PDMP states
  const [pdmpData, setPdmpData] = useState<any>(null);
  const [showPDMPPanel, setShowPDMPPanel] = useState(false);
  const [checkingPDMP, setCheckingPDMP] = useState(false);
  const [lastPDMPCheck, setLastPDMPCheck] = useState<any>(null);

  // Formulary states
  const [formularyData, setFormularyData] = useState<any>(null);
  const [checkingFormulary, setCheckingFormulary] = useState(false);

  // Rx History states
  const [rxHistoryData, setRxHistoryData] = useState<any>(null);
  const [loadingRxHistory, setLoadingRxHistory] = useState(false);

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

  const [medicationSearch, setMedicationSearch] = useState('');
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const medicationDropdownRef = useRef<HTMLDivElement>(null);

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
      const promises = [
        fetchOrders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchPARequests(session.tenantId, session.accessToken),
      ];

      if (activeTab === 'refills') {
        promises.push(fetchRefillRequests(session.tenantId, session.accessToken));
      }

      const results = await Promise.all(promises);
      const ordersRes = results[0];
      const patientsRes = results[1];
      const paRequestsRes = results[2];

      const rxOrders = (ordersRes.orders || []).filter((o: Order) => o.type === 'rx');
      setPrescriptions(rxOrders);
      setPatients(patientsRes.data || patientsRes.patients || []);
      setPaRequests(paRequestsRes || []);

      if (activeTab === 'refills' && results[3]) {
        setRefillRequests((results[3] as any).refillRequests || []);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [session, showError, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle click outside medication dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (medicationDropdownRef.current && !medicationDropdownRef.current.contains(event.target as Node)) {
        setShowMedicationDropdown(false);
      }
    };

    if (showMedicationDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMedicationDropdown]);

  // Load last PDMP check when patient is selected
  useEffect(() => {
    if (newRx.patientId && session) {
      loadLastPDMPCheck(newRx.patientId);
    } else {
      setLastPDMPCheck(null);
    }
  }, [newRx.patientId]);

  // Check formulary when medication is selected
  useEffect(() => {
    if (newRx.medication && session) {
      handleFormularyCheck(newRx.medication);
    } else {
      setFormularyData(null);
    }
  }, [newRx.medication]);

  // Handle URL parameters on page load
  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');

    // Handle tab parameter
    if (tab === 'refills') {
      setActiveTab('refills');
    } else if (tab === 'pending') {
      setActiveTab('prescriptions');
      setFilter('pending');
    } else if (tab) {
      // If there's an unrecognized tab, default to prescriptions
      setActiveTab('prescriptions');
    }

    // Handle action parameter
    if (action === 'new') {
      setShowNewRxModal(true);
    }
  }, [searchParams]);

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
      setMedicationSearch('');
      setShowMedicationDropdown(false);
      // Remove action parameter from URL when closing modal
      const params = new URLSearchParams(searchParams);
      params.delete('action');
      setSearchParams(params);
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

  const handleDenyRefill = async () => {
    if (!session || !selectedPrescription || !denyForm.reason) {
      showError('Please select a denial reason');
      return;
    }

    setSending(true);
    try {
      const fullReason = denyForm.notes ? `${denyForm.reason}: ${denyForm.notes}` : denyForm.reason;
      await denyRefill(session.tenantId, session.accessToken, selectedPrescription.id, fullReason);
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

  // PDMP Check handler
  const handlePDMPCheck = async () => {
    if (!session || !newRx.patientId || !newRx.medication) {
      showError('Please select patient and medication first');
      return;
    }

    setCheckingPDMP(true);
    try {
      const result = await checkPDMP(session.tenantId, session.accessToken, newRx.patientId, newRx.medication);
      setPdmpData(result);
      setShowPDMPPanel(true);
      if (result.flags && result.flags.length > 0) {
        showError(`PDMP Alert: ${result.flags.join(', ')}`);
      } else {
        showSuccess('PDMP check completed');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to check PDMP');
    } finally {
      setCheckingPDMP(false);
    }
  };

  // Load last PDMP check when patient is selected
  const loadLastPDMPCheck = async (patientId: string) => {
    if (!session) return;
    try {
      const result = await getLastPDMPCheck(session.tenantId, session.accessToken, patientId);
      setLastPDMPCheck(result.lastCheck);
    } catch (err: any) {
      console.error('Failed to load last PDMP check:', err);
    }
  };

  // Formulary check handler
  const handleFormularyCheck = async (medication: string) => {
    if (!session) return;

    setCheckingFormulary(true);
    try {
      const result = await checkFormulary(session.tenantId, session.accessToken, medication);
      setFormularyData(result);
    } catch (err: any) {
      console.error('Failed to check formulary:', err);
    } finally {
      setCheckingFormulary(false);
    }
  };

  // Rx History handler
  const handleViewRxHistory = async (patientId: string) => {
    if (!session) return;

    setLoadingRxHistory(true);
    setShowRxHistoryModal(true);
    try {
      const result = await fetchPatientMedicationHistory(session.tenantId, session.accessToken, patientId);
      setRxHistoryData(result);
    } catch (err: any) {
      showError(err.message || 'Failed to load medication history');
    } finally {
      setLoadingRxHistory(false);
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

  // Stats
  const pendingCount = prescriptions.filter((r) => r.status === 'pending').length;
  const sentCount = prescriptions.filter((r) => r.status === 'ordered').length;
  const filledCount = prescriptions.filter((r) => r.status === 'completed').length;
  const refillPendingCount = refillRequests.filter((r) => r.refill_status === 'pending').length;

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
          <span className="icon" style={{ fontSize: '1.2rem' }}>➕</span>
          New Prescription
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0} style={{
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
          <span className="icon" style={{ fontSize: '1.1rem' }}>📧</span>
          Send eRx
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0} style={{
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
          <span className="icon" style={{ fontSize: '1.1rem' }}>🖨️</span>
          Print
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!newRx.patientId}
          onClick={() => newRx.patientId && handleViewRxHistory(newRx.patientId)}
          style={{
            background: newRx.patientId ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)',
            border: '2px solid rgba(255,255,255,0.4)',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            fontWeight: 600,
            color: newRx.patientId ? '#7c3aed' : '#9ca3af',
            cursor: newRx.patientId ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (newRx.patientId) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          }}
        >
          <span className="icon" style={{ fontSize: '1.1rem' }}>📜</span>
          View Rx History
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
          <span className="icon" style={{ fontSize: '1.1rem' }}>🔄</span>
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
        <span style={{ fontSize: '1.5rem' }}>💊</span>
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
          onClick={() => {
            setActiveTab('prescriptions');
            setSearchParams({});
          }}
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
          onClick={() => {
            setActiveTab('refills');
            setSearchParams({ tab: 'refills' });
          }}
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
            onClick={() => {
              setFilter('all');
              setSearchParams({});
            }}
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
            onClick={() => {
              setFilter('pending');
              setSearchParams({ tab: 'pending' });
            }}
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
            onClick={() => {
              setFilter('ordered');
              setSearchParams({});
            }}
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
            onClick={() => {
              setFilter('completed');
              setSearchParams({});
            }}
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

      {/* Filter Panel */}
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
                onChange={(e) => {
                  const newFilter = e.target.value as RxFilter;
                  setFilter(newFilter);
                  // Update URL based on filter
                  if (newFilter === 'pending') {
                    setSearchParams({ tab: 'pending' });
                  } else if (newFilter === 'all') {
                    setSearchParams({});
                  } else {
                    // For other filters, just clear URL params
                    setSearchParams({});
                  }
                }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="ordered">Sent</option>
                <option value="completed">Filled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="ema-filter-group">
              <label className="ema-filter-label">&nbsp;</label>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={() => {
                  setFilter('all');
                  setSearchTerm('');
                  setSearchParams({});
                }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 500 }}>{medication}</div>
                        {isControlledSubstance(medication).isControlled && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.125rem 0.5rem',
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #dc2626',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                            title={`PDMP Required - ${isControlledSubstance(medication).schedule}`}
                          >
                            {isControlledSubstance(medication).schedule}
                          </span>
                        )}
                      </div>
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
                <th>Medication</th>
                <th>Last Filled</th>
                <th>Refill Status</th>
                <th>Denial Reason</th>
                <th>Change Request</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refillRequests.map((refill) => {
                const changeRequest = refill.change_request_details
                  ? JSON.parse(refill.change_request_details)
                  : null;

                return (
                  <tr key={refill.id}>
                    <td>
                      <a href="#" className="ema-patient-link">
                        {refill.patientFirstName} {refill.patientLastName}
                      </a>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{refill.medication_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{refill.strength}</div>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {refill.sent_at ? new Date(refill.sent_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <span
                        className={`ema-status ${
                          refill.refill_status === 'approved'
                            ? 'established'
                            : refill.refill_status === 'denied'
                            ? 'cancelled'
                            : refill.refill_status === 'change_requested'
                            ? 'pending'
                            : 'pending'
                        }`}
                      >
                        {refill.refill_status || 'pending'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{refill.denial_reason || '-'}</td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {changeRequest ? (
                        <div>
                          <div style={{ fontWeight: 500 }}>{changeRequest.changeType}</div>
                          <div style={{ fontSize: '0.75rem' }}>{changeRequest.details}</div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {refill.refill_status !== 'denied' && refill.refill_status !== 'approved' && (
                          <>
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
                              Deny Refill
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPrescription(refill);
                                setShowChangeModal(true);
                              }}
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
                              Request Change
                            </button>
                          </>
                        )}
                        {!refill.audit_confirmed_at && (
                          <button
                            type="button"
                            onClick={() => handleAuditConfirm(refill)}
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
                            Audit Confirm
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

      {/* New Rx Modal */}
      <Modal isOpen={showNewRxModal} title="New Prescription" onClose={() => {
        setShowNewRxModal(false);
        setMedicationSearch('');
        setShowMedicationDropdown(false);
        // Remove action parameter from URL when closing modal
        const params = new URLSearchParams(searchParams);
        params.delete('action');
        setSearchParams(params);
      }} size="lg">
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
            <div style={{ position: 'relative' }} ref={medicationDropdownRef}>
              <input
                type="text"
                value={medicationSearch || newRx.medication}
                onChange={(e) => {
                  setMedicationSearch(e.target.value);
                  setShowMedicationDropdown(true);
                  if (!e.target.value) {
                    setNewRx((prev) => ({ ...prev, medication: '' }));
                  }
                }}
                onFocus={() => setShowMedicationDropdown(true)}
                placeholder="Search or type medication name..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
              {showMedicationDropdown && medicationSearch && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    marginTop: '0.25rem',
                    zIndex: 1000,
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  {DERM_MEDICATIONS.filter(med =>
                    med.name.toLowerCase().includes(medicationSearch.toLowerCase()) ||
                    med.category.toLowerCase().includes(medicationSearch.toLowerCase())
                  ).slice(0, 50).map((med) => (
                    <div
                      key={med.name}
                      onClick={() => {
                        setNewRx((prev) => ({ ...prev, medication: med.name }));
                        setMedicationSearch('');
                        setShowMedicationDropdown(false);
                      }}
                      style={{
                        padding: '0.75rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{med.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {med.category}
                      </div>
                    </div>
                  ))}
                  {medicationSearch && DERM_MEDICATIONS.filter(med =>
                    med.name.toLowerCase().includes(medicationSearch.toLowerCase()) ||
                    med.category.toLowerCase().includes(medicationSearch.toLowerCase())
                  ).length === 0 && (
                    <div
                      onClick={() => {
                        setNewRx((prev) => ({ ...prev, medication: medicationSearch }));
                        setMedicationSearch('');
                        setShowMedicationDropdown(false);
                      }}
                      style={{
                        padding: '0.75rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f3f4f6',
                        background: '#eff6ff'
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#3b82f6' }}>
                        Use custom medication: "{medicationSearch}"
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Click to add as a custom entry
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {newRx.medication && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: '#f0fdf4',
                border: '1px solid #10b981',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#059669'
              }}>
                Selected: {newRx.medication}
              </div>
            )}
            <DrugInteractionChecker
              medicationName={newRx.medication}
              patientId={newRx.patientId}
            />
          </div>

          {/* PDMP Check Panel */}
          {newRx.medication && isControlledSubstance(newRx.medication).isControlled && (
            <div style={{
              background: '#fef2f2',
              border: '2px solid #dc2626',
              borderRadius: '8px',
              padding: '1rem',
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <strong style={{ color: '#dc2626' }}>Controlled Substance - PDMP Check Required</strong>
                </div>
                {isControlledSubstance(newRx.medication).schedule && (
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    background: '#dc2626',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}>
                    {isControlledSubstance(newRx.medication).schedule}
                  </span>
                )}
              </div>

              {lastPDMPCheck && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>✓</span>
                    <span>Last PDMP Check: {new Date(lastPDMPCheck.checked_at).toLocaleString()}</span>
                  </div>
                  {lastPDMPCheck.risk_score && (
                    <div style={{ marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                      Risk Score: <strong style={{
                        color: lastPDMPCheck.risk_score === 'High' ? '#dc2626' :
                               lastPDMPCheck.risk_score === 'Moderate' ? '#f59e0b' : '#059669'
                      }}>{lastPDMPCheck.risk_score}</strong>
                    </div>
                  )}
                </div>
              )}

              {pdmpData && showPDMPPanel && (
                <div style={{
                  background: 'white',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#dc2626' }}>
                    PDMP Results:
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <div>Risk Score: <strong style={{
                      color: pdmpData.riskScore === 'High' ? '#dc2626' :
                             pdmpData.riskScore === 'Moderate' ? '#f59e0b' : '#059669'
                    }}>{pdmpData.riskScore}</strong></div>
                    <div>Total Controlled Rx (6mo): <strong>{pdmpData.totalControlledRxLast6Months}</strong></div>
                    {pdmpData.flags && pdmpData.flags.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong style={{ color: '#dc2626' }}>Flags:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                          {pdmpData.flags.map((flag: string, idx: number) => (
                            <li key={idx} style={{ color: '#dc2626' }}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handlePDMPCheck}
                disabled={checkingPDMP || !newRx.patientId}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: checkingPDMP ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: checkingPDMP || !newRx.patientId ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                {checkingPDMP ? 'Checking PDMP...' : 'Check State PDMP Database'}
              </button>

              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#92400e'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>EPCS Required</div>
                <div>Electronic Prescribing of Controlled Substances (EPCS) requires two-factor authentication and DEA compliance.</div>
              </div>
            </div>
          )}

          {/* Formulary & Benefits Display */}
          {newRx.medication && formularyData && (
            <div style={{
              background: formularyData.status === 'Preferred' ? '#f0fdf4' :
                          formularyData.status === 'Non-Preferred' ? '#fef3c7' : '#fee2e2',
              border: `2px solid ${formularyData.status === 'Preferred' ? '#10b981' :
                                   formularyData.status === 'Non-Preferred' ? '#f59e0b' : '#ef4444'}`,
              borderRadius: '8px',
              padding: '1rem',
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.95rem' }}>Insurance Formulary</strong>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  background: formularyData.status === 'Preferred' ? '#10b981' :
                              formularyData.status === 'Non-Preferred' ? '#f59e0b' : '#ef4444',
                  color: 'white',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}>
                  {formularyData.status}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
                {formularyData.copay && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Est. Patient Copay:</span>
                    <strong>${formularyData.copay}</strong>
                  </div>
                )}

                {formularyData.priorAuthRequired && (
                  <div style={{
                    padding: '0.5rem',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '4px',
                    color: '#92400e',
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}>
                    ⚠️ Prior Authorization Required
                  </div>
                )}

                {formularyData.stepTherapyRequired && (
                  <div style={{
                    padding: '0.5rem',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '4px',
                    color: '#92400e',
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}>
                    ⚠️ Step Therapy Required
                  </div>
                )}

                {formularyData.alternatives && formularyData.alternatives.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      Preferred Alternatives:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {formularyData.alternatives.map((alt: any, idx: number) => (
                        <div key={idx} style={{
                          padding: '0.5rem',
                          background: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}>
                          <div style={{ fontWeight: 500 }}>{alt.name}</div>
                          {alt.copay && <div style={{ color: '#6b7280' }}>Copay: ${alt.copay}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {checkingFormulary && (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>
                  Checking formulary...
                </div>
              )}
            </div>
          )}

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
          <button type="button" className="btn-secondary" onClick={() => {
            setShowNewRxModal(false);
            setMedicationSearch('');
            setShowMedicationDropdown(false);
            // Remove action parameter from URL when closing modal
            const params = new URLSearchParams(searchParams);
            params.delete('action');
            setSearchParams(params);
          }}>
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

      {/* Rx History Modal */}
      <Modal
        isOpen={showRxHistoryModal}
        title="Patient Medication History (Surescripts)"
        onClose={() => {
          setShowRxHistoryModal(false);
          setRxHistoryData(null);
        }}
        size="lg"
      >
        {loadingRxHistory ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <div>Loading medication history from Surescripts...</div>
          </div>
        ) : rxHistoryData ? (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <div style={{
              background: '#f3f4f6',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Total Prescriptions:</strong>
                <span>{rxHistoryData.combinedCount || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>External Sources:</strong>
                <span>{rxHistoryData.externalHistory?.length || 0}</span>
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#374151' }}>
              Recent Prescriptions from This System
            </h4>
            {rxHistoryData.prescriptions && rxHistoryData.prescriptions.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {rxHistoryData.prescriptions.map((rx: any) => (
                  <div
                    key={rx.id}
                    style={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '1rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong style={{ color: '#1f2937' }}>{rx.medication_name || 'Unknown'}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {new Date(rx.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {rx.strength && <div>Strength: {rx.strength}</div>}
                      {rx.provider_name && <div>Prescriber: {rx.provider_name}</div>}
                      {rx.pharmacy_name && <div>Pharmacy: {rx.pharmacy_name}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                No prescriptions found in this system
              </div>
            )}

            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#374151' }}>
              External Medication History (Surescripts)
            </h4>
            {rxHistoryData.externalHistory && rxHistoryData.externalHistory.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {rxHistoryData.externalHistory.map((rx: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      padding: '1rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong style={{ color: '#1f2937' }}>{rx.medicationName || 'Unknown'}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {rx.dateFilled ? new Date(rx.dateFilled).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {rx.prescriber && <div>Prescriber: {rx.prescriber}</div>}
                      {rx.pharmacy && <div>Pharmacy: {rx.pharmacy}</div>}
                      {rx.status && <div>Status: {rx.status}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                No external medication history available
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No data available
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowRxHistoryModal(false);
              setRxHistoryData(null);
            }}
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
