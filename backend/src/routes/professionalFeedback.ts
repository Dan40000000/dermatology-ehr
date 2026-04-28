import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { getEmailService } from "../lib/container";
import { logger } from "../lib/logger";

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

    logger.info("Professional feedback submitted", {
      recipient,
      messageId: result.messageId,
      type: data.type,
      severity: data.severity,
      path: shortPath,
      attachmentCount: files.length,
      userId: user.id,
    });

    return res.status(201).json({
      ok: true,
      messageId: result.messageId,
      accepted: result.accepted,
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
