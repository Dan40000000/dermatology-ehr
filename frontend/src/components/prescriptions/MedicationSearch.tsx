import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

export interface Medication {
  id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  strength?: string;
  dosageForm?: string;
  route?: string;
  deaSchedule?: string;
  isControlled: boolean;
  category?: string;
  typicalSig?: string;
}

interface MedicationSearchProps {
  onSelect: (medication: Medication) => void;
  value?: string;
  disabled?: boolean;
}

export function MedicationSearch({ onSelect, value, disabled }: MedicationSearchProps) {
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [results, setResults] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (value) {
      setSearchTerm(value);
    }
  }, [value]);

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (!session) return;

      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/medications?search=${encodeURIComponent(searchTerm)}&limit=20`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              [TENANT_HEADER_NAME]: session.tenantId,
            },
          }
        );

        if (!res.ok) throw new Error('Failed to search medications');

        const data = await res.json();
        setResults(data.medications || []);
        setShowResults(true);
      } catch (error) {
        console.error('Error searching medications:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, session]);

  const handleSelect = (medication: Medication) => {
    setSearchTerm(medication.name);
    setShowResults(false);
    onSelect(medication);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        placeholder="Search medications..."
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          fontSize: '0.875rem',
        }}
      />

      {showResults && searchTerm.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          {loading && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
              No medications found
            </div>
          )}

          {!loading &&
            results.map((medication) => (
              <div
                key={medication.id}
                onClick={() => handleSelect(medication)}
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  {medication.name}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  {medication.genericName && <span>{medication.genericName}</span>}
                  {medication.brandName && <span>({medication.brandName})</span>}
                  {medication.category && (
                    <span
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {medication.category}
                    </span>
                  )}
                  {medication.isControlled && (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                      }}
                    >
                      Schedule {medication.deaSchedule}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
