import { useEffect, useState, useCallback } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { MainNav, MobileNav } from './MainNav';
import { Footer } from './Footer';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatients } from '../../api';
import type { Patient } from '../../types';
import { canAccessModule, getModuleForPath } from '../../config/moduleAccess';

export function AppLayout() {
  const { isAuthenticated, session, user } = useAuth();
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(res.patients || []);
    } catch {
      // Silently fail for patient search
    }
  }, [session]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const activeModule = getModuleForPath(location.pathname);
  if (activeModule && !canAccessModule(user?.role, activeModule)) {
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

        <main id="main-content" className="content-card" role="main" aria-label="Main content">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
}
