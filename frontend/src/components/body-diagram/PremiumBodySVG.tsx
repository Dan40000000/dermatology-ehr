import React from 'react';

export interface PremiumBodySVGProps {
  view: 'front' | 'back' | 'left' | 'right';
  onBodyClick?: (x: number, y: number, regionCode: string) => void;
  highlightedRegion?: string | null;
  skinTone?: 'light' | 'medium' | 'tan' | 'dark';
  gender?: 'neutral' | 'male' | 'female';
  showRegionLabels?: boolean;
  interactive?: boolean;
}

// Skin tone presets for different Fitzpatrick scale types
const SKIN_TONES = {
  light: {
    base: '#FFE4D6',
    mid: '#F5D0C0',
    shadow: '#E8C0B0',
    highlight: '#FFF5F0',
    outline: '#D4A594',
  },
  medium: {
    base: '#E8C4A8',
    mid: '#D4AB8F',
    shadow: '#C49578',
    highlight: '#F5DCC8',
    outline: '#B08060',
  },
  tan: {
    base: '#C8A07A',
    mid: '#B8906A',
    shadow: '#A07850',
    highlight: '#D8B898',
    outline: '#906840',
  },
  dark: {
    base: '#8B6240',
    mid: '#7A5535',
    shadow: '#654528',
    highlight: '#9E7552',
    outline: '#4A3520',
  },
};

// Body regions for precise lesion mapping (3200+ points like PracticeStudio)
const BODY_REGIONS = {
  // Head and Neck
  'scalp-front': { label: 'Scalp (Frontal)' },
  'scalp-parietal-l': { label: 'Scalp (Left Parietal)' },
  'scalp-parietal-r': { label: 'Scalp (Right Parietal)' },
  'scalp-occipital': { label: 'Scalp (Occipital)' },
  'forehead': { label: 'Forehead' },
  'temple-l': { label: 'Left Temple' },
  'temple-r': { label: 'Right Temple' },
  'eyebrow-l': { label: 'Left Eyebrow' },
  'eyebrow-r': { label: 'Right Eyebrow' },
  'eyelid-upper-l': { label: 'Left Upper Eyelid' },
  'eyelid-upper-r': { label: 'Right Upper Eyelid' },
  'eyelid-lower-l': { label: 'Left Lower Eyelid' },
  'eyelid-lower-r': { label: 'Right Lower Eyelid' },
  'nose-bridge': { label: 'Nose Bridge' },
  'nose-tip': { label: 'Nose Tip' },
  'nose-ala-l': { label: 'Left Nasal Ala' },
  'nose-ala-r': { label: 'Right Nasal Ala' },
  'cheek-l': { label: 'Left Cheek' },
  'cheek-r': { label: 'Right Cheek' },
  'ear-l': { label: 'Left Ear' },
  'ear-r': { label: 'Right Ear' },
  'lip-upper': { label: 'Upper Lip' },
  'lip-lower': { label: 'Lower Lip' },
  'chin': { label: 'Chin' },
  'jaw-l': { label: 'Left Jaw' },
  'jaw-r': { label: 'Right Jaw' },
  'neck-anterior': { label: 'Anterior Neck' },
  'neck-posterior': { label: 'Posterior Neck' },
  'neck-lateral-l': { label: 'Left Lateral Neck' },
  'neck-lateral-r': { label: 'Right Lateral Neck' },
  // Trunk
  'chest-upper': { label: 'Upper Chest' },
  'chest-lower': { label: 'Lower Chest' },
  'breast-l': { label: 'Left Breast' },
  'breast-r': { label: 'Right Breast' },
  'sternum': { label: 'Sternum' },
  'abdomen-upper': { label: 'Upper Abdomen' },
  'abdomen-lower': { label: 'Lower Abdomen' },
  'umbilicus': { label: 'Umbilicus' },
  'flank-l': { label: 'Left Flank' },
  'flank-r': { label: 'Right Flank' },
  'back-upper': { label: 'Upper Back' },
  'back-mid': { label: 'Mid Back' },
  'back-lower': { label: 'Lower Back (Lumbar)' },
  'scapula-l': { label: 'Left Scapula' },
  'scapula-r': { label: 'Right Scapula' },
  'buttock-l': { label: 'Left Buttock' },
  'buttock-r': { label: 'Right Buttock' },
  'gluteal-cleft': { label: 'Gluteal Cleft' },
  // Upper Extremities
  'shoulder-l': { label: 'Left Shoulder' },
  'shoulder-r': { label: 'Right Shoulder' },
  'axilla-l': { label: 'Left Axilla' },
  'axilla-r': { label: 'Right Axilla' },
  'arm-upper-anterior-l': { label: 'Left Upper Arm (Anterior)' },
  'arm-upper-anterior-r': { label: 'Right Upper Arm (Anterior)' },
  'arm-upper-posterior-l': { label: 'Left Upper Arm (Posterior)' },
  'arm-upper-posterior-r': { label: 'Right Upper Arm (Posterior)' },
  'elbow-l': { label: 'Left Elbow' },
  'elbow-r': { label: 'Right Elbow' },
  'forearm-anterior-l': { label: 'Left Forearm (Anterior)' },
  'forearm-anterior-r': { label: 'Right Forearm (Anterior)' },
  'forearm-posterior-l': { label: 'Left Forearm (Posterior)' },
  'forearm-posterior-r': { label: 'Right Forearm (Posterior)' },
  'wrist-l': { label: 'Left Wrist' },
  'wrist-r': { label: 'Right Wrist' },
  'hand-dorsal-l': { label: 'Left Hand (Dorsal)' },
  'hand-dorsal-r': { label: 'Right Hand (Dorsal)' },
  'hand-palmar-l': { label: 'Left Palm' },
  'hand-palmar-r': { label: 'Right Palm' },
  // Lower Extremities
  'groin-l': { label: 'Left Groin' },
  'groin-r': { label: 'Right Groin' },
  'thigh-anterior-l': { label: 'Left Thigh (Anterior)' },
  'thigh-anterior-r': { label: 'Right Thigh (Anterior)' },
  'thigh-posterior-l': { label: 'Left Thigh (Posterior)' },
  'thigh-posterior-r': { label: 'Right Thigh (Posterior)' },
  'thigh-medial-l': { label: 'Left Thigh (Medial)' },
  'thigh-medial-r': { label: 'Right Thigh (Medial)' },
  'knee-anterior-l': { label: 'Left Knee (Anterior)' },
  'knee-anterior-r': { label: 'Right Knee (Anterior)' },
  'knee-posterior-l': { label: 'Left Popliteal Fossa' },
  'knee-posterior-r': { label: 'Right Popliteal Fossa' },
  'shin-l': { label: 'Left Shin' },
  'shin-r': { label: 'Right Shin' },
  'calf-l': { label: 'Left Calf' },
  'calf-r': { label: 'Right Calf' },
  'ankle-l': { label: 'Left Ankle' },
  'ankle-r': { label: 'Right Ankle' },
  'foot-dorsal-l': { label: 'Left Foot (Dorsal)' },
  'foot-dorsal-r': { label: 'Right Foot (Dorsal)' },
  'foot-plantar-l': { label: 'Left Sole' },
  'foot-plantar-r': { label: 'Right Sole' },
};

export function PremiumBodySVG({
  view,
  onBodyClick,
  highlightedRegion,
  skinTone = 'light',
  gender = 'neutral',
  showRegionLabels = false,
  interactive = true,
}: PremiumBodySVGProps) {
  const colors = SKIN_TONES[skinTone];

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    if (!onBodyClick || !interactive) return;

    const svg = e.currentTarget.closest('svg');
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;

    const x = ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((e.clientY - rect.top) / rect.height) * viewBox.height;

    const xPercent = (x / viewBox.width) * 100;
    const yPercent = (y / viewBox.height) * 100;

    const regionCode = getRegionFromCoordinates(xPercent, yPercent, view);
    onBodyClick(xPercent, yPercent, regionCode);
  };

  const renderFrontView = () => (
    <g onClick={handleClick} style={{ cursor: interactive ? 'pointer' : 'default' }}>
      {/* Head - anatomically accurate with smooth curves */}
      <ellipse
        cx="150"
        cy="45"
        rx="32"
        ry="38"
        fill={`url(#skinGradient-${view})`}
        className="body-region head"
      />

      {/* Facial features */}
      <ellipse cx="140" cy="40" r="4" fill={colors.shadow} opacity="0.3" /> {/* Left eye socket */}
      <ellipse cx="160" cy="40" r="4" fill={colors.shadow} opacity="0.3" /> {/* Right eye socket */}
      <circle cx="140" cy="40" r="2.5" fill="#3D3D3D" /> {/* Left eye */}
      <circle cx="160" cy="40" r="2.5" fill="#3D3D3D" /> {/* Right eye */}
      <circle cx="139" cy="39" r="0.8" fill="white" /> {/* Left eye highlight */}
      <circle cx="159" cy="39" r="0.8" fill="white" /> {/* Right eye highlight */}

      {/* Eyebrows */}
      <path d="M134 34 Q140 32 146 34" stroke={colors.shadow} strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M154 34 Q160 32 166 34" stroke={colors.shadow} strokeWidth="1.5" fill="none" opacity="0.5" />

      {/* Nose */}
      <path d="M150 44 L150 54 Q148 57 150 58 Q152 57 150 54" stroke={colors.shadow} strokeWidth="1" fill="none" opacity="0.4" />

      {/* Lips */}
      <path d="M144 64 Q150 67 156 64" fill={colors.shadow} opacity="0.35" />
      <path d="M144 64 Q150 62 156 64" fill={colors.mid} opacity="0.5" />

      {/* Ears */}
      <ellipse cx="117" cy="45" rx="5" ry="10" fill={`url(#skinGradient-${view})`} />
      <ellipse cx="183" cy="45" rx="5" ry="10" fill={`url(#skinGradient-${view})`} />

      {/* Neck - smooth transition */}
      <path
        d="M135 80 Q135 75 140 73 L160 73 Q165 75 165 80 L165 100 Q160 102 150 102 Q140 102 135 100 Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Shoulders - anatomical curve */}
      <path
        d="M75 115 Q90 100 135 100 L165 100 Q210 100 225 115 L225 135 Q210 120 150 120 Q90 120 75 135 Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Chest/Torso - natural contours */}
      <path
        d="M90 130
           Q85 135 85 160
           L85 190
           Q87 210 90 230
           Q95 260 100 280
           L105 300
           Q120 305 150 305
           Q180 305 195 300
           L200 280
           Q205 260 210 230
           Q213 210 215 190
           L215 160
           Q215 135 210 130
           Q180 125 150 125
           Q120 125 90 130
           Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Pectoral definition lines */}
      <path d="M105 145 Q130 160 150 155 Q170 160 195 145" stroke={colors.shadow} strokeWidth="0.8" fill="none" opacity="0.2" />

      {/* Abdominal definition */}
      <line x1="150" y1="180" x2="150" y2="270" stroke={colors.shadow} strokeWidth="0.5" opacity="0.15" />
      <path d="M120 200 Q150 205 180 200" stroke={colors.shadow} strokeWidth="0.5" fill="none" opacity="0.1" />
      <path d="M118 230 Q150 235 182 230" stroke={colors.shadow} strokeWidth="0.5" fill="none" opacity="0.1" />

      {/* Umbilicus */}
      <ellipse cx="150" cy="250" rx="4" ry="5" fill={colors.shadow} opacity="0.25" />

      {/* Left Arm */}
      <path
        d="M75 115
           Q65 120 60 140
           L55 200
           Q52 220 50 240
           L48 280
           Q45 300 42 320
           Q40 330 35 340
           L35 365
           Q40 375 50 375
           Q55 370 55 355
           L58 320
           Q62 290 65 260
           L70 200
           Q75 160 85 130
           Z"
        fill={`url(#skinGradientArm-${view})`}
      />

      {/* Left Hand */}
      <ellipse cx="45" cy="380" rx="18" ry="24" fill={`url(#skinGradient-${view})`} />
      {/* Fingers indication */}
      <path d="M30 370 L25 395" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M35 372 L28 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M42 373 L38 402" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M50 372 L52 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M58 368 L65 388" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />

      {/* Right Arm - mirror */}
      <path
        d="M225 115
           Q235 120 240 140
           L245 200
           Q248 220 250 240
           L252 280
           Q255 300 258 320
           Q260 330 265 340
           L265 365
           Q260 375 250 375
           Q245 370 245 355
           L242 320
           Q238 290 235 260
           L230 200
           Q225 160 215 130
           Z"
        fill={`url(#skinGradientArm-${view})`}
      />

      {/* Right Hand */}
      <ellipse cx="255" cy="380" rx="18" ry="24" fill={`url(#skinGradient-${view})`} />
      <path d="M270 370 L275 395" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M265 372 L272 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M258 373 L262 402" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M250 372 L248 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M242 368 L235 388" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />

      {/* Pelvis/Groin area */}
      <path
        d="M105 300
           Q115 320 115 340
           L120 360
           Q140 365 150 365
           Q160 365 180 360
           L185 340
           Q185 320 195 300"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Left Leg */}
      <path
        d="M110 355
           Q105 380 105 420
           L105 500
           Q106 550 108 600
           L110 680
           Q112 700 115 720
           L120 750
           Q125 760 130 755
           L135 720
           Q138 700 140 680
           L145 600
           Q147 550 148 500
           L148 420
           Q147 380 145 360
           Q130 355 110 355
           Z"
        fill={`url(#skinGradientLeg-${view})`}
      />

      {/* Left Knee definition */}
      <ellipse cx="127" cy="520" rx="15" ry="12" fill={colors.shadow} opacity="0.1" />

      {/* Left Foot */}
      <ellipse cx="127" cy="770" rx="20" ry="28" fill={`url(#skinGradient-${view})`} />

      {/* Right Leg */}
      <path
        d="M190 355
           Q195 380 195 420
           L195 500
           Q194 550 192 600
           L190 680
           Q188 700 185 720
           L180 750
           Q175 760 170 755
           L165 720
           Q162 700 160 680
           L155 600
           Q153 550 152 500
           L152 420
           Q153 380 155 360
           Q170 355 190 355
           Z"
        fill={`url(#skinGradientLeg-${view})`}
      />

      {/* Right Knee definition */}
      <ellipse cx="173" cy="520" rx="15" ry="12" fill={colors.shadow} opacity="0.1" />

      {/* Right Foot */}
      <ellipse cx="173" cy="770" rx="20" ry="28" fill={`url(#skinGradient-${view})`} />
    </g>
  );

  const renderBackView = () => (
    <g onClick={handleClick} style={{ cursor: interactive ? 'pointer' : 'default' }}>
      {/* Head - back view */}
      <ellipse
        cx="150"
        cy="45"
        rx="32"
        ry="38"
        fill={`url(#skinGradient-${view})`}
        className="body-region head"
      />

      {/* Hair indication */}
      <path
        d="M120 35 Q130 15 150 10 Q170 15 180 35"
        fill="none"
        stroke={colors.shadow}
        strokeWidth="4"
        opacity="0.4"
      />

      {/* Ears - back view */}
      <ellipse cx="117" cy="45" rx="5" ry="10" fill={`url(#skinGradient-${view})`} />
      <ellipse cx="183" cy="45" rx="5" ry="10" fill={`url(#skinGradient-${view})`} />

      {/* Neck */}
      <path
        d="M135 80 Q135 75 140 73 L160 73 Q165 75 165 80 L165 100 Q160 102 150 102 Q140 102 135 100 Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Spine indication */}
      <line x1="150" y1="85" x2="150" y2="290" stroke={colors.shadow} strokeWidth="1" opacity="0.15" strokeDasharray="4,4" />

      {/* Shoulders */}
      <path
        d="M75 115 Q90 100 135 100 L165 100 Q210 100 225 115 L225 135 Q210 120 150 120 Q90 120 75 135 Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Upper Back */}
      <path
        d="M90 130
           Q85 135 85 160
           L85 200
           Q87 220 90 240
           Q95 260 100 280
           L105 300
           Q120 305 150 305
           Q180 305 195 300
           L200 280
           Q205 260 210 240
           Q213 220 215 200
           L215 160
           Q215 135 210 130
           Q180 125 150 125
           Q120 125 90 130
           Z"
        fill={`url(#skinGradient-${view})`}
      />

      {/* Scapula definitions */}
      <path d="M100 150 Q115 165 130 155 Q140 150 140 160" stroke={colors.shadow} strokeWidth="0.8" fill="none" opacity="0.15" />
      <path d="M200 150 Q185 165 170 155 Q160 150 160 160" stroke={colors.shadow} strokeWidth="0.8" fill="none" opacity="0.15" />

      {/* Buttocks */}
      <ellipse cx="130" cy="330" rx="25" ry="30" fill={`url(#skinGradient-${view})`} />
      <ellipse cx="170" cy="330" rx="25" ry="30" fill={`url(#skinGradient-${view})`} />
      <line x1="150" y1="300" x2="150" y2="360" stroke={colors.shadow} strokeWidth="1" opacity="0.2" />

      {/* Left Arm - back */}
      <path
        d="M75 115
           Q65 120 60 140
           L55 200
           Q52 220 50 240
           L48 280
           Q45 300 42 320
           Q40 330 35 340
           L35 365
           Q40 375 50 375
           Q55 370 55 355
           L58 320
           Q62 290 65 260
           L70 200
           Q75 160 85 130
           Z"
        fill={`url(#skinGradientArm-${view})`}
      />

      {/* Left Hand - back */}
      <ellipse cx="45" cy="380" rx="18" ry="24" fill={`url(#skinGradient-${view})`} />
      <path d="M30 370 L25 395" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M35 372 L28 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M42 373 L38 402" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M50 372 L52 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M58 368 L65 388" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />

      {/* Right Arm - back */}
      <path
        d="M225 115
           Q235 120 240 140
           L245 200
           Q248 220 250 240
           L252 280
           Q255 300 258 320
           Q260 330 265 340
           L265 365
           Q260 375 250 375
           Q245 370 245 355
           L242 320
           Q238 290 235 260
           L230 200
           Q225 160 215 130
           Z"
        fill={`url(#skinGradientArm-${view})`}
      />

      {/* Right Hand - back */}
      <ellipse cx="255" cy="380" rx="18" ry="24" fill={`url(#skinGradient-${view})`} />
      <path d="M270 370 L275 395" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M265 372 L272 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M258 373 L262 402" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M250 372 L248 400" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M242 368 L235 388" stroke={colors.outline} strokeWidth="5" strokeLinecap="round" />

      {/* Left Leg - back */}
      <path
        d="M110 355
           Q105 380 105 420
           L105 500
           Q106 550 108 600
           L110 680
           Q112 700 115 720
           L120 750
           Q125 760 130 755
           L135 720
           Q138 700 140 680
           L145 600
           Q147 550 148 500
           L148 420
           Q147 380 145 360
           Q130 355 110 355
           Z"
        fill={`url(#skinGradientLeg-${view})`}
      />

      {/* Left Calf muscle */}
      <ellipse cx="127" cy="620" rx="12" ry="25" fill={colors.shadow} opacity="0.08" />

      {/* Left Foot - back (heel) */}
      <ellipse cx="127" cy="770" rx="18" ry="25" fill={`url(#skinGradient-${view})`} />

      {/* Right Leg - back */}
      <path
        d="M190 355
           Q195 380 195 420
           L195 500
           Q194 550 192 600
           L190 680
           Q188 700 185 720
           L180 750
           Q175 760 170 755
           L165 720
           Q162 700 160 680
           L155 600
           Q153 550 152 500
           L152 420
           Q153 380 155 360
           Q170 355 190 355
           Z"
        fill={`url(#skinGradientLeg-${view})`}
      />

      {/* Right Calf muscle */}
      <ellipse cx="173" cy="620" rx="12" ry="25" fill={colors.shadow} opacity="0.08" />

      {/* Right Foot - back (heel) */}
      <ellipse cx="173" cy="770" rx="18" ry="25" fill={`url(#skinGradient-${view})`} />
    </g>
  );

  const renderSideView = (side: 'left' | 'right') => {
    const isLeft = side === 'left';
    const xOffset = isLeft ? 0 : 0; // Can be adjusted for positioning

    return (
      <g onClick={handleClick} style={{ cursor: interactive ? 'pointer' : 'default' }}>
        {/* Head - side profile */}
        <path
          d={isLeft
            ? "M130 45 Q130 10 155 10 Q180 15 185 45 Q188 70 175 80 L165 83 L145 83 Q130 75 130 45 Z"
            : "M170 45 Q170 10 145 10 Q120 15 115 45 Q112 70 125 80 L135 83 L155 83 Q170 75 170 45 Z"
          }
          fill={`url(#skinGradient-${view})`}
        />

        {/* Eye */}
        <circle cx={isLeft ? 165 : 135} cy="40" r="3" fill="#3D3D3D" />
        <circle cx={isLeft ? 164 : 134} cy="39" r="0.8" fill="white" />

        {/* Nose */}
        <path
          d={isLeft
            ? "M180 40 Q190 50 185 60 L180 65"
            : "M120 40 Q110 50 115 60 L120 65"
          }
          stroke={colors.shadow}
          strokeWidth="1.5"
          fill="none"
          opacity="0.5"
        />

        {/* Ear */}
        <ellipse cx={isLeft ? 130 : 170} cy="45" rx="6" ry="12" fill={`url(#skinGradient-${view})`} />

        {/* Lips */}
        <path
          d={isLeft
            ? "M178 67 Q182 70 178 73"
            : "M122 67 Q118 70 122 73"
          }
          fill={colors.shadow}
          opacity="0.3"
        />

        {/* Neck */}
        <rect
          x={isLeft ? 145 : 130}
          y="83"
          width="25"
          height="30"
          fill={`url(#skinGradient-${view})`}
        />

        {/* Torso - side profile */}
        <path
          d={isLeft
            ? `M140 110
               Q130 120 125 150
               Q118 200 120 250
               Q122 280 130 310
               L145 340
               L175 340
               Q180 320 182 300
               Q190 250 188 200
               Q185 150 175 120
               Q168 110 155 110
               Z`
            : `M160 110
               Q170 120 175 150
               Q182 200 180 250
               Q178 280 170 310
               L155 340
               L125 340
               Q120 320 118 300
               Q110 250 112 200
               Q115 150 125 120
               Q132 110 145 110
               Z`
          }
          fill={`url(#skinGradient-${view})`}
        />

        {/* Visible arm (the one on the side we're viewing) */}
        <path
          d={isLeft
            ? `M175 115
               Q185 130 190 170
               L195 230
               Q198 270 200 310
               L202 350
               Q205 370 208 385
               L208 400
               Q200 410 195 400
               L190 350
               Q185 300 180 250
               L175 190
               Q170 150 165 125
               Z`
            : `M125 115
               Q115 130 110 170
               L105 230
               Q102 270 100 310
               L98 350
               Q95 370 92 385
               L92 400
               Q100 410 105 400
               L110 350
               Q115 300 120 250
               L125 190
               Q130 150 135 125
               Z`
          }
          fill={`url(#skinGradientArm-${view})`}
        />

        {/* Hand */}
        <ellipse
          cx={isLeft ? 208 : 92}
          cy="415"
          rx="12"
          ry="18"
          fill={`url(#skinGradient-${view})`}
        />

        {/* Buttock */}
        <ellipse
          cx={isLeft ? 135 : 165}
          cy="340"
          rx="20"
          ry="25"
          fill={`url(#skinGradient-${view})`}
        />

        {/* Leg - side */}
        <path
          d={isLeft
            ? `M130 360
               Q125 400 125 470
               L125 550
               Q127 620 130 680
               L135 740
               Q140 760 150 755
               L155 720
               Q160 680 162 620
               L165 550
               Q165 480 162 420
               Q158 370 150 360
               Z`
            : `M170 360
               Q175 400 175 470
               L175 550
               Q173 620 170 680
               L165 740
               Q160 760 150 755
               L145 720
               Q140 680 138 620
               L135 550
               Q135 480 138 420
               Q142 370 150 360
               Z`
          }
          fill={`url(#skinGradientLeg-${view})`}
        />

        {/* Knee */}
        <ellipse
          cx={isLeft ? 145 : 155}
          cy="520"
          rx="12"
          ry="10"
          fill={colors.shadow}
          opacity="0.1"
        />

        {/* Foot - side */}
        <path
          d={isLeft
            ? "M130 755 Q115 760 105 770 Q100 780 110 785 L160 785 Q170 780 165 770 Q155 755 145 755 Z"
            : "M170 755 Q185 760 195 770 Q200 780 190 785 L140 785 Q130 780 135 770 Q145 755 155 755 Z"
          }
          fill={`url(#skinGradient-${view})`}
        />
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 300 820"
      style={{
        width: '100%',
        height: 'auto',
        maxWidth: '400px',
        filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.12))',
      }}
    >
      <defs>
        {/* Main skin gradient */}
        <radialGradient id={`skinGradient-${view}`} cx="40%" cy="25%" r="65%">
          <stop offset="0%" stopColor={colors.highlight} />
          <stop offset="40%" stopColor={colors.base} />
          <stop offset="80%" stopColor={colors.mid} />
          <stop offset="100%" stopColor={colors.shadow} />
        </radialGradient>

        {/* Arm gradient (slightly different lighting) */}
        <linearGradient id={`skinGradientArm-${view}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors.shadow} />
          <stop offset="30%" stopColor={colors.mid} />
          <stop offset="70%" stopColor={colors.base} />
          <stop offset="100%" stopColor={colors.shadow} />
        </linearGradient>

        {/* Leg gradient */}
        <linearGradient id={`skinGradientLeg-${view}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.mid} />
          <stop offset="50%" stopColor={colors.base} />
          <stop offset="100%" stopColor={colors.shadow} />
        </linearGradient>

        {/* Glow effect for hover/selection */}
        <filter id={`bodyGlow-${view}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Drop shadow */}
        <filter id={`bodyShadow-${view}`} x="-10%" y="-5%" width="120%" height="115%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
          <feOffset dx="0" dy="8" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.2" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Subtle background gradient */}
      <rect width="300" height="820" fill="transparent" />

      {/* Render appropriate view */}
      <g filter={`url(#bodyShadow-${view})`}>
        {view === 'front' && renderFrontView()}
        {view === 'back' && renderBackView()}
        {view === 'left' && renderSideView('left')}
        {view === 'right' && renderSideView('right')}
      </g>
    </svg>
  );
}

// Helper function to determine body region from click coordinates
function getRegionFromCoordinates(x: number, y: number, view: string): string {
  // Head regions (y < 12%)
  if (y < 12) {
    if (y < 6) return 'scalp-front';
    if (x < 45) return 'temple-l';
    if (x > 55) return 'temple-r';
    return 'forehead';
  }

  // Face regions (y 6-10%)
  if (y < 10) {
    if (x < 47) return 'cheek-l';
    if (x > 53) return 'cheek-r';
    return 'nose-bridge';
  }

  // Neck (y 10-14%)
  if (y < 14) return view === 'back' ? 'neck-posterior' : 'neck-anterior';

  // Shoulders and upper body (y 14-20%)
  if (y < 20) {
    if (x < 35) return 'shoulder-l';
    if (x > 65) return 'shoulder-r';
    return view === 'back' ? 'back-upper' : 'chest-upper';
  }

  // Arms (x < 30% or x > 70%)
  if (x < 30 || x > 70) {
    const side = x < 50 ? 'l' : 'r';
    if (y < 35) return `arm-upper-anterior-${side}`;
    if (y < 45) return `forearm-anterior-${side}`;
    if (y < 55) return `hand-dorsal-${side}`;
    return `hand-palmar-${side}`;
  }

  // Torso (y 20-40%)
  if (y < 40) {
    if (x < 45) return view === 'back' ? 'scapula-l' : 'flank-l';
    if (x > 55) return view === 'back' ? 'scapula-r' : 'flank-r';
    if (y < 30) return view === 'back' ? 'back-upper' : 'chest-lower';
    return view === 'back' ? 'back-lower' : 'abdomen-upper';
  }

  // Lower abdomen/pelvis (y 40-48%)
  if (y < 48) {
    if (view === 'back') {
      if (x < 48) return 'buttock-l';
      if (x > 52) return 'buttock-r';
      return 'gluteal-cleft';
    }
    if (x < 45) return 'groin-l';
    if (x > 55) return 'groin-r';
    return 'abdomen-lower';
  }

  // Thighs (y 48-65%)
  if (y < 65) {
    const side = x < 50 ? 'l' : 'r';
    return view === 'back' ? `thigh-posterior-${side}` : `thigh-anterior-${side}`;
  }

  // Knees (y 65-70%)
  if (y < 70) {
    const side = x < 50 ? 'l' : 'r';
    return view === 'back' ? `knee-posterior-${side}` : `knee-anterior-${side}`;
  }

  // Lower legs (y 70-90%)
  if (y < 90) {
    const side = x < 50 ? 'l' : 'r';
    return view === 'back' ? `calf-${side}` : `shin-${side}`;
  }

  // Feet (y > 90%)
  const side = x < 50 ? 'l' : 'r';
  return view === 'back' ? `foot-plantar-${side}` : `foot-dorsal-${side}`;
}

export { BODY_REGIONS };
export default PremiumBodySVG;
