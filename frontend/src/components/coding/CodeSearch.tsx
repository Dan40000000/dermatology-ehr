import { useState, useEffect, useCallback, useRef } from 'react';
import type { QuickPickItem } from './QuickPickButton';

interface CodeSearchProps {
  onSelect: (item: QuickPickItem) => void;
  onSearch: (query: string, codeType?: 'CPT' | 'ICD10') => Promise<QuickPickItem[]>;
  placeholder?: string;
  codeTypeFilter?: 'CPT' | 'ICD10' | null;
  onCodeTypeChange?: (codeType: 'CPT' | 'ICD10' | null) => void;
  autoFocus?: boolean;
}

export function CodeSearch({
  onSelect,
  onSearch,
  placeholder = 'Search codes...',
  codeTypeFilter = null,
  onCodeTypeChange,
  autoFocus = false,
}: CodeSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickPickItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const searchResults = await onSearch(searchQuery, codeTypeFilter || undefined);
      setResults(searchResults);
      setIsOpen(searchResults.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [onSearch, codeTypeFilter]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  const handleSelect = (item: QuickPickItem) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
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

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className="code-search">
      <div className="code-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="code-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          autoFocus={autoFocus}
        />

        {isLoading && (
          <span className="code-search-spinner" />
        )}

        {onCodeTypeChange && (
          <div className="code-type-filter">
            <button
              type="button"
              className={`code-type-btn ${codeTypeFilter === null ? 'active' : ''}`}
              onClick={() => onCodeTypeChange(null)}
            >
              All
            </button>
            <button
              type="button"
              className={`code-type-btn ${codeTypeFilter === 'CPT' ? 'active' : ''}`}
              onClick={() => onCodeTypeChange('CPT')}
            >
              CPT
            </button>
            <button
              type="button"
              className={`code-type-btn ${codeTypeFilter === 'ICD10' ? 'active' : ''}`}
              onClick={() => onCodeTypeChange('ICD10')}
            >
              ICD-10
            </button>
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="code-search-results" ref={resultsRef}>
          {results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`code-search-result ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={`code-badge ${item.codeType.toLowerCase()}`}>
                {item.codeType}
              </span>
              <span className="result-code">{item.code}</span>
              <span className="result-description">{item.shortName || item.description}</span>
              {item.categoryName && (
                <span className="result-category">{item.categoryName}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .code-search {
          position: relative;
          width: 100%;
        }

        .code-search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 8px;
          background: var(--surface-color, #fff);
        }

        .code-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          background: transparent;
        }

        .code-search-input::placeholder {
          color: var(--text-tertiary, #94a3b8);
        }

        .code-search-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--border-color, #e0e0e0);
          border-top-color: var(--primary-color, #3b82f6);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .code-type-filter {
          display: flex;
          gap: 0.25rem;
        }

        .code-type-btn {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 4px;
          background: var(--surface-color, #fff);
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .code-type-btn:hover {
          border-color: var(--primary-color, #3b82f6);
        }

        .code-type-btn.active {
          border-color: var(--primary-color, #3b82f6);
          background: var(--primary-color, #3b82f6);
          color: white;
        }

        .code-search-results {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          max-height: 300px;
          overflow-y: auto;
          background: var(--surface-color, #fff);
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 100;
          margin-top: 4px;
        }

        .code-search-result {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 0.1s ease;
        }

        .code-search-result:hover,
        .code-search-result.selected {
          background: var(--hover-color, #f8fafc);
        }

        .code-search-result + .code-search-result {
          border-top: 1px solid var(--border-light, #f1f5f9);
        }

        .code-badge {
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .code-badge.cpt {
          background: var(--success-light, #dcfce7);
          color: var(--success-dark, #166534);
        }

        .code-badge.icd10 {
          background: var(--primary-light, #dbeafe);
          color: var(--primary-dark, #1e40af);
        }

        .result-code {
          font-weight: 600;
          font-family: var(--font-mono, monospace);
          font-size: 0.875rem;
          min-width: 60px;
        }

        .result-description {
          flex: 1;
          font-size: 0.875rem;
          color: var(--text-primary, #1e293b);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-category {
          font-size: 0.75rem;
          color: var(--text-tertiary, #94a3b8);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
