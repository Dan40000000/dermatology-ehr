/**
 * Severity Score Components
 * Export all severity score calculator components
 */

export { IGASelector } from './IGASelector';
export type { IGAValue, IGAScoreResult } from './IGASelector';

export { PASICalculator } from './PASICalculator';
export type { PASIRegionScore, PASIComponents, PASIScoreResult } from './PASICalculator';

export { BSACalculator } from './BSACalculator';
export type { BSARegion, BSAComponents, BSAScoreResult } from './BSACalculator';

export { DLQIQuestionnaire } from './DLQIQuestionnaire';
export type { DLQIResponses, DLQIScoreResult } from './DLQIQuestionnaire';

export { ScoreHistory } from './ScoreHistory';
export type { ScoreHistoryEntry, AssessmentHistory } from './ScoreHistory';

export { ScoreSummary } from './ScoreSummary';
export type { AssessmentRecord } from './ScoreSummary';

export type { AssessmentType } from './ScoreHistory';
