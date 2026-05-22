import type { User } from '../types';

export type Role = User['role'];

const ROLE_ALIASES: Record<string, Role> = {
  medical_assistant: 'ma',
  medicalassistant: 'ma',
  frontdesk: 'front_desk',
  front_desk: 'front_desk',
  receptionist: 'front_desk',
  biller: 'billing',
  owner: 'admin',
  practice_owner: 'admin',
  compliance: 'compliance_officer',
  compliance_officer: 'compliance_officer',
  complianceofficer: 'compliance_officer',
  physician: 'provider',
  doctor: 'provider',
  clinician: 'provider',
  pa: 'provider',
  pac: 'provider',
  pa_c: 'provider',
  physician_assistant: 'provider',
  physicianassistant: 'provider',
};

export type ModuleKey =
  | 'home'
  | 'schedule'
  | 'office_flow'
  | 'appt_flow'
  | 'waitlist'
  | 'patients'
  | 'notes'
  | 'ai_assistant'
  | 'ambient_scribe'
  | 'orders'
  | 'rx'
  | 'epa'
  | 'labs'
  | 'radiology'
  | 'clinical_inbox'
  | 'text_messages'
  | 'mail'
  | 'direct'
  | 'fax'
  | 'documents'
  | 'photos'
  | 'body_diagram'
  | 'handouts'
  | 'tasks'
  | 'reminders'
  | 'recalls'
  | 'analytics'
  | 'reports'
  | 'quality'
  | 'registry'
  | 'referrals'
  | 'forms'
  | 'protocols'
  | 'templates'
  | 'help'
  | 'telehealth'
  | 'inventory'
  | 'store'
  | 'financials'
  | 'claims'
  | 'clearinghouse'
  | 'quotes'
  | 'admin';

export const MANAGEABLE_ACCESS_ROLES: Role[] = [
  'admin',
  'provider',
  'billing',
  'front_desk',
  'ma',
  'nurse',
  'scheduler',
  'manager',
  'compliance_officer',
  'staff',
  'hr',
];

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  provider: 'Provider',
  billing: 'Billing',
  front_desk: 'Front Desk',
  ma: 'Medical Assistant',
  nurse: 'Nurse',
  scheduler: 'Scheduler',
  manager: 'Manager',
  compliance_officer: 'Compliance Officer',
  staff: 'Staff',
  hr: 'HR',
};

const CLINICAL_ROLES: Role[] = ['admin', 'provider', 'ma', 'nurse', 'manager', 'compliance_officer'];
const OPERATIONS_ROLES: Role[] = ['admin', 'front_desk', 'scheduler', 'manager'];
const COMMUNICATION_ROLES: Role[] = [...OPERATIONS_ROLES, 'provider', 'ma', 'nurse', 'billing'];
const FINANCIAL_DASHBOARD_ROLES: Role[] = ['admin', 'billing', 'manager', 'compliance_officer'];
const REVENUE_CYCLE_ROLES: Role[] = ['admin', 'billing', 'front_desk', 'manager', 'compliance_officer'];
const BASIC_WORKFORCE_ROLES: Role[] = ['staff', 'hr'];
const PATIENT_ACCESS_ROLES: Role[] = [
  ...OPERATIONS_ROLES,
  'provider',
  'ma',
  'nurse',
  'billing',
  'compliance_officer',
];

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  home: [...PATIENT_ACCESS_ROLES, ...BASIC_WORKFORCE_ROLES],
  schedule: PATIENT_ACCESS_ROLES,
  office_flow: PATIENT_ACCESS_ROLES,
  appt_flow: PATIENT_ACCESS_ROLES,
  waitlist: PATIENT_ACCESS_ROLES,
  patients: PATIENT_ACCESS_ROLES,
  notes: CLINICAL_ROLES,
  ai_assistant: ['admin', 'provider'],
  ambient_scribe: CLINICAL_ROLES,
  orders: CLINICAL_ROLES,
  rx: CLINICAL_ROLES,
  epa: CLINICAL_ROLES,
  labs: CLINICAL_ROLES,
  radiology: CLINICAL_ROLES,
  clinical_inbox: [...PATIENT_ACCESS_ROLES, ...BASIC_WORKFORCE_ROLES],
  text_messages: COMMUNICATION_ROLES,
  mail: COMMUNICATION_ROLES,
  direct: COMMUNICATION_ROLES,
  fax: COMMUNICATION_ROLES,
  documents: PATIENT_ACCESS_ROLES,
  photos: CLINICAL_ROLES,
  body_diagram: CLINICAL_ROLES,
  handouts: PATIENT_ACCESS_ROLES,
  tasks: [...PATIENT_ACCESS_ROLES, ...BASIC_WORKFORCE_ROLES],
  reminders: PATIENT_ACCESS_ROLES,
  recalls: PATIENT_ACCESS_ROLES,
  analytics: ['admin', 'manager', 'compliance_officer'],
  reports: ['admin', 'provider', 'manager', 'billing', 'compliance_officer'],
  quality: ['admin', 'provider', 'manager', 'compliance_officer'],
  registry: PATIENT_ACCESS_ROLES,
  referrals: ['admin', 'provider', 'ma', 'nurse', 'front_desk', 'scheduler', 'manager'],
  forms: PATIENT_ACCESS_ROLES,
  protocols: ['admin', 'provider', 'ma', 'nurse', 'manager'],
  templates: ['admin', 'provider', 'ma', 'manager'],
  help: ['admin', 'provider', 'ma', 'front_desk', 'billing', 'nurse', 'manager', 'scheduler', 'compliance_officer', 'staff', 'hr'],
  telehealth: ['admin', 'provider', 'ma', 'nurse', 'manager'],
  inventory: ['admin', 'ma', 'front_desk', 'manager'],
  store: ['admin', 'front_desk', 'manager', 'billing'],
  financials: FINANCIAL_DASHBOARD_ROLES,
  claims: REVENUE_CYCLE_ROLES,
  clearinghouse: REVENUE_CYCLE_ROLES,
  quotes: ['admin', 'front_desk', 'ma', 'manager', 'billing'],
  admin: ['admin'],
};

export const MODULE_KEYS = Object.keys(MODULE_ACCESS) as ModuleKey[];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  home: 'Command Center',
  schedule: 'Schedule',
  office_flow: 'Office Flow',
  appt_flow: 'Appointment Flow',
  waitlist: 'Waitlist',
  patients: 'Patients',
  notes: 'Notes',
  ai_assistant: 'AI Assistant',
  ambient_scribe: 'Ambient Scribe',
  orders: 'Orders',
  rx: 'Rx',
  epa: 'ePA',
  labs: 'Labs / Pathology',
  radiology: 'Radiology',
  clinical_inbox: 'Clinical Inbox',
  text_messages: 'Text Messages',
  mail: 'Mail',
  direct: 'Direct',
  fax: 'Fax',
  documents: 'Documents',
  photos: 'Photos',
  body_diagram: 'Body Diagram',
  handouts: 'Handouts',
  tasks: 'Tasks',
  reminders: 'Reminders',
  recalls: 'Recalls',
  analytics: 'Analytics',
  reports: 'Reports',
  quality: 'Quality',
  registry: 'Registry',
  referrals: 'Referrals',
  forms: 'Forms',
  protocols: 'Protocols',
  templates: 'Templates',
  help: 'Help',
  telehealth: 'Telehealth',
  inventory: 'Inventory',
  store: 'Store',
  financials: 'Financials',
  claims: 'Claims',
  clearinghouse: 'Clearinghouse',
  quotes: 'Quotes',
  admin: 'Admin',
};

export type CommandCenterSectionKey =
  | 'header_billing_backlog'
  | 'metric_schedule'
  | 'metric_revenue'
  | 'metric_collections'
  | 'metric_clinical_work'
  | 'metric_patient_access'
  | 'metric_revenue_cycle'
  | 'metric_clinical_inbox'
  | 'priority_pathology'
  | 'priority_claims'
  | 'priority_billing'
  | 'priority_patient_ready'
  | 'priority_provider_desk'
  | 'panel_risk_queue'
  | 'panel_revenue_pulse'
  | 'panel_front_desk'
  | 'panel_provider_throughput'
  | 'panel_end_of_day'
  | 'panel_patient_flow'
  | 'panel_clinical_work'
  | 'panel_revenue_cycle'
  | 'banner_pathology'
  | 'quick_actions';

export const COMMAND_CENTER_LABELS: Record<CommandCenterSectionKey, string> = {
  header_billing_backlog: 'Header billing backlog',
  metric_schedule: 'Metric: schedule',
  metric_revenue: 'Metric: revenue',
  metric_collections: 'Metric: collections',
  metric_clinical_work: 'Metric: clinical work',
  metric_patient_access: 'Metric: patient access',
  metric_revenue_cycle: 'Metric: revenue cycle',
  metric_clinical_inbox: 'Metric: clinical inbox',
  priority_pathology: 'Priority: pathology',
  priority_claims: 'Priority: claim exceptions',
  priority_billing: 'Priority: billing backlog',
  priority_patient_ready: 'Priority: patient ready',
  priority_provider_desk: 'Priority: provider desk',
  panel_risk_queue: 'Panel: risk queue',
  panel_revenue_pulse: 'Panel: revenue pulse',
  panel_front_desk: 'Panel: front desk',
  panel_provider_throughput: 'Panel: provider throughput',
  panel_end_of_day: 'Panel: end-of-day',
  panel_patient_flow: 'Panel: patient flow',
  panel_clinical_work: 'Panel: clinical work',
  panel_revenue_cycle: 'Panel: revenue cycle',
  banner_pathology: 'Banner: pathology safety',
  quick_actions: 'Quick actions bar',
};

export const COMMAND_CENTER_SECTION_KEYS = Object.keys(COMMAND_CENTER_LABELS) as CommandCenterSectionKey[];

export type ModuleAccessSettings = Partial<Record<ModuleKey, Role[]>>;
export type CommandCenterAccessSettings = Partial<Record<CommandCenterSectionKey, Role[]>>;

export interface AccessSettingsPayload {
  moduleAccess: ModuleAccessSettings;
  commandCenterAccess: CommandCenterAccessSettings;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const REVENUE_CYCLE_COMMAND_ROLES: Role[] = ['admin', 'billing', 'manager', 'compliance_officer'];

export const DEFAULT_COMMAND_CENTER_ACCESS: Record<CommandCenterSectionKey, Role[]> = {
  header_billing_backlog: REVENUE_CYCLE_COMMAND_ROLES,
  metric_schedule: PATIENT_ACCESS_ROLES,
  metric_revenue: FINANCIAL_DASHBOARD_ROLES,
  metric_collections: FINANCIAL_DASHBOARD_ROLES,
  metric_clinical_work: CLINICAL_ROLES,
  metric_patient_access: PATIENT_ACCESS_ROLES,
  metric_revenue_cycle: REVENUE_CYCLE_COMMAND_ROLES,
  metric_clinical_inbox: [...PATIENT_ACCESS_ROLES, ...BASIC_WORKFORCE_ROLES],
  priority_pathology: CLINICAL_ROLES,
  priority_claims: REVENUE_CYCLE_COMMAND_ROLES,
  priority_billing: REVENUE_CYCLE_COMMAND_ROLES,
  priority_patient_ready: PATIENT_ACCESS_ROLES,
  priority_provider_desk: CLINICAL_ROLES,
  panel_risk_queue: PATIENT_ACCESS_ROLES,
  panel_revenue_pulse: FINANCIAL_DASHBOARD_ROLES,
  panel_front_desk: OPERATIONS_ROLES,
  panel_provider_throughput: ['admin', 'provider', 'ma', 'nurse', 'manager'],
  panel_end_of_day: [...PATIENT_ACCESS_ROLES, 'billing', 'compliance_officer'],
  panel_patient_flow: PATIENT_ACCESS_ROLES,
  panel_clinical_work: CLINICAL_ROLES,
  panel_revenue_cycle: REVENUE_CYCLE_COMMAND_ROLES,
  banner_pathology: CLINICAL_ROLES,
  quick_actions: [...PATIENT_ACCESS_ROLES, 'billing', ...BASIC_WORKFORCE_ROLES],
};

export const MODULE_PATHS: Array<{ path: string; module: ModuleKey }> = [
  { path: '/admin', module: 'admin' },
  { path: '/documents/templates', module: 'templates' },
  { path: '/templates', module: 'templates' },
  { path: '/forms', module: 'forms' },
  { path: '/registry', module: 'reminders' },
  { path: '/referrals', module: 'referrals' },
  { path: '/protocols', module: 'protocols' },
  { path: '/help', module: 'help' },
  { path: '/quality', module: 'quality' },
  { path: '/reports', module: 'reports' },
  { path: '/analytics', module: 'analytics' },
  { path: '/financials', module: 'financials' },
  { path: '/claims', module: 'claims' },
  { path: '/clearinghouse', module: 'clearinghouse' },
  { path: '/quotes', module: 'quotes' },
  { path: '/store-ops', module: 'store' },
  { path: '/inventory', module: 'inventory' },
  { path: '/telehealth', module: 'telehealth' },
  { path: '/documents', module: 'documents' },
  { path: '/photos', module: 'photos' },
  { path: '/body-diagram', module: 'body_diagram' },
  { path: '/handouts', module: 'handouts' },
  { path: '/mail', module: 'mail' },
  { path: '/direct', module: 'direct' },
  { path: '/fax', module: 'fax' },
  { path: '/clinical-inbox', module: 'clinical_inbox' },
  { path: '/text-messages', module: 'text_messages' },
  { path: '/tasks', module: 'tasks' },
  { path: '/reminders', module: 'reminders' },
  { path: '/recalls', module: 'reminders' },
  { path: '/labs', module: 'labs' },
  { path: '/biopsies', module: 'labs' },
  { path: '/radiology', module: 'radiology' },
  { path: '/prior-auth', module: 'epa' },
  { path: '/rx', module: 'rx' },
  { path: '/orders', module: 'orders' },
  { path: '/ambient-scribe', module: 'ambient_scribe' },
  { path: '/clinical-copilot', module: 'ai_assistant' },
  { path: '/ai-assistant', module: 'ai_assistant' },
  { path: '/notes', module: 'notes' },
  { path: '/patients', module: 'patients' },
  { path: '/waitlist', module: 'waitlist' },
  { path: '/front-desk', module: 'office_flow' },
  { path: '/room-board', module: 'office_flow' },
  { path: '/appt-flow', module: 'appt_flow' },
  { path: '/office-flow', module: 'office_flow' },
  { path: '/schedule', module: 'schedule' },
  { path: '/home', module: 'home' },
];

export function getModuleForPath(pathname: string): ModuleKey | null {
  const match = MODULE_PATHS.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  return match ? match.module : null;
}

export function canAccessModule(role: Role | Role[] | undefined, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  const roles = (Array.isArray(role) ? role : [role])
    .map((candidate) => String(candidate || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .map((candidate) => ROLE_ALIASES[candidate] || candidate)
    .filter(Boolean);
  if (roles.length === 0) return false;
  const allowed = MODULE_ACCESS[moduleKey]
    .map((candidate) => String(candidate || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .map((candidate) => ROLE_ALIASES[candidate] || candidate);
  return roles.some((candidate) => allowed.includes(candidate));
}

export function normalizeAccessRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return (ROLE_ALIASES[normalized] || normalized) as Role;
}

function normalizeRoleList(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const roles: Role[] = [];
  value.forEach((candidate) => {
    const role = normalizeAccessRole(candidate);
    if (!role || seen.has(role) || !MANAGEABLE_ACCESS_ROLES.includes(role)) return;
    seen.add(role);
    roles.push(role);
  });
  return roles;
}

function enforceRequiredModuleRoles(moduleKey: ModuleKey, roles: Role[]): Role[] {
  const next = new Set<Role>(roles);
  next.add('admin');
  if (moduleKey === 'home') {
    MANAGEABLE_ACCESS_ROLES.forEach((role) => next.add(role));
  }
  return MANAGEABLE_ACCESS_ROLES.filter((role) => next.has(role));
}

function enforceRequiredCommandRoles(roles: Role[]): Role[] {
  const next = new Set<Role>(roles);
  next.add('admin');
  return MANAGEABLE_ACCESS_ROLES.filter((role) => next.has(role));
}

export function resolveModuleAccess(settings?: ModuleAccessSettings | null): Record<ModuleKey, Role[]> {
  return MODULE_KEYS.reduce<Record<ModuleKey, Role[]>>((acc, moduleKey) => {
    const candidate = settings?.[moduleKey];
    const roles = Array.isArray(candidate) ? normalizeRoleList(candidate) : normalizeRoleList(MODULE_ACCESS[moduleKey]);
    acc[moduleKey] = enforceRequiredModuleRoles(moduleKey, roles);
    return acc;
  }, {} as Record<ModuleKey, Role[]>);
}

export function resolveCommandCenterAccess(
  settings?: CommandCenterAccessSettings | null,
): Record<CommandCenterSectionKey, Role[]> {
  return COMMAND_CENTER_SECTION_KEYS.reduce<Record<CommandCenterSectionKey, Role[]>>((acc, sectionKey) => {
    const candidate = settings?.[sectionKey];
    const roles = Array.isArray(candidate)
      ? normalizeRoleList(candidate)
      : normalizeRoleList(DEFAULT_COMMAND_CENTER_ACCESS[sectionKey]);
    acc[sectionKey] = enforceRequiredCommandRoles(roles);
    return acc;
  }, {} as Record<CommandCenterSectionKey, Role[]>);
}

export function canAccessModuleWithSettings(
  role: Role | Role[] | undefined,
  moduleKey: ModuleKey,
  settings?: ModuleAccessSettings | null,
): boolean {
  if (!role) return false;
  const roles = (Array.isArray(role) ? role : [role])
    .map(normalizeAccessRole)
    .filter((candidate): candidate is Role => Boolean(candidate));
  if (roles.length === 0) return false;
  const access = resolveModuleAccess(settings);
  return roles.some((candidate) => access[moduleKey].includes(candidate));
}

export function canAccessCommandCenterSection(
  role: Role | Role[] | undefined,
  sectionKey: CommandCenterSectionKey,
  settings?: CommandCenterAccessSettings | null,
): boolean {
  if (!role) return false;
  const roles = (Array.isArray(role) ? role : [role])
    .map(normalizeAccessRole)
    .filter((candidate): candidate is Role => Boolean(candidate));
  if (roles.length === 0) return false;
  const access = resolveCommandCenterAccess(settings);
  return roles.some((candidate) => access[sectionKey].includes(candidate));
}
