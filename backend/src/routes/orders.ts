import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { CLINICAL_ROLES } from "../lib/roles";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";
import { createChargeForOrder } from "../services/orderChargeService";
import {
  ensureOrderResultFollowUpTask,
  mirrorOrderResultToPatientObservation,
} from "../services/orderResultWorkflow";
import {
  ORDER_STATUSES,
  immutableEncounterErrorMessage,
  isImmutableEncounterStatus,
  normalizeWorkflowStatus,
} from "../lib/clinicalWorkflow";

const orderSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string().optional(), // Optional - will default to first available provider
  type: z.string().min(1),
  status: z.enum(ORDER_STATUSES).optional(),
  priority: z.enum(['normal', 'high', 'stat', 'routine', 'urgent']).optional(),
  details: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  facility: z.string().trim().max(200).optional(),
  ddx: z.string().trim().max(500).optional(),
  location: z.string().trim().max(255).optional(),
  billable: z.boolean().optional(),
  cptCode: z.string().trim().min(3).max(20).optional(),
  icdCodes: z.array(z.string().trim().min(3).max(10)).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  feeCents: z.number().int().min(0).max(500000).optional(),
  amountCents: z.number().int().min(0).max(500000).optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

const resultFlagValues = [
  "benign",
  "inconclusive",
  "precancerous",
  "cancerous",
  "normal",
  "abnormal",
  "low",
  "high",
  "out_of_range",
  "panic_value",
  "none",
] as const;

const orderResultSchema = z.object({
  results: z.string().trim().max(4000).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  resultSource: z.enum(["manual", "lab_interface", "fax", "outside_lab", "correction"]).optional(),
  resultsProcessedAt: z.string().datetime().optional().nullable(),
  resultFlag: z.enum(resultFlagValues).optional(),
  changeReason: z.string().trim().max(500).optional(),
}).refine(
  (data) =>
    data.results !== undefined ||
    data.status !== undefined ||
    data.resultSource !== undefined ||
    data.resultsProcessedAt !== undefined ||
    data.resultFlag !== undefined ||
    data.changeReason !== undefined,
  { message: "At least one result field is required" },
);

const erxSchema = z.object({
  orderId: z.string().optional(),
  medication: z.string().optional(),
  sig: z.string().optional(),
  pharmacy: z.string().optional(),
});

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRoles([...CLINICAL_ROLES]));

async function ensureLinkedEncounterIsMutable(tenantId: string, encounterId?: string): Promise<string | null> {
  if (!encounterId) {
    return null;
  }

  const result = await pool.query(
    `select status from encounters where id = $1 and tenant_id = $2`,
    [encounterId, tenantId],
  );
  const status = result.rows[0]?.status;
  if (status && isImmutableEncounterStatus(status)) {
    return immutableEncounterErrorMessage(status);
  }
  return null;
}

async function resolveOrderProvider(
  tenantId: string,
  providerId: string | undefined,
  encounterId: string | undefined
): Promise<{ providerId: string; providerName: string | null } | null> {
  if (providerId) {
    const providerResult = await pool.query(
      `select id, full_name from providers where id = $1 and tenant_id = $2`,
      [providerId, tenantId]
    );
    const provider = providerResult.rows[0];
    if (provider) {
      return {
        providerId: provider.id as string,
        providerName: (provider.full_name as string | null) || null,
      };
    }
  }

  if (encounterId) {
    const encounterProviderResult = await pool.query(
      `select p.id, p.full_name
         from encounters e
         join providers p on p.id = e.provider_id and p.tenant_id = e.tenant_id
        where e.id = $1 and e.tenant_id = $2`,
      [encounterId, tenantId]
    );
    const encounterProvider = encounterProviderResult.rows[0];
    if (encounterProvider) {
      return {
        providerId: encounterProvider.id as string,
        providerName: (encounterProvider.full_name as string | null) || null,
      };
    }
  }

  const defaultProviderResult = await pool.query(
    `select id, full_name from providers where tenant_id = $1 order by
     case when id = 'prov-demo' then 0 else 1 end, created_at limit 1`,
    [tenantId]
  );
  const defaultProvider = defaultProviderResult.rows[0];
  if (!defaultProvider) {
    return null;
  }

  return {
    providerId: defaultProvider.id as string,
    providerName: (defaultProvider.full_name as string | null) || null,
  };
}

ordersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Extract query parameters for filtering
  const { orderTypes, statuses, priorities, search, patientId, limit = '100' } = req.query;

  let query = `
    select
      o.id,
      o.encounter_id as "encounterId",
      o.patient_id as "patientId",
      o.provider_id as "providerId",
      o.type,
      o.status,
      o.priority,
      o.details,
      o.notes,
      o.facility,
      o.ddx,
      o.body_location as "location",
      o.results,
      o.results_processed_at as "resultsProcessed",
      o.result_source as "resultSource",
      o.result_updated_at as "resultUpdatedAt",
      o.result_updated_by as "resultUpdatedBy",
      o.result_change_reason as "resultChangeReason",
      o.result_flag as "resultFlag",
      o.result_flag_updated_at as "resultFlagUpdatedAt",
      o.result_flag_updated_by as "resultFlagUpdatedBy",
      o.created_at as "createdAt",
      p.full_name as "providerName",
      trim(concat_ws(' ', pt.first_name, pt.last_name)) as "patientName",
      pt.mrn as "patientMrn"
    from orders o
    left join providers p on o.provider_id = p.id and o.tenant_id = p.tenant_id
    left join patients pt on o.patient_id = pt.id and o.tenant_id = pt.tenant_id
    where o.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  // Filter by order types
  if (orderTypes && typeof orderTypes === 'string') {
    const types = orderTypes.split(',').filter(Boolean);
    if (types.length > 0) {
      query += ` and o.type = ANY($${paramIndex})`;
      params.push(types);
      paramIndex++;
    }
  }

  // Filter by statuses
  if (statuses && typeof statuses === 'string') {
    const statusList = statuses.split(',').filter(Boolean);
    if (statusList.length > 0) {
      query += ` and o.status = ANY($${paramIndex})`;
      params.push(statusList);
      paramIndex++;
    }
  }

  // Filter by priorities
  if (priorities && typeof priorities === 'string') {
    const priorityList = priorities.split(',').filter(Boolean);
    if (priorityList.length > 0) {
      query += ` and o.priority = ANY($${paramIndex})`;
      params.push(priorityList);
      paramIndex++;
    }
  }

  // Search filter
  if (search && typeof search === 'string' && search.trim()) {
    query += ` and (
      o.details ilike $${paramIndex}
      or o.notes ilike $${paramIndex}
      or o.facility ilike $${paramIndex}
      or o.ddx ilike $${paramIndex}
      or o.body_location ilike $${paramIndex}
      or o.results ilike $${paramIndex}
      or trim(concat_ws(' ', pt.first_name, pt.last_name)) ilike $${paramIndex}
      or trim(concat_ws(' ', pt.last_name, pt.first_name)) ilike $${paramIndex}
      or pt.mrn ilike $${paramIndex}
    )`;
    params.push(`%${search.trim()}%`);
    paramIndex++;
  }

  // Filter by patient
  if (patientId && typeof patientId === 'string') {
    query += ` and o.patient_id = $${paramIndex}`;
    params.push(patientId);
    paramIndex++;
  }

  query += ` order by o.created_at desc limit $${paramIndex}`;
  params.push(parseInt(limit as string, 10));

  const result = await pool.query(query, params);
  res.json({ orders: result.rows });
});

ordersRouter.post("/", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const o = parsed.data;

  try {
    const lockedError = await ensureLinkedEncounterIsMutable(tenantId, o.encounterId);
    if (lockedError) {
      return res.status(409).json({ error: lockedError });
    }

    const resolvedProvider = await resolveOrderProvider(tenantId, o.providerId, o.encounterId);
    if (!resolvedProvider) {
      return res.status(400).json({ error: "No providers available" });
    }

    await pool.query(
      `insert into orders(
         id, tenant_id, encounter_id, patient_id, provider_id, provider_name, type, status, priority,
         details, notes, facility, ddx, body_location
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        tenantId,
        o.encounterId || null,
        o.patientId,
        resolvedProvider.providerId,
        resolvedProvider.providerName,
        o.type,
        normalizeWorkflowStatus(o.status || "draft"),
        o.priority || "normal",
        o.details || null,
        o.notes || null,
        o.facility || null,
        o.ddx || null,
        o.location || null
      ],
    );
    await auditLog(tenantId, req.user!.id, "order_create", "order", id);

    let charge = null;
    try {
      charge = await createChargeForOrder({
        tenantId,
        orderId: id,
        encounterId: o.encounterId,
        patientId: o.patientId,
        type: o.type,
        details: o.details,
        notes: o.notes,
        billable: o.billable,
        cptCode: o.cptCode,
        icdCodes: o.icdCodes,
        quantity: o.quantity,
        feeCents: o.feeCents,
        amountCents: o.amountCents,
      });
    } catch (chargeError: any) {
      logger.error("Failed to create financial charge from order", {
        tenantId,
        orderId: id,
        encounterId: o.encounterId,
        error: chargeError?.message || "Unknown error",
      });
    }

    res.status(201).json({ id, charge });
  } catch (error: any) {
    logger.error("Create order error", {
      tenantId,
      encounterId: o.encounterId,
      patientId: o.patientId,
      providerId: o.providerId,
      error: error?.message || "Unknown error",
    });
    res.status(500).json({ error: "Failed to create order" });
  }
});

ordersRouter.post("/:id/result", requireAuth, requireRoles(["provider", "ma", "nurse", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderResultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const orderId = req.params.id;
  const resultPayload = parsed.data;

  const existingResult = await pool.query(
    `select id, status, results, result_source, results_processed_at, result_flag, patient_id, encounter_id, type, details
       from orders
      where id = $1 and tenant_id = $2`,
    [orderId, tenantId],
  );
  const existingOrder = existingResult.rows[0];
  if (!existingOrder) {
    return res.status(404).json({ error: "Order not found" });
  }

  const results = resultPayload.results !== undefined ? (resultPayload.results || null) : existingOrder.results;
  const resultSource = resultPayload.resultSource || existingOrder.result_source || "manual";
  const status = normalizeWorkflowStatus(
    resultPayload.status || (results ? "received" : existingOrder.status),
  );
  const resultFlag = resultPayload.resultFlag || existingOrder.result_flag || null;
  const resultsProcessedAt =
    resultPayload.resultsProcessedAt !== undefined
      ? resultPayload.resultsProcessedAt
      : (results && !existingOrder.results_processed_at ? new Date().toISOString() : existingOrder.results_processed_at);

  if (existingOrder.results && resultPayload.results !== undefined && !resultPayload.changeReason?.trim()) {
    return res.status(400).json({ error: "Change reason is required when editing an existing result" });
  }

  const updated = await pool.query(
    `update orders
        set results = $1,
            status = $2,
            result_source = $3,
            results_processed_at = $4,
            result_updated_at = now(),
            result_updated_by = $5,
            result_change_reason = $6,
            result_flag = $7::result_flag_type,
            result_flag_updated_at = CASE WHEN $7::result_flag_type IS DISTINCT FROM result_flag THEN now() ELSE result_flag_updated_at END,
            result_flag_updated_by = CASE WHEN $7::result_flag_type IS DISTINCT FROM result_flag THEN $5 ELSE result_flag_updated_by END
      where id = $8 and tenant_id = $9
      returning
        id,
        encounter_id as "encounterId",
        patient_id as "patientId",
        provider_id as "providerId",
        type,
        status,
        priority,
        details,
        notes,
        facility,
        ddx,
        body_location as "location",
        results,
        results_processed_at as "resultsProcessed",
        result_source as "resultSource",
        result_updated_at as "resultUpdatedAt",
        result_updated_by as "resultUpdatedBy",
        result_change_reason as "resultChangeReason",
        result_flag as "resultFlag",
        result_flag_updated_at as "resultFlagUpdatedAt",
        result_flag_updated_by as "resultFlagUpdatedBy",
        created_at as "createdAt"`,
    [
      results,
      status,
      resultSource,
      resultsProcessedAt,
      req.user!.id,
      resultPayload.changeReason || null,
      resultFlag,
      orderId,
      tenantId,
    ],
  );

  const updatedOrder = updated.rows[0];
  await mirrorOrderResultToPatientObservation({
    tenantId,
    order: existingOrder,
    resultText: results,
    resultFlag,
    resultsProcessedAt,
    userId: req.user!.id,
  });
  await ensureOrderResultFollowUpTask({
    tenantId,
    order: existingOrder,
    resultFlag,
    resultText: results,
    userId: req.user!.id,
  });

  await auditLog(tenantId, req.user?.id ?? "unknown", "order_result_update", "order", String(orderId));
  res.json({ order: updatedOrder });
});

ordersRouter.post("/:id/status", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const orderId = req.params.id;
  const status = normalizeWorkflowStatus(parsed.data.status);
  await pool.query(`update orders set status = $1 where id = $2 and tenant_id = $3`, [status, orderId, tenantId]);
  await auditLog(tenantId, req.user?.id ?? "unknown", "order_status_change", "order", String(orderId));
  res.json({ ok: true });
});

// eRx stub
ordersRouter.post("/erx/send", requireAuth, requireRoles(["provider"]), async (req: AuthedRequest, res) => {
  const parsed = erxSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  if (parsed.data.orderId) {
    await pool.query(`update orders set status = 'ordered', details = coalesce(details,'') || ' | eRx sent' where id = $1 and tenant_id = $2`, [
      parsed.data.orderId,
      tenantId,
    ]);
  }
  await auditLog(tenantId, req.user?.id ?? "unknown", "erx_send", "erx", "stub");
  res.json({
    accepted: true,
    message: "eRx stub accepted",
    pharmacy: parsed.data.pharmacy,
    sig: parsed.data.sig,
  });
});
