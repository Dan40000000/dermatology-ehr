import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const payerPaymentCreateSchema = z.object({
  paymentDate: z.string(),
  payerName: z.string().min(1),
  payerId: z.string().optional(),
  checkEftNumber: z.string().optional(),
  totalAmountCents: z.number().int().positive(),
  notes: z.string().optional(),
  batchId: z.string().optional(),
  lineItems: z.array(z.object({
    claimId: z.string().optional(),
    patientId: z.string(),
    serviceDate: z.string().optional(),
    amountCents: z.number().int(),
    adjustmentCents: z.number().int().optional(),
    notes: z.string().optional(),
  })).optional(),
});

const payerPaymentUpdateSchema = z.object({
  paymentDate: z.string().optional(),
  payerName: z.string().min(1).optional(),
  payerId: z.string().optional(),
  checkEftNumber: z.string().optional(),
  totalAmountCents: z.number().int().positive().optional(),
  status: z.enum(["pending", "partially_applied", "fully_applied", "reconciled"]).optional(),
  notes: z.string().optional(),
});

export const payerPaymentsRouter = Router();

// List all payer payments with filters
payerPaymentsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, payerName, startDate, endDate, batchId } = req.query;

  let query = `
    select
      pp.id, pp.payment_date as "paymentDate", pp.payer_name as "payerName",
      pp.payer_id as "payerId", pp.check_eft_number as "checkEftNumber",
      pp.total_amount_cents as "totalAmountCents",
      pp.applied_amount_cents as "appliedAmountCents",
      pp.unapplied_amount_cents as "unappliedAmountCents",
      pp.status, pp.notes, pp.batch_id as "batchId",
      pp.created_at as "createdAt", pp.updated_at as "updatedAt",
      u.full_name as "createdByName",
      (select count(*) from payer_payment_line_items where payer_payment_id = pp.id) as "lineItemCount"
    from payer_payments pp
    join users u on u.id = pp.created_by
    where pp.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` and pp.status = $${paramCount}`;
    params.push(status);
  }

  if (payerName) {
    paramCount++;
    query += ` and pp.payer_name ilike $${paramCount}`;
    params.push(`%${payerName}%`);
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

  if (batchId) {
    paramCount++;
    query += ` and pp.batch_id = $${paramCount}`;
    params.push(batchId);
  }

  query += ` order by pp.payment_date desc, pp.created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ payerPayments: result.rows });
});

// Get single payer payment with line items
payerPaymentsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);

  // Fetch payment
  const paymentResult = await pool.query(
    `select
      pp.id, pp.payment_date as "paymentDate", pp.payer_name as "payerName",
      pp.payer_id as "payerId", pp.check_eft_number as "checkEftNumber",
      pp.total_amount_cents as "totalAmountCents",
      pp.applied_amount_cents as "appliedAmountCents",
      pp.unapplied_amount_cents as "unappliedAmountCents",
      pp.status, pp.notes, pp.batch_id as "batchId",
      pp.created_at as "createdAt", pp.updated_at as "updatedAt",
      u.full_name as "createdByName"
    from payer_payments pp
    join users u on u.id = pp.created_by
    where pp.id = $1 and pp.tenant_id = $2`,
    [paymentId, tenantId],
  );

  if (!paymentResult.rowCount) {
    return res.status(404).json({ error: "Payer payment not found" });
  }

  const payment = paymentResult.rows[0];

  // Fetch line items
  const lineItemsResult = await pool.query(
    `select
      li.id, li.claim_id as "claimId", li.patient_id as "patientId",
      li.service_date as "serviceDate", li.amount_cents as "amountCents",
      li.adjustment_cents as "adjustmentCents", li.notes,
      li.created_at as "createdAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      c.claim_number as "claimNumber"
    from payer_payment_line_items li
    join patients p on p.id = li.patient_id
    left join claims c on c.id = li.claim_id
    where li.payer_payment_id = $1 and li.tenant_id = $2
    order by li.created_at asc`,
    [paymentId, tenantId],
  );

  res.json({
    payment,
    lineItems: lineItemsResult.rows,
  });
});

// Create new payer payment
payerPaymentsRouter.post("/", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = payerPaymentCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const paymentId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate applied and unapplied amounts
    const lineItems = payload.lineItems || [];
    const appliedAmountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
    const unappliedAmountCents = payload.totalAmountCents - appliedAmountCents;

    // Determine status
    let status = 'pending';
    if (appliedAmountCents === 0) {
      status = 'pending';
    } else if (appliedAmountCents < payload.totalAmountCents) {
      status = 'partially_applied';
    } else {
      status = 'fully_applied';
    }

    // Create payment
    await client.query(
      `insert into payer_payments(
        id, tenant_id, payment_date, payer_name, payer_id, check_eft_number,
        total_amount_cents, applied_amount_cents, unapplied_amount_cents,
        status, notes, batch_id, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        paymentId,
        tenantId,
        payload.paymentDate,
        payload.payerName,
        payload.payerId || null,
        payload.checkEftNumber || null,
        payload.totalAmountCents,
        appliedAmountCents,
        unappliedAmountCents,
        status,
        payload.notes || null,
        payload.batchId || null,
        req.user!.id,
      ],
    );

    // Create line items
    for (const item of lineItems) {
      const lineItemId = crypto.randomUUID();
      await client.query(
        `insert into payer_payment_line_items(
          id, tenant_id, payer_payment_id, claim_id, patient_id,
          service_date, amount_cents, adjustment_cents, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          lineItemId,
          tenantId,
          paymentId,
          item.claimId || null,
          item.patientId,
          item.serviceDate || null,
          item.amountCents,
          item.adjustmentCents || 0,
          item.notes || null,
        ],
      );

      // Update claim if applicable
      if (item.claimId) {
        await client.query(
          `update claims
           set updated_at = now()
           where id = $1 and tenant_id = $2`,
          [item.claimId, tenantId],
        );
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
    await auditLog(tenantId, req.user!.id, "payer_payment_create", "payer_payment", paymentId);
    res.status(201).json({ id: paymentId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Update payer payment
payerPaymentsRouter.put("/:id", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = payerPaymentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);
  const payload = parsed.data;

  // Check if payment exists
  const existing = await pool.query(
    `select id from payer_payments where id = $1 and tenant_id = $2`,
    [paymentId, tenantId],
  );
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Payer payment not found" });
  }

  const updates: string[] = [`updated_at = now()`];
  const values: any[] = [];
  let paramCount = 0;

  if (payload.paymentDate !== undefined) {
    paramCount++;
    updates.push(`payment_date = $${paramCount}`);
    values.push(payload.paymentDate);
  }
  if (payload.payerName !== undefined) {
    paramCount++;
    updates.push(`payer_name = $${paramCount}`);
    values.push(payload.payerName);
  }
  if (payload.payerId !== undefined) {
    paramCount++;
    updates.push(`payer_id = $${paramCount}`);
    values.push(payload.payerId);
  }
  if (payload.checkEftNumber !== undefined) {
    paramCount++;
    updates.push(`check_eft_number = $${paramCount}`);
    values.push(payload.checkEftNumber);
  }
  if (payload.totalAmountCents !== undefined) {
    paramCount++;
    updates.push(`total_amount_cents = $${paramCount}`);
    values.push(payload.totalAmountCents);
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
    `update payer_payments set ${updates.join(", ")}
     where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    values,
  );

  await auditLog(tenantId, req.user!.id, "payer_payment_update", "payer_payment", paymentId);
  res.json({ success: true });
});

// Delete payer payment
payerPaymentsRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const paymentId = String(req.params.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get batch info before deleting
    const paymentInfo = await client.query(
      `select batch_id from payer_payments where id = $1 and tenant_id = $2`,
      [paymentId, tenantId],
    );

    if (!paymentInfo.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Payer payment not found" });
    }

    const batchId = paymentInfo.rows[0].batch_id;

    // Delete payment (line items will cascade)
    await client.query(
      `delete from payer_payments where id = $1 and tenant_id = $2`,
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

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "payer_payment_delete", "payer_payment", paymentId);
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
