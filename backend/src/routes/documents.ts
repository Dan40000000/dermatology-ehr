import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

// Document categories
export const DOCUMENT_CATEGORIES = [
  "Lab Results",
  "Pathology Reports",
  "Imaging",
  "Insurance Cards",
  "Consent Forms",
  "Referrals",
  "Correspondence",
  "Other",
] as const;

const docSchema = z.object({
  patientId: z.string(),
  encounterId: z.string().optional(),
  title: z.string().min(1).max(200),
  type: z.string().optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  subcategory: z.string().optional(),
  description: z.string().optional(),
  url: z
    .string()
    .refine((val) => /^https?:\/\//.test(val) || val.startsWith("/"), { message: "URL must be absolute or app-relative" }),
  storage: z.enum(["local", "s3"]).optional(),
  objectKey: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

const signatureSchema = z.object({
  signatureData: z.string(),
  signatureType: z.enum(["drawn", "typed", "uploaded"]),
  signerName: z.string(),
});

const categoryUpdateSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  subcategory: z.string().optional(),
});

export const documentsRouter = Router();

// Helper function to log document access
async function logDocumentAccess(
  documentId: string,
  tenantId: string,
  userId: string,
  action: string,
  req: AuthedRequest,
) {
  const ipAddress = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get("user-agent") || null;

  await pool.query(
    `INSERT INTO document_access_log (id, document_id, tenant_id, user_id, action, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), documentId, tenantId, userId, action, ipAddress, userAgent],
  );
}

// Auto-suggest category based on filename
function suggestCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("lab") || lower.includes("laboratory")) return "Lab Results";
  if (lower.includes("path") || lower.includes("biopsy")) return "Pathology Reports";
  if (lower.includes("xray") || lower.includes("mri") || lower.includes("ct") || lower.includes("ultrasound")) return "Imaging";
  if (lower.includes("insurance") || lower.includes("card")) return "Insurance Cards";
  if (lower.includes("consent") || lower.includes("authorization")) return "Consent Forms";
  if (lower.includes("referral") || lower.includes("refer")) return "Referrals";
  if (lower.includes("letter") || lower.includes("correspondence")) return "Correspondence";
  return "Other";
}

// GET /api/documents - List documents with filtering
documentsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { category, patientId, startDate, endDate, uploadedBy, signed, search, limit = "50", offset = "0" } = req.query;

  let query = `
    SELECT
      d.id,
      d.patient_id as "patientId",
      d.encounter_id as "encounterId",
      d.title,
      d.type,
      d.category,
      d.subcategory,
      d.description,
      d.url,
      d.storage,
      d.object_key as "objectKey",
      d.file_size as "fileSize",
      d.mime_type as "mimeType",
      d.thumbnail_url as "thumbnailUrl",
      d.is_signed as "isSigned",
      d.signed_at as "signedAt",
      d.signed_by as "signedBy",
      d.uploaded_by as "uploadedBy",
      d.created_at as "createdAt",
      p.first_name || ' ' || p.last_name as "patientName",
      u.email as "uploadedByEmail"
    FROM documents d
    LEFT JOIN patients p ON d.patient_id = p.id
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (category) {
    paramCount++;
    query += ` AND d.category = $${paramCount}`;
    params.push(category);
  }

  if (patientId) {
    paramCount++;
    query += ` AND d.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (uploadedBy) {
    paramCount++;
    query += ` AND d.uploaded_by = $${paramCount}`;
    params.push(uploadedBy);
  }

  if (signed !== undefined) {
    paramCount++;
    query += ` AND d.is_signed = $${paramCount}`;
    params.push(signed === "true");
  }

  if (startDate) {
    paramCount++;
    query += ` AND d.created_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND d.created_at <= $${paramCount}`;
    params.push(endDate);
  }

  if (search) {
    paramCount++;
    query += ` AND (
      d.title ILIKE $${paramCount} OR
      d.description ILIKE $${paramCount} OR
      d.ocr_text ILIKE $${paramCount}
    )`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY d.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const result = await pool.query(query, params);
  res.json({ documents: result.rows });
});

// POST /api/documents - Create new document
documentsRouter.post("/", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const payload = parsed.data;

  // Auto-suggest category if not provided
  const category = payload.category || suggestCategory(payload.title);

  await pool.query(
    `INSERT INTO documents(
      id, tenant_id, patient_id, encounter_id, title, type, category, subcategory,
      description, url, storage, object_key, file_size, mime_type, thumbnail_url, uploaded_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      tenantId,
      payload.patientId,
      payload.encounterId || null,
      payload.title,
      payload.type || null,
      category,
      payload.subcategory || null,
      payload.description || null,
      payload.url,
      payload.storage || "local",
      payload.objectKey || null,
      payload.fileSize || null,
      payload.mimeType || null,
      payload.thumbnailUrl || null,
      userId,
    ],
  );

  // Log the upload action
  await logDocumentAccess(id, tenantId, userId, "edit", req);

  res.status(201).json({ id, suggestedCategory: category });
});

// GET /api/documents/:id - Get document details
documentsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const result = await pool.query(
    `SELECT
      d.*,
      p.first_name || ' ' || p.last_name as "patientName",
      u.email as "uploadedByEmail",
      s.email as "signedByEmail"
    FROM documents d
    LEFT JOIN patients p ON d.patient_id = p.id
    LEFT JOIN users u ON d.uploaded_by = u.id
    LEFT JOIN users s ON d.signed_by = s.id
    WHERE d.id = $1 AND d.tenant_id = $2`,
    [id, tenantId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Log the view action
  await logDocumentAccess(id!, tenantId, userId, "view", req);

  res.json(result.rows[0]);
});

// GET /api/documents/:id/preview - Get preview URL
documentsRouter.get("/:id/preview", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const result = await pool.query(
    `SELECT url, thumbnail_url as "thumbnailUrl", mime_type as "mimeType", storage, object_key as "objectKey"
     FROM documents
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  const doc = result.rows[0];

  // Log the view action
  await logDocumentAccess(id!, tenantId, userId, "view", req);

  res.json({
    previewUrl: doc.thumbnailUrl || doc.url,
    fullUrl: doc.url,
    mimeType: doc.mimeType,
    storage: doc.storage,
    objectKey: doc.objectKey,
  });
});

// POST /api/documents/:id/sign - E-sign document
documentsRouter.post("/:id/sign", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const parsed = signatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const { signatureData, signatureType, signerName } = parsed.data;

  // Check if document exists and is not already signed
  const docResult = await pool.query(
    `SELECT is_signed FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (docResult.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  if (docResult.rows[0].is_signed) {
    return res.status(400).json({ error: "Document is already signed" });
  }

  const signatureId = crypto.randomUUID();
  const ipAddress = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get("user-agent") || null;

  // Begin transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update document
    await client.query(
      `UPDATE documents
       SET is_signed = true, signed_at = NOW(), signed_by = $1
       WHERE id = $2`,
      [userId, id],
    );

    // Record signature
    await client.query(
      `INSERT INTO document_signatures (id, document_id, tenant_id, signer_id, signer_name, signature_data, signature_type, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [signatureId, id, tenantId, userId, signerName, signatureData, signatureType, ipAddress, userAgent],
    );

    // Log the action
    await client.query(
      `INSERT INTO document_access_log (id, document_id, tenant_id, user_id, action, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), id, tenantId, userId, "sign", ipAddress, userAgent],
    );

    await client.query("COMMIT");
    res.json({ success: true, signatureId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// GET /api/documents/:id/versions - Get version history
documentsRouter.get("/:id/versions", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  // Verify document exists
  const docCheck = await pool.query(
    `SELECT id FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (docCheck.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  const result = await pool.query(
    `SELECT
      v.id,
      v.version_number as "versionNumber",
      v.file_url as "fileUrl",
      v.file_size as "fileSize",
      v.mime_type as "mimeType",
      v.uploaded_by as "uploadedBy",
      v.uploaded_at as "uploadedAt",
      v.change_description as "changeDescription",
      u.email as "uploadedByEmail"
    FROM document_versions v
    LEFT JOIN users u ON v.uploaded_by = u.id
    WHERE v.document_id = $1
    ORDER BY v.version_number DESC`,
    [id],
  );

  res.json({ versions: result.rows });
});

// POST /api/documents/:id/versions - Upload new version
documentsRouter.post("/:id/versions", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { fileUrl, fileSize, mimeType, changeDescription } = req.body;

  if (!fileUrl) {
    return res.status(400).json({ error: "fileUrl is required" });
  }

  // Verify document exists
  const docCheck = await pool.query(
    `SELECT id FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (docCheck.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Get current max version number
  const versionResult = await pool.query(
    `SELECT COALESCE(MAX(version_number), 0) as max_version FROM document_versions WHERE document_id = $1`,
    [id],
  );

  const newVersionNumber = versionResult.rows[0].max_version + 1;
  const versionId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO document_versions (id, document_id, version_number, file_url, file_size, mime_type, uploaded_by, change_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [versionId, id, newVersionNumber, fileUrl, fileSize || null, mimeType || null, userId, changeDescription || null],
  );

  // Log the action
  await logDocumentAccess(id!, tenantId, userId, "edit", req);

  res.status(201).json({ id: versionId, versionNumber: newVersionNumber });
});

// PUT /api/documents/:id/category - Update category
documentsRouter.put("/:id/category", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const parsed = categoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const { category, subcategory } = parsed.data;

  const result = await pool.query(
    `UPDATE documents
     SET category = $1, subcategory = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING id`,
    [category, subcategory || null, id, tenantId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Log the action
  await logDocumentAccess(id!, tenantId, userId, "edit", req);

  res.json({ success: true });
});

// DELETE /api/documents/:id - Delete document
documentsRouter.delete("/:id", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Log the action before deletion
  await logDocumentAccess(id!, tenantId, userId, "delete", req);

  const result = await pool.query(
    `DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  res.json({ success: true });
});

// GET /api/documents/categories - Get all categories
documentsRouter.get("/meta/categories", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ categories: DOCUMENT_CATEGORIES });
});
