import React from 'react';

export type MarkerType = 'lesion' | 'procedure' | 'condition' | 'cosmetic' | 'wound';

export type ProcedureSubtype = 'biopsy' | 'excision' | 'cryo' | 'laser';
export type ConditionSubtype = 'psoriasis' | 'eczema' | 'vitiligo' | 'dermatitis' | 'other';
export type CosmeticSubtype = 'injection' | 'filler' | 'botox' | 'treatment' | 'other';
export type WoundStatus = 'fresh' | 'healing' | 'infected' | 'healed';

export interface LesionMarker {
  id: string;
  tenant_id: string;
  patient_id: string;
  anatomical_location: string;
  location_code?: string;
  x_coordinate: number;
  y_coordinate: number;
  body_view: 'front' | 'back' | 'head-front' | 'head-back' | 'left-side' | 'right-side';
  marker_type?: MarkerType;
  lesion_type?: string;
  procedure_type?: ProcedureSubtype;
  condition_type?: ConditionSubtype;
  cosmetic_type?: CosmeticSubtype;
  wound_status?: WoundStatus;
  status: 'monitoring' | 'suspicious' | 'benign' | 'malignant' | 'treated' | 'resolved';
  size_mm?: number;
  color?: string;
  border?: string;
  first_noted_date?: string;
  last_examined_date?: string;
  biopsy_id?: string;
  pathology_result?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BodyMapMarkerProps {
  lesion: LesionMarker;
  isSelected: boolean;
  onClick: () => void;
  zoomLevel: number;
}

// Color mapping for different statuses (for lesions)
const STATUS_COLORS = {
  monitoring: '#3B82F6', // Blue
  suspicious: '#EAB308', // Yellow/Warning
  benign: '#10B981', // Green
  malignant: '#EF4444', // Red
  treated: '#8B5CF6', // Purple
  resolved: '#6B7280', // Gray
};

// Color mapping for marker types
const MARKER_TYPE_COLORS = {
  lesion: '#EF4444', // Red/Orange
  procedure: '#3B82F6', // Blue
  condition: '#EC4899', // Pink
  cosmetic: '#A855F7', // Purple
  wound: '#F59E0B', // Amber/Yellow
};

// Condition colors for shaded regions
const CONDITION_COLORS = {
  psoriasis: 'rgba(251, 207, 232, 0.6)', // Pink
  eczema: 'rgba(217, 179, 140, 0.6)', // Tan
  vitiligo: 'rgba(255, 255, 255, 0.9)', // White with border
  dermatitis: 'rgba(252, 165, 165, 0.6)', // Light red
  other: 'rgba(209, 213, 219, 0.6)', // Gray
};

// Procedure icons
const PROCEDURE_ICONS = {
  biopsy: 'B',
  excision: 'X',
  cryo: '\u2744', // Snowflake
  laser: '\u26A1', // Lightning
};

// Cosmetic icons
const COSMETIC_ICONS = {
  injection: '\uD83D\uDC89', // Syringe
  filler: '\uD83D\uDC89',
  botox: '\uD83D\uDC89',
  treatment: '\u2728', // Sparkles
  other: '\u2728',
};

// Get marker size based on lesion size in mm
const getMarkerSize = (sizeMm: number | undefined, zoomLevel: number): number => {
  if (!sizeMm) return 8 * zoomLevel;

  // Scale: 1-5mm = 6px, 6-10mm = 8px, 11-20mm = 10px, 21+ = 12px
  if (sizeMm <= 5) return 6 * zoomLevel;
  if (sizeMm <= 10) return 8 * zoomLevel;
  if (sizeMm <= 20) return 10 * zoomLevel;
  return 12 * zoomLevel;
};

export function BodyMapMarker({ lesion, isSelected, onClick, zoomLevel }: BodyMapMarkerProps) {
  const markerType = lesion.marker_type || 'lesion';
  const x = (lesion.x_coordinate / 100) * 400; // Convert percentage to viewBox coords
  const y = (lesion.y_coordinate / 100) * 800;

  // Get color based on marker type
  let color = MARKER_TYPE_COLORS[markerType];
  if (markerType === 'lesion') {
    color = STATUS_COLORS[lesion.status] || STATUS_COLORS.monitoring;
  }

  const size = getMarkerSize(lesion.size_mm, zoomLevel);

  // Determine if lesion needs attention (suspicious or malignant)
  const needsAttention = markerType === 'lesion' && (lesion.status === 'suspicious' || lesion.status === 'malignant');

  // Render different shapes based on marker type
  const renderMarkerShape = () => {
    switch (markerType) {
      case 'procedure':
        // Blue square with icon
        const procedureIcon = PROCEDURE_ICONS[lesion.procedure_type || 'biopsy'];
        return (
          <g>
            <rect
              x={x - size}
              y={y - size}
              width={size * 2}
              height={size * 2}
              fill={color}
              stroke="white"
              strokeWidth="2"
              rx="2"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
              }}
            />
            <text
              x={x}
              y={y + size * 0.4}
              textAnchor="middle"
              fill="white"
              fontSize={size * 1.2}
              fontWeight="bold"
              fontFamily="Arial, sans-serif"
            >
              {procedureIcon}
            </text>
          </g>
        );

      case 'condition':
        // Shaded region (larger semi-transparent circle)
        const conditionColor = CONDITION_COLORS[lesion.condition_type || 'other'];
        return (
          <g>
            <circle
              cx={x}
              cy={y}
              r={size * 2}
              fill={conditionColor}
              stroke={lesion.condition_type === 'vitiligo' ? '#9CA3AF' : 'white'}
              strokeWidth="2"
              strokeDasharray={lesion.condition_type === 'vitiligo' ? '4,4' : '0'}
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
              }}
            />
            {/* Small center dot */}
            <circle
              cx={x}
              cy={y}
              r={size * 0.4}
              fill={color}
              stroke="white"
              strokeWidth="1"
            />
          </g>
        );

      case 'cosmetic':
        // Purple/pink marker with icon
        const cosmeticIcon = COSMETIC_ICONS[lesion.cosmetic_type || 'treatment'];
        return (
          <g>
            <circle
              cx={x}
              cy={y}
              r={size}
              fill={color}
              stroke="white"
              strokeWidth="2"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
              }}
            />
            <text
              x={x}
              y={y + size * 0.35}
              textAnchor="middle"
              fill="white"
              fontSize={size * 1}
              fontFamily="Arial, sans-serif"
            >
              {cosmeticIcon}
            </text>
          </g>
        );

      case 'wound':
        // Amber marker with healing status indicator
        return (
          <g>
            <circle
              cx={x}
              cy={y}
              r={size}
              fill={color}
              stroke="white"
              strokeWidth="2"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
              }}
            />
            {/* Healing status indicator (inner circle) */}
            {lesion.wound_status && (
              <circle
                cx={x}
                cy={y}
                r={size * 0.5}
                fill={
                  lesion.wound_status === 'healed' ? '#10B981' :
                  lesion.wound_status === 'healing' ? '#F59E0B' :
                  lesion.wound_status === 'infected' ? '#EF4444' :
                  '#6B7280'
                }
                opacity="0.8"
              />
            )}
          </g>
        );

      default:
        // Lesion - default circular marker
        return (
          <g>
            <circle
              cx={x}
              cy={y}
              r={size}
              fill={color}
              stroke="white"
              strokeWidth="2"
              className="marker-main"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                transition: 'r 0.2s ease',
              }}
            />
            {/* Inner highlight for depth */}
            <circle cx={x - size * 0.25} cy={y - size * 0.25} r={size * 0.3} fill="white" opacity="0.5" />
          </g>
        );
    }
  };

  // Get tooltip text based on marker type
  const getTooltipText = () => {
    const baseInfo = `${lesion.anatomical_location || 'Unknown location'}`;
    switch (markerType) {
      case 'procedure':
        return `Procedure: ${lesion.procedure_type || 'Unknown'}\n${baseInfo}`;
      case 'condition':
        return `Condition: ${lesion.condition_type || 'Unknown'}\n${baseInfo}`;
      case 'cosmetic':
        return `Cosmetic: ${lesion.cosmetic_type || 'Treatment'}\n${baseInfo}`;
      case 'wound':
        return `Wound (${lesion.wound_status || 'unknown'})\n${baseInfo}`;
      default:
        return `${lesion.lesion_type || 'Lesion'} - ${lesion.status.toUpperCase()}\n${baseInfo}${lesion.size_mm ? `\nSize: ${lesion.size_mm}mm` : ''}`;
    }
  };

  return (
    <g
      className="body-map-marker"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Pulse animation for lesions that need attention */}
      {needsAttention && (
        <circle cx={x} cy={y} r={size + 4} fill={color} opacity="0.3" className="marker-pulse">
          <animate attributeName="r" from={size + 4} to={size + 8} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={x}
          cy={y}
          r={size + 3}
          fill="none"
          stroke="#6B46C1"
          strokeWidth="2"
          className="marker-selection-ring"
        />
      )}

      {/* Render marker shape based on type */}
      {renderMarkerShape()}

      {/* Marker ID badge if selected */}
      {isSelected && lesion.id && (
        <g>
          <rect
            x={x + size + 4}
            y={y - 10}
            width="40"
            height="20"
            rx="4"
            fill="#6B46C1"
            stroke="white"
            strokeWidth="1"
          />
          <text
            x={x + size + 24}
            y={y + 4}
            textAnchor="middle"
            fill="white"
            fontSize="10"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
          >
            #{lesion.id.slice(0, 4)}
          </text>
        </g>
      )}

      {/* Tooltip on hover */}
      <title>{getTooltipText()}</title>
    </g>
  );
}

// Legend component to show what each marker type means
export function BodyMapLegend() {
  return (
    <div
      className="body-map-legend"
      style={{
        padding: '16px',
        background: '#F9FAFB',
        borderRadius: '8px',
      }}
    >
      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Marker Types</h4>

      {/* Marker Types */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: MARKER_TYPE_COLORS.lesion,
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Lesions - Red/orange circles</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              background: MARKER_TYPE_COLORS.procedure,
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Procedures - Blue squares (B=biopsy, X=excision, \u2744=cryo, \u26A1=laser)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'rgba(251, 207, 232, 0.6)',
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Conditions - Shaded regions (pink=psoriasis, tan=eczema, white=vitiligo)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: MARKER_TYPE_COLORS.cosmetic,
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Cosmetic - Purple markers (\uD83D\uDC89=injections, \u2728=treatments)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: MARKER_TYPE_COLORS.wound,
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Wounds - Amber markers with healing status</span>
        </div>
      </div>

      {/* Lesion Status Colors */}
      <h4 style={{ margin: '16px 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Lesion Status</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
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
            <span style={{ fontSize: '12px', color: '#6B7280', textTransform: 'capitalize' }}>{status}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: '#9CA3AF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#EF4444',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <span>Pulsing markers require immediate attention</span>
        </div>
      </div>
    </div>
  );
}
