/**
 * Drug Search Component with Autocomplete
 *
 * Provides real-time drug search with autocomplete functionality,
 * displaying drug information including NDC codes, strength, and form.
 * Integrates with the drug interaction checking system.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Pill, AlertTriangle, Check, X, Loader2, Star } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface Drug {
  id: string;
  rxnormCui?: string;
  ndcCode?: string;
  drugName: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: string;
  strength?: string;
  route?: string;
  isControlled?: boolean;
  deaSchedule?: string;
  isDermatologyCommon?: boolean;
}

interface DrugSearchProps {
  onSelect: (drug: Drug) => void;
  onInteractionCheck?: (drug: Drug) => void;
  placeholder?: string;
  initialValue?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  showDermFirst?: boolean;
  className?: string;
}

// =============================================================================
// Severity Styling
// =============================================================================

const DEA_SCHEDULE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  II: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
  III: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  IV: { bg: '#fefce8', text: '#854d0e', border: '#fef08a' },
  V: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
};

// =============================================================================
// Component
// =============================================================================

export function DrugSearch({
  onSelect,
  onInteractionCheck,
  placeholder = 'Search medications...',
  initialValue = '',
  disabled = false,
  autoFocus = false,
  showDermFirst = true,
  className = '',
}: DrugSearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Drug[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Search for drugs
  const searchDrugs = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get auth token from localStorage or context
      const authData = localStorage.getItem('auth');
      const auth = authData ? JSON.parse(authData) : null;

      if (!auth?.accessToken || !auth?.tenantId) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `/api/drugs/search?query=${encodeURIComponent(searchQuery)}&limit=20`,
        {
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'X-Tenant-ID': auth.tenantId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search drugs');
      }

      const data = await response.json();
      let drugs: Drug[] = data.drugs || [];

      // Sort dermatology common drugs first if enabled
      if (showDermFirst) {
        drugs = drugs.sort((a, b) => {
          if (a.isDermatologyCommon && !b.isDermatologyCommon) return -1;
          if (!a.isDermatologyCommon && b.isDermatologyCommon) return 1;
          return 0;
        });
      }

      setResults(drugs);
      setIsOpen(drugs.length > 0);
    } catch (err) {
      console.error('Drug search error:', err);
      setError('Failed to search medications');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [showDermFirst]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchDrugs(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchDrugs]);

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
        setSelectedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

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
    setQuery(drug.drugName);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSelect(drug);

    // Optionally trigger interaction check
    if (onInteractionCheck) {
      onInteractionCheck(drug);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative', width: '100%' }} className={className}>
      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <Search
          size={20}
          style={{
            position: 'absolute',
            left: '14px',
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
          onFocus={() => query.trim().length >= 2 && results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          style={{
            width: '100%',
            padding: '12px 40px 12px 44px',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            fontSize: '15px',
            backgroundColor: disabled ? '#f3f4f6' : 'white',
            cursor: disabled ? 'not-allowed' : 'text',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            outline: 'none',
          }}
          onBlur={e => {
            if (!e.relatedTarget?.closest('[data-dropdown]')) {
              // Delay to allow click on dropdown
              setTimeout(() => setIsOpen(false), 150);
            }
          }}
        />

        {/* Loading/Clear Icons */}
        <div
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isLoading && (
            <Loader2
              size={18}
              style={{
                color: '#3b82f6',
                animation: 'spin 1s linear infinite',
              }}
            />
          )}
          {query && !isLoading && (
            <button
              onClick={clearSearch}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} style={{ color: '#9ca3af' }} />
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          data-dropdown
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12)',
            zIndex: 100,
          }}
        >
          {results.map((drug, index) => (
            <DrugSearchResult
              key={drug.id}
              drug={drug}
              isSelected={selectedIndex === index}
              onClick={() => handleSelect(drug)}
              onMouseEnter={() => setSelectedIndex(index)}
            />
          ))}
        </div>
      )}

      {/* No Results */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            padding: '16px 20px',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12)',
            zIndex: 100,
            textAlign: 'center',
          }}
        >
          <Pill size={24} style={{ color: '#9ca3af', margin: '0 auto 8px' }} />
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>
            No medications found for "{query}"
          </p>
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

// =============================================================================
// Drug Search Result Component
// =============================================================================

interface DrugSearchResultProps {
  drug: Drug;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function DrugSearchResult({ drug, isSelected, onClick, onMouseEnter }: DrugSearchResultProps) {
  const deaColors = drug.deaSchedule ? DEA_SCHEDULE_COLORS[drug.deaSchedule] : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        padding: '14px 18px',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#eff6ff' : 'white',
        borderBottom: '1px solid #f3f4f6',
        transition: 'background-color 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {/* Icon */}
        <div
          style={{
            flexShrink: 0,
            marginTop: '2px',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: drug.isControlled ? '#fef2f2' : '#f0fdf4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {drug.isControlled ? (
            <AlertTriangle size={16} style={{ color: '#dc2626' }} />
          ) : (
            <Pill size={16} style={{ color: '#22c55e' }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Drug Name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#111827',
              }}
            >
              {drug.drugName}
            </span>
            {drug.isDermatologyCommon && (
              <Star
                size={14}
                style={{ color: '#f59e0b', fill: '#f59e0b' }}
                title="Common in Dermatology"
              />
            )}
          </div>

          {/* Generic Name */}
          {drug.genericName && (
            <div
              style={{
                fontSize: '13px',
                color: '#6b7280',
                marginBottom: '6px',
              }}
            >
              Generic: {drug.genericName}
            </div>
          )}

          {/* Tags */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {drug.dosageForm && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  backgroundColor: '#eff6ff',
                  color: '#1e40af',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                {drug.dosageForm}
              </span>
            )}

            {drug.strength && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  backgroundColor: '#f0fdf4',
                  color: '#166534',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                {drug.strength}
              </span>
            )}

            {drug.route && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  backgroundColor: '#faf5ff',
                  color: '#7c3aed',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                {drug.route}
              </span>
            )}

            {drug.isControlled && drug.deaSchedule && deaColors && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  backgroundColor: deaColors.bg,
                  color: deaColors.text,
                  border: `1px solid ${deaColors.border}`,
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                Schedule {drug.deaSchedule}
              </span>
            )}

            {drug.ndcCode && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '3px 6px',
                  backgroundColor: '#f9fafb',
                  color: '#6b7280',
                  borderRadius: '4px',
                }}
              >
                NDC: {drug.ndcCode}
              </span>
            )}

            {drug.drugClass && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '3px 6px',
                  backgroundColor: '#f9fafb',
                  color: '#6b7280',
                  borderRadius: '4px',
                }}
              >
                {drug.drugClass}
              </span>
            )}
          </div>
        </div>

        {/* Selection Indicator */}
        {isSelected && (
          <div
            style={{
              flexShrink: 0,
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={14} style={{ color: 'white' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default DrugSearch;
