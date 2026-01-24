/**
 * Insurance Eligibility Verification API Routes
 *
 * Endpoints:
 * POST /api/eligibility/verify/:patientId - Verify single patient
 * POST /api/eligibility/batch - Batch verify multiple patients
 * GET /api/eligibility/history/:patientId - Verification history
 * POST /api/eligibility/history/batch - Latest verification history for multiple patients
 * GET /api/eligibility/issues - Patients with insurance issues
 * GET /api/eligibility/pending - Patients needing verification
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { createAuditLog } from '../services/audit';
import { logger } from '../lib/logger';
import {
  verifyPatientEligibility,
  batchVerifyEligibility,
  getVerificationHistory,
  getLatestVerificationByPatients,
  getPatientsWithIssues,
  getPatientsNeedingVerification,
  getTomorrowsPatients,
} from '../services/eligibilityService';
import { pool } from '../db/pool';

const batchVerifySchema = z.object({
  patientIds: z.array(z.string()).min(1),
  batchName: z.string().optional(),
});
const batchHistorySchema = z.object({
  patientIds: z.array(z.string()).min(1),
});

export const eligibilityRouter = Router();

/**
 * @swagger
 * /api/eligibility/verify/{patientId}:
 *   post:
 *     summary: Verify insurance eligibility for a single patient
 *     description: Performs real-time insurance eligibility verification for a patient
 *     tags:
 *       - Insurance Eligibility
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
 *         description: Patient ID to verify
 *       - in: query
 *         name: appointmentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional appointment ID to associate with verification
 *     responses:
 *       200:
 *         description: Eligibility verification result
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Server error
 */
eligibilityRouter.post(
  '/verify/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const { appointmentId } = req.query;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Verifying patient eligibility', {
        patientId,
        tenantId,
        userId,
        appointmentId,
      });

      const result = await verifyPatientEligibility(
        patientId!,
        tenantId,
        userId,
        appointmentId as string | undefined
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.eligibility.verify',
        resourceType: 'patient',
        resourceId: patientId,
        metadata: {
          verificationId: result.id,
          status: result.verificationStatus,
          hasIssues: result.hasIssues,
        },
      });

      res.json({
        success: true,
        verification: result,
      });
    } catch (error) {
      logger.error('Error verifying patient eligibility', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to verify insurance eligibility',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/batch:
 *   post:
 *     summary: Batch verify insurance eligibility for multiple patients
 *     description: Verifies eligibility for multiple patients in a single batch operation
 *     tags:
 *       - Insurance Eligibility
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
 *               - patientIds
 *             properties:
 *               patientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of patient IDs to verify
 *               batchName:
 *                 type: string
 *                 description: Optional name for the batch run
 *     responses:
 *       200:
 *         description: Batch verification completed
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
eligibilityRouter.post(
  '/batch',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const validatedData = batchVerifySchema.parse(req.body);
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Starting batch eligibility verification', {
        tenantId,
        userId,
        patientCount: validatedData.patientIds.length,
      });

      const result = await batchVerifyEligibility({
        patientIds: validatedData.patientIds,
        tenantId,
        initiatedBy: userId || 'system',
        batchName: validatedData.batchName,
      });

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.eligibility.batch_verify',
        resourceType: 'batch',
        resourceId: result.batchRunId,
        metadata: {
          totalPatients: result.totalPatients,
          verifiedCount: result.verifiedCount,
          activeCount: result.activeCount,
          issueCount: result.issueCount,
        },
      });

      res.json({
        success: true,
        batch: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error in batch eligibility verification', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to batch verify eligibility',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/batch/tomorrow:
 *   post:
 *     summary: Batch verify eligibility for tomorrow's patients
 *     description: Automatically verifies eligibility for all patients with appointments tomorrow
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Batch verification completed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.post(
  '/batch/tomorrow',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      logger.info('Verifying eligibility for tomorrow\'s patients', {
        tenantId,
        userId,
      });

      // Get tomorrow's patients
      const patientIds = await getTomorrowsPatients(tenantId);

      if (patientIds.length === 0) {
        return res.json({
          success: true,
          message: 'No appointments scheduled for tomorrow',
          batch: {
            totalPatients: 0,
            verifiedCount: 0,
            results: [],
          },
        });
      }

      // Batch verify
      const result = await batchVerifyEligibility({
        patientIds,
        tenantId,
        initiatedBy: userId || 'system',
        batchName: 'Tomorrow\'s Appointments',
      });

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.eligibility.batch_verify_tomorrow',
        resourceType: 'batch',
        resourceId: result.batchRunId,
        metadata: {
          totalPatients: result.totalPatients,
          verifiedCount: result.verifiedCount,
          issueCount: result.issueCount,
        },
      });

      res.json({
        success: true,
        batch: result,
      });
    } catch (error) {
      logger.error('Error verifying tomorrow\'s patients', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to verify tomorrow\'s patients',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/history/{patientId}:
 *   get:
 *     summary: Get verification history for a patient
 *     description: Returns all eligibility verification records for a patient
 *     tags:
 *       - Insurance Eligibility
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
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Verification history
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/history/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;

      const history = await getVerificationHistory(patientId!, tenantId);

      res.json({
        success: true,
        history,
      });
    } catch (error) {
      logger.error('Error fetching verification history', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch verification history',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/history/batch:
 *   post:
 *     summary: Get latest verification history for multiple patients
 *     description: Returns the most recent eligibility verification record per patient
 *     tags:
 *       - Insurance Eligibility
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
 *               - patientIds
 *             properties:
 *               patientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of patient IDs
 *     responses:
 *       200:
 *         description: Latest verification history by patient
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
eligibilityRouter.post(
  '/history/batch',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const validatedData = batchHistorySchema.parse(req.body);
      const tenantId = req.headers['x-tenant-id'] as string;

      const history = await getLatestVerificationByPatients(validatedData.patientIds, tenantId);

      res.json({
        success: true,
        history,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Error fetching batch verification history', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch batch verification history',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/issues:
 *   get:
 *     summary: Get patients with insurance issues
 *     description: Returns list of patients with unresolved insurance verification issues
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of patients with issues
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/issues',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const patientsWithIssues = await getPatientsWithIssues(tenantId);

      res.json({
        success: true,
        patients: patientsWithIssues,
        count: patientsWithIssues.length,
      });
    } catch (error) {
      logger.error('Error fetching patients with issues', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch patients with issues',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/pending:
 *   get:
 *     summary: Get patients needing verification
 *     description: Returns list of patients whose insurance needs to be verified or re-verified
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: daysThreshold
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days since last verification to consider as needing verification
 *     responses:
 *       200:
 *         description: List of patients needing verification
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/pending',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const daysThreshold = parseInt(req.query.daysThreshold as string) || 30;

      const patientsNeedingVerification = await getPatientsNeedingVerification(
        tenantId,
        daysThreshold
      );

      res.json({
        success: true,
        patients: patientsNeedingVerification,
        count: patientsNeedingVerification.length,
      });
    } catch (error) {
      logger.error('Error fetching patients needing verification', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch patients needing verification',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/resolve/{verificationId}:
 *   patch:
 *     summary: Mark an eligibility issue as resolved
 *     description: Updates a verification record to mark an issue as resolved
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Verification ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resolutionNotes:
 *                 type: string
 *                 description: Notes about how the issue was resolved
 *     responses:
 *       200:
 *         description: Issue marked as resolved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Verification not found
 *       500:
 *         description: Server error
 */
eligibilityRouter.patch(
  '/resolve/:verificationId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { verificationId } = req.params;
      const { resolutionNotes } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;

      // pool imported at top of file

      const result = await pool.query(
        `UPDATE insurance_verifications
         SET has_issues = false,
             issue_resolved_at = NOW(),
             issue_resolved_by = $1,
             issue_notes = COALESCE(issue_notes, '') || E'\n\nRESOLVED: ' || $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING id, patient_id`,
        [userId, resolutionNotes || 'Issue resolved', verificationId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Verification not found',
        });
      }

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.eligibility.resolve_issue',
        resourceType: 'verification',
        resourceId: verificationId,
        metadata: {
          patientId: result.rows[0].patient_id,
          resolutionNotes,
        },
      });

      res.json({
        success: true,
        message: 'Issue marked as resolved',
      });
    } catch (error) {
      logger.error('Error resolving eligibility issue', {
        error: (error as Error).message,
        verificationId: req.params.verificationId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to resolve issue',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/auto-verify/stats:
 *   get:
 *     summary: Get auto-verification statistics
 *     description: Returns stats about auto-verification status and recent runs
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Auto-verification stats
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/auto-verify/stats',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      // pool imported at top of file

      // Get auto-verify settings
      const settingsResult = await pool.query(
        `SELECT value FROM tenant_settings
         WHERE tenant_id = $1 AND key = 'auto_verify_enabled'`,
        [tenantId]
      );
      const enabled = settingsResult.rows[0]?.value === 'true' || true; // Default to true

      // Get last run time
      const lastRunResult = await pool.query(
        `SELECT MAX(verified_at) as last_run
         FROM insurance_verifications
         WHERE tenant_id = $1 AND verification_source = 'auto'`,
        [tenantId]
      );
      const lastRun = lastRunResult.rows[0]?.last_run || null;

      // Count today's auto-verifications
      const todayResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM insurance_verifications
         WHERE tenant_id = $1
         AND verification_source = 'auto'
         AND DATE(verified_at) = CURRENT_DATE`,
        [tenantId]
      );
      const todayCount = parseInt(todayResult.rows[0]?.count || '0');

      // Count tomorrow's scheduled patients with insurance
      const tomorrowResult = await pool.query(
        `SELECT COUNT(DISTINCT a.patient_id) as count
         FROM appointments a
         JOIN patient_insurance pi ON a.patient_id = pi.patient_id AND pi.is_primary = true
         WHERE a.tenant_id = $1
         AND DATE(a.appointment_date) = CURRENT_DATE + INTERVAL '1 day'
         AND a.status NOT IN ('cancelled', 'no_show')`,
        [tenantId]
      );
      const tomorrowScheduled = parseInt(tomorrowResult.rows[0]?.count || '0');

      res.json({
        success: true,
        stats: {
          enabled,
          lastRun,
          todayCount,
          tomorrowScheduled,
        },
      });
    } catch (error) {
      logger.error('Error fetching auto-verify stats', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch auto-verify stats',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/auto-verify/toggle:
 *   post:
 *     summary: Toggle auto-verification on/off
 *     description: Enables or disables automatic daily verification
 *     tags:
 *       - Insurance Eligibility
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
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Whether to enable or disable auto-verification
 *     responses:
 *       200:
 *         description: Auto-verification toggled
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.post(
  '/auto-verify/toggle',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { enabled } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user?.id;
      // pool imported at top of file

      // Update or insert setting
      await pool.query(
        `INSERT INTO tenant_settings (tenant_id, key, value, updated_by)
         VALUES ($1, 'auto_verify_enabled', $2, $3)
         ON CONFLICT (tenant_id, key)
         DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [tenantId, enabled.toString(), userId]
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId,
        action: 'insurance.eligibility.toggle_auto_verify',
        resourceType: 'setting',
        resourceId: 'auto_verify_enabled',
        metadata: { enabled },
      });

      // Return updated stats
      const statsResponse = await pool.query(
        `SELECT
           (SELECT MAX(verified_at) FROM insurance_verifications
            WHERE tenant_id = $1 AND verification_source = 'auto') as last_run,
           (SELECT COUNT(*) FROM insurance_verifications
            WHERE tenant_id = $1 AND verification_source = 'auto'
            AND DATE(verified_at) = CURRENT_DATE) as today_count,
           (SELECT COUNT(DISTINCT a.patient_id) FROM appointments a
            JOIN patient_insurance pi ON a.patient_id = pi.patient_id AND pi.is_primary = true
            WHERE a.tenant_id = $1 AND DATE(a.appointment_date) = CURRENT_DATE + INTERVAL '1 day'
            AND a.status NOT IN ('cancelled', 'no_show')) as tomorrow_scheduled`,
        [tenantId]
      );

      res.json({
        success: true,
        stats: {
          enabled,
          lastRun: statsResponse.rows[0]?.last_run || null,
          todayCount: parseInt(statsResponse.rows[0]?.today_count || '0'),
          tomorrowScheduled: parseInt(statsResponse.rows[0]?.tomorrow_scheduled || '0'),
        },
      });
    } catch (error) {
      logger.error('Error toggling auto-verify', {
        error: (error as Error).message,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to toggle auto-verify',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/benefits/{patientId}:
 *   get:
 *     summary: Get detailed benefits for a patient
 *     description: Returns comprehensive insurance benefits breakdown
 *     tags:
 *       - Insurance Eligibility
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
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Benefits details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Patient or insurance not found
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/benefits/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      // pool imported at top of file

      // Get most recent verification with full benefits
      const result = await pool.query(
        `SELECT
           iv.*,
           pi.payer_name,
           pi.plan_name,
           pi.effective_date,
           pi.termination_date
         FROM insurance_verifications iv
         JOIN patient_insurance pi ON iv.patient_id = pi.patient_id AND pi.is_primary = true
         WHERE iv.patient_id = $1 AND iv.tenant_id = $2
         ORDER BY iv.verified_at DESC
         LIMIT 1`,
        [patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No insurance verification found for patient',
        });
      }

      const verification = result.rows[0];

      res.json({
        success: true,
        benefits: {
          patientId: verification.patient_id,
          payerName: verification.payer_name,
          planName: verification.plan_name,
          officeCopay: verification.copay_amount || 0,
          specialistCopay: verification.specialist_copay || verification.copay_amount || 0,
          deductibleTotal: verification.deductible_total || 0,
          deductibleMet: verification.deductible_met || 0,
          deductibleRemaining: verification.deductible_remaining || 0,
          oopMax: verification.oop_max || 0,
          oopMet: verification.oop_met || 0,
          oopRemaining: verification.oop_remaining || 0,
          coinsurancePercent: verification.coinsurance_percent || 0,
          effectiveDate: verification.effective_date,
          terminationDate: verification.termination_date,
          verificationStatus: verification.verification_status,
        },
      });
    } catch (error) {
      logger.error('Error fetching benefits', {
        error: (error as Error).message,
        patientId: req.params.patientId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch benefits',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * @swagger
 * /api/eligibility/prior-auth/{cptCode}:
 *   get:
 *     summary: Check prior auth requirement for CPT code
 *     description: Returns whether a CPT code requires prior authorization
 *     tags:
 *       - Insurance Eligibility
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: cptCode
 *         required: true
 *         schema:
 *           type: string
 *         description: CPT code to check
 *     responses:
 *       200:
 *         description: Prior auth requirement details
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
eligibilityRouter.get(
  '/prior-auth/:cptCode',
  requireAuth,
  requireRoles(['admin', 'provider', 'front_desk', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const cptCode = req.params.cptCode as string;
      const tenantId = req.headers['x-tenant-id'] as string;
      // pool imported at top of file

      // Common dermatology codes with descriptions
      const cptDescriptions: Record<string, string> = {
        '17311': 'Mohs micrographic surgery, first stage',
        '96920': 'Laser treatment for inflammatory skin disease',
        'J0881': 'Darzalex (daratumumab) injection',
        '96912': 'Photochemotherapy, tar and ultraviolet B',
        '17110': 'Destruction of benign lesions',
      };

      // Check for CPT-specific prior auth requirements
      const authResult = await pool.query(
        `SELECT pa.*
         FROM prior_auth_requirements pa
         WHERE pa.cpt_code = $1 AND pa.tenant_id = $2`,
        [cptCode, tenantId]
      );

      // Default rules for common codes
      const defaultRequirements: Record<string, boolean> = {
        '17311': true,  // Mohs usually requires PA
        '96920': true,  // Phototherapy often requires PA
        'J0881': true,  // Biologics typically require PA
        '96912': false,
        '17110': false,
      };

      const requiresAuth = authResult.rows.length > 0
        ? authResult.rows.some(r => r.requires_auth)
        : (defaultRequirements[cptCode] ?? false);

      const payerSpecific = authResult.rows.map(row => ({
        payerName: 'General',
        required: row.requires_auth,
        notes: row.notes || 'No additional information',
      }));

      // Add default entries if no payer-specific rules
      if (payerSpecific.length === 0) {
        if (defaultRequirements[cptCode] === true) {
          payerSpecific.push({
            payerName: 'Most Payers',
            required: true,
            notes: 'Prior authorization typically required. Check with specific payer.',
          });
        } else if (defaultRequirements[cptCode] === false) {
          payerSpecific.push({
            payerName: 'Most Payers',
            required: false,
            notes: 'Prior authorization typically not required.',
          });
        }
      }

      res.json({
        success: true,
        requirement: {
          cptCode,
          description: cptDescriptions[cptCode] || 'CPT Code',
          requiresAuth,
          payerSpecific,
        },
      });
    } catch (error) {
      logger.error('Error checking prior auth', {
        error: (error as Error).message,
        cptCode: req.params.cptCode,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to check prior auth requirement',
        message: (error as Error).message,
      });
    }
  }
);
