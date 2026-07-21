/**
 * SMS Processor Service
 * Handles incoming SMS messages, keyword matching, auto-responses, and conversation threading
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { formatPhoneE164 } from '../utils/phone';
import { TwilioService } from './twilioService';
import { processWaitlistSMSReply } from './waitlistNotificationService';
import crypto from 'crypto';
import {
  buildSMSConsentRequestText,
  buildSMSHelpText,
  buildSMSOptInConfirmationText,
  buildSMSOptOutConfirmationText,
  getSMSPracticeBranding,
} from './smsConsentText';
import {
  clearSMSOptOut,
  createPendingSMSConsentRequest,
  getSMSConsentState,
  recordSMSConsent,
  revokeSMSConsent,
  upsertSMSOptOut,
} from './smsConsentState';

export interface IncomingSMSParams {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia?: number;
  mediaUrls?: string[];
  tenantId: string;
}

export interface ProcessSMSResult {
  success: boolean;
  messageId: string;
  autoResponseSent?: boolean;
  autoResponseText?: string;
  actionPerformed?: string;
  error?: string;
}

export interface ProcessIncomingSMSOptions {
  suppressAutoResponses?: boolean;
}

export type SMSRoutingCategory =
  | 'general'
  | 'appointment'
  | 'billing'
  | 'prescription'
  | 'medical'
  | 'other';

type ThreadStatus = 'open' | 'in-progress' | 'waiting-patient' | 'waiting-provider' | 'closed';
type QueryableClient = { query: (sql: string, params?: any[]) => Promise<any> };

const ROUTING_KEYWORDS: Array<{
  category: Exclude<SMSRoutingCategory, 'general'>;
  patterns: RegExp[];
}> = [
  {
    category: 'billing',
    patterns: [
      /\bbill(?:ing)?\b/i,
      /\bbalance\b/i,
      /\bcharge\b/i,
      /\bpayment\b/i,
      /\bcopay\b/i,
      /\binvoice\b/i,
      /\brefund\b/i,
      /\boutstanding\b/i,
    ],
  },
  {
    category: 'appointment',
    patterns: [
      /\bschedul(?:e|ing)\b/i,
      /\bappointment\b/i,
      /\breschedule\b/i,
      /\bbook\b/i,
      /\bcancel\b/i,
      /\bcheck[\s-]?in\b/i,
      /\bvisit\b/i,
    ],
  },
  {
    category: 'prescription',
    patterns: [
      /\brx\b/i,
      /\bprescription\b/i,
      /\brefill\b/i,
      /\bpharmacy\b/i,
      /\bmed(?:ication|s)?\b/i,
    ],
  },
  {
    category: 'medical',
    patterns: [
      /\bresult(?:s)?\b/i,
      /\blab(?:s)?\b/i,
      /\bpath(?:ology)?\b/i,
      /\bbiopsy\b/i,
      /\bdoctor\b/i,
      /\bprovider\b/i,
      /\bnurse\b/i,
      /\bmedical\b/i,
      /\btest\b/i,
    ],
  },
  {
    category: 'other',
    patterns: [/\bother\b/i, /\bgeneral\b/i],
  },
];

export function inferSMSRoutingCategory(
  messageBody: string
): Exclude<SMSRoutingCategory, 'general'> | null {
  const normalized = String(messageBody || '').trim();
  if (!normalized) return null;

  const directMatch = normalized.toUpperCase();
  if (directMatch === 'SCHEDULING' || directMatch === 'SCHEDULE') {
    return 'appointment';
  }

  for (const route of ROUTING_KEYWORDS) {
    if (route.patterns.some((pattern) => pattern.test(normalized))) {
      return route.category;
    }
  }

  return null;
}

function getRoutingLabel(category: Exclude<SMSRoutingCategory, 'general'>): string {
  switch (category) {
    case 'appointment':
      return 'Scheduling';
    case 'billing':
      return 'Billing';
    case 'prescription':
      return 'Prescription';
    case 'medical':
      return 'Medical';
    case 'other':
      return 'General Support';
    default:
      return 'Support';
  }
}

export function buildSMSRoutingPrompt(): string {
  return "Thanks for texting. What can we help with? Reply BILLING, SCHEDULING, PRESCRIPTION, MEDICAL, or OTHER and we'll route your message to the right team.";
}

export function buildSMSRoutingAcknowledgement(
  category: Exclude<SMSRoutingCategory, 'general'>
): string {
  return `Thanks. We've routed your message to our ${getRoutingLabel(category)} team. Someone will text you back soon.`;
}

function normalizeKeyword(messageBody: string): string {
  return extractKeyword(messageBody).toUpperCase();
}

function isHelpKeyword(keyword: string): boolean {
  return keyword === 'HELP' || keyword === 'INFO';
}

function isOptInKeyword(keyword: string): boolean {
  return ['START', 'UNSTOP', 'SUBSCRIBE', 'YES', 'Y'].includes(keyword);
}

function isOptOutKeyword(keyword: string): boolean {
  return ['STOP', 'STOPALL', 'END', 'QUIT', 'CANCEL', 'UNSUBSCRIBE', 'NO', 'N'].includes(keyword);
}

/**
 * Process an incoming SMS message
 */
export async function processIncomingSMS(
  params: IncomingSMSParams,
  twilioService: TwilioService,
  options: ProcessIncomingSMSOptions = {}
): Promise<ProcessSMSResult> {
  const client = await pool.connect();
  const allowAutoResponses = options.suppressAutoResponses !== true;

  try {
    await client.query('BEGIN');

    // Format phone numbers
    const fromPhone = formatPhoneE164(params.from);
    const toPhone = formatPhoneE164(params.to);

    if (!fromPhone || !toPhone) {
      throw new Error('Invalid phone numbers');
    }

    logger.info('Processing incoming SMS', {
      from: fromPhone,
      to: toPhone,
      bodyLength: params.body.length,
      tenantId: params.tenantId,
    });

    // 1. Find patient by phone number
    const patient = await findPatientByPhone(params.tenantId, fromPhone, client);

    if (!patient) {
      logger.warn('Incoming SMS from unknown number', {
        from: fromPhone,
        tenantId: params.tenantId,
      });
      // Still log the message but mark as unmatched
    }

    const keyword = normalizeKeyword(params.body);

    // 2. System keyword + consent workflow
    if (patient) {
      const waitlistReply = await processWaitlistSMSReply(
        params.tenantId,
        fromPhone,
        params.body
      );

      if (waitlistReply.matched) {
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'waitlist_confirmation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        let waitlistConfirmationSent = false;
        let confirmationMessage = '';
        if (waitlistReply.action === 'accepted') {
          confirmationMessage = `Thank you for confirming! We'll contact you shortly to finalize your appointment. If you have questions, please call our office.`;
        } else if (waitlistReply.action === 'declined') {
          confirmationMessage = `Thanks for letting us know. We'll keep you on the waitlist and notify you of other available appointments.`;
        }

        if (allowAutoResponses && confirmationMessage) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: confirmationMessage,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: confirmationMessage,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                inResponseTo: messageId,
              },
              client
            );
            waitlistConfirmationSent = true;
          } catch (error: any) {
            logger.error('Failed to send waitlist confirmation message', {
              error: error.message,
              patientId: patient.id,
            });
          }
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          autoResponseSent: waitlistConfirmationSent,
          actionPerformed: `waitlist_${waitlistReply.action}`,
        };
      }

      const consentState = await getSMSConsentState(params.tenantId, patient.id, client);
      const branding = await getSMSPracticeBranding(params.tenantId, client);

      if (isHelpKeyword(keyword)) {
        const helpText = buildSMSHelpText(branding);
        let helpSent = false;
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        if (allowAutoResponses) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: helpText,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: helpText,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                inResponseTo: messageId,
              },
              client
            );
            helpSent = true;
          } catch (error: any) {
            logger.error('Failed to send SMS help response', {
              error: error.message,
              patientId: patient.id,
            });
          }
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          autoResponseSent: helpSent,
          autoResponseText: helpText,
          actionPerformed: 'help_sent',
        };
      }

      if (consentState.optedOut) {
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        if (isOptInKeyword(keyword)) {
          await recordSMSConsent(
            params.tenantId,
            patient.id,
            {
              consentMethod: 'electronic',
              obtainedByUserId: null,
              obtainedByName: 'Patient reply',
              notes: 'Patient opted back in via SMS keyword reply.',
            },
            client
          );
          await clearSMSOptOut(params.tenantId, fromPhone, client);

          const confirmationText = buildSMSOptInConfirmationText(branding);
          let optInConfirmationSent = false;
          if (allowAutoResponses) {
            try {
              const response = await twilioService.sendSMS({
                to: fromPhone,
                from: toPhone,
                body: confirmationText,
              });

              await logSMSMessage(
                {
                  tenantId: params.tenantId,
                  twilioSid: response.sid,
                  direction: 'outbound',
                  from: toPhone,
                  to: fromPhone,
                  body: confirmationText,
                  status: response.status,
                  messageType: 'auto_response',
                  patientId: patient.id,
                  inResponseTo: messageId,
                },
                client
              );
              optInConfirmationSent = true;
            } catch (error: any) {
              logger.error('Failed to send SMS opt-in confirmation', {
                error: error.message,
                patientId: patient.id,
              });
            }
          }

          await client.query('COMMIT');
          return {
            success: true,
            messageId,
            autoResponseSent: optInConfirmationSent,
            autoResponseText: confirmationText,
            actionPerformed: 'opted_in',
          };
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          actionPerformed: 'opted_out_ignored',
        };
      }

      if (isOptOutKeyword(keyword)) {
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        await revokeSMSConsent(
          params.tenantId,
          patient.id,
          {
            reason: 'Patient opted out via SMS keyword reply',
            notes: 'Opt-out captured from inbound SMS keyword.',
            optedOutVia: 'sms',
          },
          client
        );
        await upsertSMSOptOut(params.tenantId, fromPhone, 'Patient opted out via SMS keyword reply', client);

        const optOutText = buildSMSOptOutConfirmationText(branding);
        let optOutConfirmationSent = false;
        if (allowAutoResponses) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: optOutText,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: optOutText,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                inResponseTo: messageId,
              },
              client
            );
            optOutConfirmationSent = true;
          } catch (error: any) {
            logger.error('Failed to send SMS opt-out confirmation', {
              error: error.message,
              patientId: patient.id,
            });
          }
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          autoResponseSent: optOutConfirmationSent,
          autoResponseText: optOutText,
          actionPerformed: 'opted_out',
        };
      }

      if (consentState.pendingRequest) {
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        if (isOptInKeyword(keyword)) {
          await recordSMSConsent(
            params.tenantId,
            patient.id,
            {
              consentMethod: 'electronic',
              obtainedByUserId: null,
              obtainedByName: 'Patient reply',
              notes: 'Patient replied YES/START to pending SMS opt-in request.',
            },
            client
          );
          await clearSMSOptOut(params.tenantId, fromPhone, client);

          const confirmationText = buildSMSOptInConfirmationText(branding);
          let optInConfirmationSent = false;
          if (allowAutoResponses) {
            try {
              const response = await twilioService.sendSMS({
                to: fromPhone,
                from: toPhone,
                body: confirmationText,
              });

              await logSMSMessage(
                {
                  tenantId: params.tenantId,
                  twilioSid: response.sid,
                  direction: 'outbound',
                  from: toPhone,
                  to: fromPhone,
                  body: confirmationText,
                  status: response.status,
                  messageType: 'auto_response',
                  patientId: patient.id,
                  inResponseTo: messageId,
                },
                client
              );
              optInConfirmationSent = true;
            } catch (error: any) {
              logger.error('Failed to send pending SMS opt-in confirmation', {
                error: error.message,
                patientId: patient.id,
              });
            }
          }

          await client.query('COMMIT');
          return {
            success: true,
            messageId,
            autoResponseSent: optInConfirmationSent,
            autoResponseText: confirmationText,
            actionPerformed: 'consent_obtained',
          };
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          actionPerformed: 'consent_pending',
        };
      }

      if (!consentState.hasConsent) {
        if (isOptInKeyword(keyword)) {
          const messageId = await logSMSMessage(
            {
              tenantId: params.tenantId,
              twilioSid: params.messageSid,
              direction: 'inbound',
              from: fromPhone,
              to: toPhone,
              body: params.body,
              status: 'received',
              messageType: 'conversation',
              patientId: patient.id,
              mediaUrls: params.mediaUrls,
            },
            client
          );

          await recordSMSConsent(
            params.tenantId,
            patient.id,
            {
              consentMethod: 'electronic',
              obtainedByUserId: null,
              obtainedByName: 'Patient reply',
              notes: 'Patient opted in via START/YES without a pending request.',
            },
            client
          );

          const confirmationText = buildSMSOptInConfirmationText(branding);
          let optInConfirmationSent = false;
          if (allowAutoResponses) {
            try {
              const response = await twilioService.sendSMS({
                to: fromPhone,
                from: toPhone,
                body: confirmationText,
              });

              await logSMSMessage(
                {
                  tenantId: params.tenantId,
                  twilioSid: response.sid,
                  direction: 'outbound',
                  from: toPhone,
                  to: fromPhone,
                  body: confirmationText,
                  status: response.status,
                  messageType: 'auto_response',
                  patientId: patient.id,
                  inResponseTo: messageId,
                },
                client
              );
              optInConfirmationSent = true;
            } catch (error: any) {
              logger.error('Failed to send standalone SMS opt-in confirmation', {
                error: error.message,
                patientId: patient.id,
              });
            }
          }

          await client.query('COMMIT');
          return {
            success: true,
            messageId,
            autoResponseSent: optInConfirmationSent,
            autoResponseText: confirmationText,
            actionPerformed: 'consent_obtained',
          };
        }

        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        await createPendingSMSConsentRequest(
          params.tenantId,
          patient.id,
          client,
          {
            obtainedByName: 'Patient texted office',
            notes: 'Pending SMS opt-in request created from inbound message.',
          }
        );

        const consentRequestText = buildSMSConsentRequestText(branding);

        let consentRequestSent = false;
        if (allowAutoResponses) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: consentRequestText,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: consentRequestText,
                status: response.status,
                messageType: 'consent_request',
                patientId: patient.id,
                inResponseTo: messageId,
              },
              client
            );
            consentRequestSent = true;
          } catch (error: any) {
            logger.error('Failed to send SMS consent request', {
              error: error.message,
              patientId: patient.id,
            });
          }
        }

        await client.query('COMMIT');
        return {
          success: true,
          messageId,
          autoResponseSent: consentRequestSent,
          autoResponseText: consentRequestText,
          actionPerformed: 'consent_requested',
        };
      }

    }

    // 4. Check if patient has opted out
    if (patient) {
      const optedOut = await isPatientOptedOut(params.tenantId, patient.id, client);
      if (optedOut) {
        logger.info('SMS from opted-out patient', {
          patientId: patient.id,
          from: fromPhone,
        });
        // Don't process further, but log the message
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        await client.query('COMMIT');
        return { success: true, messageId };
      }
    }

    // 5. Check for keyword auto-responses
    const autoResponse = await findAutoResponse(params.tenantId, keyword, client);

    let autoResponseSent = false;
    let actionPerformed: string | undefined;

    if (autoResponse) {
      logger.info('Keyword matched', {
        keyword: keyword,
        action: autoResponse.action,
        patientId: patient?.id,
      });

      // Execute action based on keyword
      if (patient) {
        actionPerformed = await executeAutoResponseAction(
          params.tenantId,
          autoResponse.action,
          patient.id,
          fromPhone,
          client
        );
      }

      // Log incoming message
      const messageId = await logSMSMessage(
        {
          tenantId: params.tenantId,
          twilioSid: params.messageSid,
          direction: 'inbound',
          from: fromPhone,
          to: toPhone,
          body: params.body,
          status: 'received',
          messageType: 'conversation',
          patientId: patient?.id,
          keywordMatched: keyword,
          mediaUrls: params.mediaUrls,
        },
        client
      );

      // Send auto-reply
      if (allowAutoResponses) {
        try {
          const response = await twilioService.sendSMS({
            to: fromPhone,
            from: toPhone,
            body: autoResponse.response_text,
          });

          // Log outgoing auto-response
          await logSMSMessage(
            {
              tenantId: params.tenantId,
              twilioSid: response.sid,
              direction: 'outbound',
              from: toPhone,
              to: fromPhone,
              body: autoResponse.response_text,
              status: response.status,
              messageType: 'auto_response',
              patientId: patient?.id,
              inResponseTo: messageId,
            },
            client
          );

          autoResponseSent = true;

          logger.info('Auto-response sent', {
            keyword: keyword,
            action: autoResponse.action,
            patientId: patient?.id,
          });
        } catch (error: any) {
          logger.error('Failed to send auto-response', {
            error: error.message,
            keyword: keyword,
          });
          // Continue even if auto-response fails
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        messageId,
        autoResponseSent,
        autoResponseText: autoResponse.response_text,
        actionPerformed,
      };
    }

    // 6. No keyword match - create or update message thread
    if (patient) {
      const thread = await findOrCreateMessageThread(
        params.tenantId,
        patient.id,
        params.body,
        client
      );
      const routedCategory = inferSMSRoutingCategory(params.body);

      const messageId = await logSMSMessage(
        {
          tenantId: params.tenantId,
          twilioSid: params.messageSid,
          direction: 'inbound',
          from: fromPhone,
          to: toPhone,
          body: params.body,
          status: 'received',
          messageType: 'conversation',
          patientId: patient.id,
          relatedThreadId: thread.id,
          mediaUrls: params.mediaUrls,
        },
        client
      );

      await addMessageToThread(
        {
          threadId: thread.id,
          senderType: 'patient',
          senderPatientId: patient.id,
          senderName: `${patient.first_name} ${patient.last_name}`,
          messageText: params.body,
          deliveredToPatient: true,
        },
        client
      );

      await markThreadUnreadByStaff(thread.id, client);

      if (routedCategory) {
        await updateMessageThreadRoute(thread.id, routedCategory, 'open', client);

        let autoResponseText: string | undefined;
        let autoResponseSent = false;

        autoResponseText = buildSMSRoutingAcknowledgement(routedCategory);
        if (allowAutoResponses) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: autoResponseText,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: autoResponseText,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                relatedThreadId: thread.id,
                inResponseTo: messageId,
              },
              client
            );

            await addMessageToThread(
              {
                threadId: thread.id,
                senderType: 'staff',
                senderName: 'Text Routing Assistant',
                messageText: autoResponseText,
                deliveredToPatient: true,
              },
              client
            );
            await updateMessageThreadRoute(thread.id, routedCategory, 'waiting-provider', client);
            autoResponseSent = true;
          } catch (error: any) {
            logger.error('Failed to send SMS routing acknowledgement', {
              error: error.message,
              patientId: patient.id,
              threadId: thread.id,
              category: routedCategory,
            });
          }
        }

        await notifyStaffOfIncomingSMS(params.tenantId, thread.id, patient.id, client);
        await client.query('COMMIT');

        return {
          success: true,
          messageId,
          autoResponseSent,
          autoResponseText,
          actionPerformed: `routed_${routedCategory}`,
        };
      }

      if ((thread.category || 'general') === 'general') {
        let autoResponseText: string | undefined;
        let autoResponseSent = false;

        autoResponseText = buildSMSRoutingPrompt();
        if (allowAutoResponses) {
          try {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: autoResponseText,
            });

            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: autoResponseText,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                relatedThreadId: thread.id,
                inResponseTo: messageId,
              },
              client
            );

            await addMessageToThread(
              {
                threadId: thread.id,
                senderType: 'staff',
                senderName: 'Text Routing Assistant',
                messageText: autoResponseText,
                deliveredToPatient: true,
              },
              client
            );
            autoResponseSent = true;
          } catch (error: any) {
            logger.error('Failed to send SMS routing prompt', {
              error: error.message,
              patientId: patient.id,
              threadId: thread.id,
            });
          }
        }

        await updateMessageThreadRoute(thread.id, 'general', 'waiting-patient', client);
        await notifyStaffOfIncomingSMS(params.tenantId, thread.id, patient.id, client);
        await client.query('COMMIT');

        return {
          success: true,
          messageId,
          autoResponseSent,
          autoResponseText,
          actionPerformed: 'triage_requested',
        };
      }

      await notifyStaffOfIncomingSMS(params.tenantId, thread.id, patient.id, client);

      await client.query('COMMIT');

      logger.info('SMS added to message thread', {
        threadId: thread.id,
        patientId: patient.id,
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    }

    // 7. Unknown patient - log message but no action
    const messageId = await logSMSMessage(
      {
        tenantId: params.tenantId,
        twilioSid: params.messageSid,
        direction: 'inbound',
        from: fromPhone,
        to: toPhone,
        body: params.body,
        status: 'received',
        messageType: 'conversation',
        mediaUrls: params.mediaUrls,
      },
      client
    );

    await client.query('COMMIT');

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error processing incoming SMS', {
      error: error.message,
      from: params.from,
      tenantId: params.tenantId,
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Find patient by phone number
 */
async function findPatientByPhone(tenantId: string, phoneNumber: string, client: any): Promise<any> {
  const digitsOnly = String(phoneNumber || '').replace(/\D/g, '');
  const tenDigit = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;

  const result = await client.query(
    `SELECT id, first_name, last_name, email, phone, created_at
     FROM patients
     WHERE tenant_id = $1
       AND phone IS NOT NULL
       AND (
         regexp_replace(phone, '\\D', '', 'g') = $2
         OR regexp_replace(phone, '\\D', '', 'g') = $3
         OR right(regexp_replace(phone, '\\D', '', 'g'), 10) = $3
       )`,
    [tenantId, digitsOnly, tenDigit]
  );

  const candidates = result.rows || [];
  if (candidates.length <= 1) {
    return candidates[0] || null;
  }

  const rankedCandidates = await Promise.all(
    candidates.map(async (candidate: any) => {
      const [consentState, threadResult] = await Promise.all([
        getSMSConsentState(tenantId, candidate.id, client),
        client.query(
          `SELECT 1
           FROM patient_message_threads
           WHERE tenant_id = $1 AND patient_id = $2
           LIMIT 1`,
          [tenantId, candidate.id]
        ),
      ]);

      const normalizedPhone = String(candidate.phone || '').replace(/\D/g, '');
      const phoneRank =
        normalizedPhone === digitsOnly ? 0 : normalizedPhone === tenDigit ? 1 : 2;
      const consentRank = consentState.hasConsent ? 0 : consentState.pendingRequest ? 1 : 2;
      const threadRank = threadResult.rows.length > 0 ? 0 : 1;
      const createdAt = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;

      return {
        candidate,
        consentRank,
        threadRank,
        phoneRank,
        createdAt,
      };
    })
  );

  rankedCandidates.sort((a, b) => {
    if (a.consentRank !== b.consentRank) return a.consentRank - b.consentRank;
    if (a.threadRank !== b.threadRank) return a.threadRank - b.threadRank;
    if (a.phoneRank !== b.phoneRank) return a.phoneRank - b.phoneRank;
    return b.createdAt - a.createdAt;
  });

  return rankedCandidates[0]?.candidate || null;
}

/**
 * Check if patient has opted out of SMS
 */
async function isPatientOptedOut(tenantId: string, patientId: string, client: any): Promise<boolean> {
  const result = await client.query(
    `SELECT opted_in FROM patient_sms_preferences
     WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, patientId]
  );

  if (result.rows.length === 0) {
    return false; // No preference record means opted in by default
  }

  return !result.rows[0].opted_in;
}

let smsAutoResponsesTableExists: boolean | null = null;

async function hasSMSAutoResponsesTable(client: QueryableClient): Promise<boolean> {
  if (smsAutoResponsesTableExists !== null) {
    return smsAutoResponsesTableExists;
  }

  const result = await client.query(
    `SELECT to_regclass('sms_auto_responses') IS NOT NULL as exists`
  );
  smsAutoResponsesTableExists = result.rows[0]?.exists === true;

  if (!smsAutoResponsesTableExists) {
    logger.warn('SMS auto-response table missing; continuing without keyword replies');
  }

  return smsAutoResponsesTableExists;
}

/**
 * Extract keyword from message body
 * Returns first word in uppercase
 */
function extractKeyword(messageBody: string): string {
  const trimmed = messageBody.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord ? firstWord.toUpperCase() : '';
}

/**
 * Find auto-response by keyword
 */
async function findAutoResponse(tenantId: string, keyword: string, client: any): Promise<any> {
  if (!(await hasSMSAutoResponsesTable(client))) {
    return null;
  }

  try {
    const result = await client.query(
      `SELECT * FROM sms_auto_responses
       WHERE tenant_id = $1 AND keyword = $2 AND is_active = true
       ORDER BY priority DESC
       LIMIT 1`,
      [tenantId, keyword]
    );

    return result.rows[0] || null;
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('SMS auto-response table missing; continuing without keyword reply', {
        tenantId,
      });
      return null;
    }

    throw error;
  }
}

/**
 * Execute action based on auto-response keyword
 */
async function executeAutoResponseAction(
  tenantId: string,
  action: string,
  patientId: string,
  phoneNumber: string,
  client: any
): Promise<string> {
  switch (action) {
    case 'opt_out':
      await client.query(
        `INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in, opted_out_at, opted_out_via)
         VALUES ($1, $2, false, CURRENT_TIMESTAMP, 'sms')
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET opted_in = false, opted_out_at = CURRENT_TIMESTAMP, opted_out_via = 'sms', updated_at = CURRENT_TIMESTAMP`,
        [tenantId, patientId]
      );
      logger.info('Patient opted out via SMS', { patientId });
      return 'opted_out';

    case 'opt_in':
      await client.query(
        `INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET opted_in = true, opted_out_at = NULL, updated_at = CURRENT_TIMESTAMP`,
        [tenantId, patientId]
      );
      logger.info('Patient opted in via SMS', { patientId });
      return 'opted_in';

    case 'confirm_appointment':
      // Find most recent upcoming appointment
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'confirmed', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment confirmed via SMS', { patientId });
      return 'appointment_confirmed';

    case 'cancel_appointment':
      // Mark appointment as patient-requested cancellation
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'cancelled', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment cancellation requested via SMS', { patientId });
      return 'appointment_cancel_requested';

    case 'request_reschedule':
      // Mark appointment as reschedule requested
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'reschedule_requested', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment reschedule requested via SMS', { patientId });
      return 'appointment_reschedule_requested';

    case 'help':
      return 'help_sent';

    default:
      return 'no_action';
  }
}

/**
 * Find or create message thread for patient
 */
export async function findOrCreateMessageThread(
  tenantId: string,
  patientId: string,
  messagePreview: string,
  client: QueryableClient
): Promise<any> {
  // Look for open thread
  const existingThread = await client.query(
    `SELECT id, category, status FROM patient_message_threads
     WHERE tenant_id = $1 AND patient_id = $2 AND status != 'closed'
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (existingThread.rows.length > 0) {
    return existingThread.rows[0];
  }

  // Create new thread
  const threadId = crypto.randomUUID();
  const subject = messagePreview.substring(0, 100); // Use first 100 chars as subject

  await client.query(
    `INSERT INTO patient_message_threads
     (id, tenant_id, patient_id, subject, category, status, created_by_patient, last_message_by, last_message_at)
     VALUES ($1, $2, $3, $4, 'general', 'open', true, 'patient', CURRENT_TIMESTAMP)`,
    [threadId, tenantId, patientId, subject]
  );

  return { id: threadId, category: 'general', status: 'open' };
}

/**
 * Add message to thread
 */
export async function addMessageToThread(
  params: {
    threadId: string;
    senderType: 'patient' | 'staff';
    senderPatientId?: string;
    senderUserId?: string;
    senderName: string;
    messageText: string;
    deliveredToPatient?: boolean;
    isInternalNote?: boolean;
  },
  client: QueryableClient
): Promise<string> {
  const messageId = crypto.randomUUID();

  await client.query(
    `INSERT INTO patient_messages
     (id, thread_id, sender_type, sender_patient_id, sender_user_id, sender_name, message_text, is_internal_note, delivered_to_patient)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      messageId,
      params.threadId,
      params.senderType,
      params.senderPatientId || null,
      params.senderUserId || null,
      params.senderName,
      params.messageText,
      params.isInternalNote || false,
      params.deliveredToPatient ?? !params.isInternalNote,
    ]
  );

  await client.query(
    `UPDATE patient_message_threads
     SET last_message_at = CURRENT_TIMESTAMP, last_message_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [params.senderType, params.threadId]
  );

  return messageId;
}

/**
 * Mark thread as unread by staff
 */
export async function markThreadUnreadByStaff(threadId: string, client: QueryableClient): Promise<void> {
  await client.query(
    `UPDATE patient_message_threads
     SET is_read_by_staff = false,
         read_by_staff_at = NULL,
         read_by_staff_user = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [threadId]
  );
}

export async function markThreadUnreadByPatient(threadId: string, client: QueryableClient): Promise<void> {
  await client.query(
    `UPDATE patient_message_threads
     SET is_read_by_patient = false,
         read_by_patient_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [threadId]
  );
}

export async function markThreadReadByStaff(
  threadId: string,
  userId: string,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `UPDATE patient_message_threads
     SET is_read_by_staff = true,
         read_by_staff_at = CURRENT_TIMESTAMP,
         read_by_staff_user = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [threadId, userId]
  );
}

export async function updateMessageThreadRoute(
  threadId: string,
  category: SMSRoutingCategory,
  status: ThreadStatus,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `UPDATE patient_message_threads
     SET category = $2,
         status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [threadId, category, status]
  );
}

/**
 * Notify staff of incoming SMS
 */
async function notifyStaffOfIncomingSMS(
  tenantId: string,
  threadId: string,
  patientId: string,
  client: any
): Promise<void> {
  // In production, this would trigger email/push notifications to staff
  // For now, just log it
  logger.info('Staff notification triggered', {
    tenantId,
    threadId,
    patientId,
    type: 'incoming_sms',
  });
}

/**
 * Log SMS message to database
 */
let smsMessageSchemaMode: 'extended' | 'legacy' | null = null;

async function resolveSMSMessageSchemaMode(client: any): Promise<'extended' | 'legacy'> {
  if (smsMessageSchemaMode) {
    return smsMessageSchemaMode;
  }

  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'sms_messages'
       AND table_schema = ANY (current_schemas(false))`
  );

  const columns = new Set(
    (result.rows || []).map((row: { column_name?: string }) => String(row.column_name || ''))
  );

  smsMessageSchemaMode =
    columns.has('related_appointment_id') &&
    columns.has('related_thread_id') &&
    columns.has('in_response_to') &&
    columns.has('media_urls')
      ? 'extended'
      : 'legacy';

  return smsMessageSchemaMode;
}

async function logSMSMessage(
  params: {
    tenantId: string;
    twilioSid?: string;
    direction: string;
    from: string;
    to: string;
    body: string;
    status: string;
    messageType: string;
    patientId?: string;
    relatedAppointmentId?: string;
    relatedThreadId?: string;
    inResponseTo?: string;
    keywordMatched?: string;
    mediaUrls?: string[];
  },
  client: any
): Promise<string> {
  const messageId = crypto.randomUUID();
  const schemaMode = await resolveSMSMessageSchemaMode(client);

  if (schemaMode === 'extended') {
    await client.query(
      `INSERT INTO sms_messages
       (id, tenant_id, twilio_message_sid, direction, from_number, to_number, patient_id,
        message_body, status, message_type, related_appointment_id, related_thread_id,
        in_response_to, keyword_matched, media_urls, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
      [
        messageId,
        params.tenantId,
        params.twilioSid || null,
        params.direction,
        params.from,
        params.to,
        params.patientId || null,
        params.body,
        params.status,
        params.messageType,
        params.relatedAppointmentId || null,
        params.relatedThreadId || null,
        params.inResponseTo || null,
        params.keywordMatched || null,
        params.mediaUrls ? JSON.stringify(params.mediaUrls) : null,
      ]
    );

    return messageId;
  }

  await client.query(
    `INSERT INTO sms_messages
     (id, tenant_id, twilio_message_sid, direction, from_number, to_number, patient_id,
      content, message_body, status, message_type, keyword_matched, sent_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      messageId,
      params.tenantId,
      params.twilioSid || null,
      params.direction,
      params.from,
      params.to,
      params.patientId || null,
      params.body,
      params.body,
      params.status,
      params.messageType,
      params.keywordMatched || null,
    ]
  );

  return messageId;
}

/**
 * Update SMS message status (called from webhook)
 */
export async function updateSMSStatus(
  twilioSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const updateFields: string[] = ['status = $1'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (status === 'delivered') {
      updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
    } else if (status === 'failed' || status === 'undelivered') {
      updateFields.push(`failed_at = CURRENT_TIMESTAMP`);
    }

    // Some deployed schemas do not include sms_messages.error_code. Persist any code/details
    // in error_message so webhook updates remain compatible across schema variants.
    const combinedErrorMessage = [
      errorCode ? `Twilio error ${errorCode}` : null,
      errorMessage?.trim() || null,
    ]
      .filter(Boolean)
      .join(': ');

    if (combinedErrorMessage) {
      updateFields.push(`error_message = $${paramIndex}`);
      params.push(combinedErrorMessage);
      paramIndex++;
    }

    params.push(twilioSid);

    await pool.query(
      `UPDATE sms_messages
       SET ${updateFields.join(', ')}
       WHERE twilio_message_sid = $${paramIndex}`,
      params
    );

    logger.info('SMS status updated', {
      twilioSid,
      status,
      errorCode,
    });
  } catch (error: any) {
    logger.error('Failed to update SMS status', {
      error: error.message,
      twilioSid,
      status,
    });
    throw error;
  }
}
