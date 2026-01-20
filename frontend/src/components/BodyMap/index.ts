/**
 * Body Map Components
 *
 * Comprehensive lesion tracking system for dermatology practices
 * Includes interactive body diagrams, lesion markers, and detailed tracking
 */

export { BodyMap } from './BodyMap';
export type { BodyMapProps, BodyView } from './BodyMap';

export { BodyMapMarker, BodyMapLegend } from './BodyMapMarker';
export type { LesionMarker, BodyMapMarkerProps } from './BodyMapMarker';

export { BodyMapSidebar } from './BodyMapSidebar';
export type { BodyMapSidebarProps } from './BodyMapSidebar';

export { LesionDetailModal } from './LesionDetailModal';
export type { LesionDetailModalProps, LesionObservation } from './LesionDetailModal';

export {
  ANATOMICAL_LOCATIONS,
  getLocationByCode,
  getLocationsByView,
  getLocationsByCategory,
  searchLocations,
  getClosestLocation,
} from './anatomicalLocations';
export type { AnatomicalLocation } from './anatomicalLocations';
