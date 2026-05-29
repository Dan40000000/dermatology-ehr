import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

type QueryExecutor = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

export interface FinancialWorkQueueItem {
  id: string;
  tenantId: string;
  encounterId: string | null;
  appointmentId: string | null;
  patientId: string | null;
  claimId: string | null;
  billId: string | null;
  issueType: string;
  severity: string;
  status: string;
  message: string;
  errorDetail: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFinancialWorkQueueItemInput {
  tenantId: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  patientId?: string | null;
  claimId?: string | null;
  billId?: string | null;
  issueType: string;
  severity?: "info" | "warning" | "error" | "critical";
  message: string;
  errorDetail?: string | null;
  metadata?: Record<string, any>;
  createdBy?: string | null;
}

function isSchemaCompatibilityError(error: any): boolean {
  return error?.code === "42P01" || error?.code === "42703";
}

function safeCreatedBy(userId?: string | null): string | null {
  if (!userId || userId === "system") return null;
  return userId;
}

function mapFinancialWorkQueueItem(row: any): FinancialWorkQueueItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    encounterId: row.encounter_id || null,
    appointmentId: row.appointment_id || null,
    patientId: row.patient_id || null,
    claimId: row.claim_id || null,
    billId: row.bill_id || null,
    issueType: row.issue_type,
    severity: row.severity,
    status: row.status,
    message: row.message,
    errorDetail: row.error_detail || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveEncounterContext(
  executor: QueryExecutor,
  tenantId: string,
  encounterId?: string | null,
): Promise<{ appointmentId: string | null; patientId: string | null }> {
  if (!encounterId) {
    return { appointmentId: null, patientId: null };
  }

  const result = await executor.query(
    `select appointment_id, patient_id
     from encounters
     where id = $1 and tenant_id = $2
     limit 1`,
    [encounterId, tenantId],
  );

  return {
    appointmentId: result.rows[0]?.appointment_id || null,
    patientId: result.rows[0]?.patient_id || null,
  };
}

export async function createFinancialWorkQueueItem(
  input: CreateFinancialWorkQueueItemInput,
  executor: QueryExecutor = pool,
): Promise<FinancialWorkQueueItem | null> {
  try {
    const encounterContext = await resolveEncounterContext(executor, input.tenantId, input.encounterId);
    const appointmentId = input.appointmentId ?? encounterContext.appointmentId;
    const patientId = input.patientId ?? encounterContext.patientId;

    const existing = await executor.query(
      `select id
       from financial_work_queue
       where tenant_id = $1
         and issue_type = $2
         and status = 'open'
         and (
           ($3::text is not null and encounter_id is not distinct from $3::text)
           or ($3::text is null and appointment_id is not distinct from $4::text)
         )
       order by created_at desc
       limit 1`,
      [input.tenantId, input.issueType, input.encounterId || null, appointmentId],
    );

    const values = [
      input.tenantId,
      input.encounterId || null,
      appointmentId,
      patientId,
      input.claimId || null,
      input.billId || null,
      input.issueType,
      input.severity || "error",
      input.message,
      input.errorDetail || null,
      JSON.stringify(input.metadata || {}),
      safeCreatedBy(input.createdBy),
    ];

    if (existing.rows.length > 0) {
      const result = await executor.query(
        `update financial_work_queue
         set appointment_id = $3,
             patient_id = $4,
             claim_id = $5,
             bill_id = $6,
             severity = $8,
             message = $9,
             error_detail = $10,
             metadata = $11::jsonb,
             created_by = coalesce(created_by, $12),
             updated_at = now()
         where id = $13 and tenant_id = $1
         returning *`,
        [...values, existing.rows[0].id],
      );
      return mapFinancialWorkQueueItem(result.rows[0]);
    }

    const result = await executor.query(
      `insert into financial_work_queue(
         id, tenant_id, encounter_id, appointment_id, patient_id, claim_id, bill_id,
         issue_type, severity, status, message, error_detail, metadata, created_by,
         created_at, updated_at
       )
       values ($13,$1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11::jsonb,$12,now(),now())
       returning *`,
      [...values, crypto.randomUUID()],
    );

    return mapFinancialWorkQueueItem(result.rows[0]);
  } catch (error: any) {
    if (!isSchemaCompatibilityError(error)) {
      logger.error("Failed to create financial work queue item", {
        issueType: input.issueType,
        encounterId: input.encounterId,
        error: error?.message || "Unknown error",
      });
    }
    return null;
  }
}
