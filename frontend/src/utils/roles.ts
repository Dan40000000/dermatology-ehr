import type { User, UserRole } from '../types';

const ROLE_ALIASES: Record<string, UserRole> = {
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
};

function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return (ROLE_ALIASES[normalized] || normalized) as UserRole;
}

export function normalizeRoleArray(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const roles: UserRole[] = [];
  for (const entry of value) {
    const role = normalizeRole(entry);
    if (!role || seen.has(role)) continue;
    seen.add(role);
    roles.push(role);
  }
  return roles;
}

export function buildEffectiveRoles(primaryRole: unknown, secondaryRoles: unknown): UserRole[] {
  const primary = normalizeRole(primaryRole);
  const secondary = normalizeRoleArray(secondaryRoles);
  const roles: UserRole[] = [];
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

export function getEffectiveRoles(user: Pick<User, 'role' | 'roles' | 'secondaryRoles'> | null | undefined): UserRole[] {
  if (!user) return [];
  return buildEffectiveRoles(user.role, user.roles || user.secondaryRoles);
}

export function hasRole(
  user: Pick<User, 'role' | 'roles' | 'secondaryRoles'> | null | undefined,
  role: UserRole,
): boolean {
  return getEffectiveRoles(user).includes(role);
}

export function hasAnyRole(
  user: Pick<User, 'role' | 'roles' | 'secondaryRoles'> | null | undefined,
  roles: UserRole[],
): boolean {
  const effectiveRoles = getEffectiveRoles(user);
  return roles.some((role) => effectiveRoles.includes(role));
}
