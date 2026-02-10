/**
 * Prescribing Components Index
 *
 * Exports all prescribing-related components including
 * drug interaction checking, allergy warnings, and drug search.
 */

export { DrugInteractionAlert } from './DrugInteractionAlert';
export type {
  AlertSeverity,
  DrugInteraction,
  AllergyWarning as DrugAllergyWarning,
  DuplicateTherapyAlert,
  DrugWarning,
  SafetyCheckResult,
} from './DrugInteractionAlert';

export { AllergyWarning, AllergyWarningBanner } from './AllergyWarning';
export type { AllergyData } from './AllergyWarning';

export { DrugSearch } from './DrugSearch';
export type { Drug } from './DrugSearch';
