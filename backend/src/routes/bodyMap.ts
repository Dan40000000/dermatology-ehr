import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';

const lesionSchema = z.object({
  patient_id: z.string().uuid(),
  anatomical_location: z.string(),
  location_code: z.string().optional(),
  x_coordinate: z.number().min(0).max(100),
  y_coordinate: z.number().min(0).max(100),
  body_view: z.enum(['front', 'back', 'head-front', 'head-back', 'left-side', 'right-side']),
  lesion_type: z.string().optional(),
  status: z.enum(['monitoring', 'suspicious', 'benign', 'malignant', 'treated', 'resolved']).default('monitoring'),
  size_mm: z.number().positive().optional(),
  color: z.string().optional(),
  border: z.string().optional(),
  first_noted_date: z.string().optional(),
  biopsy_id: z.string().optional(),
  pathology_result: z.string().optional(),
  notes: z.string().optional(),
});

const lesionUpdateSchema = z.object({
  anatomical_location: z.string().optional(),
  location_code: z.string().optional(),
  x_coordinate: z.number().min(0).max(100).optional(),
  y_coordinate: z.number().min(0).max(100).optional(),
  body_view: z.enum(['front', 'back', 'head-front', 'head-back', 'left-side', 'right-side']).optional(),
  lesion_type: z.string().optional(),
  status: z.enum(['monitoring', 'suspicious', 'benign', 'malignant', 'treated', 'resolved']).optional(),
  size_mm: z.number().positive().optional(),
  color: z.string().optional(),
  border: z.string().optional(),
  first_noted_date: z.string().optional(),
  last_examined_date: z.string().optional(),
  biopsy_id: z.string().optional(),
  pathology_result: z.string().optional(),
  notes: z.string().optional(),
});

const observationSchema = z.object({
  observed_date: z.string(),
  size_mm: z.number().positive().optional(),
  photo_id: z.string().optional(),
  notes: z.string().optional(),
});

export const bodyMapRouter = Router();

/**
 * GET /api/patients/:id/lesions
 * Get all lesions for a patient
 */
bodyMapRouter.get('/patients/:id/lesions', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id: patientId } = req.params;

  try {
    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      `select id from patients where id = $1 and tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `select
        id,
        tenant_id,
        patient_id,
        anatomical_location,
        location_code,
        x_coordinate,
        y_coordinate,
        body_view,
        lesion_type,
        status,
        size_mm,
        color,
        border,
        first_noted_date,
        last_examined_date,
        biopsy_id,
        pathology_result,
        notes,
        created_at,
        updated_at
       from patient_lesions
       where tenant_id = $1 and patient_id = $2
       order by created_at desc`,
      [tenantId, patientId]
    );

    await auditLog(tenantId, req.user!.id, 'lesions_view', 'patient', patientId!);

    res.json({ lesions: result.rows });
  } catch (error: any) {
    console.error('Error fetching lesions:', error);
    res.status(500).json({ error: 'Failed to fetch lesions' });
  }
});

/**
 * POST /api/patients/:id/lesions
 * Add a new lesion
 */
bodyMapRouter.post(
  '/patients/:id/lesions',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = lesionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id: patientId } = req.params;
    const data = parsed.data;
    const lesionId = crypto.randomUUID();

    try {
      // Verify patient exists and belongs to tenant
      const patientCheck = await pool.query(
        `select id from patients where id = $1 and tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      await pool.query(
        `insert into patient_lesions (
          id, tenant_id, patient_id, anatomical_location, location_code,
          x_coordinate, y_coordinate, body_view, lesion_type, status,
          size_mm, color, border, first_noted_date, biopsy_id,
          pathology_result, notes
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )`,
        [
          lesionId,
          tenantId,
          data.patient_id,
          data.anatomical_location,
          data.location_code || null,
          data.x_coordinate,
          data.y_coordinate,
          data.body_view,
          data.lesion_type || null,
          data.status,
          data.size_mm || null,
          data.color || null,
          data.border || null,
          data.first_noted_date || new Date().toISOString(),
          data.biopsy_id || null,
          data.pathology_result || null,
          data.notes || null,
        ]
      );

      await auditLog(tenantId, userId, 'lesion_create', 'lesion', lesionId);

      res.status(201).json({ id: lesionId });
    } catch (error: any) {
      console.error('Error creating lesion:', error);
      res.status(500).json({ error: 'Failed to create lesion' });
    }
  }
);

/**
 * PUT /api/patients/:patientId/lesions/:lesionId
 * Update a lesion
 */
bodyMapRouter.put(
  '/patients/:patientId/lesions/:lesionId',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = lesionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { lesionId } = req.params;
    const data = parsed.data;

    try {
      // Verify lesion exists and belongs to tenant
      const lesionCheck = await pool.query(
        `select id from patient_lesions where id = $1 and tenant_id = $2`,
        [lesionId, tenantId]
      );

      if (lesionCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lesion not found' });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.anatomical_location !== undefined) {
        updates.push(`anatomical_location = $${paramCount++}`);
        values.push(data.anatomical_location);
      }
      if (data.location_code !== undefined) {
        updates.push(`location_code = $${paramCount++}`);
        values.push(data.location_code);
      }
      if (data.x_coordinate !== undefined) {
        updates.push(`x_coordinate = $${paramCount++}`);
        values.push(data.x_coordinate);
      }
      if (data.y_coordinate !== undefined) {
        updates.push(`y_coordinate = $${paramCount++}`);
        values.push(data.y_coordinate);
      }
      if (data.body_view !== undefined) {
        updates.push(`body_view = $${paramCount++}`);
        values.push(data.body_view);
      }
      if (data.lesion_type !== undefined) {
        updates.push(`lesion_type = $${paramCount++}`);
        values.push(data.lesion_type);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(data.status);
      }
      if (data.size_mm !== undefined) {
        updates.push(`size_mm = $${paramCount++}`);
        values.push(data.size_mm);
      }
      if (data.color !== undefined) {
        updates.push(`color = $${paramCount++}`);
        values.push(data.color);
      }
      if (data.border !== undefined) {
        updates.push(`border = $${paramCount++}`);
        values.push(data.border);
      }
      if (data.first_noted_date !== undefined) {
        updates.push(`first_noted_date = $${paramCount++}`);
        values.push(data.first_noted_date);
      }
      if (data.last_examined_date !== undefined) {
        updates.push(`last_examined_date = $${paramCount++}`);
        values.push(data.last_examined_date);
      }
      if (data.biopsy_id !== undefined) {
        updates.push(`biopsy_id = $${paramCount++}`);
        values.push(data.biopsy_id);
      }
      if (data.pathology_result !== undefined) {
        updates.push(`pathology_result = $${paramCount++}`);
        values.push(data.pathology_result);
      }
      if (data.notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(data.notes);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add updated_at
      updates.push(`updated_at = NOW()`);

      // Add WHERE clause parameters
      values.push(lesionId, tenantId);

      await pool.query(
        `update patient_lesions
         set ${updates.join(', ')}
         where id = $${paramCount++} and tenant_id = $${paramCount++}`,
        values
      );

      await auditLog(tenantId, userId, 'lesion_update', 'lesion', lesionId!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error updating lesion:', error);
      res.status(500).json({ error: 'Failed to update lesion' });
    }
  }
);

/**
 * DELETE /api/patients/:patientId/lesions/:lesionId
 * Delete a lesion
 */
bodyMapRouter.delete(
  '/patients/:patientId/lesions/:lesionId',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { lesionId } = req.params;

    try {
      const result = await pool.query(
        `delete from patient_lesions
         where id = $1 and tenant_id = $2
         returning id`,
        [lesionId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Lesion not found' });
      }

      await auditLog(tenantId, userId, 'lesion_delete', 'lesion', lesionId!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error deleting lesion:', error);
      res.status(500).json({ error: 'Failed to delete lesion' });
    }
  }
);

/**
 * GET /api/patients/:patientId/lesions/:lesionId/history
 * Get observation history for a lesion
 */
bodyMapRouter.get(
  '/patients/:patientId/lesions/:lesionId/history',
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { lesionId } = req.params;

    try {
      // Verify lesion exists and belongs to tenant
      const lesionCheck = await pool.query(
        `select id from patient_lesions where id = $1 and tenant_id = $2`,
        [lesionId, tenantId]
      );

      if (lesionCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lesion not found' });
      }

      const result = await pool.query(
        `select
          o.id,
          o.lesion_id,
          o.observed_date,
          o.provider_id,
          o.size_mm,
          o.photo_id,
          o.notes,
          o.created_at,
          u.full_name as provider_name
         from lesion_observations o
         left join users u on u.id = o.provider_id
         where o.lesion_id = $1
         order by o.observed_date desc`,
        [lesionId]
      );

      res.json({ observations: result.rows });
    } catch (error: any) {
      console.error('Error fetching lesion history:', error);
      res.status(500).json({ error: 'Failed to fetch lesion history' });
    }
  }
);

/**
 * POST /api/patients/:patientId/lesions/:lesionId/observations
 * Add a new observation to a lesion
 */
bodyMapRouter.post(
  '/patients/:patientId/lesions/:lesionId/observations',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { lesionId } = req.params;
    const data = parsed.data;
    const observationId = crypto.randomUUID();

    try {
      // Verify lesion exists and belongs to tenant
      const lesionCheck = await pool.query(
        `select id from patient_lesions where id = $1 and tenant_id = $2`,
        [lesionId, tenantId]
      );

      if (lesionCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lesion not found' });
      }

      await pool.query(
        `insert into lesion_observations (
          id, lesion_id, observed_date, provider_id, size_mm, photo_id, notes
        ) values (
          $1, $2, $3, $4, $5, $6, $7
        )`,
        [observationId, lesionId, data.observed_date, userId, data.size_mm || null, data.photo_id || null, data.notes || null]
      );

      // Update last_examined_date on the lesion
      await pool.query(
        `update patient_lesions
         set last_examined_date = $1, updated_at = NOW()
         where id = $2`,
        [data.observed_date, lesionId]
      );

      await auditLog(tenantId, userId, 'lesion_observation_create', 'lesion', lesionId!);

      res.status(201).json({ id: observationId });
    } catch (error: any) {
      console.error('Error creating observation:', error);
      res.status(500).json({ error: 'Failed to create observation' });
    }
  }
);
