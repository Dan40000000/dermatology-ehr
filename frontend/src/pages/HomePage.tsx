import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, DataTable, ExportButtons, Modal } from '../components/ui';
import type { Column } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate } from '../utils/export';
import {
  fetchPatients,
  fetchAppointments,
  fetchEncounters,
  fetchTasks,
  fetchAnalytics,
  updateEncounterStatus,
} from '../api';

interface Encounter {
  id: string;
  patientId: string;
  providerId: string;
  patientName?: string;
  providerName?: string;
  appointmentId?: string;
  status: string;
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
  createdAt: string;
  updatedAt: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
}

interface Provider {
  id: string;
  fullName: string;
}

type FilterTab = 'all' | 'my-today' | 'assigned-to-me' | 'finalized-today' | 'all-preliminary';

export function HomePage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [stats, setStats] = useState({
    scheduledCount: 0,
    checkedInCount: 0,
    completedCount: 0,
    patientCount: 0,
    pendingTasks: 0,
    openEncounters: 0,
    // Office Flow stats
    waitingCount: 0,
    inRoomsCount: 0,
    checkoutCount: 0,
  });

  // Modal states
  const [showRegulatoryModal, setShowRegulatoryModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [regulatoryType, setRegulatoryType] = useState<'mips' | 'value-path'>('mips');

  // Filter states
  const [filterPatient, setFilterPatient] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterEncounterType, setFilterEncounterType] = useState('all');
  const [filterScribe, setFilterScribe] = useState('any');
  const [filterDate, setFilterDate] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterNoteStatus, setFilterNoteStatus] = useState('all');
  const [filterAuthor, setFilterAuthor] = useState('any');
  const [filterFacility, setFilterFacility] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('');

  // Reminder form state
  const [reminderData, setReminderData] = useState({
    doctorsNote: '',
    reminderText: '',
    reminderDate: '',
    preferredContact: 'Unspecified',
  });

  useEffect(() => {
    if (!session) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        // Get today's date in YYYY-MM-DD format for filtering appointments
        // Use the same approach as Schedule page to ensure consistency
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const [patientsRes, appointmentsRes, encountersRes, tasksRes, analyticsRes, providersRes] = await Promise.all([
          fetchPatients(session.tenantId, session.accessToken),
          // Use startDate and endDate to get today's appointments (same as Schedule page logic)
          fetchAppointments(session.tenantId, session.accessToken, {
            startDate: todayStr,
            endDate: todayStr
          }),
          fetchEncounters(session.tenantId, session.accessToken),
          fetchTasks(session.tenantId, session.accessToken),
          fetchAnalytics(session.tenantId, session.accessToken),
          fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/providers`, {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'x-tenant-id': session.tenantId,
            },
          }).then(r => r.json()),
        ]);

        const appointments = appointmentsRes.appointments || [];
        const tasks = tasksRes.tasks || [];
        const encountersData = encountersRes.encounters || [];
        // Backend returns paginated response with { data: [...], meta: {...} }
        const patientsData = patientsRes.data || patientsRes.patients || [];
        const providersData = providersRes.providers || [];

        setEncounters(encountersData);
        setPatients(patientsData);
        setProviders(providersData);

        // Calculate Office Flow stats from appointments
        // These statuses mirror what OfficeFlowPage tracks
        const waitingCount = appointments.filter((a: any) => a.status === 'checked_in').length;
        const inRoomsCount = appointments.filter((a: any) =>
          a.status === 'in_room' || a.status === 'with_provider'
        ).length;
        const checkoutCount = appointments.filter((a: any) => a.status === 'completed').length;

        setStats({
          scheduledCount: appointments.filter((a: any) => a.status === 'scheduled').length,
          checkedInCount: appointments.filter((a: any) => a.status === 'checked_in').length,
          completedCount: appointments.filter((a: any) => a.status === 'completed').length,
          patientCount: analyticsRes.counts?.patients || 0,
          pendingTasks: tasks.filter((t: any) => t.status === 'open').length,
          openEncounters: encountersData.filter((e: Encounter) => e.status === 'draft').length,
          // Office Flow stats
          waitingCount,
          inRoomsCount,
          checkoutCount,
        });
      } catch (err: any) {
        showError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [session, showError]);

  // Helper functions
  const getPatientName = (encounter: Encounter) => {
    // Use patientName from API if available (backend returns it with JOIN)
    if (encounter.patientName) return encounter.patientName;
    // Fallback to lookup in patients array
    const patient = patients.find(p => p.id === encounter.patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getProviderName = (encounter: Encounter) => {
    // Use providerName from API if available (backend returns it with JOIN)
    if (encounter.providerName) return encounter.providerName;
    // Fallback to lookup in providers array
    const provider = providers.find(p => p.id === encounter.providerId);
    return provider ? provider.fullName : 'Unknown';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      draft: 'status-badge status-draft',
      finalized: 'status-badge status-finalized',
      locked: 'status-badge status-locked',
    };
    return <span className={statusColors[status] || 'status-badge'}>{status}</span>;
  };

  // Filter encounters based on active tab
  const getFilteredEncounters = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (activeFilter) {
      case 'my-today':
        return encounters.filter(e => {
          const encDate = new Date(e.createdAt);
          encDate.setHours(0, 0, 0, 0);
          return e.providerId === session?.user.id && encDate.getTime() === today.getTime() && e.status === 'draft';
        });
      case 'assigned-to-me':
        return encounters.filter(e => e.providerId === session?.user.id && e.status === 'draft');
      case 'finalized-today':
        return encounters.filter(e => {
          const encDate = new Date(e.updatedAt);
          encDate.setHours(0, 0, 0, 0);
          return e.providerId === session?.user.id && encDate.getTime() === today.getTime() && e.status === 'finalized';
        });
      case 'all-preliminary':
        return encounters.filter(e => e.providerId === session?.user.id && e.status === 'draft');
      default:
        return encounters;
    }
  };

  const filteredEncounters = getFilteredEncounters();

  // Calculate counts for tabs
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const myTodayCount = encounters.filter(e => {
    const encDate = new Date(e.createdAt);
    encDate.setHours(0, 0, 0, 0);
    return e.providerId === session?.user.id && encDate.getTime() === today.getTime() && e.status === 'draft';
  }).length;
  const assignedToMeCount = encounters.filter(e => e.providerId === session?.user.id && e.status === 'draft').length;
  const finalizedTodayCount = encounters.filter(e => {
    const encDate = new Date(e.updatedAt);
    encDate.setHours(0, 0, 0, 0);
    return e.providerId === session?.user.id && encDate.getTime() === today.getTime() && e.status === 'finalized';
  }).length;
  const allPreliminaryCount = encounters.filter(e => e.providerId === session?.user.id && e.status === 'draft').length;

  // Table columns
  const columns: Column<Encounter>[] = [
    {
      key: 'patientId',
      label: 'Patient Name',
      sortable: true,
      render: (row) => (
        <button
          className="btn-link"
          onClick={() => navigate(`/patients/${row.patientId}`)}
          style={{ textAlign: 'left' }}
        >
          {getPatientName(row)}
        </button>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'chiefComplaint',
      label: 'Chief Complaint',
      sortable: false,
      render: (row) => row.chiefComplaint || '-',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => getStatusBadge(row.status),
    },
    {
      key: 'providerId',
      label: 'Provider',
      sortable: true,
      render: (row) => getProviderName(row),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <button
          className="btn-link"
          onClick={() => navigate(`/patients/${row.patientId}/encounter/${row.id}`)}
        >
          View
        </button>
      ),
    },
  ];

  // Action handlers
  const handleFinalizeSelected = async () => {
    if (selectedEncounterIds.length === 0) {
      showError('Please select notes to finalize');
      return;
    }
    try {
      await Promise.all(
        selectedEncounterIds.map(id =>
          updateEncounterStatus(session!.tenantId, session!.accessToken, id, 'finalized')
        )
      );
      showSuccess(`Finalized ${selectedEncounterIds.length} note(s)`);
      // Reload data
      setSelectedEncounterIds([]);
      window.location.reload();
    } catch (err: any) {
      showError(err.message || 'Failed to finalize notes');
    }
  };

  const handleDownloadNotes = () => {
    if (selectedEncounterIds.length === 0) {
      showError('Please select notes to download');
      return;
    }
    showSuccess('Download feature coming soon');
  };

  const handlePrintTable = () => {
    window.print();
  };

  // Export configuration
  const exportColumns: ExportColumn[] = [
    { key: 'patientName', label: 'Patient Name', format: (val) => val || '-' },
    { key: 'createdAt', label: 'Date', format: (date) => formatExportDate(date, 'datetime') },
    { key: 'chiefComplaint', label: 'Chief Complaint', format: (val) => val || '-' },
    { key: 'status', label: 'Status' },
    { key: 'providerName', label: 'Provider', format: (val) => val || '-' },
    { key: 'hpi', label: 'HPI', format: (val) => val || '-' },
    { key: 'assessmentPlan', label: 'Assessment & Plan', format: (val) => val || '-' },
  ];

  return (
    <div className="home-page">
      {/* Action Buttons Row - Like ModMed */}
      <div className="ema-action-bar" style={{ background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)', borderBottom: '2px solid #e5e7eb', gap: '0.5rem' }}>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/patients/new')}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem', color: '#16a34a' }}>+</span>
          New Patient
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => setShowRegulatoryModal(!showRegulatoryModal)}
            style={{
              background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
              border: '1px solid #d1d5db',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              color: '#374151',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.2em' }}>📊</span>
            Regulatory Reporting
            <span style={{ fontSize: '0.7em' }}>▼</span>
          </button>
          {showRegulatoryModal && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '0.25rem',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
              minWidth: '200px',
              zIndex: 1000,
            }}>
              <button
                type="button"
                onClick={() => {
                  setRegulatoryType('mips');
                  navigate('/quality/mips');
                  setShowRegulatoryModal(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                MIPS Report
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegulatoryType('value-path');
                  navigate('/quality/mips');
                  setShowRegulatoryModal(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                MIPS Value Path Report
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowReminderModal(true)}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem', color: '#8b5cf6' }}>🔔</span>
          General Reminder
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons
            data={filteredEncounters}
            filename="Encounters"
            columns={exportColumns}
            variant="dropdown"
            pdfOptions={{ title: 'Encounter Notes History', orientation: 'landscape' }}
            onExport={(type) => showSuccess(`Exported ${filteredEncounters.length} encounters as ${type.toUpperCase()}`)}
          />
        </div>
      </div>

      {/* Note History Section Header */}
      <div className="ema-section-header" style={{ background: 'linear-gradient(to right, #dbeafe 0%, #e0f2fe 100%)', color: '#075985', fontWeight: 600, padding: '0.75rem 1.5rem' }}>
        Note History
      </div>

      {/* Advanced Filter Panel */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1.5rem' }}>
        <button
          type="button"
          onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          style={{
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {showFiltersPanel ? 'Hide Filters' : 'Filters'} ▼
        </button>
      </div>

      {showFiltersPanel && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          margin: '1rem 1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Patient</label>
              <select
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Last, First</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All</option>
                <option value="soap">SOAP Note</option>
                <option value="consultation">Consultation</option>
                <option value="follow-up">Follow-up</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Encounter Type</label>
              <select
                value={filterEncounterType}
                onChange={(e) => setFilterEncounterType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All</option>
                <option value="office">Office Visit</option>
                <option value="telehealth">Telehealth</option>
                <option value="procedure">Procedure</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Scribe</label>
              <select
                value={filterScribe}
                onChange={(e) => setFilterScribe(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="any">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Method</label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All</option>
                <option value="ehr">EHR</option>
                <option value="dictation">Dictation</option>
                <option value="scribe">Scribe</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Note Status</label>
              <select
                value={filterNoteStatus}
                onChange={(e) => setFilterNoteStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="finalized">Finalized</option>
                <option value="locked">Locked</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Facility</label>
              <select
                value={filterFacility}
                onChange={(e) => setFilterFacility(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All Preferred Facilities</option>
                <option value="main">Mountain Pine Dermatology PLLC</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Assigned To</label>
              <select
                value={filterAssignedTo}
                onChange={(e) => setFilterAssignedTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Staff Search...</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setFilterPatient('');
                setFilterType('all');
                setFilterEncounterType('all');
                setFilterScribe('any');
                setFilterDate('');
                setFilterMethod('all');
                setFilterNoteStatus('all');
                setFilterFacility('all');
                setFilterAssignedTo('');
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={() => showSuccess('Filters applied')}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs - Like ModMed */}
      <div className="ema-tabs" style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <button
          type="button"
          className={`ema-tab ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All Notes
        </button>
        <button
          type="button"
          className={`ema-tab ${activeFilter === 'my-today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('my-today')}
        >
          My Preliminary Notes for Today<span className="ema-tab-count">({myTodayCount})</span>
        </button>
        <button
          type="button"
          className={`ema-tab ${activeFilter === 'assigned-to-me' ? 'active' : ''}`}
          onClick={() => setActiveFilter('assigned-to-me')}
        >
          All Preliminary Notes Assigned to Me<span className="ema-tab-count">({assignedToMeCount})</span>
        </button>
        <button
          type="button"
          className={`ema-tab ${activeFilter === 'finalized-today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('finalized-today')}
        >
          My Finalized Notes for Today<span className="ema-tab-count">({finalizedTodayCount})</span>
        </button>
        <button
          type="button"
          className={`ema-tab ${activeFilter === 'all-preliminary' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all-preliminary')}
        >
          All My Preliminary Notes<span className="ema-tab-count">({allPreliminaryCount})</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="ema-table-container">
        <DataTable
          columns={columns}
          data={filteredEncounters}
          keyExtractor={(row) => row.id}
          onSelectionChange={setSelectedEncounterIds}
          loading={loading}
          emptyMessage="No encounters found for the selected filter"
          itemsPerPage={10}
        />
      </div>

      {/* Today's Overview Stats */}
      <div className="section-title-bar">Today's Overview</div>

      <div className="stats-grid">
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          <>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.scheduledCount}</div>
              <div className="stat-label">Scheduled<br />Appointments</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.checkedInCount}</div>
              <div className="stat-label">Checked In<br />Patients</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.completedCount}</div>
              <div className="stat-label">Completed<br />Visits</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.patientCount}</div>
              <div className="stat-label">Total<br />Patients</div>
            </div>
          </>
        )}
      </div>

      {/* Office Flow Summary */}
      <div className="section-title-bar" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#ffffff' }}>
        Office Flow Summary
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          <>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.waitingCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>Waiting</div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.inRoomsCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>In Rooms</div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.checkoutCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>Completed</div>
            </div>
          </>
        )}
      </div>

      <div className="home-grid">
        <div className="panel">
          <p className="panel-title">Pending Tasks</p>
          <div className="stat-highlight">
            {loading ? <Skeleton width={60} height={40} /> : stats.pendingTasks}
          </div>
          <p className="muted">tasks awaiting completion</p>
        </div>

        <div className="panel">
          <p className="panel-title">Open Encounters</p>
          <div className="stat-highlight">
            {loading ? <Skeleton width={60} height={40} /> : stats.openEncounters}
          </div>
          <p className="muted">draft encounters to finalize</p>
        </div>

        <div className="panel">
          <p className="panel-title">Quick Actions</p>
          <div className="quick-action-list">
            <a href="/patients/new" className="quick-action">+ New Patient</a>
            <a href="/schedule" className="quick-action">+ Schedule Appointment</a>
            <a href="/tasks" className="quick-action">+ Create Task</a>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar - Like ModMed */}
      <div className="ema-bottom-bar" style={{ background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)', borderTop: '2px solid #e5e7eb', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
        <button
          type="button"
          className="ema-bottom-btn"
          onClick={handleFinalizeSelected}
          disabled={selectedEncounterIds.length === 0}
          style={{
            background: selectedEncounterIds.length > 0 ? 'linear-gradient(to bottom, #10b981 0%, #059669 100%)' : '#e5e7eb',
            color: selectedEncounterIds.length > 0 ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedEncounterIds.length > 0 ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedEncounterIds.length > 0 ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>✓</span>
          Finalize Selected Notes ({selectedEncounterIds.length})
        </button>
        <button
          type="button"
          className="ema-bottom-btn"
          disabled
          style={{
            background: '#e5e7eb',
            color: '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'not-allowed',
            fontWeight: 500,
          }}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>📋</span>
          Assign Notes
        </button>
        <button
          type="button"
          className="ema-bottom-btn"
          disabled
          style={{
            background: '#e5e7eb',
            color: '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'not-allowed',
            fontWeight: 500,
          }}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>💵</span>
          Billing Summaries
        </button>
        <button
          type="button"
          className="ema-bottom-btn"
          onClick={handleDownloadNotes}
          disabled={selectedEncounterIds.length === 0}
          style={{
            background: selectedEncounterIds.length > 0 ? 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)' : '#e5e7eb',
            color: selectedEncounterIds.length > 0 ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedEncounterIds.length > 0 ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedEncounterIds.length > 0 ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>⬇</span>
          Download Notes
        </button>
        <button
          type="button"
          className="ema-bottom-btn"
          onClick={handlePrintTable}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            color: '#374151',
            border: '1px solid #d1d5db',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <span className="icon" style={{ marginRight: '0.5rem' }}>🖨</span>
          Print Table
        </button>
      </div>

      {/* General Reminder Modal */}
      <Modal
        isOpen={showReminderModal}
        title="General Reminder"
        onClose={() => setShowReminderModal(false)}
      >
        <div style={{ padding: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Doctor's Note
            </label>
            <textarea
              value={reminderData.doctorsNote}
              onChange={(e) => setReminderData({ ...reminderData, doctorsNote: e.target.value })}
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              placeholder="Optional notes for internal reference..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Reminder Text <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={reminderData.reminderText}
              onChange={(e) => setReminderData({ ...reminderData, reminderText: e.target.value })}
              rows={4}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              placeholder="Enter the reminder message to send to the patient..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Reminder Date <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              value={reminderData.reminderDate}
              onChange={(e) => setReminderData({ ...reminderData, reminderDate: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Preferred Contact Method <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={reminderData.preferredContact}
              onChange={(e) => setReminderData({ ...reminderData, preferredContact: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                background: '#ffffff',
              }}
            >
              <option value="Unspecified">Unspecified</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone Call</option>
              <option value="SMS">Text Message (SMS)</option>
              <option value="Portal">Patient Portal</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={() => {
                setReminderData({
                  doctorsNote: '',
                  reminderText: '',
                  reminderDate: '',
                  preferredContact: 'Unspecified',
                });
                setShowReminderModal(false);
              }}
              style={{
                padding: '0.625rem 1.5rem',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!reminderData.reminderText || !reminderData.reminderDate) {
                  showError('Please fill in all required fields');
                  return;
                }
                showSuccess('General reminder created successfully');
                setReminderData({
                  doctorsNote: '',
                  reminderText: '',
                  reminderDate: '',
                  preferredContact: 'Unspecified',
                });
                setShowReminderModal(false);
              }}
              style={{
                padding: '0.625rem 1.5rem',
                background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
