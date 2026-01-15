import { useState, useEffect } from 'react';
import type { QuickFilter, OrderFilters } from '../../types';

interface QuickFiltersProps {
  onLoadFilter: (filters: OrderFilters) => void;
  currentFilters: OrderFilters;
}

const STORAGE_KEY = 'orders_quick_filters';

export function QuickFilters({ onLoadFilter, currentFilters }: QuickFiltersProps) {
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingFilter, setEditingFilter] = useState<QuickFilter | null>(null);
  const [filterName, setFilterName] = useState('');

  useEffect(() => {
    loadQuickFilters();
  }, []);

  const loadQuickFilters = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setQuickFilters(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load quick filters:', error);
    }
  };

  const saveQuickFilters = (filters: QuickFilter[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
      setQuickFilters(filters);
    } catch (error) {
      console.error('Failed to save quick filters:', error);
    }
  };

  const handleSaveCurrentFilter = () => {
    if (!filterName.trim()) return;

    const newFilter: QuickFilter = {
      id: Date.now().toString(),
      name: filterName.trim(),
      orderTypes: currentFilters.orderTypes,
      statuses: currentFilters.statuses,
      priorities: currentFilters.priorities,
      searchTerm: currentFilters.searchTerm,
      groupBy: currentFilters.groupBy,
    };

    saveQuickFilters([...quickFilters, newFilter]);
    setFilterName('');
    setShowSaveDialog(false);
  };

  const handleUpdateFilter = () => {
    if (!editingFilter || !filterName.trim()) return;

    const updatedFilters = quickFilters.map((f) =>
      f.id === editingFilter.id ? { ...editingFilter, name: filterName.trim() } : f
    );

    saveQuickFilters(updatedFilters);
    setEditingFilter(null);
    setFilterName('');
    setShowEditDialog(false);
  };

  const handleDeleteFilter = (filterId: string) => {
    if (!confirm('Delete this quick filter?')) return;
    saveQuickFilters(quickFilters.filter((f) => f.id !== filterId));
  };

  const handleLoadFilter = (filter: QuickFilter) => {
    onLoadFilter({
      orderTypes: filter.orderTypes,
      statuses: filter.statuses,
      priorities: filter.priorities,
      searchTerm: filter.searchTerm || '',
      groupBy: filter.groupBy || 'none',
    });
  };

  const openEditDialog = (filter: QuickFilter) => {
    setEditingFilter(filter);
    setFilterName(filter.name);
    setShowEditDialog(true);
  };

  return (
    <div className="quick-filters-panel" style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
      border: '1px solid #e5e7eb',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem',
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#374151',
        }}>
          My Quick Filters
        </h3>
        <button
          type="button"
          onClick={() => setShowSaveDialog(true)}
          style={{
            padding: '0.375rem 0.75rem',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          + Save Current Filter
        </button>
      </div>

      {quickFilters.length === 0 ? (
        <p style={{
          color: '#6b7280',
          fontSize: '0.813rem',
          margin: 0,
          fontStyle: 'italic',
        }}>
          No saved filters. Configure filters and click "Save Current Filter" to create one.
        </p>
      ) : (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          {quickFilters.map((filter) => (
            <div
              key={filter.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#f3f4f6',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
              }}
            >
              <button
                type="button"
                onClick={() => handleLoadFilter(filter)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#059669',
                  fontSize: '0.813rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {filter.name}
              </button>
              <button
                type="button"
                onClick={() => openEditDialog(filter)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.125rem',
                }}
                title="Edit filter"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFilter(filter.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.125rem',
                }}
                title="Delete filter"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}

      {showSaveDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '1.5rem',
            width: '400px',
            maxWidth: '90%',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>
              Save Quick Filter
            </h3>
            <input
              type="text"
              placeholder="Filter name..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentFilter()}
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowSaveDialog(false);
                  setFilterName('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentFilter}
                disabled={!filterName.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: filterName.trim() ? '#10b981' : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: filterName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && editingFilter && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '1.5rem',
            width: '400px',
            maxWidth: '90%',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>
              Edit Quick Filter
            </h3>
            <input
              type="text"
              placeholder="Filter name..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdateFilter()}
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingFilter(null);
                  setFilterName('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateFilter}
                disabled={!filterName.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: filterName.trim() ? '#10b981' : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: filterName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
