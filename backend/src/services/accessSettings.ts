import { pool } from "../db/pool";
import { canAccessModule as canAccessDefaultModule, moduleAccess, type ModuleKey } from "../config/moduleAccess";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";
import type { Role } from "../types";

export const MANAGEABLE_ACCESS_ROLES: Role[] = [
  "admin",
  "provider",
  "billing",
  "front_desk",
  "ma",
  "nurse",
  "scheduler",
  "manager",
  "compliance_officer",
  "staff",
  "hr",
];

export type CommandCenterSectionKey =
  | "header_billing_backlog"
  | "metric_schedule"
  | "metric_revenue"
  | "metric_collections"
  | "metric_clinical_work"
  | "metric_patient_access"
  | "metric_revenue_cycle"
  | "metric_clinical_inbox"
  | "priority_pathology"
  | "priority_claims"
  | "priority_billing"
  | "priority_patient_ready"
  | "priority_provider_desk"
  | "panel_risk_queue"
  | "panel_revenue_pulse"
  | "panel_front_desk"
  | "panel_provider_throughput"
  | "panel_end_of_day"
  | "panel_patient_flow"
  | "panel_clinical_work"
  | "panel_revenue_cycle"
  | "banner_pathology"
  | "quick_actions";

export type ModuleAccessSettings = Partial<Record<ModuleKey, Role[]>>;
export type CommandCenterAccessSettings = Partial<Record<CommandCenterSectionKey, Role[]>>;

export interface TenantAccessSettings {
  moduleAccess: ModuleAccessSettings;
  commandCenterAccess: CommandCenterAccessSettings;
  updatedAt: string | null;
  updatedBy: string | null;
}

const CLINICAL_ROLES: Role[] = ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"];
const OPERATIONS_ROLES: Role[] = ["admin", "front_desk", "scheduler", "manager"];
const FINANCIAL_DASHBOARD_ROLES: Role[] = ["admin", "billing", "manager", "compliance_officer"];
const REVENUE_CYCLE_COMMAND_ROLES: Role[] = ["admin", "billing", "manager", "compliance_officer"];
const PATIENT_ACCESS_ROLES: Role[] = [
  ...OPERATIONS_ROLES,
  "provider",
  "ma",
  "nurse",
  "billing",
  "compliance_officer",
];

export const defaultCommandCenterAccess: Record<CommandCenterSectionKey, Role[]> = {
  header_billing_backlog: REVENUE_CYCLE_COMMAND_ROLES,
  metric_schedule: PATIENT_ACCESS_ROLES,
  metric_revenue: FINANCIAL_DASHBOARD_ROLES,
  metric_collections: FINANCIAL_DASHBOARD_ROLES,
  metric_clinical_work: CLINICAL_ROLES,
  metric_patient_access: PATIENT_ACCESS_ROLES,
  metric_revenue_cycle: REVENUE_CYCLE_COMMAND_ROLES,
  metric_clinical_inbox: [...PATIENT_ACCESS_ROLES, "staff", "hr"],
  priority_pathology: CLINICAL_ROLES,
  priority_claims: REVENUE_CYCLE_COMMAND_ROLES,
  priority_billing: REVENUE_CYCLE_COMMAND_ROLES,
  priority_patient_ready: PATIENT_ACCESS_ROLES,
  priority_provider_desk: CLINICAL_ROLES,
  panel_risk_queue: PATIENT_ACCESS_ROLES,
  panel_revenue_pulse: FINANCIAL_DASHBOARD_ROLES,
  panel_front_desk: OPERATIONS_ROLES,
  panel_provider_throughput: ["admin", "provider", "ma", "nurse", "manager"],
  panel_end_of_day: [...PATIENT_ACCESS_ROLES, "billing", "compliance_officer"],
  panel_patient_flow: PATIENT_ACCESS_ROLES,
  panel_clinical_work: CLINICAL_ROLES,
  panel_revenue_cycle: REVENUE_CYCLE_COMMAND_ROLES,
  banner_pathology: CLINICAL_ROLES,
  quick_actions: [...PATIENT_ACCESS_ROLES, "billing", "staff", "hr"],
};

const moduleKeys = Object.keys(moduleAccess) as ModuleKey[];
const commandCenterKeys = Object.keys(defaultCommandCenterAccess) as CommandCenterSectionKey[];

function uniqueRoles(value: unknown): Role[] {
  return normalizeRoleArray(value).filter((role) => MANAGEABLE_ACCESS_ROLES.includes(role));
}

function withRequiredRoles(moduleKey: ModuleKey, roles: Role[]): Role[] {
  const next = new Set<Role>(roles);
  next.add("admin");

  if (moduleKey === "home") {
    MANAGEABLE_ACCESS_ROLES.forEach((role) => next.add(role));
  }

  return MANAGEABLE_ACCESS_ROLES.filter((role) => next.has(role));
}

function withRequiredCommandRoles(_sectionKey: CommandCenterSectionKey, roles: Role[]): Role[] {
  const next = new Set<Role>(roles);
  next.add("admin");
  return MANAGEABLE_ACCESS_ROLES.filter((role) => next.has(role));
}

export function sanitizeModuleAccess(input: unknown): ModuleAccessSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  return moduleKeys.reduce<ModuleAccessSettings>((acc, moduleKey) => {
    const candidate = raw[moduleKey];
    const fallback = moduleAccess[moduleKey] || [];
    const roles = Array.isArray(candidate) ? uniqueRoles(candidate) : uniqueRoles(fallback);
    acc[moduleKey] = withRequiredRoles(moduleKey, roles);
    return acc;
  }, {});
}

export function sanitizeCommandCenterAccess(input: unknown): CommandCenterAccessSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  return commandCenterKeys.reduce<CommandCenterAccessSettings>((acc, sectionKey) => {
    const candidate = raw[sectionKey];
    const fallback = defaultCommandCenterAccess[sectionKey] || [];
    const roles = Array.isArray(candidate) ? uniqueRoles(candidate) : uniqueRoles(fallback);
    acc[sectionKey] = withRequiredCommandRoles(sectionKey, roles);
    return acc;
  }, {});
}

function mapSettingsRow(row?: any): TenantAccessSettings {
  return {
    moduleAccess: sanitizeModuleAccess(row?.module_access),
    commandCenterAccess: sanitizeCommandCenterAccess(row?.command_center_access),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row?.updated_by || null,
  };
}

function isMissingAccessSettingsTable(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
  );
}

function isAccessSettingsBootstrapRace(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ["23505", "42710", "42P07"].includes((error as { code?: string }).code || "")
  );
}

async function databaseObjectExists(name: string): Promise<boolean> {
  const result = await pool.query(`select to_regclass($1) as object_name`, [name]);
  return Boolean(result.rows[0]?.object_name);
}

async function createTableIfNeeded() {
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_access_settings (
      tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      module_access jsonb NOT NULL DEFAULT '{}'::jsonb,
      command_center_access jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  } catch (error) {
    if (!isAccessSettingsBootstrapRace(error) || !(await databaseObjectExists("tenant_access_settings"))) {
      throw error;
    }
  }
}

async function createIndexIfNeeded(indexName: string, sql: string) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (!isAccessSettingsBootstrapRace(error) || !(await databaseObjectExists(indexName))) {
      throw error;
    }
  }
}

let ensureAccessSettingsTablePromise: Promise<void> | null = null;

async function ensureAccessSettingsTable() {
  ensureAccessSettingsTablePromise ||= (async () => {
    await createTableIfNeeded();
    await createIndexIfNeeded(
      "idx_tenant_access_settings_module_access",
      `CREATE INDEX IF NOT EXISTS idx_tenant_access_settings_module_access
       ON tenant_access_settings USING GIN (module_access)`,
    );
    await createIndexIfNeeded(
      "idx_tenant_access_settings_command_center_access",
      `CREATE INDEX IF NOT EXISTS idx_tenant_access_settings_command_center_access
       ON tenant_access_settings USING GIN (command_center_access)`,
    );
  })().finally(() => {
    ensureAccessSettingsTablePromise = null;
  });

  await ensureAccessSettingsTablePromise;
}

export async function getTenantAccessSettings(tenantId: string): Promise<TenantAccessSettings> {
  let result;
  try {
    result = await pool.query(
      `select module_access, command_center_access, updated_at, updated_by
       from tenant_access_settings
       where tenant_id = $1`,
      [tenantId],
    );
  } catch (error) {
    if (isMissingAccessSettingsTable(error)) {
      await ensureAccessSettingsTable();
      return mapSettingsRow();
    }
    throw error;
  }

  return mapSettingsRow(result.rows[0]);
}

export async function saveTenantAccessSettings(
  tenantId: string,
  updatedBy: string,
  input: {
    moduleAccess?: unknown;
    commandCenterAccess?: unknown;
  },
): Promise<TenantAccessSettings> {
  const moduleAccessSettings = sanitizeModuleAccess(input.moduleAccess);
  const commandCenterAccessSettings = sanitizeCommandCenterAccess(input.commandCenterAccess);

  const values = [
    tenantId,
    JSON.stringify(moduleAccessSettings),
    JSON.stringify(commandCenterAccessSettings),
    updatedBy,
  ];
  const sql = `insert into tenant_access_settings (
     tenant_id,
     module_access,
     command_center_access,
     updated_by,
     updated_at
   )
   values ($1, $2::jsonb, $3::jsonb, $4, now())
   on conflict (tenant_id) do update
     set module_access = excluded.module_access,
         command_center_access = excluded.command_center_access,
         updated_by = excluded.updated_by,
         updated_at = now()
   returning module_access, command_center_access, updated_at, updated_by`;

  let result;
  try {
    result = await pool.query(sql, values);
  } catch (error) {
    if (!isMissingAccessSettingsTable(error)) {
      throw error;
    }
    await ensureAccessSettingsTable();
    result = await pool.query(sql, values);
  }

  return mapSettingsRow(result.rows[0]);
}

export async function canAccessTenantModule(
  tenantId: string,
  roleOrRoles: Role | Role[] | undefined,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const roles = Array.isArray(roleOrRoles)
    ? roleOrRoles
    : roleOrRoles
      ? [roleOrRoles]
      : [];
  const effectiveRoles = buildEffectiveRoles(roles[0], roles.slice(1));
  if (effectiveRoles.length === 0) return false;

  try {
    const settings = await getTenantAccessSettings(tenantId);
    const allowedRoles = settings.moduleAccess[moduleKey] || moduleAccess[moduleKey] || [];
    return effectiveRoles.some((role) => allowedRoles.includes(role));
  } catch {
    return canAccessDefaultModule(effectiveRoles as any, moduleKey);
  }
}
