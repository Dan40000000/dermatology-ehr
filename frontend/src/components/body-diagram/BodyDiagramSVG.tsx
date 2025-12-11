import React from 'react';

export interface BodyDiagramSVGProps {
  view: 'front' | 'back';
  onRegionClick?: (regionId: string, x: number, y: number) => void;
  highlightedRegions?: string[];
  className?: string;
}

// Anatomically accurate body diagram SVG component
export function BodyDiagramSVG({ view, onRegionClick, highlightedRegions = [], className = '' }: BodyDiagramSVGProps) {
  const handlePathClick = (e: React.MouseEvent<SVGPathElement>, regionId: string) => {
    if (!onRegionClick) return;

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    // Calculate click position relative to viewBox
    const x = ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((e.clientY - rect.top) / rect.height) * viewBox.height;

    // Convert to percentage (0-100)
    const xPercent = (x / viewBox.width) * 100;
    const yPercent = (y / viewBox.height) * 100;

    onRegionClick(regionId, xPercent, yPercent);
  };

  const isHighlighted = (regionId: string) => highlightedRegions.includes(regionId);

  if (view === 'front') {
    return (
      <svg
        viewBox="0 0 400 800"
        className={`body-diagram-svg ${className}`}
        style={{ width: '100%', height: 'auto', maxWidth: '400px' }}
      >
        <defs>
          <linearGradient id="skinTone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5d7c8" />
            <stop offset="100%" stopColor="#edc9b5" />
          </linearGradient>
          <filter id="bodyShadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="2" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Head */}
        <ellipse
          cx="200"
          cy="50"
          rx="40"
          ry="45"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          filter="url(#bodyShadow)"
          onClick={(e) => handlePathClick(e, 'head-scalp')}
          className={`body-region ${isHighlighted('head-scalp') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Neck */}
        <rect
          x="180"
          y="90"
          width="40"
          height="30"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'neck-front')}
          className={`body-region ${isHighlighted('neck-front') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Shoulders */}
        <ellipse
          cx="140"
          cy="140"
          rx="30"
          ry="25"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'shoulder-left')}
          className={`body-region ${isHighlighted('shoulder-left') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <ellipse
          cx="260"
          cy="140"
          rx="30"
          ry="25"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'shoulder-right')}
          className={`body-region ${isHighlighted('shoulder-right') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Chest */}
        <rect
          x="160"
          y="120"
          width="80"
          height="80"
          rx="10"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'chest-upper')}
          className={`body-region ${isHighlighted('chest-upper') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Abdomen */}
        <rect
          x="165"
          y="200"
          width="70"
          height="100"
          rx="8"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'abdomen-upper')}
          className={`body-region ${isHighlighted('abdomen-upper') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Arms - Left */}
        <rect
          x="100"
          y="165"
          width="25"
          height="100"
          rx="12"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'arm-left-upper')}
          className={`body-region ${isHighlighted('arm-left-upper') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <rect
          x="95"
          y="265"
          width="22"
          height="110"
          rx="11"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'arm-left-forearm')}
          className={`body-region ${isHighlighted('arm-left-forearm') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <ellipse
          cx="105"
          cy="395"
          rx="18"
          ry="22"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'hand-left-palm')}
          className={`body-region ${isHighlighted('hand-left-palm') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Arms - Right */}
        <rect
          x="275"
          y="165"
          width="25"
          height="100"
          rx="12"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'arm-right-upper')}
          className={`body-region ${isHighlighted('arm-right-upper') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <rect
          x="283"
          y="265"
          width="22"
          height="110"
          rx="11"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'arm-right-forearm')}
          className={`body-region ${isHighlighted('arm-right-forearm') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <ellipse
          cx="295"
          cy="395"
          rx="18"
          ry="22"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'hand-right-palm')}
          className={`body-region ${isHighlighted('hand-right-palm') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Pelvis/Groin */}
        <path
          d="M 165 300 L 165 350 Q 165 365 175 365 L 190 365 L 190 420"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'groin-left')}
          className={`body-region ${isHighlighted('groin-left') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <path
          d="M 235 300 L 235 350 Q 235 365 225 365 L 210 365 L 210 420"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'groin-right')}
          className={`body-region ${isHighlighted('groin-right') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Legs - Left */}
        <rect
          x="160"
          y="365"
          width="35"
          height="160"
          rx="15"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'thigh-left-front')}
          className={`body-region ${isHighlighted('thigh-left-front') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <rect
          x="162"
          y="525"
          width="32"
          height="170"
          rx="14"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'shin-left')}
          className={`body-region ${isHighlighted('shin-left') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <ellipse
          cx="178"
          cy="715"
          rx="20"
          ry="28"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'foot-left-top')}
          className={`body-region ${isHighlighted('foot-left-top') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Legs - Right */}
        <rect
          x="205"
          y="365"
          width="35"
          height="160"
          rx="15"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'thigh-right-front')}
          className={`body-region ${isHighlighted('thigh-right-front') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <rect
          x="206"
          y="525"
          width="32"
          height="170"
          rx="14"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'shin-right')}
          className={`body-region ${isHighlighted('shin-right') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />
        <ellipse
          cx="222"
          cy="715"
          rx="20"
          ry="28"
          fill="url(#skinTone)"
          stroke="#b8a99a"
          strokeWidth="1.5"
          onClick={(e) => handlePathClick(e, 'foot-right-top')}
          className={`body-region ${isHighlighted('foot-right-top') ? 'highlighted' : ''}`}
          style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
        />

        {/* Facial features for reference */}
        <circle cx="185" cy="45" r="3" fill="#5a4a42" />
        <circle cx="215" cy="45" r="3" fill="#5a4a42" />
        <path d="M 195 55 Q 200 58 205 55" stroke="#c89b8a" fill="none" strokeWidth="1.5" />
      </svg>
    );
  }

  // Back view
  return (
    <svg
      viewBox="0 0 400 800"
      className={`body-diagram-svg ${className}`}
      style={{ width: '100%', height: 'auto', maxWidth: '400px' }}
    >
      <defs>
        <linearGradient id="skinToneBack" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f5d7c8" />
          <stop offset="100%" stopColor="#edc9b5" />
        </linearGradient>
      </defs>

      {/* Head */}
      <ellipse
        cx="200"
        cy="50"
        rx="40"
        ry="45"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        filter="url(#bodyShadow)"
        onClick={(e) => handlePathClick(e, 'head-scalp')}
        className={`body-region ${isHighlighted('head-scalp') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Neck */}
      <rect
        x="180"
        y="90"
        width="40"
        height="30"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'neck-back')}
        className={`body-region ${isHighlighted('neck-back') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Upper Back */}
      <rect
        x="160"
        y="120"
        width="80"
        height="80"
        rx="10"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'back-upper')}
        className={`body-region ${isHighlighted('back-upper') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Lower Back */}
      <rect
        x="165"
        y="200"
        width="70"
        height="70"
        rx="8"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'back-lower')}
        className={`body-region ${isHighlighted('back-lower') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Buttocks */}
      <ellipse
        cx="178"
        cy="315"
        rx="22"
        ry="30"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'buttock-left')}
        className={`body-region ${isHighlighted('buttock-left') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <ellipse
        cx="222"
        cy="315"
        rx="22"
        ry="30"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'buttock-right')}
        className={`body-region ${isHighlighted('buttock-right') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Arms - Left */}
      <rect
        x="100"
        y="165"
        width="25"
        height="210"
        rx="12"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'arm-left-upper')}
        className={`body-region ${isHighlighted('arm-left-upper') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <ellipse
        cx="112"
        cy="395"
        rx="18"
        ry="22"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'hand-left-back')}
        className={`body-region ${isHighlighted('hand-left-back') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Arms - Right */}
      <rect
        x="275"
        y="165"
        width="25"
        height="210"
        rx="12"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'arm-right-upper')}
        className={`body-region ${isHighlighted('arm-right-upper') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <ellipse
        cx="288"
        cy="395"
        rx="18"
        ry="22"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'hand-right-back')}
        className={`body-region ${isHighlighted('hand-right-back') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Legs - Left (Back) */}
      <rect
        x="160"
        y="345"
        width="35"
        height="180"
        rx="15"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'thigh-left-back')}
        className={`body-region ${isHighlighted('thigh-left-back') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <rect
        x="162"
        y="525"
        width="32"
        height="170"
        rx="14"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'calf-left')}
        className={`body-region ${isHighlighted('calf-left') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <ellipse
        cx="178"
        cy="715"
        rx="20"
        ry="28"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'foot-left-bottom')}
        className={`body-region ${isHighlighted('foot-left-bottom') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />

      {/* Legs - Right (Back) */}
      <rect
        x="205"
        y="345"
        width="35"
        height="180"
        rx="15"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'thigh-right-back')}
        className={`body-region ${isHighlighted('thigh-right-back') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <rect
        x="206"
        y="525"
        width="32"
        height="170"
        rx="14"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'calf-right')}
        className={`body-region ${isHighlighted('calf-right') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
      <ellipse
        cx="222"
        cy="715"
        rx="20"
        ry="28"
        fill="url(#skinToneBack)"
        stroke="#b8a99a"
        strokeWidth="1.5"
        onClick={(e) => handlePathClick(e, 'foot-right-bottom')}
        className={`body-region ${isHighlighted('foot-right-bottom') ? 'highlighted' : ''}`}
        style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
      />
    </svg>
  );
}
