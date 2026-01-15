import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastType = 'ok' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
}

export interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => number;
  showSuccess: (message: string, options?: ToastOptions) => number;
  showError: (message: string, options?: ToastOptions) => number;
  showWarning: (message: string, options?: ToastOptions) => number;
  showInfo: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
  dismissAll: () => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((
    message: string,
    type: ToastType = 'ok',
    options: ToastOptions = {}
  ): number => {
    const id = ++toastId;
    const {
      duration = 4000,
      action,
      persistent = false,
    } = options;

    setToasts((prev) => [...prev, { id, message, type, duration, action, persistent }]);

    // Auto-dismiss after duration unless persistent
    if (!persistent && duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const showSuccess = useCallback((message: string, options?: ToastOptions): number => {
    return showToast(message, 'ok', options);
  }, [showToast]);

  const showError = useCallback((message: string, options?: ToastOptions): number => {
    return showToast(message, 'error', { duration: 6000, ...options });
  }, [showToast]);

  const showWarning = useCallback((message: string, options?: ToastOptions): number => {
    return showToast(message, 'warning', { duration: 5000, ...options });
  }, [showToast]);

  const showInfo = useCallback((message: string, options?: ToastOptions): number => {
    return showToast(message, 'info', options);
  }, [showToast]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        dismissToast,
        dismissAll,
      }}
    >
      {children}
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type}`}
            onClick={() => !toast.persistent && dismissToast(toast.id)}
          >
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                className="toast-action"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            {toast.persistent && (
              <button
                className="toast-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.id);
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
