import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

export const faxRouter = Router();

// Mock fax service for simulation
const mockFaxService = {
  // Simulate sending a fax
  async sendFax(data: { to: string; from: string; subject: string; pages: number; documentId?: string }) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate 90% success rate
    const success = Math.random() > 0.1;

    if (!success) {
      throw new Error("Fax transmission failed: No answer");
    }

    return {
      transmissionId: `TX-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      status: "sent",
      pages: data.pages,
      timestamp: new Date().toISOString(),
    };
  },

  // Simulate receiving faxes (for demo purposes)
  async generateIncomingFax(tenantId: string) {
    const sampleFaxes = [
      {
        from: "+15555551234",
        subject: "Lab Results - Patient Smith, John",
        pages: 3,
        previewUrl: "/sample-fax-preview.pdf",
      },
      {
        from: "+15555555678",
        subject: "Referral from Dr. Johnson",
        pages: 2,
        previewUrl: "/sample-referral.pdf",
      },
      {
        from: "+15555559999",
        subject: "Insurance Authorization",
        pages: 1,
        previewUrl: "/sample-auth.pdf",
      },
    ];

    const random = sampleFaxes[Math.floor(Math.random() * sampleFaxes.length)];

    return {
      id: crypto.randomUUID(),
      tenantId,
      direction: "inbound" as const,
      from: random.from,
      to: "+15555550000",
      subject: random.subject,
      pages: random.pages,
      status: "received" as const,
      receivedAt: new Date().toISOString(),
      pdfUrl: random.previewUrl,
      read: false,
    };
  },
};

// Validation schemas
const sendFaxSchema = z.object({
  recipientNumber: z.string().min(10).max(20),
  recipientName: z.string().optional(),
  subject: z.string().min(1).max(200),
  coverPageMessage: z.string().optional(),
  patientId: z.string().optional(),
  encounterId: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  pages: z.number().int().positive().default(1),
});

const updateFaxSchema = z.object({
  read: z.boolean().optional(),
  patientId: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
});

// GET /api/fax/inbox - List received faxes
faxRouter.get("/inbox", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, patientId, startDate, endDate, unreadOnly, limit = "50", offset = "0" } = req.query;

  let query = `
    SELECT
      f.id,
      f.direction,
      f.from_number as "fromNumber",
      f.to_number as "toNumber",
      f.subject,
      f.pages,
      f.status,
      f.received_at as "receivedAt",
      f.sent_at as "sentAt",
      f.transmission_id as "transmissionId",
      f.pdf_url as "pdfUrl",
      f.patient_id as "patientId",
      f.encounter_id as "encounterId",
      f.read,
      f.notes,
      f.assigned_to as "assignedTo",
      f.created_at as "createdAt",
      p.first_name || ' ' || p.last_name as "patientName",
      u.email as "assignedToEmail"
    FROM faxes f
    LEFT JOIN patients p ON f.patient_id = p.id
    LEFT JOIN users u ON f.assigned_to = u.id
    WHERE f.tenant_id = $1 AND f.direction = 'inbound'
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND f.status = $${paramCount}`;
    params.push(status);
  }

  if (patientId) {
    paramCount++;
    query += ` AND f.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (unreadOnly === "true") {
    query += ` AND f.read = false`;
  }

  if (startDate) {
    paramCount++;
    query += ` AND f.received_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND f.received_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` ORDER BY f.received_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const result = await pool.query(query, params);
  res.json({ faxes: result.rows });
});

// GET /api/fax/outbox - List sent faxes
faxRouter.get("/outbox", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, patientId, startDate, endDate, limit = "50", offset = "0" } = req.query;

  let query = `
    SELECT
      f.id,
      f.direction,
      f.from_number as "fromNumber",
      f.to_number as "toNumber",
      f.subject,
      f.pages,
      f.status,
      f.sent_at as "sentAt",
      f.transmission_id as "transmissionId",
      f.patient_id as "patientId",
      f.encounter_id as "encounterId",
      f.error_message as "errorMessage",
      f.created_at as "createdAt",
      f.sent_by as "sentBy",
      p.first_name || ' ' || p.last_name as "patientName",
      u.email as "sentByEmail"
    FROM faxes f
    LEFT JOIN patients p ON f.patient_id = p.id
    LEFT JOIN users u ON f.sent_by = u.id
    WHERE f.tenant_id = $1 AND f.direction = 'outbound'
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND f.status = $${paramCount}`;
    params.push(status);
  }

  if (patientId) {
    paramCount++;
    query += ` AND f.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (startDate) {
    paramCount++;
    query += ` AND f.sent_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND f.sent_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` ORDER BY f.sent_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const result = await pool.query(query, params);
  res.json({ faxes: result.rows });
});

// POST /api/fax/send - Send new fax
faxRouter.post("/send", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = sendFaxSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const payload = parsed.data;

  // Create initial fax record with "sending" status
  await pool.query(
    `INSERT INTO faxes(
      id, tenant_id, direction, from_number, to_number, subject, pages,
      status, patient_id, encounter_id, sent_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      "outbound",
      "+15555550000", // Practice's fax number
      payload.recipientNumber,
      payload.subject,
      payload.pages,
      "sending",
      payload.patientId || null,
      payload.encounterId || null,
      userId,
    ]
  );

  // Simulate async fax sending in background
  (async () => {
    try {
      const result = await mockFaxService.sendFax({
        to: payload.recipientNumber,
        from: "+15555550000",
        subject: payload.subject,
        pages: payload.pages,
        documentId: payload.documentIds?.[0],
      });

      // Update fax record with success
      await pool.query(
        `UPDATE faxes
         SET status = $1, sent_at = NOW(), transmission_id = $2
         WHERE id = $3`,
        ["sent", result.transmissionId, id]
      );
    } catch (error: any) {
      // Update fax record with failure
      await pool.query(
        `UPDATE faxes
         SET status = $1, error_message = $2
         WHERE id = $3`,
        ["failed", error.message, id]
      );
    }
  })();

  res.status(201).json({ id, status: "sending" });
});

// GET /api/fax/:id - Get fax details
faxRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT
      f.*,
      p.first_name || ' ' || p.last_name as "patientName",
      u.email as "assignedToEmail"
    FROM faxes f
    LEFT JOIN patients p ON f.patient_id = p.id
    LEFT JOIN users u ON f.assigned_to = u.id
    WHERE f.id = $1 AND f.tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Fax not found" });
  }

  res.json(result.rows[0]);
});

// GET /api/fax/:id/pdf - Retrieve fax PDF
faxRouter.get("/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT pdf_url as "pdfUrl", storage, object_key as "objectKey"
     FROM faxes
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Fax not found" });
  }

  const fax = result.rows[0];

  // In production, this would return a signed URL or stream the PDF
  // For now, return the URL info
  res.json({
    pdfUrl: fax.pdfUrl,
    storage: fax.storage || "mock",
    objectKey: fax.objectKey,
  });
});

// PATCH /api/fax/:id - Update fax (mark as read, assign to patient, add notes)
faxRouter.patch("/:id", requireAuth, requireRoles(["admin", "provider", "ma", "front_desk"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const parsed = updateFaxSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const updates: string[] = [];
  const params: any[] = [];
  let paramCount = 0;

  if (parsed.data.read !== undefined) {
    paramCount++;
    updates.push(`read = $${paramCount}`);
    params.push(parsed.data.read);
  }

  if (parsed.data.patientId !== undefined) {
    paramCount++;
    updates.push(`patient_id = $${paramCount}`);
    params.push(parsed.data.patientId);
  }

  if (parsed.data.notes !== undefined) {
    paramCount++;
    updates.push(`notes = $${paramCount}`);
    params.push(parsed.data.notes);
  }

  if (parsed.data.assignedTo !== undefined) {
    paramCount++;
    updates.push(`assigned_to = $${paramCount}`);
    params.push(parsed.data.assignedTo);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No updates provided" });
  }

  updates.push(`updated_at = NOW()`);

  const query = `
    UPDATE faxes
    SET ${updates.join(", ")}
    WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
    RETURNING id
  `;

  params.push(id, tenantId);

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Fax not found" });
  }

  res.json({ success: true });
});

// DELETE /api/fax/:id - Delete fax
faxRouter.delete("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `DELETE FROM faxes WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Fax not found" });
  }

  res.json({ success: true });
});

// POST /api/fax/simulate-incoming - Simulate receiving a fax (for demo)
faxRouter.post("/simulate-incoming", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const incomingFax = await mockFaxService.generateIncomingFax(tenantId);

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO faxes(
      id, tenant_id, direction, from_number, to_number, subject, pages,
      status, received_at, pdf_url, read
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      incomingFax.direction,
      incomingFax.from,
      incomingFax.to,
      incomingFax.subject,
      incomingFax.pages,
      incomingFax.status,
      incomingFax.receivedAt,
      incomingFax.pdfUrl,
      incomingFax.read,
    ]
  );

  res.status(201).json({ id, message: "Simulated incoming fax created" });
});

// GET /api/fax/stats - Get fax statistics
faxRouter.get("/meta/stats", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE direction = 'inbound') as "inboundTotal",
      COUNT(*) FILTER (WHERE direction = 'inbound' AND read = false) as "unreadTotal",
      COUNT(*) FILTER (WHERE direction = 'outbound') as "outboundTotal",
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'sending') as "sendingTotal",
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'sent') as "sentTotal",
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed') as "failedTotal"
    FROM faxes
    WHERE tenant_id = $1`,
    [tenantId]
  );

  res.json(result.rows[0]);
});
