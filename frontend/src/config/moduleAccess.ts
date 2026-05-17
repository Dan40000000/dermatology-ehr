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
