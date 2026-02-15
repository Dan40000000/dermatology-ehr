import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';
import { canAccessModule, type ModuleKey } from '../../config/moduleAccess';
import { getEffectiveRoles } from '../../utils/roles';

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
  {
    label: 'Home',
    path: '/home',
    module: 'home',
    dropdown: [
      { label: 'Dashboard', path: '/home' },
      { label: 'Quick Actions', path: '/home?section=actions' },
    ]
  },
  {
    label: 'Schedule',
    path: '/schedule',
    module: 'schedule',
    dropdown: [
      { label: 'Calendar View', path: '/schedule' },
      { label: 'Day View', path: '/schedule?view=day' },
      { label: 'Week View', path: '/schedule?view=week' },
      { label: 'Month View', path: '/schedule?view=month' },
    ]
  },
  {
    label: 'OfficeFlow',
    path: '/office-flow',
    module: 'office_flow',
    dropdown: [
      { label: 'All Patients', path: '/office-flow' },
      { label: 'Waiting Room', path: '/office-flow?status=checked_in' },
      { label: 'In Room', path: '/office-flow?status=in_room' },
      { label: 'With Provider', path: '/office-flow?status=with_provider' },
      { label: 'Completed', path: '/office-flow?status=completed' },
    ]
  },
  {
    label: 'Tasks',
    path: '/tasks',
    module: 'tasks',
    dropdown: [
      { label: 'All Tasks', path: '/tasks' },
      { label: 'Received', path: '/tasks?tab=received' },
      { label: 'Sent', path: '/tasks?tab=sent' },
      { label: 'Completed', path: '/tasks?tab=completed' },
    ]
  },
  {
    label: 'Patients',
    path: '/patients',
    module: 'patients',
    dropdown: [
      { label: 'Patient List', path: '/patients' },
      { label: 'Register Patient', path: '/patients/register' },
      { label: 'Advanced Search', path: '/patients?advanced=true' },
      { label: 'Handout Library', path: '/handouts' },
      { label: 'Reports', path: '/patients/reports' },
    ]
  },
  {
    label: 'Notes',
    path: '/notes',
    module: 'notes',
    dropdown: [
      { label: 'All Notes', path: '/notes' },
      { label: 'My Finalized', path: '/notes?tab=finalized' },
      { label: 'Prelim', path: '/notes?tab=prelim' },
      { label: 'Unsigned', path: '/notes?tab=unsigned' },
    ]
  },
  {
    label: 'Orders',
    path: '/orders',
    module: 'orders',
    dropdown: [
      { label: 'All Orders', path: '/orders' },
      { label: 'Pending', path: '/orders?tab=pending' },
      { label: 'In Progress', path: '/orders?tab=in-progress' },
      { label: 'Completed', path: '/orders?tab=completed' },
    ]
  },
  {
    label: 'Rx',
    path: '/rx',
    module: 'rx',
    dropdown: [
      { label: 'All Prescriptions', path: '/rx' },
      { label: 'New Rx', path: '/rx?action=new' },
      { label: 'Refill Requests', path: '/rx?tab=refills' },
      { label: 'Pending', path: '/rx?tab=pending' },
    ]
  },
  {
    label: 'ePA',
    path: '/prior-auth',
    module: 'epa',
    dropdown: [
      { label: 'All Prior Auths', path: '/prior-auth' },
      { label: 'New Request', path: '/prior-auth?action=new' },
      { label: 'Pending', path: '/prior-auth?status=pending' },
      { label: 'Approved', path: '/prior-auth?status=approved' },
    ]
  },
  {
    label: 'Labs/Path',
    path: '/labs',
    module: 'labs',
    dropdown: [
      { label: 'Pending Results', path: '/labs?tab=pending-results', section: 'PATH' },
      { label: 'Pending Plan', path: '/labs?tab=pending-plan', section: 'PATH' },
      { label: 'Completed', path: '/labs?tab=completed', section: 'PATH' },
      { label: 'Unresolved', path: '/labs?tab=unresolved', section: 'PATH' },
      { label: 'Pending Results', path: '/labs?tab=lab-pending-results', section: 'LAB' },
      { label: 'Pending Plan', path: '/labs?tab=lab-pending-plan', section: 'LAB' },
      { label: 'Completed', path: '/labs?tab=lab-completed', section: 'LAB' },
      { label: 'Unresolved', path: '/labs?tab=lab-unresolved', section: 'LAB' },
    ]
  },
  {
    label: 'Text Messages',
    path: '/text-messages',
    module: 'text_messages',
    dropdown: [
      { label: 'All Messages', path: '/text-messages' },
      { label: 'Unread', path: '/text-messages?filter=unread' },
      { label: 'Sent', path: '/text-messages?filter=sent' },
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
      { label: 'Compose', path: '/mail?action=compose' },
    ]
  },
  {
    label: 'Direct',
    path: '/direct',
    module: 'direct',
    dropdown: [
      { label: 'Inbox', path: '/direct' },
      { label: 'Sent', path: '/direct?tab=sent' },
      { label: 'Compose', path: '/direct?action=compose' },
    ]
  },
  {
    label: 'Fax',
    path: '/fax',
    module: 'fax',
    dropdown: [
      { label: 'Inbox', path: '/fax' },
      { label: 'Sent', path: '/fax?tab=sent' },
      { label: 'Send Fax', path: '/fax?action=send' },
    ]
  },
  {
    label: 'Documents',
    path: '/documents',
    module: 'documents',
    dropdown: [
      { label: 'All Documents', path: '/documents' },
      { label: 'Upload', path: '/documents?action=upload' },
      { label: 'Recent', path: '/documents?filter=recent' },
    ]
  },
  {
    label: 'Photos',
    path: '/photos',
    module: 'photos',
    dropdown: [
      { label: 'All Photos', path: '/photos' },
      { label: 'Upload', path: '/photos?action=upload' },
      { label: 'Recent', path: '/photos?filter=recent' },
    ]
  },
  {
    label: 'Handouts',
    path: '/handouts',
    module: 'handouts',
    dropdown: [
      { label: 'Browse Library', path: '/handouts' },
      { label: 'Assigned', path: '/handouts?tab=assigned' },
      { label: 'Custom', path: '/handouts?tab=custom' },
    ]
  },
  {
    label: 'Reminders',
    path: '/reminders',
    module: 'reminders',
    dropdown: [
      { label: 'All Reminders', path: '/reminders' },
      { label: 'Create Reminder', path: '/reminders?action=new' },
      { label: 'Upcoming', path: '/reminders?filter=upcoming' },
    ]
  },
  {
    label: 'Recalls',
    path: '/recalls',
    module: 'recalls',
    dropdown: [
      { label: 'All Recalls', path: '/recalls' },
      { label: 'Due Today', path: '/recalls?filter=today' },
      { label: 'Overdue', path: '/recalls?filter=overdue' },
      { label: 'Completed', path: '/recalls?filter=completed' },
    ]
  },
  {
    label: 'Analytics',
    path: '/analytics',
    module: 'analytics',
    dropdown: [
      { label: 'Dashboard', path: '/analytics' },
      { label: 'Financial', path: '/analytics?tab=financial' },
      { label: 'Revenue', path: '/analytics?tab=revenue' },
      { label: 'Productivity', path: '/analytics?tab=productivity' },
      { label: 'Operational', path: '/analytics?tab=operational' },
    ]
  },
  {
    label: 'Patient Reports',
    path: '/reports',
    module: 'reports',
    dropdown: [
      { label: 'All Reports', path: '/reports' },
      { label: 'Visit Summaries', path: '/reports?type=visits' },
      { label: 'Clinical Notes', path: '/reports?type=clinical' },
      { label: 'Lab Results', path: '/reports?type=labs' },
      { label: 'Treatment History', path: '/reports?type=treatments' },
    ]
  },
  {
    label: 'Quality',
    path: '/quality',
    module: 'quality',
    dropdown: [
      { label: 'Quality Dashboard', path: '/quality' },
      { label: 'MIPS Measures', path: '/quality?tab=mips' },
      { label: 'Performance', path: '/quality?tab=performance' },
    ]
  },
  {
    label: 'Registry',
    path: '/registry',
    module: 'registry',
    dropdown: [
      { label: 'Patient Registry', path: '/registry' },
      { label: 'Disease Registries', path: '/registry?tab=disease' },
      { label: 'Add Entry', path: '/registry?action=add' },
    ]
  },
  {
    label: 'Referrals',
    path: '/referrals',
    module: 'referrals',
    dropdown: [
      { label: 'All Referrals', path: '/referrals' },
      { label: 'Incoming', path: '/referrals?tab=incoming' },
      { label: 'Outgoing', path: '/referrals?tab=outgoing' },
      { label: 'New Referral', path: '/referrals?action=new' },
    ]
  },
  {
    label: 'Forms',
    path: '/forms',
    module: 'forms',
    dropdown: [
      { label: 'All Forms', path: '/forms' },
      { label: 'Consent Forms', path: '/forms?type=consent' },
      { label: 'Intake Forms', path: '/forms?type=intake' },
    ]
  },
  {
    label: 'Protocols',
    path: '/protocols',
    module: 'protocols',
    dropdown: [
      { label: 'All Protocols', path: '/protocols' },
      { label: 'Clinical Protocols', path: '/protocols?type=clinical' },
      { label: 'Administrative', path: '/protocols?type=admin' },
    ]
  },
  {
    label: 'Templates',
    path: '/templates',
    module: 'templates',
    dropdown: [
      { label: 'All Templates', path: '/templates' },
      { label: 'Note Templates', path: '/templates?type=notes' },
      { label: 'Letter Templates', path: '/templates?type=letters' },
      { label: 'Create New', path: '/templates?action=new' },
    ]
  },
  {
    label: 'Preferences',
    path: '/preferences',
    module: 'preferences',
    dropdown: [
      { label: 'User Settings', path: '/preferences' },
      { label: 'Notifications', path: '/preferences?tab=notifications' },
      { label: 'Display', path: '/preferences?tab=display' },
    ]
  },
  {
    label: 'Help',
    path: '/help',
    module: 'help',
    dropdown: [
      { label: 'Help Center', path: '/help' },
      { label: 'Keyboard Shortcuts', path: '/help?section=shortcuts' },
      { label: 'Documentation', path: '/help?section=docs' },
      { label: 'Contact Support', path: '/help?section=support' },
    ]
  },
  {
    label: 'Telehealth',
    path: '/telehealth',
    module: 'telehealth',
    dropdown: [
      { label: 'Virtual Visits', path: '/telehealth' },
      { label: 'Upcoming', path: '/telehealth?filter=upcoming' },
      { label: 'Start Visit', path: '/telehealth?action=start' },
    ]
  },
  {
    label: 'Inventory',
    path: '/inventory',
    module: 'inventory',
    dropdown: [
      { label: 'All Items', path: '/inventory' },
      { label: 'Low Stock', path: '/inventory?filter=low-stock' },
      { label: 'Add Item', path: '/inventory?action=add' },
      { label: 'Usage Report', path: '/inventory?tab=usage' },
    ]
  },
  {
    label: 'Financials',
    path: '/financials',
    module: 'financials',
    dropdown: [
      { label: 'Overview', path: '/financials' },
      { label: 'Bills', path: '/financials?tab=bills' },
      { label: 'Payments', path: '/financials?tab=payments' },
      { label: 'Claims', path: '/claims' },
      { label: 'Quotes', path: '/quotes' },
    ]
  },
  {
    label: 'Claims',
    path: '/claims',
    module: 'claims',
    dropdown: [
      { label: 'All Claims', path: '/claims' },
      { label: 'Pending', path: '/claims?status=pending' },
      { label: 'Submitted', path: '/claims?status=submitted' },
      { label: 'Denied', path: '/claims?status=denied' },
    ]
  },
  {
    label: 'Clearinghouse',
    path: '/clearinghouse',
    module: 'clearinghouse',
    dropdown: [
      { label: 'Dashboard', path: '/clearinghouse' },
      { label: 'Submissions', path: '/clearinghouse?tab=submissions' },
      { label: 'Responses', path: '/clearinghouse?tab=responses' },
    ]
  },
  {
    label: 'Fee Schedules',
    path: '/admin/fee-schedules',
    module: 'admin',
    dropdown: [
      { label: 'All Schedules', path: '/admin/fee-schedules' },
      { label: 'Add Schedule', path: '/admin/fee-schedules?action=add' },
    ]
  },
  {
    label: 'Quotes',
    path: '/quotes',
    module: 'quotes',
    dropdown: [
      { label: 'All Quotes', path: '/quotes' },
      { label: 'Create Quote', path: '/quotes?action=new' },
      { label: 'Pending', path: '/quotes?status=pending' },
    ]
  },
  {
    label: 'Audit Log',
    path: '/admin/audit-log',
    module: 'admin',
    dropdown: [
      { label: 'All Activity', path: '/admin/audit-log' },
      { label: 'Recent', path: '/admin/audit-log?filter=recent' },
      { label: 'By User', path: '/admin/audit-log?filter=user' },
    ]
  },
  {
    label: 'Admin',
    path: '/admin',
    module: 'admin',
    dropdown: [
      { label: 'Admin Dashboard', path: '/admin' },
      { label: 'Users', path: '/admin?tab=users' },
      { label: 'Settings', path: '/admin?tab=settings' },
      { label: 'Fee Schedules', path: '/admin/fee-schedules' },
      { label: 'AI Agents', path: '/admin/ai-agents' },
      { label: 'Audit Log', path: '/admin/audit-log' },
    ]
  },
];

export function MainNav() {
  const location = useLocation();
  const { session, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const navItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userRole = getEffectiveRoles(user);

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => canAccessModule(userRole, item.module));

  // Hover handlers with position tracking for portal dropdown
  const handleMouseEnter = (itemPath: string, element: HTMLDivElement) => {
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setHoveredItem(itemPath);
    const rect = element.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom, left: rect.left });
  };

  const handleMouseLeave = () => {
    // Delay closing to allow mouse to move to dropdown
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setDropdownPos(null);
    }, 150);
  };

  const handleDropdownEnter = () => {
    // Cancel close when entering dropdown
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleDropdownLeave = () => {
    // Close when leaving dropdown
    setHoveredItem(null);
    setDropdownPos(null);
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const isActive = (path: string) => {
    if (path === '/home') {
      return location.pathname === '/home' || location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Main Navigation Bar - wrapper handles scroll, nav handles background */}
      <div className="ema-nav-wrapper">
        <nav className="ema-nav" role="navigation" aria-label="Main navigation">
          {filteredNavItems.map((item) => (
            <div
              key={item.path}
              className="ema-nav-item"
              ref={(el) => { if (el) navItemRefs.current.set(item.path, el); }}
              onMouseEnter={(e) => item.dropdown && handleMouseEnter(item.path, e.currentTarget)}
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
                {item.dropdown && (
                  <span className="dropdown-arrow">▼</span>
                )}
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
            </div>
          ))}
        </nav>
      </div>

      {/* Dropdown rendered via portal to escape scroll container */}
      {hoveredItem && dropdownPos && (() => {
        const item = filteredNavItems.find(i => i.path === hoveredItem);
        if (!item?.dropdown) return null;

        return createPortal(
          <div
            className="ema-nav-dropdown-portal"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            onMouseEnter={handleDropdownEnter}
            onMouseLeave={handleDropdownLeave}
            role="menu"
          >
            {(() => {
              const sections = new Set(item.dropdown.map(d => d.section).filter(Boolean));
              if (sections.size > 0) {
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
                          onClick={() => setHoveredItem(null)}
                        >
                          {dropdownItem.label}
                        </NavLink>
                      ))}
                  </div>
                ));
              } else {
                return item.dropdown.map((dropdownItem) => (
                  <NavLink
                    key={dropdownItem.path}
                    to={dropdownItem.path}
                    className="ema-nav-dropdown-item"
                    role="menuitem"
                    onClick={() => setHoveredItem(null)}
                  >
                    {dropdownItem.label}
                  </NavLink>
                ));
              }
            })()}
          </div>,
          document.body
        );
      })()}

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
