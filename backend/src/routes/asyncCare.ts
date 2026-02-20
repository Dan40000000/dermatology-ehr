/**
 * Async Care API Routes
 * Patient photo upload system for telederm / async consultations
 */

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { PatientPortalRequest, requirePatientAuth } from '../middleware/patientPortalAuth';
import { asyncCareService } from '../services/asyncCareService';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createRequestSchema = z.object({
  requestType: z.enum(['photo_consult', 'follow_up', 'new_concern', 'medication_question']),
  concernCategory: z.string().optional(),
  chiefComplaint: z.string().optional(),
  symptomDuration: z.string().optional(),
  symptomChanges: z.enum(['getting_better', 'getting_worse', 'same', 'comes_and_goes']).optional(),
  painLevel: z.number().min(0).max(10).optional(),
  itchingLevel: z.number().min(0).max(10).optional(),
  questionnaireResponses: z.record(z.string(), z.any()).optional(),
  urgency: z.enum(['routine', 'soon', 'urgent']).default('routine'),
});

const uploadPhotoSchema = z.object({
  bodyLocation: z.string().min(1),
  bodyLocationDetail: z.string().optional(),
  bodyView: z.enum(['front', 'back', 'side']).optional(),
  description: z.string().optional(),
  isCloseUp: z.boolean().optional(),
});

const submitResponseSchema = z.object({
  responseType: z.enum(['assessment', 'question', 'referral', 'prescription', 'self_care', 'schedule_visit']),
  responseText: z.string().min(1),
  clinicalAssessment: z.string().optional(),
  recommendedAction: z.string().optional(),
  suggestedDiagnosis: z.string().optional(),
  suggestedIcd10: z.string().optional(),
  followUpInstructions: z.string().optional(),
  followUpTimeframe: z.string().optional(),
  visibleToPatient: z.boolean().default(true),
  internalNotes: z.string().optional(),
});

const assignProviderSchema = z.object({
  providerId: z.string().uuid(),
});

const escalateSchema = z.object({
  providerId: z.string().uuid(),
  locationId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  notes: z.string().optional(),
});

const queueFiltersSchema = z.object({
  status: z.union([
    z.enum(['pending', 'in_review', 'reviewed', 'responded', 'closed', 'cancelled']),
    z.array(z.enum(['pending', 'in_review', 'reviewed', 'responded', 'closed', 'cancelled'])),
  ]).optional(),
  urgency: z.enum(['routine', 'soon', 'urgent']).optional(),
  unassignedOnly: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// Configure multer for photo uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for patient uploads
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and HEIC allowed.'));
    }
  },
});

export const asyncCareRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logAsyncCareError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// ============================================================================
// PATIENT PORTAL ROUTES
// ============================================================================

/**
 * POST /api/async-care/requests
 * Create a new async care request (patient portal)
 */
asyncCareRouter.post('/requests', requirePatientAuth, async (req: PatientPortalRequest, res) => {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request data', details: parsed.error.issues });
  }

  try {
    const tenantId = req.patient!.tenantId;
    const patientId = req.patient!.patientId;
    const portalAccountId = req.patient!.accountId;

    const request = await asyncCareService.createRequest(tenantId, {
      patientId,
      portalAccountId,
      ...parsed.data,
    });

    res.status(201).json({ request });
  } catch (error: any) {
    logAsyncCareError('Error creating async care request', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

/**
 * POST /api/async-care/requests/:id/photos
 * Upload photos for a request (patient portal)
 */
asyncCareRouter.post(
  '/requests/:id/photos',
  requirePatientAuth,
  upload.single('photo'),
  async (req: PatientPortalRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    const parsed = uploadPhotoSchema.safeParse(JSON.parse(req.body.metadata || '{}'));
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid metadata', details: parsed.error.issues });
    }

    try {
      const tenantId = req.patient!.tenantId;
      const patientId = req.patient!.patientId;
      const requestId = req.params.id;

      const photo = await asyncCareService.uploadPhoto(tenantId, {
        requestId: requestId ?? '',
        patientId,
        imageBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        ...parsed.data,
      });

      res.status(201).json({ photo });
    } catch (error: any) {
      logAsyncCareError('Error uploading photo', error);
      res.status(500).json({ error: error.message || 'Failed to upload photo' });
    }
  }
);

/**
 * DELETE /api/async-care/requests/:requestId/photos/:photoId
 * Delete a photo from a request (patient portal)
 */
asyncCareRouter.delete(
  '/requests/:requestId/photos/:photoId',
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const tenantId = req.patient!.tenantId;
      const patientId = req.patient!.patientId;
      const { photoId } = req.params;

      const deleted = await asyncCareService.deletePhoto(tenantId, photoId ?? '', patientId);

      if (!deleted) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      logAsyncCareError('Error deleting photo', error);
      res.status(500).json({ error: 'Failed to delete photo' });
    }
  }
);

/**
 * GET /api/async-care/patient/:patientId/requests
 * Get patient's async care requests (patient portal)
 */
asyncCareRouter.get('/patient/requests', requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const tenantId = req.patient!.tenantId;
    const patientId = req.patient!.patientId;

    const requests = await asyncCareService.getPatientRequests(tenantId, patientId, true);

    res.json({ requests });
  } catch (error: any) {
    logAsyncCareError('Error fetching patient requests', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

/**
 * GET /api/async-care/patient/requests/:id
 * Get a specific request with details (patient portal)
 */
asyncCareRouter.get('/patient/requests/:id', requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const tenantId = req.patient!.tenantId;
    const patientId = req.patient!.patientId;
    const requestId = req.params.id;

    const request = await asyncCareService.getRequestWithDetails(tenantId, requestId ?? '');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify ownership
    if (request.patientId !== patientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Filter out internal notes from responses
    if (request.responses) {
      request.responses = request.responses
        .filter(r => r.visibleToPatient)
        .map(r => ({ ...r, internalNotes: undefined }));
    }

    res.json({ request });
  } catch (error: any) {
    logAsyncCareError('Error fetching request', error);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

/**
 * PUT /api/async-care/patient/requests/:id/responses/:responseId/read
 * Mark a response as read (patient portal)
 */
asyncCareRouter.put(
  '/patient/requests/:id/responses/:responseId/read',
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const tenantId = req.patient!.tenantId;
      const { responseId } = req.params;

      await asyncCareService.markResponseAsRead(tenantId, responseId ?? '');

      res.json({ success: true });
    } catch (error: any) {
      logAsyncCareError('Error marking response as read', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  }
);

/**
 * GET /api/async-care/templates
 * Get available questionnaire templates (patient portal)
 */
asyncCareRouter.get('/templates', requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const tenantId = req.patient!.tenantId;
    const conditionType = req.query.conditionType as string | undefined;

    const templates = await asyncCareService.getTemplates(tenantId, conditionType);

    res.json({ templates });
  } catch (error: any) {
    logAsyncCareError('Error fetching templates', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/async-care/templates/:id
 * Get a specific template (patient portal)
 */
asyncCareRouter.get('/templates/:id', requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const tenantId = req.patient!.tenantId;
    const templateId = req.params.id;

    const template = await asyncCareService.getTemplate(tenantId, templateId ?? '');

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error: any) {
    logAsyncCareError('Error fetching template', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// ============================================================================
// PROVIDER/STAFF ROUTES
// ============================================================================

/**
 * GET /api/async-care/queue
 * Get provider's request queue
 */
asyncCareRouter.get(
  '/queue',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    const filtersResult = queueFiltersSchema.safeParse(req.query);
    if (!filtersResult.success) {
      return res.status(400).json({ error: 'Invalid filters', details: filtersResult.error.issues });
    }

    try {
      const tenantId = req.user!.tenantId;
      const providerId = req.query.providerId as string | undefined;

      const { requests, total } = await asyncCareService.getRequestQueue(
        tenantId,
        providerId || null,
        {
          ...filtersResult.data,
          startDate: filtersResult.data.startDate ? new Date(filtersResult.data.startDate) : undefined,
          endDate: filtersResult.data.endDate ? new Date(filtersResult.data.endDate) : undefined,
        }
      );

      res.json({ requests, total });
    } catch (error: any) {
      logAsyncCareError('Error fetching queue', error);
      res.status(500).json({ error: 'Failed to fetch queue' });
    }
  }
);

/**
 * GET /api/async-care/requests/:id
 * Get a specific request with full details (provider view)
 */
asyncCareRouter.get(
  '/requests/:id',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const requestId = req.params.id;

      const request = await asyncCareService.getRequestWithDetails(tenantId, requestId ?? '');

      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Mark as viewed
      await asyncCareService.markAsViewed(tenantId, requestId ?? '');

      res.json({ request });
    } catch (error: any) {
      logAsyncCareError('Error fetching request', error);
      res.status(500).json({ error: 'Failed to fetch request' });
    }
  }
);

/**
 * PUT /api/async-care/requests/:id/assign
 * Assign a request to a provider
 */
asyncCareRouter.put(
  '/requests/:id/assign',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = assignProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    try {
      const tenantId = req.user!.tenantId;
      const requestId = req.params.id;

      const request = await asyncCareService.assignToProvider(
        tenantId,
        requestId ?? '',
        parsed.data.providerId
      );

      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json({ request });
    } catch (error: any) {
      logAsyncCareError('Error assigning request', error);
      res.status(500).json({ error: 'Failed to assign request' });
    }
  }
);

/**
 * POST /api/async-care/requests/:id/respond
 * Submit a provider response
 */
asyncCareRouter.post(
  '/requests/:id/respond',
  requireAuth,
  requireRoles(['provider']),
  async (req: AuthedRequest, res) => {
    const parsed = submitResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid response data', details: parsed.error.issues });
    }

    try {
      const tenantId = req.user!.tenantId;
      const requestId = req.params.id;

      // Get provider ID from users table
      const providerResult = await pool.query(
        `SELECT p.id FROM providers p
         JOIN users u ON p.email = u.email
         WHERE u.id = $1 AND p.tenant_id = $2`,
        [req.user!.id, tenantId]
      );

      if (providerResult.rows.length === 0) {
        return res.status(403).json({ error: 'Provider not found' });
      }

      const providerId = providerResult.rows[0].id;

      const response = await asyncCareService.submitResponse(
        tenantId,
        requestId ?? '',
        providerId,
        parsed.data
      );

      res.status(201).json({ response });
    } catch (error: any) {
      logAsyncCareError('Error submitting response', error);
      res.status(500).json({ error: 'Failed to submit response' });
    }
  }
);

/**
 * PUT /api/async-care/requests/:id/status
 * Update request status
 */
asyncCareRouter.put(
  '/requests/:id/status',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const { status } = req.body;

    if (!['pending', 'in_review', 'reviewed', 'responded', 'closed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    try {
      const tenantId = req.user!.tenantId;
      const requestId = req.params.id;

      const request = await asyncCareService.updateRequestStatus(
        tenantId,
        requestId ?? '',
        status,
        req.user!.id
      );

      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json({ request });
    } catch (error: any) {
      logAsyncCareError('Error updating status', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

/**
 * POST /api/async-care/requests/:id/escalate
 * Convert to in-person appointment
 */
asyncCareRouter.post(
  '/requests/:id/escalate',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    const parsed = escalateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    try {
      const tenantId = req.user!.tenantId;
      const requestId = req.params.id;

      const result = await asyncCareService.convertToAppointment(
        tenantId,
        requestId ?? '',
        parsed.data
      );

      res.json(result);
    } catch (error: any) {
      logAsyncCareError('Error escalating request', error);
      res.status(500).json({ error: error.message || 'Failed to escalate request' });
    }
  }
);

/**
 * GET /api/async-care/patient/:patientId/requests (staff view)
 * Get all requests for a specific patient (staff/provider access)
 */
asyncCareRouter.get(
  '/patient/:patientId/requests',
  requireAuth,
  requireRoles(['provider', 'admin', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const patientId = req.params.patientId;

      const requests = await asyncCareService.getPatientRequests(tenantId, patientId ?? '', true);

      res.json({ requests });
    } catch (error: any) {
      logAsyncCareError('Error fetching patient requests', error);
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }
);

/**
 * GET /api/async-care/stats
 * Get queue statistics
 */
asyncCareRouter.get(
  '/stats',
  requireAuth,
  requireRoles(['provider', 'admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      // Get counts by status
      const statusResult = await pool.query(
        `SELECT status, COUNT(*) as count
         FROM async_care_requests
         WHERE tenant_id = $1
         GROUP BY status`,
        [tenantId]
      );

      // Get counts by urgency for pending/in_review
      const urgencyResult = await pool.query(
        `SELECT urgency, COUNT(*) as count
         FROM async_care_requests
         WHERE tenant_id = $1 AND status IN ('pending', 'in_review')
         GROUP BY urgency`,
        [tenantId]
      );

      // Average response time
      const avgTimeResult = await pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (first_viewed_at - submitted_at))/3600) as avg_hours_to_view
         FROM async_care_requests
         WHERE tenant_id = $1 AND first_viewed_at IS NOT NULL`,
        [tenantId]
      );

      const stats = {
        byStatus: {} as Record<string, number>,
        byUrgency: {} as Record<string, number>,
        avgHoursToView: avgTimeResult.rows[0]?.avg_hours_to_view
          ? parseFloat(avgTimeResult.rows[0].avg_hours_to_view).toFixed(1)
          : null,
      };

      for (const row of statusResult.rows) {
        stats.byStatus[row.status] = parseInt(row.count, 10);
      }

      for (const row of urgencyResult.rows) {
        stats.byUrgency[row.urgency] = parseInt(row.count, 10);
      }

      res.json(stats);
    } catch (error: any) {
      logAsyncCareError('Error fetching stats', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  }
);

export default asyncCareRouter;
