import type { Role } from "../types";

const ROLE_ALIASES: Record<string, Role> = {
  medical_assistant: "ma",
  medicalassistant: "ma",
  frontdesk: "front_desk",
  front_desk: "front_desk",
  receptionist: "front_desk",
  biller: "billing",
  billing_staff: "billing",
  owner: "admin",
  practice_owner: "admin",
  compliance: "compliance_officer",
  compliance_officer: "compliance_officer",
  complianceofficer: "compliance_officer",
  physician: "provider",
  doctor: "provider",
  clinician: "provider",
};

export const CLINICAL_ROLES: Role[] = [
  "admin",
  "provider",
  "ma",
  "nurse",
  "manager",
  "compliance_officer",
];

export const FINANCIAL_DASHBOARD_ROLES: Role[] = [
  "admin",
  "billing",
  "manager",
  "compliance_officer",
];

export const REVENUE_CYCLE_ROLES: Role[] = [
  "admin",
  "billing",
  "front_desk",
  "manager",
  "compliance_officer",
];

export const CHARGE_CAPTURE_ROLES: Role[] = [
  ...REVENUE_CYCLE_ROLES,
  "provider",
  "ma",
];

export const FINANCIAL_ROLES: Role[] = REVENUE_CYCLE_ROLES;

function normalizeRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const canonical = ROLE_ALIASES[normalized] || normalized;
  return canonical as Role;
}

export function normalizeRoleArray(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const roles: Role[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    const normalized = normalizeRole(candidate);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    roles.push(normalized);
  }

  return roles;
}

export function buildEffectiveRoles(primaryRole: unknown, secondaryRoles: unknown): Role[] {
  const primary = normalizeRole(primaryRole);
  const secondary = normalizeRoleArray(secondaryRoles);
  const roles: Role[] = [];
  const seen = new Set<string>();

  if (primary) {
    roles.push(primary);
    seen.add(primary);
  }

  for (const role of secondary) {
    if (seen.has(role)) continue;
    seen.add(role);
    roles.push(role);
  }

  return roles;
}

export function userHasRole(user: { role?: Role; roles?: Role[]; secondaryRoles?: Role[] } | undefined, role: Role): boolean {
  if (!user) return false;
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return buildEffectiveRoles(user.role, user.roles || user.secondaryRoles).includes(normalizedRole);
}

export function userHasAnyRole(
  user: { role?: Role; roles?: Role[]; secondaryRoles?: Role[] } | undefined,
  allowedRoles: Role[],
): boolean {
  if (!user) return false;
  const normalizedAllowedRoles = normalizeRoleArray(allowedRoles);
  if (normalizedAllowedRoles.length === 0) return false;
  const effectiveRoles = buildEffectiveRoles(user.role, user.roles || user.secondaryRoles);
  return normalizedAllowedRoles.some((allowed) => effectiveRoles.includes(allowed));
}
