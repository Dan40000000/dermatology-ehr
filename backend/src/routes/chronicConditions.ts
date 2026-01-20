import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

export const chronicConditionsRouter = Router();

// Validation schemas
const conditionSchema = z.object({
  patientId: z.string(),
  conditionType: z.enum(["psoriasis", "eczema", "vitiligo", "acne", "rosacea", "seborrheic_dermatitis"]),
  bodyRegions: z.array(z.string()).optional(),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  pasiScore: z.number().min(0).max(72).optional(),
  bsaPercentage: z.number().min(0).max(100).optional(),
  onsetDate: z.string().optional(),
  diagnosisDate: z.string().optional(),
  currentTreatment: z.string().optional(),
  treatmentResponse: z.enum(["excellent", "good", "partial", "poor", "none"]).optional(),
  flareTriggers: z.array(z.string()).optional(),
  lastFlareDate: z.string().optional(),
  status: z.enum(["active", "controlled", "remission"]).optional(),
  notes: z.string().optional(),
});

const assessmentSchema = z.object({
  conditionId: z.string(),
  patientId: z.string(),
  encounterId: z.string().optional(),
  assessmentDate: z.string(),
  severityScore: z.number().optional(),
  affectedAreas: z.record(z.string(), z.any()).optional(),
  pasiScore: z.number().min(0).max(72).optional(),
  pasiHead: z.number().optional(),
  pasiTrunk: z.number().optional(),
  pasiUpperExtremities: z.number().optional(),
  pasiLowerExtremities: z.number().optional(),
  photoIds: z.array(z.string()).optional(),
  treatmentAtTime: z.string().optional(),
  treatmentAdherence: z.enum(["excellent", "good", "fair", "poor"]).optional(),
  providerNotes: z.string().optional(),
  clinicalImpression: z.enum(["improving", "stable", "worsening", "flaring"]).optional(),
  followUpRecommended: z.boolean().optional(),
  followUpWeeks: z.number().optional(),
});

/**
 * @swagger
 * /api/chronic-conditions:
 *   get:
 *     summary: List chronic skin conditions
 *     description: Retrieve chronic skin conditions for the current tenant, optionally filtered by patient ID
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Filter by patient ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, controlled, remission]
 *         description: Filter by condition status
 */
chronicConditionsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = req.query.patientId as string | undefined;
  const status = req.query.status as string | undefined;

  let query = `
    select
      c.id, c.tenant_id as "tenantId", c.patient_id as "patientId",
      c.condition_type as "conditionType", c.body_regions as "bodyRegions",
      c.severity, c.pasi_score as "pasiScore", c.bsa_percentage as "bsaPercentage",
      c.onset_date as "onsetDate", c.diagnosis_date as "diagnosisDate",
      c.current_treatment as "currentTreatment", c.treatment_response as "treatmentResponse",
      c.flare_triggers as "flareTriggers", c.last_flare_date as "lastFlareDate",
      c.status, c.notes, c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    from patient_skin_conditions c
    join patients p on p.id = c.patient_id
    where c.tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (patientId) {
    query += ` and c.patient_id = $${params.length + 1}`;
    params.push(patientId);
  }

  if (status) {
    query += ` and c.status = $${params.length + 1}`;
    params.push(status);
  }

  query += ` order by c.created_at desc limit 200`;

  const result = await pool.query(query, params);
  res.json({ conditions: result.rows });
});

/**
 * @swagger
 * /api/chronic-conditions/{id}:
 *   get:
 *     summary: Get a chronic condition by ID
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const result = await pool.query(
    `select
      c.id, c.tenant_id as "tenantId", c.patient_id as "patientId",
      c.condition_type as "conditionType", c.body_regions as "bodyRegions",
      c.severity, c.pasi_score as "pasiScore", c.bsa_percentage as "bsaPercentage",
      c.onset_date as "onsetDate", c.diagnosis_date as "diagnosisDate",
      c.current_treatment as "currentTreatment", c.treatment_response as "treatmentResponse",
      c.flare_triggers as "flareTriggers", c.last_flare_date as "lastFlareDate",
      c.status, c.notes, c.created_at as "createdAt", c.updated_at as "updatedAt",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    from patient_skin_conditions c
    join patients p on p.id = c.patient_id
    where c.id = $1 and c.tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Condition not found" });
  }

  res.json({ condition: result.rows[0] });
});

/**
 * @swagger
 * /api/chronic-conditions:
 *   post:
 *     summary: Create a chronic condition
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const parsed = conditionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const data = parsed.data;
  const id = crypto.randomUUID();

  const result = await pool.query(
    `insert into patient_skin_conditions (
      id, tenant_id, patient_id, condition_type, body_regions,
      severity, pasi_score, bsa_percentage, onset_date, diagnosis_date,
      current_treatment, treatment_response, flare_triggers, last_flare_date,
      status, notes
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    returning
      id, tenant_id as "tenantId", patient_id as "patientId",
      condition_type as "conditionType", body_regions as "bodyRegions",
      severity, pasi_score as "pasiScore", bsa_percentage as "bsaPercentage",
      onset_date as "onsetDate", diagnosis_date as "diagnosisDate",
      current_treatment as "currentTreatment", treatment_response as "treatmentResponse",
      flare_triggers as "flareTriggers", last_flare_date as "lastFlareDate",
      status, notes, created_at as "createdAt", updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      data.patientId,
      data.conditionType,
      data.bodyRegions || [],
      data.severity || null,
      data.pasiScore || null,
      data.bsaPercentage || null,
      data.onsetDate || null,
      data.diagnosisDate || null,
      data.currentTreatment || null,
      data.treatmentResponse || null,
      data.flareTriggers || [],
      data.lastFlareDate || null,
      data.status || "active",
      data.notes || null,
    ]
  );

  await auditLog(
    tenantId,
    userId || null,
    "chronic_condition_created",
    "patient_skin_conditions",
    id
  );

  res.status(201).json({ condition: result.rows[0] });
});

/**
 * @swagger
 * /api/chronic-conditions/{id}:
 *   put:
 *     summary: Update a chronic condition
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);

  const parsed = conditionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const data = parsed.data;
  const updates: string[] = [];
  const values: any[] = [id, tenantId];
  let paramIndex = 3;

  if (data.conditionType !== undefined) {
    updates.push(`condition_type = $${paramIndex++}`);
    values.push(data.conditionType);
  }
  if (data.bodyRegions !== undefined) {
    updates.push(`body_regions = $${paramIndex++}`);
    values.push(data.bodyRegions);
  }
  if (data.severity !== undefined) {
    updates.push(`severity = $${paramIndex++}`);
    values.push(data.severity);
  }
  if (data.pasiScore !== undefined) {
    updates.push(`pasi_score = $${paramIndex++}`);
    values.push(data.pasiScore);
  }
  if (data.bsaPercentage !== undefined) {
    updates.push(`bsa_percentage = $${paramIndex++}`);
    values.push(data.bsaPercentage);
  }
  if (data.onsetDate !== undefined) {
    updates.push(`onset_date = $${paramIndex++}`);
    values.push(data.onsetDate);
  }
  if (data.diagnosisDate !== undefined) {
    updates.push(`diagnosis_date = $${paramIndex++}`);
    values.push(data.diagnosisDate);
  }
  if (data.currentTreatment !== undefined) {
    updates.push(`current_treatment = $${paramIndex++}`);
    values.push(data.currentTreatment);
  }
  if (data.treatmentResponse !== undefined) {
    updates.push(`treatment_response = $${paramIndex++}`);
    values.push(data.treatmentResponse);
  }
  if (data.flareTriggers !== undefined) {
    updates.push(`flare_triggers = $${paramIndex++}`);
    values.push(data.flareTriggers);
  }
  if (data.lastFlareDate !== undefined) {
    updates.push(`last_flare_date = $${paramIndex++}`);
    values.push(data.lastFlareDate);
  }
  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }
  if (data.notes !== undefined) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const result = await pool.query(
    `update patient_skin_conditions
     set ${updates.join(", ")}
     where id = $1 and tenant_id = $2
     returning
       id, tenant_id as "tenantId", patient_id as "patientId",
       condition_type as "conditionType", body_regions as "bodyRegions",
       severity, pasi_score as "pasiScore", bsa_percentage as "bsaPercentage",
       onset_date as "onsetDate", diagnosis_date as "diagnosisDate",
       current_treatment as "currentTreatment", treatment_response as "treatmentResponse",
       flare_triggers as "flareTriggers", last_flare_date as "lastFlareDate",
       status, notes, created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Condition not found" });
  }

  await auditLog(
    tenantId,
    userId || null,
    "chronic_condition_updated",
    "patient_skin_conditions",
    id
  );

  res.json({ condition: result.rows[0] });
});

/**
 * @swagger
 * /api/chronic-conditions/{id}:
 *   delete:
 *     summary: Delete a chronic condition
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);

  const result = await pool.query(
    "delete from patient_skin_conditions where id = $1 and tenant_id = $2 returning id",
    [id, tenantId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Condition not found" });
  }

  await auditLog(
    tenantId,
    userId || null,
    "chronic_condition_deleted",
    "patient_skin_conditions",
    id
  );

  res.json({ success: true });
});

// ========================
// CONDITION ASSESSMENTS
// ========================

/**
 * @swagger
 * /api/chronic-conditions/{conditionId}/assessments:
 *   get:
 *     summary: List assessments for a chronic condition
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.get("/:conditionId/assessments", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { conditionId } = req.params;

  const result = await pool.query(
    `select
      a.id, a.tenant_id as "tenantId", a.condition_id as "conditionId",
      a.patient_id as "patientId", a.encounter_id as "encounterId",
      a.assessment_date as "assessmentDate", a.severity_score as "severityScore",
      a.affected_areas as "affectedAreas", a.pasi_score as "pasiScore",
      a.pasi_head as "pasiHead", a.pasi_trunk as "pasiTrunk",
      a.pasi_upper_extremities as "pasiUpperExtremities",
      a.pasi_lower_extremities as "pasiLowerExtremities",
      a.photo_ids as "photoIds", a.treatment_at_time as "treatmentAtTime",
      a.treatment_adherence as "treatmentAdherence", a.provider_notes as "providerNotes",
      a.clinical_impression as "clinicalImpression",
      a.follow_up_recommended as "followUpRecommended", a.follow_up_weeks as "followUpWeeks",
      a.assessed_by as "assessedBy", a.created_at as "createdAt", a.updated_at as "updatedAt",
      u.full_name as "assessorName"
    from condition_assessments a
    left join users u on u.id = a.assessed_by
    where a.condition_id = $1 and a.tenant_id = $2
    order by a.assessment_date desc, a.created_at desc limit 200`,
    [conditionId, tenantId]
  );

  res.json({ assessments: result.rows });
});

/**
 * @swagger
 * /api/chronic-conditions/{conditionId}/assessments:
 *   post:
 *     summary: Create an assessment for a chronic condition
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.post("/:conditionId/assessments", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { conditionId } = req.params;

  const parsed = assessmentSchema.safeParse({ ...req.body, conditionId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const data = parsed.data;
  const id = crypto.randomUUID();

  const result = await pool.query(
    `insert into condition_assessments (
      id, tenant_id, condition_id, patient_id, encounter_id,
      assessment_date, severity_score, affected_areas, pasi_score,
      pasi_head, pasi_trunk, pasi_upper_extremities, pasi_lower_extremities,
      photo_ids, treatment_at_time, treatment_adherence, provider_notes,
      clinical_impression, follow_up_recommended, follow_up_weeks, assessed_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    returning
      id, tenant_id as "tenantId", condition_id as "conditionId",
      patient_id as "patientId", encounter_id as "encounterId",
      assessment_date as "assessmentDate", severity_score as "severityScore",
      affected_areas as "affectedAreas", pasi_score as "pasiScore",
      pasi_head as "pasiHead", pasi_trunk as "pasiTrunk",
      pasi_upper_extremities as "pasiUpperExtremities",
      pasi_lower_extremities as "pasiLowerExtremities",
      photo_ids as "photoIds", treatment_at_time as "treatmentAtTime",
      treatment_adherence as "treatmentAdherence", provider_notes as "providerNotes",
      clinical_impression as "clinicalImpression",
      follow_up_recommended as "followUpRecommended", follow_up_weeks as "followUpWeeks",
      assessed_by as "assessedBy", created_at as "createdAt", updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      conditionId,
      data.patientId,
      data.encounterId || null,
      data.assessmentDate,
      data.severityScore || null,
      data.affectedAreas ? JSON.stringify(data.affectedAreas) : null,
      data.pasiScore || null,
      data.pasiHead || null,
      data.pasiTrunk || null,
      data.pasiUpperExtremities || null,
      data.pasiLowerExtremities || null,
      data.photoIds || [],
      data.treatmentAtTime || null,
      data.treatmentAdherence || null,
      data.providerNotes || null,
      data.clinicalImpression || null,
      data.followUpRecommended || false,
      data.followUpWeeks || null,
      userId,
    ]
  );

  await auditLog(
    tenantId,
    userId || null,
    "condition_assessment_created",
    "condition_assessments",
    id
  );

  res.status(201).json({ assessment: result.rows[0] });
});

/**
 * @swagger
 * /api/chronic-conditions/{conditionId}/assessments/{id}:
 *   put:
 *     summary: Update an assessment
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.put("/:conditionId/assessments/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);
  const conditionId = String(req.params.conditionId);

  const parsed = assessmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const data = parsed.data;
  const updates: string[] = [];
  const values: any[] = [id, tenantId, conditionId];
  let paramIndex = 4;

  if (data.assessmentDate !== undefined) {
    updates.push(`assessment_date = $${paramIndex++}`);
    values.push(data.assessmentDate);
  }
  if (data.severityScore !== undefined) {
    updates.push(`severity_score = $${paramIndex++}`);
    values.push(data.severityScore);
  }
  if (data.affectedAreas !== undefined) {
    updates.push(`affected_areas = $${paramIndex++}`);
    values.push(JSON.stringify(data.affectedAreas));
  }
  if (data.pasiScore !== undefined) {
    updates.push(`pasi_score = $${paramIndex++}`);
    values.push(data.pasiScore);
  }
  if (data.pasiHead !== undefined) {
    updates.push(`pasi_head = $${paramIndex++}`);
    values.push(data.pasiHead);
  }
  if (data.pasiTrunk !== undefined) {
    updates.push(`pasi_trunk = $${paramIndex++}`);
    values.push(data.pasiTrunk);
  }
  if (data.pasiUpperExtremities !== undefined) {
    updates.push(`pasi_upper_extremities = $${paramIndex++}`);
    values.push(data.pasiUpperExtremities);
  }
  if (data.pasiLowerExtremities !== undefined) {
    updates.push(`pasi_lower_extremities = $${paramIndex++}`);
    values.push(data.pasiLowerExtremities);
  }
  if (data.photoIds !== undefined) {
    updates.push(`photo_ids = $${paramIndex++}`);
    values.push(data.photoIds);
  }
  if (data.treatmentAtTime !== undefined) {
    updates.push(`treatment_at_time = $${paramIndex++}`);
    values.push(data.treatmentAtTime);
  }
  if (data.treatmentAdherence !== undefined) {
    updates.push(`treatment_adherence = $${paramIndex++}`);
    values.push(data.treatmentAdherence);
  }
  if (data.providerNotes !== undefined) {
    updates.push(`provider_notes = $${paramIndex++}`);
    values.push(data.providerNotes);
  }
  if (data.clinicalImpression !== undefined) {
    updates.push(`clinical_impression = $${paramIndex++}`);
    values.push(data.clinicalImpression);
  }
  if (data.followUpRecommended !== undefined) {
    updates.push(`follow_up_recommended = $${paramIndex++}`);
    values.push(data.followUpRecommended);
  }
  if (data.followUpWeeks !== undefined) {
    updates.push(`follow_up_weeks = $${paramIndex++}`);
    values.push(data.followUpWeeks);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const result = await pool.query(
    `update condition_assessments
     set ${updates.join(", ")}
     where id = $1 and tenant_id = $2 and condition_id = $3
     returning
       id, tenant_id as "tenantId", condition_id as "conditionId",
       patient_id as "patientId", encounter_id as "encounterId",
       assessment_date as "assessmentDate", severity_score as "severityScore",
       affected_areas as "affectedAreas", pasi_score as "pasiScore",
       pasi_head as "pasiHead", pasi_trunk as "pasiTrunk",
       pasi_upper_extremities as "pasiUpperExtremities",
       pasi_lower_extremities as "pasiLowerExtremities",
       photo_ids as "photoIds", treatment_at_time as "treatmentAtTime",
       treatment_adherence as "treatmentAdherence", provider_notes as "providerNotes",
       clinical_impression as "clinicalImpression",
       follow_up_recommended as "followUpRecommended", follow_up_weeks as "followUpWeeks",
       assessed_by as "assessedBy", created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Assessment not found" });
  }

  await auditLog(
    tenantId,
    userId || null,
    "condition_assessment_updated",
    "condition_assessments",
    id
  );

  res.json({ assessment: result.rows[0] });
});

/**
 * @swagger
 * /api/chronic-conditions/{conditionId}/assessments/{id}:
 *   delete:
 *     summary: Delete an assessment
 *     tags:
 *       - Chronic Conditions
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 */
chronicConditionsRouter.delete("/:conditionId/assessments/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);
  const conditionId = String(req.params.conditionId);

  const result = await pool.query(
    "delete from condition_assessments where id = $1 and tenant_id = $2 and condition_id = $3 returning id",
    [id, tenantId, conditionId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Assessment not found" });
  }

  await auditLog(
    tenantId,
    userId || null,
    "condition_assessment_deleted",
    "condition_assessments",
    id
  );

  res.json({ success: true });
});
