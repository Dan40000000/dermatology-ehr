import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { frontDeskService } from '../services/frontDeskService';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import { workflowOrchestrator } from '../services/workflowOrchestrator';
import { pool } from '../db/pool';
import { getAppointmentCheckoutBalanceCents } from '../services/checkoutBalanceService';

const updateStatusSchema = z.object({
  status: z.enum(['scheduled', 'checked_in', 'in_room', 'with_provider', 'checkout', 'completed', 'cancelled', 'no_show']),
});

export const frontDeskRouter = Router();

/**
 * @swagger
 * /api/front-desk/today:
 *   get:
 *     summary: Get today's schedule with all patient details
 *     description: Retrieve today's appointments with insurance, balance, and wait time info
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         description: Filter by provider ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by appointment status
 *     responses:
 *       200:
 *         description: Today's schedule
 */
frontDeskRouter.get(
  '/today',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { providerId, status, date } = req.query;
      const tenantId = req.tenantId!;

      const schedule = await frontDeskService.getTodaySchedule(
        tenantId,
        providerId as string | undefined,
        status as string | undefined,
        date as string | undefined
      );

      res.json({ appointments: schedule });
    } catch (error) {
      logger.error('Error getting today schedule:', error);
      res.status(500).json({ error: 'Failed to get today schedule' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/stats:
 *   get:
 *     summary: Get today's statistics
 *     description: Get daily stats including patient counts, collections, and wait times
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily statistics
 */
frontDeskRouter.get(
  '/stats',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const stats = await frontDeskService.getDailyStats(tenantId);
      res.json(stats);
    } catch (error) {
      logger.error('Error getting daily stats:', error);
      res.status(500).json({ error: 'Failed to get daily stats' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/waiting:
 *   get:
 *     summary: Get waiting room patients
 *     description: Get list of patients who have checked in but not yet roomed
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Waiting room patients
 */
frontDeskRouter.get(
  '/waiting',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const patients = await frontDeskService.getWaitingRoomPatients(tenantId);
      res.json({ patients });
    } catch (error) {
      logger.error('Error getting waiting room patients:', error);
      res.status(500).json({ error: 'Failed to get waiting room patients' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/upcoming:
 *   get:
 *     summary: Get upcoming patients
 *     description: Get next 3-5 patients scheduled to arrive
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of upcoming patients to return
 *     responses:
 *       200:
 *         description: Upcoming patients
 */
frontDeskRouter.get(
  '/upcoming',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const patients = await frontDeskService.getUpcomingPatients(tenantId, limit);
      res.json({ appointments: patients });
    } catch (error) {
      logger.error('Error getting upcoming patients:', error);
      res.status(500).json({ error: 'Failed to get upcoming patients' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/check-in/{appointmentId}:
 *   post:
 *     summary: Check in a patient
 *     description: Mark patient as arrived and checked in
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patient checked in successfully
 */
frontDeskRouter.post(
  '/check-in/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const rawCopayAmountCents = req.body?.copayAmountCents;
      const copayAmountCents =
        typeof rawCopayAmountCents === 'number'
          ? rawCopayAmountCents
          : typeof rawCopayAmountCents === 'string'
            ? Number.parseInt(rawCopayAmountCents, 10)
            : undefined;
      const rawOutstandingBalanceAmountCents = req.body?.outstandingBalanceAmountCents;
      const outstandingBalanceAmountCents =
        typeof rawOutstandingBalanceAmountCents === 'number'
          ? rawOutstandingBalanceAmountCents
          : typeof rawOutstandingBalanceAmountCents === 'string'
            ? Number.parseInt(rawOutstandingBalanceAmountCents, 10)
            : undefined;
      const paymentMethod = ['cash', 'credit', 'debit', 'check'].includes(req.body?.paymentMethod)
        ? req.body.paymentMethod
        : undefined;
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : undefined;
      const priorAuthOverrideReason =
        typeof req.body?.priorAuthOverrideReason === 'string'
          ? req.body.priorAuthOverrideReason.trim().slice(0, 250)
          : undefined;

      const result = await frontDeskService.checkInPatient(tenantId, appointmentId!, {
        collectCopay: req.body?.collectCopay === true,
        collectOutstandingBalance: req.body?.collectOutstandingBalance === true,
        deferCopay: req.body?.deferCopay === true,
        copayAmountCents: Number.isFinite(copayAmountCents as number) ? (copayAmountCents as number) : undefined,
        outstandingBalanceAmountCents: Number.isFinite(outstandingBalanceAmountCents as number)
          ? (outstandingBalanceAmountCents as number)
          : undefined,
        paymentMethod,
        notes,
        priorAuthOverrideReason,
        checkedInBy: userId,
      });

      try {
        await auditLog(tenantId, userId, 'check_in', 'appointment', appointmentId!);
        if (priorAuthOverrideReason) {
          await auditLog(tenantId, userId, 'check_in_prior_auth_override', 'appointment', appointmentId!);
        }
      } catch (auditError) {
        logger.error('Check-in audit log failed:', auditError);
      }

      const payload: {
        success: boolean;
        message: string;
        encounterId?: string;
        copayAmount: number;
        copayAmountCents: number;
        copaySource: 'insurance_profile' | 'manual' | 'none';
        copayDisposition: 'none' | 'collected' | 'deferred';
        copayCollectedAmountCents: number;
        outstandingBalanceCollectedAmountCents?: number;
        totalCollectedAmountCents?: number;
        priorAuthOverrideUsed?: boolean;
        priorAuthStatus?: string;
        eligibilityStatus?: string;
        eligibilityVerifiedAt?: string;
        paymentId?: string;
        paymentReceiptNumber?: string;
        paymentConfirmationEmailSent?: boolean;
        paymentConfirmationEmailAddress?: string;
      } = {
        success: true,
        message: 'Patient checked in successfully',
        copayAmount: result.copayAmount,
        copayAmountCents: result.copayAmountCents,
        copaySource: result.copaySource,
        copayDisposition: result.copayDisposition,
        copayCollectedAmountCents: result.copayCollectedAmountCents,
        outstandingBalanceCollectedAmountCents: result.outstandingBalanceCollectedAmountCents,
        totalCollectedAmountCents: result.totalCollectedAmountCents,
        priorAuthOverrideUsed: result.priorAuthOverrideUsed,
        priorAuthStatus: result.priorAuthStatus,
        eligibilityStatus: result.eligibilityStatus,
        eligibilityVerifiedAt: result.eligibilityVerifiedAt,
        paymentId: result.paymentId,
        paymentReceiptNumber: result.paymentReceiptNumber,
        paymentConfirmationEmailSent: result.paymentConfirmationEmailSent,
        paymentConfirmationEmailAddress: result.paymentConfirmationEmailAddress,
      };
      if (result.encounterId) {
        payload.encounterId = result.encounterId;
      }

      res.json(payload);
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === 'PRIOR_AUTH_REQUIRED') {
        return res.status(400).json({
          error: error.message,
          code: 'PRIOR_AUTH_REQUIRED',
        });
      }
      if (error instanceof Error && error.message === 'Appointment not found') {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      logger.error('Error checking in patient:', error);
      res.status(500).json({ error: 'Failed to check in patient' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/check-out/{appointmentId}:
 *   post:
 *     summary: Check out a patient
 *     description: Mark patient as completed and checked out
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patient checked out successfully
 */
frontDeskRouter.post(
  '/check-out/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const result = await frontDeskService.checkOutPatient(tenantId, appointmentId!);

      try {
        await auditLog(tenantId, userId, 'check_out', 'appointment', appointmentId!);
      } catch (auditError) {
        logger.error('Check-out audit log failed:', auditError);
      }

      res.json({
        success: true,
        message: result.requiresPayment
          ? 'Visit moved to checkout. Payment is due at front desk.'
          : 'Visit moved to checkout. Front desk review required.',
        ...result,
      });
    } catch (error) {
      logger.error('Error checking out patient:', error);
      res.status(500).json({ error: 'Failed to check out patient' });
    }
  }
);

/**
 * @swagger
 * /api/front-desk/status/{appointmentId}:
 *   put:
 *     summary: Update appointment status
 *     description: Update the status of an appointment
 *     tags:
 *       - Front Desk
 *     security:
 *       - bearerAuth: []
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
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [scheduled, checked_in, in_room, with_provider, checkout, completed, cancelled, no_show]
 *     responses:
 *       200:
 *         description: Status updated successfully
 */
frontDeskRouter.put(
  '/status/:appointmentId',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const validation = updateStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid status', details: validation.error.issues });
      }

      const { status } = validation.data;

      if (status === 'completed') {
        const currentStatusResult = await pool.query(
          `SELECT status FROM appointments WHERE tenant_id = $1 AND id = $2`,
          [tenantId, appointmentId]
        );
        const currentStatus = currentStatusResult.rows[0]?.status;
        if (currentStatus && currentStatus !== 'checkout') {
          await frontDeskService.updateAppointmentStatus(tenantId, appointmentId!, 'checkout');
          try {
            await auditLog(tenantId, userId, 'checkout_required_before_completion', 'appointment', appointmentId!);
          } catch (auditError) {
            logger.error('Checkout guard audit log failed:', auditError);
          }
          return res.json({
            success: true,
            status: 'checkout',
            requiresCheckoutReview: true,
            message: 'Visit moved to checkout. Front desk review is required before completion.',
          });
        }

        const checkoutBalanceCents = await getAppointmentCheckoutBalanceCents(tenantId, appointmentId!);
        if (checkoutBalanceCents > 0) {
          return res.status(409).json({
            error: 'Patient has an unresolved checkout balance. Review or post payment before completing the visit.',
            requiresPayment: true,
            paymentDueCents: checkoutBalanceCents,
          });
        }
      }

      await frontDeskService.updateAppointmentStatus(tenantId, appointmentId!, status);

      if (status === 'completed') {
        try {
          await workflowOrchestrator.processEvent({
            type: 'appointment_checkout',
            tenantId,
            userId,
            entityType: 'appointment',
            entityId: appointmentId!,
            data: {},
            timestamp: new Date(),
          });
        } catch (workflowError) {
          logger.error('Failed to run checkout workflow from front desk status:', workflowError);
        }
      }

      try {
        await auditLog(tenantId, userId, 'update_status', 'appointment', appointmentId!);
      } catch (auditError) {
        logger.error('Status update audit log failed:', auditError);
      }

      res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      logger.error('Error updating appointment status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
);
