import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const photoSchema = z.object({
  patientId: z.string(),
  encounterId: z.string().optional(),
  bodyLocation: z.string().optional(),
  lesionId: z.string().optional(),
  photoType: z.enum(["clinical", "before", "after", "dermoscopy", "baseline"]).optional(),
  url: z
    .string()
    .refine((val) => /^https?:\/\//.test(val) || val.startsWith("/"), { message: "URL must be absolute or app-relative" }),
  storage: z.enum(["local", "s3"]).optional(),
  objectKey: z.string().optional(),
  category: z.string().optional(),
  bodyRegion: z.string().optional(),
  description: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  comparisonGroupId: z.string().optional(),
  sequenceNumber: z.number().optional(),
});

const annotationSchema = z.object({
  shapes: z.array(
    z.object({
      type: z.enum(["arrow", "circle", "rectangle", "text"]),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      radius: z.number().optional(),
      color: z.string(),
      text: z.string().optional(),
      thickness: z.number().optional(),
    })
  ),
});

const comparisonGroupSchema = z.object({
  patientId: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const photosRouter = Router();

photosRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, photoType, bodyLocation } = req.query;

  let query = `
    select
      id,
      patient_id as "patientId",
      encounter_id as "encounterId",
      body_location as "bodyLocation",
      lesion_id as "lesionId",
      photo_type as "photoType",
      annotations,
      comparison_group_id as "comparisonGroupId",
      sequence_number as "sequenceNumber",
      url,
      storage,
      object_key as "objectKey",
      category,
      body_region as "bodyRegion",
      description,
      filename,
      mime_type as "mimeType",
      file_size as "fileSize",
      created_at as "createdAt"
    from photos
    where tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (photoType) {
    paramCount++;
    query += ` and photo_type = $${paramCount}`;
    params.push(photoType);
  }

  if (bodyLocation) {
    paramCount++;
    query += ` and body_location = $${paramCount}`;
    params.push(bodyLocation);
  }

  query += ` order by created_at desc limit 100`;

  const result = await pool.query(query, params);
  res.json({ photos: result.rows });
});

photosRouter.post("/", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = photoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  await pool.query(
    `insert into photos(
      id, tenant_id, patient_id, encounter_id, body_location, lesion_id,
      photo_type, comparison_group_id, sequence_number, url, storage, object_key,
      category, body_region, description, filename, mime_type, file_size
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id,
      tenantId,
      payload.patientId,
      payload.encounterId || null,
      payload.bodyLocation || null,
      payload.lesionId || null,
      payload.photoType || "clinical",
      payload.comparisonGroupId || null,
      payload.sequenceNumber || null,
      payload.url,
      payload.storage || "local",
      payload.objectKey || null,
      payload.category || null,
      payload.bodyRegion || null,
      payload.description || null,
      payload.filename || null,
      payload.mimeType || null,
      payload.fileSize || null,
    ],
  );
  res.status(201).json({ id });
});

// Update photo annotations
photosRouter.put("/:id/annotate", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = annotationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const annotations = parsed.data;

  await pool.query(
    `update photos set annotations = $1 where id = $2 and tenant_id = $3`,
    [JSON.stringify(annotations), id, tenantId]
  );

  res.json({ success: true });
});

// Update photo body location
photosRouter.put("/:id/body-location", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { bodyLocation } = req.body;

  if (!bodyLocation || typeof bodyLocation !== "string") {
    return res.status(400).json({ error: "bodyLocation is required" });
  }

  const tenantId = req.user!.tenantId;

  await pool.query(
    `update photos set body_location = $1 where id = $2 and tenant_id = $3`,
    [bodyLocation, id, tenantId]
  );

  res.json({ success: true });
});

// Create comparison group
photosRouter.post("/comparison-group", requireAuth, requireRoles(["admin", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = comparisonGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  await pool.query(
    `insert into photo_comparison_groups(id, tenant_id, patient_id, name, description)
     values ($1, $2, $3, $4, $5)`,
    [id, tenantId, payload.patientId, payload.name, payload.description || null]
  );

  res.status(201).json({ id });
});

// Get comparison group with photos
photosRouter.get("/comparison-group/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const groupResult = await pool.query(
    `select
      id,
      tenant_id as "tenantId",
      patient_id as "patientId",
      name,
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
     from photo_comparison_groups
     where id = $1 and tenant_id = $2`,
    [id, tenantId]
  );

  if (groupResult.rows.length === 0) {
    return res.status(404).json({ error: "Comparison group not found" });
  }

  const photosResult = await pool.query(
    `select
      id,
      patient_id as "patientId",
      encounter_id as "encounterId",
      body_location as "bodyLocation",
      lesion_id as "lesionId",
      photo_type as "photoType",
      annotations,
      comparison_group_id as "comparisonGroupId",
      sequence_number as "sequenceNumber",
      url,
      storage,
      object_key as "objectKey",
      category,
      body_region as "bodyRegion",
      description,
      filename,
      mime_type as "mimeType",
      file_size as "fileSize",
      created_at as "createdAt"
     from photos
     where comparison_group_id = $1 and tenant_id = $2
     order by sequence_number, created_at`,
    [id, tenantId]
  );

  const group = groupResult.rows[0];
  group.photos = photosResult.rows;

  res.json(group);
});

// Get patient photo timeline
photosRouter.get("/patient/:patientId/timeline", requireAuth, async (req: AuthedRequest, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `select
      id,
      patient_id as "patientId",
      encounter_id as "encounterId",
      body_location as "bodyLocation",
      lesion_id as "lesionId",
      photo_type as "photoType",
      annotations,
      comparison_group_id as "comparisonGroupId",
      sequence_number as "sequenceNumber",
      url,
      storage,
      object_key as "objectKey",
      category,
      body_region as "bodyRegion",
      description,
      filename,
      mime_type as "mimeType",
      file_size as "fileSize",
      created_at as "createdAt"
     from photos
     where patient_id = $1 and tenant_id = $2
     order by created_at desc`,
    [patientId, tenantId]
  );

  res.json({ photos: result.rows });
});
