import { renderHook, act } from '@testing-library/react';
import { useDebounce, useDebouncedCallback } from '../useDebounce';

describe('useDebounce', () => {
  it('debounces value updates', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'start', delay: 200 } }
    );

    expect(result.current).toBe('start');
    rerender({ value: 'next', delay: 200 });
    expect(result.current).toBe('start');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('next');
    vi.useRealTimers();
  });

  it('debounces callbacks', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('first');
      result.current('second');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
    vi.useRealTimers();
  });
});
