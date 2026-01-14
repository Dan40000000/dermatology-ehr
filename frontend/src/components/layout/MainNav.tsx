import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';
import { canAccessModule, type ModuleKey } from '../../config/moduleAccess';

interface DropdownItem {
  label: string;
  path: string;
  section?: string;
}

interface NavItem {
  label: string;
  path: string;
  module: ModuleKey;
  dropdown?: DropdownItem[];
}

const navItems: NavItem[] = [
  { label: 'Home', path: '/home', module: 'home' },
  { label: 'Schedule', path: '/schedule', module: 'schedule' },
  { label: 'OfficeFlow', path: '/office-flow', module: 'office_flow' },
  { label: 'Appt Flow', path: '/appt-flow', module: 'appt_flow' },
  { label: 'Waitlist', path: '/waitlist', module: 'waitlist' },
  { label: 'Patients', path: '/patients', module: 'patients' },
  {
    label: 'Notes',
    path: '/notes',
    module: 'notes',
    dropdown: [
      { label: 'All Notes', path: '/notes' },
      { label: 'My Finalized', path: '/notes?tab=finalized' },
      { label: 'Prelim', path: '/notes?tab=prelim' },
    ]
  },
  {
    label: 'Orders',
    path: '/orders',
    module: 'orders',
    dropdown: [
      { label: 'All Orders', path: '/orders' },
      { label: 'Pending', path: '/orders?tab=pending' },
      { label: 'Completed', path: '/orders?tab=completed' },
    ]
  },
  { label: 'Rx', path: '/rx', module: 'rx' },
  { label: 'ePA', path: '/prior-auth', module: 'epa' },
  {
    label: 'Labs',
    path: '/labs',
    module: 'labs',
    dropdown: [
      { label: 'Pending Results', path: '/labs?tab=pending-results', section: 'PATH' },
      { label: 'Pending Plan Completion', path: '/labs?tab=pending-plan', section: 'PATH' },
      { label: 'Completed', path: '/labs?tab=completed', section: 'PATH' },
      { label: 'Unresolved', path: '/labs?tab=unresolved', section: 'PATH' },
      { label: 'Pending Results', path: '/labs?tab=lab-pending-results', section: 'LAB' },
      { label: 'Pending Plan Completion', path: '/labs?tab=lab-pending-plan', section: 'LAB' },
      { label: 'Completed', path: '/labs?tab=lab-completed', section: 'LAB' },
      { label: 'Unresolved', path: '/labs?tab=lab-unresolved', section: 'LAB' },
    ]
  },
  { label: 'Text Messages', path: '/text-messages', module: 'text_messages' },
  {
    label: 'Tasks',
    path: '/tasks',
    module: 'tasks',
    dropdown: [
      { label: 'Received', path: '/tasks?tab=received' },
      { label: 'Sent', path: '/tasks?tab=sent' },
      { label: 'Completed', path: '/tasks?tab=completed' },
    ]
  },
  {
    label: 'Mail',
    path: '/mail',
    module: 'mail',
    dropdown: [
      { label: 'Inbox', path: '/mail?tab=inbox' },
      { label: 'Sent', path: '/mail?tab=sent' },
      { label: 'Drafts', path: '/mail?tab=drafts' },
    ]
  },
  { label: 'Direct', path: '/direct', module: 'direct' },
  { label: 'Fax', path: '/fax', module: 'fax' },
  { label: 'Documents', path: '/documents', module: 'documents' },
  { label: 'Photos', path: '/photos', module: 'photos' },
  { label: 'Body Diagram', path: '/body-diagram', module: 'body_diagram' },
  { label: 'Handouts', path: '/handouts', module: 'handouts' },
  { label: 'Reminders', path: '/reminders', module: 'reminders' },
  { label: 'Recalls', path: '/recalls', module: 'recalls' },
  {
    label: 'Analytics',
    path: '/analytics',
    module: 'analytics',
    dropdown: [
      { label: 'Dashboard', path: '/analytics' },
      { label: 'Reports', path: '/analytics?tab=reports' },
      { label: 'Clinical/Operational', path: '/analytics?tab=clinical-operational' },
    ]
  },
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
  {
    label: 'Financials',
    path: '/financials',
    module: 'financials',
    dropdown: [
      { label: 'Bills', path: '/financials?tab=bills' },
      { label: 'Claims', path: '/claims' },
      { label: 'Quotes', path: '/quotes' },
    ]
  },
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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const userRole = user?.role;

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => canAccessModule(userRole, item.module));

  const handleMouseEnter = (itemPath: string) => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    const timeout = setTimeout(() => {
      setHoveredItem(itemPath);
    }, 150);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setHoveredItem(null);
  };

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
          <div
            key={item.path}
            className="ema-nav-item"
            onMouseEnter={() => item.dropdown && handleMouseEnter(item.path)}
            onMouseLeave={handleMouseLeave}
          >
            <NavLink
              to={item.path}
              className={`ema-nav-link ${isActive(item.path) ? 'active' : ''}`}
              aria-current={isActive(item.path) ? 'page' : undefined}
              aria-haspopup={item.dropdown ? 'true' : undefined}
              aria-expanded={item.dropdown && hoveredItem === item.path ? 'true' : 'false'}
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

            {item.dropdown && hoveredItem === item.path && (
              <div className="ema-nav-dropdown" role="menu">
                {(() => {
                  const sections = new Set(item.dropdown.map(d => d.section).filter(Boolean));
                  if (sections.size > 0) {
                    // Group by sections
                    return Array.from(sections).map((section) => (
                      <div key={section} className="ema-nav-dropdown-section">
                        <div className="ema-nav-dropdown-section-title">{section}</div>
                        {item.dropdown!
                          .filter(d => d.section === section)
                          .map((dropdownItem) => (
                            <NavLink
                              key={dropdownItem.path}
                              to={dropdownItem.path}
                              className="ema-nav-dropdown-item"
                              role="menuitem"
                            >
                              {dropdownItem.label}
                            </NavLink>
                          ))}
                      </div>
                    ));
                  } else {
                    // No sections, render flat list
                    return item.dropdown.map((dropdownItem) => (
                      <NavLink
                        key={dropdownItem.path}
                        to={dropdownItem.path}
                        className="ema-nav-dropdown-item"
                        role="menuitem"
                      >
                        {dropdownItem.label}
                      </NavLink>
                    ));
                  }
                })()}
              </div>
            )}
          </div>
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
