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
import { formatPhoneE164 } from '../utils/phone';
import { createTwilioService } from '../services/twilioService';
import {
  createPendingSMSConsentRequest,
  getSMSConsentState,
  recordSMSConsent,
  revokeSMSConsent,
} from '../services/smsConsentState';
import {
  buildSMSConsentRequestText,
  getSMSPracticeBranding,
} from '../services/smsConsentText';

const router = Router();

function buildMockSmsResult(body: string) {
  const hasUnicode = /[^\x00-\x7F]/.test(body);
  const segmentLength = hasUnicode ? 70 : 160;
  return {
    sid: `mock_sms_${crypto.randomUUID()}`,
    status: 'sent',
    numSegments: Math.max(1, Math.ceil(body.length / segmentLength)),
  };
}

/**
 * GET /api/sms-consent/:patientId
 * Get SMS consent status for a patient
 */
router.get('/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId || '';
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }
    const consentState = await getSMSConsentState(tenantId, patientId, pool);

    res.json({
      hasConsent: consentState.hasConsent,
      pendingRequest: consentState.pendingRequest,
      requestedAt: consentState.requestedAt,
      optedOut: consentState.optedOut,
      consent: consentState.consent,
      daysUntilExpiration: consentState.daysUntilExpiration,
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
    const patientId = req.params.patientId || '';
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

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

    const consentId = await recordSMSConsent(
      tenantId,
      patientId,
      {
        consentMethod,
        obtainedByUserId: userId,
        obtainedByName,
        expirationDate: expirationDate || null,
        notes: notes || null,
      },
      pool
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
    const patientId = req.params.patientId || '';
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const parsed = revokeConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { reason } = parsed.data;
    const consentId = await revokeSMSConsent(
      tenantId,
      patientId,
      {
        reason: reason || null,
        notes: 'Consent revoked from SMS consent route',
        optedOutVia: 'staff',
      },
      pool
    );

    await auditLog(tenantId, userId, 'sms_consent_revoked', 'sms_consent', consentId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error revoking SMS consent', { error: error.message });
    res.status(500).json({ error: 'Failed to revoke SMS consent' });
  }
});

/**
 * POST /api/sms-consent/:patientId/request
 * Send an opt-in request text and create a pending consent record
 */
router.post('/:patientId/request', requireAuth, async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.fullName || 'Staff Member';
    const patientId = req.params.patientId || '';
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const patientResult = await client.query(
      `SELECT phone, first_name, last_name
       FROM patients
       WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];
    if (!patient.phone) {
      return res.status(400).json({ error: 'Patient has no phone number' });
    }

    const consentState = await getSMSConsentState(tenantId, patientId, client);
    if (consentState.hasConsent) {
      return res.status(400).json({ error: 'SMS consent is already on file', code: 'consent_already_granted' });
    }
    if (consentState.pendingRequest) {
      return res.json({
        success: true,
        pendingRequest: true,
        alreadyPending: true,
        requestedAt: consentState.requestedAt,
        consentId: consentState.consent?.id,
      });
    }

    const settingsResult = await client.query(
      `SELECT twilio_account_sid, twilio_auth_token, twilio_phone_number, is_active, is_test_mode
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }

    const settings = settingsResult.rows[0];
    const branding = await getSMSPracticeBranding(tenantId, client);
    const messageBody = buildSMSConsentRequestText(branding);
    const fromNumber = settings.twilio_phone_number || '+15555550100';

    await client.query('BEGIN');

    const consentId = await createPendingSMSConsentRequest(
      tenantId,
      patientId,
      client,
      {
        obtainedByUserId: userId,
        obtainedByName: userName,
        notes: `Opt-in request sent to ${patient.first_name} ${patient.last_name}`,
      }
    );
    await client.query('COMMIT');

    let sendResult;
    try {
      sendResult = settings.is_test_mode
        ? buildMockSmsResult(messageBody)
        : await createTwilioService(
            settings.twilio_account_sid,
            settings.twilio_auth_token
          ).sendSMS({
            to: patient.phone,
            from: fromNumber,
            body: messageBody,
          });
    } catch (error: any) {
      await client.query(
        `DELETE FROM sms_consent
         WHERE id = $1
           AND tenant_id = $2
           AND patient_id = $3
           AND consent_given = false
           AND consent_revoked = false`,
        [consentId, tenantId, patientId]
      );
      throw error;
    }

    const messageId = crypto.randomUUID();
    let messageLogged = false;
    try {
      await client.query(
        `INSERT INTO sms_messages
         (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
          patient_id, content, message_body, status, message_type, sent_at, segment_count)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, 'consent_request', CURRENT_TIMESTAMP, $10)`,
        [
          messageId,
          tenantId,
          sendResult.sid,
          fromNumber,
          formatPhoneE164(patient.phone),
          patientId,
          messageBody,
          messageBody,
          sendResult.status,
          sendResult.numSegments,
        ]
      );
      messageLogged = true;

      await auditLog(tenantId, userId, 'sms_consent_request_sent', 'sms_consent', consentId);
    } catch (error: any) {
      logger.error('SMS consent request sent but message logging failed', {
        error: error.message,
        tenantId,
        patientId,
        consentId,
      });
    }

    res.json({
      success: true,
      consentId,
      messageId,
      status: sendResult.status,
      pendingRequest: true,
      messageLogged,
    });
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    logger.error('Error sending SMS consent request', { error: error.message });
    res.status(500).json({ error: 'Failed to send SMS consent request' });
  } finally {
    client.release();
  }
});

export const smsConsentRouter = router;
