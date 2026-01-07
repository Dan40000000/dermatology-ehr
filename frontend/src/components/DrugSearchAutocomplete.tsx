/**
 * Drug Search Autocomplete Component
 *
 * Provides autocomplete search for medications with real-time results
 * from the drug database including NDC codes, strength, and form.
 */

import { useState, useEffect, useRef } from 'react';
import { Search, Pill, AlertTriangle } from 'lucide-react';
import { searchDrugs, Drug } from '../api-erx';
import { useAuth } from '../contexts/AuthContext';

interface DrugSearchAutocompleteProps {
  onSelect: (drug: Drug) => void;
  placeholder?: string;
  initialValue?: string;
  category?: string;
  disabled?: boolean;
}

export function DrugSearchAutocomplete({
  onSelect,
  placeholder = 'Search medications...',
  initialValue = '',
  category,
  disabled = false,
}: DrugSearchAutocompleteProps) {
  const { session } = useAuth();
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Drug[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search for drugs when query changes
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      if (!session?.tenantId || !session?.accessToken) return;

      setIsLoading(true);
      try {
        const data = await searchDrugs(
          session.tenantId,
          session.accessToken,
          query,
          category,
          20
        );
        setResults(data.drugs);
        setIsOpen(data.drugs.length > 0);
      } catch (error) {
        console.error('Error searching drugs:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query, category, session?.tenantId, session?.accessToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelect = (drug: Drug) => {
    setQuery(drug.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSelect(drug);
  };

  const getSeverityColor = (severity?: string) => {
    if (severity === 'II') return '#dc2626'; // red-600
    if (severity === 'III' || severity === 'IV' || severity === 'V') return '#f59e0b'; // amber-500
    return '#6b7280'; // gray-500
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Search
          size={20}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            pointerEvents: 'none',
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '10px 12px 10px 40px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            backgroundColor: disabled ? '#f3f4f6' : 'white',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #e5e7eb',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
          }}
        >
          {results.map((drug, index) => (
            <div
              key={drug.id}
              onClick={() => handleSelect(drug)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: selectedIndex === index ? '#eff6ff' : 'white',
                borderBottom:
                  index < results.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {drug.is_controlled ? (
                    <AlertTriangle size={18} style={{ color: getSeverityColor(drug.dea_schedule) }} />
                  ) : (
                    <Pill size={18} style={{ color: '#3b82f6' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '2px',
                    }}
                  >
                    {drug.name}
                  </div>

                  {drug.generic_name && (
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        marginBottom: '2px',
                      }}
                    >
                      Generic: {drug.generic_name}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginTop: '4px',
                    }}
                  >
                    {drug.dosage_form && (
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          backgroundColor: '#eff6ff',
                          color: '#1e40af',
                          borderRadius: '4px',
                        }}
                      >
                        {drug.dosage_form}
                      </span>
                    )}

                    {drug.route && (
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          backgroundColor: '#f0fdf4',
                          color: '#166534',
                          borderRadius: '4px',
                        }}
                      >
                        {drug.route}
                      </span>
                    )}

                    {drug.is_controlled && drug.dea_schedule && (
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          backgroundColor: '#fef2f2',
                          color: '#991b1b',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        Schedule {drug.dea_schedule}
                      </span>
                    )}

                    {drug.ndc && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280',
                          borderRadius: '4px',
                        }}
                      >
                        NDC: {drug.ndc}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
