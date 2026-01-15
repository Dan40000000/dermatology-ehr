import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const batchCreateSchema = z.object({
  batchDate: z.string(),
  batchType: z.enum(["payer", "patient", "mixed", "deposit", "eft"]),
  totalAmountCents: z.number().int(),
  depositDate: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
});

const batchUpdateSchema = z.object({
  batchDate: z.string().optional(),
  totalAmountCents: z.number().int().optional(),
  status: z.enum(["open", "closed", "posted", "reconciled", "voided"]).optional(),
  depositDate: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
});

export const batchesRouter = Router();

// List batches
batchesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { batchType, status, startDate, endDate } = req.query;

  let query = `
    select
      b.id, b.batch_number as "batchNumber", b.batch_date as "batchDate",
      b.batch_type as "batchType", b.total_amount_cents as "totalAmountCents",
      b.item_count as "itemCount", b.status, b.deposit_date as "depositDate",
      b.bank_account as "bankAccount", b.notes,
      b.created_at as "createdAt", b.updated_at as "updatedAt",
      b.closed_at as "closedAt",
      u1.full_name as "createdByName",
      u2.full_name as "closedByName"
    from payment_batches b
    join users u1 on u1.id = b.created_by
    left join users u2 on u2.id = b.closed_by
    where b.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (batchType) {
    paramCount++;
    query += ` and b.batch_type = $${paramCount}`;
    params.push(batchType);
  }

  if (status) {
    paramCount++;
    query += ` and b.status = $${paramCount}`;
    params.push(status);
  }

  if (startDate) {
    paramCount++;
    query += ` and b.batch_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and b.batch_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by b.batch_date desc, b.created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ batches: result.rows });
});

// Get single batch with associated payments
batchesRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const batchId = String(req.params.id);

  const batchResult = await pool.query(
    `select
      b.id, b.batch_number as "batchNumber", b.batch_date as "batchDate",
      b.batch_type as "batchType", b.total_amount_cents as "totalAmountCents",
      b.item_count as "itemCount", b.status, b.deposit_date as "depositDate",
      b.bank_account as "bankAccount", b.notes,
      b.created_at as "createdAt", b.updated_at as "updatedAt",
      b.closed_at as "closedAt",
      u1.full_name as "createdByName",
      u2.full_name as "closedByName"
    from payment_batches b
    join users u1 on u1.id = b.created_by
    left join users u2 on u2.id = b.closed_by
    where b.id = $1 and b.tenant_id = $2`,
    [batchId, tenantId],
  );

  if (!batchResult.rowCount) {
    return res.status(404).json({ error: "Batch not found" });
  }

  // Get payer payments in batch
  const payerPaymentsResult = await pool.query(
    `select
      pp.id, pp.payment_date as "paymentDate", pp.payer_name as "payerName",
      pp.check_eft_number as "checkEftNumber",
      pp.total_amount_cents as "totalAmountCents", pp.status
    from payer_payments pp
    where pp.batch_id = $1 and pp.tenant_id = $2
    order by pp.payment_date desc`,
    [batchId, tenantId],
  );

  // Get patient payments in batch
  const patientPaymentsResult = await pool.query(
    `select
      pp.id, pp.payment_date as "paymentDate",
      pp.amount_cents as "amountCents", pp.payment_method as "paymentMethod",
      pp.status, pp.receipt_number as "receiptNumber",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    from patient_payments pp
    join patients p on p.id = pp.patient_id
    where pp.batch_id = $1 and pp.tenant_id = $2
    order by pp.payment_date desc`,
    [batchId, tenantId],
  );

  res.json({
    batch: batchResult.rows[0],
    payerPayments: payerPaymentsResult.rows,
    patientPayments: patientPaymentsResult.rows,
  });
});

// Create batch
batchesRouter.post("/", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const batchId = crypto.randomUUID();

  // Generate batch number
  const countResult = await pool.query(
    `select count(*) as count from payment_batches where tenant_id = $1`,
    [tenantId],
  );
  const batchNumber = `BATCH-${new Date().getFullYear()}-${String(parseInt(countResult.rows[0].count) + 1).padStart(6, '0')}`;

  await pool.query(
    `insert into payment_batches(
      id, tenant_id, batch_number, batch_date, batch_type,
      total_amount_cents, status, deposit_date, bank_account, notes, created_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      batchId,
      tenantId,
      batchNumber,
      payload.batchDate,
      payload.batchType,
      payload.totalAmountCents,
      'open',
      payload.depositDate || null,
      payload.bankAccount || null,
      payload.notes || null,
      req.user!.id,
    ],
  );

  await auditLog(tenantId, req.user!.id, "batch_create", "batch", batchId);
  res.status(201).json({ id: batchId, batchNumber });
});

// Update batch
batchesRouter.put("/:id", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = batchUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const batchId = String(req.params.id);
  const payload = parsed.data;

  const updates: string[] = [`updated_at = now()`];
  const values: any[] = [];
  let paramCount = 0;

  if (payload.batchDate !== undefined) {
    paramCount++;
    updates.push(`batch_date = $${paramCount}`);
    values.push(payload.batchDate);
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
  if (payload.depositDate !== undefined) {
    paramCount++;
    updates.push(`deposit_date = $${paramCount}`);
    values.push(payload.depositDate);
  }
  if (payload.bankAccount !== undefined) {
    paramCount++;
    updates.push(`bank_account = $${paramCount}`);
    values.push(payload.bankAccount);
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
  values.push(batchId);
  paramCount++;
  values.push(tenantId);

  await pool.query(
    `update payment_batches set ${updates.join(", ")}
     where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    values,
  );

  await auditLog(tenantId, req.user!.id, "batch_update", "batch", batchId);
  res.json({ success: true });
});

// Close batch
batchesRouter.post("/:id/close", requireAuth, requireRoles(["provider", "admin", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const batchId = String(req.params.id);

  await pool.query(
    `update payment_batches
     set status = 'closed',
         closed_by = $1,
         closed_at = now(),
         updated_at = now()
     where id = $2 and tenant_id = $3 and status = 'open'`,
    [req.user!.id, batchId, tenantId],
  );

  await auditLog(tenantId, req.user!.id, "batch_close", "batch", batchId);
  res.json({ success: true });
});

// Post batch
batchesRouter.post("/:id/post", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const batchId = String(req.params.id);

  await pool.query(
    `update payment_batches
     set status = 'posted',
         updated_at = now()
     where id = $1 and tenant_id = $2 and status = 'closed'`,
    [batchId, tenantId],
  );

  await auditLog(tenantId, req.user!.id, "batch_post", "batch", batchId);
  res.json({ success: true });
});

// Delete/void batch
batchesRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const batchId = String(req.params.id);

  // Void instead of delete if batch has items
  const batchInfo = await pool.query(
    `select item_count from payment_batches where id = $1 and tenant_id = $2`,
    [batchId, tenantId],
  );

  if (!batchInfo.rowCount) {
    return res.status(404).json({ error: "Batch not found" });
  }

  if (batchInfo.rows[0].item_count > 0) {
    // Void batch instead of deleting
    await pool.query(
      `update payment_batches
       set status = 'voided', updated_at = now()
       where id = $1 and tenant_id = $2`,
      [batchId, tenantId],
    );
  } else {
    // Delete if no items
    await pool.query(
      `delete from payment_batches where id = $1 and tenant_id = $2`,
      [batchId, tenantId],
    );
  }

  await auditLog(tenantId, req.user!.id, "batch_delete", "batch", batchId);
  res.json({ success: true });
});
