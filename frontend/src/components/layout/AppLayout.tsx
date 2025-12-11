import { useEffect, useState, useCallback } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { MainNav, MobileNav } from './MainNav';
import { Footer } from './Footer';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatients } from '../../api';
import type { Patient } from '../../types';

export function AppLayout() {
  const { isAuthenticated, session } = useAuth();
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

  return (
    <div className="page">
      <div className="layout">
        <TopBar patients={patients} onRefresh={loadPatients} />
        <MainNav />
        <MobileNav />

        <div className="content-card">
          <Outlet />
        </div>

        <Footer />
      </div>
    </div>
  );
}
