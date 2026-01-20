import React, { useState, useMemo } from 'react';
import { LesionMarker, MarkerType } from './BodyMapMarker';

export interface BodyMapSidebarProps {
  lesions: LesionMarker[];
  selectedLesion: LesionMarker | null;
  onLesionClick: (lesion: LesionMarker) => void;
  filters: {
    type: string;
    status: string;
    dateRange: string;
  };
  onFiltersChange: (filters: any) => void;
  onRefresh: () => void;
}

export function BodyMapSidebar({
  lesions,
  selectedLesion,
  onLesionClick,
  filters,
  onFiltersChange,
  onRefresh,
}: BodyMapSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [showQuickNote, setShowQuickNote] = useState(false);

  // Filter and search lesions
  const filteredLesions = useMemo(() => {
    return lesions.filter((lesion) => {
      // Type filter
      if (filters.type !== 'all' && lesion.lesion_type !== filters.type) return false;

      // Status filter
      if (filters.status !== 'all' && lesion.status !== filters.status) return false;

      // Date range filter
      if (filters.dateRange !== 'all') {
        const lesionDate = new Date(lesion.last_examined_date || lesion.created_at);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - lesionDate.getTime()) / (1000 * 60 * 60 * 24));

        if (filters.dateRange === 'week' && daysDiff > 7) return false;
        if (filters.dateRange === 'month' && daysDiff > 30) return false;
        if (filters.dateRange === 'year' && daysDiff > 365) return false;
      }

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          lesion.anatomical_location?.toLowerCase().includes(term) ||
          lesion.lesion_type?.toLowerCase().includes(term) ||
          lesion.notes?.toLowerCase().includes(term) ||
          lesion.id.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [lesions, filters, searchTerm]);

  // Sort by date (most recent first)
  const sortedLesions = useMemo(() => {
    return [...filteredLesions].sort((a, b) => {
      const dateA = new Date(a.last_examined_date || a.created_at);
      const dateB = new Date(b.last_examined_date || b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredLesions]);

  // Get status counts for quick stats
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      monitoring: 0,
      suspicious: 0,
      benign: 0,
      malignant: 0,
      treated: 0,
      resolved: 0,
    };
    lesions.forEach((lesion) => {
      counts[lesion.status] = (counts[lesion.status] || 0) + 1;
    });
    return counts;
  }, [lesions]);

  // Get marker type counts
  const markerTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      lesion: 0,
      procedure: 0,
      condition: 0,
      cosmetic: 0,
      wound: 0,
    };
    lesions.forEach((lesion) => {
      const type = lesion.marker_type || 'lesion';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [lesions]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div
      className="body-map-sidebar"
      style={{
        width: '350px',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>Markers List</h3>
        <button
          onClick={onRefresh}
          style={{
            padding: '6px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: 'white',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Quick Stats - Marker Types */}
      <div
        style={{
          padding: '12px 16px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280', marginBottom: '8px', textTransform: 'uppercase' }}>
          By Type
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '11px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#EF4444' }}>{markerTypeCounts.lesion}</div>
            <div style={{ color: '#6B7280' }}>Lesions</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#3B82F6' }}>{markerTypeCounts.procedure}</div>
            <div style={{ color: '#6B7280' }}>Procs</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#EC4899' }}>{markerTypeCounts.condition}</div>
            <div style={{ color: '#6B7280' }}>Conds</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#A855F7' }}>{markerTypeCounts.cosmetic}</div>
            <div style={{ color: '#6B7280' }}>Cosm</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#F59E0B' }}>{markerTypeCounts.wound}</div>
            <div style={{ color: '#6B7280' }}>Wounds</div>
          </div>
        </div>
      </div>

      {/* Quick Stats - Lesion Status */}
      <div
        style={{
          padding: '12px 16px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280', marginBottom: '8px', textTransform: 'uppercase' }}>
          Lesion Status
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#EF4444' }}>{statusCounts.malignant + statusCounts.suspicious}</div>
            <div style={{ color: '#6B7280' }}>Attention</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#3B82F6' }}>{statusCounts.monitoring}</div>
            <div style={{ color: '#6B7280' }}>Monitoring</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#10B981' }}>{statusCounts.benign}</div>
            <div style={{ color: '#6B7280' }}>Benign</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
        <input
          type="text"
          placeholder="Search lesions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Filters */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
            style={{
              flex: 1,
              padding: '6px 8px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="all">All Status</option>
            <option value="monitoring">Monitoring</option>
            <option value="suspicious">Suspicious</option>
            <option value="benign">Benign</option>
            <option value="malignant">Malignant</option>
            <option value="treated">Treated</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => onFiltersChange({ ...filters, dateRange: e.target.value })}
            style={{
              flex: 1,
              padding: '6px 8px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="all">All Time</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Lesion List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sortedLesions.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px',
            }}
          >
            No markers found
          </div>
        ) : (
          <div>
            {sortedLesions.map((lesion) => {
              const isSelected = selectedLesion?.id === lesion.id;
              const markerType: MarkerType = lesion.marker_type || 'lesion';

              const markerTypeColors = {
                lesion: '#EF4444',
                procedure: '#3B82F6',
                condition: '#EC4899',
                cosmetic: '#A855F7',
                wound: '#F59E0B',
              };

              const statusColor =
                {
                  monitoring: '#3B82F6',
                  suspicious: '#EAB308',
                  benign: '#10B981',
                  malignant: '#EF4444',
                  treated: '#8B5CF6',
                  resolved: '#6B7280',
                }[lesion.status] || '#6B7280';

              const markerTypeColor = markerTypeColors[markerType];

              // Get type-specific label
              const getTypeLabel = () => {
                switch (markerType) {
                  case 'procedure':
                    return lesion.procedure_type || 'Procedure';
                  case 'condition':
                    return lesion.condition_type || 'Condition';
                  case 'cosmetic':
                    return lesion.cosmetic_type || 'Cosmetic';
                  case 'wound':
                    return `Wound (${lesion.wound_status || 'unknown'})`;
                  default:
                    return lesion.lesion_type || 'Lesion';
                }
              };

              return (
                <div
                  key={lesion.id}
                  onClick={() => onLesionClick(lesion)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #E5E7EB',
                    cursor: 'pointer',
                    background: isSelected ? '#EEF2FF' : 'white',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#F9FAFB';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'white';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: markerType === 'procedure' ? '0' : '50%',
                            background: markerTypeColor,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                          {lesion.anatomical_location || 'Unknown Location'}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            color: 'white',
                            background: markerTypeColor,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontWeight: '500',
                            textTransform: 'uppercase',
                          }}
                        >
                          {markerType}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px', textTransform: 'capitalize' }}>
                        {getTypeLabel()}
                        {lesion.size_mm && ` - ${lesion.size_mm}mm`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        {formatDate(lesion.last_examined_date || lesion.created_at)}
                      </div>
                    </div>
                    {markerType === 'lesion' && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'white',
                          background: statusColor,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '500',
                          textTransform: 'uppercase',
                        }}
                      >
                        {lesion.status}
                      </div>
                    )}
                  </div>
                  {lesion.notes && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '12px',
                        color: '#6B7280',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lesion.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Note Section */}
      {selectedLesion && (
        <div
          style={{
            borderTop: '1px solid #E5E7EB',
            padding: '12px 16px',
            background: '#F9FAFB',
          }}
        >
          {showQuickNote ? (
            <div>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="Add a quick note..."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  minHeight: '60px',
                  marginBottom: '8px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    // Save note logic would go here
                    setShowQuickNote(false);
                    setQuickNote('');
                  }}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: '#6B46C1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowQuickNote(false);
                    setQuickNote('');
                  }}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: 'white',
                    color: '#6B7280',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickNote(true)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'white',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6B7280',
              }}
            >
              Add Quick Note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
