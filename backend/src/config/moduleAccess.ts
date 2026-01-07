export type Role = "admin" | "provider" | "ma" | "front_desk";

export type ModuleKey =
  | "home"
  | "schedule"
  | "office_flow"
  | "appt_flow"
  | "waitlist"
  | "patients"
  | "notes"
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

export const moduleAccess: Record<ModuleKey, Role[]> = {
  home: ["admin", "provider", "ma", "front_desk"],
  schedule: ["admin", "provider", "ma", "front_desk"],
  office_flow: ["admin", "provider", "ma", "front_desk"],
  appt_flow: ["admin", "provider", "ma", "front_desk"],
  waitlist: ["admin", "provider", "ma", "front_desk"],
  patients: ["admin", "provider", "ma", "front_desk"],
  notes: ["admin", "provider", "ma"],
  orders: ["admin", "provider"],
  rx: ["admin", "provider"],
  epa: ["admin", "provider"],
  labs: ["admin", "provider", "ma"],
  radiology: ["admin", "provider", "ma"],
  text_messages: ["admin", "provider", "ma", "front_desk"],
  mail: ["admin", "provider", "ma", "front_desk"],
  direct: ["admin", "provider", "ma", "front_desk"],
  fax: ["admin", "provider", "ma", "front_desk"],
  documents: ["admin", "provider", "ma", "front_desk"],
  photos: ["admin", "provider", "ma"],
  body_diagram: ["admin", "provider", "ma"],
  handouts: ["admin", "provider", "ma", "front_desk"],
  tasks: ["admin", "provider", "ma", "front_desk"],
  reminders: ["admin", "provider", "ma", "front_desk"],
  recalls: ["admin", "provider", "ma", "front_desk"],
  analytics: ["admin", "provider"],
  reports: ["admin", "provider"],
  quality: ["admin", "provider"],
  registry: ["admin", "provider"],
  referrals: ["admin", "provider", "ma", "front_desk"],
  forms: ["admin", "provider", "ma", "front_desk"],
  protocols: ["admin", "provider"],
  templates: ["admin", "provider"],
  preferences: ["admin", "provider", "ma", "front_desk"],
  help: ["admin", "provider", "ma", "front_desk"],
  telehealth: ["admin", "provider"],
  inventory: ["admin", "ma", "front_desk"],
  financials: ["admin", "front_desk"],
  claims: ["admin", "front_desk"],
  clearinghouse: ["admin", "front_desk"],
  quotes: ["admin", "front_desk", "ma"],
  admin: ["admin"],
};

export function canAccessModule(role: Role | undefined, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  return moduleAccess[moduleKey].includes(role);
}
