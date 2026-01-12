import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const markingSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  locationCode: z.string(),
  locationX: z.number().min(0).max(100),
  locationY: z.number().min(0).max(100),
  viewType: z.enum(['front', 'back']),
  markingType: z.enum(['lesion', 'examined', 'biopsy', 'excision', 'injection']),
  diagnosisCode: z.string().optional(),
  diagnosisDescription: z.string().optional(),
  lesionType: z.string().optional(),
  lesionSizeMm: z.number().optional(),
  lesionColor: z.string().optional(),
  status: z.enum(['active', 'resolved', 'monitored', 'biopsied', 'excised']).optional(),
  examinedDate: z.string().optional(),
  resolvedDate: z.string().optional(),
  description: z.string().optional(),
  treatmentNotes: z.string().optional(),
  photoIds: z.array(z.string()).optional(),
});

const markingUpdateSchema = z.object({
  locationCode: z.string().optional(),
  locationX: z.number().min(0).max(100).optional(),
  locationY: z.number().min(0).max(100).optional(),
  viewType: z.enum(['front', 'back']).optional(),
  markingType: z.enum(['lesion', 'examined', 'biopsy', 'excision', 'injection']).optional(),
  diagnosisCode: z.string().optional(),
  diagnosisDescription: z.string().optional(),
  lesionType: z.string().optional(),
  lesionSizeMm: z.number().optional(),
  lesionColor: z.string().optional(),
  status: z.enum(['active', 'resolved', 'monitored', 'biopsied', 'excised']).optional(),
  examinedDate: z.string().optional(),
  resolvedDate: z.string().optional(),
  description: z.string().optional(),
  treatmentNotes: z.string().optional(),
  photoIds: z.array(z.string()).optional(),
});

export const bodyDiagramRouter = Router();

// Get all body location reference data
bodyDiagramRouter.get("/locations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `select id, code, name, category, svg_coordinates as "svgCoordinates"
       from body_locations
       order by category, name`
    );

    res.json({ locations: result.rows });
  } catch (error: any) {
    console.error("Error fetching body locations:", error);
    res.status(500).json({ error: "Failed to fetch body locations" });
  }
});

// Get all markings for a patient
bodyDiagramRouter.get("/patient/:patientId/markings", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId } = req.params;

  try {
    const result = await pool.query(
      `select
        m.id,
        m.patient_id as "patientId",
        m.encounter_id as "encounterId",
        m.location_code as "locationCode",
        m.location_x as "locationX",
        m.location_y as "locationY",
        m.view_type as "viewType",
        m.marking_type as "markingType",
        m.diagnosis_code as "diagnosisCode",
        m.diagnosis_description as "diagnosisDescription",
        m.lesion_type as "lesionType",
        m.lesion_size_mm as "lesionSizeMm",
        m.lesion_color as "lesionColor",
        m.status,
        m.examined_date as "examinedDate",
        m.resolved_date as "resolvedDate",
        m.description,
        m.treatment_notes as "treatmentNotes",
        m.photo_ids as "photoIds",
        m.created_by as "createdBy",
        m.created_at as "createdAt",
        m.updated_at as "updatedAt",
        bl.name as "locationName",
        bl.category as "locationCategory",
        u.full_name as "createdByName"
       from patient_body_markings m
       join body_locations bl on bl.code = m.location_code
       left join users u on u.id = m.created_by
       where m.tenant_id = $1 and m.patient_id = $2
       order by m.created_at desc`,
      [tenantId, patientId]
    );

    await auditLog(tenantId, req.user!.id, "body_diagram_view", "patient", patientId!);
    res.json({ markings: result.rows });
  } catch (error: any) {
    console.error("Error fetching patient markings:", error);
    res.status(500).json({ error: "Failed to fetch patient markings" });
  }
});

// Get markings for an encounter
bodyDiagramRouter.get("/encounter/:encounterId/markings", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { encounterId } = req.params;

  try {
    const result = await pool.query(
      `select
        m.id,
        m.patient_id as "patientId",
        m.encounter_id as "encounterId",
        m.location_code as "locationCode",
        m.location_x as "locationX",
        m.location_y as "locationY",
        m.view_type as "viewType",
        m.marking_type as "markingType",
        m.diagnosis_code as "diagnosisCode",
        m.diagnosis_description as "diagnosisDescription",
        m.lesion_type as "lesionType",
        m.lesion_size_mm as "lesionSizeMm",
        m.lesion_color as "lesionColor",
        m.status,
        m.examined_date as "examinedDate",
        m.resolved_date as "resolvedDate",
        m.description,
        m.treatment_notes as "treatmentNotes",
        m.photo_ids as "photoIds",
        m.created_by as "createdBy",
        m.created_at as "createdAt",
        m.updated_at as "updatedAt",
        bl.name as "locationName",
        bl.category as "locationCategory",
        u.full_name as "createdByName"
       from patient_body_markings m
       join body_locations bl on bl.code = m.location_code
       left join users u on u.id = m.created_by
       where m.tenant_id = $1 and m.encounter_id = $2
       order by m.created_at desc`,
      [tenantId, encounterId]
    );

    res.json({ markings: result.rows });
  } catch (error: any) {
    console.error("Error fetching encounter markings:", error);
    res.status(500).json({ error: "Failed to fetch encounter markings" });
  }
});

// Get single marking with full details
bodyDiagramRouter.get("/markings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `select
        m.id,
        m.patient_id as "patientId",
        m.encounter_id as "encounterId",
        m.location_code as "locationCode",
        m.location_x as "locationX",
        m.location_y as "locationY",
        m.view_type as "viewType",
        m.marking_type as "markingType",
        m.diagnosis_code as "diagnosisCode",
        m.diagnosis_description as "diagnosisDescription",
        m.lesion_type as "lesionType",
        m.lesion_size_mm as "lesionSizeMm",
        m.lesion_color as "lesionColor",
        m.status,
        m.examined_date as "examinedDate",
        m.resolved_date as "resolvedDate",
        m.description,
        m.treatment_notes as "treatmentNotes",
        m.photo_ids as "photoIds",
        m.created_by as "createdBy",
        m.created_at as "createdAt",
        m.updated_at as "updatedAt",
        bl.name as "locationName",
        bl.category as "locationCategory",
        bl.svg_coordinates as "svgCoordinates",
        u.full_name as "createdByName",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName"
       from patient_body_markings m
       join body_locations bl on bl.code = m.location_code
       left join users u on u.id = m.created_by
       left join patients p on p.id = m.patient_id
       where m.tenant_id = $1 and m.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Marking not found" });
    }

    res.json({ marking: result.rows[0] });
  } catch (error: any) {
    console.error("Error fetching marking:", error);
    res.status(500).json({ error: "Failed to fetch marking" });
  }
});

// Create new marking
bodyDiagramRouter.post("/markings", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = markingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const data = parsed.data;
  const id = crypto.randomUUID();

  try {
    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      `select id from patients where id = $1 and tenant_id = $2`,
      [data.patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Verify location code exists
    const locationCheck = await pool.query(
      `select code from body_locations where code = $1`,
      [data.locationCode]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(400).json({ error: "Invalid location code" });
    }

    // If encounter is specified, verify it exists
    if (data.encounterId) {
      const encounterCheck = await pool.query(
        `select id from encounters where id = $1 and tenant_id = $2`,
        [data.encounterId, tenantId]
      );

      if (encounterCheck.rows.length === 0) {
        return res.status(404).json({ error: "Encounter not found" });
      }
    }

    await pool.query(
      `insert into patient_body_markings (
        id, tenant_id, patient_id, encounter_id, location_code,
        location_x, location_y, view_type, marking_type,
        diagnosis_code, diagnosis_description, lesion_type, lesion_size_mm, lesion_color,
        status, examined_date, resolved_date, description, treatment_notes,
        photo_ids, created_by
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )`,
      [
        id,
        tenantId,
        data.patientId,
        data.encounterId || null,
        data.locationCode,
        data.locationX,
        data.locationY,
        data.viewType,
        data.markingType,
        data.diagnosisCode || null,
        data.diagnosisDescription || null,
        data.lesionType || null,
        data.lesionSizeMm || null,
        data.lesionColor || null,
        data.status || 'active',
        data.examinedDate || null,
        data.resolvedDate || null,
        data.description || null,
        data.treatmentNotes || null,
        JSON.stringify(data.photoIds || []),
        userId,
      ]
    );

    await auditLog(tenantId, userId, "body_marking_create", "body_marking", id);

    res.status(201).json({ id });
  } catch (error: any) {
    console.error("Error creating marking:", error);
    res.status(500).json({ error: "Failed to create marking" });
  }
});

// Update marking
bodyDiagramRouter.put("/markings/:id", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = markingUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { id } = req.params;
  const data = parsed.data;

  try {
    // Verify marking exists and belongs to tenant
    const markingCheck = await pool.query(
      `select id from patient_body_markings where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );

    if (markingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Marking not found" });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.locationCode !== undefined) {
      // Verify location code exists
      const locationCheck = await pool.query(
        `select code from body_locations where code = $1`,
        [data.locationCode]
      );
      if (locationCheck.rows.length === 0) {
        return res.status(400).json({ error: "Invalid location code" });
      }
      updates.push(`location_code = $${paramCount++}`);
      values.push(data.locationCode);
    }

    if (data.locationX !== undefined) {
      updates.push(`location_x = $${paramCount++}`);
      values.push(data.locationX);
    }

    if (data.locationY !== undefined) {
      updates.push(`location_y = $${paramCount++}`);
      values.push(data.locationY);
    }

    if (data.viewType !== undefined) {
      updates.push(`view_type = $${paramCount++}`);
      values.push(data.viewType);
    }

    if (data.markingType !== undefined) {
      updates.push(`marking_type = $${paramCount++}`);
      values.push(data.markingType);
    }

    if (data.diagnosisCode !== undefined) {
      updates.push(`diagnosis_code = $${paramCount++}`);
      values.push(data.diagnosisCode);
    }

    if (data.diagnosisDescription !== undefined) {
      updates.push(`diagnosis_description = $${paramCount++}`);
      values.push(data.diagnosisDescription);
    }

    if (data.lesionType !== undefined) {
      updates.push(`lesion_type = $${paramCount++}`);
      values.push(data.lesionType);
    }

    if (data.lesionSizeMm !== undefined) {
      updates.push(`lesion_size_mm = $${paramCount++}`);
      values.push(data.lesionSizeMm);
    }

    if (data.lesionColor !== undefined) {
      updates.push(`lesion_color = $${paramCount++}`);
      values.push(data.lesionColor);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(data.status);
    }

    if (data.examinedDate !== undefined) {
      updates.push(`examined_date = $${paramCount++}`);
      values.push(data.examinedDate);
    }

    if (data.resolvedDate !== undefined) {
      updates.push(`resolved_date = $${paramCount++}`);
      values.push(data.resolvedDate);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }

    if (data.treatmentNotes !== undefined) {
      updates.push(`treatment_notes = $${paramCount++}`);
      values.push(data.treatmentNotes);
    }

    if (data.photoIds !== undefined) {
      updates.push(`photo_ids = $${paramCount++}`);
      values.push(JSON.stringify(data.photoIds));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Add ID and tenant ID to values
    values.push(id, tenantId);

    await pool.query(
      `update patient_body_markings
       set ${updates.join(', ')}
       where id = $${paramCount++} and tenant_id = $${paramCount++}`,
      values
    );

    await auditLog(tenantId, userId, "body_marking_update", "body_marking", id!);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating marking:", error);
    res.status(500).json({ error: "Failed to update marking" });
  }
});

// Delete marking
bodyDiagramRouter.delete("/markings/:id", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `delete from patient_body_markings
       where id = $1 and tenant_id = $2
       returning patient_id as "patientId"`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Marking not found" });
    }

    await auditLog(tenantId, userId, "body_marking_delete", "body_marking", id!);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("Error deleting marking:", error);
    res.status(500).json({ error: "Failed to delete marking" });
  }
});
