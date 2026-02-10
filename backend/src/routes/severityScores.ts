/**
 * Severity Scores Routes
 * API endpoints for dermatology severity score calculators
 * Supports IGA, PASI, BSA, and DLQI assessments
 */

import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../lib/logger';
import {
  severityScoreService,
  calculatePASI,
  calculateBSA,
  calculateDLQI,
  calculateIGA,
  type AssessmentType,
  type PASIComponents,
  type BSAComponents,
  type DLQIResponses,
  type IGAComponents
} from '../services/severityScoreService';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// Validation Schemas
// ============================================================================

const pasiRegionSchema = z.object({
  erythema: z.number().min(0).max(4),
  induration: z.number().min(0).max(4),
  scaling: z.number().min(0).max(4),
  area: z.number().min(0).max(6)
});

const pasiComponentsSchema = z.object({
  head: pasiRegionSchema,
  trunk: pasiRegionSchema,
  upper_extremities: pasiRegionSchema,
  lower_extremities: pasiRegionSchema
});

const bsaRegionSchema = z.object({
  region_id: z.string(),
  affected_percent: z.number().min(0).max(100)
});

const bsaComponentsSchema = z.object({
  method: z.enum(['palm', 'rule_of_9s']),
  is_child: z.boolean().default(false),
  affected_areas: z.array(bsaRegionSchema),
  palm_count: z.number().min(0).max(100).optional()
});

const dlqiResponsesSchema = z.object({
  q1: z.number().min(0).max(3),
  q2: z.number().min(0).max(3),
  q3: z.number().min(0).max(3),
  q4: z.number().min(0).max(3),
  q5: z.number().min(0).max(3),
  q6: z.number().min(0).max(3),
  q7: z.number().min(0).max(3),
  q8: z.number().min(0).max(3),
  q9: z.number().min(0).max(3),
  q10: z.number().min(0).max(3)
});

const igaComponentsSchema = z.object({
  selection: z.number().min(0).max(4),
  description: z.string().optional()
});

const calculateRequestSchema = z.object({
  type: z.enum(['IGA', 'PASI', 'BSA', 'DLQI']),
  components: z.union([
    pasiComponentsSchema,
    bsaComponentsSchema,
    dlqiResponsesSchema,
    igaComponentsSchema
  ])
});

const saveAssessmentSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional().nullable(),
  assessment_type: z.enum(['IGA', 'PASI', 'BSA', 'DLQI']),
  score_value: z.number(),
  score_interpretation: z.string(),
  severity_level: z.string(),
  component_scores: z.record(z.string(), z.unknown()),
  clinical_notes: z.string().optional(),
  photo_ids: z.array(z.string().uuid()).optional(),
  is_baseline: z.boolean().optional()
});

// ============================================================================
// Calculate Score Endpoint
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/calculate:
 *   post:
 *     summary: Calculate severity score
 *     tags: [Severity Scores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [IGA, PASI, BSA, DLQI]
 *               components:
 *                 type: object
 *     responses:
 *       200:
 *         description: Calculated score
 */
router.post('/calculate', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { type, components } = calculateRequestSchema.parse(req.body);

    let result;

    switch (type) {
      case 'PASI':
        result = calculatePASI(components as PASIComponents);
        break;
      case 'BSA':
        result = calculateBSA(components as BSAComponents);
        break;
      case 'DLQI':
        result = calculateDLQI(components as DLQIResponses);
        break;
      case 'IGA':
        result = calculateIGA(components as IGAComponents);
        break;
      default:
        res.status(400).json({ error: `Unknown assessment type: ${type as string}` });
        return;
    }

    res.json({
      type,
      ...result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    logger.error('Error calculating severity score', { error });
    res.status(500).json({ error: 'Failed to calculate score' });
  }
});

// ============================================================================
// Save Assessment Endpoint
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/save:
 *   post:
 *     summary: Save severity assessment
 *     tags: [Severity Scores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SeverityAssessment'
 *     responses:
 *       201:
 *         description: Assessment saved
 */
router.post('/save', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const validatedData = saveAssessmentSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const assessedBy = req.user!.id;

    const assessment = await severityScoreService.saveAssessment({
      tenantId,
      patientId: validatedData.patient_id,
      encounterId: validatedData.encounter_id,
      assessmentType: validatedData.assessment_type as AssessmentType,
      scoreValue: validatedData.score_value,
      scoreInterpretation: validatedData.score_interpretation,
      severityLevel: validatedData.severity_level,
      componentScores: validatedData.component_scores,
      assessedBy,
      clinicalNotes: validatedData.clinical_notes,
      photoIds: validatedData.photo_ids,
      isBaseline: validatedData.is_baseline
    });

    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    logger.error('Error saving severity assessment', { error });
    res.status(500).json({ error: 'Failed to save assessment' });
  }
});

// ============================================================================
// Get Patient History Endpoint
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/patient/{patientId}/history:
 *   get:
 *     summary: Get patient's severity score history
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [IGA, PASI, BSA, DLQI]
 *     responses:
 *       200:
 *         description: Score history
 */
router.get('/patient/:patientId/history', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;
    const type = req.query.type as AssessmentType | undefined;
    const tenantId = req.user!.tenantId;

    if (!patientId) {
      res.status(400).json({ error: 'Patient ID is required' });
      return;
    }

    const history = await severityScoreService.getScoreHistory(tenantId, patientId, type);

    res.json(history);
  } catch (error) {
    logger.error('Error fetching score history', { error });
    res.status(500).json({ error: 'Failed to fetch score history' });
  }
});

// ============================================================================
// Get Assessment Templates Endpoint
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/templates:
 *   get:
 *     summary: Get assessment templates
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [IGA, PASI, BSA, DLQI]
 *     responses:
 *       200:
 *         description: Assessment templates
 */
router.get('/templates', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const type = req.query.type as AssessmentType | undefined;
    const tenantId = req.user!.tenantId;

    const templates = await severityScoreService.getAssessmentTemplates(tenantId, type);

    res.json(templates);
  } catch (error) {
    logger.error('Error fetching assessment templates', { error });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================================================
// Get Patient Assessments
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/patient/{patientId}/assessments:
 *   get:
 *     summary: Get patient's assessments
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [IGA, PASI, BSA, DLQI]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Patient assessments
 */
router.get('/patient/:patientId/assessments', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;
    const type = req.query.type as AssessmentType | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const tenantId = req.user!.tenantId;

    if (!patientId) {
      res.status(400).json({ error: 'Patient ID is required' });
      return;
    }

    const assessments = await severityScoreService.getPatientAssessments(tenantId, patientId, {
      type,
      limit
    });

    res.json(assessments);
  } catch (error) {
    logger.error('Error fetching patient assessments', { error });
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// ============================================================================
// Get Latest Scores Summary
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/patient/{patientId}/summary:
 *   get:
 *     summary: Get patient's latest scores summary
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Latest scores summary
 */
router.get('/patient/:patientId/summary', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    if (!patientId) {
      res.status(400).json({ error: 'Patient ID is required' });
      return;
    }

    const summary = await severityScoreService.getLatestScoresSummary(tenantId, patientId);

    res.json(summary);
  } catch (error) {
    logger.error('Error fetching scores summary', { error });
    res.status(500).json({ error: 'Failed to fetch scores summary' });
  }
});

// ============================================================================
// Get Single Assessment
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/{assessmentId}:
 *   get:
 *     summary: Get a single assessment
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: path
 *         name: assessmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Assessment details
 */
router.get('/:assessmentId', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { assessmentId } = req.params;
    const tenantId = req.user!.tenantId;

    if (!assessmentId) {
      res.status(400).json({ error: 'Assessment ID is required' });
      return;
    }

    const assessment = await severityScoreService.getAssessmentById(tenantId, assessmentId);

    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' });
      return;
    }

    res.json(assessment);
  } catch (error) {
    logger.error('Error fetching assessment', { error });
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

// ============================================================================
// Delete Assessment
// ============================================================================

/**
 * @swagger
 * /api/severity-scores/{assessmentId}:
 *   delete:
 *     summary: Delete an assessment
 *     tags: [Severity Scores]
 *     parameters:
 *       - in: path
 *         name: assessmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Assessment deleted
 */
router.delete('/:assessmentId', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { assessmentId } = req.params;
    const tenantId = req.user!.tenantId;

    if (!assessmentId) {
      res.status(400).json({ error: 'Assessment ID is required' });
      return;
    }

    const deleted = await severityScoreService.deleteAssessment(tenantId, assessmentId);

    if (!deleted) {
      res.status(404).json({ error: 'Assessment not found' });
      return;
    }

    res.json({ success: true, message: 'Assessment deleted' });
  } catch (error) {
    logger.error('Error deleting assessment', { error });
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

export const severityScoresRouter = router;
