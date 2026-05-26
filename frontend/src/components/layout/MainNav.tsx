import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchUnreadCount } from '../../api';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { type ModuleKey } from '../../config/moduleAccess';
import { canViewProfessionalFeedback } from '../../utils/feedbackAccess';
import { getEffectiveRoles } from '../../utils/roles';

interface DropdownItem {
  label: string;
  path: string;
  section?: string;
  module?: ModuleKey;
  requiresFeedbackAccess?: boolean;
}

interface NavItem {
  label: string;
  path: string;
  module: ModuleKey | ModuleKey[];
  activePaths?: string[];
  dropdown?: DropdownItem[];
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    path: '/home',
    module: 'home',
    dropdown: [
      { label: 'Dashboard', path: '/home' },
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
    label: 'Clinical Inbox',
    path: '/clinical-inbox',
    module: 'clinical_inbox',
    dropdown: [
      { label: 'All Work', path: '/clinical-inbox' },
      { label: 'Messages', path: '/clinical-inbox?queue=messages' },
      { label: 'Rx / ePA', path: '/clinical-inbox?queue=rx' },
      { label: 'Results', path: '/clinical-inbox?queue=results' },
      { label: 'Admin', path: '/clinical-inbox?queue=admin' },
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
    label: 'Coding Review',
    path: '/coding-review',
    module: 'coding_review',
    dropdown: [
      { label: 'Post-Visit Queue', path: '/coding-review' },
      { label: 'Missing Diagnosis', path: '/coding-review?issue=missing_diagnosis' },
      { label: 'Missing CPT', path: '/coding-review?issue=missing_charge' },
      { label: 'Needs Dx Link', path: '/coding-review?issue=diagnosis_link_needed' },
      { label: 'Unsigned Notes', path: '/coding-review?issue=note_unsigned' },
      { label: 'Include Cleared', path: '/coding-review?includeCleared=true' },
    ]
  },
  {
    label: 'AI Assistant',
    path: '/ai-assistant',
    module: 'ai_assistant',
  },
  {
    label: 'Rx / ePA',
    path: '/rx',
    activePaths: ['/rx', '/prior-auth'],
    module: ['rx', 'epa'],
    dropdown: [
      { label: 'All Prescriptions', path: '/rx', section: 'Rx', module: 'rx' },
      { label: 'New Rx', path: '/rx?action=new', section: 'Rx', module: 'rx' },
      { label: 'Refill Requests', path: '/rx?tab=refills', section: 'Rx', module: 'rx' },
      { label: 'Pending Rx', path: '/rx?tab=pending', section: 'Rx', module: 'rx' },
      { label: 'All Prior Auths', path: '/prior-auth', section: 'ePA', module: 'epa' },
      { label: 'New ePA Request', path: '/prior-auth?action=new', section: 'ePA', module: 'epa' },
      { label: 'Pending ePA', path: '/prior-auth?status=pending', section: 'ePA', module: 'epa' },
      { label: 'Approved ePA', path: '/prior-auth?status=approved', section: 'ePA', module: 'epa' },
    ]
  },
  {
    label: 'Labs/Path',
    path: '/labs',
    module: 'labs',
    dropdown: [
      { label: 'Biopsy Safety', path: '/biopsies', section: 'PATH' },
      { label: 'All Open Orders', path: '/labs?tab=all-open', section: 'ALL' },
      { label: 'Open Orders', path: '/labs?tab=open', section: 'PATH' },
      { label: 'Pending Results', path: '/labs?tab=pending-results', section: 'PATH' },
      { label: 'Pending Plan', path: '/labs?tab=pending-plan', section: 'PATH' },
      { label: 'Completed', path: '/labs?tab=completed', section: 'PATH' },
      { label: 'Unresolved', path: '/labs?tab=unresolved', section: 'PATH' },
      { label: 'Open Orders', path: '/labs?tab=lab-open', section: 'LAB' },
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
    label: 'Documents / Handouts',
    path: '/documents',
    activePaths: ['/documents', '/handouts'],
    module: ['documents', 'handouts'],
    dropdown: [
      { label: 'All Documents', path: '/documents', section: 'Documents', module: 'documents' },
      { label: 'Upload', path: '/documents?action=upload', section: 'Documents', module: 'documents' },
      { label: 'Forms & Consents', path: '/documents?section=forms', section: 'Documents', module: 'documents' },
      { label: 'Recent Documents', path: '/documents?filter=recent', section: 'Documents', module: 'documents' },
      { label: 'Browse Library', path: '/handouts', section: 'Handouts', module: 'handouts' },
      { label: 'Assigned', path: '/handouts?tab=assigned', section: 'Handouts', module: 'handouts' },
      { label: 'Custom', path: '/handouts?tab=custom', section: 'Handouts', module: 'handouts' },
    ]
  },
  {
    label: 'Clinical Photos',
    path: '/photos',
    module: 'photos',
    dropdown: [
      { label: 'Imaging Workbench', path: '/photos' },
      { label: 'Needs Context', path: '/photos?workflow=needs-context' },
      { label: 'Needs Chart Link', path: '/photos?workflow=needs-encounter' },
      { label: 'Compare Ready', path: '/photos?workflow=compare-ready' },
      { label: 'Upload', path: '/photos?action=upload' },
      { label: 'Recent', path: '/photos?filter=recent' },
    ]
  },
  {
    label: 'Registry & Recalls',
    path: '/reminders',
    module: 'reminders',
    dropdown: [
      { label: 'Recall Campaigns', path: '/reminders?tab=campaigns', section: 'Recalls' },
      { label: 'Due for Recall', path: '/reminders?tab=due', section: 'Recalls' },
      { label: 'Contact History', path: '/reminders?tab=history', section: 'Recalls' },
      { label: 'Statistics', path: '/reminders?tab=stats', section: 'Recalls' },
      { label: 'Registry Dashboard', path: '/reminders?tab=registry&registryTab=dashboard', section: 'Disease Registry' },
      { label: 'Melanoma', path: '/reminders?tab=registry&registryTab=melanoma', section: 'Disease Registry' },
      { label: 'Psoriasis', path: '/reminders?tab=registry&registryTab=psoriasis', section: 'Disease Registry' },
      { label: 'Acne/Isotretinoin', path: '/reminders?tab=registry&registryTab=acne', section: 'Disease Registry' },
      { label: 'Chronic Therapy', path: '/reminders?tab=registry&registryTab=chronic_therapy', section: 'Disease Registry' },
      { label: 'Registry Alerts', path: '/reminders?tab=registry&registryTab=alerts', section: 'Disease Registry' },
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
      { label: 'Urgent', path: '/referrals?priority=urgent' },
      { label: 'In Progress', path: '/referrals?status=in_progress' },
      { label: 'Completed', path: '/referrals?status=completed' },
      { label: 'New Referral', path: '/referrals?action=new' },
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
      { label: 'Order This Week', path: '/inventory?filter=order-week' },
      { label: 'Order This Month', path: '/inventory?filter=order-month' },
      { label: 'Add Item', path: '/inventory?action=add' },
      { label: 'Usage Report', path: '/inventory?tab=usage' },
    ]
  },
  {
    label: 'Store',
    path: '/store-ops',
    module: 'store',
    dropdown: [
      { label: 'Order Queue', path: '/store-ops', section: 'Store' },
      { label: 'Products', path: '/store-ops?tab=products', section: 'Store' },
      { label: 'Deals', path: '/store-ops?tab=deals', section: 'Store' },
      { label: 'Shipping', path: '/store-ops?tab=shipping', section: 'Store' },
      { label: 'Payments', path: '/store-ops?tab=payments', section: 'Store' },
      { label: 'Notifications', path: '/store-ops?tab=notifications', section: 'Store' },
      { label: 'Patient Storefront', path: '/store', section: 'Patient Portal' },
    ]
  },
  {
    label: 'Financials / Analytics',
    path: '/financials',
    activePaths: ['/financials', '/analytics', '/reports'],
    module: ['financials', 'analytics'],
    dropdown: [
      { label: 'Revenue', path: '/financials?tab=revenue', section: 'Financials', module: 'financials' },
      { label: 'Collections', path: '/financials', section: 'Financials', module: 'financials' },
      { label: 'Historical Trends', path: '/financials?tab=snapshots', section: 'Financials', module: 'financials' },
      { label: 'Bills', path: '/financials?tab=bills', section: 'Financials', module: 'financials' },
      { label: 'Payments', path: '/financials?tab=payments', section: 'Financials', module: 'financials' },
      { label: 'Dashboard', path: '/analytics', section: 'Analytics', module: 'analytics' },
      { label: 'Financial Analytics', path: '/analytics?tab=financials', section: 'Analytics', module: 'analytics' },
      { label: 'Clinical & Operational', path: '/analytics?tab=clinical', section: 'Analytics', module: 'analytics' },
      { label: 'Compliance', path: '/analytics?tab=compliance', section: 'Analytics', module: 'analytics' },
      { label: 'Inventory', path: '/analytics?tab=inventory', section: 'Analytics', module: 'analytics' },
      { label: 'Dermatology', path: '/analytics?tab=dermatology', section: 'Analytics', module: 'analytics' },
      { label: 'All Reports', path: '/reports', section: 'Reports', module: 'analytics' },
      { label: 'Appointments', path: '/reports?type=appointments', section: 'Reports', module: 'analytics' },
      { label: 'Financial', path: '/reports?type=financial', section: 'Reports', module: 'analytics' },
      { label: 'Clinical', path: '/reports?type=clinical', section: 'Reports', module: 'analytics' },
      { label: 'Patients', path: '/reports?type=patients', section: 'Reports', module: 'analytics' },
      { label: 'No-Shows', path: '/reports?type=no-shows', section: 'Reports', module: 'analytics' },
    ]
  },
  {
    label: 'Claims / Clearinghouse',
    path: '/claims',
    activePaths: ['/claims', '/clearinghouse'],
    module: ['claims', 'clearinghouse'],
    dropdown: [
      { label: 'All Claims', path: '/claims', section: 'Claims', module: 'claims' },
      { label: 'Pending', path: '/claims?status=pending', section: 'Claims', module: 'claims' },
      { label: 'Submitted', path: '/claims?status=submitted', section: 'Claims', module: 'claims' },
      { label: 'Denied', path: '/claims?status=denied', section: 'Claims', module: 'claims' },
      { label: 'Coding Review', path: '/coding-review', section: 'Claims', module: 'coding_review' },
      { label: 'Dashboard', path: '/clearinghouse', section: 'Clearinghouse', module: 'clearinghouse' },
      { label: 'Submissions', path: '/clearinghouse?tab=submissions', section: 'Clearinghouse', module: 'clearinghouse' },
      { label: 'ERA', path: '/clearinghouse?tab=era', section: 'Clearinghouse', module: 'clearinghouse' },
      { label: 'EFT', path: '/clearinghouse?tab=eft', section: 'Clearinghouse', module: 'clearinghouse' },
      { label: 'Reconciliation', path: '/clearinghouse?tab=reconciliation', section: 'Clearinghouse', module: 'clearinghouse' },
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
      { label: 'Recent', path: '/admin/audit-log?preset=recent' },
      { label: 'By User', path: '/admin/audit-log?preset=by-user' },
      { label: 'Failed Logins', path: '/admin/audit-log?preset=failed-logins' },
    ]
  },
  {
    label: 'Admin',
    path: '/admin',
    module: 'admin',
    dropdown: [
      { label: 'Admin Dashboard', path: '/admin' },
      { label: 'Facilities', path: '/admin?tab=facilities' },
      { label: 'Rooms', path: '/admin?tab=rooms' },
      { label: 'Providers', path: '/admin?tab=providers' },
      { label: 'Users', path: '/admin?tab=users' },
      { label: 'Access Control', path: '/admin?tab=permissions' },
      { label: 'Settings', path: '/admin?tab=settings' },
      { label: 'Integrations', path: '/admin/integrations' },
      { label: 'Fee Schedules', path: '/admin/fee-schedules' },
      { label: 'AI Agents', path: '/admin/ai-agents' },
      { label: 'Audit Log', path: '/admin/audit-log' },
      { label: 'Feedback Inbox', path: '/admin/feedback', requiresFeedbackAccess: true },
    ]
  },
];

export function MainNav() {
  const location = useLocation();
  const { session, user } = useAuth();
  const accessControl = useAccessControl();
  const [unreadCount, setUnreadCount] = useState(0);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const navItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userRole = useMemo(() => getEffectiveRoles(user), [user]);

  const canAccessAnyModule = useCallback(
    (modules: ModuleKey | ModuleKey[]) => {
      const moduleList = Array.isArray(modules) ? modules : [modules];
      return moduleList.some((module) => accessControl.canAccessModule(module, userRole));
    },
    [accessControl, userRole]
  );

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => canAccessAnyModule(item.module));

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
    if (!accessControl.canAccessModule('mail', userRole)) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetchUnreadCount(session.tenantId, session.accessToken);
      setUnreadCount(response.count || 0);
    } catch (err) {
      // Silently fail - don't show error for unread count
      console.warn('Failed to load unread count:', err);
    }
  }, [accessControl, session, userRole]);

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

  const isActive = (item: NavItem) => {
    const paths = [item.path, ...(item.activePaths || [])];
    if (paths.includes('/home')) {
      return location.pathname === '/home' || location.pathname === '/';
    }
    return paths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
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
                className={`ema-nav-link ${isActive(item) ? 'active' : ''}`}
                aria-current={isActive(item) ? 'page' : undefined}
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
        const visibleDropdown = item.dropdown.filter((dropdownItem) => {
          if (dropdownItem.requiresFeedbackAccess && !canViewProfessionalFeedback(user)) return false;
          return !dropdownItem.module || accessControl.canAccessModule(dropdownItem.module, userRole);
        });
        if (visibleDropdown.length === 0) return null;

        return createPortal(
          <div
            className="ema-nav-dropdown-portal"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            onMouseEnter={handleDropdownEnter}
            onMouseLeave={handleDropdownLeave}
            role="menu"
          >
            {(() => {
              const sections = new Set(visibleDropdown.map(d => d.section).filter(Boolean));
              if (sections.size > 0) {
                return Array.from(sections).map((section) => (
                  <div key={section} className="ema-nav-dropdown-section">
                    <div className="ema-nav-dropdown-section-title">{section}</div>
                    {visibleDropdown
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
                return visibleDropdown.map((dropdownItem) => (
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

      {/* Accent line under nav */}
      <div className="ema-nav-accent" aria-hidden="true" />
    </>
  );
}

// Mobile navigation with hamburger menu
export function MobileNav() {
  return null; // We'll implement mobile later if needed
}
