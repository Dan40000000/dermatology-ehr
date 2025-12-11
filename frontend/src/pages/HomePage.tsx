import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, DataTable, ExportButtons } from '../components/ui';
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
  });

  useEffect(() => {
    if (!session) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        const [patientsRes, appointmentsRes, encountersRes, tasksRes, analyticsRes, providersRes] = await Promise.all([
          fetchPatients(session.tenantId, session.accessToken),
          fetchAppointments(session.tenantId, session.accessToken),
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
        const patientsData = patientsRes.patients || [];
        const providersData = providersRes.providers || [];

        setEncounters(encountersData);
        setPatients(patientsData);
        setProviders(providersData);

        setStats({
          scheduledCount: appointments.filter((a: any) => a.status === 'scheduled').length,
          checkedInCount: appointments.filter((a: any) => a.status === 'checked_in').length,
          completedCount: appointments.filter((a: any) => a.status === 'completed').length,
          patientCount: analyticsRes.counts?.patients || 0,
          pendingTasks: tasks.filter((t: any) => t.status === 'open').length,
          openEncounters: encountersData.filter((e: Encounter) => e.status === 'draft').length,
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
  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getProviderName = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
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
      render: (row) => getPatientName(row.patientId),
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
      render: (row) => getProviderName(row.providerId),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <button
          className="btn-link"
          onClick={() => navigate(`/encounters/${row.id}`)}
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
    { key: 'patientId', label: 'Patient Name', format: (id) => getPatientName(id) },
    { key: 'createdAt', label: 'Date', format: (date) => formatExportDate(date, 'datetime') },
    { key: 'chiefComplaint', label: 'Chief Complaint', format: (val) => val || '-' },
    { key: 'status', label: 'Status' },
    { key: 'providerId', label: 'Provider', format: (id) => getProviderName(id) },
    { key: 'hpi', label: 'HPI', format: (val) => val || '-' },
    { key: 'assessmentPlan', label: 'Assessment & Plan', format: (val) => val || '-' },
  ];

  return (
    <div className="home-page">
      {/* Action Buttons Row - Like ModMed */}
      <div className="ema-action-bar">
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/patients/new')}
        >
          <span className="icon">👤</span>
          New Patient
        </button>
        <button type="button" className="ema-action-btn">
          <span className="icon">📋</span>
          Regulatory Reporting
          <span>▼</span>
        </button>
        <button type="button" className="ema-action-btn">
          <span className="icon">🔔</span>
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
      <div className="ema-section-header">Note History</div>

      {/* Filter Tabs - Like ModMed */}
      <div className="ema-tabs">
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
      <div className="ema-bottom-bar">
        <button
          type="button"
          className="ema-bottom-btn"
          onClick={handleFinalizeSelected}
          disabled={selectedEncounterIds.length === 0}
        >
          <span className="icon">📝</span>
          Finalize Selected Notes ({selectedEncounterIds.length})
        </button>
        <button type="button" className="ema-bottom-btn" disabled>
          <span className="icon">👤</span>
          Assign Notes
        </button>
        <button type="button" className="ema-bottom-btn" disabled>
          <span className="icon">💰</span>
          Billing Summaries
        </button>
        <button
          type="button"
          className="ema-bottom-btn"
          onClick={handleDownloadNotes}
          disabled={selectedEncounterIds.length === 0}
        >
          <span className="icon">⬇️</span>
          Download Notes
        </button>
        <button type="button" className="ema-bottom-btn" onClick={handlePrintTable}>
          <span className="icon">🖨️</span>
          Print Table
        </button>
      </div>
    </div>
  );
}
