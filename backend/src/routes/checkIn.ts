/**
 * Patient Check-In API Routes
 *
 * Endpoints:
 * GET /api/check-in/status/:appointmentId - Get check-in status
 * POST /api/check-in/eligibility/:patientId - Get eligibility for check-in
 * POST /api/check-in/refresh-eligibility/:patientId - Refresh eligibility
 * POST /api/check-in/complete - Complete check-in process
 * GET /api/check-in/today - Get today's check-ins
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { createAuditLog } from '../services/audit';
import { logger } from '../lib/logger';
import {
  getPatientEligibilityForCheckIn,
  refreshEligibilityAtCheckIn,
  completeCheckIn,
  getCheckInStatus,
  calculateEstimatedResponsibility,
} from '../services/checkInService';
import { pool } from '../db/pool';

const completeCheckInSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  copayCollected: z.boolean().optional(),
  copayAmountCents: z.number().int().optional(),
  paymentMethod: z.enum(['cash', 'credit', 'debit', 'check']).optional(),
  insuranceUpdates: z.object({
    insuranceProvider: z.string().optional(),
    insuranceMemberId: z.string().optional(),
    insuranceGroupNumber: z.string().optional(),
    insurancePayerId: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
});

export const checkInRouter = Router();

/**
 * @swagger
 * /api/check-in/eligibility/{patientId}:
 *   post:
 *     summary: Get patient eligibility for check-in
 *     description: Retrieves patient eligibility status and determines if refresh is needed
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: appointmentId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Patient eligibility data
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Server error
 */
checkInRouter.post(
  '/eligibility/:patientId',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const { appointmentId } = req.query;
      const tenantId = req.headers['x-tenant-id'] as string;

      const eligibilityData = await getPatientEligibilityForCheckIn(
        patientId!,
        tenantId,
        appointmentId as string | undefined
      );

      res.json({
        success: true,
        data: eligibilityData,
      });
    } catch (error) {
      logger.error('Error getting patient eligibility for check-in', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get patient eligibility',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/check-in/refresh-eligibility/{patientId}:
 *   post:
 *     summary: Refresh patient eligibility during check-in
 *     description: Performs real-time eligibility verification and updates patient record
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: appointmentId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Eligibility refreshed successfully
 *       500:
 *         description: Server error
 */
checkInRouter.post(
  '/refresh-eligibility/:patientId',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const { appointmentId } = req.query;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Refreshing eligibility at check-in', {
        patientId,
        appointmentId,
        userId,
      });

      const verification = await refreshEligibilityAtCheckIn(
        patientId!,
        tenantId,
        appointmentId as string | undefined,
        userId
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'check_in.eligibility_refreshed',
        resourceType: 'patient',
        resourceId: patientId,
        metadata: {
          verificationId: verification.id,
          appointmentId,
          status: verification.verificationStatus,
        },
      });

      res.json({
        success: true,
        verification,
      });
    } catch (error) {
      logger.error('Error refreshing eligibility at check-in', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to refresh eligibility',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/check-in/complete:
 *   post:
 *     summary: Complete patient check-in
 *     description: Completes the check-in process including eligibility refresh, copay collection, and status update
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               appointmentId:
 *                 type: string
 *                 format: uuid
 *               copayCollected:
 *                 type: boolean
 *               copayAmountCents:
 *                 type: integer
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, credit, debit, check]
 *               insuranceUpdates:
 *                 type: object
 *                 properties:
 *                   insuranceProvider:
 *                     type: string
 *                   insuranceMemberId:
 *                     type: string
 *                   insuranceGroupNumber:
 *                     type: string
 *                   insurancePayerId:
 *                     type: string
 *     responses:
 *       200:
 *         description: Check-in completed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
checkInRouter.post(
  '/complete',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const validatedData = completeCheckInSchema.parse(req.body);
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id ?? 'system';

      logger.info('Completing patient check-in', {
        tenantId,
        userId,
        patientId: validatedData.patientId,
        appointmentId: validatedData.appointmentId,
      });

      // Get patient eligibility first
      const eligibilityData = await getPatientEligibilityForCheckIn(
        validatedData.patientId,
        tenantId,
        validatedData.appointmentId
      );

      // Complete check-in
      const result = await completeCheckIn(
        {
          ...eligibilityData,
          ...validatedData,
        },
        userId
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'check_in.completed',
        resourceType: 'patient',
        resourceId: validatedData.patientId,
        metadata: {
          checkInId: result.checkInId,
          appointmentId: validatedData.appointmentId,
          eligibilityRefreshed: result.eligibilityRefreshed,
          copayCollected: result.copayCollected,
          insuranceUpdated: result.insuranceUpdated,
        },
      });

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error completing check-in', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to complete check-in',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/check-in/status/{appointmentId}:
 *   get:
 *     summary: Get check-in status for appointment
 *     description: Returns the check-in status and details for a specific appointment
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Check-in status
 *       500:
 *         description: Server error
 */
checkInRouter.get(
  '/status/:appointmentId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;

      const status = await getCheckInStatus(appointmentId!, tenantId);

      res.json({
        success: true,
        status,
        checkedIn: !!status,
      });
    } catch (error) {
      logger.error('Error getting check-in status', {
        error: (error as Error).message,
        appointmentId: req.params.appointmentId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get check-in status',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/check-in/today:
 *   get:
 *     summary: Get today's check-ins
 *     description: Returns list of all patients checked in today
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Today's check-ins
 *       500:
 *         description: Server error
 */
checkInRouter.get(
  '/today',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const result = await pool.query(
        `SELECT * FROM get_todays_check_ins($1)`,
        [tenantId]
      );

      res.json({
        success: true,
        checkIns: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      logger.error('Error getting today\'s check-ins', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get today\'s check-ins',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/check-in/estimate-responsibility:
 *   post:
 *     summary: Calculate estimated patient responsibility
 *     description: Calculates what the patient will owe based on eligibility and service cost
 *     tags:
 *       - Check-In
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - estimatedServiceCostCents
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               estimatedServiceCostCents:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Estimated patient responsibility
 *       500:
 *         description: Server error
 */
checkInRouter.post(
  '/estimate-responsibility',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, estimatedServiceCostCents } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;

      // Get patient eligibility
      const patientResult = await pool.query(
        `SELECT
          copay_amount_cents,
          deductible_remaining_cents,
          coinsurance_percent
         FROM patients
         WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient not found',
        });
      }

      const eligibility = patientResult.rows[0];
      const estimate = calculateEstimatedResponsibility(
        eligibility,
        estimatedServiceCostCents
      );

      res.json({
        success: true,
        estimate,
      });
    } catch (error) {
      logger.error('Error calculating estimated responsibility', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to calculate estimate',
        message: (error as Error).message,
      });
    }
  }
);
