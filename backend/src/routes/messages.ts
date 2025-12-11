import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

const msgSchema = z.object({
  patientId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string(),
  sender: z.string().optional(),
});

export const messagesRouter = Router();

messagesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, patient_id as "patientId", subject, body, sender, created_at as "createdAt"
     from messages where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  res.json({ messages: result.rows });
});

messagesRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = msgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  await pool.query(
    `insert into messages(id, tenant_id, patient_id, subject, body, sender)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, tenantId, payload.patientId || null, payload.subject || null, payload.body, payload.sender || "system"],
  );
  await auditLog(tenantId, req.user!.id, "message_create", "message", id);
  res.status(201).json({ id });
});
