import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

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

const billActionSchema = z.object({
  action: z.enum(["send_statement", "set_payment_plan", "flag_collections", "write_off", "add_note"]),
  note: z.string().max(1000).optional(),
  amountCents: z.number().int().min(0).optional(),
});

const resolveWorkQueueItemSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const billsRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logBillsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// List bills
billsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status, startDate, endDate } = req.query;

  let query = `
    select
      b.id, b.patient_id as "patientId", b.bill_number as "billNumber",
      b.bill_pay_code as "billPayCode",
      b.encounter_id as "encounterId",
      b.bill_date as "billDate", b.due_date as "dueDate",
      b.total_charges_cents as "totalChargesCents",
      b.insurance_responsibility_cents as "insuranceResponsibilityCents",
      b.patient_responsibility_cents as "patientResponsibilityCents",
      b.paid_amount_cents as "paidAmountCents",
      b.adjustment_amount_cents as "adjustmentAmountCents",
      b.balance_cents as "balanceCents",
      b.status, b.service_date_start as "serviceDateStart",
      b.service_date_end as "serviceDateEnd",
      coalesce(nullif(to_jsonb(b)->>'follow_up_status', ''), 'none') as "followUpStatus",
      coalesce(nullif(to_jsonb(b)->>'collections_status', ''), 'not_in_collections') as "collectionsStatus",
      coalesce(nullif(to_jsonb(b)->>'payment_plan_status', ''), 'none') as "paymentPlanStatus",
      nullif(to_jsonb(b)->>'billing_internal_note', '') as "billingInternalNote",
      nullif(to_jsonb(b)->>'last_statement_sent_at', '') as "lastStatementSentAt",
      b.created_at as "createdAt", b.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      coalesce(p.insurance_plan_name, p.insurance) as "payerName",
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

// Financial work queue for billing failures that need human review.
billsRouter.get("/work-queue", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  const params: any[] = [tenantId];

  let whereClause = "fwq.tenant_id = $1";
  if (status !== "all") {
    params.push(status);
    whereClause += ` and fwq.status = $${params.length}`;
  }

  try {
    const result = await pool.query(
      `select
         fwq.id,
         fwq.encounter_id as "encounterId",
         fwq.appointment_id as "appointmentId",
         fwq.patient_id as "patientId",
         fwq.claim_id as "claimId",
         fwq.bill_id as "billId",
         fwq.issue_type as "issueType",
         fwq.severity,
         fwq.status,
         fwq.message,
         fwq.error_detail as "errorDetail",
         fwq.metadata,
         fwq.created_at as "createdAt",
         fwq.updated_at as "updatedAt",
         fwq.resolved_at as "resolvedAt",
         p.first_name as "patientFirstName",
         p.last_name as "patientLastName",
         b.bill_number as "billNumber",
         c.claim_number as "claimNumber"
       from financial_work_queue fwq
       left join patients p on p.id = fwq.patient_id and p.tenant_id = fwq.tenant_id
       left join bills b on b.id = fwq.bill_id and b.tenant_id = fwq.tenant_id
       left join claims c on c.id = fwq.claim_id and c.tenant_id = fwq.tenant_id
       where ${whereClause}
       order by
         case fwq.severity when 'critical' then 1 when 'error' then 2 when 'warning' then 3 else 4 end,
         fwq.created_at desc
       limit 100`,
      params,
    );

    return res.json({ items: result.rows });
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return res.json({ items: [] });
    }
    logBillsError("Error listing financial work queue", error);
    return res.status(500).json({ error: "Failed to list financial work queue" });
  }
});

billsRouter.post("/work-queue/:id/resolve", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = resolveWorkQueueItemSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const itemId = String(req.params.id);

  try {
    const result = await pool.query(
      `update financial_work_queue
       set status = 'resolved',
           resolved_by = $3,
           resolved_at = now(),
           updated_at = now(),
           metadata = case
             when $4::text is null then metadata
             else metadata || jsonb_build_object('resolutionNote', $4::text)
           end
       where id = $1 and tenant_id = $2 and status <> 'resolved'
       returning id`,
      [itemId, tenantId, req.user!.id, parsed.data.note || null],
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Financial work queue item not found" });
    }

    await auditLog(tenantId, req.user!.id, "financial_work_queue_resolved", "financial_work_queue", itemId);
    return res.json({ success: true, id: itemId });
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return res.status(404).json({ error: "Financial work queue item not found" });
    }
    logBillsError("Error resolving financial work queue item", error);
    return res.status(500).json({ error: "Failed to resolve financial work queue item" });
  }
});

// Get single bill with line items
billsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const billId = String(req.params.id);

  const billResult = await pool.query(
    `select
      b.id, b.patient_id as "patientId", b.encounter_id as "encounterId",
      b.bill_number as "billNumber", b.bill_pay_code as "billPayCode",
      b.bill_date as "billDate", b.due_date as "dueDate",
      b.total_charges_cents as "totalChargesCents",
      b.insurance_responsibility_cents as "insuranceResponsibilityCents",
      b.patient_responsibility_cents as "patientResponsibilityCents",
      b.paid_amount_cents as "paidAmountCents",
      b.adjustment_amount_cents as "adjustmentAmountCents",
      b.balance_cents as "balanceCents",
      b.status, b.service_date_start as "serviceDateStart",
      b.service_date_end as "serviceDateEnd", b.notes,
      coalesce(nullif(to_jsonb(b)->>'follow_up_status', ''), 'none') as "followUpStatus",
      coalesce(nullif(to_jsonb(b)->>'collections_status', ''), 'not_in_collections') as "collectionsStatus",
      coalesce(nullif(to_jsonb(b)->>'payment_plan_status', ''), 'none') as "paymentPlanStatus",
      nullif(to_jsonb(b)->>'billing_internal_note', '') as "billingInternalNote",
      nullif(to_jsonb(b)->>'last_statement_sent_at', '') as "lastStatementSentAt",
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

  const activityResult = await pool.query(
    `select
       ba.id, ba.action, ba.note, ba.amount_cents as "amountCents",
       ba.created_at as "createdAt", u.full_name as "createdByName"
     from bill_activity ba
     left join users u on u.id = ba.created_by
     where ba.bill_id = $1 and ba.tenant_id = $2
     order by ba.created_at desc
     limit 50`,
    [billId, tenantId],
  ).catch((error) => {
    if ((error as any)?.code === "42P01") {
      return { rows: [] };
    }
    throw error;
  });

  res.json({
    bill: billResult.rows[0],
    lineItems: lineItemsResult.rows,
    activity: activityResult.rows,
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
    logBillsError("Create bill error:", error);
    return res.status(500).json({ error: "Failed to create bill" });
  } finally {
    client.release();
  }
});

// Operational billing follow-up actions for A/R workqueues
billsRouter.post("/:id/actions", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = billActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const billId = String(req.params.id);
  const { action, note, amountCents } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const billResult = await client.query(
      `select
         id,
         coalesce(balance_cents, 0) as balance_cents,
         coalesce(adjustment_amount_cents, 0) as adjustment_amount_cents
       from bills
       where id = $1 and tenant_id = $2
       for update`,
      [billId, tenantId],
    );

    if (!billResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Bill not found" });
    }

    const bill = billResult.rows[0];
    const currentBalanceCents = Number(bill.balance_cents || 0);
    const currentAdjustmentCents = Number(bill.adjustment_amount_cents || 0);
    const updateParts: string[] = ["updated_at = now()"];
    const updateValues: any[] = [];
    let param = 1;

    const addUpdate = (sql: string, value: any) => {
      updateParts.push(`${sql} = $${param++}`);
      updateValues.push(value);
    };

    if (action === "send_statement") {
      updateParts.push("last_statement_sent_at = now()");
      addUpdate("follow_up_status", "statement_sent");
    } else if (action === "set_payment_plan") {
      addUpdate("payment_plan_status", "active");
      addUpdate("follow_up_status", "payment_plan");
      if (note) addUpdate("billing_internal_note", note);
    } else if (action === "flag_collections") {
      addUpdate("collections_status", "flagged");
      addUpdate("follow_up_status", "collections");
      updateParts.push("collections_flagged_at = coalesce(collections_flagged_at, now())");
      if (note) addUpdate("billing_internal_note", note);
    } else if (action === "write_off") {
      const writeOffCents = Math.min(Math.max(0, amountCents ?? currentBalanceCents), currentBalanceCents);
      if (writeOffCents <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No open balance available to write off" });
      }
      addUpdate("adjustment_amount_cents", currentAdjustmentCents + writeOffCents);
      addUpdate("balance_cents", Math.max(0, currentBalanceCents - writeOffCents));
      addUpdate("status", writeOffCents >= currentBalanceCents ? "written_off" : "partial");
      addUpdate("follow_up_status", "write_off");
      updateParts.push("written_off_at = now()");
      addUpdate("written_off_by", req.user!.id);
      addUpdate("write_off_reason", note || "Administrative write-off");
    } else if (action === "add_note") {
      addUpdate("billing_internal_note", note || "");
      addUpdate("follow_up_status", "note_added");
    }

    updateValues.push(billId, tenantId);
    await client.query(
      `update bills
       set ${updateParts.join(", ")}
       where id = $${param++} and tenant_id = $${param}`,
      updateValues,
    );

    await client.query(
      `insert into bill_activity(id, tenant_id, bill_id, action, note, amount_cents, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [crypto.randomUUID(), tenantId, billId, action, note || null, amountCents || null, req.user!.id],
    );

    await client.query("COMMIT");
    await auditLog(tenantId, req.user!.id, `bill_action_${action}`, "bill", billId);
    res.json({ success: true, action });
  } catch (error) {
    await client.query("ROLLBACK");
    logBillsError("Bill action error:", error);
    res.status(500).json({ error: "Failed to apply bill action" });
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
    logBillsError("Update bill error:", error);
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
