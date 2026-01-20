/**
 * SMS Consent Routes
 * HIPAA-compliant consent tracking for SMS communications
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import * as crypto from 'crypto';

const router = Router();

/**
 * GET /api/sms-consent/:patientId
 * Get SMS consent status for a patient
 */
router.get('/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    const result = await pool.query(
      `SELECT
        id,
        patient_id as "patientId",
        consent_given as "consentGiven",
        consent_date as "consentDate",
        consent_method as "consentMethod",
        obtained_by_user_id as "obtainedByUserId",
        obtained_by_name as "obtainedByName",
        expiration_date as "expirationDate",
        consent_revoked as "consentRevoked",
        revoked_date as "revokedDate",
        revoked_reason as "revokedReason",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM sms_consent
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, patientId]
    );

    if (result.rows.length === 0) {
      return res.json({ hasConsent: false });
    }

    const consent = result.rows[0];
    const hasConsent = consent.consentGiven && !consent.consentRevoked;

    // Calculate days until expiration
    let daysUntilExpiration = null;
    if (hasConsent && consent.expirationDate) {
      const expDate = new Date(consent.expirationDate);
      const today = new Date();
      const diffTime = expDate.getTime() - today.getTime();
      daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    res.json({
      hasConsent,
      consent,
      daysUntilExpiration,
    });
  } catch (error: any) {
    logger.error('Error fetching SMS consent', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS consent' });
  }
});

/**
 * POST /api/sms-consent/:patientId
 * Record SMS consent for a patient
 */
const createConsentSchema = z.object({
  consentMethod: z.enum(['verbal', 'written', 'electronic']),
  obtainedByName: z.string().min(1),
  expirationDate: z.string().optional(), // ISO date string
  notes: z.string().optional(),
});

router.post('/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId;

    const parsed = createConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { consentMethod, obtainedByName, expirationDate, notes } = parsed.data;

    // Verify patient exists
    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Create consent record
    const consentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sms_consent
       (id, tenant_id, patient_id, consent_given, consent_date, consent_method,
        obtained_by_user_id, obtained_by_name, expiration_date, notes)
       VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8)`,
      [consentId, tenantId, patientId, consentMethod, userId, obtainedByName, expirationDate || null, notes || null]
    );

    // Also update patient_sms_preferences
    await pool.query(
      `INSERT INTO patient_sms_preferences
       (tenant_id, patient_id, opted_in, consent_date, consent_method)
       VALUES ($1, $2, true, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (tenant_id, patient_id)
       DO UPDATE SET
         opted_in = true,
         consent_date = CURRENT_TIMESTAMP,
         consent_method = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [tenantId, patientId, consentMethod]
    );

    await auditLog(tenantId, userId, 'sms_consent_obtained', 'sms_consent', consentId);

    res.json({ success: true, consentId });
  } catch (error: any) {
    logger.error('Error recording SMS consent', { error: error.message });
    res.status(500).json({ error: 'Failed to record SMS consent' });
  }
});

/**
 * POST /api/sms-consent/:patientId/revoke
 * Revoke SMS consent for a patient
 */
const revokeConsentSchema = z.object({
  reason: z.string().optional(),
});

router.post('/:patientId/revoke', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId;

    const parsed = revokeConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { reason } = parsed.data;

    // Update most recent consent record
    const result = await pool.query(
      `UPDATE sms_consent
       SET consent_revoked = true,
           revoked_date = CURRENT_TIMESTAMP,
           revoked_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM sms_consent
         WHERE tenant_id = $2 AND patient_id = $3
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id`,
      [reason || null, tenantId, patientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No consent record found' });
    }

    // Update patient_sms_preferences
    await pool.query(
      `UPDATE patient_sms_preferences
       SET opted_in = false,
           opted_out_at = CURRENT_TIMESTAMP,
           opted_out_via = 'staff',
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    await auditLog(tenantId, userId, 'sms_consent_revoked', 'sms_consent', result.rows[0].id);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error revoking SMS consent', { error: error.message });
    res.status(500).json({ error: 'Failed to revoke SMS consent' });
  }
});

export const smsConsentRouter = router;
