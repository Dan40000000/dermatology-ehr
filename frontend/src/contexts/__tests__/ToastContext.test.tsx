import { render, screen, renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from '../ToastContext';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw error when useToast is used outside ToastProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useToast());
    }).toThrow('useToast must be used within a ToastProvider');

    consoleErrorSpy.mockRestore();
  });

  it('should provide initial state with empty toasts', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    expect(result.current.toasts).toEqual([]);
  });

  it('should show a toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    let toastId: number;

    act(() => {
      toastId = result.current.showToast('Test message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      id: toastId!,
      message: 'Test message',
      type: 'ok',
    });
  });

  it('should show success toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showSuccess('Success message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Success message',
      type: 'ok',
    });
  });

  it('should show error toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showError('Error message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Error message',
      type: 'error',
      duration: 6000,
    });
  });

  it('should show warning toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showWarning('Warning message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Warning message',
      type: 'warning',
      duration: 5000,
    });
  });

  it('should show info toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showInfo('Info message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Info message',
      type: 'info',
    });
  });

  it('should auto-dismiss toast after duration', async () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showToast('Test message', 'ok', { duration: 2000 });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(result.current.toasts).toHaveLength(0);
    });
  });

  it('should not auto-dismiss persistent toast', async () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showToast('Persistent message', 'ok', { persistent: true });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('should dismiss toast manually', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    let toastId: number;

    act(() => {
      toastId = result.current.showToast('Test message');
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismissToast(toastId!);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should dismiss all toasts', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    act(() => {
      result.current.showToast('Message 1');
      result.current.showToast('Message 2');
      result.current.showToast('Message 3');
    });

    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.dismissAll();
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should return unique IDs for each toast', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    let id1: number, id2: number, id3: number;

    act(() => {
      id1 = result.current.showToast('Message 1');
      id2 = result.current.showToast('Message 2');
      id3 = result.current.showToast('Message 3');
    });

    expect(id1!).not.toBe(id2!);
    expect(id2!).not.toBe(id3!);
    expect(id1!).not.toBe(id3!);
  });

  it('should support toast with action button', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    const actionFn = vi.fn();

    act(() => {
      result.current.showToast('Message with action', 'ok', {
        action: {
          label: 'Undo',
          onClick: actionFn,
        },
      });
    });

    expect(result.current.toasts[0].action).toEqual({
      label: 'Undo',
      onClick: actionFn,
    });
  });

  it('should render toast container with toasts', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        render(<ToastProvider>{children}</ToastProvider>);
        return <div />;
      },
    });

    act(() => {
      result.current.showToast('Test message');
    });

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should apply correct CSS class based on toast type', () => {
    const { result, rerender } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        render(<ToastProvider>{children}</ToastProvider>);
        return <div />;
      },
    });

    act(() => {
      result.current.showSuccess('Success');
    });

    const successToast = screen.getByText('Success').parentElement;
    expect(successToast).toHaveClass('toast', 'ok');

    act(() => {
      result.current.dismissAll();
    });

    act(() => {
      result.current.showError('Error');
    });

    const errorToast = screen.getByText('Error').parentElement;
    expect(errorToast).toHaveClass('toast', 'error');
  });

  it('should dismiss toast on click if not persistent', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByRole('button', { name: 'Show Toast' });
    await user.click(button);

    const toast = screen.getByText('Clickable toast');
    expect(toast).toBeInTheDocument();

    await user.click(toast);

    await waitFor(() => {
      expect(screen.queryByText('Clickable toast')).not.toBeInTheDocument();
    });
  });

  it('should not dismiss persistent toast on click', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponentPersistent />
      </ToastProvider>
    );

    const button = screen.getByRole('button', { name: 'Show Persistent Toast' });
    await user.click(button);

    const toast = screen.getByText('Persistent toast');
    expect(toast).toBeInTheDocument();

    await user.click(toast);

    expect(screen.getByText('Persistent toast')).toBeInTheDocument();
  });

  it('should render action button and call action on click', async () => {
    const user = userEvent.setup({ delay: null });
    const actionFn = vi.fn();

    render(
      <ToastProvider>
        <TestComponentWithAction actionFn={actionFn} />
      </ToastProvider>
    );

    const button = screen.getByRole('button', { name: 'Show Toast With Action' });
    await user.click(button);

    const actionButton = screen.getByRole('button', { name: 'Undo' });
    await user.click(actionButton);

    expect(actionFn).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText('Toast with action')).not.toBeInTheDocument();
    });
  });

  it('should render close button for persistent toast', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponentPersistent />
      </ToastProvider>
    );

    const button = screen.getByRole('button', { name: 'Show Persistent Toast' });
    await user.click(button);

    const closeButton = screen.getByLabelText('Dismiss');
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Persistent toast')).not.toBeInTheDocument();
    });
  });

  it('should provide all context methods', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      ),
    });

    expect(result.current).toHaveProperty('toasts');
    expect(result.current).toHaveProperty('showToast');
    expect(result.current).toHaveProperty('showSuccess');
    expect(result.current).toHaveProperty('showError');
    expect(result.current).toHaveProperty('showWarning');
    expect(result.current).toHaveProperty('showInfo');
    expect(result.current).toHaveProperty('dismissToast');
    expect(result.current).toHaveProperty('dismissAll');

    expect(typeof result.current.showToast).toBe('function');
    expect(typeof result.current.showSuccess).toBe('function');
    expect(typeof result.current.showError).toBe('function');
    expect(typeof result.current.showWarning).toBe('function');
    expect(typeof result.current.showInfo).toBe('function');
    expect(typeof result.current.dismissToast).toBe('function');
    expect(typeof result.current.dismissAll).toBe('function');
  });
});

// Test components
function TestComponent() {
  const { showToast } = useToast();

  return (
    <button onClick={() => showToast('Clickable toast')}>Show Toast</button>
  );
}

function TestComponentPersistent() {
  const { showToast } = useToast();

  return (
    <button onClick={() => showToast('Persistent toast', 'ok', { persistent: true })}>
      Show Persistent Toast
    </button>
  );
}

function TestComponentWithAction({ actionFn }: { actionFn: () => void }) {
  const { showToast } = useToast();

  return (
    <button
      onClick={() =>
        showToast('Toast with action', 'ok', {
          action: {
            label: 'Undo',
            onClick: actionFn,
          },
        })
      }
    >
      Show Toast With Action
    </button>
  );
}
