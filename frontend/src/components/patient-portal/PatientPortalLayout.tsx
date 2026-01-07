import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';

interface PatientPortalLayoutProps {
  children: ReactNode;
}

export function PatientPortalLayout({ children }: PatientPortalLayoutProps) {
  const { patient, logout } = usePatientPortalAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/portal/login');
  };

  return (
    <div className="patient-portal-layout">
      {/* Header */}
      <header className="portal-header">
        <div className="portal-header-content">
          <Link to="/portal/dashboard" className="portal-logo">
            <div className="portal-logo-icon"></div>
            <div>
              <h1>Mountain Pine Dermatology</h1>
              <p>Patient Portal</p>
            </div>
          </Link>

          <div className="portal-user-menu">
            <div className="portal-user-info">
              <div className="portal-user-avatar">
                {patient?.firstName?.[0]}{patient?.lastName?.[0]}
              </div>
              <div>
                <p className="portal-user-name">
                  {patient?.firstName} {patient?.lastName}
                </p>
                <button onClick={handleLogout} className="portal-logout-btn">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="portal-main-wrapper">
        {/* Sidebar Navigation */}
        <aside className="portal-sidebar">
          <nav className="portal-nav">
            <NavLink to="/portal/dashboard" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Dashboard
            </NavLink>
            <NavLink to="/portal/appointments" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Appointments
            </NavLink>
            <NavLink to="/portal/visits" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Visit Summaries
            </NavLink>
            <NavLink to="/portal/documents" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Documents
            </NavLink>
            <NavLink to="/portal/health-record" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Health Record
            </NavLink>
            <NavLink to="/portal/profile" className={({ isActive }) => isActive ? 'portal-nav-link active' : 'portal-nav-link'}>
              <span className="portal-nav-icon"></span>
              Profile
            </NavLink>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="portal-content">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="portal-footer">
        <div className="portal-footer-content">
          <p>© 2025 Mountain Pine Dermatology</p>
          <div className="portal-footer-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="tel:1-800-555-0100">Support: 1-800-555-0100</a>
          </div>
        </div>
      </footer>

      <style>{`
        .patient-portal-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #f5f5f7;
        }

        .portal-header {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .portal-header-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .portal-logo {
          display: flex;
          align-items: center;
          gap: 1rem;
          text-decoration: none;
          color: inherit;
        }

        .portal-logo-icon {
          font-size: 2.5rem;
        }

        .portal-logo h1 {
          font-size: 1.25rem;
          color: #7c3aed;
          margin: 0;
          font-weight: 600;
        }

        .portal-logo p {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .portal-user-menu {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .portal-user-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .portal-user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .portal-user-name {
          font-weight: 500;
          color: #1f2937;
          margin: 0;
          font-size: 0.9rem;
        }

        .portal-logout-btn {
          background: none;
          border: none;
          color: #7c3aed;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .portal-logout-btn:hover {
          color: #6B46C1;
        }

        .portal-main-wrapper {
          flex: 1;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          gap: 2rem;
          padding: 2rem;
        }

        .portal-sidebar {
          width: 240px;
          flex-shrink: 0;
        }

        .portal-nav {
          background: white;
          border-radius: 12px;
          padding: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          position: sticky;
          top: 100px;
        }

        .portal-nav-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: #4b5563;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.2s;
          font-size: 0.9rem;
          margin-bottom: 0.25rem;
        }

        .portal-nav-link:hover {
          background: #f3f4f6;
          color: #1f2937;
        }

        .portal-nav-link.active {
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          color: white;
        }

        .portal-nav-icon {
          font-size: 1.25rem;
          width: 24px;
          text-align: center;
        }

        .portal-content {
          flex: 1;
          min-width: 0;
        }

        .portal-footer {
          background: white;
          border-top: 1px solid #e5e7eb;
          padding: 2rem;
          margin-top: 2rem;
        }

        .portal-footer-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .portal-footer-links {
          display: flex;
          gap: 2rem;
        }

        .portal-footer-links a {
          color: #7c3aed;
          text-decoration: none;
        }

        .portal-footer-links a:hover {
          text-decoration: underline;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .portal-main-wrapper {
            flex-direction: column;
            padding: 1rem;
          }

          .portal-sidebar {
            width: 100%;
          }

          .portal-nav {
            display: flex;
            overflow-x: auto;
            padding: 0.25rem;
            position: static;
          }

          .portal-nav-link {
            flex-direction: column;
            min-width: 80px;
            text-align: center;
            font-size: 0.8rem;
            padding: 0.5rem;
          }

          .portal-header-content {
            padding: 1rem;
          }

          .portal-logo h1 {
            font-size: 1rem;
          }

          .portal-logo p {
            display: none;
          }

          .portal-footer-content {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
