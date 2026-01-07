import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const submitClaimSchema = z.object({
  claimId: z.string().uuid(),
  batchId: z.string().optional(),
});

const eraPostSchema = z.object({
  claims: z.array(z.object({
    claimId: z.string().uuid(),
    paidAmountCents: z.number().int(),
  })),
});

const eraCreateSchema = z.object({
  eraNumber: z.string(),
  payer: z.string(),
  payerId: z.string().optional(),
  paymentAmountCents: z.number().int().positive(),
  checkNumber: z.string().optional(),
  checkDate: z.string().optional(),
  eftTraceNumber: z.string().optional(),
  claims: z.array(z.object({
    claimNumber: z.string(),
    chargeAmountCents: z.number().int(),
    paidAmountCents: z.number().int(),
    adjustmentAmountCents: z.number().int().default(0),
    patientResponsibilityCents: z.number().int().default(0),
    serviceDate: z.string().optional(),
    status: z.string().optional(),
  })),
});

const eftCreateSchema = z.object({
  eftTraceNumber: z.string(),
  payer: z.string(),
  payerId: z.string().optional(),
  paymentAmountCents: z.number().int().positive(),
  depositDate: z.string(),
  depositAccount: z.string().optional(),
  transactionType: z.string().optional(),
});

const reconcileSchema = z.object({
  eraId: z.string().uuid(),
  eftId: z.string().uuid().optional(),
  varianceReason: z.string().optional(),
  notes: z.string().optional(),
});

export const clearinghouseRouter = Router();

// ============================================================================
// CLAIM SUBMISSION
// ============================================================================

// Submit claim to clearinghouse (mock implementation)
clearinghouseRouter.post("/submit-claim", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = submitClaimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { claimId, batchId } = parsed.data;

  // Check if claim exists
  const claimResult = await pool.query(
    `select id, claim_number as "claimNumber", status from claims where id = $1 and tenant_id = $2`,
    [claimId, tenantId]
  );

  if (!claimResult.rowCount) {
    return res.status(404).json({ error: "Claim not found" });
  }

  const claim = claimResult.rows[0];

  if (claim.status === "submitted" || claim.status === "accepted") {
    return res.status(400).json({ error: "Claim already submitted" });
  }

  // Mock clearinghouse submission logic
  const submissionId = crypto.randomUUID();
  const submissionNumber = `SUB-${Date.now()}-${submissionId.substring(0, 8)}`;
  const controlNumber = `CTRL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  // Simulate random responses (accept, reject, or pend)
  const outcomes = ["accepted", "rejected", "pending"] as const;
  const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];

  const mockResponse = {
    submissionId,
    controlNumber,
    status: randomOutcome,
    message: randomOutcome === "accepted"
      ? "Claim accepted by clearinghouse"
      : randomOutcome === "rejected"
      ? "Claim rejected: Invalid payer ID"
      : "Claim pending review",
    timestamp: new Date().toISOString(),
  };

  // Create clearinghouse submission record
  await pool.query(
    `insert into clearinghouse_submissions(
      id, tenant_id, claim_id, batch_id, submission_number, control_number,
      submitted_at, status, clearinghouse_response, created_by
    ) values ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9)`,
    [
      submissionId,
      tenantId,
      claimId,
      batchId || null,
      submissionNumber,
      controlNumber,
      randomOutcome,
      JSON.stringify(mockResponse),
      req.user!.id,
    ]
  );

  // Update claim status
  await pool.query(
    `update claims set status = $1, submitted_at = now(), updated_at = now() where id = $2 and tenant_id = $3`,
    [randomOutcome === "accepted" ? "accepted" : "submitted", claimId, tenantId]
  );

  // Add to claim status history
  await pool.query(
    `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [
      crypto.randomUUID(),
      tenantId,
      claimId,
      randomOutcome === "accepted" ? "accepted" : "submitted",
      `Submitted via clearinghouse: ${controlNumber}`,
      req.user!.id,
    ]
  );

  await auditLog(tenantId, req.user!.id, "claim_submitted_to_clearinghouse", "claim", claimId);

  res.status(201).json({
    submissionId,
    submissionNumber,
    controlNumber,
    status: randomOutcome,
    message: mockResponse.message,
  });
});

// Get claim submission status
clearinghouseRouter.get("/claim-status/:claimId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.claimId);

  const result = await pool.query(
    `select
      cs.id, cs.submission_number as "submissionNumber", cs.control_number as "controlNumber",
      cs.submitted_at as "submittedAt", cs.status, cs.clearinghouse_response as "clearinghouseResponse",
      cs.error_message as "errorMessage", cs.retry_count as "retryCount",
      c.claim_number as "claimNumber", c.total_cents as "totalCents",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    from clearinghouse_submissions cs
    join claims c on c.id = cs.claim_id
    join patients p on p.id = c.patient_id
    where cs.claim_id = $1 and cs.tenant_id = $2
    order by cs.submitted_at desc
    limit 1`,
    [claimId, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Submission not found" });
  }

  res.json(result.rows[0]);
});

// ============================================================================
// ELECTRONIC REMITTANCE ADVICE (ERA)
// ============================================================================

// List all ERAs
clearinghouseRouter.get("/era", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, payer, startDate, endDate } = req.query;

  let query = `
    select
      id, era_number as "eraNumber", payer, payer_id as "payerId",
      payment_amount_cents as "paymentAmountCents", check_number as "checkNumber",
      check_date as "checkDate", eft_trace_number as "eftTraceNumber",
      deposit_date as "depositDate", received_at as "receivedAt",
      posted_at as "postedAt", status, claims_paid as "claimsPaid",
      total_adjustments_cents as "totalAdjustmentsCents", notes,
      created_at as "createdAt"
    from remittance_advice
    where tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` and status = $${paramCount}`;
    params.push(status);
  }

  if (payer) {
    paramCount++;
    query += ` and payer ilike $${paramCount}`;
    params.push(`%${payer}%`);
  }

  if (startDate) {
    paramCount++;
    query += ` and received_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and received_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by received_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ eras: result.rows });
});

// Create ERA (for testing/simulation)
clearinghouseRouter.post("/era", requireAuth, requireRoles(["admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = eraCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const eraId = crypto.randomUUID();

  // Create ERA record
  await pool.query(
    `insert into remittance_advice(
      id, tenant_id, era_number, payer, payer_id, payment_amount_cents,
      check_number, check_date, eft_trace_number, claims_paid
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      eraId,
      tenantId,
      payload.eraNumber,
      payload.payer,
      payload.payerId || null,
      payload.paymentAmountCents,
      payload.checkNumber || null,
      payload.checkDate || null,
      payload.eftTraceNumber || null,
      payload.claims.length,
    ]
  );

  // Create ERA claim details
  for (const claimDetail of payload.claims) {
    // Try to find matching claim
    const claimResult = await pool.query(
      `select id from claims where claim_number = $1 and tenant_id = $2`,
      [claimDetail.claimNumber, tenantId]
    );

    await pool.query(
      `insert into era_claim_details(
        id, tenant_id, era_id, claim_id, claim_number, charge_amount_cents,
        paid_amount_cents, adjustment_amount_cents, patient_responsibility_cents,
        service_date, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        crypto.randomUUID(),
        tenantId,
        eraId,
        claimResult.rows[0]?.id || null,
        claimDetail.claimNumber,
        claimDetail.chargeAmountCents,
        claimDetail.paidAmountCents,
        claimDetail.adjustmentAmountCents,
        claimDetail.patientResponsibilityCents,
        claimDetail.serviceDate || null,
        claimDetail.status || "paid",
      ]
    );
  }

  await auditLog(tenantId, req.user!.id, "era_created", "remittance_advice", eraId);
  res.status(201).json({ id: eraId });
});

// Get ERA details
clearinghouseRouter.get("/era/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const eraId = String(req.params.id);

  // Get ERA header
  const eraResult = await pool.query(
    `select
      id, era_number as "eraNumber", payer, payer_id as "payerId",
      payment_amount_cents as "paymentAmountCents", check_number as "checkNumber",
      check_date as "checkDate", eft_trace_number as "eftTraceNumber",
      deposit_date as "depositDate", received_at as "receivedAt",
      posted_at as "postedAt", posted_by as "postedBy", status,
      claims_paid as "claimsPaid", total_adjustments_cents as "totalAdjustmentsCents",
      notes, created_at as "createdAt"
    from remittance_advice
    where id = $1 and tenant_id = $2`,
    [eraId, tenantId]
  );

  if (!eraResult.rowCount) {
    return res.status(404).json({ error: "ERA not found" });
  }

  // Get claim details
  const claimsResult = await pool.query(
    `select
      id, claim_id as "claimId", patient_control_number as "patientControlNumber",
      patient_name as "patientName", claim_number as "claimNumber",
      charge_amount_cents as "chargeAmountCents", paid_amount_cents as "paidAmountCents",
      adjustment_amount_cents as "adjustmentAmountCents",
      patient_responsibility_cents as "patientResponsibilityCents",
      service_date as "serviceDate", adjustment_codes as "adjustmentCodes",
      remark_codes as "remarkCodes", status
    from era_claim_details
    where era_id = $1 and tenant_id = $2
    order by created_at`,
    [eraId, tenantId]
  );

  res.json({
    era: eraResult.rows[0],
    claims: claimsResult.rows,
  });
});

// Post ERA payments to claims
clearinghouseRouter.post("/era/:id/post", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const eraId = String(req.params.id);

  // Check if ERA exists and is not already posted
  const eraResult = await pool.query(
    `select id, status, payment_amount_cents as "paymentAmountCents" from remittance_advice where id = $1 and tenant_id = $2`,
    [eraId, tenantId]
  );

  if (!eraResult.rowCount) {
    return res.status(404).json({ error: "ERA not found" });
  }

  if (eraResult.rows[0].status === "posted") {
    return res.status(400).json({ error: "ERA already posted" });
  }

  // Get all claim details from ERA
  const claimsResult = await pool.query(
    `select claim_id as "claimId", paid_amount_cents as "paidAmountCents"
     from era_claim_details
     where era_id = $1 and tenant_id = $2 and claim_id is not null`,
    [eraId, tenantId]
  );

  let postedCount = 0;

  // Post payments to each claim
  for (const claimDetail of claimsResult.rows) {
    const paymentId = crypto.randomUUID();

    await pool.query(
      `insert into claim_payments(id, tenant_id, claim_id, amount_cents, payment_date, payment_method, payer)
       values ($1, $2, $3, $4, current_date, 'ERA', (select payer from remittance_advice where id = $5))`,
      [paymentId, tenantId, claimDetail.claimId, claimDetail.paidAmountCents, eraId]
    );

    // Check if claim is now fully paid
    const paymentsResult = await pool.query(
      `select sum(amount_cents) as "totalPaid" from claim_payments where claim_id = $1 and tenant_id = $2`,
      [claimDetail.claimId, tenantId]
    );

    const claimResult = await pool.query(
      `select total_cents as "totalCents", status from claims where id = $1 and tenant_id = $2`,
      [claimDetail.claimId, tenantId]
    );

    const totalPaid = paymentsResult.rows[0]?.totalPaid || 0;
    const totalCents = claimResult.rows[0]?.totalCents || 0;

    if (totalPaid >= totalCents && claimResult.rows[0]?.status !== "paid") {
      await pool.query(
        `update claims set status = 'paid', updated_at = now() where id = $1 and tenant_id = $2`,
        [claimDetail.claimId, tenantId]
      );

      await pool.query(
        `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
         values ($1, $2, $3, $4, $5, $6, now())`,
        [crypto.randomUUID(), tenantId, claimDetail.claimId, "paid", `Paid via ERA ${eraId}`, req.user!.id]
      );
    }

    postedCount++;
  }

  // Update ERA status
  await pool.query(
    `update remittance_advice set status = 'posted', posted_at = now(), posted_by = $1, updated_at = now()
     where id = $2 and tenant_id = $3`,
    [req.user!.id, eraId, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "era_posted", "remittance_advice", eraId);

  res.json({ ok: true, claimsPosted: postedCount });
});

// ============================================================================
// ELECTRONIC FUNDS TRANSFER (EFT)
// ============================================================================

// List EFT transactions
clearinghouseRouter.get("/eft", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { reconciled, payer, startDate, endDate } = req.query;

  let query = `
    select
      id, eft_trace_number as "eftTraceNumber", payer, payer_id as "payerId",
      payment_amount_cents as "paymentAmountCents", deposit_date as "depositDate",
      deposit_account as "depositAccount", transaction_type as "transactionType",
      bank_trace_number as "bankTraceNumber", era_id as "eraId",
      reconciled, reconciled_at as "reconciledAt", variance_cents as "varianceCents",
      notes, created_at as "createdAt"
    from eft_transactions
    where tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (reconciled !== undefined) {
    paramCount++;
    query += ` and reconciled = $${paramCount}`;
    params.push(reconciled === "true");
  }

  if (payer) {
    paramCount++;
    query += ` and payer ilike $${paramCount}`;
    params.push(`%${payer}%`);
  }

  if (startDate) {
    paramCount++;
    query += ` and deposit_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and deposit_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by deposit_date desc, created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ efts: result.rows });
});

// Create EFT transaction (for testing/simulation)
clearinghouseRouter.post("/eft", requireAuth, requireRoles(["admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = eftCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const eftId = crypto.randomUUID();

  await pool.query(
    `insert into eft_transactions(
      id, tenant_id, eft_trace_number, payer, payer_id, payment_amount_cents,
      deposit_date, deposit_account, transaction_type
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      eftId,
      tenantId,
      payload.eftTraceNumber,
      payload.payer,
      payload.payerId || null,
      payload.paymentAmountCents,
      payload.depositDate,
      payload.depositAccount || null,
      payload.transactionType || "eft",
    ]
  );

  await auditLog(tenantId, req.user!.id, "eft_created", "eft_transactions", eftId);
  res.status(201).json({ id: eftId });
});

// ============================================================================
// PAYMENT RECONCILIATION
// ============================================================================

// Reconcile ERA with EFT
clearinghouseRouter.post("/reconcile", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = reconcileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { eraId, eftId, varianceReason, notes } = parsed.data;

  // Get ERA details
  const eraResult = await pool.query(
    `select payment_amount_cents as "paymentAmountCents", payer from remittance_advice where id = $1 and tenant_id = $2`,
    [eraId, tenantId]
  );

  if (!eraResult.rowCount) {
    return res.status(404).json({ error: "ERA not found" });
  }

  const expectedAmount = eraResult.rows[0].paymentAmountCents;
  let receivedAmount = expectedAmount;
  let varianceCents = 0;

  // If EFT provided, get actual received amount
  if (eftId) {
    const eftResult = await pool.query(
      `select payment_amount_cents as "paymentAmountCents" from eft_transactions where id = $1 and tenant_id = $2`,
      [eftId, tenantId]
    );

    if (!eftResult.rowCount) {
      return res.status(404).json({ error: "EFT not found" });
    }

    receivedAmount = eftResult.rows[0].paymentAmountCents;
    varianceCents = receivedAmount - expectedAmount;

    // Link ERA to EFT
    await pool.query(
      `update eft_transactions set era_id = $1, reconciled = true, reconciled_at = now(), reconciled_by = $2, variance_cents = $3
       where id = $4 and tenant_id = $5`,
      [eraId, req.user!.id, varianceCents, eftId, tenantId]
    );
  }

  // Create reconciliation record
  const reconciliationId = crypto.randomUUID();
  await pool.query(
    `insert into payment_reconciliation(
      id, tenant_id, era_id, eft_id, expected_amount_cents, received_amount_cents,
      variance_cents, variance_reason, reconciled_by, notes
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      reconciliationId,
      tenantId,
      eraId,
      eftId || null,
      expectedAmount,
      receivedAmount,
      varianceCents,
      varianceReason || (varianceCents === 0 ? null : "variance"),
      req.user!.id,
      notes || null,
    ]
  );

  // Update ERA status
  await pool.query(
    `update remittance_advice set status = 'reconciled', updated_at = now() where id = $1 and tenant_id = $2`,
    [eraId, tenantId]
  );

  await auditLog(tenantId, req.user!.id, "payment_reconciled", "remittance_advice", eraId);

  res.json({
    id: reconciliationId,
    varianceCents,
    status: varianceCents === 0 ? "balanced" : "variance",
  });
});

// ============================================================================
// CLOSING REPORTS
// ============================================================================

// Generate closing report
clearinghouseRouter.get("/reports/closing", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, reportType = "daily" } = req.query;

  // Get charges submitted
  const chargesResult = await pool.query(
    `select sum(total_cents) as total from claims
     where tenant_id = $1 and submitted_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get payments received
  const paymentsResult = await pool.query(
    `select sum(payment_amount_cents) as total from remittance_advice
     where tenant_id = $1 and received_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get adjustments
  const adjustmentsResult = await pool.query(
    `select sum(total_adjustments_cents) as total from remittance_advice
     where tenant_id = $1 and received_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get claims counts
  const claimsSubmitted = await pool.query(
    `select count(*) as count from claims
     where tenant_id = $1 and submitted_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  const claimsPaid = await pool.query(
    `select count(*) as count from claims
     where tenant_id = $1 and status = 'paid' and updated_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  const claimsDenied = await pool.query(
    `select count(*) as count from claims
     where tenant_id = $1 and status = 'rejected' and updated_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get ERA/EFT counts
  const erasReceived = await pool.query(
    `select count(*) as count from remittance_advice
     where tenant_id = $1 and received_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  const eftsReceived = await pool.query(
    `select count(*) as count from eft_transactions
     where tenant_id = $1 and deposit_date between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get reconciliation variance
  const varianceResult = await pool.query(
    `select sum(abs(variance_cents)) as total from payment_reconciliation
     where tenant_id = $1 and reconciled_at between $2 and $3`,
    [tenantId, startDate, endDate]
  );

  // Get outstanding balance
  const outstandingResult = await pool.query(
    `select sum(c.total_cents - coalesce(p.paid, 0)) as outstanding
     from claims c
     left join (
       select claim_id, sum(amount_cents) as paid
       from claim_payments
       where tenant_id = $1
       group by claim_id
     ) p on p.claim_id = c.id
     where c.tenant_id = $1 and c.status in ('submitted', 'accepted')`,
    [tenantId]
  );

  const report = {
    reportType,
    startDate,
    endDate,
    totalChargesCents: Number(chargesResult.rows[0]?.total || 0),
    totalPaymentsCents: Number(paymentsResult.rows[0]?.total || 0),
    totalAdjustmentsCents: Number(adjustmentsResult.rows[0]?.total || 0),
    outstandingBalanceCents: Number(outstandingResult.rows[0]?.outstanding || 0),
    claimsSubmitted: Number(claimsSubmitted.rows[0]?.count || 0),
    claimsPaid: Number(claimsPaid.rows[0]?.count || 0),
    claimsDenied: Number(claimsDenied.rows[0]?.count || 0),
    erasReceived: Number(erasReceived.rows[0]?.count || 0),
    eftsReceived: Number(eftsReceived.rows[0]?.count || 0),
    reconciliationVarianceCents: Number(varianceResult.rows[0]?.total || 0),
  };

  res.json(report);
});
