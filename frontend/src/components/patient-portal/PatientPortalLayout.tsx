import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';

interface PatientPortalLayoutProps {
  children: ReactNode;
}

export function PatientPortalLayout({ children }: PatientPortalLayoutProps) {
  const { patient, logout } = usePatientPortalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/portal/login');
  };

  const navItems = [
    { path: '/portal/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/portal/appointments', label: 'Appointments', icon: 'calendar' },
    { path: '/portal/check-in', label: 'Pre-Check-In', icon: 'checkin' },
    { path: '/portal/intake', label: 'Intake & Consents', icon: 'consent' },
    { path: '/portal/visits', label: 'Visit Summaries', icon: 'clipboard' },
    { path: '/portal/documents', label: 'Documents', icon: 'document' },
    { path: '/portal/health-record', label: 'Health Record', icon: 'heart' },
    { path: '/portal/billing', label: 'Billing', icon: 'billing' },
    { path: '/portal/profile', label: 'Profile', icon: 'user' },
  ];

  // Get the practice phone number from patient data
  const practicePhone = patient?.practicePhone || '(555) 123-4567';

  const getIcon = (iconName: string) => {
    const icons: Record<string, JSX.Element> = {
      dashboard: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
      calendar: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      clipboard: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
      ),
      document: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      ),
      heart: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ),
      user: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      billing: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
      consent: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <path d="M9 13l2 2 4-4"/>
        </svg>
      ),
      checkin: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M8 12l2.5 2.5L16 9"/>
        </svg>
      ),
      logout: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16,17 21,12 16,7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      ),
      menu: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      ),
      close: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ),
      chevronDown: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      ),
      bell: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
    };
    return icons[iconName] || null;
  };

  return (
    <div className={`portal-layout ${mounted ? 'mounted' : ''}`}>
      {/* Gradient Background */}
      <div className="portal-layout-bg">
        <div className="portal-layout-bg-gradient"></div>
        <div className="portal-layout-bg-pattern"></div>
      </div>

      {/* Top Header */}
      <header className="portal-topbar">
        <div className="portal-topbar-content">
          <div className="portal-topbar-left">
            <button
              className="portal-mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {getIcon(sidebarOpen ? 'close' : 'menu')}
            </button>
            <Link to="/portal/dashboard" className="portal-brand">
              <div className="portal-brand-icon">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M24 8C15.164 8 8 15.164 8 24s7.164 16 16 16 16-7.164 16-16S32.836 8 24 8zm0 28c-6.627 0-12-5.373-12-12S17.373 12 24 12s12 5.373 12 12-5.373 12-12 12z" fill="currentColor" fillOpacity="0.3"/>
                  <path d="M24 14c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" fill="currentColor"/>
                  <circle cx="24" cy="24" r="3" fill="currentColor"/>
                </svg>
              </div>
              <div className="portal-brand-text">
                <span className="portal-brand-name">Mountain Pine</span>
                <span className="portal-brand-sub">Patient Portal</span>
              </div>
            </Link>
          </div>

          <div className="portal-topbar-right">
            <button className="portal-notification-btn" aria-label="Notifications">
              {getIcon('bell')}
              <span className="notification-badge">2</span>
            </button>

            <div className="portal-user-dropdown">
              <button
                className="portal-user-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="portal-avatar">
                  {patient?.firstName?.[0]}{patient?.lastName?.[0]}
                </div>
                <div className="portal-user-info">
                  <span className="portal-user-name">{patient?.firstName} {patient?.lastName}</span>
                  <span className="portal-user-email">{patient?.email}</span>
                </div>
                <span className={`portal-dropdown-arrow ${userMenuOpen ? 'open' : ''}`}>
                  {getIcon('chevronDown')}
                </span>
              </button>

              {userMenuOpen && (
                <div className="portal-dropdown-menu">
                  <Link to="/portal/profile" className="portal-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                    {getIcon('user')}
                    <span>My Profile</span>
                  </Link>
                  <button className="portal-dropdown-item logout" onClick={handleLogout}>
                    {getIcon('logout')}
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="portal-body">
        {/* Sidebar Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="portal-sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`portal-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <nav className="portal-nav">
            <div className="portal-nav-section">
              <span className="portal-nav-label">Main Menu</span>
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `portal-nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <span className="portal-nav-icon">{getIcon(item.icon)}</span>
                  <span className="portal-nav-text">{item.label}</span>
                  <span className="portal-nav-indicator"></span>
                </NavLink>
              ))}
            </div>

            <div className="portal-nav-section portal-nav-footer">
              <div className="portal-help-card">
                <div className="portal-help-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h4>Need Help?</h4>
                <p>Contact your provider's office</p>
                <a href={`tel:${practicePhone.replace(/\D/g, '')}`} className="portal-help-btn">
                  {practicePhone}
                </a>
              </div>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="portal-main">
          <div className="portal-main-content">
            {children}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="portal-footer">
        <div className="portal-footer-content">
          <div className="portal-footer-left">
            <p>&copy; 2026 Mountain Pine Dermatology. All rights reserved.</p>
          </div>
          <div className="portal-footer-right">
            <a href="#privacy">Privacy Policy</a>
            <span className="footer-divider">|</span>
            <a href="#terms">Terms of Service</a>
            <span className="footer-divider">|</span>
            <a href="#accessibility">Accessibility</a>
          </div>
        </div>
      </footer>

      <style>{`
        .portal-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Background */
        .portal-layout-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }

        .portal-layout-bg-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
        }

        .portal-layout-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.4;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        /* Top Bar */
        .portal-topbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }

        .portal-topbar-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          max-width: 1600px;
          margin: 0 auto;
        }

        .portal-topbar-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .portal-mobile-menu-btn {
          display: none;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .portal-mobile-menu-btn:hover {
          background: #f1f5f9;
          color: #334155;
        }

        .portal-mobile-menu-btn svg {
          width: 22px;
          height: 22px;
        }

        .portal-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
        }

        .portal-brand-icon {
          width: 40px;
          height: 40px;
          color: #6366f1;
        }

        .portal-brand-icon svg {
          width: 100%;
          height: 100%;
        }

        .portal-brand-text {
          display: flex;
          flex-direction: column;
        }

        .portal-brand-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.2;
        }

        .portal-brand-sub {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 500;
        }

        .portal-topbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .portal-notification-btn {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: none;
          background: #f8fafc;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .portal-notification-btn:hover {
          background: #f1f5f9;
          color: #6366f1;
        }

        .portal-notification-btn svg {
          width: 20px;
          height: 20px;
        }

        .notification-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 16px;
          height: 16px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          font-size: 0.65rem;
          font-weight: 600;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .portal-user-dropdown {
          position: relative;
        }

        .portal-user-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.375rem 0.75rem 0.375rem 0.375rem;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .portal-user-btn:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .portal-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          font-size: 0.85rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .portal-user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .portal-user-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: #1e293b;
        }

        .portal-user-email {
          font-size: 0.7rem;
          color: #94a3b8;
        }

        .portal-dropdown-arrow {
          color: #94a3b8;
          transition: transform 0.2s;
        }

        .portal-dropdown-arrow.open {
          transform: rotate(180deg);
        }

        .portal-dropdown-arrow svg {
          width: 16px;
          height: 16px;
        }

        .portal-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 200px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          animation: dropdownFadeIn 0.15s ease-out;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .portal-dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: #475569;
          text-decoration: none;
          font-size: 0.875rem;
          transition: all 0.15s;
          border: none;
          background: none;
          width: 100%;
          cursor: pointer;
        }

        .portal-dropdown-item:hover {
          background: #f8fafc;
          color: #6366f1;
        }

        .portal-dropdown-item.logout {
          color: #ef4444;
          border-top: 1px solid #f1f5f9;
        }

        .portal-dropdown-item.logout:hover {
          background: #fef2f2;
          color: #dc2626;
        }

        .portal-dropdown-item svg {
          width: 18px;
          height: 18px;
        }

        /* Body Layout */
        .portal-body {
          flex: 1;
          display: flex;
          position: relative;
          z-index: 1;
        }

        /* Sidebar Overlay */
        .portal-sidebar-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          z-index: 150;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Sidebar */
        .portal-sidebar {
          width: 260px;
          flex-shrink: 0;
          padding: 1.5rem 1rem;
          display: flex;
          flex-direction: column;
        }

        .portal-nav {
          position: sticky;
          top: 80px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .portal-nav-section {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .portal-nav-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          padding: 0 0.75rem;
          margin-bottom: 0.5rem;
        }

        .portal-nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 10px;
          color: #64748b;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
          position: relative;
        }

        .portal-nav-item:hover {
          background: rgba(99, 102, 241, 0.08);
          color: #6366f1;
        }

        .portal-nav-item.active {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        }

        .portal-nav-icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .portal-nav-icon svg {
          width: 100%;
          height: 100%;
        }

        .portal-nav-text {
          flex: 1;
        }

        .portal-nav-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .portal-nav-footer {
          margin-top: auto;
        }

        .portal-help-card {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 16px;
          padding: 1.25rem;
          color: white;
          text-align: center;
        }

        .portal-help-icon {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 0.75rem;
        }

        .portal-help-icon svg {
          width: 20px;
          height: 20px;
        }

        .portal-help-card h4 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }

        .portal-help-card p {
          font-size: 0.8rem;
          opacity: 0.85;
          margin: 0 0 1rem;
        }

        .portal-help-btn {
          display: inline-block;
          padding: 0.5rem 1rem;
          background: white;
          color: #6366f1;
          font-size: 0.8rem;
          font-weight: 600;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
        }

        .portal-help-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: translateY(-1px);
        }

        /* Main Content */
        .portal-main {
          flex: 1;
          min-width: 0;
          padding: 1.5rem 1.5rem 1.5rem 0;
        }

        .portal-main-content {
          background: white;
          border-radius: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 20px rgba(0, 0, 0, 0.02);
          border: 1px solid rgba(226, 232, 240, 0.5);
          min-height: calc(100vh - 180px);
          padding: 1.5rem;
        }

        /* Footer */
        .portal-footer {
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(226, 232, 240, 0.8);
          padding: 1rem 1.5rem;
        }

        .portal-footer-content {
          max-width: 1600px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .portal-footer-left p {
          margin: 0;
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .portal-footer-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .portal-footer-right a {
          font-size: 0.8rem;
          color: #64748b;
          text-decoration: none;
          transition: color 0.2s;
        }

        .portal-footer-right a:hover {
          color: #6366f1;
        }

        .footer-divider {
          color: #cbd5e1;
          font-size: 0.75rem;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .portal-mobile-menu-btn {
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .portal-sidebar-overlay {
            display: block;
          }

          .portal-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            background: white;
            z-index: 200;
            padding-top: 1.5rem;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
          }

          .portal-sidebar.open {
            transform: translateX(0);
          }

          .portal-nav {
            position: static;
          }

          .portal-main {
            padding: 1rem;
          }

          .portal-main-content {
            border-radius: 16px;
          }

          .portal-user-info {
            display: none;
          }

          .portal-user-btn {
            padding: 0.25rem;
          }

          .portal-dropdown-arrow {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .portal-brand-text {
            display: none;
          }

          .portal-topbar-content {
            padding: 0.75rem 1rem;
          }

          .portal-footer-content {
            flex-direction: column;
            gap: 0.75rem;
            text-align: center;
          }
        }

        /* Animation */
        .portal-layout {
          opacity: 0;
          transition: opacity 0.3s ease-out;
        }

        .portal-layout.mounted {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
