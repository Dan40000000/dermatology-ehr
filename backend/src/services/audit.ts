import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { getAuditSchemaInfo } from "./auditSchema";
import { redactPHI, safeErrorCode } from "../utils/phiRedaction";

function auditHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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
  requestId?: string; // For correlating related actions
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
    requestId,
  } = params;

  const normalizedUserId = userId === "system" ? null : (userId || null);
  const createdAt = new Date().toISOString();

  // Redact PHI from changes and metadata before logging
  const redactedChanges = changes ? redactPHI(changes) : null;
  const redactedMetadata = metadata ? redactPHI(metadata) : null;

  // Add requestId to metadata if provided
  const enrichedMetadata = requestId
    ? { ...redactedMetadata, requestId }
    : redactedMetadata;
  const basePayload = {
    id: crypto.randomUUID(),
    tenantId,
    userId: normalizedUserId,
    action,
    resourceType,
    resourceId: resourceId || null,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    changes: redactedChanges ? JSON.stringify(redactedChanges) : null,
    metadata: enrichedMetadata ? JSON.stringify(enrichedMetadata) : null,
    severity,
    status,
    createdAt,
  };

  const insertWithSchema = async (db: { query: (text: string, params?: unknown[]) => Promise<any> }, forceRefreshSchema = false) => {
    const schemaInfo = await getAuditSchemaInfo(forceRefreshSchema);
    const { columnMap } = schemaInfo;

    const resourceTypeColumn = columnMap.resourceType;
    if (!resourceTypeColumn) {
      throw new Error("Unable to resolve audit_log resource type column");
    }

    const columns: string[] = ["id", "tenant_id", "action", resourceTypeColumn];
    const values: any[] = [basePayload.id, basePayload.tenantId, basePayload.action, basePayload.resourceType];

    if (columnMap.userId) {
      columns.push(columnMap.userId);
      values.push(basePayload.userId);
    }

    if (columnMap.resourceId) {
      columns.push(columnMap.resourceId);
      values.push(basePayload.resourceId);
    }

    if (columnMap.ipAddress) {
      columns.push(columnMap.ipAddress);
      values.push(basePayload.ipAddress);
    }

    if (columnMap.userAgent) {
      columns.push(columnMap.userAgent);
      values.push(basePayload.userAgent);
    }

    if (columnMap.changes) {
      columns.push(columnMap.changes);
      values.push(basePayload.changes);
    }

    if (columnMap.metadata) {
      columns.push(columnMap.metadata);
      values.push(basePayload.metadata);
    }

    if (columnMap.severity) {
      columns.push(columnMap.severity);
      values.push(basePayload.severity);
    }

    if (columnMap.status) {
      columns.push(columnMap.status);
      values.push(basePayload.status);
    }

    // Hash-chain fields are appended after the legacy columns to preserve the
    // historical insert shape for deployments that have not yet run the
    // integrity migration.  The previous hash is tenant-scoped and never
    // crosses a tenant boundary.
    let previousHash: string | null = null;
    if (columnMap.previousHash || columnMap.recordHash) {
      try {
        const previousResult = await db.query(
          `SELECT record_hash
             FROM audit_log
            WHERE tenant_id = $1
              AND record_hash IS NOT NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1`,
          [basePayload.tenantId],
        );
        previousHash = previousResult?.rows?.[0]?.record_hash || null;
      } catch {
        // If the optional integrity columns are present but an older replica
        // cannot read them, fail closed rather than writing an unverifiable
        // audit record.
        throw new Error('Audit integrity chain unavailable');
      }
    }

    const hashInput = [
      basePayload.id,
      basePayload.tenantId,
      basePayload.userId || '',
      basePayload.action,
      basePayload.resourceType,
      basePayload.resourceId || '',
      basePayload.createdAt,
      previousHash || 'genesis',
    ].join('|');
    const recordHash = auditHash(hashInput);

    if (columnMap.previousHash) {
      columns.push(columnMap.previousHash);
      values.push(previousHash);
    }
    if (columnMap.recordHash) {
      columns.push(columnMap.recordHash);
      values.push(recordHash);
    }
    if (columnMap.createdAt) {
      columns.push(columnMap.createdAt);
      values.push(basePayload.createdAt);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    await db.query(`INSERT INTO audit_log(${columns.join(", ")}) VALUES (${placeholders})`, values);
  };

  const executeInsert = async (forceRefreshSchema = false): Promise<void> => {
    const poolWithConnect = pool as typeof pool & { connect?: () => Promise<any> };
    if (typeof poolWithConnect.connect !== 'function') {
      await insertWithSchema(pool, forceRefreshSchema);
      return;
    }

    const client = await poolWithConnect.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      // Serialize writers per tenant so two concurrent requests cannot observe
      // the same previous_hash and fork the chain.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [basePayload.tenantId]);
      await insertWithSchema(client, forceRefreshSchema);
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
      }
      throw error;
    } finally {
      client.release?.();
    }
  };

  try {
    await executeInsert(false);
  } catch (error) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === "42703" || errorCode === "42P01") {
      logger.warn("Audit insert schema mismatch, retrying with refreshed schema", {
        errorCode: safeErrorCode(error),
      });
      await executeInsert(true);
      return;
    }
    throw error;
  }
}

export interface AuditIntegrityResult {
  tenantId: string;
  valid: boolean;
  recordCount: number;
  firstInvalidId?: string;
  expectedHash?: string;
  observedHash?: string;
}

/** Verify the tenant-scoped audit hash chain and report the first mismatch. */
export async function verifyAuditChain(tenantId: string): Promise<AuditIntegrityResult> {
  const result = await pool.query(
    `SELECT id, tenant_id, user_id, action, resource_type, resource_id,
            created_at, previous_hash, record_hash
       FROM audit_log
      WHERE tenant_id = $1
      ORDER BY created_at ASC, id ASC`,
    [tenantId],
  );
  let previousHash: string | null = null;
  for (const row of result.rows || []) {
    const expectedHash = auditHash([
      row.id,
      row.tenant_id,
      row.user_id || '',
      row.action,
      row.resource_type,
      row.resource_id || '',
      new Date(row.created_at).toISOString(),
      previousHash || 'genesis',
    ].join('|'));
    if (row.previous_hash !== (previousHash || null) || row.record_hash !== expectedHash) {
      return {
        tenantId,
        valid: false,
        recordCount: (result.rows || []).length,
        firstInvalidId: row.id,
        expectedHash,
        observedHash: row.record_hash,
      };
    }
    previousHash = row.record_hash;
  }
  return { tenantId, valid: true, recordCount: (result.rows || []).length };
}

/** Persist a daily tamper-evidence checkpoint for the tenant audit chain. */
export async function writeAuditIntegrityCheckpoint(tenantId: string, checkpointDate = new Date()): Promise<void> {
  const date = checkpointDate.toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT id, record_hash
       FROM audit_log
      WHERE tenant_id = $1
        AND created_at::date = $2::date
      ORDER BY created_at ASC, id ASC`,
    [tenantId, date],
  );
  const rows = result.rows || [];
  const checksum = auditHash(rows.map((row: any) => `${row.id}:${row.record_hash || ''}`).join('|'));
  await pool.query(
    `INSERT INTO audit_integrity_checkpoints
      (tenant_id, table_name, checkpoint_date, record_count, checksum, first_record_id, last_record_id, verification_status)
     VALUES ($1, 'audit_log', $2::date, $3, $4, $5, $6, 'verified')
     ON CONFLICT (tenant_id, table_name, checkpoint_date)
     DO UPDATE SET record_count = EXCLUDED.record_count,
                   checksum = EXCLUDED.checksum,
                   first_record_id = EXCLUDED.first_record_id,
                   last_record_id = EXCLUDED.last_record_id,
                   verification_status = 'verified',
                   verified_at = NOW()`,
    [tenantId, date, rows.length, checksum, rows[0]?.id || null, rows[rows.length - 1]?.id || null],
  );
}

/**
 * Audit key HIPAA-relevant actions
 */

export async function auditBlockCreate(params: {
  tenantId: string;
  userId: string;
  blockId: string;
  blockData: any;
  requestId?: string;
}) {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "block_create",
    resourceType: "schedule_block",
    resourceId: params.blockId,
    metadata: {
      blockType: params.blockData.blockType,
      providerId: params.blockData.providerId,
    },
    requestId: params.requestId,
    severity: "info",
    status: "success",
  });
}

export async function auditPriorAuthSubmit(params: {
  tenantId: string;
  userId: string;
  priorAuthId: string;
  patientId: string;
  requestId?: string;
  ipAddress?: string;
}) {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "prior_auth_submit",
    resourceType: "prior_authorization",
    resourceId: params.priorAuthId,
    ipAddress: params.ipAddress,
    metadata: {
      patientId: params.patientId,
      action: "submitted_to_insurance",
    },
    requestId: params.requestId,
    severity: "warning", // Higher severity for compliance tracking
    status: "success",
  });
}

export async function auditFaxSend(params: {
  tenantId: string;
  userId: string;
  faxId: string;
  recipientNumber: string;
  patientId?: string;
  requestId?: string;
  ipAddress?: string;
}) {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "fax_send",
    resourceType: "fax",
    resourceId: params.faxId,
    ipAddress: params.ipAddress,
    metadata: {
      recipientNumber: params.recipientNumber.slice(-4), // Only log last 4 digits
      patientId: params.patientId,
    },
    requestId: params.requestId,
    severity: "warning", // PHI transmission
    status: "success",
  });
}

export async function auditPatientDataAccess(params: {
  tenantId: string;
  userId: string;
  patientId: string;
  accessType: "view" | "create" | "update" | "delete" | "export";
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: `patient_data_${params.accessType}`,
    resourceType: params.resourceType || "patient",
    resourceId: params.resourceId || params.patientId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      patientId: params.patientId,
      accessType: params.accessType,
      phi_access: true,
    },
    requestId: params.requestId,
    severity: params.accessType === "delete" || params.accessType === "export" ? "warning" : "info",
    status: "success",
  });
}
