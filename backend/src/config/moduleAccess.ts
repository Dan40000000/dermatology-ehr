import type { Role } from "../types";

const ROLE_ALIASES: Record<string, Role> = {
  medical_assistant: "ma",
  medicalassistant: "ma",
  frontdesk: "front_desk",
  front_desk: "front_desk",
  receptionist: "front_desk",
  biller: "billing",
  owner: "admin",
  practice_owner: "admin",
  compliance: "compliance_officer",
};

export type ModuleKey =
  | "home"
  | "schedule"
  | "office_flow"
  | "appt_flow"
  | "waitlist"
  | "patients"
  | "notes"
  | "ambient_scribe"
  | "orders"
  | "rx"
  | "epa"
  | "labs"
  | "radiology"
  | "text_messages"
  | "mail"
  | "direct"
  | "fax"
  | "documents"
  | "photos"
  | "body_diagram"
  | "handouts"
  | "tasks"
  | "reminders"
  | "recalls"
  | "analytics"
  | "reports"
  | "quality"
  | "registry"
  | "referrals"
  | "forms"
  | "protocols"
  | "templates"
  | "preferences"
  | "help"
  | "telehealth"
  | "inventory"
  | "financials"
  | "claims"
  | "clearinghouse"
  | "quotes"
  | "admin";

const CLINICAL_ROLES: Role[] = ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"];
const OPERATIONS_ROLES: Role[] = ["admin", "front_desk", "scheduler", "manager"];
const COMMUNICATION_ROLES: Role[] = [...OPERATIONS_ROLES, "provider", "ma", "nurse", "billing"];
const FINANCIAL_DASHBOARD_ROLES: Role[] = ["admin", "billing", "manager", "compliance_officer"];
const REVENUE_CYCLE_ROLES: Role[] = ["admin", "billing", "front_desk", "manager", "compliance_officer"];
const BASIC_WORKFORCE_ROLES: Role[] = ["staff", "hr"];
const PATIENT_ACCESS_ROLES: Role[] = [...OPERATIONS_ROLES, "provider", "ma", "nurse", "billing", "compliance_officer"];

export const moduleAccess: Record<ModuleKey, Role[]> = {
  home: [...PATIENT_ACCESS_ROLES, ...BASIC_WORKFORCE_ROLES],
  schedule: PATIENT_ACCESS_ROLES,
  office_flow: PATIENT_ACCESS_ROLES,
  appt_flow: PATIENT_ACCESS_ROLES,
  waitlist: PATIENT_ACCESS_ROLES,
  patients: PATIENT_ACCESS_ROLES,
  notes: CLINICAL_ROLES,
  ambient_scribe: CLINICAL_ROLES,
  orders: CLINICAL_ROLES,
  rx: CLINICAL_ROLES,
  epa: CLINICAL_ROLES,
  labs: CLINICAL_ROLES,
  radiology: CLINICAL_ROLES,
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
  analytics: ["admin", "manager", "compliance_officer"],
  reports: ["admin", "provider", "manager", "billing", "compliance_officer"],
  quality: ["admin", "provider", "manager", "compliance_officer"],
  registry: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  referrals: ["admin", "provider", "ma", "nurse", "front_desk", "scheduler", "manager"],
  forms: PATIENT_ACCESS_ROLES,
  protocols: ["admin", "provider", "ma", "nurse", "manager"],
  templates: ["admin", "provider", "ma", "manager"],
  preferences: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  help: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer", "staff", "hr"],
  telehealth: ["admin", "provider", "ma", "nurse", "manager"],
  inventory: ["admin", "ma", "front_desk", "manager"],
  financials: FINANCIAL_DASHBOARD_ROLES,
  claims: REVENUE_CYCLE_ROLES,
  clearinghouse: REVENUE_CYCLE_ROLES,
  quotes: ["admin", "front_desk", "ma", "manager", "billing"],
  admin: ["admin"],
};

function normalizeRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  return (ROLE_ALIASES[normalized] || normalized) as Role;
}

export function canAccessModule(roleOrRoles: Role | Role[] | undefined, moduleKey: ModuleKey): boolean {
  const roles = Array.isArray(roleOrRoles)
    ? roleOrRoles
    : roleOrRoles
    ? [roleOrRoles]
    : [];
  if (roles.length === 0) return false;
  const normalizedRoles = roles.map(normalizeRole).filter((role): role is Role => role !== null);
  if (normalizedRoles.length === 0) return false;
  const allowedRoles = moduleAccess[moduleKey]
    .map(normalizeRole)
    .filter((role): role is Role => role !== null);
  return normalizedRoles.some((role) => allowedRoles.includes(role));
}
