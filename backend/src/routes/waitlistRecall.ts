import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

// Waitlist service imports
import {
  addToWaitlist,
  removeFromWaitlist,
  getWaitlist,
  getWaitlistEntry,
  matchWaitlistToSlot,
  notifyWaitlistPatient,
  processWaitlistResponse,
  autoFillCancelledSlot,
  getWaitlistStats,
  expireOldNotifications,
  WaitlistPreferences,
  AvailableSlot,
} from '../services/waitlistService';

// Recall campaign service imports
import {
  createRecallCampaign,
  updateRecallCampaign,
  getRecallCampaign,
  listRecallCampaigns,
  identifyRecallPatients,
  addPatientToRecall,
  processRecallOutreach,
  recordRecallContact,
  recordRecallResponse,
  scheduleRecallAppointment,
  getRecallDashboard,
  getPatientRecallHistory,
  getRecallPatients,
  getRecallCampaignTemplates,
  RecallCampaignConfig,
} from '../services/recallCampaignService';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const addToWaitlistSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  appointmentTypeId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  preferredDates: z.array(z.object({
    date: z.string(),
    weight: z.number().optional(),
  })).optional(),
  preferredTimes: z.object({
    morning: z.boolean().optional(),
    afternoon: z.boolean().optional(),
    evening: z.boolean().optional(),
  }).optional(),
  preferredDaysOfWeek: z.array(z.string()).optional(),
  flexibilityDays: z.number().min(0).max(365).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const matchSlotSchema = z.object({
  providerId: z.string().uuid(),
  locationId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  providerName: z.string().optional(),
  locationName: z.string().optional(),
  maxMatches: z.number().min(1).max(50).optional(),
});

const notifyPatientSchema = z.object({
  entryId: z.string().uuid(),
  slot: z.object({
    providerId: z.string().uuid(),
    locationId: z.string().uuid(),
    appointmentTypeId: z.string().uuid(),
    scheduledStart: z.string(),
    scheduledEnd: z.string(),
    providerName: z.string().optional(),
    locationName: z.string().optional(),
  }),
  expirationHours: z.number().min(1).max(168).optional(),
  channel: z.enum(['sms', 'email', 'phone', 'portal', 'auto']).optional(),
});

const respondToNotificationSchema = z.object({
  notificationId: z.string().uuid(),
  accepted: z.boolean(),
  responseNotes: z.string().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  recallType: z.enum([
    'annual_skin_check',
    'melanoma_surveillance',
    'follow_up_visit',
    'treatment_continuation',
    'lab_recheck',
    'prescription_renewal',
    'post_procedure_check',
    'psoriasis_follow_up',
    'acne_follow_up',
    'inactive_patients',
    'custom',
  ]),
  targetCriteria: z.object({
    lastVisitDaysAgo: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    diagnoses: z.array(z.string()).optional(),
    procedures: z.array(z.string()).optional(),
    proceduresWithinDays: z.number().optional(),
    medications: z.array(z.string()).optional(),
    ageRange: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    riskLevel: z.array(z.string()).optional(),
    appointmentTypes: z.array(z.string()).optional(),
    labsDueDaysAgo: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    labTypes: z.array(z.string()).optional(),
    prescriptionExpiringDays: z.number().optional(),
  }).optional(),
  messageTemplate: z.string().optional(),
  messageTemplateSms: z.string().optional(),
  messageTemplateEmail: z.string().optional(),
  channel: z.enum(['sms', 'email', 'phone', 'mail', 'portal', 'multi']).optional(),
  frequencyDays: z.number().min(1).max(365).optional(),
  maxAttempts: z.number().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  autoIdentify: z.boolean().optional(),
  identifySchedule: z.string().optional(),
});

const addPatientToRecallSchema = z.object({
  campaignId: z.string().uuid(),
  patientId: z.string().uuid(),
  reason: z.string().min(1),
  dueDate: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  notes: z.string().optional(),
});

const recordContactSchema = z.object({
  channel: z.enum(['sms', 'email', 'phone', 'mail', 'portal']),
  message: z.string(),
  response: z.string().optional(),
  responseNotes: z.string().optional(),
});

const updateRecallPatientSchema = z.object({
  status: z.enum(['pending', 'contacted', 'scheduled', 'completed', 'declined', 'unable_to_reach', 'dismissed']).optional(),
  appointmentId: z.string().uuid().optional(),
  notes: z.string().optional(),
  dismissedReason: z.string().optional(),
});

// ============================================================================
// WAITLIST ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/waitlist-recall/waitlist:
 *   post:
 *     summary: Add a patient to the waitlist
 *     tags: [Waitlist]
 */
router.post('/waitlist', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const validated = addToWaitlistSchema.parse(req.body);

    const preferences: WaitlistPreferences = {
      providerId: validated.providerId,
      appointmentTypeId: validated.appointmentTypeId,
      locationId: validated.locationId,
      preferredDates: validated.preferredDates,
      preferredTimes: validated.preferredTimes,
      preferredDaysOfWeek: validated.preferredDaysOfWeek,
      flexibilityDays: validated.flexibilityDays,
      priority: validated.priority,
      reason: validated.reason,
      notes: validated.notes,
    };

    const entry = await addToWaitlist(tenantId, validated.patientId, preferences, userId);
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist:
 *   get:
 *     summary: Get waitlist entries
 *     tags: [Waitlist]
 */
router.get('/waitlist', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, priority, providerId, patientId, appointmentTypeId, limit, offset } = req.query;

    const result = await getWaitlist(tenantId, {
      status: status as string | undefined,
      priority: priority as string | undefined,
      providerId: providerId as string | undefined,
      patientId: patientId as string | undefined,
      appointmentTypeId: appointmentTypeId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/{id}:
 *   get:
 *     summary: Get a waitlist entry by ID
 *     tags: [Waitlist]
 */
router.get('/waitlist/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const entry = await getWaitlistEntry(tenantId, id!);
    if (!entry) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/{id}:
 *   delete:
 *     summary: Remove from waitlist
 *     tags: [Waitlist]
 */
router.delete('/waitlist/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { reason } = req.body || {};

    const success = await removeFromWaitlist(tenantId, id!, userId, reason);
    if (!success) {
      return res.status(404).json({ error: 'Waitlist entry not found or already removed' });
    }

    res.json({ message: 'Removed from waitlist' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/match:
 *   post:
 *     summary: Find waitlist matches for an available slot
 *     tags: [Waitlist]
 */
router.post('/waitlist/match', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const validated = matchSlotSchema.parse(req.body);

    const slot: AvailableSlot = {
      providerId: validated.providerId,
      locationId: validated.locationId,
      appointmentTypeId: validated.appointmentTypeId,
      scheduledStart: validated.scheduledStart,
      scheduledEnd: validated.scheduledEnd,
      providerName: validated.providerName,
      locationName: validated.locationName,
    };

    const matches = await matchWaitlistToSlot(tenantId, slot, validated.maxMatches || 10);
    res.json({ matches });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/notify:
 *   post:
 *     summary: Notify a waitlist patient about an available slot
 *     tags: [Waitlist]
 */
router.post('/waitlist/notify', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const validated = notifyPatientSchema.parse(req.body);

    const notification = await notifyWaitlistPatient(
      tenantId,
      validated.entryId,
      validated.slot,
      validated.expirationHours || 24,
      validated.channel || 'sms'
    );

    res.json(notification);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/respond:
 *   post:
 *     summary: Process patient response to waitlist notification
 *     tags: [Waitlist]
 */
router.post('/waitlist/respond', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const validated = respondToNotificationSchema.parse(req.body);

    const result = await processWaitlistResponse(
      tenantId,
      validated.notificationId,
      validated.accepted,
      validated.responseNotes
    );

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/auto-fill/{appointmentId}:
 *   post:
 *     summary: Auto-fill a cancelled appointment from waitlist
 *     tags: [Waitlist]
 */
router.post('/waitlist/auto-fill/:appointmentId', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { appointmentId } = req.params;
    const { maxNotifications } = req.body || {};

    const result = await autoFillCancelledSlot(
      tenantId,
      appointmentId!,
      maxNotifications || 3
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/stats:
 *   get:
 *     summary: Get waitlist statistics
 *     tags: [Waitlist]
 */
router.get('/waitlist/stats', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const stats = await getWaitlistStats(tenantId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/waitlist/expire-notifications:
 *   post:
 *     summary: Expire old waitlist notifications (admin)
 *     tags: [Waitlist]
 */
router.post('/waitlist/expire-notifications', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const expiredCount = await expireOldNotifications(tenantId);
    res.json({ expiredCount });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RECALL CAMPAIGN ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns:
 *   post:
 *     summary: Create a recall campaign
 *     tags: [Recall]
 */
router.post('/recall/campaigns', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const validated = createCampaignSchema.parse(req.body);

    const config: RecallCampaignConfig = {
      name: validated.name,
      description: validated.description,
      recallType: validated.recallType,
      targetCriteria: validated.targetCriteria || {},
      messageTemplate: validated.messageTemplate,
      messageTemplateSms: validated.messageTemplateSms,
      messageTemplateEmail: validated.messageTemplateEmail,
      channel: validated.channel,
      frequencyDays: validated.frequencyDays,
      maxAttempts: validated.maxAttempts,
      isActive: validated.isActive,
      autoIdentify: validated.autoIdentify,
      identifySchedule: validated.identifySchedule,
    };

    const campaign = await createRecallCampaign(tenantId, config, userId);
    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns:
 *   get:
 *     summary: List recall campaigns
 *     tags: [Recall]
 */
router.get('/recall/campaigns', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { activeOnly } = req.query;

    const campaigns = await listRecallCampaigns(tenantId, activeOnly === 'true');
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns/{id}:
 *   get:
 *     summary: Get campaign details
 *     tags: [Recall]
 */
router.get('/recall/campaigns/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const campaign = await getRecallCampaign(tenantId, id!);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns/{id}:
 *   patch:
 *     summary: Update a campaign
 *     tags: [Recall]
 */
router.patch('/recall/campaigns/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const campaign = await updateRecallCampaign(tenantId, id!, req.body);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns/{id}/identify:
 *   post:
 *     summary: Identify patients matching campaign criteria
 *     tags: [Recall]
 */
router.post('/recall/campaigns/:id/identify', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await identifyRecallPatients(tenantId, id!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/campaigns/{id}/process:
 *   post:
 *     summary: Process outreach for a campaign
 *     tags: [Recall]
 */
router.post('/recall/campaigns/:id/process', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { limit } = req.body || {};

    const result = await processRecallOutreach(tenantId, id!, limit || 50);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/templates:
 *   get:
 *     summary: Get campaign templates
 *     tags: [Recall]
 */
router.get('/recall/templates', async (req: AuthedRequest, res, next) => {
  try {
    const templates = await getRecallCampaignTemplates();
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RECALL PATIENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/waitlist-recall/recall/patients:
 *   get:
 *     summary: Get recall patients
 *     tags: [Recall]
 */
router.get('/recall/patients', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { campaignId, status, dueDateFrom, dueDateTo, limit, offset } = req.query;

    const result = await getRecallPatients(tenantId, {
      campaignId: campaignId as string | undefined,
      status: status as string | undefined,
      dueDateFrom: dueDateFrom as string | undefined,
      dueDateTo: dueDateTo as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/patients:
 *   post:
 *     summary: Add a patient to recall manually
 *     tags: [Recall]
 */
router.post('/recall/patients', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const validated = addPatientToRecallSchema.parse(req.body);

    const recallPatient = await addPatientToRecall(
      tenantId,
      validated.campaignId,
      validated.patientId,
      validated.reason,
      validated.dueDate,
      validated.priority || 'normal',
      'manual',
      validated.notes,
      userId
    );

    res.status(201).json(recallPatient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/patients/{id}:
 *   patch:
 *     summary: Update recall patient status
 *     tags: [Recall]
 */
router.patch('/recall/patients/:id', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const validated = updateRecallPatientSchema.parse(req.body);

    // Handle appointment scheduling
    if (validated.appointmentId) {
      const result = await scheduleRecallAppointment(tenantId, id!, validated.appointmentId);
      if (!result) {
        return res.status(404).json({ error: 'Recall patient not found' });
      }
      return res.json(result);
    }

    // Handle status updates
    if (validated.status) {
      const response = validated.status === 'scheduled' ? 'scheduled' :
                       validated.status === 'declined' ? 'declined' :
                       'call_back_requested';
      const result = await recordRecallResponse(tenantId, id!, response, validated.notes);
      if (!result) {
        return res.status(404).json({ error: 'Recall patient not found' });
      }
      return res.json(result);
    }

    res.status(400).json({ error: 'No valid update provided' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/patients/{id}/contact:
 *   post:
 *     summary: Log a contact attempt
 *     tags: [Recall]
 */
router.post('/recall/patients/:id/contact', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const validated = recordContactSchema.parse(req.body);

    const contactLog = await recordRecallContact(
      tenantId,
      id!,
      validated.channel,
      validated.message,
      userId,
      validated.response,
      validated.responseNotes
    );

    res.status(201).json(contactLog);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    next(error);
  }
});

// ============================================================================
// RECALL DASHBOARD & HISTORY
// ============================================================================

/**
 * @swagger
 * /api/waitlist-recall/recall/dashboard:
 *   get:
 *     summary: Get recall dashboard
 *     tags: [Recall]
 */
router.get('/recall/dashboard', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const dashboard = await getRecallDashboard(tenantId);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/waitlist-recall/recall/patient/{patientId}/history:
 *   get:
 *     summary: Get patient recall history
 *     tags: [Recall]
 */
router.get('/recall/patient/:patientId/history', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId } = req.params;

    const history = await getPatientRecallHistory(tenantId, patientId!);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// INTEGRATION ENDPOINTS
// ============================================================================

/**
 * Integration endpoint: Called when an appointment is cancelled
 * This triggers the waitlist auto-fill process
 */
router.post('/integration/appointment-cancelled', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
    }

    // Trigger auto-fill
    const result = await autoFillCancelledSlot(tenantId, appointmentId, 3);

    logger.info('Appointment cancellation processed for waitlist', {
      tenantId,
      appointmentId,
      matchesFound: result.matchesFound,
      notificationsSent: result.notificationsSent,
    });

    res.json({
      message: 'Appointment cancellation processed',
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Integration endpoint: Called when an appointment is scheduled from recall
 */
router.post('/integration/recall-scheduled', async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { recallPatientId, appointmentId } = req.body;

    if (!recallPatientId || !appointmentId) {
      return res.status(400).json({ error: 'recallPatientId and appointmentId are required' });
    }

    const result = await scheduleRecallAppointment(tenantId, recallPatientId, appointmentId);
    if (!result) {
      return res.status(404).json({ error: 'Recall patient not found' });
    }

    res.json({
      message: 'Recall appointment linked',
      recallPatient: result,
    });
  } catch (error) {
    next(error);
  }
});

export const waitlistRecallRouter = router;
export default router;
