import type { User } from '../types';

export type Role = User['role'];

export type ModuleKey =
  | 'home'
  | 'schedule'
  | 'office_flow'
  | 'appt_flow'
  | 'waitlist'
  | 'patients'
  | 'notes'
  | 'ambient_scribe'
  | 'orders'
  | 'rx'
  | 'epa'
  | 'labs'
  | 'radiology'
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
  | 'preferences'
  | 'help'
  | 'telehealth'
  | 'inventory'
  | 'financials'
  | 'claims'
  | 'clearinghouse'
  | 'quotes'
  | 'admin';

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  home: ['admin', 'provider', 'ma', 'front_desk'],
  schedule: ['admin', 'provider', 'ma', 'front_desk'],
  office_flow: ['admin', 'provider', 'ma', 'front_desk'],
  appt_flow: ['admin', 'provider', 'ma', 'front_desk'],
  waitlist: ['admin', 'provider', 'ma', 'front_desk'],
  patients: ['admin', 'provider', 'ma', 'front_desk'],
  notes: ['admin', 'provider', 'ma'],
  ambient_scribe: ['admin', 'provider', 'ma'],
  orders: ['admin', 'provider'],
  rx: ['admin', 'provider'],
  epa: ['admin', 'provider'],
  labs: ['admin', 'provider', 'ma'],
  radiology: ['admin', 'provider', 'ma'],
  text_messages: ['admin', 'provider', 'ma', 'front_desk'],
  mail: ['admin', 'provider', 'ma', 'front_desk'],
  direct: ['admin', 'provider', 'ma', 'front_desk'],
  fax: ['admin', 'provider', 'ma', 'front_desk'],
  documents: ['admin', 'provider', 'ma', 'front_desk'],
  photos: ['admin', 'provider', 'ma'],
  body_diagram: ['admin', 'provider', 'ma'],
  handouts: ['admin', 'provider', 'ma', 'front_desk'],
  tasks: ['admin', 'provider', 'ma', 'front_desk'],
  reminders: ['admin', 'provider', 'ma', 'front_desk'],
  recalls: ['admin', 'provider', 'ma', 'front_desk'],
  analytics: ['admin', 'provider'],
  reports: ['admin', 'provider'],
  quality: ['admin', 'provider'],
  registry: ['admin', 'provider'],
  referrals: ['admin', 'provider', 'ma', 'front_desk'],
  forms: ['admin', 'provider', 'ma', 'front_desk'],
  protocols: ['admin', 'provider'],
  templates: ['admin', 'provider'],
  preferences: ['admin', 'provider', 'ma', 'front_desk'],
  help: ['admin', 'provider', 'ma', 'front_desk'],
  telehealth: ['admin', 'provider'],
  inventory: ['admin', 'ma', 'front_desk'],
  financials: ['admin', 'billing', 'front_desk'],
  claims: ['admin', 'billing', 'front_desk'],
  clearinghouse: ['admin', 'billing', 'front_desk'],
  quotes: ['admin', 'front_desk', 'ma'],
  admin: ['admin'],
};

export const MODULE_PATHS: Array<{ path: string; module: ModuleKey }> = [
  { path: '/admin', module: 'admin' },
  { path: '/templates', module: 'templates' },
  { path: '/forms', module: 'forms' },
  { path: '/registry', module: 'registry' },
  { path: '/referrals', module: 'referrals' },
  { path: '/protocols', module: 'protocols' },
  { path: '/preferences', module: 'preferences' },
  { path: '/help', module: 'help' },
  { path: '/quality', module: 'quality' },
  { path: '/reports', module: 'reports' },
  { path: '/analytics', module: 'analytics' },
  { path: '/financials', module: 'financials' },
  { path: '/claims', module: 'claims' },
  { path: '/clearinghouse', module: 'clearinghouse' },
  { path: '/quotes', module: 'quotes' },
  { path: '/inventory', module: 'inventory' },
  { path: '/telehealth', module: 'telehealth' },
  { path: '/documents', module: 'documents' },
  { path: '/photos', module: 'photos' },
  { path: '/body-diagram', module: 'body_diagram' },
  { path: '/handouts', module: 'handouts' },
  { path: '/mail', module: 'mail' },
  { path: '/direct', module: 'direct' },
  { path: '/fax', module: 'fax' },
  { path: '/text-messages', module: 'text_messages' },
  { path: '/tasks', module: 'tasks' },
  { path: '/reminders', module: 'reminders' },
  { path: '/recalls', module: 'recalls' },
  { path: '/labs', module: 'labs' },
  { path: '/radiology', module: 'radiology' },
  { path: '/prior-auth', module: 'epa' },
  { path: '/rx', module: 'rx' },
  { path: '/orders', module: 'orders' },
  { path: '/ambient-scribe', module: 'ambient_scribe' },
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
  const roles = Array.isArray(role) ? role : [role];
  return roles.some((candidate) => MODULE_ACCESS[moduleKey].includes(candidate));
}
