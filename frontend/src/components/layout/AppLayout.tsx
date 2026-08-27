import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { MainNav, MobileNav } from './MainNav';
import { Footer } from './Footer';
import { DemoIntegrationBanner } from './DemoIntegrationBanner';
import { useAuth } from '../../contexts/AuthContext';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { fetchPatients } from '../../api';
import type { Patient } from '../../types';
import { getModuleForPath } from '../../config/moduleAccess';
import { getEffectiveRoles } from '../../utils/roles';
import { ForcedPasswordReset } from '../auth/ForcedPasswordReset';

export function AppLayout() {
  const { isAuthenticated, passwordResetRequired, session, user } = useAuth();
  const accessControl = useAccessControl();
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const previousPathRef = useRef(location.pathname);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    const effectiveRoles = getEffectiveRoles(user || session.user);
    if (!accessControl.canAccessModule('patients', effectiveRoles)) {
      setPatients([]);
      return;
    }

    try {
      const res = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(res.data || res.patients || []);
    } catch {
      // Silently fail for patient search
    }
  }, [accessControl, session, user]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Announce route changes by moving focus to the new page heading (or main
  // landmark). Skip the initial render so login and modal focus management can
  // establish focus without being overridden by the app shell.
  useEffect(() => {
    if (previousPathRef.current === location.pathname) return;
    previousPathRef.current = location.pathname;

    const timeoutId = window.setTimeout(() => {
      const main = mainContentRef.current;
      if (!main) return;

      // A route transition can be initiated from a dialog. Let the dialog's
      // own focus trap finish before the shell attempts to focus the page.
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest('[role="dialog"]')) return;

      const heading = main.querySelector<HTMLElement>('[data-page-heading], h1, h2');
      const focusTarget = heading || main;
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (passwordResetRequired) {
    return <ForcedPasswordReset />;
  }

  // Keep the browser tab locked to kiosk routes while a patient intake is active.
  if (sessionStorage.getItem('kioskMode') === 'active') {
    return <Navigate to="/kiosk" replace />;
  }

  const activeModule = getModuleForPath(location.pathname);
  const effectiveRoles = getEffectiveRoles(user || session?.user);
  if (activeModule && !accessControl.canAccessModule(activeModule, effectiveRoles)) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="page">
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <div className="layout">
        <TopBar patients={patients} onRefresh={loadPatients} />
        <MainNav />
        <MobileNav />
        <DemoIntegrationBanner />

        <main
          ref={mainContentRef}
          id="main-content"
          className="content-card"
          role="main"
          aria-label="Main content"
          tabIndex={-1}
        >
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
}
