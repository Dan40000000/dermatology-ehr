/**
 * Message Notification Service
 *
 * Handles email and notification delivery for patient-provider messaging system.
 *
 * HIPAA Compliance Notes:
 * - NO PHI is included in email notifications
 * - Emails only contain generic alerts: "You have a new message"
 * - Patients must log in to portal to view actual message content
 * - All notification events are logged to audit trail
 */

import { pool } from "../db/pool";
import { createAuditLog } from "./audit";
import { logger } from "../lib/logger";
import { config } from "../config";
import { getEmailService } from "../lib/container";

type EmailDeliveryStatus = "sent" | "disabled" | "blocked_phi" | "failed";

type EmailDeliveryResult = {
  status: EmailDeliveryStatus;
  error?: string;
};

function notificationAuditAction(prefix: string, status: EmailDeliveryStatus): string {
  switch (status) {
    case "sent":
      return `${prefix}_sent`;
    case "disabled":
      return `${prefix}_skipped`;
    case "blocked_phi":
      return `${prefix}_blocked`;
    case "failed":
      return `${prefix}_failed`;
  }
}

async function auditNotificationDelivery(params: {
  tenantId: string;
  actionPrefix: "patient_message_notification" | "staff_message_notification" | "staff_digest_email";
  resourceId: string;
  resourceType?: "patient_message_thread" | "user";
  delivery: EmailDeliveryResult;
  recipientType: "patient" | "staff";
  recipientUserId?: string;
}): Promise<void> {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: "system",
    action: notificationAuditAction(params.actionPrefix, params.delivery.status),
    resourceType: params.resourceType || "patient_message_thread",
    resourceId: params.resourceId,
    severity: params.delivery.status === "failed" ? "warning" : "info",
    status: params.delivery.status === "sent" ? "success" : params.delivery.status === "failed" ? "failure" : "partial",
    metadata: {
      emailDeliveryStatus: params.delivery.status,
      recipientType: params.recipientType,
      recipientUserId: params.recipientUserId,
      error: params.delivery.error,
    },
  });
}

/**
 * Send email notification to patient when staff sends a message
 */
export async function notifyPatientOfNewMessage(
  tenantId: string,
  patientId: string,
  threadId: string,
  _threadSubject: string
): Promise<void> {
  try {
    // Get patient email and notification preferences
    const result = await pool.query(
      `SELECT
        p.email,
        COALESCE(pref.email_notifications_enabled, true) as email_enabled,
        COALESCE(pref.notification_email, p.email) as notification_email
      FROM patients p
      LEFT JOIN patient_message_preferences pref ON p.id = pref.patient_id
      WHERE p.id = $1 AND p.tenant_id = $2`,
      [patientId, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Patient not found for message notification', { patientId, tenantId });
      return;
    }

    const patient = result.rows[0];

    if (!patient.email_enabled) {
      logger.info('Patient email notifications disabled', { patientId, tenantId });
      return;
    }

    const recipientEmail = patient.notification_email || patient.email;
    if (!recipientEmail) {
      logger.warn('No email address for patient notification', { patientId, tenantId });
      return;
    }

    // HIPAA COMPLIANT: Generic message, no PHI
    const emailSubject = "You have a new message from your healthcare provider";
    const emailBody = `
Hello,

You have received a new message from your healthcare provider.

To view this message, please log in to your patient portal:
${getPortalUrl(tenantId)}

For security reasons, we do not include message content in email notifications.

If you did not expect this message, please contact our office.

Thank you,
Your Healthcare Team

---
This is an automated message. Please do not reply to this email.
To manage your notification preferences, log in to the patient portal.
    `.trim();

    logger.info('Patient message notification prepared', {
      tenantId,
      patientId,
      to: recipientEmail,
      subject: emailSubject,
    });

    const delivery = await maybeSendEmail({
      to: recipientEmail,
      subject: emailSubject,
      text: emailBody,
      html: emailBody.replace(/\n/g, "<br>"),
    });

    await auditNotificationDelivery({
      tenantId,
      actionPrefix: "patient_message_notification",
      resourceId: threadId,
      delivery,
      recipientType: "patient",
    });
  } catch (error) {
    logger.error('Error sending patient notification', { error: (error as Error).message });
    // Don't throw - notification failure shouldn't break message sending
  }
}

/**
 * Send email notification to staff when patient sends a message
 */
export async function notifyStaffOfNewPatientMessage(
  tenantId: string,
  threadId: string,
  patientId: string,
  _threadSubject: string,
  assignedUserId?: string
): Promise<void> {
  try {
    // Ensure patient exists within the same tenant before notifying staff.
    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      logger.warn('Patient not found for staff notification', { patientId, tenantId });
      return;
    }

    // Determine who to notify
    let notifyUsers: any[] = [];

    if (assignedUserId) {
      // Notify assigned user
      const assignedUser = await pool.query(
        `SELECT
          id,
          email,
          COALESCE(full_name, email) as name
        FROM users
        WHERE id = $1 AND tenant_id = $2`,
        [assignedUserId, tenantId]
      );
      if (assignedUser.rows.length > 0) {
        notifyUsers.push(assignedUser.rows[0]);
      }
    } else {
      // Notify all users with messaging permissions (or admin role)
      const allUsers = await pool.query(
        `SELECT
          id,
          email,
          COALESCE(full_name, email) as name
        FROM users
        WHERE tenant_id = $1 AND role IN ('admin', 'provider', 'nurse', 'medical_assistant')
        LIMIT 5`,
        [tenantId]
      );
      notifyUsers = allUsers.rows;
    }

    // Send notification to each user
    for (const user of notifyUsers) {
      if (!user.email) continue;

      // HIPAA COMPLIANT: no patient identifiers or message content in staff email.
      const emailSubject = "New Patient Message - Action Required";
      const emailBody = `
Hello ${user.name},

You have received a new message from a patient.

To view and respond to this message, please log in to your EHR:
${getStaffPortalUrl(tenantId)}

This message may require timely attention.

Thank you,
Dermatology EHR System

---
This is an automated message. Please do not reply to this email.
      `.trim();

      logger.info('Staff message notification prepared', {
        tenantId,
        userId: user.id,
        to: user.email,
        subject: emailSubject,
      });

      const delivery = await maybeSendEmail({
        to: user.email,
        subject: emailSubject,
        text: emailBody,
        html: emailBody.replace(/\n/g, "<br>"),
      });

      await auditNotificationDelivery({
        tenantId,
        actionPrefix: "staff_message_notification",
        resourceId: threadId,
        delivery,
        recipientType: "staff",
        recipientUserId: user.id,
      });
    }
  } catch (error) {
    logger.error('Error sending staff notification', { error: (error as Error).message });
    // Don't throw - notification failure shouldn't break message sending
  }
}

/**
 * Send batch digest email to staff with summary of unread messages
 * Can be called on a schedule (e.g., daily at 9am)
 */
export async function sendStaffDigestEmail(tenantId: string): Promise<void> {
  try {
    // Get unread counts grouped by assigned user.
    const result = await pool.query(
      `SELECT
        COALESCE(t.assigned_to, 'unassigned') as user_id,
        u.email,
        COALESCE(u.full_name, u.email) as name,
        COUNT(*) as unread_count
      FROM patient_message_threads t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.tenant_id = $1
        AND t.is_read_by_staff = false
        AND t.status != 'closed'
      GROUP BY COALESCE(t.assigned_to, 'unassigned'), u.email, u.full_name`,
      [tenantId]
    );

    for (const row of result.rows) {
      if (!row.email) continue;

      const emailSubject = `Patient Messages Digest - ${row.unread_count} Unread Messages`;
      const emailBody = `
Hello ${row.name},

You have ${row.unread_count} unread patient message(s) requiring attention.

Please log in to review and respond:
${getStaffPortalUrl(tenantId)}

Thank you,
Dermatology EHR System
      `.trim();

      logger.info('Staff digest email prepared', {
        tenantId,
        to: row.email,
        subject: emailSubject,
        totalMessages: row.unread_count,
      });

      const delivery = await maybeSendEmail({
        to: row.email,
        subject: emailSubject,
        text: emailBody,
        html: emailBody.replace(/\n/g, "<br>"),
      });

      await auditNotificationDelivery({
        tenantId,
        actionPrefix: "staff_digest_email",
        resourceType: "user",
        resourceId: row.user_id,
        delivery,
        recipientType: "staff",
        recipientUserId: row.user_id,
      });
    }
  } catch (error) {
    logger.error('Error sending staff digest', { error: (error as Error).message });
  }
}

/**
 * Helper functions
 */
function getPortalUrl(tenantId: string): string {
  const baseUrl = config.frontendUrl || "http://localhost:5173";
  return `${baseUrl}/portal/messages?tenantId=${tenantId}`;
}

function getStaffPortalUrl(tenantId: string): string {
  const baseUrl = config.frontendUrl || "http://localhost:5173";
  return `${baseUrl}/mail?tab=patient-messages&tenantId=${tenantId}`;
}

async function maybeSendEmail(params: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  containsPhi?: boolean;
}): Promise<EmailDeliveryResult> {
  if (!config.features.emailDelivery) {
    return { status: "disabled" };
  }

  if (config.email.notificationOnly && params.containsPhi) {
    logger.warn("Blocked email containing PHI because EMAIL_NOTIFICATION_ONLY is enabled");
    return { status: "blocked_phi" };
  }

  try {
    await getEmailService().sendEmail(params);
    return { status: "sent" };
  } catch (error) {
    const message = (error as Error).message;
    logger.error("Email delivery failed", { error: message });
    return { status: "failed", error: message };
  }
}

/**
 * Example integration with actual email service (SendGrid)
 * Uncomment and configure when ready for production
 */
/*
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

async function sendEmail(to: string, subject: string, body: string) {
  const msg = {
    to,
    from: EMAIL_CONFIG.from,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br>'),
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    logger.error('SendGrid error:', { error: (error as Error).message });
    throw error;
  }
}
*/

/**
 * Example integration with AWS SES
 */
/*
import AWS from 'aws-sdk';

const ses = new AWS.SES({
  region: process.env.AWS_REGION || 'us-east-1',
});

async function sendEmail(to: string, subject: string, body: string) {
  const params = {
    Source: EMAIL_CONFIG.from,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: body,
        },
      },
    },
  };

  try {
    await ses.sendEmail(params).promise();
    console.log(`Email sent to ${to}`);
  } catch (error) {
    logger.error('AWS SES error:', { error: (error as Error).message });
    throw error;
  }
}
*/
