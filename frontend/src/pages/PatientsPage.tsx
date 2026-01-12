import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, ExportButtons } from '../components/ui';
import { fetchPatients } from '../api';
import type { Patient } from '../types';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatPhone } from '../utils/export';

type SortField = 'lastName' | 'firstName' | 'mrn' | 'dateOfBirth' | 'phone' | 'email' | 'status' | 'lastVisit';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 20;

export function PatientsPage() {
  const { session } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchBy, setSearchBy] = useState<'name' | 'mrn' | 'phone'>('name');
  const [patientStatus, setPatientStatus] = useState<'active' | 'inactive'>('active');
  const [sortField, setSortField] = useState<SortField>('lastName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!session) return;

    const loadPatients = async () => {
      setLoading(true);
      try {
        const res = await fetchPatients(session.tenantId, session.accessToken);
        setPatients(res.patients || []);
      } catch (err: any) {
        showError(err.message || 'Failed to load patients');
      } finally {
        setLoading(false);
      }
    };

    loadPatients();
  }, [session, showError]);

  // Filter and sort patients
  const filteredPatients = useMemo(() => {
    if (!Array.isArray(patients)) return [];

    let result = [...patients];

    // Status filter (if we have status field in patient data)
    // Note: Currently Patient type doesn't have a status field, but filtering is ready
    // if the backend adds it in the future

    // Search filter with debounce
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter((p) => {
        if (!p) return false;
        const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
        const reverseName = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
        const mrn = (p.mrn || '').toLowerCase();
        const phone = (p.phone || '').replace(/\D/g, '');
        const searchPhone = debouncedSearch.replace(/\D/g, '');

        if (searchBy === 'name') {
          return fullName.includes(query) || reverseName.includes(query);
        } else if (searchBy === 'mrn') {
          return mrn.includes(query);
        } else if (searchBy === 'phone') {
          return searchPhone && phone.includes(searchPhone);
        }
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (!a || !b) return 0;

      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortField) {
        case 'lastName':
          aVal = a.lastName?.toLowerCase() || '';
          bVal = b.lastName?.toLowerCase() || '';
          break;
        case 'firstName':
          aVal = a.firstName?.toLowerCase() || '';
          bVal = b.firstName?.toLowerCase() || '';
          break;
        case 'mrn':
          aVal = a.mrn || '';
          bVal = b.mrn || '';
          break;
        case 'dateOfBirth':
          aVal = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
          bVal = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
          if (isNaN(aVal as number)) aVal = 0;
          if (isNaN(bVal as number)) bVal = 0;
          break;
        case 'phone':
          aVal = a.phone || '';
          bVal = b.phone || '';
          break;
        case 'email':
          aVal = a.email?.toLowerCase() || '';
          bVal = b.email?.toLowerCase() || '';
          break;
        case 'lastVisit':
          aVal = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
          bVal = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
          if (isNaN(aVal as number)) aVal = 0;
          if (isNaN(bVal as number)) bVal = 0;
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [patients, debouncedSearch, searchBy, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredPatients.slice(start, end);
  }, [filteredPatients, currentPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '';
    return sortOrder === 'asc' ? '' : '';
  };

  const formatDOB = (dob: string | undefined) => {
    if (!dob) return '—';
    const date = new Date(dob);
    const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return `${date.toLocaleDateString('en-US')} (${age})`;
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="patients-page" style={{
      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      {/* Action Buttons Row - Like ModMed */}
      <div className="ema-action-bar" style={{
        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px rgba(59, 130, 246, 0.3)',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/patients/new')}
          style={{
            background: 'rgba(255,255,255,0.95)',
            border: '2px solid rgba(255,255,255,0.4)',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            fontWeight: 600,
            color: '#2563eb',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          }}
        >
          <span className="icon" style={{ fontSize: '1.1rem' }}>👤</span>
          Register New Patient
        </button>
        <button type="button" className="ema-action-btn" style={{
          background: 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: '#2563eb',
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
          <span className="icon" style={{ fontSize: '1.1rem' }}>🔍</span>
          Advanced Search
        </button>
        <button type="button" className="ema-action-btn" style={{
          background: 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: '#2563eb',
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
          <span className="icon" style={{ fontSize: '1.1rem' }}>📄</span>
          Patient Handout Library
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons
            data={paginatedPatients}
            filename="Patients"
            columns={[
              { key: 'lastName', label: 'Last Name' },
              { key: 'firstName', label: 'First Name' },
              { key: 'mrn', label: 'MRN' },
              { key: 'dateOfBirth', label: 'DOB', format: (date) => formatExportDate(date, 'short') },
              { key: 'sex', label: 'Sex' },
              { key: 'phone', label: 'Phone', format: formatPhone },
              { key: 'email', label: 'Email' },
              { key: 'address', label: 'Address' },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State' },
              { key: 'zip', label: 'ZIP' },
            ] as ExportColumn[]}
            variant="dropdown"
            pdfOptions={{ title: 'Patient List', orientation: 'landscape' }}
          />
        </div>
      </div>

      {/* Patient Search Section Header */}
      <div className="ema-section-header" style={{
        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
        color: '#ffffff',
        padding: '1rem 1.5rem',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        fontSize: '1.25rem',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>🔍</span>
        Patient Search
      </div>

      {/* Filter Panel - Like ModMed */}
      <div className="ema-filter-panel" style={{
        background: 'rgba(255,255,255,0.9)',
        border: '2px solid #93c5fd',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)'
      }}>
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">Search Patients By</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                className="ema-filter-select"
                value={searchBy}
                onChange={(e) => setSearchBy(e.target.value as any)}
                style={{ minWidth: '120px' }}
              >
                <option value="name">Name</option>
                <option value="mrn">MRN</option>
                <option value="phone">Phone</option>
              </select>
              <input
                type="text"
                className="ema-filter-input"
                placeholder="Enter search term..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minWidth: '250px' }}
              />
            </div>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Patient Status</label>
            <div className="ema-radio-group">
              <label className="ema-radio">
                <input
                  type="radio"
                  name="patientStatus"
                  checked={patientStatus === 'active'}
                  onChange={() => setPatientStatus('active')}
                />
                Active
              </label>
              <label className="ema-radio">
                <input
                  type="radio"
                  name="patientStatus"
                  checked={patientStatus === 'inactive'}
                  onChange={() => setPatientStatus('inactive')}
                />
                Inactive
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="ema-filter-btn">
            Search
          </button>
        </div>
      </div>

      {/* Patient Search Results Section Header */}
      <div className="ema-section-header" style={{
        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
        color: '#ffffff',
        padding: '1rem 1.5rem',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        fontSize: '1.25rem',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>📋</span>
        Patient Search Results
        <span style={{ fontWeight: 'normal', marginLeft: '1rem', fontSize: '0.8125rem', opacity: 0.9 }}>
          ({filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''})
          {totalPages > 1 && ` - Page ${currentPage} of ${totalPages}`}
        </span>
      </div>

      {/* Data Table - Like ModMed */}
      {loading ? (
        <div style={{ padding: '1rem' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="card" height={60} />
          ))}
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('lastName')}>
                Last Name <span className="sort-icon">{getSortIcon('lastName')}</span>
              </th>
              <th onClick={() => handleSort('firstName')}>
                First Name <span className="sort-icon">{getSortIcon('firstName')}</span>
              </th>
              <th>Preferred Name</th>
              <th onClick={() => handleSort('mrn')}>
                MRN <span className="sort-icon">{getSortIcon('mrn')}</span>
              </th>
              <th>PMS ID</th>
              <th onClick={() => handleSort('dateOfBirth')}>
                DOB <span className="sort-icon">{getSortIcon('dateOfBirth')}</span>
              </th>
              <th onClick={() => handleSort('phone')}>
                Phone <span className="sort-icon">{getSortIcon('phone')}</span>
              </th>
              <th onClick={() => handleSort('email')}>
                Email <span className="sort-icon">{getSortIcon('email')}</span>
              </th>
              <th>Status</th>
              <th onClick={() => handleSort('lastVisit')}>
                Last Visit <span className="sort-icon">{getSortIcon('lastVisit')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedPatients.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                  {loading ? 'Loading patients...' : 'No patients found'}
                </td>
              </tr>
            ) : (
              paginatedPatients.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <a
                      href="#"
                      className="ema-patient-link"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/patients/${patient.id}`);
                      }}
                    >
                      {patient.lastName}
                    </a>
                  </td>
                  <td>
                    <a
                      href="#"
                      className="ema-patient-link"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/patients/${patient.id}`);
                      }}
                    >
                      {patient.firstName}
                    </a>
                  </td>
                  <td>{(patient as any).preferredName || '—'}</td>
                  <td>{patient.mrn || '—'}</td>
                  <td>{(patient as any).pmsId || '—'}</td>
                  <td>{formatDOB(patient.dateOfBirth)}</td>
                  <td>{patient.phone || '—'}</td>
                  <td>{patient.email || '—'}</td>
                  <td>
                    <span className="ema-status established">Established</span>
                  </td>
                  <td>
                    {patient.lastVisit
                      ? new Date(patient.lastVisit).toLocaleDateString('en-US')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="ema-pagination">
          <button
            type="button"
            className="ema-pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <div className="ema-pagination-pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              // Show first page, last page, current page, and pages around current
              const showPage =
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 2 && page <= currentPage + 2);

              if (!showPage) {
                // Show ellipsis for gaps
                if (page === currentPage - 3 || page === currentPage + 3) {
                  return (
                    <span key={page} className="ema-pagination-ellipsis">
                      ...
                    </span>
                  );
                }
                return null;
              }

              return (
                <button
                  key={page}
                  type="button"
                  className={`ema-pagination-btn ${page === currentPage ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="ema-pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
