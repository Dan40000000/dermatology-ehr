/**
 * Mohs Micrographic Surgery Routes
 * Complete API for Mohs surgery workflow
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { MohsService, TumorData, StageData, MarginData, ClosureData } from '../services/mohsService';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createCaseSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional().nullable(),
  surgeon_id: z.string().uuid(),
  tumor_location: z.string().min(1),
  tumor_location_code: z.string().optional(),
  tumor_laterality: z.enum(['left', 'right', 'midline', 'bilateral']).optional(),
  tumor_type: z.string().min(1),
  tumor_subtype: z.string().optional(),
  tumor_histology: z.string().optional(),
  clinical_description: z.string().optional(),
  pre_op_size_mm: z.number().optional(),
  pre_op_width_mm: z.number().optional(),
  pre_op_length_mm: z.number().optional(),
  prior_biopsy_id: z.string().uuid().optional().nullable(),
  prior_pathology_diagnosis: z.string().optional(),
  prior_pathology_date: z.string().optional()
});

const addStageSchema = z.object({
  stage_number: z.number().int().min(1),
  excision_time: z.string().optional(),
  excision_width_mm: z.number().optional(),
  excision_length_mm: z.number().optional(),
  excision_depth_mm: z.number().optional(),
  tissue_processor: z.string().optional(),
  histology_tech: z.string().optional(),
  stain_type: z.string().optional(),
  notes: z.string().optional()
});

const recordMarginsSchema = z.object({
  margins: z.array(z.object({
    block_label: z.string().min(1),
    position: z.string().optional(),
    position_degrees: z.number().int().min(0).max(360).optional(),
    margin_status: z.enum(['positive', 'negative', 'close', 'indeterminate']),
    deep_margin_status: z.enum(['positive', 'negative', 'close', 'indeterminate']).optional(),
    depth_mm: z.number().optional(),
    tumor_type_found: z.string().optional(),
    tumor_percentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional()
  }))
});

const closeCaseSchema = z.object({
  closure_type: z.enum([
    'primary',
    'complex_linear',
    'advancement_flap',
    'rotation_flap',
    'transposition_flap',
    'interpolation_flap',
    'full_thickness_graft',
    'split_thickness_graft',
    'secondary_intention',
    'delayed',
    'referred'
  ]),
  closure_subtype: z.string().optional(),
  closure_by: z.string().uuid().optional(),
  repair_length_cm: z.number().optional(),
  repair_width_cm: z.number().optional(),
  repair_area_sq_cm: z.number().optional(),
  repair_cpt_codes: z.array(z.string()).optional(),
  flap_graft_details: z.record(z.string(), z.unknown()).optional(),
  suture_layers: z.number().int().optional(),
  deep_sutures: z.string().optional(),
  superficial_sutures: z.string().optional(),
  suture_removal_days: z.number().int().optional(),
  dressing_type: z.string().optional(),
  pressure_dressing: z.boolean().optional(),
  closure_notes: z.string().optional(),
  technique_notes: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.enum([
    'scheduled', 'pre_op', 'in_progress', 'reading',
    'closure', 'post_op', 'completed', 'cancelled'
  ])
});

const saveMapSchema = z.object({
  stage_id: z.string().uuid().optional().nullable(),
  map_type: z.enum(['tumor', 'pre_op', 'stage', 'cumulative', 'closure']),
  map_svg: z.string(),
  annotations: z.array(z.record(z.string(), z.unknown())).optional(),
  orientation_12_oclock: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/mohs/cases
 * Create a new Mohs surgery case
 */
router.post('/cases', async (req: AuthedRequest, res: Response) => {
  try {
    const validatedData = createCaseSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const tumorData: TumorData = {
      tumor_location: validatedData.tumor_location,
      tumor_location_code: validatedData.tumor_location_code,
      tumor_laterality: validatedData.tumor_laterality,
      tumor_type: validatedData.tumor_type,
      tumor_subtype: validatedData.tumor_subtype,
      tumor_histology: validatedData.tumor_histology,
      clinical_description: validatedData.clinical_description,
      pre_op_size_mm: validatedData.pre_op_size_mm,
      pre_op_width_mm: validatedData.pre_op_width_mm,
      pre_op_length_mm: validatedData.pre_op_length_mm,
      prior_biopsy_id: validatedData.prior_biopsy_id ?? undefined,
      prior_pathology_diagnosis: validatedData.prior_pathology_diagnosis,
      prior_pathology_date: validatedData.prior_pathology_date
    };

    const mohsCase = await MohsService.createCase(
      tenantId,
      validatedData.patient_id,
      validatedData.encounter_id ?? null,
      validatedData.surgeon_id,
      tumorData,
      userId
    );

    logger.info('Mohs case created via API', {
      caseId: mohsCase.id,
      patientId: validatedData.patient_id,
      userId
    });

    res.status(201).json(mohsCase);
  } catch (error: unknown) {
    logger.error('Error creating Mohs case', { error: error instanceof Error ? error.message : String(error) });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to create Mohs case' });
  }
});

/**
 * GET /api/mohs/cases
 * List Mohs cases with filtering
 */
router.get('/cases', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      surgeon_id,
      patient_id,
      status,
      start_date,
      end_date,
      tumor_type,
      limit = '50',
      offset = '0'
    } = req.query;

    const result = await MohsService.listCases(tenantId, {
      surgeonId: surgeon_id as string | undefined,
      patientId: patient_id as string | undefined,
      status: status as string | undefined,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined,
      tumorType: tumor_type as string | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json(result);
  } catch (error: unknown) {
    logger.error('Error listing Mohs cases', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to list Mohs cases' });
  }
});

/**
 * GET /api/mohs/cases/:id
 * Get a single Mohs case with all details
 */
router.get('/cases/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const mohsCase = await MohsService.getCase(id!, tenantId);

    if (!mohsCase) {
      return res.status(404).json({ error: 'Mohs case not found' });
    }

    res.json(mohsCase);
  } catch (error: unknown) {
    logger.error('Error fetching Mohs case', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch Mohs case' });
  }
});

/**
 * PUT /api/mohs/cases/:id/status
 * Update case status
 */
router.put('/cases/:id/status', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateStatusSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const mohsCase = await MohsService.updateCaseStatus(
      id!,
      tenantId,
      validatedData.status,
      userId
    );

    logger.info('Mohs case status updated', {
      caseId: id,
      newStatus: validatedData.status,
      userId
    });

    res.json(mohsCase);
  } catch (error: unknown) {
    logger.error('Error updating Mohs case status', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    if (error instanceof Error && error.message === 'Mohs case not found') {
      return res.status(404).json({ error: 'Mohs case not found' });
    }

    res.status(500).json({ error: 'Failed to update Mohs case status' });
  }
});

/**
 * POST /api/mohs/cases/:id/stages
 * Add a new stage to a Mohs case
 */
router.post('/cases/:id/stages', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = addStageSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    const stageData: StageData = {
      stage_number: validatedData.stage_number,
      excision_time: validatedData.excision_time ? new Date(validatedData.excision_time) : undefined,
      excision_width_mm: validatedData.excision_width_mm,
      excision_length_mm: validatedData.excision_length_mm,
      excision_depth_mm: validatedData.excision_depth_mm,
      tissue_processor: validatedData.tissue_processor,
      histology_tech: validatedData.histology_tech,
      stain_type: validatedData.stain_type,
      notes: validatedData.notes
    };

    const stage = await MohsService.addStage(id!, tenantId, stageData);

    logger.info('Mohs stage added', {
      caseId: id,
      stageNumber: validatedData.stage_number
    });

    res.status(201).json(stage);
  } catch (error: unknown) {
    logger.error('Error adding Mohs stage', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to add Mohs stage' });
  }
});

/**
 * PUT /api/mohs/stages/:id/margins
 * Record margin status for blocks in a stage
 */
router.put('/stages/:id/margins', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = recordMarginsSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    const marginData: MarginData[] = validatedData.margins.map(m => ({
      block_label: m.block_label,
      position: m.position,
      position_degrees: m.position_degrees,
      margin_status: m.margin_status,
      deep_margin_status: m.deep_margin_status,
      depth_mm: m.depth_mm,
      tumor_type_found: m.tumor_type_found,
      tumor_percentage: m.tumor_percentage,
      notes: m.notes
    }));

    const result = await MohsService.recordMargins(id!, tenantId, marginData);

    logger.info('Mohs margins recorded', {
      stageId: id,
      blockCount: marginData.length,
      overallStatus: result.stageMarginStatus
    });

    res.json(result);
  } catch (error: unknown) {
    logger.error('Error recording Mohs margins', { error: error instanceof Error ? error.message : String(error), stageId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to record margins' });
  }
});

/**
 * POST /api/mohs/cases/:id/closure
 * Document closure for a Mohs case
 */
router.post('/cases/:id/closure', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = closeCaseSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const closureData: ClosureData = {
      closure_type: validatedData.closure_type,
      closure_subtype: validatedData.closure_subtype,
      closure_by: validatedData.closure_by,
      repair_length_cm: validatedData.repair_length_cm,
      repair_width_cm: validatedData.repair_width_cm,
      repair_area_sq_cm: validatedData.repair_area_sq_cm,
      repair_cpt_codes: validatedData.repair_cpt_codes,
      flap_graft_details: validatedData.flap_graft_details,
      suture_layers: validatedData.suture_layers,
      deep_sutures: validatedData.deep_sutures,
      superficial_sutures: validatedData.superficial_sutures,
      suture_removal_days: validatedData.suture_removal_days,
      dressing_type: validatedData.dressing_type,
      pressure_dressing: validatedData.pressure_dressing,
      closure_notes: validatedData.closure_notes,
      technique_notes: validatedData.technique_notes
    };

    const mohsCase = await MohsService.closeCase(id!, tenantId, closureData, userId);

    logger.info('Mohs case closure documented', {
      caseId: id,
      closureType: validatedData.closure_type,
      userId
    });

    res.json(mohsCase);
  } catch (error: unknown) {
    logger.error('Error documenting Mohs closure', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to document closure' });
  }
});

/**
 * GET /api/mohs/cases/:id/report
 * Generate operative report for a Mohs case
 */
router.get('/cases/:id/report', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { format = 'json' } = req.query;

    const reportData = await MohsService.generateMohsReport(id!, tenantId);

    if (format === 'text') {
      res.setHeader('Content-Type', 'text/plain');
      res.send(reportData.report);
    } else {
      res.json(reportData);
    }
  } catch (error: unknown) {
    logger.error('Error generating Mohs report', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });

    if (error instanceof Error && error.message === 'Mohs case not found') {
      return res.status(404).json({ error: 'Mohs case not found' });
    }

    res.status(500).json({ error: 'Failed to generate Mohs report' });
  }
});

/**
 * GET /api/mohs/stats
 * Get Mohs surgery statistics
 */
router.get('/stats', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      surgeon_id,
      start_date,
      end_date
    } = req.query;

    const dateRange = start_date && end_date
      ? {
          startDate: new Date(start_date as string),
          endDate: new Date(end_date as string)
        }
      : undefined;

    const stats = await MohsService.getMohsStats(
      tenantId,
      surgeon_id as string | undefined,
      dateRange
    );

    res.json(stats);
  } catch (error: unknown) {
    logger.error('Error fetching Mohs stats', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch Mohs statistics' });
  }
});

/**
 * POST /api/mohs/cases/:id/maps
 * Save a map for a Mohs case
 */
router.post('/cases/:id/maps', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = saveMapSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const map = await MohsService.saveMap(
      id!,
      validatedData.stage_id ?? null,
      tenantId,
      validatedData.map_type,
      validatedData.map_svg,
      validatedData.annotations || [],
      validatedData.orientation_12_oclock ?? null,
      userId
    );

    logger.info('Mohs map saved', {
      caseId: id,
      mapType: validatedData.map_type
    });

    res.status(201).json(map);
  } catch (error: unknown) {
    logger.error('Error saving Mohs map', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to save Mohs map' });
  }
});

/**
 * GET /api/mohs/cpt-codes
 * Get Mohs CPT code reference
 */
router.get('/cpt-codes', async (req: AuthedRequest, res: Response) => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM mohs_cpt_reference';
    const params: unknown[] = [];

    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }

    query += ' ORDER BY code';

    const result = await pool.query(query, params);

    res.json({ codes: result.rows });
  } catch (error: unknown) {
    logger.error('Error fetching Mohs CPT codes', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch CPT codes' });
  }
});

/**
 * PUT /api/mohs/cases/:id
 * Update Mohs case details
 */
router.put('/cases/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Build dynamic update query
    const allowedFields = [
      'tumor_location', 'tumor_location_code', 'tumor_laterality',
      'tumor_type', 'tumor_subtype', 'tumor_histology', 'clinical_description',
      'pre_op_size_mm', 'pre_op_width_mm', 'pre_op_length_mm', 'pre_op_depth_mm',
      'final_defect_size_mm', 'final_defect_width_mm', 'final_defect_length_mm', 'final_defect_depth_mm',
      'anesthesia_type', 'anesthesia_agent', 'anesthesia_volume_ml',
      'pre_op_notes', 'post_op_notes', 'operative_notes', 'complications',
      'consent_obtained', 'assistant_id'
    ];

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        params.push(req.body[field]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex}`);
    params.push(userId);
    paramIndex++;

    params.push(id, tenantId);

    const query = `
      UPDATE mohs_cases
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mohs case not found' });
    }

    logger.info('Mohs case updated', {
      caseId: id,
      updatedFields: Object.keys(req.body).filter(k => allowedFields.includes(k)),
      userId
    });

    res.json(result.rows[0]);
  } catch (error: unknown) {
    logger.error('Error updating Mohs case', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });
    res.status(500).json({ error: 'Failed to update Mohs case' });
  }
});

/**
 * DELETE /api/mohs/cases/:id
 * Soft delete a Mohs case
 */
router.delete('/cases/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const result = await pool.query(
      `UPDATE mohs_cases
       SET deleted_at = NOW(), updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [userId, id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mohs case not found' });
    }

    logger.info('Mohs case deleted', { caseId: id, userId });

    res.json({ success: true, message: 'Mohs case deleted' });
  } catch (error: unknown) {
    logger.error('Error deleting Mohs case', { error: error instanceof Error ? error.message : String(error), caseId: req.params.id });
    res.status(500).json({ error: 'Failed to delete Mohs case' });
  }
});

export { router as mohsRouter };
export default router;
