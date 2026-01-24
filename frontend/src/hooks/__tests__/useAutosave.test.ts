import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutosave } from '../useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with idle status', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 3000,
      })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.lastSaved).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should not autosave on first render', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 1000,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('should autosave after delay when data changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          delay: 1000,
        }),
      {
        initialProps: { data: { test: 'initial' } },
      }
    );

    // Change data
    rerender({ data: { test: 'updated' } });

    expect(result.current.status).toBe('idle');

    // Wait for debounce delay
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({ test: 'updated' });
    expect(result.current.status).toBe('saved');

    // Status should reset to idle after 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('idle');
  });

  it('should debounce multiple rapid changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          delay: 1000,
        }),
      {
        initialProps: { data: { test: 'initial' } },
      }
    );

    // Multiple rapid changes
    rerender({ data: { test: 'change1' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    rerender({ data: { test: 'change2' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    rerender({ data: { test: 'change3' } });

    // Wait for final debounce
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ test: 'change3' });
  });

  it('should handle manual save with saveNow', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 3000,
      })
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(onSave).toHaveBeenCalledWith({ test: 'data' });
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });

  it('should handle save errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    const { result } = renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 1000,
      })
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Save failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Autosave error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('should not autosave when disabled', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          delay: 1000,
          enabled: false,
        }),
      {
        initialProps: { data: { test: 'initial' } },
      }
    );

    rerender({ data: { test: 'updated' } });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('should prevent concurrent saves', async () => {
    let resolveFirstSave: () => void;
    const firstSavePromise = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });

    const onSave = vi.fn().mockImplementation(() => firstSavePromise);
    const { result } = renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 1000,
      })
    );

    // Start first save
    act(() => {
      result.current.saveNow();
    });

    // Try to start second save while first is in progress
    act(() => {
      result.current.saveNow();
    });

    // Should only call onSave once
    expect(onSave).toHaveBeenCalledTimes(1);

    // Resolve first save
    await act(async () => {
      resolveFirstSave!();
      await firstSavePromise;
    });
  });

  it('should update lastSaved timestamp on successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave({
        data: { test: 'data' },
        onSave,
        delay: 1000,
      })
    );

    expect(result.current.lastSaved).toBeNull();

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.lastSaved).toBeInstanceOf(Date);
    expect(result.current.lastSaved!.getTime()).toBeCloseTo(Date.now(), -2);
  });

  it('should use custom delay', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          delay: 5000,
        }),
      {
        initialProps: { data: { test: 'initial' } },
      }
    );

    rerender({ data: { test: 'updated' } });

    // Should not save after 3 seconds
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Should save after 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onSave).toHaveBeenCalled();
  });
});
