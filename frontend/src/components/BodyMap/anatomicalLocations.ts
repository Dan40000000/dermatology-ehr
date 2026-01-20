/**
 * Comprehensive anatomical locations for body mapping
 * Includes ICD-10 body site codes and SVG coordinate mappings
 */

export interface AnatomicalLocation {
  code: string;
  name: string;
  category: 'head-neck' | 'trunk' | 'upper-extremity' | 'lower-extremity' | 'genitourinary';
  icd10Code: string; // ICD-10 topography code
  views: {
    view: 'front' | 'back' | 'head-front' | 'head-back' | 'left-side' | 'right-side';
    x: number; // Percentage 0-100
    y: number; // Percentage 0-100
  }[];
  laterality?: 'left' | 'right' | 'bilateral';
  medicalTerm?: string;
}

export const ANATOMICAL_LOCATIONS: AnatomicalLocation[] = [
  // HEAD AND NECK
  {
    code: 'scalp',
    name: 'Scalp',
    category: 'head-neck',
    icd10Code: 'C44.40',
    medicalTerm: 'Cutis capitis',
    views: [
      { view: 'front', x: 50, y: 5 },
      { view: 'back', x: 50, y: 5 },
    ],
  },
  {
    code: 'forehead',
    name: 'Forehead',
    category: 'head-neck',
    icd10Code: 'C44.309',
    medicalTerm: 'Frons',
    views: [{ view: 'front', x: 50, y: 8 }],
  },
  {
    code: 'temple-right',
    name: 'Right Temple',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'right',
    medicalTerm: 'Tempora dextra',
    views: [{ view: 'front', x: 35, y: 10 }],
  },
  {
    code: 'temple-left',
    name: 'Left Temple',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'left',
    medicalTerm: 'Tempora sinistra',
    views: [{ view: 'front', x: 65, y: 10 }],
  },
  {
    code: 'eye-right',
    name: 'Right Eye/Eyelid',
    category: 'head-neck',
    icd10Code: 'C44.10',
    laterality: 'right',
    medicalTerm: 'Palpebra dextra',
    views: [{ view: 'front', x: 42, y: 11 }],
  },
  {
    code: 'eye-left',
    name: 'Left Eye/Eyelid',
    category: 'head-neck',
    icd10Code: 'C44.10',
    laterality: 'left',
    medicalTerm: 'Palpebra sinistra',
    views: [{ view: 'front', x: 58, y: 11 }],
  },
  {
    code: 'nose',
    name: 'Nose',
    category: 'head-neck',
    icd10Code: 'C44.301',
    medicalTerm: 'Nasus',
    views: [{ view: 'front', x: 50, y: 13 }],
  },
  {
    code: 'cheek-right',
    name: 'Right Cheek',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'right',
    medicalTerm: 'Bucca dextra',
    views: [{ view: 'front', x: 38, y: 14 }],
  },
  {
    code: 'cheek-left',
    name: 'Left Cheek',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'left',
    medicalTerm: 'Bucca sinistra',
    views: [{ view: 'front', x: 62, y: 14 }],
  },
  {
    code: 'ear-right',
    name: 'Right Ear',
    category: 'head-neck',
    icd10Code: 'C44.20',
    laterality: 'right',
    medicalTerm: 'Auris dextra',
    views: [{ view: 'front', x: 30, y: 12 }],
  },
  {
    code: 'ear-left',
    name: 'Left Ear',
    category: 'head-neck',
    icd10Code: 'C44.20',
    laterality: 'left',
    medicalTerm: 'Auris sinistra',
    views: [{ view: 'front', x: 70, y: 12 }],
  },
  {
    code: 'lips',
    name: 'Lips',
    category: 'head-neck',
    icd10Code: 'C44.00',
    medicalTerm: 'Labia',
    views: [{ view: 'front', x: 50, y: 15 }],
  },
  {
    code: 'chin',
    name: 'Chin',
    category: 'head-neck',
    icd10Code: 'C44.319',
    medicalTerm: 'Mentum',
    views: [{ view: 'front', x: 50, y: 17 }],
  },
  {
    code: 'jaw-right',
    name: 'Right Jaw',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'right',
    medicalTerm: 'Mandibula dextra',
    views: [{ view: 'front', x: 40, y: 16 }],
  },
  {
    code: 'jaw-left',
    name: 'Left Jaw',
    category: 'head-neck',
    icd10Code: 'C44.319',
    laterality: 'left',
    medicalTerm: 'Mandibula sinistra',
    views: [{ view: 'front', x: 60, y: 16 }],
  },
  {
    code: 'neck-anterior',
    name: 'Anterior Neck',
    category: 'head-neck',
    icd10Code: 'C44.40',
    medicalTerm: 'Collum anterius',
    views: [{ view: 'front', x: 50, y: 19 }],
  },
  {
    code: 'neck-posterior',
    name: 'Posterior Neck',
    category: 'head-neck',
    icd10Code: 'C44.40',
    medicalTerm: 'Collum posterius (nape)',
    views: [{ view: 'back', x: 50, y: 19 }],
  },

  // TRUNK - ANTERIOR
  {
    code: 'chest-upper',
    name: 'Upper Chest',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Pectus superius',
    views: [{ view: 'front', x: 50, y: 25 }],
  },
  {
    code: 'chest-right',
    name: 'Right Chest',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'right',
    medicalTerm: 'Pectus dextrum',
    views: [{ view: 'front', x: 38, y: 28 }],
  },
  {
    code: 'chest-left',
    name: 'Left Chest',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'left',
    medicalTerm: 'Pectus sinistrum',
    views: [{ view: 'front', x: 62, y: 28 }],
  },
  {
    code: 'abdomen-upper',
    name: 'Upper Abdomen (Epigastric)',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Epigastrium',
    views: [{ view: 'front', x: 50, y: 35 }],
  },
  {
    code: 'abdomen-middle',
    name: 'Mid Abdomen (Periumbilical)',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Regio umbilicalis',
    views: [{ view: 'front', x: 50, y: 40 }],
  },
  {
    code: 'abdomen-lower',
    name: 'Lower Abdomen (Hypogastric)',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Hypogastrium',
    views: [{ view: 'front', x: 50, y: 45 }],
  },
  {
    code: 'flank-right',
    name: 'Right Flank',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'right',
    medicalTerm: 'Latus dextrum',
    views: [{ view: 'front', x: 30, y: 40 }],
  },
  {
    code: 'flank-left',
    name: 'Left Flank',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'left',
    medicalTerm: 'Latus sinistrum',
    views: [{ view: 'front', x: 70, y: 40 }],
  },
  {
    code: 'groin-right',
    name: 'Right Groin',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'right',
    medicalTerm: 'Inguen dextrum',
    views: [{ view: 'front', x: 42, y: 48 }],
  },
  {
    code: 'groin-left',
    name: 'Left Groin',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'left',
    medicalTerm: 'Inguen sinistrum',
    views: [{ view: 'front', x: 58, y: 48 }],
  },

  // TRUNK - POSTERIOR
  {
    code: 'back-upper',
    name: 'Upper Back',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Dorsum superius',
    views: [{ view: 'back', x: 50, y: 25 }],
  },
  {
    code: 'back-middle',
    name: 'Mid Back',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Dorsum medium',
    views: [{ view: 'back', x: 50, y: 35 }],
  },
  {
    code: 'back-lower',
    name: 'Lower Back (Lumbar)',
    category: 'trunk',
    icd10Code: 'C44.509',
    medicalTerm: 'Regio lumbalis',
    views: [{ view: 'back', x: 50, y: 42 }],
  },
  {
    code: 'buttock-right',
    name: 'Right Buttock',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'right',
    medicalTerm: 'Natis dextra',
    views: [{ view: 'back', x: 44, y: 48 }],
  },
  {
    code: 'buttock-left',
    name: 'Left Buttock',
    category: 'trunk',
    icd10Code: 'C44.509',
    laterality: 'left',
    medicalTerm: 'Natis sinistra',
    views: [{ view: 'back', x: 56, y: 48 }],
  },

  // UPPER EXTREMITIES - RIGHT
  {
    code: 'shoulder-right',
    name: 'Right Shoulder',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Humerus dextrum',
    views: [
      { view: 'front', x: 22, y: 24 },
      { view: 'back', x: 22, y: 24 },
    ],
  },
  {
    code: 'upper-arm-right-anterior',
    name: 'Right Upper Arm (Anterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Brachium dextrum anterius',
    views: [{ view: 'front', x: 18, y: 30 }],
  },
  {
    code: 'upper-arm-right-posterior',
    name: 'Right Upper Arm (Posterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Brachium dextrum posterius',
    views: [{ view: 'back', x: 18, y: 30 }],
  },
  {
    code: 'elbow-right',
    name: 'Right Elbow',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Cubitus dexter',
    views: [{ view: 'front', x: 16, y: 36 }],
  },
  {
    code: 'forearm-right-anterior',
    name: 'Right Forearm (Anterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Antebrachium dextrum anterius',
    views: [{ view: 'front', x: 14, y: 40 }],
  },
  {
    code: 'forearm-right-posterior',
    name: 'Right Forearm (Posterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Antebrachium dextrum posterius',
    views: [{ view: 'back', x: 14, y: 40 }],
  },
  {
    code: 'wrist-right',
    name: 'Right Wrist',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Carpus dexter',
    views: [{ view: 'front', x: 12, y: 44 }],
  },
  {
    code: 'hand-right-dorsal',
    name: 'Right Hand (Dorsal)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Manus dextra dorsalis',
    views: [{ view: 'front', x: 10, y: 47 }],
  },
  {
    code: 'hand-right-palmar',
    name: 'Right Hand (Palmar)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'right',
    medicalTerm: 'Palma dextra',
    views: [{ view: 'back', x: 10, y: 47 }],
  },

  // UPPER EXTREMITIES - LEFT
  {
    code: 'shoulder-left',
    name: 'Left Shoulder',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Humerus sinistrum',
    views: [
      { view: 'front', x: 78, y: 24 },
      { view: 'back', x: 78, y: 24 },
    ],
  },
  {
    code: 'upper-arm-left-anterior',
    name: 'Left Upper Arm (Anterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Brachium sinistrum anterius',
    views: [{ view: 'front', x: 82, y: 30 }],
  },
  {
    code: 'upper-arm-left-posterior',
    name: 'Left Upper Arm (Posterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Brachium sinistrum posterius',
    views: [{ view: 'back', x: 82, y: 30 }],
  },
  {
    code: 'elbow-left',
    name: 'Left Elbow',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Cubitus sinister',
    views: [{ view: 'front', x: 84, y: 36 }],
  },
  {
    code: 'forearm-left-anterior',
    name: 'Left Forearm (Anterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Antebrachium sinistrum anterius',
    views: [{ view: 'front', x: 86, y: 40 }],
  },
  {
    code: 'forearm-left-posterior',
    name: 'Left Forearm (Posterior)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Antebrachium sinistrum posterius',
    views: [{ view: 'back', x: 86, y: 40 }],
  },
  {
    code: 'wrist-left',
    name: 'Left Wrist',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Carpus sinister',
    views: [{ view: 'front', x: 88, y: 44 }],
  },
  {
    code: 'hand-left-dorsal',
    name: 'Left Hand (Dorsal)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Manus sinistra dorsalis',
    views: [{ view: 'front', x: 90, y: 47 }],
  },
  {
    code: 'hand-left-palmar',
    name: 'Left Hand (Palmar)',
    category: 'upper-extremity',
    icd10Code: 'C44.609',
    laterality: 'left',
    medicalTerm: 'Palma sinistra',
    views: [{ view: 'back', x: 90, y: 47 }],
  },

  // LOWER EXTREMITIES - RIGHT
  {
    code: 'hip-right',
    name: 'Right Hip',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Coxa dextra',
    views: [{ view: 'front', x: 42, y: 50 }],
  },
  {
    code: 'thigh-right-anterior',
    name: 'Right Thigh (Anterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Femur dextrum anterius',
    views: [{ view: 'front', x: 40, y: 58 }],
  },
  {
    code: 'thigh-right-posterior',
    name: 'Right Thigh (Posterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Femur dextrum posterius',
    views: [{ view: 'back', x: 40, y: 58 }],
  },
  {
    code: 'knee-right',
    name: 'Right Knee',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Genu dextrum',
    views: [{ view: 'front', x: 40, y: 68 }],
  },
  {
    code: 'lower-leg-right-anterior',
    name: 'Right Lower Leg (Anterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Crus dextrum anterius',
    views: [{ view: 'front', x: 40, y: 76 }],
  },
  {
    code: 'lower-leg-right-posterior',
    name: 'Right Lower Leg (Posterior/Calf)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Crus dextrum posterius (sura)',
    views: [{ view: 'back', x: 40, y: 76 }],
  },
  {
    code: 'ankle-right',
    name: 'Right Ankle',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Tarsus dexter',
    views: [{ view: 'front', x: 40, y: 84 }],
  },
  {
    code: 'foot-right-dorsal',
    name: 'Right Foot (Dorsal)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Pes dexter dorsalis',
    views: [{ view: 'front', x: 40, y: 90 }],
  },
  {
    code: 'foot-right-plantar',
    name: 'Right Foot (Plantar/Sole)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'right',
    medicalTerm: 'Planta pedis dextra',
    views: [{ view: 'back', x: 40, y: 90 }],
  },

  // LOWER EXTREMITIES - LEFT
  {
    code: 'hip-left',
    name: 'Left Hip',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Coxa sinistra',
    views: [{ view: 'front', x: 58, y: 50 }],
  },
  {
    code: 'thigh-left-anterior',
    name: 'Left Thigh (Anterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Femur sinistrum anterius',
    views: [{ view: 'front', x: 60, y: 58 }],
  },
  {
    code: 'thigh-left-posterior',
    name: 'Left Thigh (Posterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Femur sinistrum posterius',
    views: [{ view: 'back', x: 60, y: 58 }],
  },
  {
    code: 'knee-left',
    name: 'Left Knee',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Genu sinistrum',
    views: [{ view: 'front', x: 60, y: 68 }],
  },
  {
    code: 'lower-leg-left-anterior',
    name: 'Left Lower Leg (Anterior)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Crus sinistrum anterius',
    views: [{ view: 'front', x: 60, y: 76 }],
  },
  {
    code: 'lower-leg-left-posterior',
    name: 'Left Lower Leg (Posterior/Calf)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Crus sinistrum posterius (sura)',
    views: [{ view: 'back', x: 60, y: 76 }],
  },
  {
    code: 'ankle-left',
    name: 'Left Ankle',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Tarsus sinister',
    views: [{ view: 'front', x: 60, y: 84 }],
  },
  {
    code: 'foot-left-dorsal',
    name: 'Left Foot (Dorsal)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Pes sinister dorsalis',
    views: [{ view: 'front', x: 60, y: 90 }],
  },
  {
    code: 'foot-left-plantar',
    name: 'Left Foot (Plantar/Sole)',
    category: 'lower-extremity',
    icd10Code: 'C44.709',
    laterality: 'left',
    medicalTerm: 'Planta pedis sinistra',
    views: [{ view: 'back', x: 60, y: 90 }],
  },

  // GENITOURINARY (if needed for dermatology)
  {
    code: 'genital-external',
    name: 'External Genitalia',
    category: 'genitourinary',
    icd10Code: 'C44.509',
    medicalTerm: 'Genitalia externa',
    views: [{ view: 'front', x: 50, y: 49 }],
  },
];

/**
 * Get location by code
 */
export function getLocationByCode(code: string): AnatomicalLocation | undefined {
  return ANATOMICAL_LOCATIONS.find((loc) => loc.code === code);
}

/**
 * Get all locations for a specific view
 */
export function getLocationsByView(view: string): AnatomicalLocation[] {
  return ANATOMICAL_LOCATIONS.filter((loc) => loc.views.some((v) => v.view === view));
}

/**
 * Get all locations by category
 */
export function getLocationsByCategory(category: string): AnatomicalLocation[] {
  return ANATOMICAL_LOCATIONS.filter((loc) => loc.category === category);
}

/**
 * Search locations by name or medical term
 */
export function searchLocations(query: string): AnatomicalLocation[] {
  const lowerQuery = query.toLowerCase();
  return ANATOMICAL_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(lowerQuery) ||
      loc.medicalTerm?.toLowerCase().includes(lowerQuery) ||
      loc.code.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get closest location based on click coordinates
 */
export function getClosestLocation(view: string, x: number, y: number): AnatomicalLocation | null {
  const locationsInView = ANATOMICAL_LOCATIONS.filter((loc) => loc.views.some((v) => v.view === view));

  let closest: AnatomicalLocation | null = null;
  let minDistance = Infinity;

  locationsInView.forEach((loc) => {
    const viewData = loc.views.find((v) => v.view === view);
    if (viewData) {
      const distance = Math.sqrt(Math.pow(viewData.x - x, 2) + Math.pow(viewData.y - y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closest = loc;
      }
    }
  });

  // Only return if within reasonable distance (e.g., 10% of view)
  return minDistance < 15 ? closest : null;
}
