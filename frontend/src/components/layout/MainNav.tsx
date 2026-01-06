import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';

interface NavItem {
  label: string;
  path: string;
  adminOnly?: boolean;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Home', path: '/home' },
  { label: 'Schedule', path: '/schedule' },
  { label: 'OfficeFlow', path: '/office-flow' },
  { label: 'Appt Flow', path: '/appt-flow' },
  { label: 'Waitlist', path: '/waitlist' },
  { label: 'Patients', path: '/patients' },
  { label: 'Notes', path: '/notes' },
  { label: 'Orders', path: '/orders' },
  { label: 'Rx', path: '/rx' },
  { label: 'ePA', path: '/prior-auth' },
  { label: 'Labs', path: '/labs' },
  { label: 'Text Messages', path: '/text-messages' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Mail', path: '/mail' },
  { label: 'Direct', path: '/direct' },
  { label: 'Fax', path: '/fax' },
  { label: 'Documents', path: '/documents' },
  { label: 'Photos', path: '/photos' },
  { label: 'Body Diagram', path: '/body-diagram' },
  { label: 'Handouts', path: '/handouts' },
  { label: 'Reminders', path: '/reminders' },
  { label: 'Recalls', path: '/recalls' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Reports', path: '/reports' },
  { label: 'Quality', path: '/quality', roles: ['admin', 'provider'] },
  { label: 'Registry', path: '/registry' },
  { label: 'Referrals', path: '/referrals' },
  { label: 'Forms', path: '/forms' },
  { label: 'Protocols', path: '/protocols' },
  { label: 'Templates', path: '/templates' },
  { label: 'Preferences', path: '/preferences' },
  { label: 'Help', path: '/help' },
  { label: 'Telehealth', path: '/telehealth' },
  { label: 'Inventory', path: '/inventory' },
  { label: 'Financials', path: '/financials' },
  { label: 'Claims', path: '/claims' },
  { label: 'Clearinghouse', path: '/clearinghouse' },
  { label: 'Fee Schedules', path: '/admin/fee-schedules' },
  { label: 'Quotes', path: '/quotes' },
  { label: 'Audit Log', path: '/admin/audit-log' },
  { label: 'Admin', path: '/admin', adminOnly: true },
];

export function MainNav() {
  const location = useLocation();
  const { session, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isAdmin = user?.role === 'admin';
  const userRole = user?.role;

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => {
    if (item.roles) {
      return !!userRole && item.roles.includes(userRole);
    }
    if (item.adminOnly) {
      return isAdmin;
    }
    return true;
  });

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
      <nav className="ema-nav" role="navigation" aria-label="Main navigation">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`ema-nav-link ${isActive(item.path) ? 'active' : ''}`}
            aria-current={isActive(item.path) ? 'page' : undefined}
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
                aria-label={`${unreadCount} unread messages`}
                role="status"
              >
                {unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Recalls Secondary Nav */}
      <nav className="ema-subnav" role="navigation" aria-label="Secondary navigation">
        <NavLink to="/recalls" className="ema-subnav-link">
          Recalls
        </NavLink>
      </nav>

      {/* Accent line under nav */}
      <div className="ema-nav-accent" aria-hidden="true" />
    </>
  );
}

// Mobile navigation with hamburger menu
export function MobileNav() {
  return null; // We'll implement mobile later if needed
}
