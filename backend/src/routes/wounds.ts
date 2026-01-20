import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const router = express.Router();

/**
 * Wound Tracking Routes
 *
 * Comprehensive wound care management with:
 * - Wound documentation and classification
 * - Serial assessments for healing progression
 * - Treatment tracking
 * - Healing rate calculations
 */

// Schemas
const woundTypeEnum = z.enum(['surgical', 'ulcer', 'burn', 'laceration', 'pressure_injury', 'other']);
const woundBedEnum = z.enum(['granulation', 'slough', 'eschar', 'epithelializing', 'mixed', 'necrotic']);
const exudateAmountEnum = z.enum(['none', 'scant', 'moderate', 'heavy']);
const exudateTypeEnum = z.enum(['serous', 'sanguineous', 'purulent', 'serosanguineous']);
const periwoundSkinEnum = z.enum(['healthy', 'macerated', 'erythematous', 'indurated', 'fragile', 'edematous']);
const statusEnum = z.enum(['open', 'healing', 'healed', 'chronic', 'stalled', 'deteriorating']);
const healingTrendEnum = z.enum(['improving', 'stable', 'declining', 'stalled']);

const createWoundSchema = z.object({
  patientId: z.string(),
  woundType: woundTypeEnum,
  etiology: z.string().optional(),
  bodyRegion: z.string(),
  laterality: z.enum(['left', 'right', 'bilateral', 'midline']).optional(),
  xPosition: z.number().optional(),
  yPosition: z.number().optional(),
  lengthCm: z.number().optional(),
  widthCm: z.number().optional(),
  depthCm: z.number().optional(),
  areaCm2: z.number().optional(),
  woundBed: woundBedEnum.optional(),
  woundBedPercentage: z.record(z.string(), z.number()).optional(),
  exudateAmount: exudateAmountEnum.optional(),
  exudateType: exudateTypeEnum.optional(),
  periwoundSkin: periwoundSkinEnum.optional(),
  underminingPresent: z.boolean().optional(),
  underminingLocation: z.string().optional(),
  tunnelingPresent: z.boolean().optional(),
  tunnelingLocation: z.string().optional(),
  infectionSigns: z.boolean().optional(),
  infectionNotes: z.string().optional(),
  painLevel: z.number().min(0).max(10).optional(),
  odorPresent: z.boolean().optional(),
  currentDressing: z.string().optional(),
  dressingChangeFrequency: z.string().optional(),
  debridementNeeded: z.boolean().optional(),
  lastDebridementDate: z.string().optional(),
  onsetDate: z.string(),
  notes: z.string().optional(),
  treatmentPlan: z.string().optional(),
});

const updateWoundSchema = createWoundSchema.partial().omit({ patientId: true });

const createAssessmentSchema = z.object({
  woundId: z.string(),
  assessmentDate: z.string().optional(),
  lengthCm: z.number().optional(),
  widthCm: z.number().optional(),
  depthCm: z.number().optional(),
  areaCm2: z.number().optional(),
  woundBedPercentage: z.record(z.string(), z.number()).optional(),
  woundBed: woundBedEnum.optional(),
  exudateAmount: exudateAmountEnum.optional(),
  exudateType: exudateTypeEnum.optional(),
  periwoundSkin: periwoundSkinEnum.optional(),
  underminingPresent: z.boolean().optional(),
  underminingMeasurement: z.string().optional(),
  tunnelingPresent: z.boolean().optional(),
  tunnelingMeasurement: z.string().optional(),
  infectionSigns: z.boolean().optional(),
  infectionNotes: z.string().optional(),
  painLevel: z.number().min(0).max(10).optional(),
  odorPresent: z.boolean().optional(),
  treatmentApplied: z.string().optional(),
  dressingApplied: z.string().optional(),
  cleaningSolution: z.string().optional(),
  healingTrend: healingTrendEnum,
  healingPercentage: z.number().min(0).max(100).optional(),
  photoId: z.string().optional(),
  providerNotes: z.string().optional(),
  patientComplaints: z.string().optional(),
  nextAssessmentDate: z.string().optional(),
  treatmentChanges: z.string().optional(),
  referralNeeded: z.boolean().optional(),
  referralNotes: z.string().optional(),
});

// GET /api/wounds - List all wounds
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, status, woundType, activeOnly } = req.query;

    let query = `
      SELECT * FROM v_wound_overview
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (woundType) {
      query += ` AND wound_type = $${paramIndex}`;
      params.push(woundType);
      paramIndex++;
    }

    if (activeOnly === 'true') {
      query += ` AND status IN ('open', 'healing', 'chronic', 'stalled', 'deteriorating')`;
    }

    query += ` ORDER BY onset_date DESC`;

    const result = await pool.query(query, params);
    res.json({ wounds: result.rows });
  } catch (error) {
    console.error("Get wounds error:", error);
    res.status(500).json({ error: "Failed to retrieve wounds" });
  }
});

// GET /api/wounds/:id - Get single wound with full details
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    // Get wound details
    const wound = await pool.query(
      `SELECT
        w.*,
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName",
        p.mrn,
        u.first_name as "createdByFirstName",
        u.last_name as "createdByLastName"
       FROM wounds w
       JOIN patients p ON p.id = w.patient_id
       LEFT JOIN users u ON u.id = w.created_by
       WHERE w.id = $1 AND w.tenant_id = $2 AND w.deleted_at IS NULL`,
      [id, tenantId]
    );

    if (wound.rows.length === 0) {
      return res.status(404).json({ error: "Wound not found" });
    }

    // Get all assessments
    const assessments = await pool.query(
      `SELECT
        wa.*,
        u.first_name as "assessedByFirstName",
        u.last_name as "assessedByLastName"
       FROM wound_assessments wa
       LEFT JOIN users u ON u.id = wa.assessed_by
       WHERE wa.wound_id = $1 AND wa.tenant_id = $2
       ORDER BY wa.assessment_date DESC`,
      [id, tenantId]
    );

    // Get healing rate metrics
    const healingRate = await pool.query(
      `SELECT * FROM calculate_wound_healing_rate($1)`,
      [id]
    );

    // Get associated photos
    const photos = await pool.query(
      `SELECT * FROM photos
       WHERE wound_id = $1 AND tenant_id = $2 AND is_deleted = false
       ORDER BY created_at DESC`,
      [id, tenantId]
    );

    res.json({
      wound: wound.rows[0],
      assessments: assessments.rows,
      healingMetrics: healingRate.rows[0],
      photos: photos.rows,
    });
  } catch (error) {
    console.error("Get wound details error:", error);
    res.status(500).json({ error: "Failed to retrieve wound details" });
  }
});

// POST /api/wounds - Create new wound
router.post(
  "/",
  requireAuth,
  requireRoles(["provider", "nurse", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createWoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const id = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      await pool.query(
        `INSERT INTO wounds (
          id, tenant_id, patient_id, wound_type, etiology,
          body_region, laterality, x_position, y_position,
          length_cm, width_cm, depth_cm, area_cm2,
          wound_bed, wound_bed_percentage,
          exudate_amount, exudate_type, periwound_skin,
          undermining_present, undermining_location,
          tunneling_present, tunneling_location,
          infection_signs, infection_notes, pain_level, odor_present,
          current_dressing, dressing_change_frequency,
          debridement_needed, last_debridement_date,
          onset_date, notes, treatment_plan, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34
        )`,
        [
          id,
          tenantId,
          data.patientId,
          data.woundType,
          data.etiology || null,
          data.bodyRegion,
          data.laterality || null,
          data.xPosition || null,
          data.yPosition || null,
          data.lengthCm || null,
          data.widthCm || null,
          data.depthCm || null,
          data.areaCm2 || null,
          data.woundBed || null,
          data.woundBedPercentage ? JSON.stringify(data.woundBedPercentage) : null,
          data.exudateAmount || null,
          data.exudateType || null,
          data.periwoundSkin || null,
          data.underminingPresent || false,
          data.underminingLocation || null,
          data.tunnelingPresent || false,
          data.tunnelingLocation || null,
          data.infectionSigns || false,
          data.infectionNotes || null,
          data.painLevel || null,
          data.odorPresent || false,
          data.currentDressing || null,
          data.dressingChangeFrequency || null,
          data.debridementNeeded || false,
          data.lastDebridementDate || null,
          data.onsetDate,
          data.notes || null,
          data.treatmentPlan || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, "wound_create", "wound", id);
      res.status(201).json({ id });
    } catch (error) {
      console.error("Create wound error:", error);
      res.status(500).json({ error: "Failed to create wound" });
    }
  }
);

// PUT /api/wounds/:id - Update wound
router.put(
  "/:id",
  requireAuth,
  requireRoles(["provider", "nurse", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Wound ID is required" });
      }

      const parsed = updateWoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          // Convert camelCase to snake_case
          const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          updates.push(`${columnName} = $${paramIndex}`);
          values.push(
            typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value
          );
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id, tenantId);
      const query = `
        UPDATE wounds
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
      `;

      await pool.query(query, values);
      await auditLog(tenantId, userId, "wound_update", "wound", id);

      res.json({ success: true });
    } catch (error) {
      console.error("Update wound error:", error);
      res.status(500).json({ error: "Failed to update wound" });
    }
  }
);

// POST /api/wounds/:id/assessments - Add new assessment
router.post(
  "/:id/assessments",
  requireAuth,
  requireRoles(["provider", "nurse", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Wound ID is required" });
      }

      const parsed = createAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const assessmentId = crypto.randomUUID();
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      // Get patient_id from wound
      const woundResult = await pool.query(
        `SELECT patient_id FROM wounds WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      if (woundResult.rows.length === 0) {
        return res.status(404).json({ error: "Wound not found" });
      }

      const patientId = woundResult.rows[0].patient_id;

      await pool.query(
        `INSERT INTO wound_assessments (
          id, tenant_id, wound_id, patient_id, assessed_by,
          assessment_date, length_cm, width_cm, depth_cm, area_cm2,
          wound_bed_percentage, wound_bed,
          exudate_amount, exudate_type, periwound_skin,
          undermining_present, undermining_measurement,
          tunneling_present, tunneling_measurement,
          infection_signs, infection_notes, pain_level, odor_present,
          treatment_applied, dressing_applied, cleaning_solution,
          healing_trend, healing_percentage,
          photo_id, provider_notes, patient_complaints,
          next_assessment_date, treatment_changes,
          referral_needed, referral_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35
        )`,
        [
          assessmentId,
          tenantId,
          id,
          patientId,
          userId,
          data.assessmentDate || new Date().toISOString(),
          data.lengthCm || null,
          data.widthCm || null,
          data.depthCm || null,
          data.areaCm2 || null,
          data.woundBedPercentage ? JSON.stringify(data.woundBedPercentage) : null,
          data.woundBed || null,
          data.exudateAmount || null,
          data.exudateType || null,
          data.periwoundSkin || null,
          data.underminingPresent || false,
          data.underminingMeasurement || null,
          data.tunnelingPresent || false,
          data.tunnelingMeasurement || null,
          data.infectionSigns || false,
          data.infectionNotes || null,
          data.painLevel || null,
          data.odorPresent || false,
          data.treatmentApplied || null,
          data.dressingApplied || null,
          data.cleaningSolution || null,
          data.healingTrend,
          data.healingPercentage || null,
          data.photoId || null,
          data.providerNotes || null,
          data.patientComplaints || null,
          data.nextAssessmentDate || null,
          data.treatmentChanges || null,
          data.referralNeeded || false,
          data.referralNotes || null,
        ]
      );

      await auditLog(tenantId, userId, "wound_assessment", "wound", id);
      res.status(201).json({ id: assessmentId });
    } catch (error) {
      console.error("Create assessment error:", error);
      res.status(500).json({ error: "Failed to create assessment" });
    }
  }
);

// GET /api/wounds/:id/assessments - Get all assessments for a wound
router.get("/:id/assessments", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const assessments = await pool.query(
      `SELECT
        wa.*,
        u.first_name || ' ' || u.last_name as assessed_by_name
       FROM wound_assessments wa
       LEFT JOIN users u ON u.id = wa.assessed_by
       WHERE wa.wound_id = $1 AND wa.tenant_id = $2
       ORDER BY wa.assessment_date DESC`,
      [id, tenantId]
    );

    res.json({ assessments: assessments.rows });
  } catch (error) {
    console.error("Get assessments error:", error);
    res.status(500).json({ error: "Failed to retrieve assessments" });
  }
});

// GET /api/wounds/:id/healing-metrics - Get healing rate calculations
router.get("/:id/healing-metrics", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    // Verify wound belongs to tenant
    const woundCheck = await pool.query(
      `SELECT id FROM wounds WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );

    if (woundCheck.rows.length === 0) {
      return res.status(404).json({ error: "Wound not found" });
    }

    const metrics = await pool.query(
      `SELECT * FROM calculate_wound_healing_rate($1)`,
      [id]
    );

    res.json({ metrics: metrics.rows[0] });
  } catch (error) {
    console.error("Get healing metrics error:", error);
    res.status(500).json({ error: "Failed to retrieve healing metrics" });
  }
});

// GET /api/wounds/patient/:patientId/active - Get active wounds for patient
router.get("/patient/:patientId/active", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const wounds = await pool.query(
      `SELECT * FROM get_active_wounds_for_patient($1, $2)`,
      [tenantId, patientId]
    );

    res.json({ wounds: wounds.rows });
  } catch (error) {
    console.error("Get active wounds error:", error);
    res.status(500).json({ error: "Failed to retrieve active wounds" });
  }
});

// PUT /api/wounds/:id/status - Update wound status
router.put(
  "/:id/status",
  requireAuth,
  requireRoles(["provider", "nurse", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Wound ID is required" });
      }

      const { status, healedDate, notes } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const validStatuses = ['open', 'healing', 'healed', 'chronic', 'stalled', 'deteriorating'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await pool.query(
        `UPDATE wounds
         SET status = $1,
             healed_date = $2,
             notes = CASE
               WHEN $3 IS NOT NULL THEN COALESCE(notes, '') || E'\n' || $3
               ELSE notes
             END,
             updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5 AND deleted_at IS NULL`,
        [status, healedDate || null, notes || null, id, tenantId]
      );

      await auditLog(tenantId, userId, "wound_status_update", "wound", id);
      res.json({ success: true });
    } catch (error) {
      console.error("Update wound status error:", error);
      res.status(500).json({ error: "Failed to update wound status" });
    }
  }
);

// DELETE /api/wounds/:id - Soft delete wound
router.delete(
  "/:id",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Wound ID is required" });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      await pool.query(
        `UPDATE wounds
         SET deleted_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      await auditLog(tenantId, userId, "wound_delete", "wound", id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete wound error:", error);
      res.status(500).json({ error: "Failed to delete wound" });
    }
  }
);

export default router;
