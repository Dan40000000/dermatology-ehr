import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const patientPaymentCreateSchema = z.object({
  patientId: z.string(),
  paymentDate: z.string(),
  amountCents: z.number().int().positive(),
  paymentMethod: z.enum(["cash", "credit", "debit", "check", "ach", "other"]),
  cardLastFour: z.string().optional(),
  checkNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  appliedToClaimId: z.string().optional(),
  appliedToInvoiceId: z.string().optional(),
  notes: z.string().optional(),
  batchId: z.string().optional(),
});

const patientPaymentUpdateSchema = z.object({
  paymentDate: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  paymentMethod: z.enum(["cash", "credit", "debit", "check", "ach", "other"]).optional(),
  cardLastFour: z.string().optional(),
  checkNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  status: z.enum(["pending", "posted", "refunded", "voided"]).optional(),
  notes: z.string().optional(),
});

export const patientPaymentsRouter = Router();

// List all patient payments with filters
patientPaymentsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status, startDate, endDate, paymentMethod, batchId } = req.query;

  let query = `
    select
      pp.id, pp.patient_id as "patientId", pp.payment_date as "paymentDate",
      pp.amount_cents as "amountCents", pp.payment_method as "paymentMethod",
      pp.card_last_four as "cardLastFour", pp.check_number as "checkNumber",
      pp.reference_number as "referenceNumber", pp.receipt_number as "receiptNumber",
      pp.applied_to_claim_id as "appliedToClaimId",
      pp.applied_to_invoice_id as "appliedToInvoiceId",
      pp.status, pp.notes, pp.batch_id as "batchId",
      pp.created_at as "createdAt", pp.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      u.full_name as "processedByName",
      c.claim_number as "claimNumber"
    from patient_payments pp
    join patients p on p.id = pp.patient_id
    join users u on u.id = pp.processed_by
    left join claims c on c.id = pp.applied_to_claim_id
    where pp.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and pp.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and pp.status = $${paramCount}`;
    params.push(status);
  }

  if (startDate) {
    paramCount++;
    query += ` and pp.payment_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and pp.payment_date <= $${paramCount}`;
    params.push(endDate);
  }

  if (paymentMethod) {
    paramCount++;
    query += ` and pp.payment_method = $${paramCount}`;
    params.push(paymentMethod);
  }

  if (batchId) {
    paramCount++;
    query += ` and pp.batch_id = $${paramCount}`;
    params.push(batchId);
  }

  query += ` order by pp.payment_date desc, pp.created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ patientPayments: result.rows });
});

// Get single patient payment
patientPaymentsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);

  const result = await pool.query(
    `select
      pp.id, pp.patient_id as "patientId", pp.payment_date as "paymentDate",
      pp.amount_cents as "amountCents", pp.payment_method as "paymentMethod",
      pp.card_last_four as "cardLastFour", pp.check_number as "checkNumber",
      pp.reference_number as "referenceNumber", pp.receipt_number as "receiptNumber",
      pp.applied_to_claim_id as "appliedToClaimId",
      pp.applied_to_invoice_id as "appliedToInvoiceId",
      pp.status, pp.notes, pp.batch_id as "batchId",
      pp.created_at as "createdAt", pp.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.email as "patientEmail", p.phone as "patientPhone",
      u.full_name as "processedByName",
      c.claim_number as "claimNumber"
    from patient_payments pp
    join patients p on p.id = pp.patient_id
    join users u on u.id = pp.processed_by
    left join claims c on c.id = pp.applied_to_claim_id
    where pp.id = $1 and pp.tenant_id = $2`,
    [paymentId, tenantId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Patient payment not found" });
  }

  res.json({ payment: result.rows[0] });
});

// Create new patient payment
patientPaymentsRouter.post("/", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = patientPaymentCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const paymentId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate receipt number
    const receiptResult = await client.query(
      `select count(*) as count from patient_payments where tenant_id = $1`,
      [tenantId],
    );
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(parseInt(receiptResult.rows[0].count) + 1).padStart(6, '0')}`;

    // Create payment
    await client.query(
      `insert into patient_payments(
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, card_last_four, check_number, reference_number,
        receipt_number, applied_to_claim_id, applied_to_invoice_id,
        status, notes, batch_id, processed_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        paymentId,
        tenantId,
        payload.patientId,
        payload.paymentDate,
        payload.amountCents,
        payload.paymentMethod,
        payload.cardLastFour || null,
        payload.checkNumber || null,
        payload.referenceNumber || null,
        receiptNumber,
        payload.appliedToClaimId || null,
        payload.appliedToInvoiceId || null,
        'posted',
        payload.notes || null,
        payload.batchId || null,
        req.user!.id,
      ],
    );

    // Update claim if payment applied to claim
    if (payload.appliedToClaimId) {
      // Get claim total and existing payments
      const claimResult = await client.query(
        `select total_cents as "totalCents" from claims where id = $1 and tenant_id = $2`,
        [payload.appliedToClaimId, tenantId],
      );

      if (claimResult.rowCount) {
        const paymentsResult = await client.query(
          `select coalesce(sum(amount_cents), 0) as "totalPaid"
           from patient_payments
           where applied_to_claim_id = $1 and tenant_id = $2 and status = 'posted'`,
          [payload.appliedToClaimId, tenantId],
        );

        const totalCents = claimResult.rows[0].totalCents;
        const totalPaid = parseInt(paymentsResult.rows[0].totalPaid);

        // Update claim status if fully paid
        if (totalPaid >= totalCents) {
          await client.query(
            `update claims
             set status = 'paid', updated_at = now()
             where id = $1 and tenant_id = $2`,
            [payload.appliedToClaimId, tenantId],
          );

          await client.query(
            `insert into claim_status_history(id, tenant_id, claim_id, status, notes, changed_by, changed_at)
             values ($1, $2, $3, $4, $5, $6, now())`,
            [crypto.randomUUID(), tenantId, payload.appliedToClaimId, "paid", "Fully paid by patient", req.user!.id],
          );
        }
      }
    }

    // Update batch item count if in a batch
    if (payload.batchId) {
      await client.query(
        `update payment_batches
         set item_count = item_count + 1,
             updated_at = now()
         where id = $1 and tenant_id = $2`,
        [payload.batchId, tenantId],
      );
    }

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "patient_payment_create", "patient_payment", paymentId);
    res.status(201).json({ id: paymentId, receiptNumber });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Update patient payment
patientPaymentsRouter.put("/:id", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = patientPaymentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);
  const payload = parsed.data;

  // Check if payment exists
  const existing = await pool.query(
    `select id from patient_payments where id = $1 and tenant_id = $2`,
    [paymentId, tenantId],
  );
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Patient payment not found" });
  }

  const updates: string[] = [`updated_at = now()`];
  const values: any[] = [];
  let paramCount = 0;

  if (payload.paymentDate !== undefined) {
    paramCount++;
    updates.push(`payment_date = $${paramCount}`);
    values.push(payload.paymentDate);
  }
  if (payload.amountCents !== undefined) {
    paramCount++;
    updates.push(`amount_cents = $${paramCount}`);
    values.push(payload.amountCents);
  }
  if (payload.paymentMethod !== undefined) {
    paramCount++;
    updates.push(`payment_method = $${paramCount}`);
    values.push(payload.paymentMethod);
  }
  if (payload.cardLastFour !== undefined) {
    paramCount++;
    updates.push(`card_last_four = $${paramCount}`);
    values.push(payload.cardLastFour);
  }
  if (payload.checkNumber !== undefined) {
    paramCount++;
    updates.push(`check_number = $${paramCount}`);
    values.push(payload.checkNumber);
  }
  if (payload.referenceNumber !== undefined) {
    paramCount++;
    updates.push(`reference_number = $${paramCount}`);
    values.push(payload.referenceNumber);
  }
  if (payload.status !== undefined) {
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(payload.status);
  }
  if (payload.notes !== undefined) {
    paramCount++;
    updates.push(`notes = $${paramCount}`);
    values.push(payload.notes);
  }

  if (values.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  paramCount++;
  values.push(paymentId);
  paramCount++;
  values.push(tenantId);

  await pool.query(
    `update patient_payments set ${updates.join(", ")}
     where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    values,
  );

  await auditLog(tenantId, req.user!.id, "patient_payment_update", "patient_payment", paymentId);
  res.json({ success: true });
});

// Delete/void patient payment
patientPaymentsRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get payment info before voiding
    const paymentInfo = await client.query(
      `select batch_id, applied_to_claim_id, amount_cents
       from patient_payments
       where id = $1 and tenant_id = $2`,
      [paymentId, tenantId],
    );

    if (!paymentInfo.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Patient payment not found" });
    }

    const { batch_id: batchId, applied_to_claim_id: claimId } = paymentInfo.rows[0];

    // Void the payment instead of deleting
    await client.query(
      `update patient_payments
       set status = 'voided', updated_at = now()
       where id = $1 and tenant_id = $2`,
      [paymentId, tenantId],
    );

    // Update batch item count if in a batch
    if (batchId) {
      await client.query(
        `update payment_batches
         set item_count = greatest(0, item_count - 1),
             updated_at = now()
         where id = $1 and tenant_id = $2`,
        [batchId, tenantId],
      );
    }

    // Recalculate claim status if payment was applied to claim
    if (claimId) {
      const claimResult = await client.query(
        `select total_cents as "totalCents" from claims where id = $1 and tenant_id = $2`,
        [claimId, tenantId],
      );

      if (claimResult.rowCount) {
        const paymentsResult = await client.query(
          `select coalesce(sum(amount_cents), 0) as "totalPaid"
           from patient_payments
           where applied_to_claim_id = $1 and tenant_id = $2 and status = 'posted'`,
          [claimId, tenantId],
        );

        const totalCents = claimResult.rows[0].totalCents;
        const totalPaid = parseInt(paymentsResult.rows[0].totalPaid);

        // Update claim status based on payment
        const newStatus = totalPaid >= totalCents ? 'paid' : (totalPaid > 0 ? 'accepted' : 'submitted');
        await client.query(
          `update claims
           set status = $1, updated_at = now()
           where id = $2 and tenant_id = $3`,
          [newStatus, claimId, tenantId],
        );
      }
    }

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "patient_payment_void", "patient_payment", paymentId);
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ============================================
// PAYMENT PLANS
// ============================================

const paymentPlanCreateSchema = z.object({
  patientId: z.string(),
  totalAmountCents: z.number().int().positive(),
  installmentAmountCents: z.number().int().positive(),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  startDate: z.string(),
  notes: z.string().optional(),
});

// List payment plans
patientPaymentsRouter.get("/plans/list", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status } = req.query;

  let query = `
    select
      pp.id, pp.patient_id as "patientId",
      pp.total_amount_cents as "totalAmountCents",
      pp.installment_amount_cents as "installmentAmountCents",
      pp.frequency, pp.start_date as "startDate",
      pp.next_payment_date as "nextPaymentDate",
      pp.paid_amount_cents as "paidAmountCents",
      pp.remaining_amount_cents as "remainingAmountCents",
      pp.status, pp.notes,
      pp.created_at as "createdAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
    from payment_plans pp
    join patients p on p.id = pp.patient_id
    where pp.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and pp.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and pp.status = $${paramCount}`;
    params.push(status);
  }

  query += ` order by pp.created_at desc`;

  try {
    const result = await pool.query(query, params);
    res.json({ paymentPlans: result.rows });
  } catch (error) {
    console.error("Error fetching payment plans:", error);
    res.status(500).json({ error: "Failed to fetch payment plans" });
  }
});

// Create payment plan
patientPaymentsRouter.post("/plans", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = paymentPlanCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const planId = crypto.randomUUID();

  // Calculate next payment date based on frequency
  const startDate = new Date(payload.startDate);
  let nextPaymentDate = new Date(startDate);

  try {
    await pool.query(
      `insert into payment_plans(
        id, tenant_id, patient_id, total_amount_cents,
        installment_amount_cents, frequency, start_date,
        next_payment_date, paid_amount_cents, remaining_amount_cents,
        status, notes, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        planId,
        tenantId,
        payload.patientId,
        payload.totalAmountCents,
        payload.installmentAmountCents,
        payload.frequency,
        payload.startDate,
        nextPaymentDate.toISOString().split('T')[0],
        0,
        payload.totalAmountCents,
        'active',
        payload.notes || null,
        req.user!.id,
      ],
    );

    await auditLog(tenantId, req.user!.id, "payment_plan_create", "payment_plan", planId);
    res.status(201).json({ id: planId });
  } catch (error) {
    console.error("Error creating payment plan:", error);
    res.status(500).json({ error: "Failed to create payment plan" });
  }
});

// Make payment plan payment
patientPaymentsRouter.post("/plans/:id/pay", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const planId = String(req.params.id);
  const { amountCents, paymentMethod, cardLastFour } = req.body;

  if (!amountCents || amountCents <= 0) {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get plan details
    const planResult = await client.query(
      `select * from payment_plans where id = $1 and tenant_id = $2`,
      [planId, tenantId],
    );

    if (!planResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Payment plan not found" });
    }

    const plan = planResult.rows[0];

    if (plan.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Payment plan is not active" });
    }

    // Create patient payment
    const paymentId = crypto.randomUUID();
    const receiptNumber = `RCP-${new Date().getFullYear()}-${Date.now()}`;

    await client.query(
      `insert into patient_payments(
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, card_last_four, receipt_number, status, notes, processed_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        paymentId,
        tenantId,
        plan.patient_id,
        new Date().toISOString().split('T')[0],
        amountCents,
        paymentMethod || 'credit',
        cardLastFour || null,
        receiptNumber,
        'posted',
        `Payment plan installment for plan ${planId}`,
        req.user!.id,
      ],
    );

    // Update plan totals
    const newPaidAmount = plan.paid_amount_cents + amountCents;
    const newRemainingAmount = Math.max(0, plan.remaining_amount_cents - amountCents);
    const newStatus = newRemainingAmount <= 0 ? 'completed' : 'active';

    // Calculate next payment date
    let nextPaymentDate = new Date(plan.next_payment_date);
    if (plan.frequency === 'weekly') {
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
    } else if (plan.frequency === 'biweekly') {
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 14);
    } else {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    }

    await client.query(
      `update payment_plans set
        paid_amount_cents = $1,
        remaining_amount_cents = $2,
        next_payment_date = $3,
        status = $4,
        updated_at = now()
       where id = $5 and tenant_id = $6`,
      [newPaidAmount, newRemainingAmount, nextPaymentDate.toISOString().split('T')[0], newStatus, planId, tenantId],
    );

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "payment_plan_payment", "payment_plan", planId);

    res.json({
      success: true,
      paymentId,
      receiptNumber,
      newBalance: newRemainingAmount,
      planStatus: newStatus,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error processing payment plan payment:", error);
    res.status(500).json({ error: "Failed to process payment" });
  } finally {
    client.release();
  }
});

// Cancel payment plan
patientPaymentsRouter.put("/plans/:id/cancel", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const planId = String(req.params.id);
  const { reason } = req.body;

  try {
    const result = await pool.query(
      `update payment_plans set
        status = 'cancelled',
        notes = coalesce(notes || ' | ', '') || $1,
        updated_at = now()
       where id = $2 and tenant_id = $3
       returning id`,
      [`Cancelled: ${reason || 'No reason provided'}`, planId, tenantId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Payment plan not found" });
    }

    await auditLog(tenantId, req.user!.id, "payment_plan_cancel", "payment_plan", planId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error cancelling payment plan:", error);
    res.status(500).json({ error: "Failed to cancel payment plan" });
  }
});

// ============================================
// TEXT-TO-PAY
// ============================================

// Send text-to-pay link
patientPaymentsRouter.post("/text-to-pay/send", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, amountCents, message } = req.body;

  if (!patientId || !amountCents) {
    return res.status(400).json({ error: "Patient ID and amount are required" });
  }

  try {
    // Get patient info
    const patientResult = await pool.query(
      `select id, first_name, last_name, phone from patients where id = $1 and tenant_id = $2`,
      [patientId, tenantId],
    );

    if (!patientResult.rowCount) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const patient = patientResult.rows[0];

    if (!patient.phone) {
      return res.status(400).json({ error: "Patient has no phone number on file" });
    }

    // Create text-to-pay link record
    const linkId = crypto.randomUUID();
    const linkCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `insert into text_to_pay_links(
        id, tenant_id, patient_id, amount_cents, link_code,
        expires_at, status, message, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [linkId, tenantId, patientId, amountCents, linkCode, expiresAt, 'pending', message || null, req.user!.id],
    );

    // In production, this would send an SMS via Twilio or similar
    // For now, just return the link details
    const paymentLink = `https://pay.dermapp.com/${linkCode}`;

    await auditLog(tenantId, req.user!.id, "text_to_pay_send", "text_to_pay_link", linkId);

    res.json({
      success: true,
      linkId,
      paymentLink,
      sentTo: patient.phone,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error sending text-to-pay:", error);
    res.status(500).json({ error: "Failed to send text-to-pay link" });
  }
});

// List text-to-pay links
patientPaymentsRouter.get("/text-to-pay/list", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status } = req.query;

  let query = `
    select
      ttp.id, ttp.patient_id as "patientId",
      ttp.amount_cents as "amountCents",
      ttp.link_code as "linkCode",
      ttp.expires_at as "expiresAt",
      ttp.status, ttp.message,
      ttp.paid_at as "paidAt",
      ttp.created_at as "createdAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      p.phone as "patientPhone"
    from text_to_pay_links ttp
    join patients p on p.id = ttp.patient_id
    where ttp.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and ttp.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and ttp.status = $${paramCount}`;
    params.push(status);
  }

  query += ` order by ttp.created_at desc limit 100`;

  try {
    const result = await pool.query(query, params);
    res.json({ textToPayLinks: result.rows });
  } catch (error) {
    console.error("Error fetching text-to-pay links:", error);
    res.status(500).json({ error: "Failed to fetch text-to-pay links" });
  }
});

// ============================================
// AUTOPAY
// ============================================

// Get patient's saved payment methods (for autopay)
patientPaymentsRouter.get("/saved-methods/:patientId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = String(req.params.patientId);

  try {
    const result = await pool.query(
      `select
        id, patient_id as "patientId",
        method_type as "methodType",
        last_four as "lastFour",
        card_brand as "cardBrand",
        expiry_month as "expiryMonth",
        expiry_year as "expiryYear",
        is_default as "isDefault",
        is_autopay_enabled as "isAutopayEnabled",
        nickname,
        created_at as "createdAt"
       from saved_payment_methods
       where patient_id = $1 and tenant_id = $2 and is_active = true
       order by is_default desc, created_at desc`,
      [patientId, tenantId],
    );

    res.json({ savedMethods: result.rows });
  } catch (error) {
    console.error("Error fetching saved payment methods:", error);
    res.status(500).json({ error: "Failed to fetch saved payment methods" });
  }
});

// Add saved payment method
patientPaymentsRouter.post("/saved-methods", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, methodType, lastFour, cardBrand, expiryMonth, expiryYear, isDefault, nickname } = req.body;

  if (!patientId || !methodType || !lastFour) {
    return res.status(400).json({ error: "Patient ID, method type, and last four are required" });
  }

  const methodId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If setting as default, unset other defaults
    if (isDefault) {
      await client.query(
        `update saved_payment_methods set is_default = false where patient_id = $1 and tenant_id = $2`,
        [patientId, tenantId],
      );
    }

    await client.query(
      `insert into saved_payment_methods(
        id, tenant_id, patient_id, method_type, last_four,
        card_brand, expiry_month, expiry_year, is_default, nickname, is_active
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
      [methodId, tenantId, patientId, methodType, lastFour, cardBrand || null, expiryMonth || null, expiryYear || null, isDefault || false, nickname || null],
    );

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "saved_method_add", "saved_payment_method", methodId);

    res.status(201).json({ id: methodId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error adding saved payment method:", error);
    res.status(500).json({ error: "Failed to add saved payment method" });
  } finally {
    client.release();
  }
});

// Toggle autopay for a saved method
patientPaymentsRouter.put("/saved-methods/:id/autopay", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const methodId = String(req.params.id);
  const { enabled } = req.body;

  try {
    const result = await pool.query(
      `update saved_payment_methods
       set is_autopay_enabled = $1, updated_at = now()
       where id = $2 and tenant_id = $3
       returning id`,
      [enabled, methodId, tenantId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Saved payment method not found" });
    }

    await auditLog(tenantId, req.user!.id, enabled ? "autopay_enable" : "autopay_disable", "saved_payment_method", methodId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating autopay:", error);
    res.status(500).json({ error: "Failed to update autopay" });
  }
});

// Delete saved payment method
patientPaymentsRouter.delete("/saved-methods/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const methodId = String(req.params.id);

  try {
    // Soft delete
    const result = await pool.query(
      `update saved_payment_methods
       set is_active = false, updated_at = now()
       where id = $1 and tenant_id = $2
       returning id`,
      [methodId, tenantId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Saved payment method not found" });
    }

    await auditLog(tenantId, req.user!.id, "saved_method_delete", "saved_payment_method", methodId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting saved payment method:", error);
    res.status(500).json({ error: "Failed to delete saved payment method" });
  }
});

// ============================================
// QUICK PAY LINKS
// ============================================

// Create quick pay link
patientPaymentsRouter.post("/quick-pay/create", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, amountCents, description, expiryDays = 30 } = req.body;

  if (!patientId || !amountCents) {
    return res.status(400).json({ error: "Patient ID and amount are required" });
  }

  try {
    const linkId = crypto.randomUUID();
    const linkCode = crypto.randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await pool.query(
      `insert into quick_pay_links(
        id, tenant_id, patient_id, amount_cents, link_code,
        description, expires_at, status, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [linkId, tenantId, patientId, amountCents, linkCode, description || null, expiresAt, 'active', req.user!.id],
    );

    const paymentLink = `https://pay.dermapp.com/q/${linkCode}`;

    await auditLog(tenantId, req.user!.id, "quick_pay_create", "quick_pay_link", linkId);

    res.status(201).json({
      id: linkId,
      linkCode,
      paymentLink,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating quick pay link:", error);
    res.status(500).json({ error: "Failed to create quick pay link" });
  }
});

// List quick pay links
patientPaymentsRouter.get("/quick-pay/list", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status } = req.query;

  let query = `
    select
      qpl.id, qpl.patient_id as "patientId",
      qpl.amount_cents as "amountCents",
      qpl.link_code as "linkCode",
      qpl.description,
      qpl.expires_at as "expiresAt",
      qpl.status,
      qpl.paid_at as "paidAt",
      qpl.created_at as "createdAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
    from quick_pay_links qpl
    join patients p on p.id = qpl.patient_id
    where qpl.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (status) {
    query += ` and qpl.status = $2`;
    params.push(status);
  }

  query += ` order by qpl.created_at desc limit 100`;

  try {
    const result = await pool.query(query, params);
    res.json({ quickPayLinks: result.rows });
  } catch (error) {
    console.error("Error fetching quick pay links:", error);
    res.status(500).json({ error: "Failed to fetch quick pay links" });
  }
});
