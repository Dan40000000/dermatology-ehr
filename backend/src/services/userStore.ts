import { pool } from "../db/pool";
import { TenantUser } from "../types";
import { loadEnv } from "../config/validate";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";

const DEFAULT_PASSWORD = loadEnv().DEFAULT_USER_PASSWORD;

const USER_SELECT_FULL = `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
              password_hash as "passwordHash",
              coalesce(force_password_reset, false) as "forcePasswordReset"
       from users`;

const USER_SELECT_WITH_SECONDARY_ROLES = `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
              password_hash as "passwordHash",
              false as "forcePasswordReset"
       from users`;

const USER_SELECT_LEGACY = `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              password_hash as "passwordHash",
              false as "forcePasswordReset"
       from users`;

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message = "message" in error ? String((error as { message?: string }).message || "") : "";

  return code === "42703" && message.includes(columnName);
}

async function queryUsersWithFallback<T>(
  sqlFull: string,
  sqlWithSecondaryRoles: string,
  sqlLegacy: string,
  params: unknown[],
): Promise<T[]> {
  try {
    const result = await pool.query(sqlFull, params);
    return result.rows as T[];
  } catch (error) {
    if (isMissingColumn(error, "secondary_roles")) {
      const legacyResult = await pool.query(sqlLegacy, params);
      return legacyResult.rows.map((row) => ({
        ...row,
        secondaryRoles: [],
        forcePasswordReset: false,
      })) as T[];
    }

    if (!isMissingColumn(error, "force_password_reset")) {
      throw error;
    }
  }

  try {
    const result = await pool.query(sqlWithSecondaryRoles, params);
    return result.rows as T[];
  } catch (error) {
    if (!isMissingColumn(error, "secondary_roles")) {
      throw error;
    }

    const legacyResult = await pool.query(sqlLegacy, params);
    return legacyResult.rows.map((row) => ({
      ...row,
      secondaryRoles: [],
      forcePasswordReset: false,
    })) as T[];
  }
}

export const userStore = {
  async findByEmailAndTenant(email: string, tenantId: string): Promise<TenantUser | undefined> {
    const rows = await queryUsersWithFallback<TenantUser>(
      `${USER_SELECT_FULL} where email = $1 and tenant_id = $2`,
      `${USER_SELECT_WITH_SECONDARY_ROLES} where email = $1 and tenant_id = $2`,
      `${USER_SELECT_LEGACY} where email = $1 and tenant_id = $2`,
      [email.toLowerCase(), tenantId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      ...row,
      secondaryRoles: normalizeRoleArray(row.secondaryRoles),
      roles: buildEffectiveRoles(row.role, row.secondaryRoles),
    };
  },

  async findById(id: string): Promise<TenantUser | undefined> {
    const rows = await queryUsersWithFallback<TenantUser>(
      `${USER_SELECT_FULL} where id = $1`,
      `${USER_SELECT_WITH_SECONDARY_ROLES} where id = $1`,
      `${USER_SELECT_LEGACY} where id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      ...row,
      secondaryRoles: normalizeRoleArray(row.secondaryRoles),
      roles: buildEffectiveRoles(row.role, row.secondaryRoles),
    };
  },

  async listByTenant(tenantId: string): Promise<TenantUser[]> {
    const rows = await queryUsersWithFallback<TenantUser>(
      `${USER_SELECT_FULL} where tenant_id = $1
       order by full_name`,
      `${USER_SELECT_WITH_SECONDARY_ROLES} where tenant_id = $1
       order by full_name`,
      `${USER_SELECT_LEGACY} where tenant_id = $1
       order by full_name`,
      [tenantId],
    );
    return rows.map((row) => ({
      ...row,
      secondaryRoles: normalizeRoleArray(row.secondaryRoles),
      roles: buildEffectiveRoles(row.role, row.secondaryRoles),
    }));
  },

  mask(user: TenantUser) {
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      secondaryRoles: normalizeRoleArray(rest.secondaryRoles),
      roles: buildEffectiveRoles(rest.role, rest.roles || rest.secondaryRoles),
      passwordResetRequired: Boolean(rest.forcePasswordReset),
    };
  },

  getDefaultPassword(): string {
    return DEFAULT_PASSWORD;
  },
};
