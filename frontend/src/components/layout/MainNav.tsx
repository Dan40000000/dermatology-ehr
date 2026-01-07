import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';
import { canAccessModule, type ModuleKey } from '../../config/moduleAccess';

interface NavItem {
  label: string;
  path: string;
  module: ModuleKey;
}

const navItems: NavItem[] = [
  { label: 'Home', path: '/home', module: 'home' },
  { label: 'Schedule', path: '/schedule', module: 'schedule' },
  { label: 'OfficeFlow', path: '/office-flow', module: 'office_flow' },
  { label: 'Appt Flow', path: '/appt-flow', module: 'appt_flow' },
  { label: 'Waitlist', path: '/waitlist', module: 'waitlist' },
  { label: 'Patients', path: '/patients', module: 'patients' },
  { label: 'Notes', path: '/notes', module: 'notes' },
  { label: 'Orders', path: '/orders', module: 'orders' },
  { label: 'Rx', path: '/rx', module: 'rx' },
  { label: 'ePA', path: '/prior-auth', module: 'epa' },
  { label: 'Labs', path: '/labs', module: 'labs' },
  { label: 'Text Messages', path: '/text-messages', module: 'text_messages' },
  { label: 'Tasks', path: '/tasks', module: 'tasks' },
  { label: 'Mail', path: '/mail', module: 'mail' },
  { label: 'Direct', path: '/direct', module: 'direct' },
  { label: 'Fax', path: '/fax', module: 'fax' },
  { label: 'Documents', path: '/documents', module: 'documents' },
  { label: 'Photos', path: '/photos', module: 'photos' },
  { label: 'Body Diagram', path: '/body-diagram', module: 'body_diagram' },
  { label: 'Handouts', path: '/handouts', module: 'handouts' },
  { label: 'Reminders', path: '/reminders', module: 'reminders' },
  { label: 'Recalls', path: '/recalls', module: 'recalls' },
  { label: 'Analytics', path: '/analytics', module: 'analytics' },
  { label: 'Reports', path: '/reports', module: 'reports' },
  { label: 'Quality', path: '/quality', module: 'quality' },
  { label: 'Registry', path: '/registry', module: 'registry' },
  { label: 'Referrals', path: '/referrals', module: 'referrals' },
  { label: 'Forms', path: '/forms', module: 'forms' },
  { label: 'Protocols', path: '/protocols', module: 'protocols' },
  { label: 'Templates', path: '/templates', module: 'templates' },
  { label: 'Preferences', path: '/preferences', module: 'preferences' },
  { label: 'Help', path: '/help', module: 'help' },
  { label: 'Telehealth', path: '/telehealth', module: 'telehealth' },
  { label: 'Inventory', path: '/inventory', module: 'inventory' },
  { label: 'Financials', path: '/financials', module: 'financials' },
  { label: 'Claims', path: '/claims', module: 'claims' },
  { label: 'Clearinghouse', path: '/clearinghouse', module: 'clearinghouse' },
  { label: 'Fee Schedules', path: '/admin/fee-schedules', module: 'admin' },
  { label: 'Quotes', path: '/quotes', module: 'quotes' },
  { label: 'Audit Log', path: '/admin/audit-log', module: 'admin' },
  { label: 'Admin', path: '/admin', module: 'admin' },
];

export function MainNav() {
  const location = useLocation();
  const { session, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const userRole = user?.role;

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => canAccessModule(userRole, item.module));

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
