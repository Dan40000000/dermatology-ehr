/**
 * Biopsy Routes
 * Complete API for biopsy tracking system
 * Critical patient safety feature - comprehensive specimen tracking
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { BiopsyService } from '../services/biopsyService';
import { z } from 'zod';
import {
  emitBiopsyCreated,
  emitBiopsyUpdated,
  emitBiopsyResultReceived,
  emitBiopsyReviewed,
} from '../websocket/emitter';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const createBiopsySchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional().nullable(),
  lesion_id: z.string().uuid().optional().nullable(),
  specimen_type: z.enum(['punch', 'shave', 'excisional', 'incisional']),
  specimen_size: z.string().optional(),
  body_location: z.string(),
  body_location_code: z.string().optional(),
  location_laterality: z.enum(['left', 'right', 'bilateral', 'midline']).optional(),
  location_details: z.string().optional(),
  clinical_description: z.string().optional(),
  clinical_history: z.string().optional(),
  differential_diagnoses: z.array(z.string()).optional(),
  indication: z.string().optional(),
  ordering_provider_id: z.string().uuid(),
  path_lab: z.string(),
  path_lab_id: z.string().uuid().optional().nullable(),
  special_stains: z.array(z.string()).optional(),
  send_for_cultures: z.boolean().optional(),
  send_for_immunofluorescence: z.boolean().optional(),
  send_for_molecular_testing: z.boolean().optional(),
  special_instructions: z.string().optional(),
  procedure_code: z.string().optional()
});

const updateBiopsySchema = z.object({
  status: z.enum(['ordered', 'collected', 'sent', 'received_by_lab', 'processing', 'resulted', 'reviewed', 'closed']).optional(),
  collected_at: z.string().optional(),
  sent_at: z.string().optional(),
  received_by_lab_at: z.string().optional(),
  path_lab_case_number: z.string().optional(),
  clinical_description: z.string().optional(),
  special_instructions: z.string().optional()
});

const addResultSchema = z.object({
  pathology_diagnosis: z.string(),
  pathology_report: z.string().optional(),
  pathology_gross_description: z.string().optional(),
  pathology_microscopic_description: z.string().optional(),
  pathology_comment: z.string().optional(),
  malignancy_type: z.string().optional().nullable(),
  malignancy_subtype: z.string().optional(),
  margins: z.enum(['clear', 'involved', 'close', 'cannot_assess']).optional(),
  margin_distance_mm: z.number().optional(),
  margin_details: z.string().optional(),
  breslow_depth_mm: z.number().optional(),
  clark_level: z.string().optional(),
  mitotic_rate: z.number().optional(),
  ulceration: z.boolean().optional(),
  sentinel_node_indicated: z.boolean().optional(),
  diagnosis_code: z.string().optional(),
  diagnosis_description: z.string().optional(),
  snomed_code: z.string().optional(),
  path_lab_case_number: z.string().optional()
});

const reviewBiopsySchema = z.object({
  follow_up_action: z.enum(['none', 'reexcision', 'mohs', 'dermatology_followup', 'oncology_referral', 'monitoring']).optional(),
  follow_up_interval: z.string().optional(),
  follow_up_notes: z.string().optional(),
  reexcision_required: z.boolean().optional(),
  patient_notification_notes: z.string().optional()
});

/**
 * POST /api/biopsies
 * Create new biopsy order
 */
router.post('/', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const validatedData = createBiopsySchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Validate biopsy data
    const validation = BiopsyService.validateBiopsyData(validatedData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    await client.query('BEGIN');

    // Generate unique specimen ID
    const specimenId = await BiopsyService.generateSpecimenId({ tenantId });

    // Create biopsy
    const insertQuery = `
      INSERT INTO biopsies (
        tenant_id,
        patient_id,
        encounter_id,
        lesion_id,
        specimen_id,
        specimen_type,
        specimen_size,
        body_location,
        body_location_code,
        location_laterality,
        location_details,
        clinical_description,
        clinical_history,
        differential_diagnoses,
        indication,
        ordering_provider_id,
        path_lab,
        path_lab_id,
        special_stains,
        send_for_cultures,
        send_for_immunofluorescence,
        send_for_molecular_testing,
        special_instructions,
        procedure_code,
        status,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26
      )
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.patient_id,
      validatedData.encounter_id || null,
      validatedData.lesion_id || null,
      specimenId,
      validatedData.specimen_type,
      validatedData.specimen_size || null,
      validatedData.body_location,
      validatedData.body_location_code || null,
      validatedData.location_laterality || null,
      validatedData.location_details || null,
      validatedData.clinical_description || null,
      validatedData.clinical_history || null,
      validatedData.differential_diagnoses || null,
      validatedData.indication || null,
      validatedData.ordering_provider_id,
      validatedData.path_lab,
      validatedData.path_lab_id || null,
      validatedData.special_stains || null,
      validatedData.send_for_cultures || false,
      validatedData.send_for_immunofluorescence || false,
      validatedData.send_for_molecular_testing || false,
      validatedData.special_instructions || null,
      validatedData.procedure_code || null,
      'ordered',
      userId
    ]);

    const biopsy = result.rows[0];

    // If linked to lesion, update lesion status
    if (validatedData.lesion_id) {
      await BiopsyService.updateLesionStatusForBiopsy(validatedData.lesion_id, biopsy.id);
    }

    // Track initial specimen event
    await BiopsyService.trackSpecimen({
      biopsyId: biopsy.id,
      eventType: 'ordered',
      eventBy: userId,
      notes: 'Biopsy order created'
    });

    await client.query('COMMIT');

    logger.info('Biopsy created', {
      biopsyId: biopsy.id,
      specimenId,
      patientId: validatedData.patient_id,
      userId
    });

    res.status(201).json(biopsy);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error creating biopsy', { error: error.message, stack: error.stack });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to create biopsy' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/biopsies
 * List all biopsies with filtering
 */
router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const {
      patient_id,
      encounter_id,
      status,
      ordering_provider_id,
      is_overdue,
      malignancy_type,
      from_date,
      to_date,
      limit = '100',
      offset = '0'
    } = req.query;

    const tenantId = req.user!.tenantId;

    let query = `
      SELECT
        b.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.date_of_birth,
        ordering_pr.first_name || ' ' || ordering_pr.last_name as ordering_provider_name,
        reviewing_pr.first_name || ' ' || reviewing_pr.last_name as reviewing_provider_name,
        EXTRACT(DAY FROM (NOW() - b.sent_at))::INTEGER as days_since_sent,
        (SELECT COUNT(*) FROM biopsy_alerts ba WHERE ba.biopsy_id = b.id AND ba.status = 'active') as active_alert_count
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers ordering_pr ON b.ordering_provider_id = ordering_pr.id
      LEFT JOIN providers reviewing_pr ON b.reviewing_provider_id = reviewing_pr.id
      WHERE b.tenant_id = $1
        AND b.deleted_at IS NULL
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND b.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (encounter_id) {
      query += ` AND b.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (ordering_provider_id) {
      query += ` AND b.ordering_provider_id = $${paramIndex}`;
      params.push(ordering_provider_id);
      paramIndex++;
    }

    if (is_overdue === 'true') {
      query += ` AND b.is_overdue = true`;
    }

    if (malignancy_type) {
      query += ` AND b.malignancy_type = $${paramIndex}`;
      params.push(malignancy_type);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND b.ordered_at >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND b.ordered_at <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY b.ordered_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    res.json({
      biopsies: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error: any) {
    logger.error('Error fetching biopsies', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch biopsies' });
  }
});

/**
 * GET /api/biopsies/pending
 * Get biopsies pending review (critical workflow)
 */
router.get('/pending', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.query.provider_id as string | undefined;

    const biopsies = await BiopsyService.getPendingReviewBiopsies(tenantId, providerId);

    res.json({ biopsies });
  } catch (error: any) {
    logger.error('Error fetching pending biopsies', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch pending biopsies' });
  }
});

/**
 * GET /api/biopsies/overdue
 * Get overdue biopsies (patient safety critical)
 */
router.get('/overdue', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const biopsies = await BiopsyService.getOverdueBiopsies(tenantId);

    res.json({ biopsies });
  } catch (error: any) {
    logger.error('Error fetching overdue biopsies', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch overdue biopsies' });
  }
});

/**
 * GET /api/biopsies/stats
 * Get biopsy statistics for dashboard
 */
router.get('/stats', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.query.provider_id as string | undefined;

    const stats = await BiopsyService.getBiopsyStats(tenantId, providerId);

    res.json(stats);
  } catch (error: any) {
    logger.error('Error fetching biopsy stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch biopsy statistics' });
  }
});

/**
 * GET /api/biopsies/quality-metrics
 * Get quality metrics for reporting
 */
router.get('/quality-metrics', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date as string) : undefined;
    const endDate = end_date ? new Date(end_date as string) : undefined;

    const metrics = await BiopsyService.getQualityMetrics(tenantId, startDate, endDate);

    res.json(metrics);
  } catch (error: any) {
    logger.error('Error fetching quality metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch quality metrics' });
  }
});

/**
 * GET /api/biopsies/:id
 * Get single biopsy with full details
 */
router.get('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const query = `
      SELECT
        b.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.date_of_birth,
        p.phone as patient_phone,
        p.email as patient_email,
        ordering_pr.first_name || ' ' || ordering_pr.last_name as ordering_provider_name,
        reviewing_pr.first_name || ' ' || reviewing_pr.last_name as reviewing_provider_name,
        collecting_pr.first_name || ' ' || collecting_pr.last_name as collecting_provider_name,
        EXTRACT(DAY FROM (NOW() - b.sent_at))::INTEGER as days_since_sent,
        (
          SELECT json_agg(
            json_build_object(
              'id', ba.id,
              'alert_type', ba.alert_type,
              'severity', ba.severity,
              'title', ba.title,
              'message', ba.message,
              'status', ba.status,
              'created_at', ba.created_at
            ) ORDER BY ba.created_at DESC
          )
          FROM biopsy_alerts ba
          WHERE ba.biopsy_id = b.id
        ) as alerts,
        (
          SELECT json_agg(
            json_build_object(
              'id', bst.id,
              'event_type', bst.event_type,
              'event_timestamp', bst.event_timestamp,
              'location', bst.location,
              'custody_person', bst.custody_person,
              'notes', bst.notes
            ) ORDER BY bst.event_timestamp DESC
          )
          FROM biopsy_specimen_tracking bst
          WHERE bst.biopsy_id = b.id
        ) as specimen_tracking,
        (
          SELECT json_agg(
            json_build_object(
              'old_status', bsh.old_status,
              'new_status', bsh.new_status,
              'changed_at', bsh.changed_at,
              'notes', bsh.notes
            ) ORDER BY bsh.changed_at DESC
          )
          FROM biopsy_status_history bsh
          WHERE bsh.biopsy_id = b.id
        ) as status_history
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers ordering_pr ON b.ordering_provider_id = ordering_pr.id
      LEFT JOIN providers reviewing_pr ON b.reviewing_provider_id = reviewing_pr.id
      LEFT JOIN providers collecting_pr ON b.collecting_provider_id = collecting_pr.id
      WHERE b.id = $1
        AND b.tenant_id = $2
        AND b.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Biopsy not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching biopsy', { error: error.message, biopsyId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch biopsy' });
  }
});

/**
 * PUT /api/biopsies/:id
 * Update biopsy details
 */
router.put('/:id', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const validatedData = updateBiopsySchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    await client.query('BEGIN');

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id, tenantId);

    const query = `
      UPDATE biopsies
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
        AND tenant_id = $${paramIndex + 1}
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Biopsy not found' });
    }

    // Track specimen event if status changed
    if (validatedData.status) {
      await BiopsyService.trackSpecimen({
        biopsyId: id!,
        eventType: validatedData.status,
        eventBy: userId,
        notes: `Status updated to ${validatedData.status}`
      });
    }

    await client.query('COMMIT');

    logger.info('Biopsy updated', { biopsyId: id, userId, updates: Object.keys(validatedData) });

    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error updating biopsy', { error: error.message, biopsyId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to update biopsy' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/biopsies/:id/result
 * Add pathology result to biopsy
 */
router.post('/:id/result', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const validatedData = addResultSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    await client.query('BEGIN');

    const query = `
      UPDATE biopsies
      SET
        pathology_diagnosis = $1,
        pathology_report = $2,
        pathology_gross_description = $3,
        pathology_microscopic_description = $4,
        pathology_comment = $5,
        malignancy_type = $6,
        malignancy_subtype = $7,
        margins = $8,
        margin_distance_mm = $9,
        margin_details = $10,
        breslow_depth_mm = $11,
        clark_level = $12,
        mitotic_rate = $13,
        ulceration = $14,
        sentinel_node_indicated = $15,
        diagnosis_code = $16,
        diagnosis_description = $17,
        snomed_code = $18,
        path_lab_case_number = COALESCE($19, path_lab_case_number),
        status = 'resulted',
        resulted_at = NOW(),
        updated_at = NOW()
      WHERE id = $20
        AND tenant_id = $21
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await client.query(query, [
      validatedData.pathology_diagnosis,
      validatedData.pathology_report || null,
      validatedData.pathology_gross_description || null,
      validatedData.pathology_microscopic_description || null,
      validatedData.pathology_comment || null,
      validatedData.malignancy_type || null,
      validatedData.malignancy_subtype || null,
      validatedData.margins || null,
      validatedData.margin_distance_mm || null,
      validatedData.margin_details || null,
      validatedData.breslow_depth_mm || null,
      validatedData.clark_level || null,
      validatedData.mitotic_rate || null,
      validatedData.ulceration || null,
      validatedData.sentinel_node_indicated || null,
      validatedData.diagnosis_code || null,
      validatedData.diagnosis_description || null,
      validatedData.snomed_code || null,
      validatedData.path_lab_case_number || null,
      id,
      tenantId
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Biopsy not found' });
    }

    const biopsy = result.rows[0];

    // Track specimen event
    await BiopsyService.trackSpecimen({
      biopsyId: id!,
      eventType: 'resulted',
      eventBy: userId,
      notes: 'Pathology result added'
    });

    // If linked to lesion, create lesion event (trigger auto-updates lesion status/diagnosis)
    if (biopsy.lesion_id) {
      await client.query(
        `INSERT INTO lesion_events (
          id, tenant_id, lesion_id, event_type, provider_id, description
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          require('crypto').randomUUID(),
          tenantId,
          biopsy.lesion_id,
          'biopsy_resulted',
          userId,
          `Pathology result: ${validatedData.pathology_diagnosis}`
        ]
      );
    }

    // Send notification to ordering provider
    await BiopsyService.sendNotification({
      biopsyId: id!,
      tenantId,
      type: 'result_available',
      recipientType: 'provider'
    });

    // Send malignancy notification if applicable
    if (validatedData.malignancy_type) {
      await BiopsyService.sendNotification({
        biopsyId: id!,
        tenantId,
        type: 'malignancy',
        recipientType: 'provider'
      });
    }

    await client.query('COMMIT');

    logger.info('Biopsy result added - lesion auto-updated via trigger', {
      biopsyId: id,
      lesionId: biopsy.lesion_id,
      malignancyType: validatedData.malignancy_type,
      userId
    });

    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error adding biopsy result', { error: error.message, biopsyId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to add biopsy result' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/biopsies/:id/review
 * Provider review and sign-off
 */
router.post('/:id/review', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const validatedData = reviewBiopsySchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    await client.query('BEGIN');

    const query = `
      UPDATE biopsies
      SET
        follow_up_action = $1,
        follow_up_interval = $2,
        follow_up_notes = $3,
        reexcision_required = $4,
        patient_notification_notes = $5,
        status = 'reviewed',
        reviewed_at = NOW(),
        reviewing_provider_id = $6,
        updated_at = NOW()
      WHERE id = $7
        AND tenant_id = $8
        AND status = 'resulted'
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await client.query(query, [
      validatedData.follow_up_action || 'none',
      validatedData.follow_up_interval || null,
      validatedData.follow_up_notes || null,
      validatedData.reexcision_required || false,
      validatedData.patient_notification_notes || null,
      userId,
      id,
      tenantId
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Biopsy not found or not in resulted status' });
    }

    // Create review checklist
    await client.query(
      `INSERT INTO biopsy_review_checklists (
        biopsy_id,
        reviewed_by,
        pathology_report_reviewed,
        diagnosis_coded,
        review_completed,
        review_completed_at
      ) VALUES ($1, $2, true, true, true, NOW())`,
      [id, userId]
    );

    // Track review event
    await BiopsyService.trackSpecimen({
      biopsyId: id!,
      eventType: 'reviewed',
      eventBy: userId,
      notes: 'Pathology result reviewed and signed off'
    });

    await client.query('COMMIT');

    logger.info('Biopsy reviewed', {
      biopsyId: id,
      reviewedBy: userId,
      followUpAction: validatedData.follow_up_action
    });

    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error reviewing biopsy', { error: error.message, biopsyId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to review biopsy' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/biopsies/:id/notify-patient
 * Mark patient as notified
 */
router.post('/:id/notify-patient', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { method, notes } = req.body;
    const tenantId = req.user!.tenantId;

    const query = `
      UPDATE biopsies
      SET
        patient_notified = true,
        patient_notified_at = NOW(),
        patient_notified_method = $1,
        patient_notification_notes = $2,
        updated_at = NOW()
      WHERE id = $3
        AND tenant_id = $4
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [method, notes || null, id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Biopsy not found' });
    }

    logger.info('Patient notified of biopsy result', {
      biopsyId: id,
      method,
      userId: req.user!.id
    });

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error notifying patient', { error: error.message, biopsyId: req.params.id });
    res.status(500).json({ error: 'Failed to mark patient as notified' });
  }
});

/**
 * GET /api/biopsies/:id/alerts
 * Get all alerts for a biopsy
 */
router.get('/:id/alerts', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const query = `
      SELECT
        ba.*,
        ack_user.first_name || ' ' || ack_user.last_name as acknowledged_by_name,
        res_user.first_name || ' ' || res_user.last_name as resolved_by_name
      FROM biopsy_alerts ba
      LEFT JOIN users ack_user ON ba.acknowledged_by = ack_user.id
      LEFT JOIN users res_user ON ba.resolved_by = res_user.id
      WHERE ba.biopsy_id = $1
        AND ba.tenant_id = $2
      ORDER BY ba.created_at DESC
    `;

    const result = await pool.query(query, [id, tenantId]);

    res.json({ alerts: result.rows });
  } catch (error: any) {
    logger.error('Error fetching biopsy alerts', { error: error.message, biopsyId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * GET /api/biopsies/export/log
 * Export biopsy log to CSV
 */
router.get('/export/log', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { start_date, end_date, provider_id } = req.query;

    const filters: any = {};
    if (start_date) filters.startDate = new Date(start_date as string);
    if (end_date) filters.endDate = new Date(end_date as string);
    if (provider_id) filters.providerId = provider_id;

    const biopsies = await BiopsyService.exportBiopsyLog(tenantId, filters);

    // Convert to CSV
    const headers = [
      'Specimen ID',
      'Ordered Date',
      'Patient MRN',
      'Patient Name',
      'DOB',
      'Location',
      'Specimen Type',
      'Status',
      'Diagnosis',
      'Malignancy',
      'ICD-10',
      'Margins',
      'Follow-up',
      'Ordering Provider',
      'Path Lab',
      'Turnaround Days',
      'Patient Notified'
    ];

    const csvRows = [headers.join(',')];

    biopsies.forEach((biopsy: any) => {
      const row = [
        biopsy.specimen_id,
        biopsy.ordered_at,
        biopsy.mrn,
        `"${biopsy.patient_name}"`,
        biopsy.date_of_birth,
        `"${biopsy.body_location}"`,
        biopsy.specimen_type,
        biopsy.status,
        `"${biopsy.pathology_diagnosis || ''}"`,
        biopsy.malignancy_type || '',
        biopsy.diagnosis_code || '',
        biopsy.margins || '',
        biopsy.follow_up_action || '',
        `"${biopsy.ordering_provider}"`,
        `"${biopsy.path_lab}"`,
        biopsy.turnaround_time_days || '',
        biopsy.patient_notified ? 'Yes' : 'No'
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=biopsy-log.csv');
    res.send(csv);
  } catch (error: any) {
    logger.error('Error exporting biopsy log', { error: error.message });
    res.status(500).json({ error: 'Failed to export biopsy log' });
  }
});

export default router;
