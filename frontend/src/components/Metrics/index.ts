/**
 * Metrics Tracking System
 *
 * Export all metrics-related components, hooks, and types
 */

// Components
export { MetricsProvider, useMetricsContext } from './MetricsProvider';
export { EfficiencyBadge } from './EfficiencyBadge';
export { EncounterSummary } from './EncounterSummary';

// Re-export hooks for convenience
export {
  useMetrics,
  usePageMetrics,
  useEncounterMetrics,
  useFormMetrics,
} from '../../hooks/useMetrics';

// Types
export type {
  MetricEventType,
  MetricEvent,
  TaskTimer,
  EncounterMetrics,
} from './MetricsProvider';

export type {
  UseMetricsOptions,
} from '../../hooks/useMetrics';
