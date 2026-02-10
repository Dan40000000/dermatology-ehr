import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

export interface ReferringPhysician {
  id: string;
  npi?: string;
  firstName: string;
  lastName: string;
  credentials?: string;
  specialty?: string;
  practiceName?: string;
  city?: string;
  state?: string;
  phone?: string;
  totalReferrals: number;
}

interface PhysicianLookupProps {
  onSelect: (physician: ReferringPhysician) => void;
  onClear?: () => void;
  selectedPhysician?: ReferringPhysician | null;
  placeholder?: string;
  allowCreate?: boolean;
}

export function PhysicianLookup({
  onSelect,
  onClear,
  selectedPhysician,
  placeholder = 'Search for referring doctor...',
  allowCreate = true,
}: PhysicianLookupProps) {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReferringPhysician[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPhysician, setNewPhysician] = useState({
    firstName: '',
    lastName: '',
    npi: '',
    specialty: '',
    practiceName: '',
    phone: '',
  });
  const [creating, setCreating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPhysicians = useCallback(
    async (searchQuery: string) => {
      if (!session || searchQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/referral-sources/physicians/search?q=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              [TENANT_HEADER_NAME]: session.tenantId,
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setResults(data.physicians || []);
        }
      } catch (err) {
        console.error('Failed to search physicians:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [session]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowDropdown(true);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPhysicians(value);
    }, 300);
  };

  const handleSelectPhysician = (physician: ReferringPhysician) => {
    onSelect(physician);
    setQuery('');
    setShowDropdown(false);
    setResults([]);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    setQuery('');
    setResults([]);
  };

  const handleCreatePhysician = async () => {
    if (!session || !newPhysician.firstName || !newPhysician.lastName) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/referral-sources/physicians`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify(newPhysician),
      });

      if (res.ok) {
        const data = await res.json();
        onSelect(data.physician);
        setShowCreateForm(false);
        setNewPhysician({
          firstName: '',
          lastName: '',
          npi: '',
          specialty: '',
          practiceName: '',
          phone: '',
        });
      }
    } catch (err) {
      console.error('Failed to create physician:', err);
    } finally {
      setCreating(false);
    }
  };

  if (selectedPhysician) {
    return (
      <div className="physician-selected">
        <div className="selected-info">
          <div className="physician-name">
            {selectedPhysician.firstName} {selectedPhysician.lastName}
            {selectedPhysician.credentials && `, ${selectedPhysician.credentials}`}
          </div>
          {selectedPhysician.specialty && (
            <div className="physician-specialty">{selectedPhysician.specialty}</div>
          )}
          {selectedPhysician.practiceName && (
            <div className="physician-practice">{selectedPhysician.practiceName}</div>
          )}
        </div>
        <button type="button" onClick={handleClear} className="btn-clear" title="Clear selection">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>

        <style>{`
          .physician-selected {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1rem;
            background: #f9fafb;
            border: 1px solid #d1d5db;
            border-radius: 6px;
          }

          .selected-info {
            flex: 1;
          }

          .physician-name {
            font-weight: 600;
            color: #111827;
          }

          .physician-specialty {
            font-size: 0.875rem;
            color: #6B46C1;
          }

          .physician-practice {
            font-size: 0.8125rem;
            color: #6b7280;
          }

          .btn-clear {
            background: transparent;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            color: #9ca3af;
            transition: color 0.2s;
          }

          .btn-clear:hover {
            color: #ef4444;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="physician-lookup">
      <div className="search-container">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={() => query.length >= 2 && setShowDropdown(true)}
          placeholder={placeholder}
          className="search-input"
        />
        {loading && <span className="loading-indicator">...</span>}
      </div>

      {showDropdown && (query.length >= 2 || results.length > 0) && (
        <div ref={dropdownRef} className="search-dropdown">
          {loading ? (
            <div className="dropdown-item loading">Searching...</div>
          ) : results.length > 0 ? (
            <>
              {results.map((physician) => (
                <div
                  key={physician.id}
                  className="dropdown-item"
                  onClick={() => handleSelectPhysician(physician)}
                >
                  <div className="physician-name">
                    {physician.firstName} {physician.lastName}
                    {physician.credentials && `, ${physician.credentials}`}
                  </div>
                  <div className="physician-meta">
                    {physician.specialty && <span>{physician.specialty}</span>}
                    {physician.practiceName && <span> - {physician.practiceName}</span>}
                    {physician.city && physician.state && (
                      <span className="location">
                        {' '}
                        ({physician.city}, {physician.state})
                      </span>
                    )}
                  </div>
                  {physician.totalReferrals > 0 && (
                    <div className="referral-count">
                      {physician.totalReferrals} referral{physician.totalReferrals !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ))}
              {allowCreate && (
                <div
                  className="dropdown-item create-new"
                  onClick={() => setShowCreateForm(true)}
                >
                  + Add new referring physician
                </div>
              )}
            </>
          ) : query.length >= 2 ? (
            <div className="dropdown-item no-results">
              <span>No physicians found</span>
              {allowCreate && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowCreateForm(true)}
                >
                  Add new
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {showCreateForm && (
        <div className="create-form-overlay">
          <div className="create-form">
            <h3>Add Referring Physician</h3>
            <div className="form-row">
              <div className="form-field">
                <label>First Name *</label>
                <input
                  type="text"
                  value={newPhysician.firstName}
                  onChange={(e) =>
                    setNewPhysician({ ...newPhysician, firstName: e.target.value })
                  }
                  placeholder="First name"
                />
              </div>
              <div className="form-field">
                <label>Last Name *</label>
                <input
                  type="text"
                  value={newPhysician.lastName}
                  onChange={(e) =>
                    setNewPhysician({ ...newPhysician, lastName: e.target.value })
                  }
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>NPI</label>
                <input
                  type="text"
                  value={newPhysician.npi}
                  onChange={(e) => setNewPhysician({ ...newPhysician, npi: e.target.value })}
                  placeholder="NPI number"
                />
              </div>
              <div className="form-field">
                <label>Specialty</label>
                <input
                  type="text"
                  value={newPhysician.specialty}
                  onChange={(e) =>
                    setNewPhysician({ ...newPhysician, specialty: e.target.value })
                  }
                  placeholder="Specialty"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Practice Name</label>
                <input
                  type="text"
                  value={newPhysician.practiceName}
                  onChange={(e) =>
                    setNewPhysician({ ...newPhysician, practiceName: e.target.value })
                  }
                  placeholder="Practice name"
                />
              </div>
              <div className="form-field">
                <label>Phone</label>
                <input
                  type="text"
                  value={newPhysician.phone}
                  onChange={(e) => setNewPhysician({ ...newPhysician, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreatePhysician}
                disabled={creating || !newPhysician.firstName || !newPhysician.lastName}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .physician-lookup {
          position: relative;
        }

        .search-container {
          position: relative;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          padding-right: 2rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
        }

        .search-input:focus {
          outline: none;
          border-color: #6B46C1;
          box-shadow: 0 0 0 3px rgba(107, 70, 193, 0.15);
        }

        .loading-indicator {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }

        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          max-height: 300px;
          overflow-y: auto;
          z-index: 100;
        }

        .dropdown-item {
          padding: 0.75rem 1rem;
          cursor: pointer;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.15s;
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: #f9fafb;
        }

        .dropdown-item.loading,
        .dropdown-item.no-results {
          color: #6b7280;
          cursor: default;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .dropdown-item.create-new {
          color: #6B46C1;
          font-weight: 500;
        }

        .dropdown-item .physician-name {
          font-weight: 600;
          color: #111827;
        }

        .dropdown-item .physician-meta {
          font-size: 0.8125rem;
          color: #6b7280;
          margin-top: 0.125rem;
        }

        .dropdown-item .location {
          color: #9ca3af;
        }

        .dropdown-item .referral-count {
          font-size: 0.75rem;
          color: #10b981;
          margin-top: 0.25rem;
        }

        .btn-link {
          background: none;
          border: none;
          color: #6B46C1;
          cursor: pointer;
          font-size: 0.875rem;
          padding: 0;
        }

        .btn-link:hover {
          text-decoration: underline;
        }

        .create-form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .create-form {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          width: 100%;
          max-width: 500px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .create-form h3 {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          color: #111827;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .form-field label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
        }

        .form-field input {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.9375rem;
        }

        .form-field input:focus {
          outline: none;
          border-color: #6B46C1;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .btn {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #f9fafb;
        }

        .btn-primary {
          background: #6B46C1;
          border: none;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #7c3aed;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
