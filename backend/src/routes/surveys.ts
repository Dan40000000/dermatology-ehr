/**
 * Survey Routes
 * API endpoints for patient surveys, NPS tracking, and review management
 */

import { Router, Response, Request } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { SurveyService } from '../services/surveyService';
import { logger } from '../lib/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  survey_type: z.enum(['post_visit', 'nps', 'feedback', 'satisfaction']).default('post_visit'),
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(['nps', 'stars', 'rating', 'text', 'multiple_choice', 'checkbox']),
    text: z.string(),
    required: z.boolean().default(true),
    options: z.array(z.string()).optional(),
    category: z.string().optional(),
    order: z.number(),
  })),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  send_delay_hours: z.number().min(0).max(168).default(2),
  reminder_delay_hours: z.number().min(0).max(336).default(48),
  expiration_hours: z.number().min(24).max(720).default(168),
  thank_you_message: z.string().optional(),
  enable_review_prompt: z.boolean().default(true),
  review_prompt_threshold: z.number().min(0).max(10).default(9),
  google_review_url: z.string().url().optional().nullable(),
  healthgrades_url: z.string().url().optional().nullable(),
  yelp_url: z.string().url().optional().nullable(),
});

const submitSurveySchema = z.object({
  question_responses: z.array(z.object({
    question_id: z.string(),
    question_text: z.string(),
    answer: z.union([z.string(), z.number(), z.array(z.string())]),
    answer_type: z.string(),
  })),
  nps_score: z.number().min(0).max(10).optional(),
  wait_time_rating: z.number().min(1).max(5).optional(),
  staff_friendliness_rating: z.number().min(1).max(5).optional(),
  provider_communication_rating: z.number().min(1).max(5).optional(),
  facility_cleanliness_rating: z.number().min(1).max(5).optional(),
  overall_satisfaction_rating: z.number().min(1).max(5).optional(),
  comments: z.string().optional(),
  improvement_suggestions: z.string().optional(),
  response_time_seconds: z.number().optional(),
});

const dateRangeSchema = z.object({
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
});

const sendReviewRequestSchema = z.object({
  patientId: z.string().uuid(),
  platform: z.enum(['google', 'healthgrades', 'yelp', 'facebook', 'zocdoc']),
  encounterId: z.string().uuid().optional(),
  responseId: z.string().uuid().optional(),
  npsScore: z.number().min(0).max(10).optional(),
});

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

/**
 * GET /api/surveys/:token
 * Get survey by access token (public, no auth required)
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token || token.length !== 64) {
      return res.status(400).json({ error: 'Invalid survey token' });
    }

    const survey = await SurveyService.getSurveyByToken(token);

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found or expired' });
    }

    res.json({
      invitation: {
        id: survey.invitation.id,
        status: survey.invitation.status,
        expires_at: survey.invitation.expires_at,
      },
      template: {
        name: survey.template.name,
        description: survey.template.description,
        questions: survey.template.questions,
        thank_you_message: survey.template.thank_you_message,
        enable_review_prompt: survey.template.enable_review_prompt,
      },
      patient: {
        first_name: survey.patient.first_name,
      },
      provider: survey.provider ? {
        name: `${survey.provider.first_name} ${survey.provider.last_name}`,
      } : null,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching survey', { error: errorMessage, token: req.params.token });
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

/**
 * POST /api/surveys/:token/submit
 * Submit survey response (public, no auth required)
 */
router.post('/:token/submit', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token || token.length !== 64) {
      return res.status(400).json({ error: 'Invalid survey token' });
    }

    // Get survey to verify it exists and get invitation ID
    const survey = await SurveyService.getSurveyByToken(token);

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found or expired' });
    }

    const validatedData = submitSurveySchema.parse(req.body);

    // Get device/browser info from request
    const userAgent = req.get('user-agent') || '';
    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/tablet/i.test(userAgent)) {
      deviceType = 'tablet';
    }

    const result = await SurveyService.submitSurvey(
      survey.invitation.id,
      validatedData,
      {
        ip_address: req.ip,
        device_type: deviceType,
        browser: userAgent.substring(0, 100),
      }
    );

    res.json({
      success: true,
      thank_you_message: survey.template.thank_you_message,
      show_review_prompt: result.showReviewPrompt,
      review_urls: result.reviewUrls,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error submitting survey', { error: errorMessage, token: req.params.token });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to submit survey' });
  }
});

/**
 * POST /api/surveys/review-click/:requestId
 * Track review link click (public)
 */
router.post('/review-click/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    await SurveyService.trackReviewClick(requestId);

    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error tracking review click', { error: errorMessage, requestId: req.params.requestId });
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================

/**
 * POST /api/surveys/send/:encounterId
 * Send post-visit survey for an encounter
 */
router.post('/send/:encounterId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { encounterId } = req.params;

    if (!encounterId) {
      return res.status(400).json({ error: 'Encounter ID is required' });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const { templateId, deliveryMethod } = req.body;

    const invitation = await SurveyService.sendPostVisitSurvey(
      encounterId,
      tenantId,
      {
        templateId,
        deliveryMethod,
        checkoutUserId: userId,
      }
    );

    if (!invitation) {
      return res.status(400).json({
        error: 'Could not create survey invitation',
        details: 'Patient may not have contact info or survey already sent',
      });
    }

    logger.info('Survey sent', {
      encounterId,
      invitationId: invitation.id,
      userId,
    });

    res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        expires_at: invitation.expires_at,
        status: invitation.status,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error sending survey', { error: errorMessage, encounterId: req.params.encounterId });
    res.status(500).json({ error: 'Failed to send survey' });
  }
});

/**
 * GET /api/surveys/templates
 * Get all survey templates
 */
router.get('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const templates = await SurveyService.getTemplates(tenantId);

    res.json({ templates });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching templates', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/surveys/templates
 * Create a new survey template
 */
router.post('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const validatedData = createTemplateSchema.parse(req.body);

    const template = await SurveyService.createTemplate(tenantId, userId, validatedData);

    logger.info('Survey template created', {
      templateId: template.id,
      name: template.name,
      userId,
    });

    res.status(201).json({ template });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating template', { error: errorMessage });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * GET /api/surveys/analytics/nps
 * Get NPS analytics dashboard data
 */
router.get('/analytics/nps', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate, providerId } = req.query;

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const npsData = await SurveyService.calculateNPS(
      tenantId,
      { startDate: start, endDate: end },
      providerId as string | undefined
    );

    res.json(npsData);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching NPS analytics', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch NPS analytics' });
  }
});

/**
 * GET /api/surveys/analytics/feedback
 * Get detailed feedback summary
 */
router.get('/analytics/feedback', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate, providerId, limit } = req.query;

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const feedback = await SurveyService.getDetailedFeedback(
      tenantId,
      { startDate: start, endDate: end },
      {
        providerId: providerId as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      }
    );

    res.json(feedback);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching feedback', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

/**
 * POST /api/surveys/review-request
 * Send a review request to a patient
 */
router.post('/review-request', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const validatedData = sendReviewRequestSchema.parse(req.body);

    const result = await SurveyService.sendReviewRequest(
      tenantId,
      validatedData.patientId,
      validatedData.platform,
      {
        encounterId: validatedData.encounterId,
        responseId: validatedData.responseId,
        npsScore: validatedData.npsScore,
      }
    );

    res.status(201).json(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error sending review request', { error: errorMessage });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    res.status(500).json({ error: 'Failed to send review request' });
  }
});

/**
 * GET /api/surveys/analytics/reviews
 * Get review request statistics
 */
router.get('/analytics/reviews', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = await SurveyService.getReviewStats(
      tenantId,
      { startDate: start, endDate: end }
    );

    res.json(stats);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching review stats', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch review statistics' });
  }
});

/**
 * GET /api/surveys/alerts
 * Get pending feedback alerts
 */
router.get('/alerts', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, status, limit } = req.query;

    const alerts = await SurveyService.getPendingAlerts(tenantId, {
      providerId: providerId as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ alerts });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching alerts', { error: errorMessage });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * PUT /api/surveys/alerts/:alertId
 * Update feedback alert status
 */
router.put('/alerts/:alertId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { alertId } = req.params;

    if (!alertId) {
      return res.status(400).json({ error: 'Alert ID is required' });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const { status, notes } = req.body;

    if (!['acknowledged', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await SurveyService.updateAlertStatus(alertId, tenantId, userId, status, notes);

    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating alert', { error: errorMessage, alertId: req.params.alertId });
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

/**
 * GET /api/surveys/patient/:patientId
 * Get survey history for a patient
 */
router.get('/patient/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const tenantId = req.user!.tenantId;
    const { limit } = req.query;

    const surveys = await SurveyService.getPatientSurveys(tenantId, patientId, {
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ surveys });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching patient surveys', { error: errorMessage, patientId: req.params.patientId });
    res.status(500).json({ error: 'Failed to fetch patient surveys' });
  }
});

export { router as surveysRouter };
