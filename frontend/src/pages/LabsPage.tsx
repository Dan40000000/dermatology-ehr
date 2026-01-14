import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, fetchProviders, createOrder, updateOrderStatus } from '../api';
import type { Order, Patient, Provider } from '../types';

// Main tab type
type MainTab = 'path' | 'lab';

// Sub-tab type
type SubTab = 'pending-results' | 'pending-plan' | 'completed' | 'unresolved';

// Filter state interface
interface FilterState {
  provider: string;
  patient: string;
  facility: 'preferred' | 'all';
  preferredFacility: string;
  entryDateStart: string;
  entryDateEnd: string;
  resultsDateStart: string;
  resultsDateEnd: string;
}

// Path/Lab result interface
interface PathLabResult extends Order {
  facility?: string;
  ddx?: string;
  procedure?: string;
  location?: string;
  results?: string;
  resultsProcessed?: string;
  photos?: string[];
  entryDate?: string;
}

// Common dermatology procedures
const COMMON_DERM_PROCEDURES = [
  'Shave Biopsy',
  'Punch Biopsy',
  'Excisional Biopsy',
  'Incisional Biopsy',
  'Fine Needle Aspiration',
  'Scraping/KOH Prep',
  'Bacterial Culture',
  'Fungal Culture',
  'Viral Culture',
  'Tissue Culture',
];

// Common lab tests
const COMMON_DERM_LABS = [
  { name: 'CBC with Differential', code: '85025' },
  { name: 'Comprehensive Metabolic Panel', code: '80053' },
  { name: 'Liver Function Tests', code: '80076' },
  { name: 'Lipid Panel', code: '80061' },
  { name: 'ANA (Antinuclear Antibody)', code: '86038' },
  { name: 'ESR (Sed Rate)', code: '85652' },
  { name: 'CRP (C-Reactive Protein)', code: '86140' },
  { name: 'Vitamin D, 25-Hydroxy', code: '82306' },
  { name: 'TSH', code: '84443' },
  { name: 'Zinc Level', code: '84630' },
  { name: 'Ferritin', code: '82728' },
  { name: 'HgbA1c', code: '83036' },
  { name: 'HIV Screening', code: '86701' },
  { name: 'Hepatitis Panel', code: '80074' },
  { name: 'RPR (Syphilis)', code: '86592' },
  { name: 'Fungal Culture', code: '87101' },
  { name: 'Bacterial Culture', code: '87070' },
  { name: 'HSV PCR', code: '87529' },
];

export function LabsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [pathResults, setPathResults] = useState<PathLabResult[]>([]);
  const [labResults, setLabResults] = useState<PathLabResult[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [mainTab, setMainTab] = useState<MainTab>('path');
  const [subTab, setSubTab] = useState<SubTab>('pending-results');

  const [filters, setFilters] = useState<FilterState>({
    provider: '',
    patient: '',
    facility: 'preferred',
    preferredFacility: '',
    entryDateStart: '',
    entryDateEnd: '',
    resultsDateStart: '',
    resultsDateEnd: '',
  });

  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newEntry, setNewEntry] = useState({
    patientId: '',
    type: 'path' as 'path' | 'lab',
    procedure: '',
    tests: [] as string[],
    facility: '',
    ddx: '',
    location: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [ordersRes, patientsRes, providersRes] = await Promise.all([
        fetchOrders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      const allOrders = (ordersRes.orders || []) as PathLabResult[];

      // Separate path and lab orders
      const paths = allOrders.filter((o: PathLabResult) => o.type === 'pathology' || o.type === 'path');
      const labs = allOrders.filter((o: PathLabResult) => o.type === 'lab' || o.type === 'laboratory');

      setPathResults(paths);
      setLabResults(labs);
      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateEntry = async () => {
    if (!session || !newEntry.patientId) {
      showError('Please select a patient');
      return;
    }

    if (newEntry.type === 'path' && !newEntry.procedure) {
      showError('Please specify a procedure');
      return;
    }

    if (newEntry.type === 'lab' && newEntry.tests.length === 0) {
      showError('Please select at least one test');
      return;
    }

    setCreating(true);
    try {
      const details = newEntry.type === 'path'
        ? newEntry.procedure
        : newEntry.tests.join('\n');

      await createOrder(session.tenantId, session.accessToken, {
        patientId: newEntry.patientId,
        type: newEntry.type === 'path' ? 'pathology' : 'lab',
        details,
        notes: newEntry.notes,
        status: 'pending',
      });

      showSuccess(`${newEntry.type === 'path' ? 'Pathology' : 'Lab'} entry created`);
      setShowManualEntryModal(false);
      setNewEntry({
        patientId: '',
        type: 'path',
        procedure: '',
        tests: [],
        facility: '',
        ddx: '',
        location: '',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create entry');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    if (!session) return;

    try {
      await updateOrderStatus(session.tenantId, session.accessToken, orderId, status);
      showSuccess('Status updated');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    return provider ? provider.fullName || provider.name : 'Unknown';
  };

  const applyFilters = () => {
    const currentData = mainTab === 'path' ? pathResults : labResults;

    let filtered = currentData.filter((item) => {
      // Filter by sub-tab status
      if (subTab === 'pending-results' && item.status !== 'pending') return false;
      if (subTab === 'pending-plan' && item.status !== 'in-progress') return false;
      if (subTab === 'completed' && item.status !== 'completed') return false;
      if (subTab === 'unresolved' && item.status !== 'cancelled') return false;

      // Filter by provider
      if (filters.provider && item.providerId !== filters.provider) return false;

      // Filter by patient
      if (filters.patient && item.patientId !== filters.patient) return false;

      // Filter by entry date
      if (filters.entryDateStart && new Date(item.createdAt) < new Date(filters.entryDateStart)) return false;
      if (filters.entryDateEnd && new Date(item.createdAt) > new Date(filters.entryDateEnd)) return false;

      return true;
    });

    return filtered;
  };

  const sortData = (data: PathLabResult[]) => {
    return [...data].sort((a, b) => {
      let aVal: any = a[sortField as keyof PathLabResult];
      let bVal: any = b[sortField as keyof PathLabResult];

      // Handle patient name sorting
      if (sortField === 'patient') {
        aVal = getPatientName(a.patientId);
        bVal = getPatientName(b.patientId);
      }

      // Handle date sorting
      if (sortField === 'createdAt' || sortField === 'entryDate') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    const displayedData = sortData(applyFilters());
    if (selectedItems.size === displayedData.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(displayedData.map((item) => item.id)));
    }
  };

  const clearFilters = () => {
    setFilters({
      provider: '',
      patient: '',
      facility: 'preferred',
      preferredFacility: '',
      entryDateStart: '',
      entryDateEnd: '',
      resultsDateStart: '',
      resultsDateEnd: '',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleMoveToUnresolved = async () => {
    if (selectedItems.size === 0) return;

    try {
      for (const itemId of selectedItems) {
        await handleStatusChange(itemId, 'cancelled');
      }
      setSelectedItems(new Set());
      showSuccess(`Moved ${selectedItems.size} item(s) to unresolved`);
    } catch (err: any) {
      showError('Failed to move items to unresolved');
    }
  };

  const toggleTest = (testName: string) => {
    setNewEntry((prev) => ({
      ...prev,
      tests: prev.tests.includes(testName)
        ? prev.tests.filter((t) => t !== testName)
        : [...prev.tests, testName],
    }));
  };

  const filteredData = sortData(applyFilters());

  // Count by sub-tab
  const currentData = mainTab === 'path' ? pathResults : labResults;
  const pendingResultsCount = currentData.filter((i) => i.status === 'pending').length;
  const pendingPlanCount = currentData.filter((i) => i.status === 'in-progress').length;
  const completedCount = currentData.filter((i) => i.status === 'completed').length;
  const unresolvedCount = currentData.filter((i) => i.status === 'cancelled').length;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(251, 113, 133, 0.3)',
    }}>
      {/* Page Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Pathology & Lab Orders</h1>
      </div>

      {/* Main Tabs: Path / Lab */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px 12px 0 0',
        marginBottom: '0',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="ema-tabs" style={{
          display: 'flex',
          borderBottom: '2px solid #e5e7eb',
          padding: '0 1rem',
        }}>
          <button
            type="button"
            className={`ema-tab ${mainTab === 'path' ? 'active' : ''}`}
            onClick={() => {
              setMainTab('path');
              setSelectedItems(new Set());
            }}
            style={{
              padding: '1rem 1.5rem',
              background: mainTab === 'path' ? 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)' : 'transparent',
              color: mainTab === 'path' ? '#ffffff' : '#6b7280',
              border: 'none',
              borderBottom: mainTab === 'path' ? '3px solid #f43f5e' : '3px solid transparent',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              borderRadius: '8px 8px 0 0',
            }}
          >
            Path
          </button>
          <button
            type="button"
            className={`ema-tab ${mainTab === 'lab' ? 'active' : ''}`}
            onClick={() => {
              setMainTab('lab');
              setSelectedItems(new Set());
            }}
            style={{
              padding: '1rem 1.5rem',
              background: mainTab === 'lab' ? 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)' : 'transparent',
              color: mainTab === 'lab' ? '#ffffff' : '#6b7280',
              border: 'none',
              borderBottom: mainTab === 'lab' ? '3px solid #f43f5e' : '3px solid transparent',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              borderRadius: '8px 8px 0 0',
            }}
          >
            Lab
          </button>
        </div>

        {/* Sub-Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <button
            type="button"
            onClick={() => setSubTab('pending-results')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'pending-results' ? '#ffffff' : 'transparent',
              border: subTab === 'pending-results' ? '2px solid #fb7185' : '2px solid transparent',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: subTab === 'pending-results' ? '#f43f5e' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Pending Results
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              background: subTab === 'pending-results' ? '#fb7185' : '#e5e7eb',
              color: subTab === 'pending-results' ? '#ffffff' : '#6b7280',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {pendingResultsCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('pending-plan')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'pending-plan' ? '#ffffff' : 'transparent',
              border: subTab === 'pending-plan' ? '2px solid #fb7185' : '2px solid transparent',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: subTab === 'pending-plan' ? '#f43f5e' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Pending Plan Completion
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              background: subTab === 'pending-plan' ? '#fb7185' : '#e5e7eb',
              color: subTab === 'pending-plan' ? '#ffffff' : '#6b7280',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {pendingPlanCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('completed')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'completed' ? '#ffffff' : 'transparent',
              border: subTab === 'completed' ? '2px solid #fb7185' : '2px solid transparent',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: subTab === 'completed' ? '#f43f5e' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Completed
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              background: subTab === 'completed' ? '#fb7185' : '#e5e7eb',
              color: subTab === 'completed' ? '#ffffff' : '#6b7280',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {completedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('unresolved')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'unresolved' ? '#ffffff' : 'transparent',
              border: subTab === 'unresolved' ? '2px solid #fb7185' : '2px solid transparent',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: subTab === 'unresolved' ? '#f43f5e' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Unresolved
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              background: subTab === 'unresolved' ? '#fb7185' : '#e5e7eb',
              color: subTab === 'unresolved' ? '#ffffff' : '#6b7280',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {unresolvedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="ema-filter-panel" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '1.5rem',
        marginBottom: '0',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div className="ema-filter-group">
            <label className="ema-filter-label">Provider</label>
            <select
              className="ema-filter-select"
              value={filters.provider}
              onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName || p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Patient</label>
            <select
              className="ema-filter-select"
              value={filters.patient}
              onChange={(e) => setFilters({ ...filters, patient: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="">All Patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Facility</label>
            <div className="ema-radio-group" style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
              <label className="ema-radio" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  checked={filters.facility === 'preferred'}
                  onChange={() => setFilters({ ...filters, facility: 'preferred' })}
                />
                <span>Preferred</span>
              </label>
              <label className="ema-radio" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  checked={filters.facility === 'all'}
                  onChange={() => setFilters({ ...filters, facility: 'all' })}
                />
                <span>All</span>
              </label>
            </div>
            {filters.facility === 'preferred' && (
              <select
                className="ema-filter-select"
                value={filters.preferredFacility}
                onChange={(e) => setFilters({ ...filters, preferredFacility: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">Select Facility...</option>
                <option value="dermpath-diagnostics">DermPath Diagnostics</option>
                <option value="quest-diagnostics">Quest Diagnostics</option>
                <option value="labcorp">LabCorp</option>
                <option value="sonic-healthcare">Sonic Healthcare</option>
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div className="ema-filter-group">
            <label className="ema-filter-label">Entry Date Range</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="date"
                className="ema-filter-input"
                value={filters.entryDateStart}
                onChange={(e) => setFilters({ ...filters, entryDateStart: e.target.value })}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>to</span>
              <input
                type="date"
                className="ema-filter-input"
                value={filters.entryDateEnd}
                onChange={(e) => setFilters({ ...filters, entryDateEnd: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Results Processed Date Range</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="date"
                className="ema-filter-input"
                value={filters.resultsDateStart}
                onChange={(e) => setFilters({ ...filters, resultsDateStart: e.target.value })}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>to</span>
              <input
                type="date"
                className="ema-filter-input"
                value={filters.resultsDateEnd}
                onChange={(e) => setFilters({ ...filters, resultsDateEnd: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="button" className="ema-filter-btn" onClick={() => {}}>
            Apply Filter
          </button>
          <button type="button" className="ema-filter-btn secondary" onClick={clearFilters}>
            Clear Filter
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ema-action-bar" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '0',
        padding: '1rem',
        marginBottom: '0',
        display: 'flex',
        gap: '0.75rem',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
      }}>
        <button
          type="button"
          onClick={() => setShowManualEntryModal(true)}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(251, 113, 133, 0.4)',
            transition: 'all 0.3s ease',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>+</span>
          Add Manual Entry
        </button>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#ffffff',
            color: '#f43f5e',
            border: '2px solid #fb7185',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Print Table
        </button>
        <button
          type="button"
          onClick={handleMoveToUnresolved}
          disabled={selectedItems.size === 0}
          style={{
            padding: '0.75rem 1.25rem',
            background: selectedItems.size === 0 ? '#d1d5db' : '#ffffff',
            color: selectedItems.size === 0 ? '#9ca3af' : '#f43f5e',
            border: '2px solid #fb7185',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Move to Unresolved
        </button>
        <button
          type="button"
          onClick={loadData}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#ffffff',
            color: '#f43f5e',
            border: '2px solid #fb7185',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Data Table */}
      {loading ? (
        <div style={{ padding: '1rem' }}>
          <Skeleton variant="card" height={400} />
        </div>
      ) : filteredData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#ffffff',
          margin: '0',
          borderRadius: '0 0 12px 12px',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {mainTab === 'path' ? '🔬' : '🧪'}
          </div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>
            No {mainTab === 'path' ? 'Pathology' : 'Lab'} Results Found
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Try adjusting your filters or add a new entry
          </p>
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden',
        }}>
          <table className="ema-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredData.length && filteredData.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer' }}>
                  Date
                  {sortField === 'createdAt' && (
                    <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('patient')} style={{ cursor: 'pointer' }}>
                  Patient
                  {sortField === 'patient' && (
                    <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>Facility</th>
                <th>Ddx</th>
                <th>Procedure</th>
                <th>Location</th>
                <th>Results</th>
                <th>Results Processed</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItemSelection(item.id)}
                    />
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {getPatientName(item.patientId)}
                    </a>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {item.facility || '--'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                    {item.ddx || '--'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#374151' }}>
                    {item.details || item.procedure || '--'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {item.location || '--'}
                  </td>
                  <td>
                    <span
                      className={`ema-status ${item.status === 'completed' ? 'established' : 'pending'}`}
                    >
                      {item.results || item.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {item.resultsProcessed ? new Date(item.resultsProcessed).toLocaleDateString() : '--'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {item.photos && item.photos.length > 0 ? (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {item.photos.length}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total Results */}
          <div style={{
            padding: '1rem',
            borderTop: '2px solid #e5e7eb',
            background: '#f9fafb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Total Results: {filteredData.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {selectedItems.size > 0 && `${selectedItems.size} item(s) selected`}
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      <Modal
        isOpen={showManualEntryModal}
        title="Add Manual Entry"
        onClose={() => setShowManualEntryModal(false)}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Type *</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={newEntry.type === 'path'}
                    onChange={() => setNewEntry({ ...newEntry, type: 'path', tests: [] })}
                  />
                  Pathology
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={newEntry.type === 'lab'}
                    onChange={() => setNewEntry({ ...newEntry, type: 'lab', procedure: '' })}
                  />
                  Lab
                </label>
              </div>
            </div>

            <div className="form-field">
              <label>Patient *</label>
              <select
                value={newEntry.patientId}
                onChange={(e) => setNewEntry({ ...newEntry, patientId: e.target.value })}
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {newEntry.type === 'path' ? (
            <>
              <div className="form-field">
                <label>Procedure *</label>
                <select
                  value={newEntry.procedure}
                  onChange={(e) => setNewEntry({ ...newEntry, procedure: e.target.value })}
                >
                  <option value="">Select procedure...</option>
                  {COMMON_DERM_PROCEDURES.map((proc) => (
                    <option key={proc} value={proc}>
                      {proc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Location</label>
                  <input
                    type="text"
                    value={newEntry.location}
                    onChange={(e) => setNewEntry({ ...newEntry, location: e.target.value })}
                    placeholder="e.g., Left forearm, scalp, etc."
                  />
                </div>

                <div className="form-field">
                  <label>Differential Diagnosis</label>
                  <input
                    type="text"
                    value={newEntry.ddx}
                    onChange={(e) => setNewEntry({ ...newEntry, ddx: e.target.value })}
                    placeholder="e.g., BCC, SCC, melanoma"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="form-field">
              <label>Select Tests * ({newEntry.tests.length} selected)</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}>
                {COMMON_DERM_LABS.map((test) => (
                  <label
                    key={test.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem',
                      background: newEntry.tests.includes(test.name) ? '#fce7f3' : '#f9fafb',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newEntry.tests.includes(test.name)}
                      onChange={() => toggleTest(test.name)}
                    />
                    <span>{test.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-field">
            <label>Facility</label>
            <select
              value={newEntry.facility}
              onChange={(e) => setNewEntry({ ...newEntry, facility: e.target.value })}
            >
              <option value="">Select facility...</option>
              <option value="dermpath-diagnostics">DermPath Diagnostics</option>
              <option value="quest-diagnostics">Quest Diagnostics</option>
              <option value="labcorp">LabCorp</option>
              <option value="sonic-healthcare">Sonic Healthcare</option>
            </select>
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea
              value={newEntry.notes}
              onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowManualEntryModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreateEntry}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Entry'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
