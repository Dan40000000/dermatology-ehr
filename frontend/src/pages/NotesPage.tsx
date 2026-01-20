import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchEncounters,
  fetchProviders,
  fetchPatients,
  type Encounter,
} from '../api';

export function NotesPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [patientFilter, setPatientFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [session]);

  const loadData = async () => {
    if (!session?.tenantId || !session?.accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const [encountersRes, providersRes, patientsRes] = await Promise.all([
        fetchEncounters(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setEncounters(encountersRes.encounters || []);
      setProviders(providersRes.providers || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load encounters');
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (encounter: Encounter) => {
    if (encounter.patientId && encounter.id) {
      navigate(`/patients/${encounter.patientId}/encounter/${encounter.id}`);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-200 text-gray-800';
      case 'preliminary':
        return 'bg-blue-200 text-blue-800';
      case 'finalized':
        return 'bg-green-200 text-green-800';
      case 'signed':
        return 'bg-purple-200 text-purple-800';
      case 'locked':
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  // Filter encounters based on all filters
  const filteredEncounters = encounters.filter((encounter) => {
    // Status filter
    if (statusFilter !== 'all' && encounter.status !== statusFilter) {
      return false;
    }

    // Provider filter
    if (providerFilter !== 'all' && encounter.providerId !== providerFilter) {
      return false;
    }

    // Patient filter
    if (patientFilter !== 'all' && encounter.patientId !== patientFilter) {
      return false;
    }

    // Date range filter
    if (startDate && encounter.createdAt) {
      const encounterDate = new Date(encounter.createdAt);
      const filterDate = new Date(startDate);
      if (encounterDate < filterDate) {
        return false;
      }
    }
    if (endDate && encounter.createdAt) {
      const encounterDate = new Date(encounter.createdAt);
      const filterDate = new Date(endDate);
      filterDate.setHours(23, 59, 59, 999); // End of day
      if (encounterDate > filterDate) {
        return false;
      }
    }

    // Search query filter (patient name, chief complaint)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const patientName = encounter.patientName?.toLowerCase() || '';
      const chiefComplaint = encounter.chiefComplaint?.toLowerCase() || '';
      const providerName = encounter.providerName?.toLowerCase() || '';

      return (
        patientName.includes(query) ||
        chiefComplaint.includes(query) ||
        providerName.includes(query)
      );
    }

    return true;
  });

  // Sort by date (most recent first)
  const sortedEncounters = [...filteredEncounters].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e1147' }}>
          Notes & Encounters
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          View and manage all clinical encounters and notes
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#dc2626' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="Search by patient name, chief complaint, or provider..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
          }}
        />
      </div>

      {/* Filter Panel */}
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="preliminary">Preliminary</option>
              <option value="finalized">Finalized</option>
              <option value="signed">Signed</option>
              <option value="locked">Locked</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Provider
            </label>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
            >
              <option value="all">All Providers</option>
              {Array.isArray(providers) && providers.map((p) => {
                if (!p) return null;
                return (
                  <option key={p.id} value={p.id}>
                    {p.fullName || 'Unknown'}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Patient
            </label>
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
            >
              <option value="all">All Patients</option>
              {Array.isArray(patients) && patients.map((p) => {
                if (!p) return null;
                return (
                  <option key={p.id} value={p.id}>
                    {p.lastName || ''}, {p.firstName || ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              setStatusFilter('all');
              setProviderFilter('all');
              setPatientFilter('all');
              setStartDate('');
              setEndDate('');
              setSearchQuery('');
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'white',
              color: '#6B46C1',
              border: '1px solid #6B46C1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Clear Filters
          </button>
          <button
            onClick={loadData}
            style={{
              padding: '0.5rem 1rem',
              background: '#6B46C1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Showing {sortedEncounters.length} of {encounters.length} encounters
      </div>

      {/* Encounters Table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Date
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Patient
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Provider
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Chief Complaint
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && sortedEncounters.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                    Loading encounters...
                  </td>
                </tr>
              ) : sortedEncounters.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                    {searchQuery || statusFilter !== 'all' || providerFilter !== 'all' || patientFilter !== 'all' || startDate || endDate
                      ? 'No encounters found matching your filters'
                      : 'No encounters found'}
                  </td>
                </tr>
              ) : (
                sortedEncounters.map((encounter) => {
                  if (!encounter) return null;
                  return (
                    <tr
                      key={encounter.id}
                      onClick={() => handleRowClick(encounter)}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {encounter.createdAt ? new Date(encounter.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>
                        {encounter.patientName || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                        {encounter.providerName || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                        {encounter.chiefComplaint || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                          }}
                          className={getStatusBadgeColor(encounter.status || 'draft')}
                        >
                          {encounter.status || 'draft'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
