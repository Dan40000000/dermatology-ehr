import { pool } from "../db/pool";
import { TenantUser } from "../types";

const DEFAULT_PASSWORD = "Password123!";

export const userStore = {
  async findByEmailAndTenant(email: string, tenantId: string): Promise<TenantUser | undefined> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role, password_hash as "passwordHash"
       from users where email = $1 and tenant_id = $2`,
      [email.toLowerCase(), tenantId],
    );
    return res.rows[0];
  },

  async findById(id: string): Promise<TenantUser | undefined> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role, password_hash as "passwordHash"
       from users where id = $1`,
      [id],
    );
    return res.rows[0];
  },

  async listByTenant(tenantId: string): Promise<TenantUser[]> {
    const res = await pool.query(
      `select id, tenant_id as "tenantId", email, full_name as "fullName", role, password_hash as "passwordHash"
       from users where tenant_id = $1
       order by full_name`,
      [tenantId],
    );
    return res.rows;
  },

  mask(user: TenantUser) {
    const { passwordHash, ...rest } = user;
    return rest;
  },

  getDefaultPassword(): string {
    return DEFAULT_PASSWORD;
  },
};
