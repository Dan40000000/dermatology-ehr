import type { Role } from "../types";

export const FINANCIAL_ROLES: Role[] = ["admin", "billing", "front_desk"];

function normalizeRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized as Role;
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
  return buildEffectiveRoles(user.role, user.roles || user.secondaryRoles).includes(role);
}

export function userHasAnyRole(
  user: { role?: Role; roles?: Role[]; secondaryRoles?: Role[] } | undefined,
  allowedRoles: Role[],
): boolean {
  if (!user) return false;
  const effectiveRoles = buildEffectiveRoles(user.role, user.roles || user.secondaryRoles);
  return allowedRoles.some((allowed) => effectiveRoles.includes(allowed));
}

