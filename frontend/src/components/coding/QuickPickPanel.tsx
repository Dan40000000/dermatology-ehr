import { useState, useEffect, useCallback } from 'react';
import { QuickPickButton, type QuickPickItem } from './QuickPickButton';
import { CategoryTabs, type QuickPickCategory } from './CategoryTabs';
import { CodeSearch } from './CodeSearch';
import { BundleSelector, type QuickPickBundle } from './BundleSelector';

interface EncounterCode {
  id: string;
  code: string;
  codeType: 'CPT' | 'ICD10';
  description: string;
  isPrimary: boolean;
  modifier: string | null;
  units: number;
}

interface QuickPickPanelProps {
  encounterId: string;
  onCodesChange?: (codes: EncounterCode[]) => void;
  apiBaseUrl?: string;
  authToken?: string;
}

export function QuickPickPanel({
  encounterId,
  onCodesChange,
  apiBaseUrl = '/api',
  authToken,
}: QuickPickPanelProps) {
  // State
  const [categories, setCategories] = useState<QuickPickCategory[]>([]);
  const [items, setItems] = useState<QuickPickItem[]>([]);
  const [bundles, setBundles] = useState<QuickPickBundle[]>([]);
  const [encounterCodes, setEncounterCodes] = useState<EncounterCode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [codeTypeFilter, setCodeTypeFilter] = useState<'CPT' | 'ICD10' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBundleLoading, setIsBundleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quickpicks' | 'bundles'>('quickpicks');

  // API helper
  const apiFetch = useCallback(async (endpoint: string, options?: RequestInit) => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }, [apiBaseUrl, authToken]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [categoriesRes, itemsRes, bundlesRes, codesRes] = await Promise.all([
          apiFetch('/quickpicks/categories'),
          apiFetch('/quickpicks'),
          apiFetch('/quickpicks/bundles'),
          apiFetch(`/quickpicks/encounter/${encounterId}`),
        ]);

        setCategories(categoriesRes.categories || []);
        setItems(itemsRes.items || []);
        setBundles(bundlesRes.bundles || []);
        setEncounterCodes(codesRes.codes || []);
      } catch (err) {
        console.error('Failed to load quick picks:', err);
        setError('Failed to load coding data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [encounterId, apiFetch]);

  // Notify parent of code changes
  useEffect(() => {
    if (onCodesChange) {
      onCodesChange(encounterCodes);
    }
  }, [encounterCodes, onCodesChange]);

  // Filter items
  const filteredItems = items.filter(item => {
    if (selectedCategory && item.categoryId !== selectedCategory) {
      return false;
    }
    if (codeTypeFilter && item.codeType !== codeTypeFilter) {
      return false;
    }
    return true;
  });

  // Group items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const categoryName = item.categoryName || 'Other';
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(item);
    return acc;
  }, {} as Record<string, QuickPickItem[]>);

  // Handlers
  const handleSelectItem = async (item: QuickPickItem) => {
    try {
      // Add code to encounter
      const response = await apiFetch('/quickpicks/encounter', {
        method: 'POST',
        body: JSON.stringify({
          encounterId,
          codes: [{
            code: item.code,
            codeType: item.codeType,
            description: item.description,
          }],
        }),
      });

      // Update local state
      setEncounterCodes(prev => [...prev, ...response.codes]);

      // Record usage
      await apiFetch(`/quickpicks/use/${item.id}`, { method: 'POST' });

      // Update usage count locally
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, usageCount: i.usageCount + 1 } : i
      ));
    } catch (err) {
      console.error('Failed to add code:', err);
    }
  };

  const handleToggleFavorite = async (item: QuickPickItem) => {
    try {
      await apiFetch('/quickpicks/favorites', {
        method: 'PUT',
        body: JSON.stringify({
          favorites: [{ itemId: item.id, isFavorite: !item.isFavorite }],
        }),
      });

      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, isFavorite: !i.isFavorite } : i
      ));
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleSearch = async (query: string, codeType?: 'CPT' | 'ICD10'): Promise<QuickPickItem[]> => {
    const params = new URLSearchParams({ q: query });
    if (codeType) {
      params.append('codeType', codeType);
    }

    const response = await apiFetch(`/quickpicks/search?${params.toString()}`);
    return response.results || [];
  };

  const handleApplyBundle = async (bundle: QuickPickBundle) => {
    setIsBundleLoading(true);
    try {
      const response = await apiFetch(`/quickpicks/bundles/${bundle.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ encounterId }),
      });

      setEncounterCodes(prev => [...prev, ...response.codes]);
    } catch (err) {
      console.error('Failed to apply bundle:', err);
    } finally {
      setIsBundleLoading(false);
    }
  };

  const handleRemoveCode = async (codeId: string) => {
    try {
      await apiFetch(`/quickpicks/encounter/code/${codeId}`, { method: 'DELETE' });
      setEncounterCodes(prev => prev.filter(c => c.id !== codeId));
    } catch (err) {
      console.error('Failed to remove code:', err);
    }
  };

  const handleSetPrimary = async (codeId: string) => {
    try {
      await apiFetch(`/quickpicks/encounter/code/${codeId}`, {
        method: 'PUT',
        body: JSON.stringify({ isPrimary: true }),
      });

      setEncounterCodes(prev => prev.map(c => ({
        ...c,
        isPrimary: c.id === codeId && c.codeType === 'ICD10',
      })));
    } catch (err) {
      console.error('Failed to set primary:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="quick-pick-panel loading">
        <div className="loading-spinner" />
        <span>Loading coding panel...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="quick-pick-panel error">
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  // Separate diagnoses and procedures
  const diagnosisCodes = encounterCodes.filter(c => c.codeType === 'ICD10');
  const procedureCodes = encounterCodes.filter(c => c.codeType === 'CPT');

  return (
    <div className="quick-pick-panel">
      {/* Selected codes display */}
      <div className="selected-codes-section">
        <div className="selected-codes-header">
          <h3>Selected Codes</h3>
          <span className="codes-count">{encounterCodes.length} codes</span>
        </div>

        {encounterCodes.length === 0 ? (
          <div className="no-codes-message">
            Click on quick picks below to add codes
          </div>
        ) : (
          <div className="selected-codes-grid">
            {diagnosisCodes.length > 0 && (
              <div className="code-group">
                <h4>Diagnoses (ICD-10)</h4>
                <div className="code-chips">
                  {diagnosisCodes.map(code => (
                    <div key={code.id} className={`code-chip icd10 ${code.isPrimary ? 'primary' : ''}`}>
                      <span className="chip-code">{code.code}</span>
                      <span className="chip-desc">{code.description}</span>
                      {!code.isPrimary && (
                        <button
                          type="button"
                          className="chip-primary-btn"
                          onClick={() => handleSetPrimary(code.id)}
                          title="Set as primary"
                        >
                          P
                        </button>
                      )}
                      {code.isPrimary && (
                        <span className="primary-badge">Primary</span>
                      )}
                      <button
                        type="button"
                        className="chip-remove-btn"
                        onClick={() => handleRemoveCode(code.id)}
                        aria-label="Remove code"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {procedureCodes.length > 0 && (
              <div className="code-group">
                <h4>Procedures (CPT)</h4>
                <div className="code-chips">
                  {procedureCodes.map(code => (
                    <div key={code.id} className="code-chip cpt">
                      <span className="chip-code">{code.code}</span>
                      <span className="chip-desc">{code.description}</span>
                      {code.modifier && (
                        <span className="chip-modifier">-{code.modifier}</span>
                      )}
                      {code.units > 1 && (
                        <span className="chip-units">x{code.units}</span>
                      )}
                      <button
                        type="button"
                        className="chip-remove-btn"
                        onClick={() => handleRemoveCode(code.id)}
                        aria-label="Remove code"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="search-section">
        <CodeSearch
          onSelect={handleSelectItem}
          onSearch={handleSearch}
          codeTypeFilter={codeTypeFilter}
          onCodeTypeChange={setCodeTypeFilter}
          placeholder="Search diagnosis or procedure codes..."
        />
      </div>

      {/* Tab navigation */}
      <div className="panel-tabs">
        <button
          type="button"
          className={`panel-tab ${activeTab === 'quickpicks' ? 'active' : ''}`}
          onClick={() => setActiveTab('quickpicks')}
        >
          Quick Picks
        </button>
        <button
          type="button"
          className={`panel-tab ${activeTab === 'bundles' ? 'active' : ''}`}
          onClick={() => setActiveTab('bundles')}
        >
          Bundles ({bundles.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === 'quickpicks' ? (
        <div className="quickpicks-section">
          <CategoryTabs
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          <div className="quickpicks-grid">
            {Object.entries(groupedItems).map(([categoryName, categoryItems]) => (
              <div key={categoryName} className="category-group">
                <h4 className="category-name">{categoryName}</h4>
                <div className="items-grid">
                  {categoryItems.map(item => (
                    <QuickPickButton
                      key={item.id}
                      item={item}
                      onSelect={handleSelectItem}
                      onToggleFavorite={handleToggleFavorite}
                      selected={encounterCodes.some(c => c.code === item.code)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bundles-section">
          <BundleSelector
            bundles={bundles}
            onApplyBundle={handleApplyBundle}
            isLoading={isBundleLoading}
          />
        </div>
      )}

      <style>{`
        .quick-pick-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: var(--surface-color, #fff);
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 8px;
          max-height: 80vh;
          overflow: hidden;
        }

        .quick-pick-panel.loading,
        .quick-pick-panel.error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          gap: 1rem;
          color: var(--text-secondary, #64748b);
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-color, #e0e0e0);
          border-top-color: var(--primary-color, #3b82f6);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Selected Codes Section */
        .selected-codes-section {
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .selected-codes-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .selected-codes-header h3 {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .codes-count {
          font-size: 0.75rem;
          color: var(--text-tertiary, #94a3b8);
        }

        .no-codes-message {
          padding: 1rem;
          text-align: center;
          color: var(--text-tertiary, #94a3b8);
          font-size: 0.875rem;
        }

        .selected-codes-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .code-group h4 {
          margin: 0 0 0.375rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
        }

        .code-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .code-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.5rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          background: var(--surface-alt, #f8fafc);
          border: 1px solid var(--border-color, #e0e0e0);
        }

        .code-chip.icd10 {
          border-left: 3px solid var(--primary-color, #3b82f6);
        }

        .code-chip.cpt {
          border-left: 3px solid var(--success-color, #22c55e);
        }

        .code-chip.primary {
          background: var(--primary-light, #eff6ff);
          border-color: var(--primary-color, #3b82f6);
        }

        .chip-code {
          font-family: var(--font-mono, monospace);
          font-weight: 600;
        }

        .chip-desc {
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chip-modifier,
        .chip-units {
          padding: 0.125rem 0.25rem;
          background: var(--surface-color, #fff);
          border-radius: 3px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .primary-badge {
          padding: 0.125rem 0.375rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border-radius: 4px;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .chip-primary-btn {
          padding: 0.125rem 0.25rem;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 3px;
          background: var(--surface-color, #fff);
          font-size: 0.625rem;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary, #64748b);
        }

        .chip-primary-btn:hover {
          border-color: var(--primary-color, #3b82f6);
          color: var(--primary-color, #3b82f6);
        }

        .chip-remove-btn {
          margin-left: 0.25rem;
          padding: 0 0.25rem;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-tertiary, #94a3b8);
          cursor: pointer;
        }

        .chip-remove-btn:hover {
          color: var(--danger-color, #ef4444);
        }

        /* Search Section */
        .search-section {
          flex-shrink: 0;
        }

        /* Panel Tabs */
        .panel-tabs {
          display: flex;
          gap: 0.25rem;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .panel-tab {
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.15s ease;
        }

        .panel-tab:hover {
          color: var(--text-primary, #1e293b);
        }

        .panel-tab.active {
          color: var(--primary-color, #3b82f6);
          border-bottom-color: var(--primary-color, #3b82f6);
        }

        /* Quick Picks Section */
        .quickpicks-section {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .quickpicks-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .category-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .category-name {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .items-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        /* Bundles Section */
        .bundles-section {
          flex: 1;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
