import { useState, useCallback } from 'react';

export interface BodyRegion {
  id: string;
  name: string;
  path: string;
  cx?: number;
  cy?: number;
}

export interface Lesion {
  id: string;
  regionId: string;
  x: number;
  y: number;
  type: 'primary' | 'secondary' | 'healed';
  description?: string;
  diagnosis?: string;
  dateAdded: string;
}

interface BodyMapProps {
  view?: 'anterior' | 'posterior';
  lesions?: Lesion[];
  selectedRegion?: string;
  onRegionClick?: (regionId: string) => void;
  onLesionClick?: (lesion: Lesion) => void;
  onAddLesion?: (regionId: string, x: number, y: number) => void;
  editable?: boolean;
  showLabels?: boolean;
  className?: string;
}

// Anatomically accurate body regions for dermatology
const BODY_REGIONS: BodyRegion[] = [
  // Head and Neck
  { id: 'scalp', name: 'Scalp', path: 'M200,20 Q220,5 240,20 Q260,35 260,50 Q260,65 240,70 L200,70 Q180,65 180,50 Q180,35 200,20' },
  { id: 'forehead', name: 'Forehead', path: 'M195,70 L245,70 Q250,80 250,95 L190,95 Q190,80 195,70' },
  { id: 'face', name: 'Face', path: 'M190,95 L250,95 Q255,120 250,145 Q240,160 220,165 Q200,160 190,145 Q185,120 190,95' },
  { id: 'neck-anterior', name: 'Neck (Anterior)', path: 'M200,165 L240,165 Q245,180 245,200 L195,200 Q195,180 200,165' },

  // Trunk - Anterior
  { id: 'chest-right', name: 'Chest (Right)', path: 'M170,200 L220,200 L220,280 L160,280 Q155,240 170,200' },
  { id: 'chest-left', name: 'Chest (Left)', path: 'M220,200 L270,200 Q285,240 280,280 L220,280 L220,200' },
  { id: 'abdomen-upper', name: 'Upper Abdomen', path: 'M160,280 L280,280 L280,330 L160,330 Z' },
  { id: 'abdomen-lower', name: 'Lower Abdomen', path: 'M165,330 L275,330 L270,400 L170,400 Z' },

  // Arms - Right
  { id: 'shoulder-right', name: 'Right Shoulder', path: 'M120,200 L170,200 Q155,215 140,230 Q125,215 120,200' },
  { id: 'upper-arm-right', name: 'Right Upper Arm', path: 'M120,230 L150,230 L145,310 L110,310 Z' },
  { id: 'elbow-right', name: 'Right Elbow', path: 'M110,310 L145,310 L145,340 L108,340 Z' },
  { id: 'forearm-right', name: 'Right Forearm', path: 'M108,340 L145,340 L140,420 L100,420 Z' },
  { id: 'hand-right', name: 'Right Hand', path: 'M95,420 L145,420 Q150,440 145,460 Q130,475 115,475 Q100,475 90,460 Q85,440 95,420' },

  // Arms - Left
  { id: 'shoulder-left', name: 'Left Shoulder', path: 'M270,200 L320,200 Q315,215 300,230 Q285,215 270,200' },
  { id: 'upper-arm-left', name: 'Left Upper Arm', path: 'M290,230 L320,230 L330,310 L295,310 Z' },
  { id: 'elbow-left', name: 'Left Elbow', path: 'M295,310 L332,310 L335,340 L295,340 Z' },
  { id: 'forearm-left', name: 'Left Forearm', path: 'M295,340 L340,340 L350,420 L300,420 Z' },
  { id: 'hand-left', name: 'Left Hand', path: 'M295,420 L355,420 Q360,440 355,460 Q340,475 325,475 Q310,475 300,460 Q295,440 295,420' },

  // Pelvis/Groin
  { id: 'groin-right', name: 'Right Groin', path: 'M170,400 L220,400 L210,440 L175,440 Z' },
  { id: 'groin-left', name: 'Left Groin', path: 'M220,400 L270,400 L265,440 L230,440 Z' },

  // Legs - Right
  { id: 'thigh-right', name: 'Right Thigh', path: 'M160,440 L210,440 L200,560 L150,560 Z' },
  { id: 'knee-right', name: 'Right Knee', path: 'M150,560 L200,560 Q205,580 200,600 L145,600 Q140,580 150,560' },
  { id: 'lower-leg-right', name: 'Right Lower Leg', path: 'M145,600 L200,600 L195,720 L140,720 Z' },
  { id: 'ankle-right', name: 'Right Ankle', path: 'M140,720 L195,720 L195,750 L140,750 Z' },
  { id: 'foot-right', name: 'Right Foot', path: 'M135,750 L200,750 Q210,770 200,790 L130,790 Q120,770 135,750' },

  // Legs - Left
  { id: 'thigh-left', name: 'Left Thigh', path: 'M230,440 L280,440 L290,560 L240,560 Z' },
  { id: 'knee-left', name: 'Left Knee', path: 'M240,560 L290,560 Q300,580 295,600 L245,600 Q235,580 240,560' },
  { id: 'lower-leg-left', name: 'Left Lower Leg', path: 'M245,600 L295,600 L300,720 L250,720 Z' },
  { id: 'ankle-left', name: 'Left Ankle', path: 'M250,720 L300,720 L300,750 L250,750 Z' },
  { id: 'foot-left', name: 'Left Foot', path: 'M245,750 L305,750 Q320,770 310,790 L240,790 Q230,770 245,750' },
];

// Posterior view regions
const POSTERIOR_REGIONS: BodyRegion[] = [
  // Head and Neck
  { id: 'scalp-post', name: 'Scalp (Posterior)', path: 'M200,20 Q220,5 240,20 Q260,35 260,50 Q260,65 240,70 L200,70 Q180,65 180,50 Q180,35 200,20' },
  { id: 'neck-posterior', name: 'Neck (Posterior)', path: 'M200,70 L240,70 Q245,100 245,130 L195,130 Q195,100 200,70' },

  // Upper Back
  { id: 'upper-back-right', name: 'Upper Back (Right)', path: 'M160,130 L220,130 L220,220 L150,220 Q145,175 160,130' },
  { id: 'upper-back-left', name: 'Upper Back (Left)', path: 'M220,130 L280,130 Q295,175 290,220 L220,220 L220,130' },

  // Mid Back
  { id: 'mid-back-right', name: 'Mid Back (Right)', path: 'M150,220 L220,220 L220,300 L155,300 Z' },
  { id: 'mid-back-left', name: 'Mid Back (Left)', path: 'M220,220 L290,220 L285,300 L220,300 Z' },

  // Lower Back
  { id: 'lower-back-right', name: 'Lower Back (Right)', path: 'M155,300 L220,300 L220,360 L160,360 Z' },
  { id: 'lower-back-left', name: 'Lower Back (Left)', path: 'M220,300 L285,300 L280,360 L220,360 Z' },

  // Buttocks
  { id: 'buttock-right', name: 'Right Buttock', path: 'M160,360 L220,360 L215,430 L165,430 Q160,395 160,360' },
  { id: 'buttock-left', name: 'Left Buttock', path: 'M220,360 L280,360 Q280,395 275,430 L225,430 L220,360' },

  // Arms - Posterior (same as anterior but mirrored context)
  { id: 'posterior-arm-right', name: 'Right Posterior Arm', path: 'M110,180 L150,180 L145,340 L100,340 Z' },
  { id: 'posterior-arm-left', name: 'Left Posterior Arm', path: 'M290,180 L330,180 L340,340 L295,340 Z' },

  // Posterior Legs
  { id: 'posterior-thigh-right', name: 'Right Posterior Thigh', path: 'M155,430 L215,430 L205,560 L145,560 Z' },
  { id: 'posterior-thigh-left', name: 'Left Posterior Thigh', path: 'M225,430 L275,430 L285,560 L235,560 Z' },
  { id: 'calf-right', name: 'Right Calf', path: 'M140,600 L200,600 L195,720 L135,720 Z' },
  { id: 'calf-left', name: 'Left Calf', path: 'M240,600 L300,600 L305,720 L245,720 Z' },
  { id: 'heel-right', name: 'Right Heel', path: 'M135,750 L200,750 L200,790 L130,790 Z' },
  { id: 'heel-left', name: 'Left Heel', path: 'M240,750 L310,750 L310,790 L235,790 Z' },
];

const LESION_COLORS = {
  primary: 'var(--error-500)',
  secondary: 'var(--warning-500)',
  healed: 'var(--success-500)',
};

export function BodyMap({
  view = 'anterior',
  lesions = [],
  selectedRegion,
  onRegionClick,
  onLesionClick,
  onAddLesion,
  editable = false,
  showLabels = false,
  className = '',
}: BodyMapProps) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const regions = view === 'anterior' ? BODY_REGIONS : POSTERIOR_REGIONS;

  const handleRegionClick = useCallback((e: React.MouseEvent<SVGPathElement>, region: BodyRegion) => {
    if (editable && onAddLesion) {
      const svg = e.currentTarget.ownerSVGElement;
      if (svg) {
        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
        onAddLesion(region.id, svgPoint.x, svgPoint.y);
      }
    } else if (onRegionClick) {
      onRegionClick(region.id);
    }
  }, [editable, onAddLesion, onRegionClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGPathElement>, region: BodyRegion) => {
    setTooltip({ x: e.clientX, y: e.clientY, text: region.name });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredRegion(null);
    setTooltip(null);
  }, []);

  const getLesionsForRegion = useCallback((regionId: string) => {
    return lesions.filter(l => l.regionId === regionId);
  }, [lesions]);

  return (
    <div className={`body-map-container ${className}`}>
      <div className="body-map-header">
        <span className="body-map-title">{view === 'anterior' ? 'Anterior View' : 'Posterior View'}</span>
        {editable && <span className="body-map-hint">Click on body region to add lesion</span>}
      </div>

      <svg
        viewBox="0 0 440 820"
        className="body-map-svg"
        style={{ width: '100%', maxWidth: '400px', height: 'auto' }}
      >
        {/* Body outline for visual reference */}
        <defs>
          <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--gray-100)" />
            <stop offset="100%" stopColor="var(--gray-200)" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Render body regions */}
        <g className="body-regions">
          {regions.map((region) => {
            const isSelected = selectedRegion === region.id;
            const isHovered = hoveredRegion === region.id;
            const regionLesions = getLesionsForRegion(region.id);
            const hasLesions = regionLesions.length > 0;

            return (
              <g key={region.id}>
                <path
                  d={region.path}
                  className={`body-region ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${hasLesions ? 'has-lesions' : ''}`}
                  fill={hasLesions ? 'var(--primary-100)' : 'url(#skinGradient)'}
                  stroke={isSelected ? 'var(--primary-600)' : isHovered ? 'var(--primary-400)' : 'var(--gray-300)'}
                  strokeWidth={isSelected || isHovered ? 2 : 1}
                  filter={isSelected ? 'url(#shadow)' : undefined}
                  onClick={(e) => handleRegionClick(e, region)}
                  onMouseEnter={() => setHoveredRegion(region.id)}
                  onMouseMove={(e) => handleMouseMove(e, region)}
                  onMouseLeave={handleMouseLeave}
                  style={{ cursor: editable || onRegionClick ? 'pointer' : 'default' }}
                />
              </g>
            );
          })}
        </g>

        {/* Render lesion markers */}
        <g className="lesion-markers">
          {lesions.map((lesion) => (
            <g
              key={lesion.id}
              onClick={() => onLesionClick?.(lesion)}
              style={{ cursor: onLesionClick ? 'pointer' : 'default' }}
            >
              <circle
                cx={lesion.x}
                cy={lesion.y}
                r={8}
                fill={LESION_COLORS[lesion.type]}
                stroke="var(--white)"
                strokeWidth={2}
                className="lesion-marker"
              />
              <circle
                cx={lesion.x}
                cy={lesion.y}
                r={4}
                fill="var(--white)"
                opacity={0.5}
              />
            </g>
          ))}
        </g>

        {/* Region labels (optional) */}
        {showLabels && (
          <g className="region-labels">
            {regions.slice(0, 8).map((region) => {
              const bbox = region.path.match(/M(\d+),(\d+)/);
              if (!bbox) return null;
              const x = parseInt(bbox[1], 10) + 30;
              const y = parseInt(bbox[2], 10) + 15;
              return (
                <text
                  key={`label-${region.id}`}
                  x={x}
                  y={y}
                  className="region-label"
                  fontSize={10}
                  fill="var(--gray-600)"
                >
                  {region.name}
                </text>
              );
            })}
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="body-map-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y - 30,
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div className="body-map-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: LESION_COLORS.primary }} />
          <span>Primary Lesion</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: LESION_COLORS.secondary }} />
          <span>Secondary</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: LESION_COLORS.healed }} />
          <span>Healed</span>
        </div>
      </div>
    </div>
  );
}

export { BODY_REGIONS, POSTERIOR_REGIONS };
