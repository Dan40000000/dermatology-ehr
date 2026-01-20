import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';

const router = Router();

/**
 * Body Map Markers Routes
 *
 * Comprehensive tracking of procedures, treatments, and conditions on body diagrams
 */

// Schemas
const createBodyMapMarkerSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  marker_type: z.enum(['lesion', 'procedure', 'condition', 'cosmetic', 'wound']),
  sub_type: z.string().optional(),
  body_region: z.string(),
  x_position: z.number().min(0).max(100).optional(),
  y_position: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  clinical_notes: z.string().optional(),
  status: z.enum(['active', 'resolved', 'healed', 'removed']).default('active'),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  size_mm: z.number().positive().optional(),
  date_identified: z.string().optional(),
  date_resolved: z.string().optional(),
});

const updateBodyMapMarkerSchema = z.object({
  marker_type: z.enum(['lesion', 'procedure', 'condition', 'cosmetic', 'wound']).optional(),
  sub_type: z.string().optional(),
  body_region: z.string().optional(),
  x_position: z.number().min(0).max(100).optional(),
  y_position: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  clinical_notes: z.string().optional(),
  status: z.enum(['active', 'resolved', 'healed', 'removed']).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  size_mm: z.number().positive().optional(),
  date_identified: z.string().optional(),
  date_resolved: z.string().optional(),
});

const createProcedureSiteSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  body_map_marker_id: z.string().uuid().optional(),
  procedure_type: z.enum([
    'biopsy_shave', 'biopsy_punch', 'excision', 'mohs',
    'cryotherapy', 'laser', 'injection', 'other'
  ]),
  body_region: z.string(),
  x_position: z.number().min(0).max(100).optional(),
  y_position: z.number().min(0).max(100).optional(),
  procedure_date: z.string(),
  performed_by: z.string().uuid().optional(),
  clinical_indication: z.string().optional(),
  procedure_notes: z.string().optional(),
  pathology_status: z.enum(['pending', 'benign', 'malignant', 'inconclusive', 'not_sent']).default('pending'),
  pathology_result: z.string().optional(),
  pathology_date: z.string().optional(),
  sutures_count: z.number().int().positive().optional(),
  suture_type: z.string().optional(),
  follow_up_needed: z.boolean().default(false),
  follow_up_date: z.string().optional(),
  follow_up_notes: z.string().optional(),
  complications: z.string().optional(),
  healing_status: z.enum(['normal', 'delayed', 'infected', 'dehiscence']).optional(),
});

const updateProcedureSiteSchema = z.object({
  body_map_marker_id: z.string().uuid().optional(),
  procedure_type: z.enum([
    'biopsy_shave', 'biopsy_punch', 'excision', 'mohs',
    'cryotherapy', 'laser', 'injection', 'other'
  ]).optional(),
  body_region: z.string().optional(),
  x_position: z.number().min(0).max(100).optional(),
  y_position: z.number().min(0).max(100).optional(),
  procedure_date: z.string().optional(),
  performed_by: z.string().uuid().optional(),
  clinical_indication: z.string().optional(),
  procedure_notes: z.string().optional(),
  pathology_status: z.enum(['pending', 'benign', 'malignant', 'inconclusive', 'not_sent']).optional(),
  pathology_result: z.string().optional(),
  pathology_date: z.string().optional(),
  sutures_count: z.number().int().positive().optional(),
  suture_type: z.string().optional(),
  follow_up_needed: z.boolean().optional(),
  follow_up_date: z.string().optional(),
  follow_up_notes: z.string().optional(),
  complications: z.string().optional(),
  healing_status: z.enum(['normal', 'delayed', 'infected', 'dehiscence']).optional(),
});

// ==================== Body Map Markers CRUD ====================

/**
 * GET /api/body-map-markers
 * List body map markers with optional filtering
 */
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patient_id, encounter_id, marker_type, status } = req.query;

    let query = `
      select
        id,
        tenant_id,
        patient_id,
        encounter_id,
        marker_type,
        sub_type,
        body_region,
        x_position,
        y_position,
        description,
        clinical_notes,
        status,
        severity,
        size_mm,
        date_identified,
        date_resolved,
        created_at,
        updated_at,
        created_by
      from body_map_markers
      where tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramCount = 2;

    if (patient_id) {
      query += ` and patient_id = $${paramCount++}`;
      params.push(patient_id);
    }

    if (encounter_id) {
      query += ` and encounter_id = $${paramCount++}`;
      params.push(encounter_id);
    }

    if (marker_type) {
      query += ` and marker_type = $${paramCount++}`;
      params.push(marker_type);
    }

    if (status) {
      query += ` and status = $${paramCount++}`;
      params.push(status);
    }

    query += ` order by created_at desc`;

    const result = await pool.query(query, params);

    res.json({ markers: result.rows });
  } catch (error: any) {
    console.error('Error fetching body map markers:', error);
    res.status(500).json({ error: 'Failed to fetch body map markers' });
  }
});

/**
 * GET /api/body-map-markers/:id
 * Get a specific body map marker
 */
router.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `select * from body_map_markers where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Body map marker not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching body map marker:', error);
    res.status(500).json({ error: 'Failed to fetch body map marker' });
  }
});

/**
 * POST /api/body-map-markers
 * Create a new body map marker
 */
router.post(
  '/',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = createBodyMapMarkerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const data = parsed.data;
    const markerId = crypto.randomUUID();

    try {
      // Verify patient exists and belongs to tenant
      const patientCheck = await pool.query(
        `select id from patients where id = $1 and tenant_id = $2`,
        [data.patient_id, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Verify encounter if provided
      if (data.encounter_id) {
        const encounterCheck = await pool.query(
          `select id from encounters where id = $1 and tenant_id = $2`,
          [data.encounter_id, tenantId]
        );

        if (encounterCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Encounter not found' });
        }
      }

      await pool.query(
        `insert into body_map_markers (
          id, tenant_id, patient_id, encounter_id, marker_type, sub_type,
          body_region, x_position, y_position, description, clinical_notes,
          status, severity, size_mm, date_identified, date_resolved, created_by
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )`,
        [
          markerId,
          tenantId,
          data.patient_id,
          data.encounter_id || null,
          data.marker_type,
          data.sub_type || null,
          data.body_region,
          data.x_position || null,
          data.y_position || null,
          data.description || null,
          data.clinical_notes || null,
          data.status,
          data.severity || null,
          data.size_mm || null,
          data.date_identified || new Date().toISOString().split('T')[0],
          data.date_resolved || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, 'body_map_marker_create', 'body_map_marker', markerId);

      res.status(201).json({ id: markerId });
    } catch (error: any) {
      console.error('Error creating body map marker:', error);
      res.status(500).json({ error: 'Failed to create body map marker' });
    }
  }
);

/**
 * PUT /api/body-map-markers/:id
 * Update a body map marker
 */
router.put(
  '/:id',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = updateBodyMapMarkerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const data = parsed.data;

    try {
      // Verify marker exists and belongs to tenant
      const markerCheck = await pool.query(
        `select id from body_map_markers where id = $1 and tenant_id = $2`,
        [id, tenantId]
      );

      if (markerCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Body map marker not found' });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.marker_type !== undefined) {
        updates.push(`marker_type = $${paramCount++}`);
        values.push(data.marker_type);
      }
      if (data.sub_type !== undefined) {
        updates.push(`sub_type = $${paramCount++}`);
        values.push(data.sub_type);
      }
      if (data.body_region !== undefined) {
        updates.push(`body_region = $${paramCount++}`);
        values.push(data.body_region);
      }
      if (data.x_position !== undefined) {
        updates.push(`x_position = $${paramCount++}`);
        values.push(data.x_position);
      }
      if (data.y_position !== undefined) {
        updates.push(`y_position = $${paramCount++}`);
        values.push(data.y_position);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(data.description);
      }
      if (data.clinical_notes !== undefined) {
        updates.push(`clinical_notes = $${paramCount++}`);
        values.push(data.clinical_notes);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(data.status);
      }
      if (data.severity !== undefined) {
        updates.push(`severity = $${paramCount++}`);
        values.push(data.severity);
      }
      if (data.size_mm !== undefined) {
        updates.push(`size_mm = $${paramCount++}`);
        values.push(data.size_mm);
      }
      if (data.date_identified !== undefined) {
        updates.push(`date_identified = $${paramCount++}`);
        values.push(data.date_identified);
      }
      if (data.date_resolved !== undefined) {
        updates.push(`date_resolved = $${paramCount++}`);
        values.push(data.date_resolved);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add updated_at
      updates.push(`updated_at = NOW()`);

      // Add WHERE clause parameters
      values.push(id, tenantId);

      await pool.query(
        `update body_map_markers
         set ${updates.join(', ')}
         where id = $${paramCount++} and tenant_id = $${paramCount++}`,
        values
      );

      await auditLog(tenantId, userId, 'body_map_marker_update', 'body_map_marker', id!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error updating body map marker:', error);
      res.status(500).json({ error: 'Failed to update body map marker' });
    }
  }
);

/**
 * DELETE /api/body-map-markers/:id
 * Delete a body map marker
 */
router.delete(
  '/:id',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const result = await pool.query(
        `delete from body_map_markers
         where id = $1 and tenant_id = $2
         returning id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Body map marker not found' });
      }

      await auditLog(tenantId, userId, 'body_map_marker_delete', 'body_map_marker', id!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error deleting body map marker:', error);
      res.status(500).json({ error: 'Failed to delete body map marker' });
    }
  }
);

// ==================== Procedure Sites CRUD ====================

/**
 * GET /api/procedure-sites
 * List procedure sites with optional filtering
 */
router.get('/procedure-sites', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patient_id, encounter_id, procedure_type, pathology_status } = req.query;

    let query = `
      select
        ps.*,
        u.full_name as performed_by_name,
        p.first_name || ' ' || p.last_name as patient_name
      from procedure_sites ps
      left join users u on u.id = ps.performed_by
      left join patients p on p.id = ps.patient_id
      where ps.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramCount = 2;

    if (patient_id) {
      query += ` and ps.patient_id = $${paramCount++}`;
      params.push(patient_id);
    }

    if (encounter_id) {
      query += ` and ps.encounter_id = $${paramCount++}`;
      params.push(encounter_id);
    }

    if (procedure_type) {
      query += ` and ps.procedure_type = $${paramCount++}`;
      params.push(procedure_type);
    }

    if (pathology_status) {
      query += ` and ps.pathology_status = $${paramCount++}`;
      params.push(pathology_status);
    }

    query += ` order by ps.procedure_date desc, ps.created_at desc`;

    const result = await pool.query(query, params);

    res.json({ procedure_sites: result.rows });
  } catch (error: any) {
    console.error('Error fetching procedure sites:', error);
    res.status(500).json({ error: 'Failed to fetch procedure sites' });
  }
});

/**
 * GET /api/procedure-sites/:id
 * Get a specific procedure site
 */
router.get('/procedure-sites/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `select
        ps.*,
        u.full_name as performed_by_name,
        p.first_name || ' ' || p.last_name as patient_name
       from procedure_sites ps
       left join users u on u.id = ps.performed_by
       left join patients p on p.id = ps.patient_id
       where ps.id = $1 and ps.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Procedure site not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching procedure site:', error);
    res.status(500).json({ error: 'Failed to fetch procedure site' });
  }
});

/**
 * POST /api/procedure-sites
 * Create a new procedure site
 */
router.post(
  '/procedure-sites',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = createProcedureSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const data = parsed.data;
    const siteId = crypto.randomUUID();

    try {
      // Verify patient exists and belongs to tenant
      const patientCheck = await pool.query(
        `select id from patients where id = $1 and tenant_id = $2`,
        [data.patient_id, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Verify encounter if provided
      if (data.encounter_id) {
        const encounterCheck = await pool.query(
          `select id from encounters where id = $1 and tenant_id = $2`,
          [data.encounter_id, tenantId]
        );

        if (encounterCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Encounter not found' });
        }
      }

      // Verify body_map_marker if provided
      if (data.body_map_marker_id) {
        const markerCheck = await pool.query(
          `select id from body_map_markers where id = $1 and tenant_id = $2`,
          [data.body_map_marker_id, tenantId]
        );

        if (markerCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Body map marker not found' });
        }
      }

      await pool.query(
        `insert into procedure_sites (
          id, tenant_id, patient_id, encounter_id, body_map_marker_id,
          procedure_type, body_region, x_position, y_position, procedure_date,
          performed_by, clinical_indication, procedure_notes, pathology_status,
          pathology_result, pathology_date, sutures_count, suture_type,
          follow_up_needed, follow_up_date, follow_up_notes, complications,
          healing_status, created_by
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )`,
        [
          siteId,
          tenantId,
          data.patient_id,
          data.encounter_id || null,
          data.body_map_marker_id || null,
          data.procedure_type,
          data.body_region,
          data.x_position || null,
          data.y_position || null,
          data.procedure_date,
          data.performed_by || userId,
          data.clinical_indication || null,
          data.procedure_notes || null,
          data.pathology_status,
          data.pathology_result || null,
          data.pathology_date || null,
          data.sutures_count || null,
          data.suture_type || null,
          data.follow_up_needed,
          data.follow_up_date || null,
          data.follow_up_notes || null,
          data.complications || null,
          data.healing_status || null,
          userId,
        ]
      );

      await auditLog(tenantId, userId, 'procedure_site_create', 'procedure_site', siteId);

      res.status(201).json({ id: siteId });
    } catch (error: any) {
      console.error('Error creating procedure site:', error);
      res.status(500).json({ error: 'Failed to create procedure site' });
    }
  }
);

/**
 * PUT /api/procedure-sites/:id
 * Update a procedure site
 */
router.put(
  '/procedure-sites/:id',
  requireAuth,
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = updateProcedureSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const data = parsed.data;

    try {
      // Verify site exists and belongs to tenant
      const siteCheck = await pool.query(
        `select id from procedure_sites where id = $1 and tenant_id = $2`,
        [id, tenantId]
      );

      if (siteCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Procedure site not found' });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.body_map_marker_id !== undefined) {
        updates.push(`body_map_marker_id = $${paramCount++}`);
        values.push(data.body_map_marker_id);
      }
      if (data.procedure_type !== undefined) {
        updates.push(`procedure_type = $${paramCount++}`);
        values.push(data.procedure_type);
      }
      if (data.body_region !== undefined) {
        updates.push(`body_region = $${paramCount++}`);
        values.push(data.body_region);
      }
      if (data.x_position !== undefined) {
        updates.push(`x_position = $${paramCount++}`);
        values.push(data.x_position);
      }
      if (data.y_position !== undefined) {
        updates.push(`y_position = $${paramCount++}`);
        values.push(data.y_position);
      }
      if (data.procedure_date !== undefined) {
        updates.push(`procedure_date = $${paramCount++}`);
        values.push(data.procedure_date);
      }
      if (data.performed_by !== undefined) {
        updates.push(`performed_by = $${paramCount++}`);
        values.push(data.performed_by);
      }
      if (data.clinical_indication !== undefined) {
        updates.push(`clinical_indication = $${paramCount++}`);
        values.push(data.clinical_indication);
      }
      if (data.procedure_notes !== undefined) {
        updates.push(`procedure_notes = $${paramCount++}`);
        values.push(data.procedure_notes);
      }
      if (data.pathology_status !== undefined) {
        updates.push(`pathology_status = $${paramCount++}`);
        values.push(data.pathology_status);
      }
      if (data.pathology_result !== undefined) {
        updates.push(`pathology_result = $${paramCount++}`);
        values.push(data.pathology_result);
      }
      if (data.pathology_date !== undefined) {
        updates.push(`pathology_date = $${paramCount++}`);
        values.push(data.pathology_date);
      }
      if (data.sutures_count !== undefined) {
        updates.push(`sutures_count = $${paramCount++}`);
        values.push(data.sutures_count);
      }
      if (data.suture_type !== undefined) {
        updates.push(`suture_type = $${paramCount++}`);
        values.push(data.suture_type);
      }
      if (data.follow_up_needed !== undefined) {
        updates.push(`follow_up_needed = $${paramCount++}`);
        values.push(data.follow_up_needed);
      }
      if (data.follow_up_date !== undefined) {
        updates.push(`follow_up_date = $${paramCount++}`);
        values.push(data.follow_up_date);
      }
      if (data.follow_up_notes !== undefined) {
        updates.push(`follow_up_notes = $${paramCount++}`);
        values.push(data.follow_up_notes);
      }
      if (data.complications !== undefined) {
        updates.push(`complications = $${paramCount++}`);
        values.push(data.complications);
      }
      if (data.healing_status !== undefined) {
        updates.push(`healing_status = $${paramCount++}`);
        values.push(data.healing_status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add updated_at
      updates.push(`updated_at = NOW()`);

      // Add WHERE clause parameters
      values.push(id, tenantId);

      await pool.query(
        `update procedure_sites
         set ${updates.join(', ')}
         where id = $${paramCount++} and tenant_id = $${paramCount++}`,
        values
      );

      await auditLog(tenantId, userId, 'procedure_site_update', 'procedure_site', id!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error updating procedure site:', error);
      res.status(500).json({ error: 'Failed to update procedure site' });
    }
  }
);

/**
 * DELETE /api/procedure-sites/:id
 * Delete a procedure site
 */
router.delete(
  '/procedure-sites/:id',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const result = await pool.query(
        `delete from procedure_sites
         where id = $1 and tenant_id = $2
         returning id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Procedure site not found' });
      }

      await auditLog(tenantId, userId, 'procedure_site_delete', 'procedure_site', id!);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error deleting procedure site:', error);
      res.status(500).json({ error: 'Failed to delete procedure site' });
    }
  }
);

export const bodyMapMarkersRouter = router;
