import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

const router = express.Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logLesionsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * Lesion Tracking Routes
 *
 * Comprehensive lesion management with:
 * - ABCDE criteria scoring
 * - Dermoscopy documentation
 * - Serial measurements and progression tracking
 * - Lesion event history
 */

// Schemas
const createLesionSchema = z.object({
  patientId: z.string(),
  lesionCode: z.string(),
  bodyLocation: z.string(),
  bodyLocationDetail: z.string().optional(),
  lesionType: z.string().optional(),
  firstNotedDate: z.string().optional(),
  description: z.string().optional(),
  clinicalImpression: z.string().optional(),
  concernLevel: z.enum(["low", "moderate", "high", "critical"]).optional(),
  requiresMonitoring: z.boolean().optional(),
  treatmentPlan: z.string().optional(),
  notes: z.string().optional(),
});

const abcdeScoreSchema = z.object({
  asymmetry: z.number().min(0).max(2),
  border: z.number().min(0).max(2),
  color: z.number().min(0).max(2),
  diameter: z.number().min(0).max(2),
  evolving: z.number().min(0).max(2),
  totalScore: z.number(),
  notes: z.string().optional(),
});

const measurementSchema = z.object({
  lesionId: z.string(),
  photoId: z.string().optional(),
  lengthMm: z.number().optional(),
  widthMm: z.number().optional(),
  areaMm2: z.number().optional(),
  depthMm: z.number().optional(),
  abcdeScore: abcdeScoreSchema.optional(),
  uglyDucklingSign: z.boolean().optional(),
  colorVariation: z.boolean().optional(),
  borderIrregularity: z.boolean().optional(),
  diameterChange: z.boolean().optional(),
  elevationChange: z.boolean().optional(),
  notes: z.string().optional(),
});

const dermoscopySchema = z.object({
  lesionId: z.string(),
  photoId: z.string().optional(),
  dermoscopyStructures: z.record(z.string(), z.boolean()).optional(),
  dermoscopyPatterns: z.record(z.string(), z.boolean()).optional(),
  vascularPatterns: z.record(z.string(), z.boolean()).optional(),
  pigmentNetwork: z.string().optional(),
  blueWhiteVeil: z.boolean().optional(),
  regressionStructures: z.boolean().optional(),
  atypicalVessels: z.boolean().optional(),
  dermoscopyDiagnosis: z.string().optional(),
  dermoscopyScore: z.number().optional(),
  recommendation: z.string().optional(),
  notes: z.string().optional(),
});

const lesionEventSchema = z.object({
  lesionId: z.string(),
  eventType: z.string(),
  description: z.string(),
  photos: z.array(z.string()).optional(),
  relatedEncounterId: z.string().optional(),
  outcome: z.string().optional(),
  followUpNeeded: z.boolean().optional(),
  followUpDate: z.string().optional(),
});

// GET /api/lesions - List all lesions for a patient
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, status, concernLevel } = req.query;

    let query = `
      select
        l.id,
        l.patient_id as "patientId",
        l.lesion_code as "lesionCode",
        l.body_location as "bodyLocation",
        l.body_location_detail as "bodyLocationDetail",
        l.lesion_type as "lesionType",
        l.first_noted_date as "firstNotedDate",
        l.status,
        l.description,
        l.clinical_impression as "clinicalImpression",
        l.concern_level as "concernLevel",
        l.requires_monitoring as "requiresMonitoring",
        l.biopsy_performed as "biopsyPerformed",
        l.biopsy_date as "biopsyDate",
        l.biopsy_result as "biopsyResult",
        l.treatment_plan as "treatmentPlan",
        l.notes,
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        count(distinct lm.id) as "measurementCount",
        count(distinct ld.id) as "dermoscopyCount",
        count(distinct le.id) as "eventCount",
        max(lm.measured_at) as "lastMeasured"
      from lesions l
      left join lesion_measurements lm on lm.lesion_id = l.id
      left join lesion_dermoscopy ld on ld.lesion_id = l.id
      left join lesion_events le on le.lesion_id = l.id
      where l.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` and l.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (status) {
      query += ` and l.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (concernLevel) {
      query += ` and l.concern_level = $${paramIndex}`;
      params.push(concernLevel);
      paramIndex++;
    }

    query += `
      group by l.id
      order by l.concern_level desc, l.updated_at desc
    `;

    const result = await pool.query(query, params);
    res.json({ lesions: result.rows });
  } catch (error) {
    logLesionsError("Get lesions error:", error);
    res.status(500).json({ error: "Failed to retrieve lesions" });
  }
});

// GET /api/lesions/:id - Get single lesion with full details
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const lesion = await pool.query(
      `select
        l.*,
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName"
       from lesions l
       join patients p on p.id = l.patient_id
       where l.id = $1 and l.tenant_id = $2`,
      [id, tenantId]
    );

    if (lesion.rows.length === 0) {
      return res.status(404).json({ error: "Lesion not found" });
    }

    // Get measurements
    const measurements = await pool.query(
      `select * from lesion_measurements
       where lesion_id = $1 and tenant_id = $2
       order by measured_at desc`,
      [id, tenantId]
    );

    // Get dermoscopy records
    const dermoscopy = await pool.query(
      `select * from lesion_dermoscopy
       where lesion_id = $1 and tenant_id = $2
       order by examined_at desc`,
      [id, tenantId]
    );

    // Get events
    const events = await pool.query(
      `select * from lesion_events
       where lesion_id = $1 and tenant_id = $2
       order by event_date desc`,
      [id, tenantId]
    );

    // Get associated photos
    const photos = await pool.query(
      `select * from photos
       where lesion_id = $1 and tenant_id = $2
       order by created_at desc`,
      [id, tenantId]
    );

    res.json({
      lesion: lesion.rows[0],
      measurements: measurements.rows,
      dermoscopy: dermoscopy.rows,
      events: events.rows,
      photos: photos.rows,
    });
  } catch (error) {
    logLesionsError("Get lesion details error:", error);
    res.status(500).json({ error: "Failed to retrieve lesion details" });
  }
});

// POST /api/lesions - Create new lesion
router.post(
  "/",
  requireAuth,
  requireRoles(["provider", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createLesionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const id = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      await pool.query(
        `insert into lesions (
          id, tenant_id, patient_id, lesion_code, body_location,
          body_location_detail, lesion_type, first_noted_date,
          description, clinical_impression, concern_level,
          requires_monitoring, treatment_plan, notes, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          tenantId,
          data.patientId,
          data.lesionCode,
          data.bodyLocation,
          data.bodyLocationDetail || null,
          data.lesionType || null,
          data.firstNotedDate || null,
          data.description || null,
          data.clinicalImpression || null,
          data.concernLevel || "low",
          data.requiresMonitoring || false,
          data.treatmentPlan || null,
          data.notes || null,
          userId,
        ]
      );

      // Create initial event
      const eventId = crypto.randomUUID();
      await pool.query(
        `insert into lesion_events (
          id, tenant_id, lesion_id, event_type, provider_id, description
        ) values ($1, $2, $3, $4, $5, $6)`,
        [eventId, tenantId, id, "lesion_identified", userId, "Initial lesion documentation"]
      );

      await auditLog(tenantId, userId, "lesion_create", "lesion", id!);
      res.status(201).json({ id });
    } catch (error) {
      logLesionsError("Create lesion error:", error);
      res.status(500).json({ error: "Failed to create lesion" });
    }
  }
);

// POST /api/lesions/:id/measurements - Add measurement
router.post(
  "/:id/measurements",
  requireAuth,
  requireRoles(["provider", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = measurementSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const measurementId = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      await pool.query(
        `insert into lesion_measurements (
          id, tenant_id, lesion_id, photo_id, measured_by,
          length_mm, width_mm, area_mm2, depth_mm, abcde_score,
          ugly_duckling_sign, color_variation, border_irregularity,
          diameter_change, elevation_change, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          measurementId,
          tenantId,
          id,
          data.photoId || null,
          userId,
          data.lengthMm || null,
          data.widthMm || null,
          data.areaMm2 || null,
          data.depthMm || null,
          data.abcdeScore ? JSON.stringify(data.abcdeScore) : null,
          data.uglyDucklingSign || false,
          data.colorVariation || false,
          data.borderIrregularity || false,
          data.diameterChange || false,
          data.elevationChange || false,
          data.notes || null,
        ]
      );

      // Update lesion concern level if ABCDE score is high
      if (data.abcdeScore && data.abcdeScore.totalScore >= 3) {
        await pool.query(
          `update lesions
           set concern_level = 'high', requires_monitoring = true
           where id = $1 and tenant_id = $2`,
          [id, tenantId]
        );
      }

      await auditLog(tenantId, userId, "measurement_add", "lesion", id!);
      res.status(201).json({ id: measurementId });
    } catch (error) {
      logLesionsError("Add measurement error:", error);
      res.status(500).json({ error: "Failed to add measurement" });
    }
  }
);

// POST /api/lesions/:id/dermoscopy - Add dermoscopy examination
router.post(
  "/:id/dermoscopy",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = dermoscopySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const dermoscopyId = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      await pool.query(
        `insert into lesion_dermoscopy (
          id, tenant_id, lesion_id, photo_id, examined_by,
          dermoscopy_structures, dermoscopy_patterns, vascular_patterns,
          pigment_network, blue_white_veil, regression_structures,
          atypical_vessels, dermoscopy_diagnosis, dermoscopy_score,
          recommendation, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          dermoscopyId,
          tenantId,
          id,
          data.photoId || null,
          userId,
          data.dermoscopyStructures ? JSON.stringify(data.dermoscopyStructures) : null,
          data.dermoscopyPatterns ? JSON.stringify(data.dermoscopyPatterns) : null,
          data.vascularPatterns ? JSON.stringify(data.vascularPatterns) : null,
          data.pigmentNetwork || null,
          data.blueWhiteVeil || false,
          data.regressionStructures || false,
          data.atypicalVessels || false,
          data.dermoscopyDiagnosis || null,
          data.dermoscopyScore || null,
          data.recommendation || null,
          data.notes || null,
        ]
      );

      await auditLog(tenantId, userId, "dermoscopy_add", "lesion", id!);
      res.status(201).json({ id: dermoscopyId });
    } catch (error) {
      logLesionsError("Add dermoscopy error:", error);
      res.status(500).json({ error: "Failed to add dermoscopy examination" });
    }
  }
);

// POST /api/lesions/:id/events - Add lesion event
router.post(
  "/:id/events",
  requireAuth,
  requireRoles(["provider", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = lesionEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const eventId = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      await pool.query(
        `insert into lesion_events (
          id, tenant_id, lesion_id, event_type, provider_id,
          description, photos, related_encounter_id, outcome,
          follow_up_needed, follow_up_date
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          eventId,
          tenantId,
          id,
          data.eventType,
          userId,
          data.description,
          data.photos ? JSON.stringify(data.photos) : null,
          data.relatedEncounterId || null,
          data.outcome || null,
          data.followUpNeeded || false,
          data.followUpDate || null,
        ]
      );

      await auditLog(tenantId, userId, "lesion_event", "lesion", id!);
      res.status(201).json({ id: eventId });
    } catch (error) {
      logLesionsError("Add lesion event error:", error);
      res.status(500).json({ error: "Failed to add lesion event" });
    }
  }
);

// GET /api/lesions/:id/progression - Get lesion progression over time
router.get("/:id/progression", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const measurements = await pool.query(
      `select
        lm.*,
        p.url as "photoUrl",
        u.first_name as "measuredByFirstName",
        u.last_name as "measuredByLastName"
       from lesion_measurements lm
       left join photos p on p.id = lm.photo_id
       left join users u on u.id = lm.measured_by
       where lm.lesion_id = $1 and lm.tenant_id = $2
       order by lm.measured_at asc`,
      [id, tenantId]
    );

    // Calculate growth rates
    const progressionData = measurements.rows.map((m, index) => {
      if (index === 0) return { ...m, growthRate: 0 };

      const prev = measurements.rows[index - 1];
      const currentSize = m.length_mm * m.width_mm || 0;
      const prevSize = prev.length_mm * prev.width_mm || 0;
      const growthRate = prevSize > 0 ? ((currentSize - prevSize) / prevSize) * 100 : 0;

      return { ...m, growthRate };
    });

    res.json({ progression: progressionData });
  } catch (error) {
    logLesionsError("Get progression error:", error);
    res.status(500).json({ error: "Failed to retrieve progression data" });
  }
});

// PUT /api/lesions/:id/biopsy - Record biopsy result
router.put(
  "/:id/biopsy",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { biopsyDate, biopsyResult } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      await pool.query(
        `update lesions
         set biopsy_performed = true, biopsy_date = $1, biopsy_result = $2
         where id = $3 and tenant_id = $4`,
        [biopsyDate, biopsyResult, id, tenantId]
      );

      // Create biopsy event
      const eventId = crypto.randomUUID();
      await pool.query(
        `insert into lesion_events (
          id, tenant_id, lesion_id, event_type, provider_id, description
        ) values ($1, $2, $3, $4, $5, $6)`,
        [eventId, tenantId, id, "biopsy_performed", userId, `Biopsy result: ${biopsyResult}`]
      );

      await auditLog(tenantId, userId, "biopsy_record", "lesion", id!);
      res.json({ success: true });
    } catch (error) {
      logLesionsError("Record biopsy error:", error);
      res.status(500).json({ error: "Failed to record biopsy" });
    }
  }
);

// PUT /api/lesions/:id/status - Update lesion status
router.put(
  "/:id/status",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      await pool.query(
        `update lesions set status = $1, updated_at = now()
         where id = $2 and tenant_id = $3`,
        [status, id, tenantId]
      );

      // Create status change event
      const eventId = crypto.randomUUID();
      await pool.query(
        `insert into lesion_events (
          id, tenant_id, lesion_id, event_type, provider_id, description
        ) values ($1, $2, $3, $4, $5, $6)`,
        [eventId, tenantId, id, "status_change", userId, `Status changed to ${status}: ${reason || ""}`]
      );

      await auditLog(tenantId, userId, "lesion_status_update", "lesion", id!);
      res.json({ success: true });
    } catch (error) {
      logLesionsError("Update status error:", error);
      res.status(500).json({ error: "Failed to update lesion status" });
    }
  }
);

// GET /api/lesions/:id/biopsies - Get all biopsies for a lesion
router.get("/:id/biopsies", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const biopsies = await pool.query(
      `select
        b.*,
        ordering_pr.first_name || ' ' || ordering_pr.last_name as ordering_provider_name,
        reviewing_pr.first_name || ' ' || reviewing_pr.last_name as reviewing_provider_name
       from biopsies b
       left join providers ordering_pr on b.ordering_provider_id = ordering_pr.id
       left join providers reviewing_pr on b.reviewing_provider_id = reviewing_pr.id
       where b.lesion_id = $1 and b.tenant_id = $2 and b.deleted_at is null
       order by b.ordered_at desc`,
      [id, tenantId]
    );

    res.json({ biopsies: biopsies.rows });
  } catch (error) {
    logLesionsError("Get lesion biopsies error:", error);
    res.status(500).json({ error: "Failed to retrieve biopsies" });
  }
});

// GET /api/lesions/:id/photos - Get all photos for a lesion
router.get("/:id/photos", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const photos = await pool.query(
      `select
        p.*,
        u.first_name || ' ' || u.last_name as uploaded_by_name
       from photos p
       left join users u on p.uploaded_by = u.id
       where p.lesion_id = $1 and p.tenant_id = $2 and p.is_deleted = false
       order by p.created_at desc`,
      [id, tenantId]
    );

    res.json({ photos: photos.rows });
  } catch (error) {
    logLesionsError("Get lesion photos error:", error);
    res.status(500).json({ error: "Failed to retrieve photos" });
  }
});

// GET /api/lesions/:id/timeline - Get complete timeline for lesion
router.get("/:id/timeline", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    // Verify lesion belongs to tenant
    const lesionCheck = await pool.query(
      `select id from lesions where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );

    if (lesionCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lesion not found" });
    }

    // Get timeline using the database function
    const timeline = await pool.query(
      `select * from get_lesion_timeline($1)`,
      [id]
    );

    res.json({ timeline: timeline.rows });
  } catch (error) {
    logLesionsError("Get lesion timeline error:", error);
    res.status(500).json({ error: "Failed to retrieve timeline" });
  }
});

export default router;
