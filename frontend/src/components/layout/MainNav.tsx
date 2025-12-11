import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';

const navItems = [
  { label: 'Home', path: '/home' },
  { label: 'Schedule', path: '/schedule' },
  { label: 'OfficeFlow', path: '/office-flow' },
  { label: 'Appt Flow', path: '/appt-flow' },
  { label: 'Waitlist', path: '/waitlist' },
  { label: 'Patients', path: '/patients' },
  { label: 'Orders', path: '/orders' },
  { label: 'Rx', path: '/rx' },
  { label: 'ePA', path: '/prior-auth' },
  { label: 'Labs', path: '/labs' },
  { label: 'Text Messages', path: '/text-messages' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Mail', path: '/mail' },
  { label: 'Documents', path: '/documents' },
  { label: 'Photos', path: '/photos' },
  { label: 'Body Diagram', path: '/body-diagram' },
  { label: 'Handouts', path: '/handouts' },
  { label: 'Reminders', path: '/reminders' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Reports', path: '/reports' },
  { label: 'Telehealth', path: '/telehealth' },
  { label: 'Inventory', path: '/inventory' },
  { label: 'Financials', path: '/financials' },
  { label: 'Fee Schedules', path: '/admin/fee-schedules' },
  { label: 'Quotes', path: '/quotes' },
  { label: 'Audit Log', path: '/admin/audit-log' },
];

export function MainNav() {
  const location = useLocation();
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetchUnreadCount(session.tenantId, session.accessToken);
      setUnreadCount(response.count || 0);
    } catch (err) {
      // Silently fail - don't show error for unread count
      console.error('Failed to load unread count:', err);
    }
  }, [session]);

  useEffect(() => {
    loadUnreadCount();

    // Poll for unread count every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  const isActive = (path: string) => {
    if (path === '/home') {
      return location.pathname === '/home' || location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Main Navigation Bar */}
      <nav className="ema-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`ema-nav-link ${isActive(item.path) ? 'active' : ''}`}
          >
            {item.label}
            {item.path === '/mail' && unreadCount > 0 && (
              <span
                style={{
                  marginLeft: '0.5rem',
                  background: '#ef4444',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  minWidth: '1.25rem',
                  textAlign: 'center',
                  display: 'inline-block',
                }}
              >
                {unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Recalls Secondary Nav */}
      <div className="ema-subnav">
        <NavLink to="/reminders" className="ema-subnav-link">
          Recalls
        </NavLink>
      </div>

      {/* Accent line under nav */}
      <div className="ema-nav-accent" />
    </>
  );
}

// Mobile navigation with hamburger menu
export function MobileNav() {
  return null; // We'll implement mobile later if needed
}
