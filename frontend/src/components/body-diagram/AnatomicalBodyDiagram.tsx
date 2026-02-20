import React, { useState, useCallback, useRef } from 'react';

export type BodyView = 'front' | 'back' | 'left' | 'right';

export interface BodyMarker {
  id: string;
  x: number;
  y: number;
  view: BodyView;
  note: string;
  type: 'lesion' | 'procedure' | 'condition' | 'cosmetic' | 'wound' | 'note';
  date: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface AnatomicalBodyDiagramProps {
  patientId: string;
  markers?: BodyMarker[];
  onAddMarker?: (x: number, y: number, view: BodyView) => void;
  onMarkerClick?: (marker: BodyMarker) => void;
  editable?: boolean;
  className?: string;
  showLabels?: boolean;
}

// Marker type colors
const markerColors: Record<BodyMarker['type'], string> = {
  lesion: '#EF4444',
  procedure: '#3B82F6',
  condition: '#F59E0B',
  cosmetic: '#EC4899',
  wound: '#8B5CF6',
  note: '#10B981',
};

// Image paths for each view
const bodyImages: Record<BodyView, string> = {
  front: '/images/body-diagram/front.jpg',
  back: '/images/body-diagram/back.jpg',
  left: '/images/body-diagram/left.jpg',
  right: '/images/body-diagram/right.jpg',
};

export function AnatomicalBodyDiagram({
  patientId,
  markers = [],
  onAddMarker,
  onMarkerClick,
  editable = false,
  className = '',
  showLabels = false,
}: AnatomicalBodyDiagramProps) {
  const [currentView, setCurrentView] = useState<BodyView>('front');
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editable || !onAddMarker || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      // Calculate click position as percentage
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      onAddMarker(x, y, currentView);
    },
    [editable, onAddMarker, currentView]
  );

  const filteredMarkers = markers.filter((m) => m.view === currentView);

  const viewButtons: { view: BodyView; label: string }[] = [
    { view: 'front', label: 'Front' },
    { view: 'back', label: 'Back' },
    { view: 'left', label: 'Left Side' },
    { view: 'right', label: 'Right Side' },
  ];

  return (
    <div className={`anatomical-body-diagram ${className}`}>
      {/* View Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {viewButtons.map(({ view, label }) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              background: currentView === view
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : '#f3f4f6',
              color: currentView === view ? 'white' : '#374151',
              fontWeight: '600',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: currentView === view
                ? '0 4px 12px rgba(102, 126, 234, 0.4)'
                : '0 1px 3px rgba(0,0,0,0.1)',
              transform: currentView === view ? 'translateY(-1px)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Instructions */}
      {editable && (
        <div
          style={{
            textAlign: 'center',
            padding: '12px',
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#4338ca',
            fontWeight: '500',
          }}
        >
          Click anywhere on the body to add a marker
        </div>
      )}

      {/* Image Container with Markers */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div
          ref={containerRef}
          onClick={handleImageClick}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '400px',
            margin: '0 auto',
            cursor: editable ? 'crosshair' : 'default',
          }}
        >
          {/* Body Image */}
          <img
            src={bodyImages[currentView]}
            alt={`Human body ${currentView} view`}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: '8px',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            draggable={false}
          />

          {/* Markers Overlay */}
          {filteredMarkers.map((marker) => (
            <div
              key={marker.id}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(marker);
              }}
              onMouseEnter={() => setHoveredMarker(marker.id)}
              onMouseLeave={() => setHoveredMarker(null)}
              style={{
                position: 'absolute',
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: hoveredMarker === marker.id ? 10 : 1,
              }}
            >
              {/* Marker Circle */}
              <div
                style={{
                  width: hoveredMarker === marker.id ? '28px' : '24px',
                  height: hoveredMarker === marker.id ? '28px' : '24px',
                  borderRadius: '50%',
                  backgroundColor: markerColors[marker.type],
                  border: '3px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: 'white',
                }}
              >
                {filteredMarkers.indexOf(marker) + 1}
              </div>

              {/* Tooltip on hover */}
              {hoveredMarker === marker.id && marker.note && (
                <div
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    marginLeft: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#1f2937',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    zIndex: 20,
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'capitalize' }}>
                    {marker.type}
                  </div>
                  <div>{marker.note.length > 30 ? marker.note.slice(0, 30) + '...' : marker.note}</div>
                  {marker.severity && (
                    <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
                      Severity: {marker.severity}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Marker count */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '16px',
          fontSize: '14px',
          color: '#6b7280',
        }}
      >
        {filteredMarkers.length} marker{filteredMarkers.length !== 1 ? 's' : ''} on {currentView} view
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginTop: '16px',
          padding: '12px',
          background: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        {Object.entries(markerColors).map(([type, color]) => (
          <div
            key={type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#4b5563',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: color,
              }}
            />
            <span style={{ textTransform: 'capitalize' }}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AnatomicalBodyDiagram;
