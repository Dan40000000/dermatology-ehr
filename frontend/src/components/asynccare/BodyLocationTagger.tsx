/**
 * BodyLocationTagger Component
 * Visual body diagram for selecting photo location
 */

import { useState } from 'react';

interface BodyLocationTaggerProps {
  value: string;
  onChange: (location: string) => void;
  disabled?: boolean;
}

const BODY_REGIONS = {
  front: [
    { id: 'face', label: 'Face', x: 50, y: 8, width: 12, height: 8 },
    { id: 'scalp', label: 'Scalp', x: 50, y: 2, width: 10, height: 5 },
    { id: 'neck', label: 'Neck', x: 50, y: 16, width: 8, height: 5 },
    { id: 'chest', label: 'Chest', x: 50, y: 24, width: 22, height: 12 },
    { id: 'abdomen', label: 'Abdomen', x: 50, y: 38, width: 18, height: 12 },
    { id: 'arm_left', label: 'Left Arm', x: 25, y: 26, width: 10, height: 25 },
    { id: 'arm_right', label: 'Right Arm', x: 75, y: 26, width: 10, height: 25 },
    { id: 'hand_left', label: 'Left Hand', x: 20, y: 52, width: 8, height: 8 },
    { id: 'hand_right', label: 'Right Hand', x: 80, y: 52, width: 8, height: 8 },
    { id: 'groin', label: 'Groin', x: 50, y: 52, width: 12, height: 6 },
    { id: 'leg_left', label: 'Left Leg', x: 40, y: 60, width: 10, height: 30 },
    { id: 'leg_right', label: 'Right Leg', x: 60, y: 60, width: 10, height: 30 },
    { id: 'foot_left', label: 'Left Foot', x: 38, y: 92, width: 8, height: 6 },
    { id: 'foot_right', label: 'Right Foot', x: 62, y: 92, width: 8, height: 6 },
  ],
  back: [
    { id: 'scalp', label: 'Scalp', x: 50, y: 2, width: 10, height: 5 },
    { id: 'neck', label: 'Neck', x: 50, y: 12, width: 8, height: 5 },
    { id: 'back_upper', label: 'Upper Back', x: 50, y: 22, width: 22, height: 14 },
    { id: 'back_lower', label: 'Lower Back', x: 50, y: 38, width: 18, height: 12 },
    { id: 'arm_left', label: 'Left Arm', x: 75, y: 26, width: 10, height: 25 },
    { id: 'arm_right', label: 'Right Arm', x: 25, y: 26, width: 10, height: 25 },
    { id: 'hand_left', label: 'Left Hand', x: 80, y: 52, width: 8, height: 8 },
    { id: 'hand_right', label: 'Right Hand', x: 20, y: 52, width: 8, height: 8 },
    { id: 'buttocks', label: 'Buttocks', x: 50, y: 52, width: 16, height: 8 },
    { id: 'leg_left', label: 'Left Leg', x: 60, y: 62, width: 10, height: 28 },
    { id: 'leg_right', label: 'Right Leg', x: 40, y: 62, width: 10, height: 28 },
    { id: 'foot_left', label: 'Left Foot', x: 62, y: 92, width: 8, height: 6 },
    { id: 'foot_right', label: 'Right Foot', x: 38, y: 92, width: 8, height: 6 },
  ],
};

export function BodyLocationTagger({ value, onChange, disabled }: BodyLocationTaggerProps) {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  const regions = BODY_REGIONS[view];

  return (
    <div className="body-location-tagger">
      {/* View Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <button
          type="button"
          onClick={() => setView('front')}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: view === 'front' ? '#3b82f6' : '#fff',
            color: view === 'front' ? '#fff' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Front View
        </button>
        <button
          type="button"
          onClick={() => setView('back')}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: view === 'back' ? '#3b82f6' : '#fff',
            color: view === 'back' ? '#fff' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Back View
        </button>
      </div>

      {/* Body Diagram */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '300px',
          margin: '0 auto',
          aspectRatio: '1 / 2',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Body Silhouette */}
        <svg
          viewBox="0 0 100 200"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {/* Simple body outline */}
          <ellipse cx="50" cy="10" rx="10" ry="10" fill="#d1d5db" /> {/* Head */}
          <rect x="40" y="20" width="20" height="8" fill="#d1d5db" rx="2" /> {/* Neck */}
          <rect x="30" y="28" width="40" height="45" fill="#d1d5db" rx="4" /> {/* Torso */}
          <rect x="15" y="30" width="15" height="35" fill="#d1d5db" rx="3" /> {/* Left Arm */}
          <rect x="70" y="30" width="15" height="35" fill="#d1d5db" rx="3" /> {/* Right Arm */}
          <ellipse cx="20" cy="68" rx="6" ry="5" fill="#d1d5db" /> {/* Left Hand */}
          <ellipse cx="80" cy="68" rx="6" ry="5" fill="#d1d5db" /> {/* Right Hand */}
          <rect x="32" y="73" width="16" height="55" fill="#d1d5db" rx="4" /> {/* Left Leg */}
          <rect x="52" y="73" width="16" height="55" fill="#d1d5db" rx="4" /> {/* Right Leg */}
          <ellipse cx="40" cy="132" rx="8" ry="5" fill="#d1d5db" /> {/* Left Foot */}
          <ellipse cx="60" cy="132" rx="8" ry="5" fill="#d1d5db" /> {/* Right Foot */}
        </svg>

        {/* Clickable Regions */}
        {regions.map((region) => (
          <div
            key={region.id}
            onClick={() => !disabled && onChange(region.id)}
            onMouseEnter={() => setHoveredRegion(region.id)}
            onMouseLeave={() => setHoveredRegion(null)}
            style={{
              position: 'absolute',
              left: `${region.x - region.width / 2}%`,
              top: `${region.y}%`,
              width: `${region.width}%`,
              height: `${region.height}%`,
              border: `2px solid ${
                value === region.id
                  ? '#3b82f6'
                  : hoveredRegion === region.id
                  ? '#60a5fa'
                  : 'transparent'
              }`,
              background:
                value === region.id
                  ? 'rgba(59, 130, 246, 0.3)'
                  : hoveredRegion === region.id
                  ? 'rgba(96, 165, 250, 0.2)'
                  : 'transparent',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={region.label}
          />
        ))}
      </div>

      {/* Selected Location Display */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '1rem',
          padding: '0.75rem',
          background: value ? '#eff6ff' : '#f9fafb',
          borderRadius: '6px',
          border: `1px solid ${value ? '#bfdbfe' : '#e5e7eb'}`,
        }}
      >
        {value ? (
          <span style={{ fontWeight: 500, color: '#1d4ed8' }}>
            Selected:{' '}
            {[...BODY_REGIONS.front, ...BODY_REGIONS.back].find((r) => r.id === value)?.label ||
              value}
          </span>
        ) : (
          <span style={{ color: '#6b7280' }}>Click on the body to select location</span>
        )}
      </div>

      {/* Quick Select Buttons */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginTop: '1rem',
          justifyContent: 'center',
        }}
      >
        {[
          'face',
          'scalp',
          'neck',
          'chest',
          'back_upper',
          'arm_left',
          'arm_right',
          'hand_left',
          'hand_right',
          'leg_left',
          'leg_right',
        ].map((loc) => {
          const region = [...BODY_REGIONS.front, ...BODY_REGIONS.back].find((r) => r.id === loc);
          return (
            <button
              key={loc}
              type="button"
              onClick={() => !disabled && onChange(loc)}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '999px',
                background: value === loc ? '#3b82f6' : '#fff',
                color: value === loc ? '#fff' : '#374151',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {region?.label || loc}
            </button>
          );
        })}
      </div>
    </div>
  );
}
