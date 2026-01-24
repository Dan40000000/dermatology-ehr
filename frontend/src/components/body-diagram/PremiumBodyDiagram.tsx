import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PremiumBodySVG, { BODY_REGIONS } from './PremiumBodySVG';

// Marking types with professional dermatology icons/colors
const MARKING_TYPES = {
  lesion: {
    label: 'Lesion/Mole',
    color: '#DC2626',
    icon: '●',
    description: 'Suspicious lesion requiring monitoring',
  },
  benign: {
    label: 'Benign',
    color: '#16A34A',
    icon: '○',
    description: 'Confirmed benign finding',
  },
  biopsy: {
    label: 'Biopsy Site',
    color: '#9333EA',
    icon: '◆',
    description: 'Previous biopsy location',
  },
  treatment: {
    label: 'Treatment Area',
    color: '#2563EB',
    icon: '◇',
    description: 'Area receiving treatment',
  },
  scar: {
    label: 'Scar',
    color: '#78716C',
    icon: '▬',
    description: 'Surgical or trauma scar',
  },
  tattoo: {
    label: 'Tattoo',
    color: '#1F2937',
    icon: '★',
    description: 'Tattoo location',
  },
  rash: {
    label: 'Rash/Eczema',
    color: '#F97316',
    icon: '◎',
    description: 'Inflammatory skin condition',
  },
  acne: {
    label: 'Acne',
    color: '#EF4444',
    icon: '•',
    description: 'Acne lesions',
  },
  psoriasis: {
    label: 'Psoriasis',
    color: '#EC4899',
    icon: '▣',
    description: 'Psoriatic plaques',
  },
  other: {
    label: 'Other',
    color: '#6B7280',
    icon: '✦',
    description: 'Other finding',
  },
};

export interface BodyMarking {
  id: string;
  x: number;
  y: number;
  regionCode: string;
  type: keyof typeof MARKING_TYPES;
  notes?: string;
  severity?: 'low' | 'medium' | 'high';
  size?: number; // mm
  createdAt: string;
  updatedAt?: string;
  photos?: string[];
  evolving?: boolean;
}

interface PremiumBodyDiagramProps {
  markings: BodyMarking[];
  onAddMarking?: (x: number, y: number, regionCode: string) => void;
  onSelectMarking?: (marking: BodyMarking) => void;
  onDeleteMarking?: (id: string) => void;
  selectedMarkingId?: string | null;
  mode?: 'view' | 'edit';
  skinTone?: 'light' | 'medium' | 'tan' | 'dark';
  showLegend?: boolean;
  showRegionInfo?: boolean;
  compactMode?: boolean;
}

export function PremiumBodyDiagram({
  markings,
  onAddMarking,
  onSelectMarking,
  onDeleteMarking,
  selectedMarkingId,
  mode = 'view',
  skinTone = 'light',
  showLegend = true,
  showRegionInfo = true,
  compactMode = false,
}: PremiumBodyDiagramProps) {
  const [currentView, setCurrentView] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<keyof typeof MARKING_TYPES>('lesion');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Filter markings for current view
  const visibleMarkings = useMemo(() => {
    return markings.filter((m) => {
      // Logic to determine which markings are visible on current view
      const region = m.regionCode;
      if (currentView === 'front') {
        return !region.includes('posterior') && !region.includes('back') && !region.includes('buttock') && !region.includes('calf');
      }
      if (currentView === 'back') {
        return region.includes('posterior') || region.includes('back') || region.includes('buttock') || region.includes('calf') || region.includes('scalp-occipital');
      }
      // Side views show both but with adjusted positioning
      return true;
    });
  }, [markings, currentView]);

  const handleBodyClick = useCallback(
    (x: number, y: number, regionCode: string) => {
      if (mode === 'edit' && onAddMarking) {
        onAddMarking(x, y, regionCode);
      }
    },
    [mode, onAddMarking]
  );

  const viewButtons = [
    { key: 'front', label: 'Front', icon: '👤' },
    { key: 'back', label: 'Back', icon: '🔙' },
    { key: 'left', label: 'Left', icon: '◀' },
    { key: 'right', label: 'Right', icon: '▶' },
  ] as const;

  return (
    <div className={`premium-body-diagram ${compactMode ? 'compact' : ''}`}>
      <style>{`
        .premium-body-diagram {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 20px;
          box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }

        .premium-body-diagram.compact {
          padding: 12px;
          gap: 12px;
        }

        .diagram-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .view-selector {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .view-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          transition: all 0.2s ease;
        }

        .view-btn:hover {
          background: rgba(99, 102, 241, 0.1);
          color: #4f46e5;
        }

        .view-btn.active {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
        }

        .skin-tone-selector {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .skin-tone-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .skin-tone-btn:hover {
          transform: scale(1.1);
        }

        .skin-tone-btn.active {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
        }

        .diagram-container {
          position: relative;
          display: flex;
          justify-content: center;
          padding: 20px;
          background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
          border-radius: 16px;
          min-height: 500px;
          overflow: hidden;
        }

        .body-wrapper {
          position: relative;
          transition: transform 0.3s ease;
        }

        .marking-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .marking-point {
          position: absolute;
          transform: translate(-50%, -50%);
          pointer-events: auto;
          cursor: pointer;
        }

        .marking-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: white;
          font-weight: bold;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
        }

        .marking-dot:hover {
          transform: scale(1.3);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .marking-dot.selected {
          animation: pulse 1.5s infinite;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.5);
        }

        .marking-dot.evolving {
          animation: warning-pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }

        @keyframes warning-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
          }
        }

        .severity-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid;
        }

        .severity-ring.high {
          border-color: #dc2626;
          animation: severity-pulse 2s infinite;
        }

        .severity-ring.medium {
          border-color: #f59e0b;
        }

        .severity-ring.low {
          border-color: #22c55e;
        }

        @keyframes severity-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.3);
          }
        }

        .marking-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.95);
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          white-space: nowrap;
          margin-bottom: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 100;
        }

        .marking-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: rgba(15, 23, 42, 0.95);
        }

        .zoom-controls {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .zoom-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .zoom-btn:hover {
          background: #f1f5f9;
          transform: translateY(-1px);
        }

        .zoom-btn:active {
          transform: translateY(0);
        }

        .type-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .type-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 2px solid transparent;
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s ease;
          background: #f8fafc;
        }

        .type-btn:hover {
          background: #f1f5f9;
        }

        .type-btn.active {
          border-color: currentColor;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .type-icon {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: white;
        }

        .legend {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 8px;
          padding: 12px;
          background: white;
          border-radius: 12px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #475569;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .region-info {
          padding: 12px 16px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          border-radius: 12px;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .region-info-icon {
          font-size: 18px;
        }

        .stats-bar {
          display: flex;
          gap: 16px;
          padding: 12px 16px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
        }

        .stat-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mode-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: ${mode === 'edit' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'};
          color: white;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
        }
      `}</style>

      {/* Header with controls */}
      <div className="diagram-header">
        <div className="view-selector">
          {viewButtons.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`view-btn ${currentView === key ? 'active' : ''}`}
              onClick={() => setCurrentView(key)}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}>
              −
            </button>
            <span style={{ fontSize: '13px', color: '#64748b', minWidth: '45px', textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button className="zoom-btn" onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}>
              +
            </button>
          </div>

          <div className="mode-indicator">
            {mode === 'edit' ? '✏️ Edit Mode' : '👁️ View Mode'}
          </div>
        </div>
      </div>

      {/* Type selector for edit mode */}
      {mode === 'edit' && (
        <div className="type-selector">
          <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center', marginRight: '8px' }}>
            Marking Type:
          </span>
          {Object.entries(MARKING_TYPES).map(([key, { label, color, icon }]) => (
            <button
              key={key}
              className={`type-btn ${selectedType === key ? 'active' : ''}`}
              style={{ color }}
              onClick={() => setSelectedType(key as keyof typeof MARKING_TYPES)}
            >
              <span className="type-icon" style={{ backgroundColor: color }}>
                {icon}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{markings.length}</span>
          <span className="stat-label">Total Markings</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#dc2626' }}>
            {markings.filter((m) => m.severity === 'high').length}
          </span>
          <span className="stat-label">High Priority</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#f59e0b' }}>
            {markings.filter((m) => m.evolving).length}
          </span>
          <span className="stat-label">Evolving</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{visibleMarkings.length}</span>
          <span className="stat-label">This View</span>
        </div>
      </div>

      {/* Region info */}
      {showRegionInfo && hoveredRegion && (
        <motion.div
          className="region-info"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <span className="region-info-icon">📍</span>
          <span>
            <strong>{(BODY_REGIONS as Record<string, { label: string }>)[hoveredRegion]?.label || hoveredRegion}</strong>
            {mode === 'edit' && ' - Click to add marking'}
          </span>
        </motion.div>
      )}

      {/* Main diagram container */}
      <div className="diagram-container">
        <motion.div
          className="body-wrapper"
          style={{ transform: `scale(${zoomLevel})` }}
          animate={{ scale: zoomLevel }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <PremiumBodySVG
            view={currentView}
            skinTone={skinTone}
            onBodyClick={handleBodyClick}
            interactive={mode === 'edit'}
          />

          {/* Marking overlays */}
          <div className="marking-overlay">
            <AnimatePresence>
              {visibleMarkings.map((marking) => {
                const typeConfig = MARKING_TYPES[marking.type];
                const isSelected = marking.id === selectedMarkingId;

                return (
                  <motion.div
                    key={marking.id}
                    className="marking-point"
                    style={{
                      left: `${marking.x}%`,
                      top: `${marking.y}%`,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    onClick={() => onSelectMarking?.(marking)}
                  >
                    {marking.severity && (
                      <span className={`severity-ring ${marking.severity}`} />
                    )}
                    <div
                      className={`marking-dot ${isSelected ? 'selected' : ''} ${marking.evolving ? 'evolving' : ''}`}
                      style={{ backgroundColor: typeConfig.color }}
                      title={typeConfig.label}
                    >
                      {typeConfig.icon}
                    </div>
                    {isSelected && (
                      <div className="marking-tooltip">
                        <div style={{ fontWeight: 600 }}>{typeConfig.label}</div>
                        {marking.notes && <div style={{ opacity: 0.8 }}>{marking.notes}</div>}
                        {marking.size && <div style={{ opacity: 0.7 }}>{marking.size}mm</div>}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="legend">
          {Object.entries(MARKING_TYPES).map(([key, { label, color, description }]) => (
            <div key={key} className="legend-item" title={description}>
              <span className="legend-dot" style={{ backgroundColor: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { MARKING_TYPES };
export default PremiumBodyDiagram;
