import { useCallback, useEffect, useRef } from 'react';
import { useMetricsContext } from '../components/Metrics/MetricsProvider';

// ================================================
// HOOK: useMetrics
// ================================================
// Convenience hook for components to track metrics
// Provides easy-to-use methods for common tracking scenarios

export interface UseMetricsOptions {
  // Automatically track page views when component mounts
  trackPageView?: boolean;

  // Automatically track component mount/unmount as a task
  trackComponentLifecycle?: boolean;
  componentName?: string;

  // Context for all events from this hook
  page?: string;
  patientId?: string;
  encounterId?: string;
}

export function useMetrics(options: UseMetricsOptions = {}) {
  const {
    trackClick: contextTrackClick,
    trackNavigation: contextTrackNavigation,
    startTask: contextStartTask,
    endTask: contextEndTask,
    trackPageLoad: contextTrackPageLoad,
    currentEncounterMetrics,
    sessionId,
    isOnline,
    pendingEvents,
  } = useMetricsContext();

  const mountTimeRef = useRef<number>();
  const pageLoadStartRef = useRef<number>();

  // ================================================
  // ENHANCED TRACKING METHODS
  // ================================================

  // Track clicks with automatic context injection
  const trackClick = useCallback((
    elementId: string,
    action?: string,
    metadata?: Record<string, unknown>
  ) => {
    contextTrackClick(elementId, action, {
      ...metadata,
      page: options.page || window.location.pathname,
      patientId: options.patientId,
      encounterId: options.encounterId,
    });
  }, [contextTrackClick, options.page, options.patientId, options.encounterId]);

  // Track button clicks specifically
  const trackButtonClick = useCallback((
    buttonId: string,
    buttonLabel?: string,
    metadata?: Record<string, unknown>
  ) => {
    trackClick(buttonId, 'button_click', {
      ...metadata,
      label: buttonLabel,
    });
  }, [trackClick]);

  // Track form submissions
  const trackFormSubmit = useCallback((
    formId: string,
    formData?: Record<string, unknown>
  ) => {
    trackClick(formId, 'form_submit', formData);
  }, [trackClick]);

  // Track input changes (debounced)
  const trackInputChange = useCallback((
    inputId: string,
    inputValue?: string | number
  ) => {
    trackClick(inputId, 'input_change', {
      value: inputValue,
    });
  }, [trackClick]);

  // Track modal open/close
  const trackModalOpen = useCallback((modalId: string, metadata?: Record<string, unknown>) => {
    trackClick(modalId, 'modal_open', metadata);
  }, [trackClick]);

  const trackModalClose = useCallback((modalId: string, metadata?: Record<string, unknown>) => {
    trackClick(modalId, 'modal_close', metadata);
  }, [trackClick]);

  // Track navigation with context
  const trackNavigation = useCallback((from: string, to: string) => {
    contextTrackNavigation(from, to);
  }, [contextTrackNavigation]);

  // Track tasks with context
  const startTask = useCallback((taskName: string) => {
    contextStartTask(taskName, {
      page: options.page || window.location.pathname,
      patientId: options.patientId,
      encounterId: options.encounterId,
    });
  }, [contextStartTask, options.page, options.patientId, options.encounterId]);

  const endTask = useCallback((taskName: string) => {
    contextEndTask(taskName);
  }, [contextEndTask]);

  // Track page load with context
  const trackPageLoad = useCallback((page: string, loadTimeMs: number) => {
    contextTrackPageLoad(page, loadTimeMs);
  }, [contextTrackPageLoad]);

  // ================================================
  // SPECIALIZED TRACKING METHODS
  // ================================================

  // Track search queries
  const trackSearch = useCallback((
    searchTerm: string,
    resultCount?: number,
    metadata?: Record<string, unknown>
  ) => {
    trackClick('search', 'search_query', {
      ...metadata,
      searchTerm,
      resultCount,
    });
  }, [trackClick]);

  // Track filter usage
  const trackFilter = useCallback((
    filterName: string,
    filterValue: unknown,
    metadata?: Record<string, unknown>
  ) => {
    trackClick(`filter_${filterName}`, 'filter_apply', {
      ...metadata,
      filterName,
      filterValue,
    });
  }, [trackClick]);

  // Track sort changes
  const trackSort = useCallback((
    sortField: string,
    sortDirection: 'asc' | 'desc',
    metadata?: Record<string, unknown>
  ) => {
    trackClick('sort', 'sort_change', {
      ...metadata,
      sortField,
      sortDirection,
    });
  }, [trackClick]);

  // Track tab changes
  const trackTabChange = useCallback((
    tabName: string,
    previousTab?: string,
    metadata?: Record<string, unknown>
  ) => {
    trackClick(`tab_${tabName}`, 'tab_change', {
      ...metadata,
      tabName,
      previousTab,
    });
  }, [trackClick]);

  // Track feature usage
  const trackFeatureUse = useCallback((
    featureName: string,
    metadata?: Record<string, unknown>
  ) => {
    trackClick(featureName, 'feature_use', metadata);
  }, [trackClick]);

  // Track errors
  const trackError = useCallback((
    errorType: string,
    errorMessage?: string,
    metadata?: Record<string, unknown>
  ) => {
    trackClick('error', errorType, {
      ...metadata,
      errorMessage,
    });
  }, [trackClick]);

  // Track AI feature usage
  const trackAIFeature = useCallback((
    featureName: string,
    success: boolean,
    timeSavedSeconds?: number,
    metadata?: Record<string, unknown>
  ) => {
    trackClick(`ai_${featureName}`, success ? 'ai_success' : 'ai_failure', {
      ...metadata,
      timeSavedSeconds,
    });
  }, [trackClick]);

  // Track document uploads
  const trackDocumentUpload = useCallback((
    documentType: string,
    fileSize?: number,
    metadata?: Record<string, unknown>
  ) => {
    trackClick('document_upload', documentType, {
      ...metadata,
      fileSize,
    });
  }, [trackClick]);

  // Track photo capture
  const trackPhotoCapture = useCallback((
    photoType: string,
    bodyLocation?: string,
    metadata?: Record<string, unknown>
  ) => {
    trackClick('photo_capture', photoType, {
      ...metadata,
      bodyLocation,
    });
  }, [trackClick]);

  // Track prescription writing
  const trackPrescription = useCallback((
    medicationName: string,
    isERx: boolean,
    metadata?: Record<string, unknown>
  ) => {
    trackClick('prescription', isERx ? 'erx' : 'print', {
      ...metadata,
      medicationName,
    });
  }, [trackClick]);

  // Track order placement
  const trackOrder = useCallback((
    orderType: string,
    orderDetails?: Record<string, unknown>
  ) => {
    trackClick('order', orderType, orderDetails);
  }, [trackClick]);

  // ================================================
  // TIMING HELPERS
  // ================================================

  // Start a timer and return a function to end it
  const startTimer = useCallback((taskName: string) => {
    const startTime = Date.now();
    startTask(taskName);

    return () => {
      const duration = Date.now() - startTime;
      endTask(taskName);
      return duration;
    };
  }, [startTask, endTask]);

  // Measure async function execution
  const measureAsync = useCallback(async <T,>(
    taskName: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const endTimer = startTimer(taskName);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  }, [startTimer]);

  // Measure sync function execution
  const measureSync = useCallback(<T,>(
    taskName: string,
    fn: () => T
  ): T => {
    const endTimer = startTimer(taskName);
    try {
      const result = fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  }, [startTimer]);

  // ================================================
  // AUTOMATIC TRACKING
  // ================================================

  // Track page view on mount
  useEffect(() => {
    if (options.trackPageView) {
      const page = options.page || window.location.pathname;
      const loadTime = pageLoadStartRef.current
        ? Date.now() - pageLoadStartRef.current
        : 0;

      if (loadTime > 0) {
        trackPageLoad(page, loadTime);
      }
    }
  }, [options.trackPageView, options.page, trackPageLoad]);

  // Track component lifecycle
  useEffect(() => {
    if (options.trackComponentLifecycle && options.componentName) {
      mountTimeRef.current = Date.now();
      startTask(`component_${options.componentName}`);

      return () => {
        endTask(`component_${options.componentName}`);
      };
    }
  }, [options.trackComponentLifecycle, options.componentName, startTask, endTask]);

  // Record page load start time
  useEffect(() => {
    pageLoadStartRef.current = Date.now();
  }, []);

  // ================================================
  // RETURN API
  // ================================================

  return {
    // Basic tracking
    trackClick,
    trackNavigation,
    startTask,
    endTask,
    trackPageLoad,

    // Enhanced tracking
    trackButtonClick,
    trackFormSubmit,
    trackInputChange,
    trackModalOpen,
    trackModalClose,

    // Specialized tracking
    trackSearch,
    trackFilter,
    trackSort,
    trackTabChange,
    trackFeatureUse,
    trackError,
    trackAIFeature,
    trackDocumentUpload,
    trackPhotoCapture,
    trackPrescription,
    trackOrder,

    // Timing helpers
    startTimer,
    measureAsync,
    measureSync,

    // State
    currentEncounterMetrics,
    sessionId,
    isOnline,
    pendingEvents,
  };
}

// ================================================
// HOOK: usePageMetrics
// ================================================
// Automatically track page-level metrics

export function usePageMetrics(pageName: string, patientId?: string, encounterId?: string) {
  const metrics = useMetrics({
    trackPageView: true,
    page: pageName,
    patientId,
    encounterId,
  });

  return metrics;
}

// ================================================
// HOOK: useEncounterMetrics
// ================================================
// Track metrics for a specific encounter

export function useEncounterMetrics(encounterId: string, patientId: string) {
  const { startEncounter, endEncounter, updateEncounterSection } = useMetricsContext();

  const metrics = useMetrics({
    encounterId,
    patientId,
  });

  // Start encounter on mount
  useEffect(() => {
    startEncounter(encounterId, patientId);

    return () => {
      endEncounter(encounterId);
    };
  }, [encounterId, patientId, startEncounter, endEncounter]);

  // Track section changes
  const trackSection = useCallback((section: string) => {
    updateEncounterSection(encounterId, section);
  }, [encounterId, updateEncounterSection]);

  return {
    ...metrics,
    trackSection,
  };
}

// ================================================
// HOOK: useFormMetrics
// ================================================
// Track form interaction metrics

export function useFormMetrics(formId: string, formName?: string) {
  const metrics = useMetrics();
  const interactionCountRef = useRef(0);

  const trackFormStart = useCallback(() => {
    metrics.startTask(`form_${formId}`);
  }, [metrics, formId]);

  const trackFormComplete = useCallback(() => {
    metrics.endTask(`form_${formId}`);
    metrics.trackFormSubmit(formId, {
      formName,
      interactionCount: interactionCountRef.current,
    });
  }, [metrics, formId, formName]);

  const trackFormAbandon = useCallback(() => {
    metrics.endTask(`form_${formId}`);
    metrics.trackClick(formId, 'form_abandon', {
      formName,
      interactionCount: interactionCountRef.current,
    });
  }, [metrics, formId, formName]);

  const trackFieldInteraction = useCallback(() => {
    interactionCountRef.current++;
  }, []);

  // Start tracking on mount
  useEffect(() => {
    trackFormStart();
  }, [trackFormStart]);

  return {
    trackFormComplete,
    trackFormAbandon,
    trackFieldInteraction,
    ...metrics,
  };
}
