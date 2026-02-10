/**
 * Patch Test Routes
 * API endpoints for contact dermatitis patch testing system
 */

import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import { PatchTestService, READING_SCALE } from '../services/patchTestService';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const createSessionSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional().nullable(),
  panel_ids: z.array(z.string()).min(1, 'At least one panel must be selected'),
  application_date: z.string().datetime(),
  indication: z.string().optional(),
  relevant_history: z.string().optional(),
  current_medications: z.array(z.string()).optional(),
  skin_condition_notes: z.string().optional(),
  applying_provider_id: z.string().uuid().optional(),
  application_notes: z.string().optional(),
});

const recordReadingSchema = z.object({
  allergen_id: z.string(),
  reading: z.enum([
    'not_read',
    'negative',
    'irritant',
    'doubtful',
    'weak_positive',
    'strong_positive',
    'extreme_positive',
  ]),
  notes: z.string().optional(),
});

const recordBulkReadingsSchema = z.object({
  timepoint: z.enum(['48hr', '96hr']),
  readings: z.array(
    z.object({
      allergen_id: z.string(),
      reading: z.enum([
        'not_read',
        'negative',
        'irritant',
        'doubtful',
        'weak_positive',
        'strong_positive',
        'extreme_positive',
      ]),
      notes: z.string().optional(),
    })
  ),
});

const updateInterpretationSchema = z.object({
  interpretation: z.enum([
    'pending',
    'not_relevant',
    'past_relevance',
    'current_relevance',
    'unknown_relevance',
  ]),
  relevance_notes: z.string().optional(),
});

/**
 * GET /api/patch-test/panels
 * Get all available patch test panels
 */
router.get('/panels', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const panels = await PatchTestService.getPanels(tenantId);

    res.json({ panels });
  } catch (error: any) {
    logger.error('Error fetching patch test panels', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch panels' });
  }
});

/**
 * GET /api/patch-test/reading-scale
 * Get the reading scale definitions
 */
router.get('/reading-scale', async (_req: AuthedRequest, res: Response) => {
  res.json({ scale: READING_SCALE });
});

/**
 * POST /api/patch-test/sessions
 * Create a new patch test session
 */
router.post('/sessions', async (req: AuthedRequest, res: Response) => {
  try {
    const validatedData = createSessionSchema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const session = await PatchTestService.createSession({
      tenantId,
      patientId: validatedData.patient_id,
      encounterId: validatedData.encounter_id || undefined,
      panelIds: validatedData.panel_ids,
      applicationDate: new Date(validatedData.application_date),
      indication: validatedData.indication,
      relevantHistory: validatedData.relevant_history,
      currentMedications: validatedData.current_medications,
      skinConditionNotes: validatedData.skin_condition_notes,
      applyingProviderId: validatedData.applying_provider_id,
      applicationNotes: validatedData.application_notes,
      createdBy: userId,
    });

    logger.info('Patch test session created', {
      sessionId: session.id,
      patientId: validatedData.patient_id,
      userId,
    });

    res.status(201).json(session);
  } catch (error: any) {
    logger.error('Error creating patch test session', { error: error.message });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/patch-test/sessions
 * Get all patch test sessions with optional filters
 */
router.get('/sessions', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patient_id, status, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT pts.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.mrn,
             (SELECT COUNT(*) FROM patch_test_results ptr
              WHERE ptr.session_id = pts.id
              AND (ptr.reading_48hr IN ('weak_positive', 'strong_positive', 'extreme_positive')
                   OR ptr.reading_96hr IN ('weak_positive', 'strong_positive', 'extreme_positive'))
             ) as positive_count
      FROM patch_test_sessions pts
      JOIN patients p ON pts.patient_id = p.id
      WHERE pts.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND pts.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND pts.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY pts.application_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { pool } = await import('../db/pool');
    const result = await pool.query(query, params);

    res.json({
      sessions: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    logger.error('Error fetching patch test sessions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/patch-test/sessions/attention
 * Get sessions requiring attention (due for readings)
 */
router.get('/sessions/attention', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const sessions = await PatchTestService.getSessionsRequiringAttention(tenantId);

    res.json({ sessions });
  } catch (error: any) {
    logger.error('Error fetching sessions requiring attention', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/patch-test/sessions/:id
 * Get a specific session with all results
 */
router.get('/sessions/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId as string;

    const session = await PatchTestService.getSession(id, tenantId);

    res.json(session);
  } catch (error: any) {
    logger.error('Error fetching patch test session', { error: error.message, sessionId: req.params.id });

    if (error.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * PUT /api/patch-test/sessions/:id/readings
 * Record readings for a session (single or bulk)
 */
router.put('/sessions/:id/readings', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId as string;
    const userId = req.user!.id as string;

    // Check if bulk or single reading
    if (req.body.readings) {
      const validatedData = recordBulkReadingsSchema.parse(req.body);

      await PatchTestService.recordBulkReadings(
        id as string,
        validatedData.readings.map((r) => ({
          allergenId: r.allergen_id,
          reading: r.reading,
          notes: r.notes,
        })),
        validatedData.timepoint,
        userId,
        tenantId
      );

      const session = await PatchTestService.getSession(id as string, tenantId);
      res.json(session);
    } else {
      const validatedData = recordReadingSchema.parse(req.body);
      const { timepoint } = req.query;

      if (!timepoint || (timepoint !== '48hr' && timepoint !== '96hr')) {
        return res.status(400).json({ error: 'Invalid timepoint. Must be 48hr or 96hr.' });
      }

      const result = await PatchTestService.recordReading({
        sessionId: id as string,
        allergenId: validatedData.allergen_id,
        timepoint: timepoint as '48hr' | '96hr',
        reading: validatedData.reading,
        notes: validatedData.notes,
        readBy: userId,
        tenantId,
      });

      res.json(result);
    }

    logger.info('Patch test readings recorded', { sessionId: id, userId });
  } catch (error: any) {
    logger.error('Error recording patch test readings', {
      error: error.message,
      sessionId: req.params.id,
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to record readings' });
  }
});

/**
 * POST /api/patch-test/sessions/:id/interpret
 * Generate interpretation for session results
 */
router.post('/sessions/:id/interpret', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId as string;

    const interpretation = await PatchTestService.interpretResults(id as string, tenantId);

    res.json(interpretation);
  } catch (error: any) {
    logger.error('Error interpreting patch test results', {
      error: error.message,
      sessionId: req.params.id,
    });
    res.status(500).json({ error: 'Failed to interpret results' });
  }
});

/**
 * GET /api/patch-test/sessions/:id/report
 * Get or generate report for session
 */
router.get('/sessions/:id/report', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId as string;
    const userId = req.user!.id as string;

    const report = await PatchTestService.generateReport(id as string, tenantId, userId);

    res.json(report);
  } catch (error: any) {
    logger.error('Error generating patch test report', {
      error: error.message,
      sessionId: req.params.id,
    });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * POST /api/patch-test/sessions/:id/cancel
 * Cancel a patch test session
 */
router.post('/sessions/:id/cancel', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const tenantId = req.user!.tenantId as string;

    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const session = await PatchTestService.cancelSession(id as string, reason, tenantId);

    logger.info('Patch test session cancelled', { sessionId: id, reason });

    res.json(session);
  } catch (error: any) {
    logger.error('Error cancelling patch test session', {
      error: error.message,
      sessionId: req.params.id,
    });
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

/**
 * PUT /api/patch-test/results/:id/interpretation
 * Update interpretation for a specific result
 */
router.put('/results/:id/interpretation', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateInterpretationSchema.parse(req.body);
    const tenantId = req.user!.tenantId as string;

    const result = await PatchTestService.updateResultInterpretation(
      id as string,
      validatedData.interpretation,
      validatedData.relevance_notes || '',
      tenantId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Error updating result interpretation', {
      error: error.message,
      resultId: req.params.id,
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to update interpretation' });
  }
});

/**
 * GET /api/patch-test/allergens
 * Search allergens in database
 */
router.get('/allergens', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { q, category } = req.query;

    const allergens = await PatchTestService.searchAllergens(
      q as string,
      category as string,
      tenantId
    );

    res.json({ allergens });
  } catch (error: any) {
    logger.error('Error searching allergens', { error: error.message });
    res.status(500).json({ error: 'Failed to search allergens' });
  }
});

/**
 * GET /api/patch-test/allergens/:id
 * Get allergen details including common sources
 */
router.get('/allergens/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId as string;

    const allergen = await PatchTestService.getCommonSources(id as string, tenantId);

    res.json(allergen);
  } catch (error: any) {
    logger.error('Error fetching allergen details', {
      error: error.message,
      allergenId: req.params.id,
    });

    if (error.message === 'Allergen not found') {
      return res.status(404).json({ error: 'Allergen not found' });
    }

    res.status(500).json({ error: 'Failed to fetch allergen' });
  }
});

/**
 * GET /api/patch-test/patient/:patientId/sessions
 * Get all sessions for a specific patient
 */
router.get('/patient/:patientId/sessions', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId as string;

    const sessions = await PatchTestService.getPatientSessions(patientId as string, tenantId);

    res.json({ sessions });
  } catch (error: any) {
    logger.error('Error fetching patient patch test sessions', {
      error: error.message,
      patientId: req.params.patientId,
    });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/patch-test/statistics
 * Get patch testing statistics
 */
router.get('/statistics', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date as string) : undefined;
    const endDate = end_date ? new Date(end_date as string) : undefined;

    const statistics = await PatchTestService.getStatistics(tenantId, startDate, endDate);

    res.json(statistics);
  } catch (error: any) {
    logger.error('Error fetching patch test statistics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
