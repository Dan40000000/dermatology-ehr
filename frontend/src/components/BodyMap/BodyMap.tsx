import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BodyMapMarker, LesionMarker, BodyMapLegend, MarkerType } from './BodyMapMarker';
import { BodyMapSidebar } from './BodyMapSidebar';
import { LesionDetailModal } from './LesionDetailModal';
import { BodyDiagramSVG } from '../body-diagram/BodyDiagramSVG';
import { useBodyMap } from '../../hooks/useBodyMap';

export type BodyView = 'front' | 'back' | 'head-front' | 'head-back' | 'left-side' | 'right-side';

export interface BodyMapProps {
  patientId: string;
  editable?: boolean;
  showSidebar?: boolean;
  className?: string;
}

export function BodyMap({ patientId, editable = false, showSidebar = true, className = '' }: BodyMapProps) {
  const {
    lesions,
    isLoading,
    selectedLesion,
    setSelectedLesion,
    addLesion,
    updateLesion,
    deleteLesion,
    refreshLesions,
  } = useBodyMap(patientId);

  const [currentView, setCurrentView] = useState<BodyView>('front');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    dateRange: 'all',
  });
  const [markerTypeFilters, setMarkerTypeFilters] = useState({
    lesion: true,
    procedure: true,
    condition: true,
    cosmetic: true,
    wound: true,
  });
  const [showLegend, setShowLegend] = useState(true);
  const [pendingMarkerType, setPendingMarkerType] = useState<MarkerType | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Filter lesions based on current view and filters
  const filteredLesions = lesions.filter((lesion) => {
    // View filter
    if (lesion.body_view !== currentView) return false;

    // Marker type filter
    const markerType = lesion.marker_type || 'lesion';
    if (!markerTypeFilters[markerType]) return false;

    // Type filter
    if (filters.type !== 'all' && lesion.lesion_type !== filters.type) return false;

    // Status filter
    if (filters.status !== 'all' && lesion.status !== filters.status) return false;

    return true;
  });

  // Handle SVG click to add new marker
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!editable || !svgRef.current || !pendingMarkerType) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Call the add lesion handler with marker type
      const newMarker: Partial<LesionMarker> = {
        patient_id: patientId,
        x_coordinate: x,
        y_coordinate: y,
        body_view: currentView,
        marker_type: pendingMarkerType,
        status: 'monitoring',
      };

      addLesion(newMarker as LesionMarker);
      setPendingMarkerType(null);
    },
    [editable, patientId, currentView, addLesion, pendingMarkerType]
  );

  // Handle marker click
  const handleMarkerClick = useCallback(
    (lesion: LesionMarker) => {
      setSelectedLesion(lesion);
      setShowDetailModal(true);
    },
    [setSelectedLesion]
  );

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Middle mouse or shift+left click
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Touch support for tablets
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setPanStart({ x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y });
      setIsPanning(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPanning && e.touches.length === 1) {
      const touch = e.touches[0];
      setPanOffset({
        x: touch.clientX - panStart.x,
        y: touch.clientY - panStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Zoom with + and -
      if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
      // Switch views with arrow keys
      else if (e.key === 'ArrowLeft') {
        const views: BodyView[] = ['front', 'left-side', 'back', 'right-side'];
        const currentIndex = views.indexOf(currentView);
        setCurrentView(views[(currentIndex - 1 + views.length) % views.length]);
      } else if (e.key === 'ArrowRight') {
        const views: BodyView[] = ['front', 'left-side', 'back', 'right-side'];
        const currentIndex = views.indexOf(currentView);
        setCurrentView(views[(currentIndex + 1) % views.length]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView]);

  return (
    <div className={`body-map-container ${className}`} style={{ display: 'flex', gap: '20px', height: '100%' }}>
      {/* Main body map view */}
      <div
        className="body-map-main"
        style={{
          flex: showSidebar ? '1' : 'none',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Toolbar */}
        <div
          className="body-map-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px',
            background: '#fff',
            borderRadius: '8px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {/* View selector */}
          <div className="view-selector" style={{ display: 'flex', gap: '8px' }}>
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
              }}
            >
              Front
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
              }}
            >
              Back
            </button>
            <button
              onClick={() => setCurrentView('head-front')}
              className={currentView === 'head-front' ? 'active' : ''}
              style={{
                padding: '8px 16px',
                border: '1px solid #6B46C1',
                borderRadius: '6px',
                background: currentView === 'head-front' ? '#6B46C1' : 'white',
                color: currentView === 'head-front' ? 'white' : '#6B46C1',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Head
            </button>
          </div>

          {/* Zoom controls */}
          <div className="zoom-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleZoomOut}
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
            <span style={{ minWidth: '60px', textAlign: 'center', fontSize: '14px', fontWeight: '500' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              style={{
                padding: '6px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: zoomLevel >= 3 ? 'not-allowed' : 'pointer',
                opacity: zoomLevel >= 3 ? 0.5 : 1,
              }}
            >
              +
            </button>
            <button
              onClick={handleResetZoom}
              style={{
                padding: '6px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Marker Type Filter Toggles */}
        <div
          style={{
            padding: '16px',
            background: '#fff',
            borderRadius: '8px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#374151' }}>Filter Markers</h4>
            <button
              onClick={() => setShowLegend(!showLegend)}
              style={{
                padding: '4px 8px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#6B7280',
              }}
            >
              {showLegend ? 'Hide' : 'Show'} Legend
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(Object.keys(markerTypeFilters) as MarkerType[]).map((type) => (
              <label
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: markerTypeFilters[type] ? '#EEF2FF' : '#F9FAFB',
                  border: `1px solid ${markerTypeFilters[type] ? '#6B46C1' : '#E5E7EB'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: markerTypeFilters[type] ? '#6B46C1' : '#6B7280',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="checkbox"
                  checked={markerTypeFilters[type]}
                  onChange={(e) =>
                    setMarkerTypeFilters({
                      ...markerTypeFilters,
                      [type]: e.target.checked,
                    })
                  }
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ textTransform: 'capitalize' }}>{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div style={{ marginBottom: '16px' }}>
            <BodyMapLegend />
          </div>
        )}

        {/* Marker Creation Buttons */}
        {editable && (
          <div
            style={{
              padding: '16px',
              background: '#EEF2FF',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#4F46E5' }}>
              Add New Marker
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {(Object.keys(markerTypeFilters) as MarkerType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setPendingMarkerType(pendingMarkerType === type ? null : type)}
                  style={{
                    padding: '8px 16px',
                    border: `2px solid ${pendingMarkerType === type ? '#6B46C1' : '#D1D5DB'}`,
                    borderRadius: '6px',
                    background: pendingMarkerType === type ? '#6B46C1' : 'white',
                    color: pendingMarkerType === type ? 'white' : '#6B7280',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textTransform: 'capitalize',
                    transition: 'all 0.2s',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '13px', color: '#4F46E5' }}>
              {pendingMarkerType ? (
                <>Click on the body diagram to place a <strong>{pendingMarkerType}</strong> marker. Use Shift+Click to pan.</>
              ) : (
                'Select a marker type above, then click on the body diagram to place it.'
              )}
            </div>
          </div>
        )}

        {/* SVG Container */}
        <div
          ref={containerRef}
          className="body-map-svg-container"
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: '#F9FAFB',
            borderRadius: '8px',
            cursor: isPanning ? 'grabbing' : (editable && pendingMarkerType) ? 'crosshair' : 'default',
            touchAction: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.3s ease',
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* Body diagram SVG */}
            <svg
              ref={svgRef}
              viewBox="0 0 400 800"
              style={{
                maxWidth: '500px',
                maxHeight: '100%',
                cursor: (editable && pendingMarkerType) ? 'crosshair' : 'default',
              }}
              onClick={handleSvgClick}
            >
              <BodyDiagramSVG view={currentView === 'front' || currentView === 'back' ? currentView : 'front'} />

              {/* Render markers */}
              {filteredLesions.map((lesion) => (
                <BodyMapMarker
                  key={lesion.id}
                  lesion={lesion}
                  isSelected={selectedLesion?.id === lesion.id}
                  onClick={() => handleMarkerClick(lesion)}
                  zoomLevel={zoomLevel}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fff',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#6B7280',
          }}
        >
          <strong>{filteredLesions.length}</strong> lesion{filteredLesions.length !== 1 ? 's' : ''} on {currentView} view
          {filters.status !== 'all' && ` (${filters.status})`}
        </div>
      </div>

      {/* Sidebar */}
      {showSidebar && (
        <BodyMapSidebar
          lesions={lesions}
          selectedLesion={selectedLesion}
          onLesionClick={handleMarkerClick}
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={refreshLesions}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedLesion && (
        <LesionDetailModal
          lesion={selectedLesion}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedLesion(null);
          }}
          onUpdate={updateLesion}
          onDelete={deleteLesion}
        />
      )}
    </div>
  );
}
