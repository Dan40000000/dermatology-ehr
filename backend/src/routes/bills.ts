import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const billCreateSchema = z.object({
  patientId: z.string(),
  encounterId: z.string().optional(),
  billDate: z.string(),
  dueDate: z.string().optional(),
  totalChargesCents: z.number().int(),
  insuranceResponsibilityCents: z.number().int().optional(),
  patientResponsibilityCents: z.number().int(),
  serviceDateStart: z.string().optional(),
  serviceDateEnd: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    chargeId: z.string().optional(),
    serviceDate: z.string(),
    cptCode: z.string(),
    description: z.string(),
    quantity: z.number().int().min(1).optional(),
    unitPriceCents: z.number().int(),
    totalCents: z.number().int(),
    icdCodes: z.array(z.string()).optional(),
  })).optional(),
});

const billUpdateSchema = z.object({
  status: z.enum(["new", "in_progress", "submitted", "pending_payment", "paid", "partial", "overdue", "written_off", "cancelled"]).optional(),
  paidAmountCents: z.number().int().optional(),
  adjustmentAmountCents: z.number().int().optional(),
  notes: z.string().optional(),
});

export const billsRouter = Router();

// List bills
billsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status, startDate, endDate } = req.query;

  let query = `
    select
      b.id, b.patient_id as "patientId", b.bill_number as "billNumber",
      b.bill_date as "billDate", b.due_date as "dueDate",
      b.total_charges_cents as "totalChargesCents",
      b.insurance_responsibility_cents as "insuranceResponsibilityCents",
      b.patient_responsibility_cents as "patientResponsibilityCents",
      b.paid_amount_cents as "paidAmountCents",
      b.adjustment_amount_cents as "adjustmentAmountCents",
      b.balance_cents as "balanceCents",
      b.status, b.service_date_start as "serviceDateStart",
      b.service_date_end as "serviceDateEnd",
      b.created_at as "createdAt", b.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      u.full_name as "createdByName"
    from bills b
    join patients p on p.id = b.patient_id
    join users u on u.id = b.created_by
    where b.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and b.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and b.status = $${paramCount}`;
    params.push(status);
  }

  if (startDate) {
    paramCount++;
    query += ` and b.bill_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and b.bill_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by b.bill_date desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ bills: result.rows });
});

// Get single bill with line items
billsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const billId = String(req.params.id);

  const billResult = await pool.query(
    `select
      b.id, b.patient_id as "patientId", b.encounter_id as "encounterId",
      b.bill_number as "billNumber", b.bill_date as "billDate", b.due_date as "dueDate",
      b.total_charges_cents as "totalChargesCents",
      b.insurance_responsibility_cents as "insuranceResponsibilityCents",
      b.patient_responsibility_cents as "patientResponsibilityCents",
      b.paid_amount_cents as "paidAmountCents",
      b.adjustment_amount_cents as "adjustmentAmountCents",
      b.balance_cents as "balanceCents",
      b.status, b.service_date_start as "serviceDateStart",
      b.service_date_end as "serviceDateEnd", b.notes,
      b.created_at as "createdAt", b.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.dob, p.email as "patientEmail", p.phone as "patientPhone",
      u.full_name as "createdByName"
    from bills b
    join patients p on p.id = b.patient_id
    join users u on u.id = b.created_by
    where b.id = $1 and b.tenant_id = $2`,
    [billId, tenantId],
  );

  if (!billResult.rowCount) {
    return res.status(404).json({ error: "Bill not found" });
  }

  const lineItemsResult = await pool.query(
    `select
      li.id, li.charge_id as "chargeId", li.service_date as "serviceDate",
      li.cpt_code as "cptCode", li.description, li.quantity,
      li.unit_price_cents as "unitPriceCents", li.total_cents as "totalCents",
      li.icd_codes as "icdCodes"
    from bill_line_items li
    where li.bill_id = $1 and li.tenant_id = $2
    order by li.service_date asc`,
    [billId, tenantId],
  );

  res.json({
    bill: billResult.rows[0],
    lineItems: lineItemsResult.rows,
  });
});

// Create bill
billsRouter.post("/", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = billCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const billId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate bill number
    const countResult = await client.query(
      `select count(*) as count from bills where tenant_id = $1`,
      [tenantId],
    );
    const billNumber = `BILL-${new Date().getFullYear()}-${String(parseInt(countResult.rows[0].count) + 1).padStart(6, '0')}`;

    // Calculate balance
    const balanceCents = payload.patientResponsibilityCents;

    // Create bill
    await client.query(
      `insert into bills(
        id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
        total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
        paid_amount_cents, adjustment_amount_cents, balance_cents, status,
        service_date_start, service_date_end, notes, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        billId,
        tenantId,
        payload.patientId,
        payload.encounterId || null,
        billNumber,
        payload.billDate,
        payload.dueDate || null,
        payload.totalChargesCents,
        payload.insuranceResponsibilityCents || 0,
        payload.patientResponsibilityCents,
        0,
        0,
        balanceCents,
        'new',
        payload.serviceDateStart || null,
        payload.serviceDateEnd || null,
        payload.notes || null,
        req.user!.id,
      ],
    );

    // Create line items
    const lineItems = payload.lineItems || [];
    for (const item of lineItems) {
      const lineItemId = crypto.randomUUID();
      await client.query(
        `insert into bill_line_items(
          id, tenant_id, bill_id, charge_id, service_date, cpt_code,
          description, quantity, unit_price_cents, total_cents, icd_codes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          lineItemId,
          tenantId,
          billId,
          item.chargeId || null,
          item.serviceDate,
          item.cptCode,
          item.description,
          item.quantity || 1,
          item.unitPriceCents,
          item.totalCents,
          item.icdCodes || [],
        ],
      );
    }

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "bill_create", "bill", billId);
    res.status(201).json({ id: billId, billNumber });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Create bill error:", error);
    return res.status(500).json({ error: "Failed to create bill" });
  } finally {
    client.release();
  }
});

// Update bill
billsRouter.put("/:id", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = billUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const billId = String(req.params.id);
  const payload = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current bill data
    const billResult = await client.query(
      `select patient_responsibility_cents, paid_amount_cents, adjustment_amount_cents
       from bills where id = $1 and tenant_id = $2`,
      [billId, tenantId],
    );

    if (!billResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Bill not found" });
    }

    const currentBill = billResult.rows[0];
    const updates: string[] = [`updated_at = now()`];
    const values: any[] = [];
    let paramCount = 0;

    if (payload.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(payload.status);
    }

    let paidAmount = currentBill.paid_amount_cents;
    let adjustmentAmount = currentBill.adjustment_amount_cents;

    if (payload.paidAmountCents !== undefined) {
      paramCount++;
      updates.push(`paid_amount_cents = $${paramCount}`);
      values.push(payload.paidAmountCents);
      paidAmount = payload.paidAmountCents;
    }

    if (payload.adjustmentAmountCents !== undefined) {
      paramCount++;
      updates.push(`adjustment_amount_cents = $${paramCount}`);
      values.push(payload.adjustmentAmountCents);
      adjustmentAmount = payload.adjustmentAmountCents;
    }

    // Recalculate balance
    const newBalance = currentBill.patient_responsibility_cents - paidAmount - adjustmentAmount;
    paramCount++;
    updates.push(`balance_cents = $${paramCount}`);
    values.push(newBalance);

    if (payload.notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(payload.notes);
    }

    paramCount++;
    values.push(billId);
    paramCount++;
    values.push(tenantId);

    await client.query(
      `update bills set ${updates.join(", ")}
       where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
      values,
    );

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "bill_update", "bill", billId);
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Update bill error:", error);
    return res.status(500).json({ error: "Failed to update bill" });
  } finally {
    client.release();
  }
});

// Delete bill
billsRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const billId = String(req.params.id);

  await pool.query(
    `delete from bills where id = $1 and tenant_id = $2`,
    [billId, tenantId],
  );

  await auditLog(tenantId, req.user!.id, "bill_delete", "bill", billId);
  res.json({ success: true });
});
