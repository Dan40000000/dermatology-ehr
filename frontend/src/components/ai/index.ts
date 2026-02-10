// AI Lesion Analysis Components
// PROVIDER-ONLY feature for AI-powered lesion image analysis

export { default as AIAnalysisButton } from './AIAnalysisButton';
export { default as AIAnalysisResults } from './AIAnalysisResults';
export { default as DifferentialList } from './DifferentialList';
export { default as RiskBadge } from './RiskBadge';
export { default as ABCDEAutoScore } from './ABCDEAutoScore';
export { default as FeedbackForm } from './FeedbackForm';
export { default as AIComparisonView } from './AIComparisonView';

// Re-export types
export type {
  AIAnalysisResult,
  DifferentialDiagnosis,
  ABCDEFeatureScore,
  ABCDEScores,
  DermoscopyPatterns,
} from './AIAnalysisButton';
