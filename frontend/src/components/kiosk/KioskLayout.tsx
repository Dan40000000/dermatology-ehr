import { useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../styles/kiosk.css';
import { ensureKioskContext } from '../../utils/kioskContext';

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
  totalSteps = 7,
  stepName,
  onTimeout,
  timeoutSeconds = 180, // 3 minutes default
  showProgress = true,
}: KioskLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Mark non-welcome kiosk steps as an active locked flow.
  useEffect(() => {
    if (location.pathname === '/kiosk') {
      sessionStorage.removeItem('kioskMode');
      return;
    }
    sessionStorage.setItem('kioskMode', 'active');
  }, [location.pathname]);

  useEffect(() => {
    void ensureKioskContext({ search: location.search });
  }, [location.search]);

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

  const handleFrontDeskExit = useCallback(() => {
    const confirmed = window.confirm('Exit kiosk mode and return to staff view?');
    if (!confirmed) return;

    sessionStorage.removeItem('kioskMode');
    sessionStorage.removeItem('kioskPatientId');
    sessionStorage.removeItem('kioskPatientName');
    sessionStorage.removeItem('kioskSessionId');

    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }

    navigate('/schedule', { replace: true });
  }, [navigate]);

  return (
    <div className="kiosk-container">
      {/* Header */}
      <header className="kiosk-header">
        <div className="kiosk-header-content">
          <div className="kiosk-header-left">
            <div className="kiosk-logo">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="kiosk-title">Patient Check-In</h1>
              {stepName && <p className="kiosk-step-name">{stepName}</p>}
            </div>
          </div>

          {/* Progress indicator */}
          {showProgress && currentStep !== undefined && (
            <div className="kiosk-progress">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`kiosk-progress-dot ${
                    i < currentStep
                      ? 'completed'
                      : i === currentStep
                      ? 'current'
                      : ''
                  }`}
                />
              ))}
              <span className="kiosk-progress-text">
                Step {currentStep + 1} of {totalSteps}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="kiosk-main">
        <div className="kiosk-content">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="kiosk-footer">
        <div className="kiosk-footer-content">
          <button onClick={handleFrontDeskExit} className="kiosk-staff-exit-btn">
            Front Desk Exit
          </button>
          <button onClick={handleNeedHelp} className="kiosk-help-btn">
            Need Help? See Staff
          </button>
        </div>
      </footer>
    </div>
  );
}
