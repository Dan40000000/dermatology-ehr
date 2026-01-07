/**
 * useAsync Hook
 * Manage async operations with loading, error, and success states
 */

import { useState, useCallback, useRef } from 'react';
import { getErrorMessage, logError } from '../utils/errorHandling';
import { useToast } from '../contexts/ToastContext';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isSuccess: boolean;
}

export interface AsyncOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: unknown) => void;
}

/**
 * Hook for managing async operations with loading/error states
 */
export function useAsync<T = any>(options: AsyncOptions = {}) {
  const {
    showSuccessToast = false,
    showErrorToast = true,
    successMessage,
    onSuccess,
    onError,
  } = options;

  const { showSuccess, showError } = useToast();
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
    isSuccess: false,
  });

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      // Abort any pending request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setState({
        data: null,
        loading: true,
        error: null,
        isSuccess: false,
      });

      try {
        const result = await asyncFunction();

        if (!isMountedRef.current) return null;

        setState({
          data: result,
          loading: false,
          error: null,
          isSuccess: true,
        });

        // Show success toast if enabled
        if (showSuccessToast) {
          const message = successMessage || 'Operation completed successfully';
          showSuccess(message);
        }

        // Call success callback
        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (error) {
        if (!isMountedRef.current) return null;

        const errorMessage = getErrorMessage(error);
        logError(error);

        setState({
          data: null,
          loading: false,
          error: errorMessage,
          isSuccess: false,
        });

        // Show error toast if enabled
        if (showErrorToast) {
          showError(errorMessage);
        }

        // Call error callback
        if (onError) {
          onError(error);
        }

        return null;
      }
    },
    [showSuccessToast, showErrorToast, successMessage, onSuccess, onError, showSuccess, showError]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      isSuccess: false,
    });
  }, []);

  const setData = useCallback((data: T) => {
    setState((prev) => ({
      ...prev,
      data,
    }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      error,
      loading: false,
      isSuccess: false,
    }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
    setError,
  };
}

/**
 * Hook for form submission with loading state and error handling
 */
export function useFormSubmit<T = any>(options: AsyncOptions = {}) {
  const asyncState = useAsync<T>({
    showSuccessToast: true,
    showErrorToast: true,
    ...options,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      setIsSubmitting(true);
      const result = await asyncState.execute(asyncFunction);
      setIsSubmitting(false);
      return result;
    },
    [asyncState]
  );

  return {
    ...asyncState,
    isSubmitting,
    submit,
  };
}

/**
 * Hook for data fetching with retry capability
 */
export function useFetch<T = any>(options: AsyncOptions & { retry?: boolean } = {}) {
  const { retry = true, ...asyncOptions } = options;
  const asyncState = useAsync<T>(asyncOptions);
  const [retryCount, setRetryCount] = useState(0);

  const fetch = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      return asyncState.execute(asyncFunction);
    },
    [asyncState]
  );

  const refetch = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      setRetryCount((prev) => prev + 1);
      return fetch(asyncFunction);
    },
    [fetch]
  );

  return {
    ...asyncState,
    fetch,
    refetch,
    retryCount,
    canRetry: retry && asyncState.error !== null,
  };
}

// Import React for hooks
import React from 'react';
