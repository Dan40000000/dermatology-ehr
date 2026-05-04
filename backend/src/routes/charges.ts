import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const chargeSchema = z.object({
  encounterId: z.string().optional(),
  cptCode: z.string().min(2).max(20),
  codeType: z.enum(["CPT", "HCPCS", "INTERNAL"]).optional(),
  billingRoute: z.enum(["insurance", "self_pay", "non_billable"]).optional(),
  description: z.string().optional(),
  icdCodes: z.array(z.string().min(3).max(10)).optional(),
  linkedDiagnosisIds: z.array(z.string()).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  feeCents: z.number().int().min(0).max(500000).optional(),
  amountCents: z.number().int().min(0).max(500000).optional(),
  modifierCodes: z.array(z.string().min(1).max(10)).optional(),
  source: z.string().max(80).optional(),
  chargeGroup: z.string().max(120).optional(),
  lineNote: z.string().max(500).optional(),
  status: z.enum(["draft", "pending", "ready", "submitted", "claimed", "self_pay", "paid", "denied", "voided"]).optional(),
});

const updateChargeSchema = z.object({
  description: z.string().optional(),
  icdCodes: z.array(z.string().min(3).max(10)).optional(),
  linkedDiagnosisIds: z.array(z.string()).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  feeCents: z.number().int().min(0).max(500000).optional(),
  amountCents: z.number().int().min(0).max(500000).optional(),
  codeType: z.enum(["CPT", "HCPCS", "INTERNAL"]).optional(),
  billingRoute: z.enum(["insurance", "self_pay", "non_billable"]).optional(),
  modifierCodes: z.array(z.string().min(1).max(10)).optional(),
  source: z.string().max(80).optional(),
  chargeGroup: z.string().max(120).optional(),
  lineNote: z.string().max(500).optional(),
  status: z.enum(["draft", "pending", "ready", "submitted", "claimed", "self_pay", "paid", "denied", "voided"]).optional(),
});

export const chargesRouter = Router();

type BillingRoute = "insurance" | "self_pay" | "non_billable";
type CodeType = "CPT" | "HCPCS" | "INTERNAL";

interface ChargeCodeLookup {
  code: string;
  description: string | null;
  category: string | null;
  codeType: CodeType | null;
  billingRoute: BillingRoute | null;
  feeCents: number;
  requiresDiagnosis: boolean;
  isCosmetic: boolean;
}

function normalizeCents(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

async function resolveDiagnosisCodesFromIds(
  tenantId: string,
  encounterId: string | undefined,
  linkedDiagnosisIds: string[] | undefined,
): Promise<string[]> {
  if (!encounterId || !Array.isArray(linkedDiagnosisIds) || linkedDiagnosisIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `select icd10_code
     from encounter_diagnoses
     where tenant_id = $1
       and encounter_id = $2
       and id = any($3::text[])
     order by is_primary desc, created_at asc`,
    [tenantId, encounterId, linkedDiagnosisIds],
  );

  return Array.from(new Set(result.rows.map((row) => String(row.icd10_code || "").trim()).filter(Boolean)));
}

function inferCodeType(code: string): CodeType {
  if (/^\d{5}$/.test(code)) return "CPT";
  if (/^[A-Z]\d{4}$/.test(code)) return "HCPCS";
  return "INTERNAL";
}

function normalizeCodeType(value: unknown, code: string): CodeType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "CPT" || normalized === "HCPCS" || normalized === "INTERNAL") {
    return normalized;
  }
  return inferCodeType(code);
}

function normalizeBillingRoute(value: unknown, status: string | undefined, codeType: CodeType): BillingRoute {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "insurance" || normalized === "self_pay" || normalized === "non_billable") {
    return normalized;
  }
  if (status === "self_pay" || codeType === "INTERNAL") {
    return "self_pay";
  }
  return "insurance";
}

function statusForRoute(route: BillingRoute, requested?: string): string {
  if (requested) return requested;
  if (route === "self_pay") return "self_pay";
  if (route === "non_billable") return "draft";
  return "pending";
}

async function lookupChargeCode(tenantId: string, rawCode: string): Promise<ChargeCodeLookup | null> {
  const code = normalizeCode(rawCode);
  const result = await pool.query(
    `with tenant_fee_items as (
       select distinct on (upper(fsi.cpt_code))
         fsi.cpt_code,
         nullif(fsi.cpt_description, '') as cpt_description,
         nullif(fsi.category, '') as category,
         coalesce(fsi.fee_cents, round(fsi.fee_amount * 100)::int, 0) as fee_cents,
         nullif(to_jsonb(fsi)->>'code_type', '') as code_type,
         nullif(to_jsonb(fsi)->>'billing_route', '') as billing_route,
         coalesce(nullif(to_jsonb(fsi)->>'requires_diagnosis', '')::boolean, true) as requires_diagnosis,
         coalesce(nullif(to_jsonb(fsi)->>'is_cosmetic', '')::boolean, false) as is_cosmetic
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
         and upper(fsi.cpt_code) = upper($2)
       order by upper(fsi.cpt_code), fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     )
     select
       coalesce(tfi.cpt_code, c.code, $2) as code,
       coalesce(tfi.cpt_description, c.description) as description,
       coalesce(tfi.category, c.category) as category,
       coalesce(tfi.fee_cents, c.default_fee_cents, 0) as "feeCents",
       coalesce(tfi.code_type, nullif(to_jsonb(c)->>'code_type', '')) as "codeType",
       coalesce(tfi.billing_route, nullif(to_jsonb(c)->>'billing_route', '')) as "billingRoute",
       coalesce(tfi.requires_diagnosis, nullif(to_jsonb(c)->>'requires_diagnosis', '')::boolean, true) as "requiresDiagnosis",
       coalesce(tfi.is_cosmetic, false) as "isCosmetic"
     from tenant_fee_items tfi
     full outer join cpt_codes c on upper(c.code) = upper(tfi.cpt_code)
     where upper(coalesce(tfi.cpt_code, c.code, $2)) = upper($2)
     limit 1`,
    [tenantId, code],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    code,
    description: row.description || null,
    category: row.category || null,
    codeType: row.codeType || null,
    billingRoute: row.billingRoute || null,
    feeCents: normalizeCents(row.feeCents),
    requiresDiagnosis: row.requiresDiagnosis !== false,
    isCosmetic: Boolean(row.isCosmetic),
  };
}

chargesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, encounter_id as "encounterId", cpt_code as "cptCode", description, icd_codes as "icdCodes",
            linked_diagnosis_ids as "linkedDiagnosisIds", quantity, fee_cents as "feeCents",
            amount_cents as "amountCents", status,
            coalesce(nullif(to_jsonb(charges)->>'code_type', ''), 'CPT') as "codeType",
            coalesce(nullif(to_jsonb(charges)->>'billing_route', ''), case when status = 'self_pay' then 'self_pay' else 'insurance' end) as "billingRoute",
            coalesce(nullif(to_jsonb(charges)->>'patient_responsibility_cents', '')::int, 0) as "patientResponsibilityCents",
            coalesce(nullif(to_jsonb(charges)->>'insurance_responsibility_cents', '')::int, 0) as "insuranceResponsibilityCents",
            coalesce(modifier_codes, array[]::text[]) as "modifierCodes",
            source, charge_group as "chargeGroup", line_note as "lineNote",
            created_at as "createdAt"
     from charges where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  res.json({ charges: result.rows });
});

// Get charges for specific encounter
chargesRouter.get("/encounter/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { encounterId } = req.params;

  const result = await pool.query(
    `select id, encounter_id as "encounterId", cpt_code as "cptCode", description, icd_codes as "icdCodes",
            linked_diagnosis_ids as "linkedDiagnosisIds", quantity, fee_cents as "feeCents",
            amount_cents as "amountCents", status,
            coalesce(nullif(to_jsonb(charges)->>'code_type', ''), 'CPT') as "codeType",
            coalesce(nullif(to_jsonb(charges)->>'billing_route', ''), case when status = 'self_pay' then 'self_pay' else 'insurance' end) as "billingRoute",
            coalesce(nullif(to_jsonb(charges)->>'patient_responsibility_cents', '')::int, 0) as "patientResponsibilityCents",
            coalesce(nullif(to_jsonb(charges)->>'insurance_responsibility_cents', '')::int, 0) as "insuranceResponsibilityCents",
            coalesce(modifier_codes, array[]::text[]) as "modifierCodes",
            source, charge_group as "chargeGroup", line_note as "lineNote",
            created_at as "createdAt"
     from charges
     where tenant_id = $1 and encounter_id = $2
     order by created_at asc`,
    [tenantId, encounterId],
  );
  res.json({ charges: result.rows });
});

chargesRouter.post("/", requireAuth, requireRoles(["admin", "billing", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = chargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const normalizedCode = normalizeCode(payload.cptCode);
  const catalogEntry = await lookupChargeCode(tenantId, normalizedCode);
  const codeType = normalizeCodeType(payload.codeType || catalogEntry?.codeType, normalizedCode);
  const billingRoute = normalizeBillingRoute(payload.billingRoute || catalogEntry?.billingRoute, payload.status, codeType);
  const quantity = payload.quantity || 1;
  const feeCents = payload.feeCents ?? catalogEntry?.feeCents ?? 0;
  const amountCents = payload.amountCents ?? feeCents * quantity;
  const status = statusForRoute(billingRoute, payload.status);
  const description = payload.description || catalogEntry?.description || `${codeType} ${normalizedCode}`;
  const linkedDiagnosisIds = payload.linkedDiagnosisIds || [];
  const patientResponsibilityCents = billingRoute === "self_pay" ? amountCents : 0;
  const insuranceResponsibilityCents = billingRoute === "insurance" ? amountCents : 0;
  const resolvedIcdCodes = payload.icdCodes && payload.icdCodes.length > 0
    ? payload.icdCodes.map(normalizeCode)
    : await resolveDiagnosisCodesFromIds(tenantId, payload.encounterId, linkedDiagnosisIds);
  let patientId: string | null = null;
  let serviceDate: string | null = null;
  if (payload.encounterId) {
    const encounterResult = await pool.query(
      `select e.patient_id as "patientId",
              coalesce(a.scheduled_start::date, e.created_at::date, current_date) as "serviceDate"
       from encounters e
       left join appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
       where e.id = $1 and e.tenant_id = $2
       limit 1`,
      [payload.encounterId, tenantId],
    );
    patientId = encounterResult.rows[0]?.patientId || null;
    serviceDate = encounterResult.rows[0]?.serviceDate || null;
  }
  await pool.query(
    `insert into charges(
       id, tenant_id, encounter_id, cpt_code, code_type, billing_route, description, icd_codes,
       linked_diagnosis_ids, quantity, fee_cents, amount_cents, status,
       modifier_codes, source, charge_group, line_note,
       patient_id, service_date, amount,
       patient_responsibility_cents, insurance_responsibility_cents
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::int,$13,$14,$15,$16,$17,$18,$19,round(($12::numeric / 100), 2),$20,$21)`,
    [
      id,
      tenantId,
      payload.encounterId || null,
      normalizedCode,
      codeType,
      billingRoute,
      description,
      resolvedIcdCodes,
      linkedDiagnosisIds,
      quantity,
      feeCents || null,
      amountCents,
      status,
      payload.modifierCodes || [],
      payload.source || "manual_charge_capture",
      payload.chargeGroup || catalogEntry?.category || null,
      payload.lineNote || null,
      patientId,
      serviceDate,
      patientResponsibilityCents,
      insuranceResponsibilityCents,
    ],
  );
  res.status(201).json({ id });
});

// Update charge
chargesRouter.put("/:id", requireAuth, requireRoles(["admin", "billing", "provider", "ma", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = updateChargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const payload = parsed.data;

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  let currentCharge: { encounterId?: string; quantity?: number; feeCents?: number; amountCents?: number } | null = null;
  const loadCurrentCharge = async () => {
    if (currentCharge) return currentCharge;

    const currentResult = await pool.query(
      `select encounter_id as "encounterId",
              quantity,
              fee_cents as "feeCents",
              amount_cents as "amountCents"
       from charges
       where id = $1 and tenant_id = $2
       limit 1`,
      [id, tenantId],
    );

    if (currentResult.rows.length === 0) {
      return null;
    }

    currentCharge = currentResult.rows[0];
    return currentCharge;
  };

  const linkedDiagnosisIds = payload.linkedDiagnosisIds;
  const resolvedIcdCodes = payload.icdCodes !== undefined
    ? payload.icdCodes.map(normalizeCode)
    : linkedDiagnosisIds !== undefined
      ? await (async () => {
          const charge = await loadCurrentCharge();
          if (!charge) return null;
          return resolveDiagnosisCodesFromIds(tenantId, charge.encounterId, linkedDiagnosisIds);
        })()
      : undefined;

  if (resolvedIcdCodes === null) {
    return res.status(404).json({ error: "Charge not found" });
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(payload.description);
  }
  if (resolvedIcdCodes !== undefined) {
    updates.push(`icd_codes = $${paramCount++}`);
    values.push(resolvedIcdCodes);
  }
  if (payload.linkedDiagnosisIds !== undefined) {
    updates.push(`linked_diagnosis_ids = $${paramCount++}`);
    values.push(payload.linkedDiagnosisIds);
  }
  if (payload.quantity !== undefined) {
    updates.push(`quantity = $${paramCount++}`);
    values.push(payload.quantity);
  }
  if (payload.feeCents !== undefined) {
    updates.push(`fee_cents = $${paramCount++}`);
    values.push(payload.feeCents);
  }
  if (payload.amountCents !== undefined) {
    updates.push(`amount_cents = $${paramCount}::int`);
    updates.push(`amount = round(($${paramCount}::numeric / 100), 2)`);
    values.push(payload.amountCents);
    paramCount++;
  }
  if (payload.codeType !== undefined) {
    updates.push(`code_type = $${paramCount++}`);
    values.push(payload.codeType);
  }
  if (payload.billingRoute !== undefined) {
    updates.push(`billing_route = $${paramCount++}`);
    values.push(payload.billingRoute);
  }
  if (payload.modifierCodes !== undefined) {
    updates.push(`modifier_codes = $${paramCount++}`);
    values.push(payload.modifierCodes);
  }
  if (payload.source !== undefined) {
    updates.push(`source = $${paramCount++}`);
    values.push(payload.source);
  }
  if (payload.chargeGroup !== undefined) {
    updates.push(`charge_group = $${paramCount++}`);
    values.push(payload.chargeGroup);
  }
  if (payload.lineNote !== undefined) {
    updates.push(`line_note = $${paramCount++}`);
    values.push(payload.lineNote);
  }
  if (payload.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(payload.status);
  }

  if (payload.amountCents === undefined && (payload.quantity !== undefined || payload.feeCents !== undefined)) {
    const charge = await loadCurrentCharge();
    if (!charge) {
      return res.status(404).json({ error: "Charge not found" });
    }

    const nextQuantity = payload.quantity ?? normalizeCents(charge.quantity, 1);
    const nextFeeCents = payload.feeCents ?? normalizeCents(charge.feeCents);
    const nextAmountCents = Math.max(0, nextQuantity * nextFeeCents);
    updates.push(`amount_cents = $${paramCount}::int`);
    updates.push(`amount = round(($${paramCount}::numeric / 100), 2)`);
    values.push(nextAmountCents);
    paramCount++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id, tenantId);
  await pool.query(
    `update charges set ${updates.join(", ")} where id = $${paramCount} and tenant_id = $${paramCount + 1}`,
    values,
  );
  await pool.query(
    `update charges
     set patient_responsibility_cents = case
           when coalesce(billing_route, case when status = 'self_pay' then 'self_pay' else 'insurance' end) = 'self_pay'
             then coalesce(amount_cents, 0)
           else 0
         end,
         insurance_responsibility_cents = case
           when coalesce(billing_route, case when status = 'self_pay' then 'self_pay' else 'insurance' end) = 'insurance'
             then coalesce(amount_cents, 0)
           else 0
         end
     where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );

  res.json({ success: true });
});

// Delete charge
chargesRouter.delete("/:id", requireAuth, requireRoles(["admin", "billing", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(`delete from charges where id = $1 and tenant_id = $2`, [id, tenantId]);
  res.json({ success: true });
});

// Search CPT codes
chargesRouter.get("/search/cpt", requireAuth, async (req: AuthedRequest, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const searchTerm = `%${q}%`;
  const result = await pool.query(
    `with tenant_fee_items as (
       select distinct on (fsi.cpt_code)
         fsi.cpt_code,
         nullif(fsi.cpt_description, '') as cpt_description,
         nullif(fsi.category, '') as category,
         nullif(to_jsonb(fsi)->>'subcategory', '') as subcategory,
         fsi.fee_cents,
         nullif(to_jsonb(fsi)->>'code_type', '') as code_type,
         nullif(to_jsonb(fsi)->>'billing_route', '') as billing_route,
         coalesce(nullif(to_jsonb(fsi)->>'requires_diagnosis', '')::boolean, true) as requires_diagnosis,
         coalesce(nullif(to_jsonb(fsi)->>'is_cosmetic', '')::boolean, false) as is_cosmetic,
         nullif(to_jsonb(fsi)->>'notes', '') as notes
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
       order by fsi.cpt_code, fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     )
     select
       coalesce(tfi.cpt_code, c.code) as code,
       coalesce(c.description, tfi.cpt_description, tfi.cpt_code) as description,
       coalesce(c.category, tfi.category) as category,
       tfi.subcategory,
       coalesce(tfi.fee_cents, c.default_fee_cents, 0) as "defaultFeeCents",
       coalesce(c.is_common, false) as "isCommon",
       coalesce(tfi.code_type, nullif(to_jsonb(c)->>'code_type', ''),
         case
           when coalesce(tfi.cpt_code, c.code) ~ '^[0-9]{5}$' then 'CPT'
           when coalesce(tfi.cpt_code, c.code) ~ '^[A-Z][0-9]{4}$' then 'HCPCS'
           else 'INTERNAL'
         end
       ) as "codeType",
       coalesce(tfi.billing_route, nullif(to_jsonb(c)->>'billing_route', ''),
         case
           when coalesce(tfi.cpt_code, c.code) ~ '^[0-9]{5}$' then 'insurance'
           when coalesce(tfi.cpt_code, c.code) ~ '^[A-Z][0-9]{4}$' then 'insurance'
           else 'self_pay'
         end
       ) as "billingRoute",
       coalesce(tfi.requires_diagnosis, nullif(to_jsonb(c)->>'requires_diagnosis', '')::boolean, true) as "requiresDiagnosis",
       coalesce(tfi.is_cosmetic, false) as "isCosmetic",
       tfi.notes
     from tenant_fee_items tfi
     full outer join cpt_codes c on c.code = tfi.cpt_code
     where coalesce(tfi.cpt_code, c.code) ilike $2
        or coalesce(c.description, tfi.cpt_description, '') ilike $2
        or coalesce(c.category, tfi.category, '') ilike $2
        or coalesce(tfi.subcategory, '') ilike $2
     order by "isCommon" desc, "billingRoute" asc, code asc
     limit 100`,
    [req.user!.tenantId, searchTerm],
  );

  res.json({ codes: result.rows });
});
