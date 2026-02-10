/**
 * Lesion Tracking Routes
 * API endpoints for lesion comparison and tracking system
 * Critical for dermatology: early detection of changes in suspicious lesions
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { logger } from '../lib/logger';
import {
  LesionTrackingService,
  CreateLesionParams,
  AddImageParams,
  RecordMeasurementsParams,
  CalculateABCDEParams
} from '../services/lesionTrackingService';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createLesionSchema = z.object({
  patientId: z.string().uuid(),
  locationCode: z.string().min(1),
  locationDescription: z.string().min(1),
  clinicalDescription: z.string().optional(),
  suspicionLevel: z.number().min(1).max(5).optional(),
  lesionId: z.string().uuid().optional()
});

const addImageSchema = z.object({
  encounterId: z.string().uuid().optional(),
  imageUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  dermoscopy: z.boolean().optional(),
  measurements: z.record(z.string(), z.unknown()).optional()
});

const recordMeasurementsSchema = z.object({
  encounterId: z.string().uuid().optional(),
  lengthMm: z.number().positive().optional(),
  widthMm: z.number().positive().optional(),
  heightMm: z.number().positive().optional(),
  color: z.string().optional(),
  border: z.string().optional(),
  symmetry: z.string().optional(),
  notes: z.string().optional()
});

const abcdeScoreSchema = z.object({
  encounterId: z.string().uuid().optional(),
  asymmetry: z.number().min(0).max(2),
  border: z.number().min(0).max(2),
  color: z.number().min(0).max(2),
  diameter: z.number().min(0).max(2),
  evolution: z.number().min(0).max(2),
  notes: z.string().optional()
});

const recordOutcomeSchema = z.object({
  outcomeType: z.enum(['biopsy', 'excision', 'monitoring', 'referral', 'resolved']),
  outcomeDate: z.string(),
  pathologyResult: z.string().optional(),
  diagnosisCode: z.string().optional(),
  biopsyId: z.string().uuid().optional(),
  notes: z.string().optional()
});

const compareImagesSchema = z.object({
  date1: z.string(),
  date2: z.string()
});

// =====================================================
// LESION CRUD ROUTES
// =====================================================

/**
 * POST /api/lesion-tracking
 * Create a new tracked lesion
 */
router.post(
  '/',
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = createLesionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const params: CreateLesionParams = {
        patientId: parsed.data.patientId,
        locationCode: parsed.data.locationCode,
        locationDescription: parsed.data.locationDescription,
        clinicalDescription: parsed.data.clinicalDescription,
        suspicionLevel: parsed.data.suspicionLevel,
        lesionId: parsed.data.lesionId
      };

      const lesion = await LesionTrackingService.createLesion(tenantId, params, userId);

      logger.info('Tracked lesion created via API', {
        lesionId: lesion.id,
        patientId: parsed.data.patientId,
        userId
      });

      res.status(201).json(lesion);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error creating tracked lesion', { error: errorMessage });
      res.status(500).json({ error: 'Failed to create tracked lesion' });
    }
  }
);

/**
 * GET /api/lesion-tracking/patient/:patientId
 * Get all tracked lesions for a patient
 */
router.get('/patient/:patientId', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const lesions = await LesionTrackingService.getPatientLesions(tenantId, patientId);

    res.json({ lesions });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching patient lesions', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch patient lesions' });
  }
});

/**
 * GET /api/lesion-tracking/:id/timeline
 * Get full timeline/history for a lesion
 */
router.get('/:id/timeline', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    if (!id) {
      return res.status(400).json({ error: 'Lesion ID is required' });
    }

    const history = await LesionTrackingService.getLesionHistory(tenantId, id);

    if (!history) {
      return res.status(404).json({ error: 'Lesion not found' });
    }

    res.json(history);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching lesion timeline', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch lesion timeline' });
  }
});

// =====================================================
// IMAGE ROUTES
// =====================================================

/**
 * POST /api/lesion-tracking/:id/images
 * Add an image to a tracked lesion
 */
router.post(
  '/:id/images',
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = addImageSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      const params: AddImageParams = {
        lesionId: id,
        encounterId: parsed.data.encounterId,
        imageUrl: parsed.data.imageUrl,
        thumbnailUrl: parsed.data.thumbnailUrl,
        capturedBy: userId,
        dermoscopy: parsed.data.dermoscopy,
        measurements: parsed.data.measurements
      };

      const image = await LesionTrackingService.addImage(tenantId, params);

      res.status(201).json(image);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error adding lesion image', { error: errorMessage });
      res.status(500).json({ error: 'Failed to add lesion image' });
    }
  }
);

/**
 * GET /api/lesion-tracking/:id/compare
 * Get side-by-side comparison data for two dates
 */
router.get('/:id/compare', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = compareImagesSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ error: 'date1 and date2 query parameters are required' });
    }

    const tenantId = req.user!.tenantId;

    if (!id) {
      return res.status(400).json({ error: 'Lesion ID is required' });
    }

    const date1 = new Date(parsed.data.date1);
    const date2 = new Date(parsed.data.date2);

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const comparison = await LesionTrackingService.compareImages(tenantId, id, date1, date2);

    res.json(comparison);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error comparing lesion images', { error: errorMessage });
    res.status(500).json({ error: 'Failed to compare lesion images' });
  }
});

// =====================================================
// MEASUREMENT ROUTES
// =====================================================

/**
 * POST /api/lesion-tracking/:id/measurements
 * Record measurements for a lesion
 */
router.post(
  '/:id/measurements',
  requireRoles(['provider', 'ma', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = recordMeasurementsSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      const params: RecordMeasurementsParams = {
        lesionId: id,
        encounterId: parsed.data.encounterId,
        lengthMm: parsed.data.lengthMm,
        widthMm: parsed.data.widthMm,
        heightMm: parsed.data.heightMm,
        color: parsed.data.color,
        border: parsed.data.border,
        symmetry: parsed.data.symmetry,
        notes: parsed.data.notes,
        measuredBy: userId
      };

      const measurement = await LesionTrackingService.recordMeasurements(tenantId, params);

      res.status(201).json(measurement);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error recording lesion measurements', { error: errorMessage });
      res.status(500).json({ error: 'Failed to record lesion measurements' });
    }
  }
);

// =====================================================
// ABCDE SCORING ROUTES
// =====================================================

/**
 * POST /api/lesion-tracking/:id/abcde
 * Record ABCDE score for a lesion
 */
router.post(
  '/:id/abcde',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = abcdeScoreSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      const params: CalculateABCDEParams = {
        lesionId: id,
        encounterId: parsed.data.encounterId,
        scores: {
          asymmetry: parsed.data.asymmetry,
          border: parsed.data.border,
          color: parsed.data.color,
          diameter: parsed.data.diameter,
          evolution: parsed.data.evolution,
          notes: parsed.data.notes
        },
        assessedBy: userId
      };

      const score = await LesionTrackingService.calculateABCDE(tenantId, params);

      res.status(201).json(score);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error recording ABCDE score', { error: errorMessage });
      res.status(500).json({ error: 'Failed to record ABCDE score' });
    }
  }
);

// =====================================================
// OUTCOME ROUTES
// =====================================================

/**
 * POST /api/lesion-tracking/:id/outcomes
 * Record an outcome for a lesion
 */
router.post(
  '/:id/outcomes',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = recordOutcomeSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      const outcome = await LesionTrackingService.recordOutcome(
        tenantId,
        id,
        parsed.data.outcomeType,
        new Date(parsed.data.outcomeDate),
        userId,
        {
          pathologyResult: parsed.data.pathologyResult,
          diagnosisCode: parsed.data.diagnosisCode,
          biopsyId: parsed.data.biopsyId,
          notes: parsed.data.notes
        }
      );

      res.status(201).json(outcome);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error recording lesion outcome', { error: errorMessage });
      res.status(500).json({ error: 'Failed to record lesion outcome' });
    }
  }
);

// =====================================================
// ALERT ROUTES
// =====================================================

/**
 * GET /api/lesion-tracking/alerts
 * Get active alerts (optionally filtered by patient)
 */
router.get('/alerts', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.query.patientId as string | undefined;

    const alerts = await LesionTrackingService.getActiveAlerts(tenantId, patientId);

    res.json({ alerts });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching lesion alerts', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch lesion alerts' });
  }
});

/**
 * POST /api/lesion-tracking/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post(
  '/alerts/:alertId/acknowledge',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { alertId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!alertId) {
        return res.status(400).json({ error: 'Alert ID is required' });
      }

      await LesionTrackingService.acknowledgeAlert(tenantId, alertId, userId);

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error acknowledging alert', { error: errorMessage });
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  }
);

/**
 * POST /api/lesion-tracking/alerts/:alertId/resolve
 * Resolve an alert
 */
router.post(
  '/alerts/:alertId/resolve',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { alertId } = req.params;
      const { resolutionNotes } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      if (!alertId) {
        return res.status(400).json({ error: 'Alert ID is required' });
      }

      await LesionTrackingService.resolveAlert(tenantId, alertId, userId, resolutionNotes);

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error resolving alert', { error: errorMessage });
      res.status(500).json({ error: 'Failed to resolve alert' });
    }
  }
);

// =====================================================
// CHANGING LESIONS ROUTE
// =====================================================

/**
 * GET /api/lesion-tracking/patient/:patientId/changing
 * Get lesions with significant changes for a patient
 */
router.get('/patient/:patientId/changing', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const changingLesions = await LesionTrackingService.getChangingLesions(tenantId, patientId);

    res.json({ lesions: changingLesions });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching changing lesions', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch changing lesions' });
  }
});

// =====================================================
// STATUS UPDATE ROUTES
// =====================================================

/**
 * PUT /api/lesion-tracking/:id/status
 * Update lesion status
 */
router.put(
  '/:id/status',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const tenantId = req.user!.tenantId;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      if (!['active', 'resolved', 'excised'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      await LesionTrackingService.updateLesionStatus(tenantId, id, status);

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error updating lesion status', { error: errorMessage });
      res.status(500).json({ error: 'Failed to update lesion status' });
    }
  }
);

/**
 * PUT /api/lesion-tracking/:id/suspicion
 * Update lesion suspicion level
 */
router.put(
  '/:id/suspicion',
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { suspicionLevel } = req.body;
      const tenantId = req.user!.tenantId;

      if (!id) {
        return res.status(400).json({ error: 'Lesion ID is required' });
      }

      if (typeof suspicionLevel !== 'number' || suspicionLevel < 1 || suspicionLevel > 5) {
        return res.status(400).json({ error: 'Suspicion level must be between 1 and 5' });
      }

      await LesionTrackingService.updateSuspicionLevel(tenantId, id, suspicionLevel);

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error updating suspicion level', { error: errorMessage });
      res.status(500).json({ error: 'Failed to update suspicion level' });
    }
  }
);

export default router;
