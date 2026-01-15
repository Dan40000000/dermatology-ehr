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
