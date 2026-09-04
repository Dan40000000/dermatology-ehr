import { pool } from "../db/pool";
import { logger } from "../lib/logger";

export interface AuditColumnMap {
  userId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  changes: string | null;
  metadata: string | null;
  severity: string | null;
  status: string | null;
  previousHash: string | null;
  recordHash: string | null;
  createdAt: string | null;
}

export interface AuditSchemaInfo {
  columns: Set<string>;
  columnMap: AuditColumnMap;
}

const AUDIT_SCHEMA_CACHE_TTL_MS = 60_000;

let auditSchemaCache: { loadedAt: number; info: AuditSchemaInfo } | null = null;

function resolveColumn(columns: Set<string>, preferred: string, legacy: string): string | null {
  if (columns.has(preferred)) return preferred;
  if (columns.has(legacy)) return legacy;
  return null;
}

function buildColumnMap(columns: Set<string>): AuditColumnMap {
  return {
    userId: resolveColumn(columns, "user_id", "actor_id"),
    resourceType: resolveColumn(columns, "resource_type", "entity"),
    resourceId: resolveColumn(columns, "resource_id", "entity_id"),
    ipAddress: columns.has("ip_address") ? "ip_address" : null,
    userAgent: columns.has("user_agent") ? "user_agent" : null,
    changes: columns.has("changes") ? "changes" : null,
    metadata: columns.has("metadata") ? "metadata" : null,
    severity: columns.has("severity") ? "severity" : null,
    status: columns.has("status") ? "status" : null,
    previousHash: columns.has("previous_hash") ? "previous_hash" : null,
    recordHash: columns.has("record_hash") ? "record_hash" : null,
    createdAt: columns.has("created_at") ? "created_at" : null,
  };
}

async function loadAuditSchemaInfo(): Promise<AuditSchemaInfo> {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'audit_log'`,
  );

  const columns = new Set(result.rows.map((row) => row.column_name));

  if (columns.size === 0) {
    throw new Error("audit_log table was not found in information_schema");
  }

  return {
    columns,
    columnMap: buildColumnMap(columns),
  };
}

export async function getAuditSchemaInfo(forceRefresh = false): Promise<AuditSchemaInfo> {
  if (!forceRefresh && auditSchemaCache && Date.now() - auditSchemaCache.loadedAt < AUDIT_SCHEMA_CACHE_TTL_MS) {
    return auditSchemaCache.info;
  }

  try {
    const info = await loadAuditSchemaInfo();
    auditSchemaCache = { loadedAt: Date.now(), info };
    return info;
  } catch (error) {
    logger.error("Failed to load audit schema metadata", {
      errorCode: error instanceof Error ? `AUDIT_${error.name}` : "AUDIT_SCHEMA_UNAVAILABLE",
    });

    if (auditSchemaCache) {
      return auditSchemaCache.info;
    }

    const fallbackColumns = new Set<string>([
      "id",
      "tenant_id",
      "action",
      "created_at",
      "user_id",
      "resource_type",
      "resource_id",
      "ip_address",
      "user_agent",
      "changes",
      "metadata",
      "severity",
      "status",
      "previous_hash",
      "record_hash",
    ]);

    return {
      columns: fallbackColumns,
      columnMap: buildColumnMap(fallbackColumns),
    };
  }
}
