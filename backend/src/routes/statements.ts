import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const statementCreateSchema = z.object({
  patientId: z.string(),
  statementDate: z.string(),
  balanceCents: z.number().int(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    claimId: z.string().optional(),
    serviceDate: z.string(),
    description: z.string(),
    amountCents: z.number().int(),
    insurancePaidCents: z.number().int().optional(),
    patientResponsibilityCents: z.number().int(),
  })).optional(),
});

const statementUpdateSchema = z.object({
  status: z.enum(["pending", "sent", "paid", "partial", "overdue", "waived"]).optional(),
  lastSentDate: z.string().optional(),
  sentVia: z.enum(["email", "mail", "portal", "both"]).optional(),
  notes: z.string().optional(),
});

export const statementsRouter = Router();

// List statements
statementsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status, startDate, endDate } = req.query;

  let query = `
    select
      s.id, s.patient_id as "patientId", s.statement_number as "statementNumber",
      s.statement_date as "statementDate", s.balance_cents as "balanceCents",
      s.status, s.last_sent_date as "lastSentDate", s.sent_via as "sentVia",
      s.due_date as "dueDate", s.notes,
      s.created_at as "createdAt", s.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.email as "patientEmail",
      u.full_name as "generatedByName"
    from patient_statements s
    join patients p on p.id = s.patient_id
    join users u on u.id = s.generated_by
    where s.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and s.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and s.status = $${paramCount}`;
    params.push(status);
  }

  if (startDate) {
    paramCount++;
    query += ` and s.statement_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` and s.statement_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` order by s.statement_date desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ statements: result.rows });
});

// Get single statement with line items
statementsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const statementId = String(req.params.id);

  const statementResult = await pool.query(
    `select
      s.id, s.patient_id as "patientId", s.statement_number as "statementNumber",
      s.statement_date as "statementDate", s.balance_cents as "balanceCents",
      s.status, s.last_sent_date as "lastSentDate", s.sent_via as "sentVia",
      s.due_date as "dueDate", s.notes,
      s.created_at as "createdAt", s.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName",
      p.email as "patientEmail", p.phone as "patientPhone",
      p.address, p.city, p.state, p.zip,
      u.full_name as "generatedByName"
    from patient_statements s
    join patients p on p.id = s.patient_id
    join users u on u.id = s.generated_by
    where s.id = $1 and s.tenant_id = $2`,
    [statementId, tenantId],
  );

  if (!statementResult.rowCount) {
    return res.status(404).json({ error: "Statement not found" });
  }

  const lineItemsResult = await pool.query(
    `select
      li.id, li.claim_id as "claimId", li.service_date as "serviceDate",
      li.description, li.amount_cents as "amountCents",
      li.insurance_paid_cents as "insurancePaidCents",
      li.patient_responsibility_cents as "patientResponsibilityCents",
      c.claim_number as "claimNumber"
    from statement_line_items li
    left join claims c on c.id = li.claim_id
    where li.statement_id = $1 and li.tenant_id = $2
    order by li.service_date asc`,
    [statementId, tenantId],
  );

  res.json({
    statement: statementResult.rows[0],
    lineItems: lineItemsResult.rows,
  });
});

// Create statement
statementsRouter.post("/", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = statementCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  const statementId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate statement number
    const countResult = await client.query(
      `select count(*) as count from patient_statements where tenant_id = $1`,
      [tenantId],
    );
    const statementNumber = `STMT-${new Date().getFullYear()}-${String(parseInt(countResult.rows[0].count) + 1).padStart(6, '0')}`;

    // Create statement
    await client.query(
      `insert into patient_statements(
        id, tenant_id, patient_id, statement_number, statement_date,
        balance_cents, status, due_date, notes, generated_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        statementId,
        tenantId,
        payload.patientId,
        statementNumber,
        payload.statementDate,
        payload.balanceCents,
        'pending',
        payload.dueDate || null,
        payload.notes || null,
        req.user!.id,
      ],
    );

    // Create line items
    const lineItems = payload.lineItems || [];
    for (const item of lineItems) {
      const lineItemId = crypto.randomUUID();
      await client.query(
        `insert into statement_line_items(
          id, tenant_id, statement_id, claim_id, service_date,
          description, amount_cents, insurance_paid_cents, patient_responsibility_cents
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          lineItemId,
          tenantId,
          statementId,
          item.claimId || null,
          item.serviceDate,
          item.description,
          item.amountCents,
          item.insurancePaidCents || 0,
          item.patientResponsibilityCents,
        ],
      );
    }

    await client.query('COMMIT');
    await auditLog(tenantId, req.user!.id, "statement_create", "statement", statementId);
    res.status(201).json({ id: statementId, statementNumber });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Update statement
statementsRouter.put("/:id", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = statementUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const statementId = String(req.params.id);
  const payload = parsed.data;

  const updates: string[] = [`updated_at = now()`];
  const values: any[] = [];
  let paramCount = 0;

  if (payload.status !== undefined) {
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(payload.status);
  }
  if (payload.lastSentDate !== undefined) {
    paramCount++;
    updates.push(`last_sent_date = $${paramCount}`);
    values.push(payload.lastSentDate);
  }
  if (payload.sentVia !== undefined) {
    paramCount++;
    updates.push(`sent_via = $${paramCount}`);
    values.push(payload.sentVia);
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
  values.push(statementId);
  paramCount++;
  values.push(tenantId);

  await pool.query(
    `update patient_statements set ${updates.join(", ")}
     where id = $${paramCount - 1} and tenant_id = $${paramCount}`,
    values,
  );

  await auditLog(tenantId, req.user!.id, "statement_update", "statement", statementId);
  res.json({ success: true });
});

// Send statement
statementsRouter.post("/:id/send", requireAuth, requireRoles(["admin", "billing", "front_desk"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const statementId = String(req.params.id);
  const { via } = req.body;

  if (!via || !['email', 'mail', 'portal', 'both'].includes(via)) {
    return res.status(400).json({ error: "Invalid 'via' parameter" });
  }

  await pool.query(
    `update patient_statements
     set status = 'sent',
         last_sent_date = current_date,
         sent_via = $1,
         updated_at = now()
     where id = $2 and tenant_id = $3`,
    [via, statementId, tenantId],
  );

  await auditLog(tenantId, req.user!.id, "statement_send", "statement", statementId);
  res.json({ success: true });
});

// Delete statement
statementsRouter.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const statementId = String(req.params.id);

  await pool.query(
    `delete from patient_statements where id = $1 and tenant_id = $2`,
    [statementId, tenantId],
  );

  await auditLog(tenantId, req.user!.id, "statement_delete", "statement", statementId);
  res.json({ success: true });
});
