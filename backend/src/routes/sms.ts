/**
 * SMS/Text Messaging Routes
 * Handles SMS settings, sending, receiving (webhooks), and message history
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { env } from '../config/env';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/moduleAccess';
import { auditLog, createAuditLog } from '../services/audit';
import { createTwilioService, TwilioService, type TwilioA2PCampaignUpdate } from '../services/twilioService';
import {
  addMessageToThread,
  findOrCreateMessageThread,
  markThreadReadByStaff,
  markThreadUnreadByPatient,
  processIncomingSMS,
  SMSRoutingCategory,
  updateMessageThreadRoute,
  updateSMSStatus,
} from '../services/smsProcessor';
import { sendImmediateReminder } from '../services/smsReminderScheduler';
import { formatPhoneE164, validateAndFormatPhone, formatPhoneDisplay } from '../utils/phone';
import { logger } from '../lib/logger';
import { userHasRole } from '../lib/roles';
import * as crypto from 'crypto';
import { getSMSPracticeBranding, buildSMSHelpText, buildSMSOptInConfirmationText, buildSMSOptOutConfirmationText } from '../services/smsConsentText';
import { getSMSConsentState, revokeSMSConsent, upsertSMSOptOut } from '../services/smsConsentState';
import { assertSmsContentSafe, SmsPrivacyBlockError } from '../utils/smsPrivacyGuard';

const router = Router();
const textMessagesModuleAccess = requireModuleAccess('text_messages');
router.use((req, res, next) => {
  if (req.path === '/webhook/incoming' || req.path === '/webhook/status') {
    return next();
  }

  return requireAuth(req as AuthedRequest, res, () =>
    textMessagesModuleAccess(req as AuthedRequest, res, next)
  );
});
const DEFAULT_TEST_SMS_FROM = '+15555550100';
const smsRoutingCategories = ['general', 'appointment', 'billing', 'prescription', 'medical', 'other'] as const;
const SMS_A2P_BRAND_NAME = 'Nuvora Health, operated by Perry Software LLC';
const SMS_A2P_CONSENT_URL = 'https://perry-software-site.vercel.app/sms-consent.html';
const SMS_A2P_TERMS_URL = 'https://perry-software-site.vercel.app/sms-terms.html';
const SMS_A2P_PRIVACY_URL = 'https://perry-software-site.vercel.app/sms-privacy.html';

function isInboundSimulationEnabled(isTestMode: boolean): boolean {
  return (
    isTestMode ||
    env.nodeEnv !== 'production' ||
    process.env.SMS_INBOUND_SIMULATION_ENABLED === 'true'
  );
}

function calculateSmsSegments(body: string): number {
  const hasUnicode = /[^\x00-\x7F]/.test(body);
  const segmentLength = hasUnicode ? 70 : 160;
  return Math.max(1, Math.ceil(body.length / segmentLength));
}

function buildMockSmsResult(body: string) {
  return {
    sid: `mock_sms_${crypto.randomUUID()}`,
    status: 'sent',
    numSegments: calculateSmsSegments(body),
  };
}

function handleSmsPrivacyError(res: Response, error: unknown): boolean {
  if (!(error instanceof SmsPrivacyBlockError)) {
    return false;
  }

  res.status(422).json({
    error: error.message,
    code: error.code,
    blockedTypes: error.blockedTypes,
  });
  return true;
}

function shouldUseMockSms(settings: { is_test_mode?: boolean | null }): boolean {
  return settings.is_test_mode === true || !isSmsLiveSendEnabled();
}

function isSmsLiveSendEnabled(): boolean {
  return env.nodeEnv !== 'production' || process.env.SMS_LIVE_SEND_ENABLED === 'true';
}

function getConfiguredMessagingServiceSid(): string | null {
  return process.env.TWILIO_MESSAGING_SERVICE_SID || null;
}

function suffixSid(sid?: string | null): string | null {
  const value = String(sid || '');
  return value ? value.slice(-6) : null;
}

function getCampaignStatus(campaign: any): string {
  return String(campaign?.campaignStatus || '').toUpperCase();
}

function buildA2PCampaignUpdate(): TwilioA2PCampaignUpdate {
  return {
    hasEmbeddedLinks: false,
    hasEmbeddedPhone: false,
    ageGated: false,
    directLending: false,
    description:
      `${SMS_A2P_BRAND_NAME} sends patient-authorized operational SMS for dermatology practices, ` +
      'including appointment reminders, scheduling updates, billing notices, prescription coordination, and care follow-up.',
    messageFlow:
      `Patients may optionally opt in to operational SMS messages from ${SMS_A2P_BRAND_NAME} during patient intake, ` +
      `patient portal registration, staff-assisted registration, or the public SMS preference page at ${SMS_A2P_CONSENT_URL}. ` +
      'The SMS checkbox is optional, unchecked by default, and not required to receive treatment, complete registration, ' +
      'schedule an appointment, make a payment, use the patient portal, or receive any other office service. ' +
      'The opt-in disclosure states that messages may include appointment reminders, scheduling updates, billing notices, ' +
      'prescription coordination, and care follow-up; message frequency varies; message and data rates may apply; ' +
      'patients can reply HELP for help and STOP to opt out. Patients may also text START or YES to the practice messaging ' +
      `number to opt in or re-subscribe after opting out. Terms of Service: ${SMS_A2P_TERMS_URL}. Privacy Policy: ${SMS_A2P_PRIVACY_URL}.`,
    messageSamples: [
      'Nuvora Health: Reminder for your dermatology appointment on 05/08 at 2:15 PM. Reply HELP for help or STOP to opt out.',
      'Nuvora Health: Your billing statement is ready in the patient portal. Reply HELP for help or STOP to opt out.',
      'Nuvora Health: Your refill request was received and is being reviewed by the office. Reply HELP for help or STOP to opt out.',
    ],
  };
}

function normalizeSmsConversationPhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeSmsConversationNameToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getSmsConversationDedupKey(conversation: Record<string, any>): string | null {
  const normalizedPhone = normalizeSmsConversationPhone(conversation.phoneNumber || conversation.phone);
  const firstName = normalizeSmsConversationNameToken(conversation.firstName);
  const lastName = normalizeSmsConversationNameToken(conversation.lastName);

  if (!normalizedPhone || !firstName || !lastName) {
    return null;
  }

  const [nameA, nameB] = [firstName, lastName].sort();
  return `${normalizedPhone}:${nameA}:${nameB}`;
}

function compareSmsConversationPriority(
  left: Record<string, any>,
  right: Record<string, any>
): number {
  const leftHasThread = Boolean(left.threadId) || left.category !== 'general' || left.threadStatus !== 'open';
  const rightHasThread = Boolean(right.threadId) || right.category !== 'general' || right.threadStatus !== 'open';
  if (leftHasThread !== rightHasThread) {
    return leftHasThread ? -1 : 1;
  }

  const leftConsentRank = left.smsOptIn === false ? 1 : 0;
  const rightConsentRank = right.smsOptIn === false ? 1 : 0;
  if (leftConsentRank !== rightConsentRank) {
    return leftConsentRank - rightConsentRank;
  }

  const leftCategoryRank = left.category === 'general' ? 1 : 0;
  const rightCategoryRank = right.category === 'general' ? 1 : 0;
  if (leftCategoryRank !== rightCategoryRank) {
    return leftCategoryRank - rightCategoryRank;
  }

  const leftFormattedPhoneRank =
    normalizeSmsConversationPhone(left.phoneNumber || left.phone) === String(left.phoneNumber || left.phone || '')
      ? 1
      : 0;
  const rightFormattedPhoneRank =
    normalizeSmsConversationPhone(right.phoneNumber || right.phone) === String(right.phoneNumber || right.phone || '')
      ? 1
      : 0;
  if (leftFormattedPhoneRank !== rightFormattedPhoneRank) {
    return leftFormattedPhoneRank - rightFormattedPhoneRank;
  }

  const leftLastMessageAt = Date.parse(left.lastMessageAt || left.lastMessageTime || '') || 0;
  const rightLastMessageAt = Date.parse(right.lastMessageAt || right.lastMessageTime || '') || 0;
  if (leftLastMessageAt !== rightLastMessageAt) {
    return rightLastMessageAt - leftLastMessageAt;
  }

  const leftUnreadCount = Number(left.unreadCount || 0);
  const rightUnreadCount = Number(right.unreadCount || 0);
  if (leftUnreadCount !== rightUnreadCount) {
    return rightUnreadCount - leftUnreadCount;
  }

  return String(left.patientId || left.id || '').localeCompare(String(right.patientId || right.id || ''));
}

function dedupeSmsConversations(conversations: Array<Record<string, any>>) {
  const deduped = new Map<string, Record<string, any>>();

  for (const conversation of conversations) {
    const dedupKey = getSmsConversationDedupKey(conversation);
    if (!dedupKey) {
      deduped.set(`patient:${conversation.patientId || conversation.id}`, conversation);
      continue;
    }

    const existing = deduped.get(dedupKey);
    if (!existing || compareSmsConversationPriority(conversation, existing) < 0) {
      deduped.set(dedupKey, conversation);
    }
  }

  return Array.from(deduped.values()).sort(compareSmsConversationPriority);
}

async function getPatientSMSMessagingBlock(
  tenantId: string,
  patientId: string
): Promise<{ error: string; code: 'opted_out' | 'consent_pending' | 'consent_required' } | null> {
  const consentState = await getSMSConsentState(tenantId, patientId, pool);

  if (consentState.hasConsent) {
    return null;
  }

  if (consentState.optedOut) {
    return {
      error: 'Patient has opted out of SMS',
      code: 'opted_out',
    };
  }

  if (consentState.pendingRequest) {
    return {
      error: 'SMS opt-in request is pending. The patient must reply YES or START before staff can text them.',
      code: 'consent_pending',
    };
  }

  return {
    error: 'SMS consent is required before sending messages to this patient.',
    code: 'consent_required',
  };
}

async function getOptedOutSMSRecipientIds(
  tenantId: string,
  patientIds: string[]
): Promise<Set<string>> {
  const uniquePatientIds = Array.from(new Set(patientIds.filter(Boolean)));
  if (uniquePatientIds.length === 0) {
    return new Set();
  }

  const result = await pool.query(
    `SELECT patient_id as "patientId"
     FROM patient_sms_preferences
     WHERE tenant_id = $1
       AND patient_id = ANY($2::uuid[])
       AND opted_in = false`,
    [tenantId, uniquePatientIds]
  );

  return new Set(
    result.rows
      .map((row) => String(row.patientId || row.patient_id || ''))
      .filter(Boolean)
  );
}

// ============================================================================
// ADMIN/PROVIDER ROUTES (require authentication)
// ============================================================================

/**
 * GET /api/sms/settings
 * Get SMS settings for tenant
 */
router.get('/settings', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        tenant_id as "tenantId",
        twilio_phone_number as "twilioPhoneNumber",
        appointment_reminders_enabled as "appointmentRemindersEnabled",
        appointment_reminder_channel as "appointmentReminderChannel",
        reminder_hours_before as "reminderHoursBefore",
        allow_patient_replies as "allowPatientReplies",
        reminder_template as "reminderTemplate",
        confirmation_template as "confirmationTemplate",
        cancellation_template as "cancellationTemplate",
        reschedule_template as "rescheduleTemplate",
        is_active as "isActive",
        is_test_mode as "isTestMode",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      const newId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_settings (id, tenant_id, is_active, is_test_mode)
         VALUES ($1, $2, false, true)`,
        [newId, tenantId]
      );

      return res.json({
        id: newId,
        tenantId,
        isActive: false,
        isTestMode: true,
        appointmentRemindersEnabled: true,
        appointmentReminderChannel: 'sms',
        reminderHoursBefore: 24,
        allowPatientReplies: true,
      });
    }

    // Don't send credentials to frontend
    const settings = result.rows[0];
    delete settings.twilioAccountSid;
    delete settings.twilioAuthToken;

    res.json(settings);
  } catch (error: any) {
    logger.error('Error fetching SMS settings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS settings' });
  }
});

/**
 * PUT /api/sms/settings
 * Update SMS settings (admin only)
 */
const updateSettingsSchema = z.object({
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),
  appointmentRemindersEnabled: z.boolean().optional(),
  appointmentReminderChannel: z.enum(['sms', 'voice']).optional(),
  reminderHoursBefore: z.number().min(1).max(168).optional(),
  allowPatientReplies: z.boolean().optional(),
  reminderTemplate: z.string().optional(),
  confirmationTemplate: z.string().optional(),
  cancellationTemplate: z.string().optional(),
  rescheduleTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
  isTestMode: z.boolean().optional(),
});

router.put('/settings', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;

    [
      data.reminderTemplate,
      data.confirmationTemplate,
      data.cancellationTemplate,
      data.rescheduleTemplate,
    ]
      .filter((value): value is string => typeof value === 'string')
      .forEach((template) => assertSmsContentSafe(template));

    // Validate phone number if provided
    if (data.twilioPhoneNumber) {
      const formatted = formatPhoneE164(data.twilioPhoneNumber);
      if (!formatted) {
        return res.status(400).json({ error: 'Invalid Twilio phone number format' });
      }
      data.twilioPhoneNumber = formatted;
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${snakeKey} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(tenantId);

    const query = `
      UPDATE sms_settings
      SET ${updates.join(', ')}
      WHERE tenant_id = $${paramIndex}
      RETURNING id
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    await auditLog(tenantId, userId, 'sms_settings_update', 'sms_settings', result.rows[0].id);

    res.json({ success: true });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error updating SMS settings', { error: error.message });
    res.status(500).json({ error: 'Failed to update SMS settings' });
  }
});

/**
 * POST /api/sms/test-connection
 * Test Twilio connection
 */
router.post('/test-connection', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0 || !result.rows[0].twilio_account_sid) {
      return res.status(400).json({ error: 'Twilio credentials not configured' });
    }

    const settings = result.rows[0];
    const twilioService = createTwilioService(
      settings.twilio_account_sid,
      settings.twilio_auth_token
    );

    const testResult = await twilioService.testConnection();

    res.json(testResult);
  } catch (error: any) {
    logger.error('Error testing Twilio connection', { error: error.message });
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

/**
 * GET /api/sms/readiness
 * Non-secret SMS/Twilio readiness summary for production testing
 */
router.get('/readiness', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const settingsResult = await pool.query(
      `SELECT
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        is_active,
        is_test_mode,
        appointment_reminders_enabled,
        allow_patient_replies,
        updated_at
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const settings = settingsResult.rows[0];
    const hasCredentials = Boolean(settings?.twilio_account_sid && settings?.twilio_auth_token);
    const appLiveSendEnabled = isSmsLiveSendEnabled();
    const configuredMessagingServiceSid = getConfiguredMessagingServiceSid();

    const messageSummaryResult = await pool.query(
      `SELECT
         COUNT(*)::int as "total",
         COUNT(*) FILTER (WHERE direction = 'outbound')::int as "outbound",
         COUNT(*) FILTER (WHERE direction = 'inbound')::int as "inbound",
         COUNT(*) FILTER (WHERE twilio_message_sid LIKE 'mock_sms_%')::int as "mockMessages",
         COUNT(*) FILTER (WHERE twilio_message_sid LIKE 'SM%')::int as "twilioMessages",
         MAX(created_at) as "lastMessageAt"
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    const statusBreakdownResult = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY status
       ORDER BY status`,
      [tenantId]
    );

    const consentSummaryResult = await pool.query(
      `SELECT
         COUNT(*)::int as "total",
         COUNT(*) FILTER (WHERE opted_in = true)::int as "optedIn",
         COUNT(*) FILTER (WHERE opted_in = false)::int as "optedOut"
       FROM patient_sms_preferences
       WHERE tenant_id = $1`,
      [tenantId]
    );

    let twilioConnection: { success: boolean; accountName?: string; error?: string } | null = null;
    let phoneNumberInfo: any = null;
    let messagingReadiness: any = null;
    const twilioErrors: string[] = [];

    if (settings && hasCredentials) {
      const twilioService = createTwilioService(settings.twilio_account_sid, settings.twilio_auth_token);
      twilioConnection = await twilioService.testConnection();

      if (settings.twilio_phone_number) {
        try {
          phoneNumberInfo = await twilioService.getPhoneNumberInfo(settings.twilio_phone_number);
        } catch (error: any) {
          twilioErrors.push(`Phone number check failed: ${error.message}`);
        }
      }

      try {
        messagingReadiness = await twilioService.getMessagingReadiness(settings.twilio_phone_number);
      } catch (error: any) {
        twilioErrors.push(`Messaging readiness check failed: ${error.message}`);
      }
    }

    const matchingServices = (messagingReadiness?.services || []).filter(
      (service: any) => service.includesConfiguredPhone
    );
    const relevantServices = matchingServices.length > 0
      ? matchingServices
      : (messagingReadiness?.services || []);
    const campaigns = relevantServices.flatMap((service: any) => service.campaigns || []);
    const verifiedCampaign = campaigns.find(
      (campaign: any) => getCampaignStatus(campaign) === 'VERIFIED'
    );
    const approvedBrand = (messagingReadiness?.brandRegistrations || []).find(
      (brand: any) => String(brand.status || '').toUpperCase() === 'APPROVED'
    );
    const registeredMessagingService = relevantServices.find((service: any) =>
      service.includesConfiguredPhone && (service.campaigns || []).length > 0
    );
    const configuredMessagingService = configuredMessagingServiceSid
      ? relevantServices.find((service: any) => service.sid === configuredMessagingServiceSid) || null
      : null;
    const messagingServiceMatchesRegisteredPhone = Boolean(
      configuredMessagingService && configuredMessagingService.includesConfiguredPhone
    );

    const smsCapable = Boolean(phoneNumberInfo?.capabilities?.sms || phoneNumberInfo?.capabilities?.SMS);
    const gates = [
      {
        key: 'settings_active',
        label: 'SMS channel active',
        ok: Boolean(settings?.is_active),
        detail: settings?.is_active ? 'Tenant SMS settings are active.' : 'Tenant SMS settings are disabled.',
      },
      {
        key: 'production_mode',
        label: 'Production mode',
        ok: Boolean(settings && settings.is_test_mode === false),
        detail: settings?.is_test_mode === false
          ? 'SMS settings are not in test mode.'
          : 'SMS settings are still in test mode.',
      },
      {
        key: 'credentials',
        label: 'Twilio credentials',
        ok: hasCredentials && Boolean(twilioConnection?.success),
        detail: twilioConnection?.success
          ? `Twilio account reachable: ${twilioConnection.accountName || 'connected'}.`
          : twilioConnection?.error || 'Twilio credentials are missing or not reachable.',
      },
      {
        key: 'phone_number',
        label: 'SMS-capable number',
        ok: smsCapable,
        detail: smsCapable
          ? `${settings?.twilio_phone_number || 'Configured number'} is SMS capable.`
          : 'Configured number was not confirmed as SMS capable.',
      },
      {
        key: 'messaging_service',
        label: 'Registered Messaging Service',
        ok: Boolean(configuredMessagingServiceSid && messagingServiceMatchesRegisteredPhone),
        detail: !registeredMessagingService
          ? 'No Messaging Service was found for the configured SMS phone number.'
          : !configuredMessagingServiceSid
            ? `TWILIO_MESSAGING_SERVICE_SID is not set, so live sends would use the direct phone number instead of service ${registeredMessagingService.sidSuffix}.`
            : messagingServiceMatchesRegisteredPhone
              ? `Live sends are configured to use registered service ${configuredMessagingService?.sidSuffix}.`
              : 'TWILIO_MESSAGING_SERVICE_SID does not match the Messaging Service containing the configured phone number.',
      },
      {
        key: 'brand',
        label: 'A2P brand',
        ok: Boolean(approvedBrand),
        detail: approvedBrand
          ? `Brand approved (${approvedBrand.sidSuffix}).`
          : 'No approved A2P brand found from Twilio readiness check.',
      },
      {
        key: 'campaign',
        label: 'A2P campaign',
        ok: Boolean(verifiedCampaign),
        detail: verifiedCampaign
          ? `Campaign verified (${verifiedCampaign.sidSuffix}).`
          : campaigns.length > 0
            ? `Campaign status: ${campaigns.map((campaign: any) => campaign.campaignStatus || 'unknown').join(', ')}.`
            : 'No A2P campaign found for the configured messaging service/phone number.',
      },
      {
        key: 'railway_live_send',
        label: 'Railway live-send switch',
        ok: appLiveSendEnabled,
        detail: appLiveSendEnabled
          ? 'SMS_LIVE_SEND_ENABLED allows live sends in this environment.'
          : 'SMS_LIVE_SEND_ENABLED is not true, so production sends are mocked.',
      },
    ];

    const readyForLiveSend = gates.every((gate) => gate.ok);

    res.json({
      settings: settings
        ? {
            isActive: Boolean(settings.is_active),
            isTestMode: Boolean(settings.is_test_mode),
            twilioPhoneNumber: settings.twilio_phone_number,
            appointmentRemindersEnabled: Boolean(settings.appointment_reminders_enabled),
            allowPatientReplies: Boolean(settings.allow_patient_replies),
            hasCredentials,
            updatedAt: settings.updated_at,
          }
        : null,
      environment: {
        nodeEnv: env.nodeEnv,
        liveSendEnabled: appLiveSendEnabled,
        messagingServiceSidConfigured: Boolean(configuredMessagingServiceSid),
        messagingServiceSidSuffix: suffixSid(configuredMessagingServiceSid),
        messagingServiceMatchesRegisteredPhone,
        inboundSimulationEnabled:
          env.nodeEnv !== 'production' || process.env.SMS_INBOUND_SIMULATION_ENABLED === 'true',
      },
      twilio: {
        connection: twilioConnection,
        phoneNumber: phoneNumberInfo,
        messaging: messagingReadiness,
        errors: twilioErrors,
      },
      a2p: {
        brandStatus: approvedBrand ? approvedBrand.status : null,
        campaignStatus: verifiedCampaign
          ? verifiedCampaign.campaignStatus
          : campaigns[0]?.campaignStatus || null,
        verified: Boolean(verifiedCampaign),
        campaigns: campaigns.map((campaign: any) => ({
          sidSuffix: campaign.sidSuffix,
          campaignStatus: campaign.campaignStatus,
          campaignId: campaign.campaignId,
          usecase: campaign.usecase,
          errors: campaign.errors || [],
        })),
      },
      recentTraffic: {
        ...(messageSummaryResult.rows[0] || {}),
        statusBreakdown: statusBreakdownResult.rows,
      },
      consent: consentSummaryResult.rows[0] || { total: 0, optedIn: 0, optedOut: 0 },
      gates,
      readyForLiveSend,
    });
  } catch (error: any) {
    logger.error('Error fetching SMS readiness', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS readiness' });
  }
});

/**
 * POST /api/sms/a2p/resubmit
 * Resubmit the existing Twilio A2P campaign with an explicit optional opt-in/CTA flow.
 */
router.post('/a2p/resubmit', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const tenantId = req.user!.tenantId;
    const settingsResult = await pool.query(
      `SELECT id, twilio_account_sid, twilio_auth_token, twilio_phone_number
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const settings = settingsResult.rows[0];
    if (!settings?.twilio_account_sid || !settings?.twilio_auth_token || !settings?.twilio_phone_number) {
      return res.status(400).json({ error: 'Twilio SMS settings are not fully configured' });
    }

    const twilioService = createTwilioService(settings.twilio_account_sid, settings.twilio_auth_token);
    const readiness = await twilioService.getMessagingReadiness(settings.twilio_phone_number);
    const matchingServices = readiness.services.filter((service) => service.includesConfiguredPhone);
    const candidateServices = matchingServices.length > 0 ? matchingServices : readiness.services;
    const service = candidateServices.find((candidate) =>
      (candidate.campaigns || []).some((campaign) => getCampaignStatus(campaign) !== 'VERIFIED')
    ) || candidateServices.find((candidate) => (candidate.campaigns || []).length > 0);

    if (!service) {
      return res.status(400).json({ error: 'No A2P Messaging Service campaign found to resubmit' });
    }

    const campaign = (service.campaigns || []).find((candidate) => getCampaignStatus(candidate) === 'FAILED')
      || (service.campaigns || []).find((candidate) => getCampaignStatus(candidate) !== 'VERIFIED')
      || service.campaigns[0];

    if (!campaign) {
      return res.status(400).json({ error: 'No A2P campaign found to resubmit' });
    }

    const update = buildA2PCampaignUpdate();
    const updatedCampaign = await twilioService.updateA2PCampaign(service.sid, campaign.sid, update);

    await createAuditLog({
      tenantId,
      userId: req.user!.id,
      action: 'sms_a2p_campaign_resubmitted',
      resourceType: 'sms_settings',
      resourceId: settings.id || tenantId,
      metadata: {
        messagingServiceSidSuffix: service.sidSuffix,
        campaignSidSuffix: updatedCampaign.sidSuffix,
        campaignStatus: updatedCampaign.campaignStatus,
      },
    });

    res.json({
      success: true,
      message: 'A2P campaign submitted to Twilio for review.',
      messagingService: {
        sidSuffix: service.sidSuffix,
        friendlyName: service.friendlyName,
      },
      campaign: {
        sidSuffix: updatedCampaign.sidSuffix,
        campaignStatus: updatedCampaign.campaignStatus,
        campaignId: updatedCampaign.campaignId,
        usecase: updatedCampaign.usecase,
        errors: updatedCampaign.errors || [],
      },
      submission: {
        brandName: SMS_A2P_BRAND_NAME,
        consentUrl: SMS_A2P_CONSENT_URL,
        termsUrl: SMS_A2P_TERMS_URL,
        privacyUrl: SMS_A2P_PRIVACY_URL,
        sampleCount: update.messageSamples.length,
      },
    });
  } catch (error: any) {
    logger.error('Error resubmitting SMS A2P campaign', { error: error.message });
    res.status(500).json({ error: 'Failed to resubmit A2P campaign' });
  }
});

/**
 * POST /api/sms/send
 * Send SMS manually (staff use)
 */
const sendSMSSchema = z.object({
  patientId: z.string().min(1),
  messageBody: z.string().min(1).max(1600),
  messageType: z.enum(['notification', 'conversation', 'confirmation', 'reminder']).optional(),
});

router.post('/send', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = sendSMSSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, messageBody, messageType } = parsed.data;
    assertSmsContentSafe(messageBody);

    // Get patient phone number
    const patientResult = await pool.query(
      `SELECT phone, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];
    if (!patient.phone) {
      return res.status(400).json({ error: 'Patient has no phone number' });
    }

    const messagingBlock = await getPatientSMSMessagingBlock(tenantId, patientId);
    if (messagingBlock) {
      return res.status(400).json(messagingBlock);
    }

    // Get SMS settings
    const settingsResult = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token, twilio_phone_number, is_active, is_test_mode
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }

    const settings = settingsResult.rows[0];
    const fromNumber = settings.twilio_phone_number || DEFAULT_TEST_SMS_FROM;

    const result = shouldUseMockSms(settings)
      ? buildMockSmsResult(messageBody)
      : await createTwilioService(
          settings.twilio_account_sid,
          settings.twilio_auth_token
        ).sendSMS({
          to: patient.phone,
          from: fromNumber,
          body: messageBody,
        });

    // Log message
    const messageId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sms_messages
       (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
        patient_id, content, message_body, status, message_type, sent_at, segment_count)
       VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)`,
      [
        messageId,
        tenantId,
        result.sid,
        fromNumber,
        formatPhoneE164(patient.phone),
        patientId,
        messageBody,
        messageBody,
        result.status,
        messageType || 'conversation',
        result.numSegments,
      ]
    );

    await auditLog(tenantId, userId, 'sms_send', 'sms_message', messageId);

    res.json({
      success: true,
      messageId,
      twilioSid: result.sid,
      status: result.status,
    });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error sending SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

/**
 * GET /api/sms/messages
 * List SMS messages with filters
 */
router.get('/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const patientId = req.query.patientId as string | undefined;
    const direction = req.query.direction as string | undefined;
    const messageType = req.query.messageType as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        m.id,
        m.twilio_message_sid as "twilioSid",
        m.direction,
        m.from_number as "fromNumber",
        m.to_number as "toNumber",
        m.patient_id as "patientId",
        m.message_body as "messageBody",
        m.status,
        m.message_type as "messageType",
        m.segment_count as "segmentCount",
        m.keyword_matched as "keywordMatched",
        m.sent_at as "sentAt",
        m.delivered_at as "deliveredAt",
        m.failed_at as "failedAt",
        m.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName"
      FROM sms_messages m
      LEFT JOIN patients p ON m.patient_id = p.id
      WHERE m.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND m.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (direction) {
      query += ` AND m.direction = $${paramIndex}`;
      params.push(direction);
      paramIndex++;
    }

    if (messageType) {
      query += ` AND m.message_type = $${paramIndex}`;
      params.push(messageType);
      paramIndex++;
    }

    if (status) {
      query += ` AND m.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM sms_messages m WHERE m.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countParamIndex = 2;

    if (patientId) {
      countQuery += ` AND m.patient_id = $${countParamIndex}`;
      countParams.push(patientId);
      countParamIndex++;
    }
    if (direction) {
      countQuery += ` AND m.direction = $${countParamIndex}`;
      countParams.push(direction);
      countParamIndex++;
    }
    if (messageType) {
      countQuery += ` AND m.message_type = $${countParamIndex}`;
      countParams.push(messageType);
      countParamIndex++;
    }
    if (status) {
      countQuery += ` AND m.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      messages: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching SMS messages', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * GET /api/sms/messages/patient/:patientId
 * Get SMS history for specific patient
 */
router.get('/messages/patient/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    const result = await pool.query(
      `SELECT
        m.id,
        m.direction,
        m.from_number as "fromNumber",
        m.to_number as "toNumber",
        m.message_body as "messageBody",
        m.status,
        m.message_type as "messageType",
        m.segment_count as "segmentCount",
        m.sent_at as "sentAt",
        m.delivered_at as "deliveredAt",
        m.created_at as "createdAt"
       FROM sms_messages m
       WHERE m.tenant_id = $1 AND m.patient_id = $2
       ORDER BY m.created_at DESC`,
      [tenantId, patientId]
    );

    res.json({ messages: result.rows });
  } catch (error: any) {
    logger.error('Error fetching patient SMS history', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

/**
 * GET /api/sms/conversations
 * List all SMS conversations with patients (for chat UI)
 */
router.get('/conversations', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const conversationStatusSql = `
      CASE
        WHEN c.consent_status = 'opted_out' OR c.opt_out_date IS NOT NULL THEN 'blocked'
        ELSE 'active'
      END
    `;
    const lastMessageAtSql = `
      COALESCE(
        c.last_message_at,
        (
          SELECT m.created_at
          FROM sms_messages m
          WHERE m.patient_id = p.id AND m.tenant_id = $1
          ORDER BY m.created_at DESC
          LIMIT 1
        )
      )
    `;
    const lastMessageDirectionSql = `
      (
        SELECT m.direction
        FROM sms_messages m
        WHERE m.patient_id = p.id AND m.tenant_id = $1
        ORDER BY m.created_at DESC
        LIMIT 1
      )
    `;
    const lastMessagePreviewSql = `
      (
        SELECT LEFT(COALESCE(NULLIF(m.message_body, ''), NULLIF(m.content, ''), ''), 160)
        FROM sms_messages m
        WHERE m.patient_id = p.id AND m.tenant_id = $1
        ORDER BY m.created_at DESC
        LIMIT 1
      )
    `;

    const result = await pool.query(
      `SELECT DISTINCT ON (p.id)
        COALESCE(c.id::text, gen_random_uuid()::text) as "id",
        p.id as "patientId",
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.first_name || ' ' || p.last_name as "patientName",
        p.mrn as "patientMrn",
        COALESCE(NULLIF(BTRIM(p.phone), ''), NULLIF(BTRIM(c.phone_number), '')) as "phoneNumber",
        COALESCE(NULLIF(BTRIM(p.phone), ''), NULLIF(BTRIM(c.phone_number), '')) as "phone",
        COALESCE(
          prefs.opted_in,
          CASE
            WHEN c.consent_status = 'opted_out' OR c.opt_out_date IS NOT NULL THEN false
            ELSE true
          END
        ) as "smsOptIn",
        COALESCE(prefs.opted_out_at, c.opt_out_date) as "optedOutAt",
        ${conversationStatusSql} as "status",
        COALESCE(thread.category, 'general') as "category",
        COALESCE(thread.status, 'open') as "threadStatus",
        thread.id as "threadId",
        ${lastMessageAtSql} as "lastMessageAt",
        ${lastMessageAtSql} as "lastMessageTime",
        ${lastMessageDirectionSql} as "lastMessageDirection",
        ${lastMessagePreviewSql} as "lastMessagePreview",
        ${lastMessagePreviewSql} as "lastMessage",
        COALESCE(
          c.unread_count,
          (
          SELECT COUNT(*)::int
          FROM sms_messages m
          WHERE m.patient_id = p.id
            AND m.tenant_id = $1
            AND m.direction = 'inbound'
            AND m.created_at > COALESCE((
              SELECT last_read_at FROM sms_message_reads
              WHERE patient_id = p.id AND tenant_id = $1
            ), '1970-01-01'::timestamp)
          )
        ) as "unreadCount"
      FROM patients p
      LEFT JOIN sms_conversations c ON c.patient_id = p.id AND c.tenant_id = $1
      LEFT JOIN patient_sms_preferences prefs ON prefs.patient_id = p.id AND prefs.tenant_id = $1
      LEFT JOIN LATERAL (
        SELECT t.id, t.category, t.status
        FROM patient_message_threads t
        WHERE t.patient_id = p.id AND t.tenant_id = $1
        ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
        LIMIT 1
      ) thread ON true
      WHERE p.tenant_id = $1
        AND COALESCE(NULLIF(BTRIM(p.phone), ''), NULLIF(BTRIM(c.phone_number), '')) IS NOT NULL
        ${status ? `AND ${conversationStatusSql} = $4` : `AND ${conversationStatusSql} != 'blocked'`}
      ORDER BY p.id, (
        ${lastMessageAtSql}
      ) DESC NULLS LAST
      LIMIT $2 OFFSET $3`,
      status ? [tenantId, limit, offset, status] : [tenantId, limit, offset]
    );

    res.json({ conversations: dedupeSmsConversations(result.rows) });
  } catch (error: any) {
    logger.error('Error fetching SMS conversations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/sms/conversations/:patientId
 * Get full conversation with a specific patient
 */
router.get('/conversations/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    // Get patient info
    const patientResult = await pool.query(
      `SELECT
        p.id,
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.phone,
        COALESCE(thread.category, 'general') as "category",
        COALESCE(thread.status, 'open') as "threadStatus",
        thread.id as "threadId"
       FROM patients p
       LEFT JOIN LATERAL (
         SELECT t.id, t.category, t.status
         FROM patient_message_threads t
         WHERE t.patient_id = p.id AND t.tenant_id = p.tenant_id
         ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
         LIMIT 1
       ) thread ON true
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    // Get messages
    const messagesResult = await pool.query(
      `SELECT
        id,
        direction,
        message_body as "messageBody",
        status,
        sent_at as "sentAt",
        delivered_at as "deliveredAt",
        created_at as "createdAt"
      FROM sms_messages
      WHERE patient_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC`,
      [patientId, tenantId]
    );

    res.json({
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientPhone: patient.phone,
      category: patient.category,
      threadStatus: patient.threadStatus,
      threadId: patient.threadId,
      messages: messagesResult.rows,
    });
  } catch (error: any) {
    logger.error('Error fetching conversation', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * POST /api/sms/conversations/:patientId/send
 * Send a message in a conversation
 */
const sendConversationMessageSchema = z.object({
  message: z.string().min(1).max(1600),
});

const updateConversationRoutingSchema = z.object({
  category: z.enum(smsRoutingCategories),
});

router.post('/conversations/:patientId/send', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.fullName || 'Staff Member';
    const patientId = req.params.patientId || '';

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const parsed = sendConversationMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { message } = parsed.data;
    assertSmsContentSafe(message);

    // Get patient phone
    const patientResult = await pool.query(
      `SELECT phone, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];
    if (!patient.phone) {
      return res.status(400).json({ error: 'Patient has no phone number' });
    }

    const messagingBlock = await getPatientSMSMessagingBlock(tenantId, patientId);
    if (messagingBlock) {
      return res.status(400).json(messagingBlock);
    }

    // Get SMS settings
    const settingsResult = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token, twilio_phone_number, is_active, is_test_mode
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }

    const settings = settingsResult.rows[0];
    const fromNumber = settings.twilio_phone_number || DEFAULT_TEST_SMS_FROM;

    const result = shouldUseMockSms(settings)
      ? buildMockSmsResult(message)
      : await createTwilioService(
          settings.twilio_account_sid,
          settings.twilio_auth_token
        ).sendSMS({
          to: patient.phone,
          from: fromNumber,
          body: message,
        });

    const client = await pool.connect();
    const messageId = crypto.randomUUID();

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO sms_messages
         (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
          patient_id, content, message_body, status, message_type, sent_at, segment_count)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, 'conversation', CURRENT_TIMESTAMP, $10)`,
        [
          messageId,
          tenantId,
          result.sid,
          fromNumber,
          formatPhoneE164(patient.phone),
          patientId,
          message,
          message,
          result.status,
          result.numSegments,
        ]
      );

      const thread = await findOrCreateMessageThread(tenantId, patientId, message, client);
      await addMessageToThread(
        {
          threadId: thread.id,
          senderType: 'staff',
          senderUserId: userId,
          senderName: userName,
          messageText: message,
          deliveredToPatient: true,
        },
        client
      );
      await markThreadUnreadByPatient(thread.id, client);
      await updateMessageThreadRoute(
        thread.id,
        (thread.category || 'general') as SMSRoutingCategory,
        'waiting-patient',
        client
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await auditLog(tenantId, userId, 'sms_send', 'sms_message', messageId);

    res.json({
      success: true,
      messageId,
      twilioSid: result.sid,
      status: result.status,
    });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error sending conversation message', { error: error.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.put('/conversations/:patientId/routing', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId || '';

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const parsed = updateConversationRoutingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const thread = await findOrCreateMessageThread(tenantId, patientId, 'SMS conversation', client);
      const nextStatus = thread.status === 'waiting-patient' ? 'open' : thread.status || 'open';
      await updateMessageThreadRoute(thread.id, parsed.data.category, nextStatus, client);
      await client.query('COMMIT');

      await auditLog(tenantId, userId, 'sms_conversation_route_update', 'patient_message_thread', thread.id);

      return res.json({
        success: true,
        patientId,
        threadId: thread.id,
        category: parsed.data.category,
        threadStatus: nextStatus,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error('Error updating SMS conversation routing', { error: error.message });
    res.status(500).json({ error: 'Failed to update conversation routing' });
  }
});

/**
 * PUT /api/sms/conversations/:patientId/mark-read
 * Mark conversation as read
 */
router.put('/conversations/:patientId/mark-read', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO sms_message_reads (tenant_id, patient_id, last_read_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
        [tenantId, patientId]
      );

      const threadResult = await client.query(
        `SELECT id
         FROM patient_message_threads
         WHERE tenant_id = $1 AND patient_id = $2 AND status != 'closed'
         ORDER BY last_message_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [tenantId, patientId]
      );

      if (threadResult.rows[0]?.id) {
        await markThreadReadByStaff(threadResult.rows[0].id, userId, client);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error marking conversation as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

/**
 * GET /api/sms/auto-responses
 * List auto-response keywords
 */
router.get('/auto-responses', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const branding = await getSMSPracticeBranding(tenantId, pool);

    const result = await pool.query(
      `SELECT
        id,
        keyword,
        response_text as "responseText",
        action,
        is_active as "isActive",
        is_system_keyword as "isSystemKeyword",
        priority,
        created_at as "createdAt"
       FROM sms_auto_responses
       WHERE tenant_id = $1
      ORDER BY priority DESC, keyword`,
      [tenantId]
    );

    const autoResponses = result.rows.map((row) => {
      if (!row.isSystemKeyword) {
        return row;
      }

      switch (String(row.keyword || '').toUpperCase()) {
        case 'HELP':
          return { ...row, responseText: buildSMSHelpText(branding) };
        case 'START':
          return { ...row, responseText: buildSMSOptInConfirmationText(branding) };
        case 'STOP':
          return { ...row, responseText: buildSMSOptOutConfirmationText(branding) };
        default:
          return row;
      }
    });

    res.json({ autoResponses });
  } catch (error: any) {
    logger.error('Error fetching auto-responses', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch auto-responses' });
  }
});

/**
 * PUT /api/sms/auto-responses/:id
 * Update auto-response
 */
const updateAutoResponseSchema = z.object({
  responseText: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.put('/auto-responses/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const autoResponseId = req.params.id;

    const parsed = updateAutoResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    // Check if it's a system keyword (cannot modify)
    const checkResult = await pool.query(
      `SELECT is_system_keyword FROM sms_auto_responses WHERE id = $1 AND tenant_id = $2`,
      [autoResponseId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auto-response not found' });
    }

    if (checkResult.rows[0].is_system_keyword && parsed.data.responseText) {
      return res.status(400).json({
        error: 'Cannot modify response text of system keywords (STOP, START, HELP)',
      });
    }

    if (parsed.data.responseText !== undefined) {
      assertSmsContentSafe(parsed.data.responseText);
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (parsed.data.responseText !== undefined) {
      updates.push(`response_text = $${paramIndex}`);
      params.push(parsed.data.responseText);
      paramIndex++;
    }

    if (parsed.data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(parsed.data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(autoResponseId, tenantId);

    await pool.query(
      `UPDATE sms_auto_responses SET ${updates.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      params
    );

    await auditLog(tenantId, userId, 'sms_auto_response_update', 'sms_auto_response', autoResponseId!);

    res.json({ success: true });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error updating auto-response', { error: error.message });
    res.status(500).json({ error: 'Failed to update auto-response' });
  }
});

/**
 * GET /api/sms/patient-preferences/:patientId
 * Get patient SMS preferences
 */
router.get('/patient-preferences/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    const result = await pool.query(
      `SELECT
        id,
        opted_in as "optedIn",
        appointment_reminders as "appointmentReminders",
        marketing_messages as "marketingMessages",
        transactional_messages as "transactionalMessages",
        opted_out_at as "optedOutAt",
        opted_out_reason as "optedOutReason",
        consent_date as "consentDate",
        consent_method as "consentMethod"
       FROM patient_sms_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        optedIn: true,
        appointmentReminders: true,
        marketingMessages: false,
        transactionalMessages: true,
      });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching patient SMS preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/sms/patient-preferences/:patientId
 * Update patient SMS preferences
 */
const updatePreferencesSchema = z.object({
  optedIn: z.boolean().optional(),
  appointmentReminders: z.boolean().optional(),
  marketingMessages: z.boolean().optional(),
});

router.put('/patient-preferences/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId;

    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;

    // Check if preferences exist
    const existingResult = await pool.query(
      `SELECT id FROM patient_sms_preferences WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (existingResult.rows.length === 0) {
      // Create new preferences
      await pool.query(
        `INSERT INTO patient_sms_preferences
         (tenant_id, patient_id, opted_in, appointment_reminders, marketing_messages)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          patientId,
          data.optedIn ?? true,
          data.appointmentReminders ?? true,
          data.marketingMessages ?? false,
        ]
      );
    } else {
      // Update existing preferences
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.optedIn !== undefined) {
        updates.push(`opted_in = $${paramIndex}`);
        params.push(data.optedIn);
        paramIndex++;

        if (!data.optedIn) {
          updates.push(`opted_out_at = CURRENT_TIMESTAMP, opted_out_via = 'staff'`);
        } else {
          updates.push(`opted_out_at = NULL`);
        }
      }

      if (data.appointmentReminders !== undefined) {
        updates.push(`appointment_reminders = $${paramIndex}`);
        params.push(data.appointmentReminders);
        paramIndex++;
      }

      if (data.marketingMessages !== undefined) {
        updates.push(`marketing_messages = $${paramIndex}`);
        params.push(data.marketingMessages);
        paramIndex++;
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(tenantId, patientId);

        await pool.query(
          `UPDATE patient_sms_preferences SET ${updates.join(', ')} WHERE tenant_id = $${paramIndex} AND patient_id = $${paramIndex + 1}`,
          params
        );
      }
    }

    await auditLog(tenantId, userId, 'patient_sms_preferences_update', 'patient_sms_preferences', patientId!);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error updating patient SMS preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/sms/opt-out
 * Opt out a patient from SMS messaging
 */
const optOutSchema = z.object({
  patientId: z.string().uuid(),
  reason: z.string().optional(),
});

router.post('/opt-out', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = optOutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, reason } = parsed.data;

    // Get patient phone
    const patientResult = await pool.query(
      `SELECT phone FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0 || !patientResult.rows[0].phone) {
      return res.status(404).json({ error: 'Patient not found or has no phone' });
    }

    const phoneNumber = formatPhoneE164(patientResult.rows[0].phone);
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    await revokeSMSConsent(
      tenantId,
      patientId,
      {
        reason: reason || 'Staff action',
        notes: 'Patient opted out from SMS management screen',
        optedOutVia: 'staff',
      },
      pool
    );
    await upsertSMSOptOut(tenantId, phoneNumber, reason || 'Staff action', pool);

    await auditLog(tenantId, userId, 'sms_opt_out', 'patient', patientId);

    logger.info('Patient opted out of SMS', {
      patientId,
      tenantId,
      reason,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error opting out patient', { error: error.message });
    res.status(500).json({ error: 'Failed to opt out patient' });
  }
});

/**
 * POST /api/sms/send-reminder/:appointmentId
 * Send immediate reminder for appointment
 */
const sendReminderSchema = z.object({
  channel: z.enum(['sms', 'voice']).optional(),
});

router.post('/send-reminder/:appointmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.appointmentId!;
    const parsed = sendReminderSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const channel = parsed.data.channel || 'sms';
    const result = await sendImmediateReminder(tenantId, appointmentId, channel);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, userId, `sms_reminder_send_${channel}`, 'appointment', appointmentId!);

    res.json({ success: true, channel });
  } catch (error: any) {
    logger.error('Error sending reminder', { error: error.message });
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

/**
 * POST /api/sms/send-call-reminder/:appointmentId
 * Convenience endpoint for immediate voice reminder calls
 */
router.post('/send-call-reminder/:appointmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.appointmentId!;

    const result = await sendImmediateReminder(tenantId, appointmentId, 'voice');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, userId, 'sms_reminder_send_voice', 'appointment', appointmentId);

    res.json({ success: true, channel: 'voice' });
  } catch (error: any) {
    logger.error('Error sending reminder call', { error: error.message });
    res.status(500).json({ error: 'Failed to send reminder call' });
  }
});

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * GET /api/sms/templates
 * List message templates
 */
router.get('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const category = req.query.category as string | undefined;
    const activeOnly = req.query.activeOnly === 'true';

    let query = `
      SELECT
        id,
        name,
        description,
        message_body as "messageBody",
        category,
        is_system_template as "isSystemTemplate",
        is_active as "isActive",
        usage_count as "usageCount",
        last_used_at as "lastUsedAt",
        created_at as "createdAt"
      FROM sms_message_templates
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (activeOnly) {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY category, name`;

    const result = await pool.query(query, params);

    res.json({ templates: result.rows });
  } catch (error: any) {
    logger.error('Error fetching templates', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/sms/templates
 * Create new message template
 */
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  messageBody: z.string().min(1).max(1600),
  category: z.string().optional(),
});

router.post('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { name, description, messageBody, category } = parsed.data;
    assertSmsContentSafe(messageBody);

    const templateId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sms_message_templates
       (id, tenant_id, name, description, message_body, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [templateId, tenantId, name, description || null, messageBody, category || 'general', userId]
    );

    await auditLog(tenantId, userId, 'sms_template_create', 'sms_template', templateId);

    res.json({ success: true, templateId });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error creating template', { error: error.message });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PATCH /api/sms/templates/:id
 * Update message template
 */
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  messageBody: z.string().min(1).max(1600).optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/templates/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const templateId = req.params.id;

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    // Check if template is system template
    const checkResult = await pool.query(
      `SELECT is_system_template FROM sms_message_templates WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (checkResult.rows[0].is_system_template && (parsed.data.name || parsed.data.messageBody)) {
      return res.status(400).json({ error: 'Cannot modify name or body of system templates' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const data = parsed.data;
    if (data.messageBody !== undefined) {
      assertSmsContentSafe(data.messageBody);
    }

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }
    if (data.messageBody !== undefined) {
      updates.push(`message_body = $${paramIndex}`);
      params.push(data.messageBody);
      paramIndex++;
    }
    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(data.category);
      paramIndex++;
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(templateId, tenantId);

    await pool.query(
      `UPDATE sms_message_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      params
    );

    await auditLog(tenantId, userId, 'sms_template_update', 'sms_template', templateId!);

    res.json({ success: true });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error updating template', { error: error.message });
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/sms/templates/:id
 * Delete message template (only non-system templates)
 */
router.delete('/templates/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const templateId = req.params.id;

    // Check if template is system template
    const checkResult = await pool.query(
      `SELECT is_system_template FROM sms_message_templates WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (checkResult.rows[0].is_system_template) {
      return res.status(400).json({ error: 'Cannot delete system templates' });
    }

    await pool.query(
      `DELETE FROM sms_message_templates WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    await auditLog(tenantId, userId, 'sms_template_delete', 'sms_template', templateId!);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting template', { error: error.message });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// BULK MESSAGING
// ============================================================================

/**
 * POST /api/sms/send-bulk
 * Send message to multiple patients
 */
const sendBulkSchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1),
  messageBody: z.string().min(1).max(1600),
  templateId: z.string().uuid().optional(),
  scheduleTime: z.string().optional(), // ISO timestamp for scheduling
});

router.post('/send-bulk', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = sendBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientIds, messageBody, templateId, scheduleTime } = parsed.data;
    assertSmsContentSafe(messageBody);
    const optedOutPatientIds = await getOptedOutSMSRecipientIds(tenantId, patientIds);

    if (scheduleTime && optedOutPatientIds.size > 0) {
      return res.status(400).json({
        error: 'One or more selected patients have opted out of SMS',
        code: 'opted_out',
      });
    }

    // Get SMS settings
    const settingsResult = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token, twilio_phone_number, is_active, is_test_mode
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }

    const settings = settingsResult.rows[0];

    // If scheduled, create scheduled message
    if (scheduleTime) {
      const scheduledId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_scheduled_messages
         (id, tenant_id, patient_ids, message_body, template_id, scheduled_send_time,
          status, total_recipients, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)`,
        [
          scheduledId,
          tenantId,
          JSON.stringify(patientIds),
          messageBody,
          templateId || null,
          scheduleTime,
          patientIds.length,
          userId,
        ]
      );

      await auditLog(tenantId, userId, 'sms_bulk_schedule', 'sms_scheduled_message', scheduledId);

      return res.json({ success: true, scheduledId, scheduled: true });
    }

    // Send immediately
    const fromNumber = settings.twilio_phone_number || DEFAULT_TEST_SMS_FROM;
    const useMockSms = shouldUseMockSms(settings);
    const twilioService = useMockSms
      ? null
      : createTwilioService(settings.twilio_account_sid, settings.twilio_auth_token);

    const results = {
      total: patientIds.length,
      sent: 0,
      failed: 0,
      messageIds: [] as string[],
    };

    // Get patients
    const patientsResult = await pool.query(
      `SELECT id, phone, first_name, last_name FROM patients
       WHERE id = ANY($1) AND tenant_id = $2`,
      [patientIds, tenantId]
    );

    for (const patient of patientsResult.rows) {
      if (!patient.phone) {
        results.failed++;
        continue;
      }

      if (optedOutPatientIds.has(String(patient.id))) {
        results.failed++;
        continue;
      }

      try {
        // Replace variables in message
        let personalizedMessage = messageBody
          .replace(/{firstName}/g, patient.first_name)
          .replace(/{lastName}/g, patient.last_name)
          .replace(/{patientName}/g, `${patient.first_name} ${patient.last_name}`);

        const result = useMockSms
          ? buildMockSmsResult(personalizedMessage)
          : await twilioService!.sendSMS({
              to: patient.phone,
              from: fromNumber,
              body: personalizedMessage,
            });

        const messageId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO sms_messages
           (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
            patient_id, content, message_body, status, message_type, sent_at, segment_count)
           VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, 'notification', CURRENT_TIMESTAMP, $10)`,
          [
            messageId,
            tenantId,
            result.sid,
            fromNumber,
            formatPhoneE164(patient.phone),
            patient.id,
            personalizedMessage,
            personalizedMessage,
            result.status,
            result.numSegments,
          ]
        );

        results.sent++;
        results.messageIds.push(messageId);
      } catch (error: any) {
        logger.error('Error sending bulk SMS to patient', {
          patientId: patient.id,
          error: error.message,
        });
        results.failed++;
      }
    }

    // Update template usage if used
    if (templateId) {
      await pool.query(
        `UPDATE sms_message_templates
         SET usage_count = usage_count + $1, last_used_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND tenant_id = $3`,
        [results.sent, templateId, tenantId]
      );
    }

    await auditLog(tenantId, userId, 'sms_bulk_send', 'sms_bulk', userId);

    res.json({ success: true, results });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error sending bulk SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to send bulk messages' });
  }
});

// ============================================================================
// SCHEDULED MESSAGES
// ============================================================================

/**
 * GET /api/sms/scheduled
 * List scheduled messages
 */
router.get('/scheduled', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;

    let query = `
      SELECT
        s.id,
        s.patient_id as "patientId",
        s.patient_ids as "patientIds",
        s.message_body as "messageBody",
        s.template_id as "templateId",
        s.scheduled_send_time as "scheduledSendTime",
        s.is_recurring as "isRecurring",
        s.recurrence_pattern as "recurrencePattern",
        s.status,
        s.total_recipients as "totalRecipients",
        s.sent_count as "sentCount",
        s.delivered_count as "deliveredCount",
        s.failed_count as "failedCount",
        s.created_at as "createdAt",
        s.sent_at as "sentAt",
        t.name as "templateName",
        p.first_name || ' ' || p.last_name as "patientName"
      FROM sms_scheduled_messages s
      LEFT JOIN sms_message_templates t ON s.template_id = t.id
      LEFT JOIN patients p ON s.patient_id = p.id
      WHERE s.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY s.scheduled_send_time DESC`;

    const result = await pool.query(query, params);

    res.json({ scheduled: result.rows });
  } catch (error: any) {
    logger.error('Error fetching scheduled messages', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

/**
 * POST /api/sms/scheduled
 * Create scheduled message
 */
const createScheduledSchema = z.object({
  patientId: z.string().uuid().optional(),
  patientIds: z.array(z.string().uuid()).optional(),
  messageBody: z.string().min(1).max(1600),
  templateId: z.string().uuid().optional(),
  scheduledSendTime: z.string(), // ISO timestamp
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  recurrenceEndDate: z.string().optional(),
});

router.post('/scheduled', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createScheduledSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;
    assertSmsContentSafe(data.messageBody);

    if (!data.patientId && (!data.patientIds || data.patientIds.length === 0)) {
      return res.status(400).json({ error: 'Must provide patientId or patientIds' });
    }

    const targetPatientIds = data.patientIds?.length
      ? data.patientIds
      : data.patientId
      ? [data.patientId]
      : [];
    const optedOutPatientIds = await getOptedOutSMSRecipientIds(tenantId, targetPatientIds);
    if (optedOutPatientIds.size > 0) {
      return res.status(400).json({
        error: 'One or more selected patients have opted out of SMS',
        code: 'opted_out',
      });
    }

    const scheduledId = crypto.randomUUID();
    const totalRecipients = data.patientIds ? data.patientIds.length : 1;

    await pool.query(
      `INSERT INTO sms_scheduled_messages
       (id, tenant_id, patient_id, patient_ids, message_body, template_id,
        scheduled_send_time, is_recurring, recurrence_pattern, recurrence_end_date,
        status, total_recipients, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', $11, $12)`,
      [
        scheduledId,
        tenantId,
        data.patientId || null,
        data.patientIds ? JSON.stringify(data.patientIds) : null,
        data.messageBody,
        data.templateId || null,
        data.scheduledSendTime,
        data.isRecurring || false,
        data.recurrencePattern || null,
        data.recurrenceEndDate || null,
        totalRecipients,
        userId,
      ]
    );

    await auditLog(tenantId, userId, 'sms_scheduled_create', 'sms_scheduled_message', scheduledId);

    res.json({ success: true, scheduledId });
  } catch (error: any) {
    if (handleSmsPrivacyError(res, error)) return;
    logger.error('Error creating scheduled message', { error: error.message });
    res.status(500).json({ error: 'Failed to create scheduled message' });
  }
});

/**
 * DELETE /api/sms/scheduled/:id
 * Cancel scheduled message
 */
router.delete('/scheduled/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const scheduledId = req.params.id;

    await pool.query(
      `UPDATE sms_scheduled_messages
       SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $1
       WHERE id = $2 AND tenant_id = $3 AND status = 'scheduled'`,
      [userId, scheduledId, tenantId]
    );

    await auditLog(tenantId, userId, 'sms_scheduled_cancel', 'sms_scheduled_message', scheduledId!);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error cancelling scheduled message', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

// ============================================================================
// TEST MODE HELPERS
// ============================================================================

const simulateInboundSchema = z.object({
  patientId: z.string().uuid(),
  messageBody: z.string().min(1).max(1600),
});

/**
 * POST /api/sms/test/inbound
 * Simulate an inbound patient SMS in test mode or non-production environments.
 */
router.post('/test/inbound', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = simulateInboundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, messageBody } = parsed.data;

    const settingsResult = await pool.query(
      `SELECT twilio_phone_number, is_active, is_test_mode
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }
    if (!isInboundSimulationEnabled(Boolean(settingsResult.rows[0].is_test_mode))) {
      return res.status(400).json({
        error: 'Inbound simulation is only available in SMS test mode or non-production environments',
      });
    }

    const patientResult = await pool.query(
      `SELECT phone FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    if (!patientResult.rows[0].phone) {
      return res.status(400).json({ error: 'Patient has no phone number' });
    }

    const toNumber = settingsResult.rows[0].twilio_phone_number || DEFAULT_TEST_SMS_FROM;

    const mockTwilioService = {
      sendSMS: async (params: { body: string }) => buildMockSmsResult(params.body),
    } as unknown as TwilioService;

    const result = await processIncomingSMS(
      {
        messageSid: `mock_inbound_${crypto.randomUUID()}`,
        from: patientResult.rows[0].phone,
        to: toNumber,
        body: messageBody,
        numMedia: 0,
        mediaUrls: [],
        tenantId,
      },
      mockTwilioService
    );

    await auditLog(tenantId, userId, 'sms_test_inbound', 'sms_message', result.messageId);

    res.json({
      success: true,
      messageId: result.messageId,
      autoResponseSent: result.autoResponseSent || false,
      actionPerformed: result.actionPerformed || null,
    });
  } catch (error: any) {
    logger.error('Error simulating inbound SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to simulate inbound SMS' });
  }
});

// ============================================================================
// TWILIO WEBHOOK ROUTES (NO AUTHENTICATION - validated by signature)
// ============================================================================

const SMS_STATUS_ORDER: Record<string, number> = {
  accepted: 10,
  scheduled: 20,
  queued: 30,
  sending: 40,
  sent: 50,
  delivered: 100,
  read: 110,
  failed: 100,
  undelivered: 100,
  canceled: 100,
  cancelled: 100,
};

const TERMINAL_SMS_STATUSES = new Set(['delivered', 'failed', 'undelivered', 'canceled', 'cancelled']);

function normalizeSmsStatus(status: unknown): string | null {
  if (typeof status !== 'string') {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function classifySmsStatusTransition(
  currentStatus: unknown,
  incomingStatus: string
): 'apply' | 'duplicate' | 'stale' | 'locked' {
  const normalizedCurrent = normalizeSmsStatus(currentStatus);

  if (!normalizedCurrent) {
    return 'apply';
  }

  if (normalizedCurrent === incomingStatus) {
    return 'duplicate';
  }

  if (TERMINAL_SMS_STATUSES.has(normalizedCurrent)) {
    return 'locked';
  }

  const currentRank = SMS_STATUS_ORDER[normalizedCurrent];
  const incomingRank = SMS_STATUS_ORDER[incomingStatus];

  if (
    currentRank !== undefined &&
    incomingRank !== undefined &&
    incomingRank < currentRank
  ) {
    return 'stale';
  }

  return 'apply';
}

/**
 * POST /api/sms/webhook/incoming
 * Twilio webhook for incoming SMS messages
 */
router.post('/webhook/incoming', async (req: Request, res: Response) => {
  try {
    // Extract Twilio signature for validation
    const signature = req.headers['x-twilio-signature'] as string;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Get tenant from Twilio phone number (To field)
    const toNumber = formatPhoneE164(req.body.To);

    const tenantResult = await pool.query(
      `SELECT tenant_id, twilio_account_sid, twilio_auth_token
       FROM sms_settings
       WHERE twilio_phone_number = $1 AND is_active = true`,
      [toNumber]
    );

    if (tenantResult.rows.length === 0) {
      logger.warn('Incoming SMS to unknown number', { toNumber });
      return res.status(404).send('Number not configured');
    }

    const tenant = tenantResult.rows[0];

    // Validate webhook signature
    const twilioService = createTwilioService(
      tenant.twilio_account_sid,
      tenant.twilio_auth_token
    );

    const isValid = twilioService.validateWebhookSignature(signature, url, req.body);

    if (!isValid) {
      logger.error('Invalid Twilio webhook signature', { url });
      return res.status(403).send('Invalid signature');
    }

    // Process incoming SMS
    const result = await processIncomingSMS(
      {
        messageSid: req.body.MessageSid,
        from: req.body.From,
        to: req.body.To,
        body: req.body.Body,
        numMedia: parseInt(req.body.NumMedia || '0'),
        mediaUrls: [], // TODO: Handle MMS media URLs
        tenantId: tenant.tenant_id,
      },
      twilioService
    );

    logger.info('Incoming SMS processed', {
      messageId: result.messageId,
      autoResponseSent: result.autoResponseSent,
    });

    // Respond to Twilio with TwiML (empty response)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: any) {
    logger.error('Error processing incoming SMS webhook', {
      error: error.message,
      messageSid: req.body?.MessageSid,
    });
    res.status(500).send('Error processing message');
  }
});

/**
 * POST /api/sms/webhook/status
 * Twilio webhook for message delivery status updates
 */
router.post('/webhook/status', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-twilio-signature'] as string;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const messageSid = req.body.MessageSid;
    const messageStatus = normalizeSmsStatus(req.body.MessageStatus);
    const errorCode = req.body.ErrorCode;
    const errorMessage = req.body.ErrorMessage;

    if (!messageSid) {
      return res.status(400).send('Missing MessageSid');
    }
    if (!messageStatus) {
      return res.status(400).send('Missing MessageStatus');
    }

    const tenantResult = await pool.query(
      `SELECT m.tenant_id, m.status as current_status, s.twilio_account_sid, s.twilio_auth_token
       FROM sms_messages m
       JOIN sms_settings s ON s.tenant_id = m.tenant_id
       WHERE m.twilio_message_sid = $1
       LIMIT 1`,
      [messageSid]
    );

    if (tenantResult.rows.length === 0) {
      logger.warn('SMS status webhook for unknown message', { messageSid });
      return res.status(404).send('Message not found');
    }

    const tenant = tenantResult.rows[0];
    const twilioService = createTwilioService(
      tenant.twilio_account_sid,
      tenant.twilio_auth_token
    );

    const isValid = twilioService.validateWebhookSignature(signature, url, req.body);
    if (!isValid) {
      logger.error('Invalid Twilio status webhook signature', { messageSid });
      return res.status(403).send('Invalid signature');
    }

    logger.info('SMS status webhook', {
      messageSid,
      status: messageStatus,
      errorCode,
    });

    const transitionDecision = classifySmsStatusTransition(
      tenant.current_status,
      messageStatus
    );

    if (transitionDecision === 'duplicate') {
      logger.info('Ignoring duplicate SMS status webhook event', {
        messageSid,
        status: messageStatus,
      });
      return res.status(200).send('OK');
    }

    if (transitionDecision === 'locked') {
      logger.warn('Ignoring SMS status webhook after terminal status set', {
        messageSid,
        currentStatus: tenant.current_status,
        incomingStatus: messageStatus,
      });
      return res.status(200).send('OK');
    }

    if (transitionDecision === 'stale') {
      logger.warn('Ignoring stale SMS status webhook event', {
        messageSid,
        currentStatus: tenant.current_status,
        incomingStatus: messageStatus,
      });
      return res.status(200).send('OK');
    }

    // Update message status in database
    await updateSMSStatus(messageSid, messageStatus, errorCode, errorMessage);

    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Error processing status webhook', {
      error: error.message,
      messageSid: req.body?.MessageSid,
    });
    res.status(500).send('Error processing status');
  }
});

// ============================================================================
// WORKFLOW SMS ENDPOINTS
// ============================================================================

import { smsWorkflowService, processScheduledReminders, processFollowUpReminders } from '../services/smsWorkflowService';

/**
 * POST /api/sms/workflow/appointment-confirmation/:appointmentId
 * Send appointment confirmation SMS manually
 */
router.post('/workflow/appointment-confirmation/:appointmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const appointmentId = req.params.appointmentId as string;
    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID required' });
    }

    const result = await smsWorkflowService.sendAppointmentConfirmation(tenantId, appointmentId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, req.user!.id, 'sms_workflow_confirmation', 'appointment', appointmentId || 'unknown');
    res.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    logger.error('Error sending appointment confirmation SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to send confirmation SMS' });
  }
});

/**
 * POST /api/sms/workflow/appointment-reminder/:appointmentId
 * Send appointment reminder SMS (24h or 2h)
 */
router.post('/workflow/appointment-reminder/:appointmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const appointmentId = req.params.appointmentId as string;
    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID required' });
    }
    const reminderType = (req.body.reminderType as '24h' | '2h') || '24h';

    const result = await smsWorkflowService.sendAppointmentReminder(tenantId, appointmentId, reminderType);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, req.user!.id, 'sms_workflow_reminder', 'appointment', appointmentId || 'unknown');
    res.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    logger.error('Error sending appointment reminder SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to send reminder SMS' });
  }
});

/**
 * POST /api/sms/workflow/process-reminders
 * Process all scheduled reminders (admin endpoint for manual trigger)
 */
router.post('/workflow/process-reminders', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    // Only allow admin users
    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = await processScheduledReminders();
    res.json({ success: true, ...results });
  } catch (error: any) {
    logger.error('Error processing scheduled reminders', { error: error.message });
    res.status(500).json({ error: 'Failed to process reminders' });
  }
});

/**
 * POST /api/sms/workflow/process-followups
 * Process follow-up and recall reminders (admin endpoint for manual trigger)
 */
router.post('/workflow/process-followups', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    // Only allow admin users
    if (!userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = await processFollowUpReminders();
    res.json({ success: true, ...results });
  } catch (error: any) {
    logger.error('Error processing follow-up reminders', { error: error.message });
    res.status(500).json({ error: 'Failed to process follow-ups' });
  }
});

/**
 * GET /api/sms/workflow/scheduled-reminders
 * Get scheduled reminders for an appointment or tenant
 */
router.get('/workflow/scheduled-reminders', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const appointmentId = req.query.appointmentId as string | undefined;
    const status = req.query.status as string | undefined;

    let query = `
      SELECT
        sr.id,
        sr.appointment_id as "appointmentId",
        sr.reminder_type as "reminderType",
        sr.scheduled_time as "scheduledTime",
        sr.status,
        sr.sent_at as "sentAt",
        sr.error_message as "errorMessage",
        p.first_name || ' ' || p.last_name as "patientName",
        a.start_time as "appointmentTime"
      FROM scheduled_reminders sr
      JOIN appointments a ON a.id = sr.appointment_id
      JOIN patients p ON p.id = a.patient_id
      WHERE sr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (appointmentId) {
      query += ` AND sr.appointment_id = $${paramIndex}`;
      params.push(appointmentId);
      paramIndex++;
    }

    if (status) {
      query += ` AND sr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY sr.scheduled_time ASC LIMIT 100`;

    const result = await pool.query(query, params);
    res.json({ reminders: result.rows });
  } catch (error: any) {
    logger.error('Error fetching scheduled reminders', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

export const smsRouter = router;
