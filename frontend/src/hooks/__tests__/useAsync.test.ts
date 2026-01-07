import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const errorMocks = vi.hoisted(() => ({
  getErrorMessage: vi.fn((error: unknown) => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }),
  logError: vi.fn(),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../utils/errorHandling', () => ({
  getErrorMessage: errorMocks.getErrorMessage,
  logError: errorMocks.logError,
}));

import { useAsync, useFormSubmit, useFetch } from '../useAsync';

describe('useAsync', () => {
  beforeEach(() => {
    toastMocks.showSuccess.mockReset();
    toastMocks.showError.mockReset();
    errorMocks.getErrorMessage.mockClear();
    errorMocks.logError.mockClear();
  });

  it('handles success and error states', async () => {
    const { result } = renderHook(() =>
      useAsync<string>({ showSuccessToast: true, showErrorToast: true })
    );

    await act(async () => {
      await result.current.execute(async () => 'ok');
    });

    expect(result.current.data).toBe('ok');
    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(true);
    expect(toastMocks.showSuccess).toHaveBeenCalled();

    await act(async () => {
      await result.current.execute(async () => {
        throw new Error('fail');
      });
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('fail');
    expect(result.current.isSuccess).toBe(false);
    expect(toastMocks.showError).toHaveBeenCalledWith('fail');
    expect(errorMocks.logError).toHaveBeenCalled();
  });

  it('supports reset, setData, and setError helpers', () => {
    const { result } = renderHook(() => useAsync<string>({ showErrorToast: false }));

    act(() => {
      result.current.setData('value');
    });
    expect(result.current.data).toBe('value');

    act(() => {
      result.current.setError('bad');
    });
    expect(result.current.error).toBe('bad');
    expect(result.current.isSuccess).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useFormSubmit', () => {
  it('tracks submitting state', async () => {
    const { result } = renderHook(() => useFormSubmit<string>());

    let resolveFn: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveFn = resolve;
    });

    act(() => {
      result.current.submit(() => pending);
    });

    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      resolveFn('done');
      await pending;
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.data).toBe('done');
  });
});

describe('useFetch', () => {
  it('tracks retries and canRetry', async () => {
    const { result } = renderHook(() => useFetch<string>());

    await act(async () => {
      await result.current.fetch(async () => 'ok');
    });
    expect(result.current.retryCount).toBe(0);
    expect(result.current.canRetry).toBe(false);

    await act(async () => {
      await result.current.refetch(async () => 'ok');
    });
    expect(result.current.retryCount).toBe(1);

    await act(async () => {
      await result.current.fetch(async () => {
        throw new Error('fail');
      });
    });

    expect(result.current.error).toBe('fail');
    expect(result.current.canRetry).toBe(true);
  });
});
