import { useEffect, useState, useCallback } from 'react';
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

export function AppLayout() {
  const { isAuthenticated, session, user } = useAuth();
  const accessControl = useAccessControl();
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);

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

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
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

        <main id="main-content" className="content-card" role="main" aria-label="Main content">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
}
