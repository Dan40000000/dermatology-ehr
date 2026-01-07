import crypto from "crypto";
import { pool } from "../db/pool";
import { redactPHI } from "../utils/phiRedaction";

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

  // Redact PHI from changes and metadata before logging
  const redactedChanges = changes ? redactPHI(changes) : null;
  const redactedMetadata = metadata ? redactPHI(metadata) : null;

  // Add requestId to metadata if provided
  const enrichedMetadata = requestId
    ? { ...redactedMetadata, requestId }
    : redactedMetadata;

  await pool.query(
    `INSERT INTO audit_log(
      id, tenant_id, user_id, action, resource_type, resource_id,
      ip_address, user_agent, changes, metadata, severity, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      crypto.randomUUID(),
      tenantId,
      normalizedUserId,
      action,
      resourceType,
      resourceId || null,
      ipAddress || null,
      userAgent || null,
      redactedChanges ? JSON.stringify(redactedChanges) : null,
      enrichedMetadata ? JSON.stringify(enrichedMetadata) : null,
      severity,
      status,
    ],
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
