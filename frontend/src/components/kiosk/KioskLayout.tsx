import { useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface KioskLayoutProps {
  children: ReactNode;
  currentStep?: number;
  totalSteps?: number;
  stepName?: string;
  onTimeout?: () => void;
  timeoutSeconds?: number;
  showProgress?: boolean;
}

export function KioskLayout({
  children,
  currentStep,
  totalSteps = 6,
  stepName,
  onTimeout,
  timeoutSeconds = 180, // 3 minutes default
  showProgress = true,
}: KioskLayoutProps) {
  const navigate = useNavigate();

  // Inactivity timeout
  useEffect(() => {
    if (!onTimeout) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        onTimeout();
      }, timeoutSeconds * 1000);
    };

    // Reset timeout on any user interaction
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => {
      window.addEventListener(event, resetTimeout);
    });

    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimeout);
      });
    };
  }, [onTimeout, timeoutSeconds]);

  // Prevent browser back button
  useEffect(() => {
    const preventBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', preventBack);

    return () => {
      window.removeEventListener('popstate', preventBack);
    };
  }, []);

  const handleNeedHelp = useCallback(() => {
    // Could trigger a staff notification here
    alert('Please see the front desk staff for assistance.');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-md py-6 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Patient Check-In</h1>
              {stepName && <p className="text-sm text-gray-600">{stepName}</p>}
            </div>
          </div>

          {/* Progress indicator */}
          {showProgress && currentStep !== undefined && (
            <div className="flex items-center gap-2">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < currentStep
                      ? 'bg-purple-600'
                      : i === currentStep
                      ? 'bg-purple-400'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
              <span className="ml-2 text-sm text-gray-600">
                Step {currentStep + 1} of {totalSteps}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-center">
          <button
            onClick={handleNeedHelp}
            className="px-8 py-3 text-lg font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 border-2 border-purple-200"
          >
            Need Help? See Staff
          </button>
        </div>
      </footer>
    </div>
  );
}
