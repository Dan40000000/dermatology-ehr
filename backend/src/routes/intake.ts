/**
 * Patient Intake API Routes
 *
 * Handles all patient intake operations:
 * - Pre-registration links
 * - Intake form submission
 * - Consent form e-signatures
 * - Insurance verification
 * - Document uploads
 * - Portal activation
 * - Status tracking
 */

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { logger } from '../lib/logger';
import { auditLog } from '../services/audit';
import {
  patientIntakeService,
  IntakeFormType,
  ConsentType,
} from '../services/patientIntakeService';

export const intakeRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logIntakeError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const sendPreRegistrationSchema = z.object({
  sendVia: z.enum(['email', 'sms', 'both']).default('both'),
  appointmentId: z.string().uuid().optional(),
});

const submitIntakeFormSchema = z.object({
  patientId: z.string().uuid(),
  formType: z.enum([
    'DEMOGRAPHICS', 'INSURANCE', 'MEDICAL_HISTORY',
    'CONSENT_TREATMENT', 'CONSENT_HIPAA', 'CONSENT_PHOTO',
    'REVIEW_OF_SYSTEMS', 'FAMILY_HISTORY', 'SOCIAL_HISTORY', 'CUSTOM',
  ]),
  formData: z.record(z.string(), z.any()),
  appointmentId: z.string().uuid().optional(),
});

const submitConsentSchema = z.object({
  patientId: z.string().uuid(),
  consentType: z.enum([
    'CONSENT_TREATMENT', 'CONSENT_HIPAA', 'CONSENT_PHOTO',
    'CONSENT_TELEHEALTH', 'CONSENT_FINANCIAL', 'CONSENT_RESEARCH', 'CONSENT_OTHER',
  ]),
  consentTitle: z.string().min(1).max(255),
  consentContent: z.string().min(1),
  signatureData: z.string().min(100), // Base64 signature image
  signerName: z.string().min(2).max(255),
  signerRelationship: z.enum(['self', 'parent', 'guardian', 'power_of_attorney', 'spouse', 'other']).default('self'),
  witnessSignatureData: z.string().optional(),
  witnessName: z.string().max(255).optional(),
  appointmentId: z.string().uuid().optional(),
});

const uploadDocumentSchema = z.object({
  patientId: z.string().uuid(),
  documentType: z.enum([
    'drivers_license', 'state_id', 'passport',
    'insurance_card_front', 'insurance_card_back',
    'referral_letter', 'prior_auth_letter',
    'medical_records', 'lab_results', 'other',
  ]),
  filePath: z.string().min(1),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  appointmentId: z.string().uuid().optional(),
});

const verifyInsuranceSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

const activatePortalSchema = z.object({
  patientId: z.string().uuid(),
  email: z.string().email(),
});

// ============================================================================
// PRE-REGISTRATION LINK ENDPOINTS
// ============================================================================

/**
 * POST /api/intake/send-link/:patientId
 * Send pre-registration link to patient
 */
intakeRouter.post(
  '/send-link/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;

      const parsed = sendPreRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { sendVia, appointmentId } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await patientIntakeService.sendPreRegistrationLink(
        tenantId,
        patientId!,
        appointmentId,
        sendVia
      );

      await auditLog(tenantId, req.user!.id, 'intake_link_sent', 'patient', patientId!);

      return res.status(200).json({
        success: result.success,
        message: 'Pre-registration link sent successfully',
        linkUrl: result.linkUrl,
      });
    } catch (error: any) {
      logIntakeError('Send pre-registration link error', error);
      return res.status(500).json({ error: error.message || 'Failed to send pre-registration link' });
    }
  }
);

// ============================================================================
// INTAKE STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/intake/status/:patientId
 * Get intake completion status for patient
 */
intakeRouter.get(
  '/status/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;
      const { appointmentId } = req.query;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const status = await patientIntakeService.getIntakeStatus(
        tenantId,
        patientId!,
        appointmentId as string | undefined
      );

      const patient = patientResult.rows[0];

      return res.json({
        patientId,
        patientName: `${patient.first_name} ${patient.last_name}`,
        ...status,
      });
    } catch (error: any) {
      logIntakeError('Get intake status error', error);
      return res.status(500).json({ error: 'Failed to get intake status' });
    }
  }
);

// ============================================================================
// INTAKE FORM ENDPOINTS
// ============================================================================

/**
 * POST /api/intake/forms
 * Submit an intake form
 */
intakeRouter.post(
  '/forms',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = submitIntakeFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { patientId, formType, formData, appointmentId } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await patientIntakeService.processIntakeForm(
        tenantId,
        patientId,
        {
          formType: formType as IntakeFormType,
          formData,
          appointmentId,
        },
        'staff_portal',
        req.ip,
        req.get('user-agent')
      );

      await auditLog(tenantId, req.user!.id, 'intake_form_submitted', 'intake_form', result.id);

      // Check if all forms are complete
      const completionStatus = await patientIntakeService.onFormCompleted(tenantId, patientId, appointmentId);

      return res.status(201).json({
        id: result.id,
        status: result.status,
        formType,
        allFormsComplete: completionStatus.allComplete,
      });
    } catch (error: any) {
      logIntakeError('Submit intake form error', error);
      return res.status(500).json({ error: error.message || 'Failed to submit intake form' });
    }
  }
);

/**
 * GET /api/intake/forms/:patientId
 * Get all intake forms for a patient
 */
intakeRouter.get(
  '/forms/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;
      const { appointmentId } = req.query;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const forms = await patientIntakeService.getPatientIntakeForms(
        tenantId,
        patientId!,
        appointmentId as string | undefined
      );

      return res.json({ forms });
    } catch (error: any) {
      logIntakeError('Get intake forms error', error);
      return res.status(500).json({ error: 'Failed to get intake forms' });
    }
  }
);

// ============================================================================
// DOCUMENT UPLOAD ENDPOINTS
// ============================================================================

/**
 * POST /api/intake/documents
 * Upload intake document (ID, insurance card, etc.)
 */
intakeRouter.post(
  '/documents',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = uploadDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { patientId, documentType, filePath, fileName, fileSize, mimeType, appointmentId } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await patientIntakeService.processDocumentUpload(
        tenantId,
        patientId,
        {
          documentType,
          filePath,
          fileName,
          fileSize,
          mimeType,
          appointmentId,
        },
        'staff_portal',
        req.ip
      );

      await auditLog(tenantId, req.user!.id, 'intake_document_uploaded', 'intake_document', result.id);

      return res.status(201).json({
        id: result.id,
        documentType,
        ocrProcessed: result.ocrProcessed,
      });
    } catch (error: any) {
      logIntakeError('Upload document error', error);
      return res.status(500).json({ error: error.message || 'Failed to upload document' });
    }
  }
);

// ============================================================================
// CONSENT FORM ENDPOINTS
// ============================================================================

/**
 * POST /api/intake/consent
 * Submit consent form with e-signature
 */
intakeRouter.post(
  '/consent',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = submitConsentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const {
        patientId, consentType, consentTitle, consentContent,
        signatureData, signerName, signerRelationship,
        witnessSignatureData, witnessName, appointmentId,
      } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await patientIntakeService.processConsentForm(
        tenantId,
        patientId,
        {
          consentType: consentType as ConsentType,
          consentTitle,
          consentContent,
          signatureData,
          signerName,
          signerRelationship,
          witnessSignatureData,
          witnessName,
          appointmentId,
        },
        req.ip || '0.0.0.0',
        req.get('user-agent')
      );

      await auditLog(tenantId, req.user!.id, 'consent_signed', 'consent_record', result.id);

      // Check if all forms are complete
      const completionStatus = await patientIntakeService.onFormCompleted(tenantId, patientId, appointmentId);

      return res.status(201).json({
        id: result.id,
        consentType,
        signedAt: result.signedAt,
        allFormsComplete: completionStatus.allComplete,
      });
    } catch (error: any) {
      logIntakeError('Submit consent error', error);
      return res.status(500).json({ error: error.message || 'Failed to submit consent' });
    }
  }
);

/**
 * GET /api/intake/consent/:patientId
 * Get patient's consent records
 */
intakeRouter.get(
  '/consent/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const consents = await patientIntakeService.getPatientConsents(tenantId, patientId!);

      return res.json({ consents });
    } catch (error: any) {
      logIntakeError('Get consents error', error);
      return res.status(500).json({ error: 'Failed to get consent records' });
    }
  }
);

// ============================================================================
// INSURANCE VERIFICATION ENDPOINTS
// ============================================================================

/**
 * POST /api/intake/verify-insurance
 * Trigger insurance eligibility verification
 */
intakeRouter.post(
  '/verify-insurance',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = verifyInsuranceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { patientId, appointmentId } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id, first_name, last_name, insurance_member_id FROM patients
         WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const patient = patientResult.rows[0];

      if (!patient.insurance_member_id) {
        return res.status(400).json({
          error: 'No insurance on file',
          message: 'Patient does not have insurance information on file. Please update insurance information first.',
        });
      }

      const result = await patientIntakeService.verifyInsuranceEligibility(
        tenantId,
        patientId,
        appointmentId
      );

      await auditLog(tenantId, req.user!.id, 'insurance_verified', 'insurance_verification', result.id);

      return res.json({
        verificationId: result.id,
        status: result.status,
        patientName: `${patient.first_name} ${patient.last_name}`,
        payerName: result.payerName,
        memberId: result.memberId,
        effectiveDate: result.effectiveDate,
        copayAmountCents: result.copayAmountCents,
        deductibleTotalCents: result.deductibleTotalCents,
        deductibleMetCents: result.deductibleMetCents,
        coinsurancePct: result.coinsurancePct,
        outOfPocketMaxCents: result.outOfPocketMaxCents,
        outOfPocketMetCents: result.outOfPocketMetCents,
        priorAuthRequired: result.priorAuthRequired,
        hasIssues: result.hasIssues,
        issueNotes: result.issueNotes,
        coverageDetails: result.coverageDetails,
      });
    } catch (error: any) {
      logIntakeError('Verify insurance error', error);
      return res.status(500).json({ error: error.message || 'Failed to verify insurance' });
    }
  }
);

/**
 * GET /api/intake/verify-insurance/:patientId
 * Get latest insurance verification for patient
 */
intakeRouter.get(
  '/verify-insurance/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;

      const result = await pool.query(
        `SELECT
          id, payer_id as "payerId", payer_name as "payerName",
          member_id as "memberId", group_number as "groupNumber",
          plan_name as "planName", plan_type as "planType",
          verification_status as status,
          effective_date as "effectiveDate",
          termination_date as "terminationDate",
          copay_amount_cents as "copayAmountCents",
          deductible_total_cents as "deductibleTotalCents",
          deductible_met_cents as "deductibleMetCents",
          coinsurance_pct as "coinsurancePct",
          out_of_pocket_max_cents as "outOfPocketMaxCents",
          out_of_pocket_met_cents as "outOfPocketMetCents",
          prior_auth_required as "priorAuthRequired",
          verified_at as "verifiedAt",
          expires_at as "expiresAt",
          has_issues as "hasIssues",
          issue_notes as "issueNotes",
          coverage_details as "coverageDetails"
         FROM insurance_verifications
         WHERE patient_id = $1 AND tenant_id = $2
         ORDER BY verified_at DESC
         LIMIT 1`,
        [patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No insurance verification found for this patient' });
      }

      return res.json(result.rows[0]);
    } catch (error: any) {
      logIntakeError('Get insurance verification error', error);
      return res.status(500).json({ error: 'Failed to get insurance verification' });
    }
  }
);

// ============================================================================
// PATIENT PORTAL ACTIVATION
// ============================================================================

/**
 * POST /api/intake/portal/activate
 * Activate patient portal account
 */
intakeRouter.post(
  '/portal/activate',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = activatePortalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { patientId, email } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await patientIntakeService.activatePatientPortal(
        tenantId,
        patientId,
        email
      );

      await auditLog(tenantId, req.user!.id, 'portal_activation_initiated', 'patient', patientId);

      const patient = patientResult.rows[0];

      return res.status(200).json({
        success: true,
        message: 'Portal activation email sent',
        patientName: `${patient.first_name} ${patient.last_name}`,
        email,
        portalUrl: result.portalUrl,
      });
    } catch (error: any) {
      logIntakeError('Activate portal error', error);
      return res.status(500).json({ error: error.message || 'Failed to activate patient portal' });
    }
  }
);

// ============================================================================
// INTAKE LINK VALIDATION (Public endpoint for patient access)
// ============================================================================

/**
 * GET /api/intake/validate-token/:token
 * Validate intake link token (can be called without auth for patient access)
 */
intakeRouter.get(
  '/validate-token/:token',
  async (req, res) => {
    try {
      const { token } = req.params;

      const result = await patientIntakeService.validateIntakeToken(token);

      if (!result.valid) {
        return res.status(404).json({ valid: false, error: 'Invalid or expired token' });
      }

      // Get patient name (limited info for security)
      const patientResult = await pool.query(
        `SELECT first_name FROM patients WHERE id = $1 AND tenant_id = $2`,
        [result.patientId, result.tenantId]
      );

      const patientFirstName = patientResult.rows[0]?.first_name || 'Patient';

      // Get appointment info if linked
      let appointmentInfo = null;
      if (result.appointmentId) {
        const apptResult = await pool.query(
          `SELECT start_time, appointment_type_id FROM appointments WHERE id = $1`,
          [result.appointmentId]
        );
        if (apptResult.rows.length > 0) {
          appointmentInfo = {
            appointmentDate: apptResult.rows[0].start_time,
          };
        }
      }

      return res.json({
        valid: true,
        patientFirstName,
        appointmentInfo,
      });
    } catch (error: any) {
      logIntakeError('Validate token error', error);
      return res.status(500).json({ error: 'Failed to validate token' });
    }
  }
);

/**
 * POST /api/intake/use-token/:token
 * Mark intake token as used (called when patient starts intake)
 */
intakeRouter.post(
  '/use-token/:token',
  async (req, res) => {
    try {
      const { token } = req.params;

      const result = await patientIntakeService.validateIntakeToken(token);

      if (!result.valid) {
        return res.status(404).json({ error: 'Invalid or expired token' });
      }

      await patientIntakeService.markIntakeTokenUsed(token, req.ip);

      return res.json({
        success: true,
        tenantId: result.tenantId,
        patientId: result.patientId,
        appointmentId: result.appointmentId,
      });
    } catch (error: any) {
      logIntakeError('Use token error', error);
      return res.status(500).json({ error: 'Failed to process token' });
    }
  }
);

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * GET /api/intake/pending
 * Get all patients with pending/incomplete intake
 */
intakeRouter.get(
  '/pending',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { limit = '50', offset = '0', appointmentDate } = req.query;

      let query = `
        SELECT
          s.id as status_id,
          s.patient_id,
          s.appointment_id,
          s.overall_status,
          s.completion_percentage,
          s.demographics_complete,
          s.insurance_complete,
          s.medical_history_complete,
          s.consent_treatment_signed,
          s.consent_hipaa_signed,
          s.consent_photo_signed,
          s.insurance_verified,
          s.started_at,
          p.first_name,
          p.last_name,
          p.email,
          p.cell_phone,
          a.start_time as appointment_time
        FROM intake_status s
        JOIN patients p ON p.id = s.patient_id
        LEFT JOIN appointments a ON a.id = s.appointment_id
        WHERE s.tenant_id = $1
          AND s.overall_status IN ('not_started', 'in_progress')
      `;

      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (appointmentDate) {
        query += ` AND DATE(a.start_time) = $${paramIndex}`;
        params.push(appointmentDate);
        paramIndex++;
      }

      query += ` ORDER BY a.start_time ASC NULLS LAST, s.created_at DESC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM intake_status s
        WHERE s.tenant_id = $1
          AND s.overall_status IN ('not_started', 'in_progress')
      `;
      const countResult = await pool.query(countQuery, [tenantId]);

      return res.json({
        patients: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error: any) {
      logIntakeError('Get pending intake error', error);
      return res.status(500).json({ error: 'Failed to get pending intake patients' });
    }
  }
);

/**
 * POST /api/intake/send-bulk-reminders
 * Send intake reminders to multiple patients
 */
intakeRouter.post(
  '/send-bulk-reminders',
  requireAuth,
  requireRoles(['admin', 'front_desk']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientIds, sendVia = 'both' } = req.body;

      if (!Array.isArray(patientIds) || patientIds.length === 0) {
        return res.status(400).json({ error: 'patientIds array is required' });
      }

      if (patientIds.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 patients per batch' });
      }

      const results: Array<{ patientId: string; success: boolean; error?: string }> = [];

      for (const patientId of patientIds) {
        try {
          await patientIntakeService.sendPreRegistrationLink(
            tenantId,
            patientId,
            undefined,
            sendVia
          );
          results.push({ patientId, success: true });
        } catch (error: any) {
          results.push({ patientId, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;

      await auditLog(tenantId, req.user!.id, 'bulk_intake_reminders_sent', 'system', 'bulk');

      return res.json({
        message: `Sent reminders to ${successCount} of ${patientIds.length} patients`,
        results,
      });
    } catch (error: any) {
      logIntakeError('Send bulk reminders error', error);
      return res.status(500).json({ error: 'Failed to send bulk reminders' });
    }
  }
);
