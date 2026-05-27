import { pool } from "../db/pool";
import { logger } from "../lib/logger";

const ACTIONABLE_RESULT_FLAGS = new Set([
  "cancerous",
  "panic_value",
  "precancerous",
  "abnormal",
  "high",
  "out_of_range",
]);

export function isActionableResultFlag(flag?: string | null): boolean {
  return ACTIONABLE_RESULT_FLAGS.has(String(flag || "").toLowerCase());
}

function resultFlagToPortalAbnormalFlag(flag?: string | null): string {
  const normalized = String(flag || "").toLowerCase();
  if (["cancerous", "panic_value", "high"].includes(normalized)) return "high";
  if (["precancerous", "abnormal", "out_of_range", "inconclusive"].includes(normalized)) return "abnormal";
  if (normalized === "low") return "low";
  return "normal";
}

function orderDisplayName(order: any): string {
  const type = String(order.type || "Order").trim();
  const details = String(order.details || "").trim();
  return details ? `${type}: ${details}` : `${type} result`;
}

export async function mirrorOrderResultToPatientObservation(params: {
  tenantId: string;
  order: any;
  resultText: string | null;
  resultFlag?: string | null;
  resultsProcessedAt?: string | Date | null;
  userId: string;
}) {
  const { tenantId, order, resultText, resultFlag, resultsProcessedAt, userId } = params;
  if (!resultText?.trim()) return;

  try {
    const tableResult = await pool.query(
      `SELECT
         to_regclass('public.patient_observations') IS NOT NULL as observations_exists,
         to_regclass('public.patient_observation_portal_releases') IS NOT NULL as release_controls_exists`
    );
    if (!tableResult?.rows?.[0]?.observations_exists || !tableResult?.rows?.[0]?.release_controls_exists) {
      return;
    }

    const observationId = `order-result-${order.id}`;
    const observationDate = resultsProcessedAt || order.results_processed_at || new Date().toISOString();
    const observationName = orderDisplayName(order);
    const abnormalFlag = resultFlagToPortalAbnormalFlag(resultFlag);
    const patientId = order.patient_id || order.patientId;

    await pool.query(
      `INSERT INTO patient_observations (
         id, tenant_id, patient_id, document_id,
         observation_code, observation_name, observation_value,
         value_type, units, reference_range, abnormal_flag,
         observation_date, status, updated_at
       ) VALUES ($1,$2,$3,NULL,$4,$5,$6,'TX',NULL,NULL,$7,$8,'final',NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         observation_name = EXCLUDED.observation_name,
         observation_value = EXCLUDED.observation_value,
         abnormal_flag = EXCLUDED.abnormal_flag,
         observation_date = EXCLUDED.observation_date,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        observationId,
        tenantId,
        patientId,
        String(order.type || "ORDER").toUpperCase(),
        observationName,
        resultText.trim(),
        abnormalFlag,
        observationDate,
      ],
    );

    const shouldHoldForProviderReview = isActionableResultFlag(resultFlag);
    await pool.query(
      `INSERT INTO patient_observation_portal_releases (
         tenant_id, observation_id, patient_id,
         release_status, released_at, released_by,
         hold_reason, portal_visible_from, updated_at
       ) VALUES (
         $1, $2, $3,
         $4, CASE WHEN $4 = 'released' THEN NOW() ELSE NULL END, CASE WHEN $4 = 'released' THEN $5 ELSE NULL END,
         $6, CASE WHEN $4 = 'released' THEN NOW() ELSE NULL END, NOW()
       )
       ON CONFLICT (tenant_id, observation_id)
       DO UPDATE SET
         patient_id = EXCLUDED.patient_id,
         release_status = EXCLUDED.release_status,
         released_at = EXCLUDED.released_at,
         released_by = EXCLUDED.released_by,
         hold_reason = EXCLUDED.hold_reason,
         portal_visible_from = EXCLUDED.portal_visible_from,
         updated_at = NOW()`,
      [
        tenantId,
        observationId,
        patientId,
        shouldHoldForProviderReview ? "held" : "released",
        userId,
        shouldHoldForProviderReview ? "Provider review required before patient portal release" : null,
      ],
    );
  } catch (error: any) {
    logger.warn("Failed to mirror order result to patient portal observation", {
      tenantId,
      orderId: order.id,
      error: error?.message || "Unknown error",
    });
  }
}

export async function ensureOrderResultFollowUpTask(params: {
  tenantId: string;
  order: any;
  resultFlag?: string | null;
  resultText: string | null;
  userId: string;
}) {
  const { tenantId, order, resultFlag, resultText, userId } = params;
  if (!isActionableResultFlag(resultFlag)) return;

  try {
    const taskId = `result-followup-${order.id}`;
    const isCritical = ["cancerous", "panic_value"].includes(String(resultFlag || "").toLowerCase());
    const title = isCritical
      ? `Critical ${String(order.type || "result").toLowerCase()} result follow-up`
      : `Abnormal ${String(order.type || "result").toLowerCase()} result follow-up`;
    const description = [
      `Review ${orderDisplayName(order)}.`,
      resultFlag ? `Flag: ${resultFlag}.` : null,
      resultText ? `Result: ${resultText.slice(0, 500)}` : null,
      "Confirm diagnosis, notify patient, and schedule follow-up if clinically indicated.",
    ].filter(Boolean).join(" ");

    await pool.query(
      `INSERT INTO tasks (
         id, tenant_id, patient_id, encounter_id, title, description,
         category, priority, status, due_date, due_at, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,'lab_path_result_followup',$7,'todo',NOW(),NOW(),$8)
       ON CONFLICT (id)
       DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         priority = EXCLUDED.priority,
         status = CASE WHEN tasks.status IN ('completed', 'cancelled', 'canceled') THEN tasks.status ELSE 'todo' END,
         due_date = CASE WHEN tasks.status IN ('completed', 'cancelled', 'canceled') THEN tasks.due_date ELSE NOW() END,
         due_at = CASE WHEN tasks.status IN ('completed', 'cancelled', 'canceled') THEN tasks.due_at ELSE NOW() END`,
      [
        taskId,
        tenantId,
        order.patient_id || order.patientId,
        order.encounter_id || order.encounterId || null,
        title,
        description,
        isCritical ? "urgent" : "high",
        userId,
      ],
    );
  } catch (error: any) {
    logger.warn("Failed to create result follow-up task", {
      tenantId,
      orderId: order.id,
      error: error?.message || "Unknown error",
    });
  }
}
