import React, { useState, useRef, useCallback, useMemo } from 'react';

export interface BodyMarking3D {
  id: string;
  patientId: string;
  encounterId?: string;
  locationCode: string;
  locationName?: string;
  locationX: number;
  locationY: number;
  viewType: 'front' | 'back' | 'left' | 'right';
  markingType: 'lesion' | 'examined' | 'biopsy' | 'excision' | 'injection';
  status: 'active' | 'resolved' | 'monitored' | 'biopsied' | 'excised';
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  description?: string;
  treatmentNotes?: string;
  notes?: string;
  examinedDate?: string;
  resolvedDate?: string;
  createdAt: string;
  createdByName?: string;
}

interface BodyDiagram3DProps {
  markings: BodyMarking3D[];
  editable?: boolean;
  onAddMarking?: (locationCode: string, x: number, y: number, viewType: 'front' | 'back' | 'left' | 'right') => void;
  onMarkingClick?: (marking: BodyMarking3D) => void;
  selectedMarkingId?: string;
  showControls?: boolean;
}

type ViewType = 'front' | 'back' | 'left' | 'right';

const MARKING_COLORS = {
  lesion: '#EF4444',
  examined: '#3B82F6',
  biopsy: '#8B5CF6',
  excision: '#F97316',
  injection: '#10B981',
};

const STATUS_COLORS = {
  active: '#EF4444',
  resolved: '#10B981',
  monitored: '#EAB308',
  biopsied: '#8B5CF6',
  excised: '#F97316',
};

const VIEW_ROTATIONS: Record<ViewType, number> = {
  front: 0,
  right: 90,
  back: 180,
  left: 270,
};

export function BodyDiagram3D({
  markings,
  editable = false,
  onAddMarking,
  onMarkingClick,
  selectedMarkingId,
  showControls = true,
}: BodyDiagram3DProps) {
  const [currentView, setCurrentView] = useState<ViewType>('front');
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate which view is showing based on rotation
  const activeView = useMemo((): ViewType => {
    const normalized = ((rotation % 360) + 360) % 360;
    if (normalized >= 315 || normalized < 45) return 'front';
    if (normalized >= 45 && normalized < 135) return 'right';
    if (normalized >= 135 && normalized < 225) return 'back';
    return 'left';
  }, [rotation]);

  // Filter markings for the current view
  const visibleMarkings = useMemo(() => {
    return markings.filter((m) => m.viewType === activeView);
  }, [markings, activeView]);

  // Handle rotation via button clicks
  const rotateToView = useCallback((view: ViewType) => {
    setCurrentView(view);
    setRotation(VIEW_ROTATIONS[view]);
  }, []);

  // Handle drag rotation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    setRotation((prev) => prev + deltaX * 0.5);
    setDragStartX(e.clientX);
  }, [isDragging, dragStartX]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Snap to nearest view
    const normalized = ((rotation % 360) + 360) % 360;
    let snapTo = 0;
    if (normalized >= 315 || normalized < 45) snapTo = 0;
    else if (normalized >= 45 && normalized < 135) snapTo = 90;
    else if (normalized >= 135 && normalized < 225) snapTo = 180;
    else snapTo = 270;
    setRotation(snapTo);
  }, [rotation]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - dragStartX;
    setRotation((prev) => prev + deltaX * 0.5);
    setDragStartX(e.touches[0].clientX);
  }, [isDragging, dragStartX]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const normalized = ((rotation % 360) + 360) % 360;
    let snapTo = 0;
    if (normalized >= 315 || normalized < 45) snapTo = 0;
    else if (normalized >= 45 && normalized < 135) snapTo = 90;
    else if (normalized >= 135 && normalized < 225) snapTo = 180;
    else snapTo = 270;
    setRotation(snapTo);
  }, [rotation]);

  // Handle region click
  const handleBodyClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!editable || !onAddMarking) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    const x = ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((e.clientY - rect.top) / rect.height) * viewBox.height;

    const xPercent = (x / viewBox.width) * 100;
    const yPercent = (y / viewBox.height) * 100;

    // Determine body region based on coordinates
    const regionId = getRegionFromCoordinates(xPercent, yPercent, activeView);
    onAddMarking(regionId, xPercent, yPercent, activeView);
  }, [editable, onAddMarking, activeView]);

  // Get color for a marking
  const getMarkingColor = (marking: BodyMarking3D): string => {
    if (marking.status !== 'active') {
      return STATUS_COLORS[marking.status];
    }
    return MARKING_COLORS[marking.markingType];
  };

  // Get marker radius based on size
  const getMarkerRadius = (marking: BodyMarking3D): number => {
    if (marking.lesionSizeMm) {
      if (marking.lesionSizeMm <= 5) return 4 * zoomLevel;
      if (marking.lesionSizeMm <= 10) return 6 * zoomLevel;
      if (marking.lesionSizeMm <= 20) return 8 * zoomLevel;
      return 10 * zoomLevel;
    }
    return 6 * zoomLevel;
  };

  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
      {/* Controls */}
      {showControls && (
        <div style={{ marginBottom: '20px' }}>
          {/* View Rotation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            {(['front', 'right', 'back', 'left'] as ViewType[]).map((view) => (
              <button
                key={view}
                onClick={() => rotateToView(view)}
                style={{
                  padding: '10px 20px',
                  border: '2px solid',
                  borderColor: activeView === view ? '#6B46C1' : '#D1D5DB',
                  borderRadius: '8px',
                  background: activeView === view ? 'linear-gradient(135deg, #6B46C1, #805AD5)' : 'white',
                  color: activeView === view ? 'white' : '#374151',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textTransform: 'capitalize',
                  boxShadow: activeView === view ? '0 4px 12px rgba(107, 70, 193, 0.3)' : 'none',
                }}
              >
                {view}
              </button>
            ))}
          </div>

          {/* Zoom Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              disabled={zoomLevel <= 0.5}
              style={{
                padding: '8px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: zoomLevel <= 0.5 ? 'not-allowed' : 'pointer',
                opacity: zoomLevel <= 0.5 ? 0.5 : 1,
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              −
            </button>
            <span style={{
              minWidth: '80px',
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: '500',
              color: '#4B5563',
            }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
              disabled={zoomLevel >= 2}
              style={{
                padding: '8px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: zoomLevel >= 2 ? 'not-allowed' : 'pointer',
                opacity: zoomLevel >= 2 ? 0.5 : 1,
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Instruction Text */}
      <div style={{
        textAlign: 'center',
        marginBottom: '16px',
        padding: '12px',
        background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
        borderRadius: '8px',
        color: '#4C1D95',
        fontSize: '14px',
      }}>
        {editable ? (
          <>Drag to rotate the body. Click on the body to add a marking.</>
        ) : (
          <>Drag left/right to rotate the body and view all angles.</>
        )}
      </div>

      {/* 3D Body Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          perspective: '1000px',
          width: '100%',
          height: '600px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotation}deg) scale(${zoomLevel})`,
            transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
          }}
        >
          {/* Front Face */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <BodySVG
              view="front"
              onClick={activeView === 'front' ? handleBodyClick : undefined}
              markings={activeView === 'front' ? visibleMarkings : []}
              selectedMarkingId={selectedMarkingId}
              getMarkingColor={getMarkingColor}
              getMarkerRadius={getMarkerRadius}
              onMarkingClick={onMarkingClick}
              editable={editable}
            />
          </div>

          {/* Right Face */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(-90deg) translateZ(200px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <BodySVG
              view="right"
              onClick={activeView === 'right' ? handleBodyClick : undefined}
              markings={activeView === 'right' ? visibleMarkings : []}
              selectedMarkingId={selectedMarkingId}
              getMarkingColor={getMarkingColor}
              getMarkerRadius={getMarkerRadius}
              onMarkingClick={onMarkingClick}
              editable={editable}
            />
          </div>

          {/* Back Face */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(-180deg) translateZ(400px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <BodySVG
              view="back"
              onClick={activeView === 'back' ? handleBodyClick : undefined}
              markings={activeView === 'back' ? visibleMarkings : []}
              selectedMarkingId={selectedMarkingId}
              getMarkingColor={getMarkingColor}
              getMarkerRadius={getMarkerRadius}
              onMarkingClick={onMarkingClick}
              editable={editable}
            />
          </div>

          {/* Left Face */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(-270deg) translateZ(200px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <BodySVG
              view="left"
              onClick={activeView === 'left' ? handleBodyClick : undefined}
              markings={activeView === 'left' ? visibleMarkings : []}
              selectedMarkingId={selectedMarkingId}
              getMarkingColor={getMarkingColor}
              getMarkerRadius={getMarkerRadius}
              onMarkingClick={onMarkingClick}
              editable={editable}
            />
          </div>
        </div>
      </div>

      {/* Current View Indicator */}
      <div style={{
        textAlign: 'center',
        marginTop: '16px',
        fontSize: '18px',
        fontWeight: '600',
        color: '#6B46C1',
        textTransform: 'capitalize',
      }}>
        {activeView} View
      </div>

      {/* Legend */}
      <div style={{
        marginTop: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, #F9FAFB, #F3F4F6)',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1F2937' }}>
          Marking Types
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {Object.entries(MARKING_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: color,
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                }}
              />
              <span style={{ fontSize: '13px', color: '#4B5563', textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
        </div>

        <h4 style={{ margin: '20px 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1F2937' }}>
          Status Colors
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: color,
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                }}
              />
              <span style={{ fontSize: '13px', color: '#4B5563', textTransform: 'capitalize' }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Marking Summary */}
        <div style={{
          marginTop: '20px',
          padding: '14px',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #E5E7EB',
        }}>
          <div style={{ fontSize: '14px', color: '#4B5563' }}>
            <strong style={{ color: '#6B46C1' }}>{visibleMarkings.length}</strong> marking{visibleMarkings.length !== 1 ? 's' : ''} on {activeView} view
          </div>
          <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '4px' }}>
            Total: <strong>{markings.length}</strong> marking{markings.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to determine body region from coordinates
function getRegionFromCoordinates(x: number, y: number, view: ViewType): string {
  // Head region
  if (y < 15) return `head-${view}`;
  // Neck region
  if (y < 18) return `neck-${view}`;
  // Shoulder/Upper chest region
  if (y < 28) {
    if (x < 35) return `shoulder-left-${view}`;
    if (x > 65) return `shoulder-right-${view}`;
    return view === 'front' || view === 'back' ? `chest-upper-${view}` : `torso-${view}`;
  }
  // Torso region
  if (y < 45) {
    if (x < 30) return `arm-left-upper-${view}`;
    if (x > 70) return `arm-right-upper-${view}`;
    return view === 'front' ? `chest-${view}` : view === 'back' ? `back-upper-${view}` : `torso-${view}`;
  }
  // Abdomen/forearm region
  if (y < 55) {
    if (x < 28) return `arm-left-forearm-${view}`;
    if (x > 72) return `arm-right-forearm-${view}`;
    return view === 'front' ? `abdomen-${view}` : view === 'back' ? `back-lower-${view}` : `torso-${view}`;
  }
  // Pelvis/hand region
  if (y < 62) {
    if (x < 25) return `hand-left-${view}`;
    if (x > 75) return `hand-right-${view}`;
    return view === 'back' ? `buttock-${view}` : `pelvis-${view}`;
  }
  // Thigh region
  if (y < 78) {
    if (x < 50) return `thigh-left-${view}`;
    return `thigh-right-${view}`;
  }
  // Lower leg region
  if (y < 92) {
    if (x < 50) return `shin-left-${view}`;
    return `shin-right-${view}`;
  }
  // Foot region
  if (x < 50) return `foot-left-${view}`;
  return `foot-right-${view}`;
}

// Body SVG Component with enhanced 3D styling
interface BodySVGProps {
  view: ViewType;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
  markings: BodyMarking3D[];
  selectedMarkingId?: string;
  getMarkingColor: (marking: BodyMarking3D) => string;
  getMarkerRadius: (marking: BodyMarking3D) => number;
  onMarkingClick?: (marking: BodyMarking3D) => void;
  editable?: boolean;
}

function BodySVG({
  view,
  onClick,
  markings,
  selectedMarkingId,
  getMarkingColor,
  getMarkerRadius,
  onMarkingClick,
  editable,
}: BodySVGProps) {
  const handleMarkingClick = (e: React.MouseEvent, marking: BodyMarking3D) => {
    e.stopPropagation();
    if (onMarkingClick) {
      onMarkingClick(marking);
    }
  };

  const isSideView = view === 'left' || view === 'right';

  return (
    <svg
      viewBox="0 0 200 500"
      style={{
        width: '100%',
        maxWidth: '300px',
        height: 'auto',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.15))',
      }}
      onClick={onClick}
    >
      <defs>
        {/* Skin gradient for 3D effect */}
        <radialGradient id={`skinGradient-${view}`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE4D6" />
          <stop offset="50%" stopColor="#F5D0C0" />
          <stop offset="100%" stopColor="#E8C0B0" />
        </radialGradient>
        {/* Shadow gradient */}
        <linearGradient id={`shadowGradient-${view}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D4B5A5" />
          <stop offset="100%" stopColor="#E8C0B0" />
        </linearGradient>
        {/* Glow effect for selections */}
        <filter id={`glow-${view}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {/* Drop shadow */}
        <filter id={`dropShadow-${view}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
          <feOffset dx="3" dy="5" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.25" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {isSideView ? (
        // Side view body
        <g filter={`url(#dropShadow-${view})`}>
          {/* Head */}
          <ellipse
            cx="100"
            cy="40"
            rx="25"
            ry="30"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Neck */}
          <rect
            x="90"
            y="68"
            width="20"
            height="22"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1"
          />
          {/* Torso - side profile (narrower) */}
          <path
            d={view === 'right'
              ? "M 85 90 Q 75 100 75 140 Q 70 180 75 220 Q 75 240 85 260 L 115 260 Q 125 240 125 220 Q 130 180 125 140 Q 125 100 115 90 Z"
              : "M 85 90 Q 95 100 95 140 Q 100 180 95 220 Q 95 240 85 260 L 115 260 Q 105 240 105 220 Q 100 180 105 140 Q 105 100 115 90 Z"
            }
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Arm (showing the visible arm on this side) */}
          <path
            d="M 100 100 Q 120 120 130 160 Q 135 200 125 240 L 120 240 Q 125 200 120 160 Q 110 120 95 105"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          {/* Hand */}
          <ellipse
            cx="123"
            cy="250"
            rx="10"
            ry="14"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1"
          />
          {/* Leg (front visible) */}
          <path
            d="M 85 260 Q 80 300 85 360 Q 90 420 95 460 L 105 460 Q 110 420 105 360 Q 110 300 105 260"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Foot */}
          <ellipse
            cx="100"
            cy="470"
            rx="18"
            ry="12"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1"
          />
          {/* Eye */}
          <circle cx={view === 'right' ? '110' : '90'} cy="35" r="3" fill="#5A4A42" />
        </g>
      ) : view === 'front' ? (
        // Front view
        <g filter={`url(#dropShadow-${view})`}>
          {/* Head */}
          <ellipse
            cx="100"
            cy="40"
            rx="28"
            ry="32"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Neck */}
          <rect
            x="88"
            y="70"
            width="24"
            height="20"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1"
          />
          {/* Shoulders + Chest */}
          <path
            d="M 50 95 Q 60 88 100 88 Q 140 88 150 95 L 150 110 Q 145 95 100 95 Q 55 95 50 110 Z"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          {/* Torso */}
          <rect
            x="65"
            y="105"
            width="70"
            height="90"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Abdomen */}
          <rect
            x="70"
            y="195"
            width="60"
            height="55"
            rx="5"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Left Arm */}
          <rect
            x="35"
            y="100"
            width="18"
            height="75"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="32"
            y="175"
            width="16"
            height="70"
            rx="7"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="40" cy="258" rx="12" ry="16" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Right Arm */}
          <rect
            x="147"
            y="100"
            width="18"
            height="75"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="152"
            y="175"
            width="16"
            height="70"
            rx="7"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="160" cy="258" rx="12" ry="16" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Left Leg */}
          <rect
            x="68"
            y="250"
            width="26"
            height="110"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="70"
            y="360"
            width="22"
            height="100"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="81" cy="470" rx="14" ry="18" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Right Leg */}
          <rect
            x="106"
            y="250"
            width="26"
            height="110"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="108"
            y="360"
            width="22"
            height="100"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="119" cy="470" rx="14" ry="18" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Face features */}
          <circle cx="90" cy="35" r="3" fill="#5A4A42" />
          <circle cx="110" cy="35" r="3" fill="#5A4A42" />
          <path d="M 95 48 Q 100 52 105 48" stroke="#C9A090" fill="none" strokeWidth="2" />
        </g>
      ) : (
        // Back view
        <g filter={`url(#dropShadow-${view})`}>
          {/* Head */}
          <ellipse
            cx="100"
            cy="40"
            rx="28"
            ry="32"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Hair indication */}
          <path
            d="M 75 30 Q 80 15 100 12 Q 120 15 125 30"
            fill="none"
            stroke="#8B7355"
            strokeWidth="3"
          />
          {/* Neck */}
          <rect
            x="88"
            y="70"
            width="24"
            height="20"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1"
          />
          {/* Shoulders */}
          <path
            d="M 50 95 Q 60 88 100 88 Q 140 88 150 95 L 150 110 Q 145 95 100 95 Q 55 95 50 110 Z"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          {/* Upper Back */}
          <rect
            x="65"
            y="105"
            width="70"
            height="80"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Lower Back */}
          <rect
            x="70"
            y="185"
            width="60"
            height="50"
            rx="5"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          {/* Buttocks */}
          <ellipse cx="82" cy="255" rx="18" ry="22" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1.5" />
          <ellipse cx="118" cy="255" rx="18" ry="22" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1.5" />
          {/* Left Arm */}
          <rect
            x="35"
            y="100"
            width="18"
            height="75"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <rect
            x="32"
            y="175"
            width="16"
            height="70"
            rx="7"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="40" cy="258" rx="12" ry="16" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Right Arm */}
          <rect
            x="147"
            y="100"
            width="18"
            height="75"
            rx="8"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <rect
            x="152"
            y="175"
            width="16"
            height="70"
            rx="7"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="160" cy="258" rx="12" ry="16" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Left Leg (back) */}
          <rect
            x="68"
            y="275"
            width="26"
            height="95"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="70"
            y="370"
            width="22"
            height="90"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="81" cy="470" rx="14" ry="18" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Right Leg (back) */}
          <rect
            x="106"
            y="275"
            width="26"
            height="95"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
            style={{ cursor: editable ? 'pointer' : 'default' }}
          />
          <rect
            x="108"
            y="370"
            width="22"
            height="90"
            rx="10"
            fill={`url(#skinGradient-${view})`}
            stroke="#C9A090"
            strokeWidth="1.5"
          />
          <ellipse cx="119" cy="470" rx="14" ry="18" fill={`url(#skinGradient-${view})`} stroke="#C9A090" strokeWidth="1" />
          {/* Spine indication */}
          <path
            d="M 100 90 L 100 230"
            stroke="#D4B5A5"
            strokeWidth="2"
            strokeDasharray="4,4"
            opacity="0.5"
          />
        </g>
      )}

      {/* Overlay markings */}
      {markings.map((marking) => {
        const color = getMarkingColor(marking);
        const radius = getMarkerRadius(marking);
        const isSelected = marking.id === selectedMarkingId;

        const x = (marking.locationX / 100) * 200;
        const y = (marking.locationY / 100) * 500;

        return (
          <g
            key={marking.id}
            onClick={(e) => handleMarkingClick(e as any, marking)}
            style={{ cursor: 'pointer' }}
            filter={isSelected ? `url(#glow-${view})` : undefined}
          >
            {isSelected && (
              <circle
                cx={x}
                cy={y}
                r={radius + 5}
                fill="none"
                stroke="#6B46C1"
                strokeWidth="2"
                strokeDasharray="4,2"
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill={color}
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx={x - radius * 0.25}
              cy={y - radius * 0.25}
              r={radius * 0.35}
              fill="white"
              opacity="0.5"
            />
            <title>{`${marking.markingType.toUpperCase()}: ${marking.diagnosisDescription || marking.description || marking.notes || 'No description'}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export default BodyDiagram3D;
