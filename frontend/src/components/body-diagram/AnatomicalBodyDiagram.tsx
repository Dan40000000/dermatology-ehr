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
  const svgRef = useRef<SVGSVGElement>(null);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!editable || !onAddMarker || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;

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

      {/* SVG Container */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 300 700"
          style={{
            width: '100%',
            maxWidth: '400px',
            height: 'auto',
            display: 'block',
            margin: '0 auto',
            cursor: editable ? 'crosshair' : 'default',
          }}
          onClick={handleSvgClick}
        >
          <defs>
            {/* Gradients for anatomical shading */}
            <linearGradient id="muscleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e5e7eb" />
              <stop offset="50%" stopColor="#d1d5db" />
              <stop offset="100%" stopColor="#9ca3af" />
            </linearGradient>
            <linearGradient id="muscleHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="100%" stopColor="#d1d5db" />
            </linearGradient>
            <linearGradient id="shadowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9ca3af" />
              <stop offset="100%" stopColor="#d1d5db" />
            </linearGradient>
            {/* Filter for subtle shadow */}
            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
              <feOffset dx="1" dy="2" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.2" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Render the appropriate body view */}
          {currentView === 'front' && <FrontView showLabels={showLabels} />}
          {currentView === 'back' && <BackView showLabels={showLabels} />}
          {currentView === 'left' && <LeftSideView showLabels={showLabels} />}
          {currentView === 'right' && <RightSideView showLabels={showLabels} />}

          {/* Render markers */}
          {filteredMarkers.map((marker) => (
            <g
              key={marker.id}
              transform={`translate(${(marker.x / 100) * 300}, ${(marker.y / 100) * 700})`}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(marker);
              }}
              onMouseEnter={() => setHoveredMarker(marker.id)}
              onMouseLeave={() => setHoveredMarker(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Marker circle */}
              <circle
                r={hoveredMarker === marker.id ? 12 : 10}
                fill={markerColors[marker.type]}
                stroke="white"
                strokeWidth="2"
                style={{
                  transition: 'r 0.2s ease',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                }}
              />
              {/* Marker number */}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="10"
                fontWeight="bold"
              >
                {filteredMarkers.indexOf(marker) + 1}
              </text>
              {/* Tooltip on hover */}
              {hoveredMarker === marker.id && marker.note && (
                <g transform="translate(15, -10)">
                  <rect
                    x="0"
                    y="-12"
                    width={Math.max(marker.note.length * 6, 80)}
                    height="24"
                    rx="4"
                    fill="#1f2937"
                    opacity="0.9"
                  />
                  <text
                    x="8"
                    y="0"
                    fill="white"
                    fontSize="10"
                    dominantBaseline="middle"
                  >
                    {marker.note.length > 20 ? marker.note.slice(0, 20) + '...' : marker.note}
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
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

// ============================================
// FRONT VIEW - Detailed Anatomical SVG
// ============================================
function FrontView({ showLabels }: { showLabels?: boolean }) {
  return (
    <g filter="url(#dropShadow)">
      {/* Head */}
      <ellipse cx="150" cy="45" rx="35" ry="40" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Face details */}
      <ellipse cx="150" cy="50" rx="28" ry="32" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      {/* Eyes */}
      <ellipse cx="138" cy="42" rx="5" ry="3" fill="#6b7280" />
      <ellipse cx="162" cy="42" rx="5" ry="3" fill="#6b7280" />
      {/* Nose */}
      <path d="M150 48 L148 56 L152 56 Z" fill="none" stroke="#9ca3af" strokeWidth="0.5" />
      {/* Mouth */}
      <path d="M143 62 Q150 66 157 62" fill="none" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Neck */}
      <path
        d="M135 82 L135 105 Q135 115 145 118 L155 118 Q165 115 165 105 L165 82"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Neck muscles (sternocleidomastoid) */}
      <path d="M140 85 Q145 100 148 115" fill="none" stroke="#d1d5db" strokeWidth="0.75" />
      <path d="M160 85 Q155 100 152 115" fill="none" stroke="#d1d5db" strokeWidth="0.75" />

      {/* Trapezius (shoulders/upper back visible from front) */}
      <path
        d="M135 100 Q120 105 95 120 L95 135 Q110 130 130 125"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M165 100 Q180 105 205 120 L205 135 Q190 130 170 125"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Deltoids (shoulders) */}
      <ellipse cx="95" cy="145" rx="22" ry="28" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      <ellipse cx="205" cy="145" rx="22" ry="28" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      {/* Deltoid striations */}
      <path d="M85 135 Q92 150 88 165" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M95 130 Q100 150 95 170" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M215 135 Q208 150 212 165" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M205 130 Q200 150 205 170" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />

      {/* Pectorals (chest) */}
      <path
        d="M115 125 Q150 120 185 125 L185 180 Q150 195 115 180 Z"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Pectoral separation */}
      <path d="M150 125 L150 185" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Pectoral muscle fibers */}
      <path d="M120 135 Q140 150 145 175" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <path d="M180 135 Q160 150 155 175" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <path d="M125 155 Q140 165 148 175" fill="none" stroke="#d1d5db" strokeWidth="0.5" />
      <path d="M175 155 Q160 165 152 175" fill="none" stroke="#d1d5db" strokeWidth="0.5" />

      {/* Serratus anterior (side ribs) */}
      <path d="M112 180 L108 190 L112 200 L108 210" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M188 180 L192 190 L188 200 L192 210" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />

      {/* Abdominals */}
      <path
        d="M130 190 L130 320 Q130 335 150 340 Q170 335 170 320 L170 190"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Rectus abdominis divisions (6-pack) */}
      <path d="M135 200 L165 200" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M135 230 L165 230" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M135 260 L165 260" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M137 290 L163 290" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Linea alba (center line) */}
      <path d="M150 190 L150 335" fill="none" stroke="#b8bcc4" strokeWidth="1" />

      {/* External obliques */}
      <path d="M112 220 Q122 260 128 310" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M188 220 Q178 260 172 310" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />

      {/* Arms - Biceps & Triceps */}
      {/* Left arm */}
      <path
        d="M78 165 Q70 200 72 250 Q74 280 80 310 Q82 330 78 360"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M95 175 Q100 210 98 260 Q96 290 92 320 Q90 340 92 360"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Bicep definition */}
      <path d="M82 190 Q88 220 86 250" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Forearm */}
      <path
        d="M78 360 Q76 390 80 420 Q82 450 78 480"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M92 360 Q94 390 90 420 Q88 450 90 480"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Left hand */}
      <ellipse cx="84" cy="505" rx="15" ry="22" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Fingers suggestion */}
      <path d="M75 520 L72 540" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M80 522 L78 545" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M85 523 L85 548" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M90 522 L92 545" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M94 518 L98 535" fill="none" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Right arm */}
      <path
        d="M222 165 Q230 200 228 250 Q226 280 220 310 Q218 330 222 360"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M205 175 Q200 210 202 260 Q204 290 208 320 Q210 340 208 360"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Bicep definition */}
      <path d="M218 190 Q212 220 214 250" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Forearm */}
      <path
        d="M222 360 Q224 390 220 420 Q218 450 222 480"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M208 360 Q206 390 210 420 Q212 450 210 480"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Right hand */}
      <ellipse cx="216" cy="505" rx="15" ry="22" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Fingers */}
      <path d="M225 520 L228 540" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M220 522 L222 545" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M215 523 L215 548" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M210 522 L208 545" fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      <path d="M206 518 L202 535" fill="none" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Pelvis/Hip area */}
      <path
        d="M125 335 Q115 350 110 370 L110 385 Q125 395 150 400 Q175 395 190 385 L190 370 Q185 350 175 335"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Left leg - Quadriceps */}
      <path
        d="M110 385 Q105 420 108 480 Q110 530 115 570 L115 600"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M148 400 Q152 440 150 500 Q148 550 145 600"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Quad muscle separations */}
      <path d="M118 400 Q122 450 120 520" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M130 400 Q135 460 132 540" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M140 400 Q142 470 140 550" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Knee */}
      <ellipse cx="130" cy="580" rx="18" ry="12" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="0.75" />
      {/* Shin/calf front */}
      <path
        d="M115 595 Q112 630 115 665 L115 670"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M145 595 Q148 630 145 665 L145 670"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Shin bone hint */}
      <path d="M128 600 L128 660" fill="none" stroke="#c4c8d0" strokeWidth="0.5" />
      {/* Left foot */}
      <path
        d="M112 668 Q108 680 115 690 L145 690 Q152 680 148 668"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Right leg - Quadriceps */}
      <path
        d="M190 385 Q195 420 192 480 Q190 530 185 570 L185 600"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M152 400 Q148 440 150 500 Q152 550 155 600"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Quad muscle separations */}
      <path d="M182 400 Q178 450 180 520" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M170 400 Q165 460 168 540" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M160 400 Q158 470 160 550" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Knee */}
      <ellipse cx="170" cy="580" rx="18" ry="12" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="0.75" />
      {/* Shin/calf front */}
      <path
        d="M155 595 Q152 630 155 665 L155 670"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M185 595 Q188 630 185 665 L185 670"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Shin bone hint */}
      <path d="M172 600 L172 660" fill="none" stroke="#c4c8d0" strokeWidth="0.5" />
      {/* Right foot */}
      <path
        d="M152 668 Q148 680 155 690 L185 690 Q192 680 188 668"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Labels if enabled */}
      {showLabels && (
        <g fontSize="8" fill="#6b7280" fontFamily="sans-serif">
          <text x="150" y="15" textAnchor="middle">Head</text>
          <text x="55" y="150" textAnchor="middle">R. Shoulder</text>
          <text x="245" y="150" textAnchor="middle">L. Shoulder</text>
          <text x="150" y="160" textAnchor="middle">Chest</text>
          <text x="150" y="270" textAnchor="middle">Abdomen</text>
          <text x="50" y="280" textAnchor="middle">R. Arm</text>
          <text x="250" y="280" textAnchor="middle">L. Arm</text>
          <text x="130" y="500" textAnchor="middle">R. Leg</text>
          <text x="170" y="500" textAnchor="middle">L. Leg</text>
        </g>
      )}
    </g>
  );
}

// ============================================
// BACK VIEW - Detailed Anatomical SVG
// ============================================
function BackView({ showLabels }: { showLabels?: boolean }) {
  return (
    <g filter="url(#dropShadow)">
      {/* Head (back) */}
      <ellipse cx="150" cy="45" rx="35" ry="40" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Hair/scalp suggestion */}
      <path d="M120 30 Q150 15 180 30" fill="none" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Neck (back) */}
      <path
        d="M135 82 L135 115 L165 115 L165 82"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Spine start */}
      <path d="M150 85 L150 115" fill="none" stroke="#b8bcc4" strokeWidth="1" />

      {/* Trapezius (large back muscle) */}
      <path
        d="M135 100 Q90 130 85 150 L85 200 Q100 195 120 185 L130 180 Q140 175 150 175 Q160 175 170 180 L180 185 Q200 195 215 200 L215 150 Q210 130 165 100"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Trapezius detail lines */}
      <path d="M100 135 Q130 155 150 175" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M200 135 Q170 155 150 175" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />

      {/* Deltoids (back view) */}
      <ellipse cx="85" cy="155" rx="20" ry="30" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      <ellipse cx="215" cy="155" rx="20" ry="30" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />

      {/* Latissimus dorsi (lats) */}
      <path
        d="M120 185 Q105 220 100 280 Q100 300 115 310 L115 290 Q118 250 125 220 Q130 200 135 190"
        fill="url(#shadowGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M180 185 Q195 220 200 280 Q200 300 185 310 L185 290 Q182 250 175 220 Q170 200 165 190"
        fill="url(#shadowGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Spine and back muscles */}
      <path
        d="M135 175 L135 340 Q135 350 150 355 Q165 350 165 340 L165 175"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Spine */}
      <path d="M150 175 L150 350" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
      {/* Vertebrae suggestions */}
      <path d="M145 190 L155 190" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 210 L155 210" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 230 L155 230" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 250 L155 250" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 270 L155 270" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 290 L155 290" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 310 L155 310" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 330 L155 330" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />

      {/* Erector spinae (back muscles along spine) */}
      <path d="M140 180 Q138 260 140 340" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M160 180 Q162 260 160 340" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />

      {/* Arms - Triceps */}
      {/* Left arm (appears on right in back view) */}
      <path
        d="M70 180 Q62 220 65 270 Q68 310 72 350 Q74 380 70 410"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M95 185 Q100 225 97 275 Q94 315 90 355 Q88 385 92 415"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Tricep detail */}
      <path d="M78 200 Q82 250 80 300" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Forearm */}
      <path d="M70 410 Q68 440 72 470 L72 490" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      <path d="M92 415 Q94 445 90 475 L90 495" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Hand */}
      <ellipse cx="81" cy="515" rx="14" ry="20" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />

      {/* Right arm (appears on left in back view) */}
      <path
        d="M230 180 Q238 220 235 270 Q232 310 228 350 Q226 380 230 410"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M205 185 Q200 225 203 275 Q206 315 210 355 Q212 385 208 415"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Tricep detail */}
      <path d="M222 200 Q218 250 220 300" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Forearm */}
      <path d="M230 410 Q232 440 228 470 L228 490" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      <path d="M208 415 Q206 445 210 475 L210 495" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Hand */}
      <ellipse cx="219" cy="515" rx="14" ry="20" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />

      {/* Gluteus (buttocks) */}
      <ellipse cx="130" cy="380" rx="25" ry="35" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      <ellipse cx="170" cy="380" rx="25" ry="35" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      {/* Gluteal fold */}
      <path d="M110 405 Q130 415 150 410 Q170 415 190 405" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Left leg (back - hamstrings) */}
      <path
        d="M105 410 Q100 460 105 520 Q108 560 112 590"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M148 415 Q152 465 148 525 Q145 565 142 595"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Hamstring separations */}
      <path d="M115 420 Q118 480 115 540" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M130 420 Q132 490 128 560" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Knee back */}
      <path d="M112 585 Q127 595 142 585" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Calf */}
      <path
        d="M112 595 Q105 620 108 650 Q110 665 115 670"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M142 595 Q150 620 147 650 Q145 665 140 670"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Calf muscle shape */}
      <path d="M118 600 Q127 630 125 655" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Achilles */}
      <path d="M127 660 L127 680" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      {/* Heel */}
      <ellipse cx="127" cy="685" rx="12" ry="8" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />

      {/* Right leg (back) */}
      <path
        d="M195 410 Q200 460 195 520 Q192 560 188 590"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M152 415 Q148 465 152 525 Q155 565 158 595"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Hamstring separations */}
      <path d="M185 420 Q182 480 185 540" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M170 420 Q168 490 172 560" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Knee back */}
      <path d="M158 585 Q173 595 188 585" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Calf */}
      <path
        d="M158 595 Q150 620 153 650 Q155 665 160 670"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M188 595 Q195 620 192 650 Q190 665 185 670"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Calf muscle */}
      <path d="M175 600 Q173 630 175 655" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Achilles */}
      <path d="M173 660 L173 680" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      {/* Heel */}
      <ellipse cx="173" cy="685" rx="12" ry="8" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />

      {/* Labels */}
      {showLabels && (
        <g fontSize="8" fill="#6b7280" fontFamily="sans-serif">
          <text x="150" y="15" textAnchor="middle">Head</text>
          <text x="150" y="145" textAnchor="middle">Upper Back</text>
          <text x="150" y="280" textAnchor="middle">Lower Back</text>
          <text x="150" y="395" textAnchor="middle">Glutes</text>
          <text x="127" y="640" textAnchor="middle">L. Calf</text>
          <text x="173" y="640" textAnchor="middle">R. Calf</text>
        </g>
      )}
    </g>
  );
}

// ============================================
// LEFT SIDE VIEW - Detailed Anatomical SVG
// ============================================
function LeftSideView({ showLabels }: { showLabels?: boolean }) {
  return (
    <g filter="url(#dropShadow)">
      {/* Head (side profile) */}
      <ellipse cx="150" cy="50" rx="30" ry="40" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Face profile */}
      <path
        d="M175 35 Q185 50 180 65 Q175 75 165 80"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Eye */}
      <ellipse cx="168" cy="45" rx="4" ry="3" fill="#6b7280" />
      {/* Ear */}
      <ellipse cx="130" cy="50" rx="8" ry="12" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="0.75" />
      {/* Jaw */}
      <path d="M165 80 Q155 90 145 85" fill="none" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Neck (side) */}
      <path
        d="M145 85 Q140 95 138 110 L138 125 Q145 130 155 128 Q165 120 168 105 Q170 90 165 80"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Sternocleidomastoid */}
      <path d="M158 88 Q148 100 142 115" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Shoulder/Deltoid (side) */}
      <ellipse cx="145" cy="150" rx="30" ry="25" fill="url(#muscleGradient)" stroke="#9ca3af" strokeWidth="1" />
      {/* Deltoid striations */}
      <path d="M125 140 Q140 150 135 170" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      <path d="M145 135 Q155 150 150 172" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />

      {/* Chest/torso (side profile) */}
      <path
        d="M160 130 Q180 150 185 180 Q188 220 180 280 Q175 320 165 360"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Back line */}
      <path
        d="M125 135 Q115 160 110 200 Q108 250 115 300 Q120 340 130 370"
        fill="url(#shadowGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Pec (side) */}
      <path d="M165 145 Q175 165 175 185" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Lat (side) */}
      <path d="M120 175 Q115 220 118 260" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Abs (side) */}
      <path d="M170 200 Q172 240 168 280" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      <path d="M168 210 L175 210" fill="none" stroke="#c4c8d0" strokeWidth="0.5" />
      <path d="M168 235 L174 235" fill="none" stroke="#c4c8d0" strokeWidth="0.5" />
      <path d="M167 260 L172 260" fill="none" stroke="#c4c8d0" strokeWidth="0.5" />

      {/* Arm (side view - shows tricep/bicep) */}
      <path
        d="M115 165 Q100 200 105 260 Q108 300 100 340 Q95 370 100 400"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M140 175 Q150 210 145 270 Q140 310 145 350 Q148 380 143 410"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Bicep bulge */}
      <path d="M130 200 Q138 230 132 260" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Tricep */}
      <path d="M115 200 Q110 240 115 280" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />
      {/* Elbow */}
      <ellipse cx="122" cy="340" rx="8" ry="6" fill="none" stroke="#b8bcc4" strokeWidth="0.5" />
      {/* Forearm */}
      <path d="M100 400 Q95 430 100 460" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      <path d="M143 410 Q148 440 143 470" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />
      {/* Hand */}
      <ellipse cx="120" cy="495" rx="18" ry="25" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="1" />

      {/* Hip/Glute (side) */}
      <path
        d="M165 360 Q175 380 170 410 Q165 440 155 460"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M130 370 Q115 395 120 430 Q125 460 140 480"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Glute shape */}
      <path d="M125 385 Q118 410 125 440" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Leg (side - shows quad and hamstring) */}
      {/* Thigh */}
      <path
        d="M155 460 Q165 500 160 560 Q155 590 150 610"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M140 480 Q130 520 135 570 Q138 595 145 615"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Quad */}
      <path d="M155 480 Q160 520 155 560" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />
      {/* Hamstring */}
      <path d="M138 490 Q132 530 138 580" fill="none" stroke="#c4c8d0" strokeWidth="0.75" />

      {/* Knee (side) */}
      <ellipse cx="148" cy="605" rx="10" ry="8" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="0.75" />

      {/* Lower leg */}
      <path
        d="M150 615 Q158 640 155 665 L155 675"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <path
        d="M145 618 Q135 645 140 670 L142 680"
        fill="url(#muscleGradient)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Calf */}
      <path d="M142 625 Q135 650 140 670" fill="none" stroke="#b8bcc4" strokeWidth="0.75" />

      {/* Foot (side) */}
      <path
        d="M140 678 Q130 685 135 692 L170 692 Q175 688 168 678"
        fill="url(#muscleHighlight)"
        stroke="#9ca3af"
        strokeWidth="1"
      />
      {/* Heel */}
      <ellipse cx="138" cy="685" rx="8" ry="6" fill="url(#muscleHighlight)" stroke="#9ca3af" strokeWidth="0.5" />

      {/* Labels */}
      {showLabels && (
        <g fontSize="8" fill="#6b7280" fontFamily="sans-serif">
          <text x="150" y="15" textAnchor="middle">Head</text>
          <text x="100" y="150" textAnchor="middle">Shoulder</text>
          <text x="180" y="220" textAnchor="middle">Chest</text>
          <text x="105" y="280" textAnchor="middle">Back</text>
          <text x="85" y="350" textAnchor="middle">Arm</text>
          <text x="115" y="420" textAnchor="middle">Glute</text>
          <text x="170" y="530" textAnchor="middle">Thigh</text>
          <text x="130" y="650" textAnchor="middle">Calf</text>
        </g>
      )}
    </g>
  );
}

// ============================================
// RIGHT SIDE VIEW - Detailed Anatomical SVG
// ============================================
function RightSideView({ showLabels }: { showLabels?: boolean }) {
  return (
    <g filter="url(#dropShadow)" transform="translate(300, 0) scale(-1, 1)">
      {/* Mirror the left side view */}
      <LeftSideView showLabels={false} />

      {/* Re-add labels (not mirrored) */}
      {showLabels && (
        <g fontSize="8" fill="#6b7280" fontFamily="sans-serif" transform="scale(-1, 1) translate(-300, 0)">
          <text x="150" y="15" textAnchor="middle">Head</text>
          <text x="200" y="150" textAnchor="middle">Shoulder</text>
          <text x="120" y="220" textAnchor="middle">Chest</text>
          <text x="195" y="280" textAnchor="middle">Back</text>
          <text x="215" y="350" textAnchor="middle">Arm</text>
          <text x="185" y="420" textAnchor="middle">Glute</text>
          <text x="130" y="530" textAnchor="middle">Thigh</text>
          <text x="170" y="650" textAnchor="middle">Calf</text>
        </g>
      )}
    </g>
  );
}

export default AnatomicalBodyDiagram;
