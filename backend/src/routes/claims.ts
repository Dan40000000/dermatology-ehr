import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const claimCreateSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  payer: z.string().optional(),
  payerId: z.string().optional(),
});

const claimStatusSchema = z.object({
  status: z.enum(["draft", "ready", "submitted", "accepted", "rejected", "paid"]),
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

export const claimsRouter = Router();

// List all claims with filters
claimsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, patientId, startDate, endDate } = req.query;

  let query = `
    select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_cents as "totalCents", c.status,
      c.payer, c.payer_id as "payerId", c.submitted_at as "submittedAt",
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

  if (patientId) {
    paramCount++;
    query += ` and c.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (startDate) {
    paramCount++;
    query += ` and c.created_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and c.created_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by c.created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ claims: result.rows });
});

// Get single claim with detail
claimsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  // Fetch claim
  const claimResult = await pool.query(
    `select
      c.id, c.claim_number as "claimNumber", c.encounter_id as "encounterId",
      c.patient_id as "patientId", c.total_cents as "totalCents", c.status,
      c.payer, c.payer_id as "payerId", c.submitted_at as "submittedAt",
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

  // Fetch diagnoses if encounter exists
  let diagnoses: any[] = [];
  if (claim.encounterId) {
    const diagResult = await pool.query(
      `select id, icd10_code as "icd10Code", description, is_primary as "isPrimary"
       from encounter_diagnoses
       where encounter_id = $1 and tenant_id = $2`,
      [claim.encounterId, tenantId],
    );
    diagnoses = diagResult.rows;
  }

  // Fetch charges if encounter exists
  let charges: any[] = [];
  if (claim.encounterId) {
    const chargeResult = await pool.query(
      `select id, cpt_code as "cptCode", description, quantity, fee_cents as "feeCents",
              linked_diagnosis_ids as "linkedDiagnosisIds"
       from charges
       where encounter_id = $1 and tenant_id = $2`,
      [claim.encounterId, tenantId],
    );
    charges = chargeResult.rows;
  }

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

  res.json({
    claim,
    diagnoses,
    charges,
    payments: paymentsResult.rows,
    statusHistory: historyResult.rows,
  });
});

// Create new claim (from encounter or standalone)
claimsRouter.post("/", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = claimCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const claimId = crypto.randomUUID();

  // Calculate total from encounter charges if encounter exists
  let totalCents = 0;
  if (payload.encounterId) {
    const chargesResult = await pool.query(
      `select sum((fee_cents * quantity)) as total
       from charges
       where encounter_id = $1 and tenant_id = $2`,
      [payload.encounterId, tenantId],
    );
    totalCents = chargesResult.rows[0]?.total || 0;
  }

  // Generate claim number
  const claimNumber = `CLM-${Date.now()}-${claimId.substring(0, 8)}`;

  await pool.query(
    `insert into claims(id, tenant_id, encounter_id, patient_id, claim_number, total_cents, status, payer, payer_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [claimId, tenantId, payload.encounterId || null, payload.patientId, claimNumber, totalCents, "draft", payload.payer || null, payload.payerId || null],
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

// Update claim status
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

// Post payment to claim
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
    `insert into claim_payments(id, tenant_id, claim_id, amount_cents, payment_date, payment_method, payer, check_number, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    ],
  );

  // Check if claim is fully paid and update status
  const paymentsResult = await pool.query(
    `select sum(amount_cents) as "totalPaid" from claim_payments where claim_id = $1 and tenant_id = $2`,
    [claimId, tenantId],
  );

  const claimResult = await pool.query(`select total_cents as "totalCents" from claims where id = $1 and tenant_id = $2`, [claimId, tenantId]);

  const totalPaid = paymentsResult.rows[0]?.totalPaid || 0;
  const totalCents = claimResult.rows[0]?.totalCents || 0;

  if (totalPaid >= totalCents && existing.rows[0].status !== "paid") {
    await pool.query(`update claims set status = 'paid', updated_at = now() where id = $1 and tenant_id = $2`, [claimId, tenantId]);

    await pool.query(
      `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
       values ($1, $2, $3, $4, $5, $6, now())`,
      [crypto.randomUUID(), tenantId, claimId, "paid", "Fully paid", req.user!.id],
    );
  }

  await auditLog(tenantId, req.user!.id, "claim_payment_posted", "claim", claimId);
  res.status(201).json({ id: paymentId });
});
