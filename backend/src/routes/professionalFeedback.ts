import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { getEmailService } from "../lib/container";
import { logger } from "../lib/logger";
import { pool } from "../db/pool";

const router = Router();

const feedbackUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 8,
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image attachments are allowed"));
  },
});

const feedbackSchema = z.object({
  type: z.enum(["issue", "suggestion"]).default("issue"),
  severity: z.enum(["blocker", "annoying", "suggestion", "question"]).default("annoying"),
  message: z.string().trim().min(1).max(8000),
  pageUrl: z.string().trim().max(2048).optional(),
  pathname: z.string().trim().max(512).optional(),
  userAgent: z.string().trim().max(1000).optional(),
  viewport: z.string().trim().max(80).optional(),
  capturedAt: z.string().trim().max(80).optional(),
});

const feedbackStatusSchema = z.object({
  status: z.enum(["new", "reviewed", "resolved", "archived"]).optional(),
  adminNotes: z.string().trim().max(4000).optional(),
});

const listFeedbackQuerySchema = z.object({
  status: z.enum(["new", "reviewed", "resolved", "archived", "all"]).default("all"),
  type: z.enum(["issue", "suggestion", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFeedbackRecipient(): string {
  return (
    process.env.PROFESSIONAL_FEEDBACK_EMAIL ||
    process.env.FEEDBACK_EMAIL ||
    process.env.DEMO_FEEDBACK_EMAIL ||
    "dan@perrysoftwarellc.com"
  ).trim();
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function mapFeedbackRow(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userRole: row.user_role,
    type: row.type,
    severity: row.severity,
    status: row.status,
    message: row.message,
    pageUrl: row.page_url,
    pathname: row.pathname,
    userAgent: row.user_agent,
    viewport: row.viewport,
    capturedAt: row.captured_at,
    emailRecipient: row.email_recipient,
    emailStatus: row.email_status,
    emailMessageId: row.email_message_id,
    emailError: row.email_error,
    attachmentCount: Number(row.attachment_count || 0),
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: row.attachments || [],
  };
}

async function saveFeedbackRecord(params: {
  req: AuthedRequest;
  data: z.infer<typeof feedbackSchema>;
  recipient: string;
  files: Express.Multer.File[];
}): Promise<string> {
  const { req, data, recipient, files } = params;
  const user = req.user!;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO professional_feedback (
         tenant_id,
         user_id,
         user_name,
         user_email,
         user_role,
         type,
         severity,
         message,
         page_url,
         pathname,
         user_agent,
         viewport,
         captured_at,
         attachment_count,
         email_recipient,
         email_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, '')::timestamptz, $14, $15, 'pending')
       RETURNING id`,
      [
        user.tenantId,
        user.id,
        user.fullName || null,
        user.email || null,
        user.role || null,
        data.type,
        data.severity,
        data.message,
        data.pageUrl || null,
        data.pathname || null,
        data.userAgent || null,
        data.viewport || null,
        data.capturedAt || null,
        files.length,
        recipient,
      ]
    );
    const feedbackId = result.rows[0].id as string;

    for (const file of files) {
      await client.query(
        `INSERT INTO professional_feedback_attachments (
           feedback_id,
           filename,
           content_type,
           size_bytes,
           content
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [feedbackId, file.originalname || "feedback-attachment", file.mimetype, file.size, file.buffer]
      );
    }

    await client.query("COMMIT");
    return feedbackId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateFeedbackEmailStatus(
  feedbackId: string | null,
  status: "sent" | "failed" | "skipped",
  options: { messageId?: string; error?: string } = {}
) {
  if (!feedbackId) return;

  try {
    await pool.query(
      `UPDATE professional_feedback
       SET email_status = $2,
           email_message_id = COALESCE($3, email_message_id),
           email_error = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [feedbackId, status, options.messageId || null, options.error || null]
    );
  } catch (error) {
    logger.error("Failed to update feedback email status", {
      feedbackId,
      status,
      error: toSafeErrorMessage(error),
    });
  }
}

router.get("/", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = listFeedbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid feedback query", details: parsed.error.issues });
    }

    const { status, type, limit, offset } = parsed.data;
    const tenantId = req.user!.tenantId;
    const where = ["pf.tenant_id = $1"];
    const values: unknown[] = [tenantId];

    if (status !== "all") {
      values.push(status);
      where.push(`pf.status = $${values.length}`);
    }
    if (type !== "all") {
      values.push(type);
      where.push(`pf.type = $${values.length}`);
    }

    const whereSql = where.join(" AND ");
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM professional_feedback pf WHERE ${whereSql}`, values);

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT
         pf.*,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', pfa.id,
               'filename', pfa.filename,
               'contentType', pfa.content_type,
               'sizeBytes', pfa.size_bytes,
               'createdAt', pfa.created_at
             )
             ORDER BY pfa.created_at ASC
           ) FILTER (WHERE pfa.id IS NOT NULL),
           '[]'::jsonb
         ) AS attachments
       FROM professional_feedback pf
       LEFT JOIN professional_feedback_attachments pfa ON pfa.feedback_id = pf.id
       WHERE ${whereSql}
       GROUP BY pf.id
       ORDER BY pf.created_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
         COUNT(*) FILTER (WHERE type = 'issue')::int AS issue_count,
         COUNT(*) FILTER (WHERE type = 'suggestion')::int AS suggestion_count,
         COUNT(*) FILTER (WHERE email_status = 'failed')::int AS email_failed_count
       FROM professional_feedback
       WHERE tenant_id = $1`,
      [tenantId]
    );

    return res.json({
      feedback: result.rows.map(mapFeedbackRow),
      total: countResult.rows[0]?.total || 0,
      summary: summaryResult.rows[0] || {
        total: 0,
        new_count: 0,
        issue_count: 0,
        suggestion_count: 0,
        email_failed_count: 0,
      },
    });
  } catch (error) {
    logger.error("Failed to list professional feedback", { error: toSafeErrorMessage(error) });
    return res.status(500).json({ error: "Failed to list feedback" });
  }
});

router.patch("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = feedbackStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid feedback update", details: parsed.error.issues });
    }

    if (!parsed.data.status && parsed.data.adminNotes === undefined) {
      return res.status(400).json({ error: "No feedback changes provided" });
    }

    const result = await pool.query(
      `UPDATE professional_feedback
       SET status = COALESCE($3, status),
           admin_notes = COALESCE($4, admin_notes),
           reviewed_by = CASE
             WHEN $3 IN ('reviewed', 'resolved', 'archived') THEN $5
             ELSE reviewed_by
           END,
           reviewed_at = CASE
             WHEN $3 IN ('reviewed', 'resolved', 'archived') AND reviewed_at IS NULL THEN NOW()
             ELSE reviewed_at
           END,
           resolved_at = CASE
             WHEN $3 = 'resolved' THEN NOW()
             WHEN $3 IS NOT NULL AND $3 <> 'resolved' THEN NULL
             ELSE resolved_at
           END,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [req.params.id, req.user!.tenantId, parsed.data.status || null, parsed.data.adminNotes, req.user!.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    return res.json({ feedback: mapFeedbackRow(result.rows[0]) });
  } catch (error) {
    logger.error("Failed to update professional feedback", { error: toSafeErrorMessage(error) });
    return res.status(500).json({ error: "Failed to update feedback" });
  }
});

router.get("/:id/attachments/:attachmentId", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT pfa.filename, pfa.content_type, pfa.content
       FROM professional_feedback_attachments pfa
       JOIN professional_feedback pf ON pf.id = pfa.feedback_id
       WHERE pfa.id = $1
         AND pf.id = $2
         AND pf.tenant_id = $3`,
      [req.params.attachmentId, req.params.id, req.user!.tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const attachment = result.rows[0];
    res.setHeader("Content-Type", attachment.content_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${String(attachment.filename || "feedback-attachment").replace(/"/g, "")}"`);
    return res.send(attachment.content);
  } catch (error) {
    logger.error("Failed to load feedback attachment", { error: toSafeErrorMessage(error) });
    return res.status(500).json({ error: "Failed to load attachment" });
  }
});

router.post("/", requireAuth, feedbackUpload.array("attachments", 8), async (req: AuthedRequest, res) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid feedback payload", details: parsed.error.issues });
    }

    const data = parsed.data;
    const files = (req.files || []) as Express.Multer.File[];
    const recipient = getFeedbackRecipient();
    const user = req.user!;
    let feedbackId: string | null = null;
    const shortPath = data.pathname || data.pageUrl || "unknown page";
    const typeLabel = data.type === "issue" ? "Issue" : "Suggestion";
    const severityLabel = data.severity.charAt(0).toUpperCase() + data.severity.slice(1);

    const text = [
      `${typeLabel} submitted from Dermatology DEMO Office`,
      `Severity: ${severityLabel}`,
      `Page: ${data.pageUrl || shortPath}`,
      `User: ${user.fullName || user.email || user.id} (${user.role})`,
      `Tenant: ${user.tenantId}`,
      `Captured: ${data.capturedAt || new Date().toISOString()}`,
      `Viewport: ${data.viewport || "unknown"}`,
      `User agent: ${data.userAgent || "unknown"}`,
      "",
      data.message,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
        <h2 style="margin:0 0 12px">Dermatology DEMO Office ${escapeHtml(typeLabel)}</h2>
        <table style="border-collapse:collapse;margin-bottom:16px">
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">Severity</td><td>${escapeHtml(severityLabel)}</td></tr>
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">Page</td><td>${escapeHtml(data.pageUrl || shortPath)}</td></tr>
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">User</td><td>${escapeHtml(user.fullName || user.email || user.id)} (${escapeHtml(user.role)})</td></tr>
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">Tenant</td><td>${escapeHtml(user.tenantId)}</td></tr>
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">Captured</td><td>${escapeHtml(data.capturedAt || new Date().toISOString())}</td></tr>
          <tr><td style="font-weight:bold;padding:4px 12px 4px 0">Viewport</td><td>${escapeHtml(data.viewport || "unknown")}</td></tr>
        </table>
        <div style="white-space:pre-wrap;border:1px solid #d1d5db;border-radius:8px;padding:12px;background:#f9fafb">${escapeHtml(data.message)}</div>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">Attachments: ${files.length}</p>
      </div>
    `;

    try {
      feedbackId = await saveFeedbackRecord({ req, data, recipient, files });
    } catch (error) {
      logger.error("Failed to save professional feedback before email", {
        error: toSafeErrorMessage(error),
      });
    }

    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let emailMessageId: string | undefined;
    let emailError: string | undefined;

    try {
      const result = await getEmailService().sendEmail({
        to: recipient,
        subject: `[Derm Demo Feedback] ${typeLabel}: ${shortPath}`.slice(0, 180),
        text,
        html,
        attachments: files.map((file, index) => ({
          filename: file.originalname || `feedback-attachment-${index + 1}`,
          content: file.buffer,
          contentType: file.mimetype,
        })),
      });
      emailStatus = "sent";
      emailMessageId = result.messageId;
      await updateFeedbackEmailStatus(feedbackId, "sent", { messageId: result.messageId });
    } catch (error) {
      emailStatus = "failed";
      emailError = toSafeErrorMessage(error);
      await updateFeedbackEmailStatus(feedbackId, "failed", { error: emailError });
      logger.error("Professional feedback email delivery failed; feedback remains stored", {
        feedbackId,
        error: emailError,
      });
    }

    if (!feedbackId && emailStatus !== "sent") {
      return res.status(500).json({ error: "Failed to submit feedback" });
    }

    logger.info("Professional feedback submitted", {
      feedbackId,
      recipient,
      messageId: emailMessageId,
      emailStatus,
      type: data.type,
      severity: data.severity,
      path: shortPath,
      attachmentCount: files.length,
      userId: user.id,
    });

    return res.status(201).json({
      ok: true,
      feedbackId,
      emailStatus,
      messageId: emailMessageId,
      attachmentCount: files.length,
    });
  } catch (error) {
    logger.error("Failed to submit professional feedback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

export { router as professionalFeedbackRouter };
