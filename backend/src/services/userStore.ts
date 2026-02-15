import { pool } from "../db/pool";
import { TenantUser } from "../types";
import { loadEnv } from "../config/validate";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";

const DEFAULT_PASSWORD = loadEnv().DEFAULT_USER_PASSWORD;

export const userStore = {
  async findByEmailAndTenant(email: string, tenantId: string): Promise<TenantUser | undefined> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
              password_hash as "passwordHash"
       from users where email = $1 and tenant_id = $2`,
      [email.toLowerCase(), tenantId],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      ...row,
      secondaryRoles: normalizeRoleArray(row.secondaryRoles),
      roles: buildEffectiveRoles(row.role, row.secondaryRoles),
    };
  },

  async findById(id: string): Promise<TenantUser | undefined> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
              password_hash as "passwordHash"
       from users where id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      ...row,
      secondaryRoles: normalizeRoleArray(row.secondaryRoles),
      roles: buildEffectiveRoles(row.role, row.secondaryRoles),
    };
  },

  async listByTenant(tenantId: string): Promise<TenantUser[]> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role,
              coalesce(secondary_roles, '{}'::text[]) as "secondaryRoles",
              password_hash as "passwordHash"
       from users where tenant_id = $1
       order by full_name`,
      [tenantId],
    );
    return res.rows.map((row) => ({
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
    };
  },

  getDefaultPassword(): string {
    return DEFAULT_PASSWORD;
  },
};
