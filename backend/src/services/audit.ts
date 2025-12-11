import crypto from "crypto";
import { pool } from "../db/pool";

export interface AuditLogParams {
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: any;
  metadata?: any;
  severity?: "info" | "warning" | "error" | "critical";
  status?: "success" | "failure" | "partial";
}

export async function auditLog(tenantId: string, actorId: string | undefined | null, action: string, entity: string, entityId: string) {
  // Legacy compatibility function - maps to new schema
  await createAuditLog({
    tenantId,
    userId: actorId,
    action,
    resourceType: entity,
    resourceId: entityId,
    severity: "info",
    status: "success",
  });
}

export async function createAuditLog(params: AuditLogParams) {
  const {
    tenantId,
    userId,
    action,
    resourceType,
    resourceId,
    ipAddress,
    userAgent,
    changes,
    metadata,
    severity = "info",
    status = "success",
  } = params;

  await pool.query(
    `INSERT INTO audit_log(
      id, tenant_id, user_id, action, resource_type, resource_id,
      ip_address, user_agent, changes, metadata, severity, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      crypto.randomUUID(),
      tenantId,
      userId || null,
      action,
      resourceType,
      resourceId || null,
      ipAddress || null,
      userAgent || null,
      changes ? JSON.stringify(changes) : null,
      metadata ? JSON.stringify(metadata) : null,
      severity,
      status,
    ],
  );
}
