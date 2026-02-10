/**
 * Wait Time API Routes
 *
 * Provides endpoints for:
 * - Public display data (no auth required)
 * - Individual wait estimates
 * - Queue management
 * - Analytics
 * - Patient notifications
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { waitTimeService } from '../services/waitTimeService';
import { logger } from '../lib/logger';

export const waitTimeRouter = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const updateKioskConfigSchema = z.object({
  displayMode: z.enum(['waiting_room_tv', 'kiosk', 'both']).optional(),
  welcomeMessage: z.string().max(500).optional(),
  showWaitTime: z.boolean().optional(),
  customBranding: z
    .object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      practiceName: z.string().optional(),
    })
    .optional(),
  anonymizeNames: z.boolean().optional(),
  useQueueNumbers: z.boolean().optional(),
  showProviderNames: z.boolean().optional(),
  refreshIntervalSeconds: z.number().min(10).max(300).optional(),
  showEstimatedTimes: z.boolean().optional(),
  showQueuePosition: z.boolean().optional(),
  enableSmsUpdates: z.boolean().optional(),
  smsDelayThresholdMinutes: z.number().min(5).max(60).optional(),
});

const updatePatientStatusSchema = z.object({
  status: z.enum(['called', 'in_room', 'complete', 'no_show']),
  roomNumber: z.string().optional(),
});

const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

/**
 * @swagger
 * /api/wait-time/display/{locationId}:
 *   get:
 *     summary: Get waiting room display data
 *     description: Public endpoint for waiting room TV displays. No authentication required.
 *     tags:
 *       - Wait Time
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Location ID
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Waiting room display data
 */
waitTimeRouter.get('/display/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const displayData = await waitTimeService.getWaitingRoomDisplay(
      locationId,
      tenantId
    );

    // Filter out sensitive data for public display
    const publicData = {
      locationId: displayData.locationId,
      locationName: displayData.locationName,
      currentWait: displayData.currentWait,
      queue: displayData.queue.map((entry) => ({
        displayName: entry.displayName,
        queueNumber: entry.queueNumber,
        position: displayData.config.showQueuePosition ? entry.position : null,
        status: entry.status,
        providerName: displayData.config.showProviderNames
          ? entry.providerName
          : null,
        estimatedWaitMinutes: displayData.config.showEstimatedTimes
          ? entry.estimatedWaitMinutes
          : null,
        roomNumber: entry.status === 'called' ? entry.roomNumber : null,
      })),
      providerStatus: displayData.config.showProviderNames
        ? displayData.providerStatus.map((p) => ({
            providerName: p.providerName,
            status: p.status,
            delayMinutes: p.delayMinutes > 0 ? p.delayMinutes : null,
          }))
        : [],
      config: {
        welcomeMessage: displayData.config.welcomeMessage,
        customBranding: displayData.config.customBranding,
        refreshIntervalSeconds: displayData.config.refreshIntervalSeconds,
        showWaitTime: displayData.config.showWaitTime,
      },
      lastUpdated: displayData.lastUpdated,
    };

    return res.json(publicData);
  } catch (error) {
    logger.error('Error getting display data', { error });
    if (error instanceof Error && error.message === 'Location not found') {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.status(500).json({ error: 'Failed to get display data' });
  }
});

/**
 * @swagger
 * /api/wait-time/kiosk-config/{locationId}:
 *   get:
 *     summary: Get kiosk configuration
 *     description: Get display configuration for a location's kiosk
 *     tags:
 *       - Wait Time
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kiosk configuration
 */
waitTimeRouter.get('/kiosk-config/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const config = await waitTimeService.getKioskConfig(locationId, tenantId);

    // Return only public configuration fields
    return res.json({
      welcomeMessage: config.welcomeMessage,
      showWaitTime: config.showWaitTime,
      customBranding: config.customBranding,
      anonymizeNames: config.anonymizeNames,
      useQueueNumbers: config.useQueueNumbers,
      showProviderNames: config.showProviderNames,
      refreshIntervalSeconds: config.refreshIntervalSeconds,
      showEstimatedTimes: config.showEstimatedTimes,
      showQueuePosition: config.showQueuePosition,
    });
  } catch (error) {
    logger.error('Error getting kiosk config', { error });
    return res.status(500).json({ error: 'Failed to get kiosk configuration' });
  }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================

/**
 * @swagger
 * /api/wait-time/estimate/{appointmentId}:
 *   get:
 *     summary: Get individual wait time estimate
 *     description: Get detailed wait time estimate for a specific appointment
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wait time estimate
 */
waitTimeRouter.get(
  '/estimate/:appointmentId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;

      const estimate = await waitTimeService.calculateEstimatedWait(
        appointmentId ?? '',
        tenantId ?? ''
      );

      return res.json(estimate);
    } catch (error) {
      logger.error('Error calculating wait estimate', { error });
      if (
        error instanceof Error &&
        error.message === 'Appointment not found in queue'
      ) {
        return res.status(404).json({ error: 'Appointment not in queue' });
      }
      return res.status(500).json({ error: 'Failed to calculate wait time' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/queue/{locationId}:
 *   get:
 *     summary: Get full queue for location
 *     description: Get complete queue data for a location (staff view)
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full queue data
 */
waitTimeRouter.get(
  '/queue/:locationId',
  requireAuth,
  requireRoles(['admin', 'provider', 'staff', 'front_desk', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const tenantId = req.tenantId!;

      const displayData = await waitTimeService.getWaitingRoomDisplay(
        locationId ?? '',
        tenantId ?? ''
      );

      return res.json(displayData);
    } catch (error) {
      logger.error('Error getting queue', { error });
      return res.status(500).json({ error: 'Failed to get queue' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/analytics:
 *   get:
 *     summary: Get wait time analytics
 *     description: Get wait time analytics for a location and date range
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Wait time analytics
 */
waitTimeRouter.get(
  '/analytics',
  requireAuth,
  requireRoles(['admin', 'provider', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId, startDate, endDate } = req.query;
      const tenantId = req.tenantId!;

      if (!locationId || !startDate || !endDate) {
        return res.status(400).json({
          error: 'locationId, startDate, and endDate are required',
        });
      }

      const parsed = analyticsQuerySchema.safeParse({ startDate, endDate });
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid date format. Use YYYY-MM-DD',
        });
      }

      const analytics = await waitTimeService.getWaitTimeAnalytics(
        locationId as string,
        tenantId,
        startDate as string,
        endDate as string
      );

      return res.json(analytics);
    } catch (error) {
      logger.error('Error getting analytics', { error });
      return res.status(500).json({ error: 'Failed to get analytics' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/historical/{locationId}:
 *   get:
 *     summary: Get historical wait times
 *     description: Get historical average wait times by time slot
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: dayOfWeek
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 6
 *     responses:
 *       200:
 *         description: Historical wait times
 */
waitTimeRouter.get(
  '/historical/:locationId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const { dayOfWeek } = req.query;
      const tenantId = req.tenantId!;

      const historicalData = await waitTimeService.getHistoricalWaitTimes(
        locationId ?? '',
        tenantId ?? '',
        dayOfWeek !== undefined ? parseInt(dayOfWeek as string, 10) : undefined
      );

      return res.json(historicalData);
    } catch (error) {
      logger.error('Error getting historical data', { error });
      return res.status(500).json({ error: 'Failed to get historical data' });
    }
  }
);

// ============================================
// QUEUE MANAGEMENT ROUTES
// ============================================

/**
 * @swagger
 * /api/wait-time/queue/add/{appointmentId}:
 *   post:
 *     summary: Add patient to queue
 *     description: Add a patient to the waiting queue on check-in
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Patient added to queue
 */
waitTimeRouter.post(
  '/queue/add/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'provider', 'staff', 'front_desk', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const { customDisplayName } = req.body;
      const tenantId = req.tenantId!;

      const queueEntry = await waitTimeService.addToQueue(
        appointmentId ?? '',
        tenantId ?? '',
        { customDisplayName }
      );

      return res.status(201).json(queueEntry);
    } catch (error) {
      logger.error('Error adding to queue', { error });
      if (error instanceof Error && error.message === 'Appointment not found') {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      return res.status(500).json({ error: 'Failed to add to queue' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/queue/status/{appointmentId}:
 *   put:
 *     summary: Update patient status
 *     description: Update a patient's status in the queue
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [called, in_room, complete, no_show]
 *               roomNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 */
waitTimeRouter.put(
  '/queue/status/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'provider', 'staff', 'front_desk', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;

      const parsed = updatePatientStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      await waitTimeService.updatePatientStatus(
        appointmentId ?? '',
        tenantId ?? '',
        parsed.data.status,
        parsed.data.roomNumber
      );

      return res.json({ success: true, status: parsed.data.status });
    } catch (error) {
      logger.error('Error updating status', { error });
      if (
        error instanceof Error &&
        error.message === 'Patient not found in queue'
      ) {
        return res.status(404).json({ error: 'Patient not in queue' });
      }
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

// ============================================
// NOTIFICATION ROUTES
// ============================================

/**
 * @swagger
 * /api/wait-time/notify/{appointmentId}:
 *   post:
 *     summary: Send wait time notification
 *     description: Send SMS notification to patient about wait time
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification result
 */
waitTimeRouter.post(
  '/notify/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'provider', 'staff', 'front_desk', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;

      const result = await waitTimeService.notifyPatientUpdate(
        appointmentId ?? '',
        tenantId ?? ''
      );

      return res.json(result);
    } catch (error) {
      logger.error('Error sending notification', { error });
      return res.status(500).json({ error: 'Failed to send notification' });
    }
  }
);

// ============================================
// CONFIGURATION ROUTES
// ============================================

/**
 * @swagger
 * /api/wait-time/config/{locationId}:
 *   get:
 *     summary: Get full kiosk configuration
 *     description: Get complete kiosk configuration (admin view)
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full kiosk configuration
 */
waitTimeRouter.get(
  '/config/:locationId',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const tenantId = req.tenantId!;

      const config = await waitTimeService.getKioskConfig(locationId ?? '', tenantId ?? '');

      return res.json(config);
    } catch (error) {
      logger.error('Error getting config', { error });
      return res.status(500).json({ error: 'Failed to get configuration' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/config/{locationId}:
 *   put:
 *     summary: Update kiosk configuration
 *     description: Update kiosk configuration for a location
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayMode:
 *                 type: string
 *                 enum: [waiting_room_tv, kiosk, both]
 *               welcomeMessage:
 *                 type: string
 *               showWaitTime:
 *                 type: boolean
 *               customBranding:
 *                 type: object
 *               anonymizeNames:
 *                 type: boolean
 *               useQueueNumbers:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated configuration
 */
waitTimeRouter.put(
  '/config/:locationId',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const tenantId = req.tenantId!;

      const parsed = updateKioskConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const config = await waitTimeService.updateKioskConfig(
        locationId ?? '',
        tenantId ?? '',
        parsed.data
      );

      return res.json(config);
    } catch (error) {
      logger.error('Error updating config', { error });
      return res.status(500).json({ error: 'Failed to update configuration' });
    }
  }
);

// ============================================
// SNAPSHOT ROUTES
// ============================================

/**
 * @swagger
 * /api/wait-time/snapshot/{locationId}:
 *   post:
 *     summary: Capture wait time snapshot
 *     description: Capture a snapshot of current wait times for analytics
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Snapshot captured
 */
waitTimeRouter.post(
  '/snapshot/:locationId',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const tenantId = req.tenantId!;

      const snapshot = await waitTimeService.captureWaitTimeSnapshot(
        locationId ?? '',
        tenantId ?? ''
      );

      return res.status(201).json(snapshot);
    } catch (error) {
      logger.error('Error capturing snapshot', { error });
      return res.status(500).json({ error: 'Failed to capture snapshot' });
    }
  }
);

/**
 * @swagger
 * /api/wait-time/update-averages/{locationId}:
 *   post:
 *     summary: Update historical averages
 *     description: Recalculate historical wait time averages
 *     tags:
 *       - Wait Time
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Averages updated
 */
waitTimeRouter.post(
  '/update-averages/:locationId',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const { locationId } = req.params;
      const tenantId = req.tenantId!;

      await waitTimeService.updateHistoricalAverages(locationId ?? '', tenantId ?? '');

      return res.json({ success: true, message: 'Historical averages updated' });
    } catch (error) {
      logger.error('Error updating averages', { error });
      return res.status(500).json({ error: 'Failed to update averages' });
    }
  }
);

export default waitTimeRouter;
