import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { logger } from "../lib/logger";
import {
  getRequiredConsents,
  createConsentSession,
  getSessionByToken,
  updateSessionFieldValues,
  captureSignature,
  generateSignedPDF,
  validateSignature,
  getPatientConsentHistory,
  getConsentById,
  revokeConsent,
  getTemplateWithFields,
  logConsentAction,
  getConsentAuditHistory,
  PatientConsent,
} from "../services/consentService";
import { pool } from "../db/pool";
import { auditLog } from "../services/audit";
import crypto from "crypto";

export const consentsRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logConsentsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * @swagger
 * /api/consents/templates:
 *   get:
 *     summary: List all available consent templates
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *         description: Only return active templates
 *       - in: query
 *         name: formType
 *         schema:
 *           type: string
 *         description: Filter by form type
 *     responses:
 *       200:
 *         description: List of consent templates
 */
consentsRouter.get("/templates", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { activeOnly, formType } = req.query;

  try {
    let query = `
      SELECT id, name, form_type as "formType",
             procedure_codes as "procedureCodes", is_active as "isActive",
             version, effective_date as "effectiveDate",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM consent_templates
      WHERE tenant_id = $1
    `;
    const params: (string | boolean)[] = [tenantId];
    let paramIndex = 2;

    if (activeOnly === "true") {
      query += " AND is_active = true";
    }

    if (formType) {
      query += ` AND form_type = $${paramIndex}`;
      params.push(formType as string);
      paramIndex++;
    }

    query += " ORDER BY form_type, name";

    const result = await pool.query(query, params);

    return res.json({ templates: result.rows });
  } catch (err) {
    logConsentsError("Error fetching consent templates", err);
    return res.status(500).json({ error: "Failed to fetch consent templates" });
  }
});

/**
 * @swagger
 * /api/consents/templates/{id}:
 *   get:
 *     summary: Get a specific template with its fields
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template with fields
 */
consentsRouter.get("/templates/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const templateId = req.params.id;

  if (!templateId) {
    return res.status(400).json({ error: "Template ID is required" });
  }

  try {
    const result = await getTemplateWithFields(tenantId, templateId);

    if (!result) {
      return res.status(404).json({ error: "Template not found" });
    }

    return res.json(result);
  } catch (err) {
    logConsentsError("Error fetching template", err);
    return res.status(500).json({ error: "Failed to fetch template" });
  }
});

/**
 * @swagger
 * /api/consents/required/{encounterId}:
 *   get:
 *     summary: Get required consents for an encounter
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: encounterId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: procedureCodes
 *         schema:
 *           type: string
 *         description: Comma-separated list of CPT codes
 *     responses:
 *       200:
 *         description: Required, pending, and already signed consents
 */
consentsRouter.get("/required/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const encounterId = req.params.encounterId;

  if (!encounterId) {
    return res.status(400).json({ error: "Encounter ID is required" });
  }

  const procedureCodesParam = req.query.procedureCodes as string | undefined;

  try {
    const procedureCodes = procedureCodesParam ? procedureCodesParam.split(",") : [];

    const result = await getRequiredConsents(tenantId, encounterId, procedureCodes);

    return res.json(result);
  } catch (err) {
    logConsentsError("Error fetching required consents", err);
    return res.status(500).json({ error: "Failed to fetch required consents" });
  }
});

/**
 * @swagger
 * /api/consents/session:
 *   post:
 *     summary: Create a consent signing session
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - templateId
 *             properties:
 *               patientId:
 *                 type: string
 *               templateId:
 *                 type: string
 *               encounterId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created
 */
const createSessionSchema = z.object({
  patientId: z.string().uuid(),
  templateId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
});

consentsRouter.post("/session", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { patientId, templateId, encounterId } = parsed.data;

  try {
    const session = await createConsentSession(
      tenantId,
      patientId,
      templateId,
      encounterId,
      userId
    );

    return res.status(201).json({ session });
  } catch (err) {
    logConsentsError("Error creating consent session", err);
    return res.status(500).json({ error: (err as Error).message || "Failed to create session" });
  }
});

/**
 * @swagger
 * /api/consents/session/{token}:
 *   get:
 *     summary: Get session by token (for signing workflow)
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session details with template
 */
consentsRouter.get("/session/:token", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const token = req.params.token;

  if (!token) {
    return res.status(400).json({ error: "Session token is required" });
  }

  try {
    const session = await getSessionByToken(tenantId, token);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== "active") {
      return res.status(400).json({ error: `Session is ${session.status}` });
    }

    // Get template with fields
    const templateData = await getTemplateWithFields(tenantId, session.templateId);

    return res.json({
      session,
      template: templateData?.template,
      fields: templateData?.fields,
    });
  } catch (err) {
    logConsentsError("Error fetching session", err);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

/**
 * @swagger
 * /api/consents/session/{sessionId}/fields:
 *   put:
 *     summary: Update session field values
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 */
const updateFieldsSchema = z.object({
  fieldValues: z.record(z.string(), z.unknown()),
});

consentsRouter.put("/session/:sessionId/fields", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const sessionId = req.params.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  const parsed = updateFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    await updateSessionFieldValues(tenantId, sessionId, parsed.data.fieldValues);
    return res.json({ success: true });
  } catch (err) {
    logConsentsError("Error updating session fields", err);
    return res.status(500).json({ error: "Failed to update session fields" });
  }
});

/**
 * @swagger
 * /api/consents/sign:
 *   post:
 *     summary: Submit signed consent
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - signatureData
 *             properties:
 *               sessionId:
 *                 type: string
 *               signatureData:
 *                 type: string
 *                 description: Base64 encoded signature image
 *               signatureType:
 *                 type: string
 *                 enum: [drawn, typed, biometric]
 *               signerName:
 *                 type: string
 *               signerRelationship:
 *                 type: string
 *               witnessName:
 *                 type: string
 *               witnessSignatureData:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consent signed successfully
 */
const signConsentSchema = z.object({
  sessionId: z.string().uuid(),
  signatureData: z.string().min(1),
  signatureType: z.enum(["drawn", "typed", "biometric"]).optional(),
  signerName: z.string().optional(),
  signerRelationship: z.string().optional(),
  witnessName: z.string().optional(),
  witnessSignatureData: z.string().optional(),
});

consentsRouter.post("/sign", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const parsed = signConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const {
    sessionId,
    signatureData,
    signatureType,
    signerName,
    signerRelationship,
    witnessName,
    witnessSignatureData,
  } = parsed.data;

  try {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get("user-agent");

    const witnessData = witnessName && witnessSignatureData
      ? { witnessName, witnessSignatureData }
      : undefined;

    const consent = await captureSignature(
      tenantId,
      sessionId,
      {
        signatureData,
        signatureType,
        signerName,
        signerRelationship,
      },
      witnessData,
      ipAddress,
      userAgent
    );

    // Generate PDF automatically
    try {
      await generateSignedPDF(tenantId, consent.id);
    } catch (pdfErr) {
      logConsentsError("Error generating PDF", pdfErr);
      // Continue even if PDF generation fails
    }

    return res.json({ consent, message: "Consent signed successfully" });
  } catch (err) {
    logConsentsError("Error signing consent", err);
    return res.status(500).json({ error: (err as Error).message || "Failed to sign consent" });
  }
});

/**
 * @swagger
 * /api/consents/patient/{patientId}:
 *   get:
 *     summary: Get patient's consent history
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, signed, revoked, expired]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Patient consent history
 */
consentsRouter.get("/patient/:patientId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = req.params.patientId;

  if (!patientId) {
    return res.status(400).json({ error: "Patient ID is required" });
  }

  const { status, limit, offset } = req.query;

  try {
    const result = await getPatientConsentHistory(tenantId, patientId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    // Log access for HIPAA compliance
    await auditLog(tenantId, req.user!.id, "consent_history_view", "patient", patientId);

    return res.json(result);
  } catch (err) {
    logConsentsError("Error fetching patient consents", err);
    return res.status(500).json({ error: "Failed to fetch patient consents" });
  }
});

/**
 * @swagger
 * /api/consents/{id}:
 *   get:
 *     summary: Get consent details
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consent details
 */
consentsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const consentId = req.params.id;

  if (!consentId) {
    return res.status(400).json({ error: "Consent ID is required" });
  }

  try {
    const consent = await getConsentById(tenantId, consentId);

    if (!consent) {
      return res.status(404).json({ error: "Consent not found" });
    }

    // Log view action
    await logConsentAction(tenantId, consentId, "viewed", req.user!.id, "staff", {}, req.ip);

    return res.json({ consent });
  } catch (err) {
    logConsentsError("Error fetching consent", err);
    return res.status(500).json({ error: "Failed to fetch consent" });
  }
});

/**
 * @swagger
 * /api/consents/{id}/pdf:
 *   get:
 *     summary: Download signed consent PDF
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
consentsRouter.get("/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const consentId = req.params.id;

  if (!consentId) {
    return res.status(400).json({ error: "Consent ID is required" });
  }

  try {
    const consent = await getConsentById(tenantId, consentId) as (PatientConsent & { templateName?: string }) | null;

    if (!consent) {
      return res.status(404).json({ error: "Consent not found" });
    }

    if (consent.status !== "signed") {
      return res.status(400).json({ error: "Consent is not signed" });
    }

    // Log PDF download
    await logConsentAction(tenantId, consentId, "pdf_downloaded", req.user!.id, "staff", {}, req.ip);

    // In a real implementation, this would generate and stream the actual PDF
    // For now, we'll return a simple HTML representation
    const templateName = consent.templateName || "Consent Form";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Signed Consent - ${templateName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .section { margin: 20px 0; }
          .signature-box { border: 1px solid #ccc; padding: 10px; margin-top: 20px; }
          .signature-img { max-width: 300px; }
          .timestamp { color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${templateName}</h1>
          <p class="timestamp">Signed on: ${consent.signedAt || ""}</p>
        </div>
        <div class="section">
          ${consent.formContentSnapshot || "<p>Form content not available</p>"}
        </div>
        <div class="signature-box">
          <h3>Patient Signature</h3>
          <p>Signed by: ${consent.signerName || "Patient"}</p>
          <p>Relationship: ${consent.signerRelationship || "Self"}</p>
          ${consent.signatureData ? `<img class="signature-img" src="${consent.signatureData}" alt="Signature" />` : ""}
          <p class="timestamp">Date: ${consent.signedAt || ""}</p>
        </div>
        ${consent.witnessName ? `
        <div class="signature-box">
          <h3>Witness Signature</h3>
          <p>Witness: ${consent.witnessName}</p>
          ${consent.witnessSignatureData ? `<img class="signature-img" src="${consent.witnessSignatureData}" alt="Witness Signature" />` : ""}
        </div>
        ` : ""}
        <div class="section">
          <p><strong>Verification Hash:</strong> ${consent.signatureHash || ""}</p>
        </div>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="consent-${consentId}.html"`);
    return res.send(html);
  } catch (err) {
    logConsentsError("Error generating PDF", err);
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
});

/**
 * @swagger
 * /api/consents/{id}/validate:
 *   get:
 *     summary: Validate signature integrity
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
consentsRouter.get("/:id/validate", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const consentId = req.params.id;

  if (!consentId) {
    return res.status(400).json({ error: "Consent ID is required" });
  }

  try {
    const result = await validateSignature(tenantId, consentId);
    return res.json(result);
  } catch (err) {
    logConsentsError("Error validating signature", err);
    return res.status(500).json({ error: (err as Error).message || "Failed to validate signature" });
  }
});

/**
 * @swagger
 * /api/consents/{id}/revoke:
 *   post:
 *     summary: Revoke a signed consent
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consent revoked
 */
const revokeSchema = z.object({
  reason: z.string().min(1).max(1000),
});

consentsRouter.post(
  "/:id/revoke",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const consentId = req.params.id;

    if (!consentId) {
      return res.status(400).json({ error: "Consent ID is required" });
    }

    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      await revokeConsent(tenantId, consentId, req.user!.id, parsed.data.reason);
      return res.json({ success: true, message: "Consent revoked successfully" });
    } catch (err) {
      logConsentsError("Error revoking consent", err);
      return res.status(500).json({ error: (err as Error).message || "Failed to revoke consent" });
    }
  }
);

/**
 * @swagger
 * /api/consents/{id}/audit:
 *   get:
 *     summary: Get consent audit history
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit history
 */
consentsRouter.get(
  "/:id/audit",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const consentId = req.params.id;

    if (!consentId) {
      return res.status(400).json({ error: "Consent ID is required" });
    }

    try {
      const auditHistory = await getConsentAuditHistory(tenantId, consentId);
      return res.json({ auditHistory });
    } catch (err) {
      logConsentsError("Error fetching audit history", err);
      return res.status(500).json({ error: "Failed to fetch audit history" });
    }
  }
);

/**
 * @swagger
 * /api/consents/templates:
 *   post:
 *     summary: Create a new consent template
 *     tags: [Consents]
 *     security:
 *       - bearerAuth: []
 */
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  formType: z.string().min(1).max(100),
  contentHtml: z.string().min(1),
  requiredFields: z.array(z.string()).optional(),
  procedureCodes: z.array(z.string()).optional(),
  version: z.string().max(50).optional(),
  effectiveDate: z.string().optional(),
});

consentsRouter.post(
  "/templates",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { name, formType, contentHtml, requiredFields, procedureCodes, version, effectiveDate } = parsed.data;

    try {
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO consent_templates (
          id, tenant_id, name, form_type, content_html,
          required_fields, procedure_codes, is_active, version,
          effective_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10)`,
        [
          id,
          tenantId,
          name,
          formType,
          contentHtml,
          JSON.stringify(requiredFields || []),
          procedureCodes || [],
          version || "1.0",
          effectiveDate || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, "consent_template_create", "consent_template", id);

      return res.status(201).json({ id });
    } catch (err) {
      logConsentsError("Error creating template", err);
      return res.status(500).json({ error: "Failed to create template" });
    }
  }
);
