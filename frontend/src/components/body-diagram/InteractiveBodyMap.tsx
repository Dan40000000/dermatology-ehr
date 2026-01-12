import React, { useState, useMemo } from 'react';
import { BodyDiagramSVG } from './BodyDiagramSVG';

export interface BodyMarking {
  id: string;
  patientId: string;
  encounterId?: string;
  locationCode: string;
  locationName?: string;
  locationX: number;
  locationY: number;
  viewType: 'front' | 'back';
  markingType: 'lesion' | 'examined' | 'biopsy' | 'excision' | 'injection';
  status: 'active' | 'resolved' | 'monitored' | 'biopsied' | 'excised';
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  description?: string;
  treatmentNotes?: string;
  examinedDate?: string;
  resolvedDate?: string;
  createdAt: string;
  createdByName?: string;
}

interface InteractiveBodyMapProps {
  markings: BodyMarking[];
  editable?: boolean;
  onAddMarking?: (locationCode: string, x: number, y: number, viewType: 'front' | 'back') => void;
  onMarkingClick?: (marking: BodyMarking) => void;
  selectedMarkingId?: string;
  className?: string;
}

// Color coding for marking types and statuses
const MARKING_COLORS = {
  // By marking type
  lesion: '#EF4444', // RED
  examined: '#3B82F6', // BLUE
  biopsy: '#8B5CF6', // PURPLE
  excision: '#F97316', // ORANGE
  injection: '#10B981', // GREEN
};

const STATUS_COLORS = {
  active: '#EF4444', // RED
  resolved: '#10B981', // GREEN
  monitored: '#EAB308', // YELLOW
  biopsied: '#8B5CF6', // PURPLE
  excised: '#F97316', // ORANGE
};

export function InteractiveBodyMap({
  markings,
  editable = false,
  onAddMarking,
  onMarkingClick,
  selectedMarkingId,
  className = '',
}: InteractiveBodyMapProps) {
  const [currentView, setCurrentView] = useState<'front' | 'back'>('front');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Filter markings by current view
  const visibleMarkings = useMemo(() => {
    if (!Array.isArray(markings)) {
      return [];
    }
    return markings.filter((m) => m.viewType === currentView);
  }, [markings, currentView]);

  // Get color for a marking based on status (prioritized) or type
  const getMarkingColor = (marking: BodyMarking): string => {
    // Use status color if not active, otherwise use marking type color
    if (marking.status !== 'active') {
      return STATUS_COLORS[marking.status];
    }
    return MARKING_COLORS[marking.markingType];
  };

  // Handle region click - add new marking
  const handleRegionClick = (regionId: string, x: number, y: number) => {
    if (editable && onAddMarking) {
      onAddMarking(regionId, x, y, currentView);
    }
  };

  // Handle marking click
  const handleMarkingClick = (e: React.MouseEvent, marking: BodyMarking) => {
    e.stopPropagation();
    if (onMarkingClick) {
      onMarkingClick(marking);
    }
  };

  // Get marker size based on lesion size or default
  const getMarkerRadius = (marking: BodyMarking): number => {
    if (marking.lesionSizeMm) {
      // Scale: 1-5mm = 4px, 6-10mm = 6px, 11-20mm = 8px, 21+ = 10px
      if (marking.lesionSizeMm <= 5) return 4 * zoomLevel;
      if (marking.lesionSizeMm <= 10) return 6 * zoomLevel;
      if (marking.lesionSizeMm <= 20) return 8 * zoomLevel;
      return 10 * zoomLevel;
    }
    return 6 * zoomLevel; // Default size
  };

  return (
    <div className={`interactive-body-map ${className}`}>
      {/* View Toggle */}
      <div className="body-map-controls" style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div className="view-toggle" style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setCurrentView('front')}
            className={currentView === 'front' ? 'active' : ''}
            style={{
              padding: '8px 16px',
              border: '1px solid #6B46C1',
              borderRadius: '6px',
              background: currentView === 'front' ? '#6B46C1' : 'white',
              color: currentView === 'front' ? 'white' : '#6B46C1',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Front View
          </button>
          <button
            onClick={() => setCurrentView('back')}
            className={currentView === 'back' ? 'active' : ''}
            style={{
              padding: '8px 16px',
              border: '1px solid #6B46C1',
              borderRadius: '6px',
              background: currentView === 'back' ? '#6B46C1' : 'white',
              color: currentView === 'back' ? 'white' : '#6B46C1',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Back View
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="zoom-controls" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
            disabled={zoomLevel <= 0.5}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: 'white',
              cursor: zoomLevel <= 0.5 ? 'not-allowed' : 'pointer',
              opacity: zoomLevel <= 0.5 ? 0.5 : 1,
            }}
          >
            -
          </button>
          <span style={{ padding: '6px 12px', minWidth: '60px', textAlign: 'center' }}>
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
            disabled={zoomLevel >= 2}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: 'white',
              cursor: zoomLevel >= 2 ? 'not-allowed' : 'pointer',
              opacity: zoomLevel >= 2 ? 0.5 : 1,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Hint Text */}
      {editable && (
        <div
          className="body-map-hint"
          style={{
            marginBottom: '16px',
            padding: '12px',
            background: '#EEF2FF',
            borderRadius: '6px',
            color: '#4F46E5',
            fontSize: '14px',
          }}
        >
          Click anywhere on the body diagram to add a new marking
        </div>
      )}

      {/* Body Diagram Container */}
      <div
        className="body-diagram-container"
        style={{
          position: 'relative',
          maxWidth: '500px',
          margin: '0 auto',
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top center',
          transition: 'transform 0.3s ease',
        }}
      >
        <BodyDiagramSVG view={currentView} onRegionClick={handleRegionClick} />

        {/* Overlay markings on SVG */}
        <svg
          viewBox="0 0 400 800"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {visibleMarkings.map((marking) => {
            const color = getMarkingColor(marking);
            const radius = getMarkerRadius(marking);
            const isSelected = marking.id === selectedMarkingId;

            // Convert percentage to viewBox coordinates
            const x = (marking.locationX / 100) * 400;
            const y = (marking.locationY / 100) * 800;

            return (
              <g
                key={marking.id}
                onClick={(e) => handleMarkingClick(e as any, marking)}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              >
                {/* Outer ring for selection */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={radius + 4}
                    fill="none"
                    stroke="#6B46C1"
                    strokeWidth="2"
                    className="marking-selection-ring"
                  />
                )}

                {/* Main marker */}
                <circle cx={x} cy={y} r={radius} fill={color} stroke="white" strokeWidth="2" className="body-marking" />

                {/* Inner highlight */}
                <circle cx={x} cy={y} r={radius * 0.4} fill="white" opacity="0.6" />

                {/* Label on hover */}
                <title>{`${marking.markingType.toUpperCase()}: ${marking.diagnosisDescription || marking.description || marking.locationName || 'No description'}`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="body-map-legend" style={{ marginTop: '24px', padding: '16px', background: '#F9FAFB', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Marking Types</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
          {Object.entries(MARKING_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: color,
                  border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
              <span style={{ fontSize: '13px', color: '#6B7280', textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
        </div>

        <h4 style={{ margin: '16px 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Status Colors</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: color,
                  border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
              <span style={{ fontSize: '13px', color: '#6B7280', textTransform: 'capitalize' }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Marking count */}
        <div style={{ marginTop: '16px', padding: '12px', background: 'white', borderRadius: '6px' }}>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>
            <strong>{visibleMarkings.length}</strong> marking{visibleMarkings.length !== 1 ? 's' : ''} on {currentView} view
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
            Total: <strong>{Array.isArray(markings) ? markings.length : 0}</strong> marking{(Array.isArray(markings) ? markings.length : 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
