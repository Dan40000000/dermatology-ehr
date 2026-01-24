import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

// ================================================
// TYPES
// ================================================

export type MetricEventType = 'click' | 'navigation' | 'task_start' | 'task_end' | 'page_load';

export interface MetricEvent {
  eventType: MetricEventType;
  eventTarget?: string;
  eventValue?: string;
  eventMetadata?: Record<string, unknown>;
  page?: string;
  patientId?: string;
  encounterId?: string;
  durationMs?: number;
  deviceType?: string;
  browser?: string;
}

export interface TaskTimer {
  taskName: string;
  startTime: number;
  context?: {
    page?: string;
    patientId?: string;
    encounterId?: string;
  };
}

export interface EncounterMetrics {
  encounterId: string;
  startTime: number;
  clicks: number;
  pageViews: number;
  navigationCount: number;
  sectionTimes: {
    notes: number;
    orders: number;
    photos: number;
    prescriptions: number;
    billing: number;
    procedures: number;
  };
  lastSection?: string;
  lastSectionStartTime?: number;
}

interface MetricsContextValue {
  // Tracking methods
  trackClick: (elementId: string, action?: string, metadata?: Record<string, unknown>) => void;
  trackNavigation: (from: string, to: string) => void;
  startTask: (taskName: string, context?: TaskTimer['context']) => void;
  endTask: (taskName: string) => void;
  trackPageLoad: (page: string, loadTimeMs: number) => void;

  // Encounter tracking
  startEncounter: (encounterId: string, patientId: string) => void;
  endEncounter: (encounterId: string) => void;
  updateEncounterSection: (encounterId: string, section: string) => void;

  // Current metrics
  currentEncounterMetrics?: EncounterMetrics;
  sessionId: string;

  // Stats
  isOnline: boolean;
  pendingEvents: number;
}

// ================================================
// CONTEXT
// ================================================

export const MetricsContext = createContext<MetricsContextValue | null>(null);

const STORAGE_KEY = 'derm_metrics_pending';
const BATCH_SIZE = 50;
const BATCH_INTERVAL = 30000; // 30 seconds
const RETRY_DELAY = 60000; // 1 minute

// ================================================
// PROVIDER
// ================================================

export function MetricsProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingEvents, setPendingEvents] = useState<MetricEvent[]>([]);
  const [currentEncounter, setCurrentEncounter] = useState<EncounterMetrics | undefined>();
  const [activeTasks, setActiveTasks] = useState<Map<string, TaskTimer>>(new Map());

  const batchTimerRef = useRef<NodeJS.Timeout>();
  const retryTimerRef = useRef<NodeJS.Timeout>();

  // ================================================
  // DEVICE & BROWSER DETECTION
  // ================================================

  const getDeviceType = useCallback((): string => {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }, []);

  const getBrowser = useCallback((): string => {
    const ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    if (ua.indexOf('Edge') > -1) return 'Edge';
    return 'Other';
  }, []);

  // ================================================
  // STORAGE HELPERS
  // ================================================

  const loadPendingEvents = useCallback((): MetricEvent[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load pending metrics:', error);
    }
    return [];
  }, []);

  const savePendingEvents = useCallback((events: MetricEvent[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('Failed to save pending metrics:', error);
    }
  }, []);

  // ================================================
  // API COMMUNICATION
  // ================================================

  const sendMetrics = useCallback(async (events: MetricEvent[]) => {
    if (!session || !user || events.length === 0) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/metrics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
        body: JSON.stringify({
          sessionId,
          events: events.map(event => ({
            ...event,
            userId: user.id,
            tenantId: session.tenantId,
            timestamp: new Date().toISOString(),
            deviceType: event.deviceType || getDeviceType(),
            browser: event.browser || getBrowser(),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send metrics: ${response.statusText}`);
      }

      // Remove sent events from pending
      setPendingEvents(prev => {
        const remaining = prev.filter(e => !events.includes(e));
        savePendingEvents(remaining);
        return remaining;
      });
    } catch (error) {
      console.error('Failed to send metrics:', error);
      // Events remain in pending queue for retry
    }
  }, [session, user, sessionId, getDeviceType, getBrowser, savePendingEvents]);

  // ================================================
  // BATCH PROCESSING
  // ================================================

  const processBatch = useCallback(() => {
    if (pendingEvents.length === 0) return;

    const batch = pendingEvents.slice(0, BATCH_SIZE);
    if (isOnline) {
      sendMetrics(batch);
    }
  }, [pendingEvents, isOnline, sendMetrics]);

  // Setup batch timer
  useEffect(() => {
    batchTimerRef.current = setInterval(processBatch, BATCH_INTERVAL);
    return () => {
      if (batchTimerRef.current) {
        clearInterval(batchTimerRef.current);
      }
    };
  }, [processBatch]);

  // Setup retry timer when offline
  useEffect(() => {
    if (!isOnline && pendingEvents.length > 0) {
      retryTimerRef.current = setInterval(() => {
        if (navigator.onLine) {
          setIsOnline(true);
          processBatch();
        }
      }, RETRY_DELAY);
    }
    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
      }
    };
  }, [isOnline, pendingEvents.length, processBatch]);

  // Load pending events on mount
  useEffect(() => {
    const loaded = loadPendingEvents();
    if (loaded.length > 0) {
      setPendingEvents(loaded);
    }
  }, [loadPendingEvents]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processBatch();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processBatch]);

  // ================================================
  // TRACKING METHODS
  // ================================================

  const addEvent = useCallback((event: MetricEvent) => {
    setPendingEvents(prev => {
      const updated = [...prev, event];
      savePendingEvents(updated);
      return updated;
    });

    // Update encounter metrics if applicable
    if (event.encounterId && currentEncounter?.encounterId === event.encounterId) {
      setCurrentEncounter(prev => {
        if (!prev) return prev;

        const updated = { ...prev };

        if (event.eventType === 'click') {
          updated.clicks++;
        } else if (event.eventType === 'navigation') {
          updated.navigationCount++;
        } else if (event.eventType === 'page_load') {
          updated.pageViews++;
        }

        return updated;
      });
    }
  }, [currentEncounter, savePendingEvents]);

  const trackClick = useCallback((elementId: string, action?: string, metadata?: Record<string, unknown>) => {
    addEvent({
      eventType: 'click',
      eventTarget: elementId,
      eventValue: action,
      eventMetadata: metadata,
      page: window.location.pathname,
      encounterId: currentEncounter?.encounterId,
    });
  }, [addEvent, currentEncounter]);

  const trackNavigation = useCallback((from: string, to: string) => {
    addEvent({
      eventType: 'navigation',
      eventTarget: to,
      eventValue: from,
      page: to,
      encounterId: currentEncounter?.encounterId,
    });
  }, [addEvent, currentEncounter]);

  const startTask = useCallback((taskName: string, context?: TaskTimer['context']) => {
    const timer: TaskTimer = {
      taskName,
      startTime: Date.now(),
      context,
    };

    setActiveTasks(prev => new Map(prev).set(taskName, timer));

    addEvent({
      eventType: 'task_start',
      eventTarget: taskName,
      page: context?.page || window.location.pathname,
      patientId: context?.patientId,
      encounterId: context?.encounterId || currentEncounter?.encounterId,
    });
  }, [addEvent, currentEncounter]);

  const endTask = useCallback((taskName: string) => {
    const timer = activeTasks.get(taskName);
    if (!timer) return;

    const duration = Date.now() - timer.startTime;

    setActiveTasks(prev => {
      const updated = new Map(prev);
      updated.delete(taskName);
      return updated;
    });

    addEvent({
      eventType: 'task_end',
      eventTarget: taskName,
      durationMs: duration,
      page: timer.context?.page || window.location.pathname,
      patientId: timer.context?.patientId,
      encounterId: timer.context?.encounterId || currentEncounter?.encounterId,
    });
  }, [activeTasks, addEvent, currentEncounter]);

  const trackPageLoad = useCallback((page: string, loadTimeMs: number) => {
    addEvent({
      eventType: 'page_load',
      eventTarget: page,
      durationMs: loadTimeMs,
      page,
      encounterId: currentEncounter?.encounterId,
    });
  }, [addEvent, currentEncounter]);

  // ================================================
  // ENCOUNTER TRACKING
  // ================================================

  const startEncounter = useCallback((encounterId: string, patientId: string) => {
    const metrics: EncounterMetrics = {
      encounterId,
      startTime: Date.now(),
      clicks: 0,
      pageViews: 0,
      navigationCount: 0,
      sectionTimes: {
        notes: 0,
        orders: 0,
        photos: 0,
        prescriptions: 0,
        billing: 0,
        procedures: 0,
      },
    };

    setCurrentEncounter(metrics);

    addEvent({
      eventType: 'task_start',
      eventTarget: 'encounter',
      page: window.location.pathname,
      patientId,
      encounterId,
    });
  }, [addEvent]);

  const updateEncounterSection = useCallback((encounterId: string, section: string) => {
    setCurrentEncounter(prev => {
      if (!prev || prev.encounterId !== encounterId) return prev;

      const now = Date.now();
      const updated = { ...prev };

      // Record time for previous section
      if (prev.lastSection && prev.lastSectionStartTime) {
        const sectionTime = now - prev.lastSectionStartTime;
        const sectionKey = prev.lastSection as keyof EncounterMetrics['sectionTimes'];
        if (sectionKey in updated.sectionTimes) {
          updated.sectionTimes[sectionKey] += sectionTime;
        }
      }

      updated.lastSection = section;
      updated.lastSectionStartTime = now;

      return updated;
    });
  }, []);

  const endEncounter = useCallback((encounterId: string) => {
    if (!currentEncounter || currentEncounter.encounterId !== encounterId) return;

    const duration = Date.now() - currentEncounter.startTime;

    // Record final section time
    if (currentEncounter.lastSection && currentEncounter.lastSectionStartTime) {
      const sectionTime = Date.now() - currentEncounter.lastSectionStartTime;
      const sectionKey = currentEncounter.lastSection as keyof EncounterMetrics['sectionTimes'];
      if (sectionKey in currentEncounter.sectionTimes) {
        currentEncounter.sectionTimes[sectionKey] += sectionTime;
      }
    }

    addEvent({
      eventType: 'task_end',
      eventTarget: 'encounter',
      durationMs: duration,
      encounterId,
      eventMetadata: {
        clicks: currentEncounter.clicks,
        pageViews: currentEncounter.pageViews,
        navigationCount: currentEncounter.navigationCount,
        sectionTimes: currentEncounter.sectionTimes,
      },
    });

    setCurrentEncounter(undefined);
  }, [currentEncounter, addEvent]);

  // ================================================
  // CLEANUP
  // ================================================

  // Send remaining events on unmount
  useEffect(() => {
    return () => {
      if (pendingEvents.length > 0 && isOnline) {
        // Use sendBeacon for reliable event sending on page unload
        const apiUrl = `${API_BASE_URL}/api/metrics/events`;
        const data = JSON.stringify({
          sessionId,
          events: pendingEvents.map(event => ({
            ...event,
            userId: user?.id,
            tenantId: session?.tenantId,
            timestamp: new Date().toISOString(),
            deviceType: getDeviceType(),
            browser: getBrowser(),
          })),
        });

        navigator.sendBeacon(apiUrl, data);
      }
    };
  }, []); // Only run on unmount

  // ================================================
  // RENDER
  // ================================================

  return (
    <MetricsContext.Provider
      value={{
        trackClick,
        trackNavigation,
        startTask,
        endTask,
        trackPageLoad,
        startEncounter,
        endEncounter,
        updateEncounterSection,
        currentEncounterMetrics: currentEncounter,
        sessionId,
        isOnline,
        pendingEvents: pendingEvents.length,
      }}
    >
      {children}
    </MetricsContext.Provider>
  );
}

// ================================================
// HOOK
// ================================================

export function useMetricsContext() {
  const context = useContext(MetricsContext);
  if (!context) {
    throw new Error('useMetricsContext must be used within a MetricsProvider');
  }
  return context;
}
