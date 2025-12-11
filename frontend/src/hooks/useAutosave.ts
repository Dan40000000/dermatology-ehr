import { useEffect, useRef, useState, useCallback } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

interface UseAutosaveReturn {
  status: AutosaveStatus;
  lastSaved: Date | null;
  saveNow: () => Promise<void>;
  error: string | null;
}

export function useAutosave<T>({
  data,
  onSave,
  delay = 3000,
  enabled = true,
}: UseAutosaveOptions<T>): UseAutosaveReturn {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<T>(data);
  const isFirstRender = useRef(true);
  const isSaving = useRef(false);

  // Update data ref when data changes
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Save function
  const saveNow = useCallback(async () => {
    if (isSaving.current) {
      return;
    }

    try {
      isSaving.current = true;
      setStatus('saving');
      setError(null);

      await onSave(dataRef.current);

      setStatus('saved');
      setLastSaved(new Date());

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to save');
      console.error('Autosave error:', err);
    } finally {
      isSaving.current = false;
    }
  }, [onSave]);

  // Debounced autosave effect
  useEffect(() => {
    // Skip autosave on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Skip if disabled
    if (!enabled) {
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      saveNow();
    }, delay);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, saveNow]);

  return {
    status,
    lastSaved,
    saveNow,
    error,
  };
}
