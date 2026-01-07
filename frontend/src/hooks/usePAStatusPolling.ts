import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { checkPARequestStatus } from '../api';

interface UsePAStatusPollingOptions {
  paRequestId: string | null;
  enabled?: boolean;
  interval?: number; // in milliseconds
  onStatusChange?: (newStatus: any) => void;
}

/**
 * Hook to poll PA request status at regular intervals
 * Useful for checking if a submitted PA has been approved/denied
 */
export function usePAStatusPolling({
  paRequestId,
  enabled = true,
  interval = 30000, // 30 seconds default
  onStatusChange,
}: UsePAStatusPollingOptions) {
  const { session } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!session || !paRequestId || !enabled) return;

    try {
      const result = await checkPARequestStatus(session.tenantId, session.accessToken, paRequestId);

      // Only trigger callback if status changed
      if (result.status !== lastStatusRef.current) {
        lastStatusRef.current = result.status;
        onStatusChange?.(result);
      }
    } catch (error) {
      console.error('Failed to poll PA status:', error);
    }
  }, [session, paRequestId, enabled, onStatusChange]);

  useEffect(() => {
    if (!enabled || !paRequestId) {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkStatus();

    // Set up polling
    intervalRef.current = setInterval(checkStatus, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, paRequestId, interval, checkStatus]);

  return { checkStatus };
}
