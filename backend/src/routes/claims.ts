import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { scrubClaim, applyAutoFixes, getPassedChecks } from "../services/claimScrubber";
import { suggestModifiers, getAllModifierRules, getModifierInfo } from "../services/modifierEngine";
import {
  emitClaimCreated,
  emitClaimUpdated,
  emitClaimStatusChanged,
  emitClaimSubmitted,
  emitClaimDenied,
  emitClaimPaid,
  emitPaymentReceived,
} from "../websocket/emitter";
import { logger } from "../lib/logger";

const claimCreateSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  payer: z.string().optional(),
  payerId: z.string().optional(),
  serviceDate: z.string().optional(),
  lineItems: z.array(z.object({
    cpt: z.string(),
    modifiers: z.array(z.string()).optional(),
    dx: z.array(z.string()),
    units: z.number().int().positive(),
    charge: z.number().positive(),
    description: z.string().optional(),
  })).optional(),
});

const claimUpdateSchema = z.object({
  lineItems: z.array(z.object({
    cpt: z.string(),
    modifiers: z.array(z.string()).optional(),
    dx: z.array(z.string()),
    units: z.number().int().positive(),
    charge: z.number().positive(),
    description: z.string().optional(),
  })).optional(),
  isCosmetic: z.boolean().optional(),
  cosmeticReason: z.string().optional(),
  notes: z.string().optional(),
});

const claimStatusSchema = z.object({
  status: z.enum(["draft", "scrubbed", "ready", "submitted", "accepted", "denied", "paid", "appealed"]),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentDate: z.string(),
  paymentMethod: z.string().optional(),
  payer: z.string().optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
});

const appealSchema = z.object({
  appealNotes: z.string(),
  denialReason: z.string().optional(),
});

const scrubSchema = z.object({
  claimId: z.string(),
  autoFix: z.boolean().optional(),
});

const batchSubmitSchema = z.object({
  claimIds: z.array(z.string()),
});

export const claimsRouter = Router();

// GET /api/claims/diagnosis-codes - Get available diagnosis codes
claimsRouter.get("/diagnosis-codes", requireAuth, async (req: AuthedRequest, res) => {
  const { search, category, common } = req.query;

  let query = `select id, icd10_code as "icd10Code", description, category,
                      is_common as "isCommon", specialty
               from diagnosis_codes
               where specialty = 'dermatology'`;

  const params: any[] = [];
  let paramCount = 0;

  if (common === 'true') {
    query += ` and is_common = true`;
  }

  if (category) {
    paramCount++;
    query += ` and category = $${paramCount}`;
    params.push(category);
  }

  if (search) {
    paramCount++;
    query += ` and (icd10_code ilike $${paramCount} or description ilike $${paramCount})`;
    params.push(`%${search}%`);
  }

  query += ` order by is_common desc, icd10_code asc limit 100`;

  const result = await pool.query(query, params);
  res.json({ diagnosisCodes: result.rows });
});

// GET /api/claims - List all claims with filters
claimsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, patientId, startDate, endDate, scrubStatus, isCosmetic } = req.query;

  let query = `
    select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_charges as "totalCharges", c.status,
      c.payer, c.payer_id as "payerId", c.payer_name as "payerName",
      c.submitted_at as "submittedAt", c.service_date as "serviceDate",
      c.scrub_status as "scrubStatus", c.is_cosmetic as "isCosmetic",
      c.denial_reason as "denialReason", c.denial_date as "denialDate",
      c.appeal_status as "appealStatus",
      c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      pr.full_name as "providerName"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` and c.status = $${paramCount}`;
    params.push(status);
  }

  if (scrubStatus) {
    paramCount++;
    query += ` and c.scrub_status = $${paramCount}`;
    params.push(scrubStatus);
  }

  if (patientId) {
    paramCount++;
    query += ` and c.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (isCosmetic !== undefined) {
    paramCount++;
    query += ` and c.is_cosmetic = $${paramCount}`;
    params.push(isCosmetic === 'true');
  }

  if (startDate) {
    paramCount++;
    query += ` and c.service_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and c.service_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by c.service_date desc, c.created_at desc limit 200`;

  const result = await pool.query(query, params);
  res.json({ claims: result.rows });
});

// GET /api/claims/:id - Get single claim with detail
claimsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  // Fetch claim
  const claimResult = await pool.query(
    `select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_charges as "totalCharges", c.status,
      c.payer, c.payer_id as "payerId", c.payer_name as "payerName",
      c.submitted_at as "submittedAt", c.service_date as "serviceDate",
      c.line_items as "lineItems", c.scrub_status as "scrubStatus",
      c.scrub_errors as "scrubErrors", c.scrub_warnings as "scrubWarnings",
      c.scrub_info as "scrubInfo", c.last_scrubbed_at as "lastScrubbedAt",
      c.is_cosmetic as "isCosmetic", c.cosmetic_reason as "cosmeticReason",
      c.denial_reason as "denialReason", c.denial_code as "denialCode",
      c.denial_date as "denialDate", c.denial_category as "denialCategory",
      c.appeal_status as "appealStatus", c.appeal_notes as "appealNotes",
      c.appeal_submitted_at as "appealSubmittedAt",
      c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.dob, p.insurance_plan_name as "insurancePlanName",
      pr.full_name as "providerName"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.id = $1 and c.tenant_id = $2`,
    [claimId, tenantId],
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claim = claimResult.rows[0];

  // Fetch payments
  const paymentsResult = await pool.query(
    `select id, amount_cents as "amountCents", payment_date as "paymentDate",
            payment_method as "paymentMethod", payer, check_number as "checkNumber",
            notes, created_at as "createdAt"
     from claim_payments
     where claim_id = $1 and tenant_id = $2
     order by payment_date desc`,
    [claimId, tenantId],
  );

  // Fetch status history
  const historyResult = await pool.query(
    `select id, status, notes, changed_by as "changedBy", changed_at as "changedAt"
     from claim_status_history
     where claim_id = $1 and tenant_id = $2
     order by changed_at desc`,
    [claimId, tenantId],
  );

  // Fetch diagnoses
  const diagnosesResult = await pool.query(
    `select id, icd10_code as "icd10Code", description, is_primary as "isPrimary",
            sequence_number as "sequenceNumber"
     from claim_diagnoses
     where claim_id = $1 and tenant_id = $2
     order by is_primary desc, sequence_number asc`,
    [claimId, tenantId],
  );

  // Fetch charges
  const chargesResult = await pool.query(
    `select id, cpt_code as "cptCode", description, modifiers, quantity,
            fee_cents as "feeCents", linked_diagnosis_ids as "linkedDiagnosisIds",
            sequence_number as "sequenceNumber"
     from claim_charges
     where claim_id = $1 and tenant_id = $2
     order by sequence_number asc`,
    [claimId, tenantId],
  );

  res.json({
    claim,
    payments: paymentsResult.rows,
    statusHistory: historyResult.rows,
    diagnoses: diagnosesResult.rows,
    charges: chargesResult.rows,
  });
});

// POST /api/claims - Create new claim
claimsRouter.post("/", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const claimId = crypto.randomUUID();

  // Calculate total from line items or encounter charges
  let totalCharges = 0;
  let lineItems = payload.lineItems || [];

  if (payload.encounterId && !payload.lineItems) {
    // Load from encounter
    const chargesResult = await pool.query(
      `select cpt_code as cpt, quantity as units, fee_cents / 100.0 as charge, description,
              linked_diagnosis_ids as dx
       from charges
       where encounter_id = $1 and tenant_id = $2`,
      [payload.encounterId, tenantId],
    );

    lineItems = chargesResult.rows.map((row: any) => ({
      cpt: row.cpt,
      modifiers: [],
      dx: row.dx || [],
      units: row.units,
      charge: row.charge,
      description: row.description,
    }));
  }

  totalCharges = lineItems.reduce((sum, item) => sum + (item.charge * item.units), 0);

  // Generate claim number
  const claimNumber = `CLM-${Date.now()}-${claimId.substring(0, 8)}`;
  const serviceDate = payload.serviceDate || new Date().toISOString().split('T')[0];

  // Pull insurance info from latest eligibility verification if not provided
  let payerId = payload.payerId;
  let payerName = payload.payer;

  if (!payerId || !payerName) {
    const insuranceResult = await pool.query(
      `SELECT
        p.insurance_payer_id,
        p.insurance_plan_name,
        iv.payer_name,
        iv.payer_id
       FROM patients p
       LEFT JOIN insurance_verifications iv ON iv.id = p.latest_verification_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [payload.patientId, tenantId]
    );

    if (insuranceResult.rows.length > 0) {
      const insurance = insuranceResult.rows[0];
      payerId = payerId || insurance.payer_id || insurance.insurance_payer_id || null;
      payerName = payerName || insurance.payer_name || insurance.insurance_plan_name || null;
    }
  }

  await pool.query(
    `insert into claims(id, tenant_id, encounter_id, patient_id, claim_number, total_charges,
                        service_date, status, payer, payer_id, payer_name, line_items, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [claimId, tenantId, payload.encounterId || null, payload.patientId, claimNumber, totalCharges,
     serviceDate, "draft", payerName, payerId, payerName,
     JSON.stringify(lineItems), req.user!.id],
  );

  // Create initial status history
  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, now())`,
    [crypto.randomUUID(), tenantId, claimId, "draft", req.user!.id],
  );

  await auditLog(tenantId, req.user!.id, "claim_create", "claim", claimId);
  res.status(201).json({ id: claimId, claimNumber });
});

// PUT /api/claims/:id - Update claim
claimsRouter.put("/:id", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const payload = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const updates: string[] = [`updated_at = now()`, `updated_by = $1`];
  const params: any[] = [req.user!.id];
  let paramCount = 1;

  if (payload.lineItems) {
    paramCount++;
    updates.push(`line_items = $${paramCount}`);
    params.push(JSON.stringify(payload.lineItems));

    // Recalculate total
    const totalCharges = payload.lineItems.reduce((sum, item) => sum + (item.charge * item.units), 0);
    paramCount++;
    updates.push(`total_charges = $${paramCount}`);
    params.push(totalCharges);
  }

  if (payload.isCosmetic !== undefined) {
    paramCount++;
    updates.push(`is_cosmetic = $${paramCount}`);
    params.push(payload.isCosmetic);
  }

  if (payload.cosmeticReason) {
    paramCount++;
    updates.push(`cosmetic_reason = $${paramCount}`);
    params.push(payload.cosmeticReason);
  }

  paramCount++;
  params.push(claimId);
  paramCount++;
  params.push(tenantId);

  await pool.query(
    `update claims set ${updates.join(", ")} where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    params,
  );

  await auditLog(tenantId, req.user!.id, "claim_update", "claim", claimId);
  res.json({ ok: true });
});

// PUT /api/claims/:id/status - Update claim status
claimsRouter.put("/:id/status", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { status, notes } = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  // Update claim status
  const updates: string[] = [`status = $1`, `updated_at = now()`];
  const params: any[] = [status];
  let paramCount = 1;

  if (status === "submitted") {
    paramCount++;
    updates.push(`submitted_at = $${paramCount}`);
    params.push(new Date().toISOString());
  }

  paramCount++;
  params.push(claimId);
  paramCount++;
  params.push(tenantId);

  await pool.query(
    `update claims set ${updates.join(", ")} where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    params,
  );

  // Add to status history
  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [crypto.randomUUID(), tenantId, claimId, status, notes || null, req.user!.id],
  );

  await auditLog(tenantId, req.user!.id, `claim_status_${status}`, "claim", claimId);
  res.json({ ok: true });
});

// POST /api/claims/scrub - Run claim scrubber
claimsRouter.post("/scrub", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scrubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { claimId, autoFix } = parsed.data;

  // Load claim
  const claimResult = await pool.query(
    `select id, tenant_id, patient_id, service_date, line_items, payer_id, payer_name, is_cosmetic
     from claims
     where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claimData = claimResult.rows[0];

  // Run scrubber
  const scrubResult = await scrubClaim({
    id: claimData.id,
    tenantId: claimData.tenant_id,
    patientId: claimData.patient_id,
    serviceDate: claimData.service_date,
    lineItems: claimData.line_items || [],
    payerId: claimData.payer_id,
    payerName: claimData.payer_name,
    isCosmetic: claimData.is_cosmetic,
  });

  // Apply auto-fixes if requested
  let updatedLineItems = claimData.line_items;
  if (autoFix && scrubResult.errors.length > 0) {
    const fixableIssues = scrubResult.errors.filter(e => e.autoFixable);
    if (fixableIssues.length > 0) {
      const fixedClaim = applyAutoFixes({
        id: claimData.id,
        tenantId: claimData.tenant_id,
        patientId: claimData.patient_id,
        serviceDate: claimData.service_date,
        lineItems: claimData.line_items || [],
      }, fixableIssues);

      updatedLineItems = fixedClaim.lineItems;

      // Re-run scrubber on fixed claim
      const reScrubResult = await scrubClaim(fixedClaim);

      // Update claim with fixes
      await pool.query(
        `update claims
         set line_items = $1, scrub_status = $2, scrub_errors = $3, scrub_warnings = $4,
             scrub_info = $5, last_scrubbed_at = now()
         where id = $6 and tenant_id = $7`,
        [
          JSON.stringify(updatedLineItems),
          reScrubResult.status,
          JSON.stringify(reScrubResult.errors),
          JSON.stringify(reScrubResult.warnings),
          JSON.stringify(reScrubResult.info),
          claimId,
          tenantId,
        ]
      );

      return res.json({
        ...reScrubResult,
        autoFixed: true,
        updatedLineItems,
        passedChecks: getPassedChecks(fixedClaim),
      });
    }
  }

  // Update claim with scrub results
  await pool.query(
    `update claims
     set scrub_status = $1, scrub_errors = $2, scrub_warnings = $3, scrub_info = $4,
         last_scrubbed_at = now()
     where id = $5 and tenant_id = $6`,
    [
      scrubResult.status,
      JSON.stringify(scrubResult.errors),
      JSON.stringify(scrubResult.warnings),
      JSON.stringify(scrubResult.info),
      claimId,
      tenantId,
    ]
  );

  const passedChecks = getPassedChecks({
    id: claimData.id,
    tenantId: claimData.tenant_id,
    patientId: claimData.patient_id,
    serviceDate: claimData.service_date,
    lineItems: claimData.line_items || [],
  });

  res.json({ ...scrubResult, passedChecks });
});

// POST /api/claims/submit - Submit claims batch
claimsRouter.post("/submit", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = batchSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { claimIds } = parsed.data;

  const results = {
    submitted: [] as string[],
    errors: [] as { claimId: string; error: string }[],
  };

  for (const claimId of claimIds) {
    try {
      // Check scrub status
      const claimResult = await pool.query(
        `select scrub_status from claims where id = $1 and tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        results.errors.push({ claimId, error: "Claim not found" });
        continue;
      }

      const scrubStatus = claimResult.rows[0].scrub_status;
      if (scrubStatus === "errors") {
        results.errors.push({ claimId, error: "Claim has unresolved errors" });
        continue;
      }

      // Update to submitted
      await pool.query(
        `update claims set status = 'submitted', submitted_at = now() where id = $1 and tenant_id = $2`,
        [claimId, tenantId]
      );

      await pool.query(
        `insert into claim_status_history(id, tenant_id, claim_id, status, changed_by, changed_at)
         values ($1, $2, $3, $4, $5, now())`,
        [crypto.randomUUID(), tenantId, claimId, "submitted", req.user!.id]
      );

      results.submitted.push(claimId);
    } catch (err: any) {
      results.errors.push({ claimId, error: err.message });
    }
  }

  res.json(results);
});

// GET /api/claims/denials - Get denied claims
claimsRouter.get("/denials", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `select
      c.id, c.claim_number as "claimNumber", c.patient_id as "patientId",
      c.service_date as "serviceDate", c.total_charges as "totalCharges",
      c.denial_reason as "denialReason", c.denial_code as "denialCode",
      c.denial_date as "denialDate", c.denial_category as "denialCategory",
      c.appeal_status as "appealStatus", c.appeal_submitted_at as "appealSubmittedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      pr.full_name as "providerName",
      EXTRACT(DAY FROM NOW() - c.denial_date) as "daysSinceDenial"
    from claims c
    join patients p on p.id = c.patient_id
    left join encounters e on e.id = c.encounter_id
    left join providers pr on pr.id = e.provider_id
    where c.tenant_id = $1 and c.status = 'denied'
    order by c.denial_date desc`,
    [tenantId]
  );

  res.json({ denials: result.rows });
});

// POST /api/claims/:id/appeal - Create appeal
claimsRouter.post("/:id/appeal", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const { appealNotes, denialReason } = parsed.data;

  // Check if claim is denied
  const claimResult = await pool.query(
    `select status from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  if (claimResult.rows[0].status !== "denied") {
    return res.status(400).json({ error: "Can only appeal denied claims" });
  }

  // Update claim with appeal info
  await pool.query(
    `update claims
     set status = 'appealed', appeal_status = 'pending', appeal_notes = $1,
         appeal_submitted_at = now(), denial_reason = COALESCE($2, denial_reason)
     where id = $3 and tenant_id = $4`,
    [appealNotes, denialReason || null, claimId, tenantId]
  );

  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [crypto.randomUUID(), tenantId, claimId, "appealed", appealNotes, req.user!.id]
  );

  await auditLog(tenantId, req.user!.id, "claim_appeal_submitted", "claim", claimId);
  res.json({ ok: true });
});

// GET /api/claims/metrics - Dashboard metrics with aging buckets
claimsRouter.get("/metrics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Overall counts
  const countsResult = await pool.query(
    `select
      count(*) filter (where status = 'draft') as "draftCount",
      count(*) filter (where status = 'ready') as "readyCount",
      count(*) filter (where status = 'submitted' or status = 'accepted') as "pendingCount",
      count(*) filter (where status = 'denied') as "deniedCount",
      count(*) filter (where status = 'paid') as "paidCount",
      sum(total_charges) filter (where status = 'submitted' or status = 'accepted') as "pendingAmount",
      sum(total_charges) filter (where status = 'paid') as "paidAmount",
      sum(total_charges) filter (where status = 'denied') as "deniedAmount"
    from claims
    where tenant_id = $1 and service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Aging buckets (days since service date for unpaid claims)
  const agingResult = await pool.query(
    `select
      count(*) filter (where age <= 30) as "age_0_30",
      sum(total_charges) filter (where age <= 30) as "amount_0_30",
      count(*) filter (where age > 30 and age <= 60) as "age_31_60",
      sum(total_charges) filter (where age > 30 and age <= 60) as "amount_31_60",
      count(*) filter (where age > 60 and age <= 90) as "age_61_90",
      sum(total_charges) filter (where age > 60 and age <= 90) as "amount_61_90",
      count(*) filter (where age > 90) as "age_90_plus",
      sum(total_charges) filter (where age > 90) as "amount_90_plus"
    from (
      select
        c.*,
        EXTRACT(DAY FROM NOW() - c.service_date::timestamptz) as age
      from claims c
      where c.tenant_id = $1
        and c.status in ('submitted', 'accepted', 'denied')
    ) claims_with_age`,
    [tenantId]
  );

  // Average days to payment
  const daysToPaymentResult = await pool.query(
    `select
      avg(EXTRACT(DAY FROM payment_date::timestamptz - c.service_date::timestamptz)) as "avgDaysToPayment",
      count(*) as "paidClaimsCount"
    from claims c
    join claim_payments cp on cp.claim_id = c.id
    where c.tenant_id = $1
      and c.status = 'paid'
      and c.service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Collection rate (paid vs total charged)
  const collectionResult = await pool.query(
    `select
      sum(c.total_charges) as "totalCharges",
      coalesce(sum(cp.total_payments), 0) as "totalPayments",
      case
        when sum(c.total_charges) > 0
        then (coalesce(sum(cp.total_payments), 0) / sum(c.total_charges)) * 100
        else 0
      end as "collectionRate"
    from claims c
    left join (
      select claim_id, sum(amount_cents) / 100.0 as total_payments
      from claim_payments
      where tenant_id = $1
      group by claim_id
    ) cp on cp.claim_id = c.id
    where c.tenant_id = $1
      and c.service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  // Denial rate
  const denialRateResult = await pool.query(
    `select
      count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid')) as "totalSubmitted",
      count(*) filter (where status = 'denied') as "deniedCount",
      case
        when count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid')) > 0
        then (count(*) filter (where status = 'denied')::float / count(*) filter (where status in ('submitted', 'accepted', 'denied', 'paid'))::float) * 100
        else 0
      end as "denialRate"
    from claims
    where tenant_id = $1
      and service_date >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  res.json({
    counts: countsResult.rows[0],
    aging: agingResult.rows[0],
    daysToPayment: daysToPaymentResult.rows[0],
    collection: collectionResult.rows[0],
    denialRate: denialRateResult.rows[0],
  });
});

// GET /api/claims/analytics - Denial analytics
claimsRouter.get("/analytics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Overall stats
  const statsResult = await pool.query(
    `select
      count(*) filter (where status = 'submitted') as "submitted",
      count(*) filter (where status = 'denied') as "denied",
      count(*) filter (where status = 'paid') as "paid",
      count(*) filter (where status IN ('submitted', 'accepted')) as "inProcess",
      count(*) filter (where status = 'denied') * 100.0 / NULLIF(count(*) filter (where status IN ('submitted', 'denied', 'accepted', 'paid')), 0) as "denialRate",
      avg(EXTRACT(DAY FROM paid_at - submitted_at)) filter (where status = 'paid' and submitted_at is not null) as "avgDaysToPayment"
    from (
      select *,
        (select max(changed_at) from claim_status_history where claim_id = c.id and status = 'paid') as paid_at
      from claims c
      where tenant_id = $1 and submitted_at >= NOW() - INTERVAL '90 days'
    ) claims_with_paid`,
    [tenantId]
  );

  // Top denial reasons
  const denialReasonsResult = await pool.query(
    `select denial_category, denial_reason, count(*) as count
     from claims
     where tenant_id = $1 and status = 'denied' and denial_date >= NOW() - INTERVAL '90 days'
     group by denial_category, denial_reason
     order by count desc
     limit 10`,
    [tenantId]
  );

  // Denial rate by payer
  const payerResult = await pool.query(
    `select
      payer_name,
      count(*) filter (where status = 'denied') as denied,
      count(*) as total,
      count(*) filter (where status = 'denied') * 100.0 / count(*) as "denialRate"
     from claims
     where tenant_id = $1 and submitted_at >= NOW() - INTERVAL '90 days'
       and payer_name is not null
     group by payer_name
     having count(*) >= 5
     order by "denialRate" desc
     limit 10`,
    [tenantId]
  );

  // Denial rate by provider
  const providerResult = await pool.query(
    `select
      pr.full_name as "providerName",
      count(*) filter (where c.status = 'denied') as denied,
      count(*) as total,
      count(*) filter (where c.status = 'denied') * 100.0 / count(*) as "denialRate"
     from claims c
     left join encounters e on e.id = c.encounter_id
     left join providers pr on pr.id = e.provider_id
     where c.tenant_id = $1 and c.submitted_at >= NOW() - INTERVAL '90 days'
       and pr.full_name is not null
     group by pr.full_name
     having count(*) >= 5
     order by "denialRate" desc
     limit 10`,
    [tenantId]
  );

  // Appeal success rate
  const appealResult = await pool.query(
    `select
      count(*) filter (where appeal_status = 'approved') as approved,
      count(*) filter (where appeal_status = 'denied') as "appealDenied",
      count(*) as total,
      count(*) filter (where appeal_status = 'approved') * 100.0 / NULLIF(count(*), 0) as "successRate"
     from claims
     where tenant_id = $1 and status = 'appealed'`,
    [tenantId]
  );

  res.json({
    stats: statsResult.rows[0],
    topDenialReasons: denialReasonsResult.rows,
    denialByPayer: payerResult.rows,
    denialByProvider: providerResult.rows,
    appealStats: appealResult.rows[0],
  });
});

// POST /api/claims/:id/payments - Post payment to claim
claimsRouter.post("/:id/payments", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const payload = parsed.data;

  // Check if claim exists
  const existing = await pool.query(`select id, status from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const paymentId = crypto.randomUUID();

  await pool.query(
    `insert into claim_payments(id, tenant_id, claim_id, amount_cents, payment_date, payment_method, payer, check_number, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      paymentId,
      tenantId,
      claimId,
      payload.amountCents,
      payload.paymentDate,
      payload.paymentMethod || null,
      payload.payer || null,
      payload.checkNumber || null,
      payload.notes || null,
      req.user!.id,
    ],
  );

  // Check if claim is fully paid and update status
  const paymentsResult = await pool.query(
    `select sum(amount_cents) as "totalPaid" from claim_payments where claim_id = $1 and tenant_id = $2`,
    [claimId, tenantId],
  );

  const claimResult = await pool.query(
    `select total_charges from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  const totalPaid = paymentsResult.rows[0]?.totalPaid || 0;
  const totalCents = Math.round((claimResult.rows[0]?.total_charges || 0) * 100);

  if (totalPaid >= totalCents && existing.rows[0].status !== "paid") {
    await pool.query(
      `update claims set status = 'paid', updated_at = now(), paid_amount = total_charges where id = $1 and tenant_id = $2`,
      [claimId, tenantId]
    );

    await pool.query(
      `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
       values ($1, $2, $3, $4, $5, $6, now())`,
      [crypto.randomUUID(), tenantId, claimId, "paid", "Fully paid", req.user!.id],
    );
  }

  await auditLog(tenantId, req.user!.id, "claim_payment_posted", "claim", claimId);
  res.status(201).json({ id: paymentId });
});

// GET /api/claims/modifiers - Get modifier rules
claimsRouter.get("/modifiers", requireAuth, async (req: AuthedRequest, res) => {
  const rules = await getAllModifierRules();
  res.json({ modifiers: rules });
});

// GET /api/claims/modifiers/:code - Get specific modifier info
claimsRouter.get("/modifiers/:code", requireAuth, async (req: AuthedRequest, res) => {
  const code = String(req.params.code);
  const info = await getModifierInfo(code);

  if (!info) {
    return res.status(404).json({ error: "Modifier not found" });
  }

  res.json(info);
});

// POST /api/claims/:id/suggest-modifiers - Suggest modifiers for claim
claimsRouter.post("/:id/suggest-modifiers", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  // Load claim
  const claimResult = await pool.query(
    `select line_items from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const lineItems = claimResult.rows[0].line_items || [];
  const suggestions = await suggestModifiers(tenantId, lineItems);

  res.json({ suggestions });
});
