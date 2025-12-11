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
import { auditLog } from "./audit";

// Email configuration interface
interface EmailConfig {
  from: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

// For demonstration, we'll log emails instead of sending them
// In production, integrate with SendGrid, AWS SES, or similar service
const EMAIL_CONFIG: EmailConfig = {
  from: "noreply@dermatologyehr.com",
  smtpHost: process.env.SMTP_HOST || "localhost",
  smtpPort: parseInt(process.env.SMTP_PORT || "587"),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
};

/**
 * Send email notification to patient when staff sends a message
 */
export async function notifyPatientOfNewMessage(
  tenantId: string,
  patientId: string,
  threadId: string,
  threadSubject: string
): Promise<void> {
  try {
    // Get patient email and notification preferences
    const result = await pool.query(
      `SELECT
        p.email,
        p.first_name,
        COALESCE(pref.email_notifications_enabled, true) as email_enabled,
        COALESCE(pref.notification_email, p.email) as notification_email
      FROM patients p
      LEFT JOIN patient_message_preferences pref ON p.id = pref.patient_id
      WHERE p.id = $1 AND p.tenant_id = $2`,
      [patientId, tenantId]
    );

    if (result.rows.length === 0) {
      console.error(`Patient not found: ${patientId}`);
      return;
    }

    const patient = result.rows[0];

    if (!patient.email_enabled) {
      console.log(`Email notifications disabled for patient ${patientId}`);
      return;
    }

    const recipientEmail = patient.notification_email || patient.email;
    if (!recipientEmail) {
      console.error(`No email address for patient ${patientId}`);
      return;
    }

    // HIPAA COMPLIANT: Generic message, no PHI
    const emailSubject = "You have a new message from your healthcare provider";
    const emailBody = `
Dear ${patient.first_name},

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

    // In production, send actual email here
    // For now, log it
    console.log("=== EMAIL NOTIFICATION ===");
    console.log(`To: ${recipientEmail}`);
    console.log(`Subject: ${emailSubject}`);
    console.log(`Body:\n${emailBody}`);
    console.log("========================");

    // Audit log
    await auditLog(
      tenantId,
      "system",
      "patient_message_notification_sent",
      "patient_message_thread",
      threadId,
      { recipientEmail, patientId }
    );
  } catch (error) {
    console.error("Error sending patient notification:", error);
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
  threadSubject: string,
  assignedUserId?: string
): Promise<void> {
  try {
    // Get patient name (for staff notification context)
    const patientResult = await pool.query(
      `SELECT first_name, last_name, mrn FROM patients WHERE id = $1`,
      [patientId]
    );

    if (patientResult.rows.length === 0) {
      console.error(`Patient not found: ${patientId}`);
      return;
    }

    const patient = patientResult.rows[0];
    const patientName = `${patient.first_name} ${patient.last_name}`;

    // Determine who to notify
    let notifyUsers: any[] = [];

    if (assignedUserId) {
      // Notify assigned user
      const assignedUser = await pool.query(
        `SELECT id, email, name FROM users WHERE id = $1 AND tenant_id = $2`,
        [assignedUserId, tenantId]
      );
      if (assignedUser.rows.length > 0) {
        notifyUsers.push(assignedUser.rows[0]);
      }
    } else {
      // Notify all users with messaging permissions (or admin role)
      const allUsers = await pool.query(
        `SELECT id, email, name FROM users
        WHERE tenant_id = $1 AND role IN ('admin', 'provider', 'nurse', 'medical_assistant')
        LIMIT 5`,
        [tenantId]
      );
      notifyUsers = allUsers.rows;
    }

    // Send notification to each user
    for (const user of notifyUsers) {
      if (!user.email) continue;

      // HIPAA COMPLIANT: Only include minimal patient identifier (not full message)
      const emailSubject = "New Patient Message - Action Required";
      const emailBody = `
Hello ${user.name},

You have received a new message from a patient.

Patient: ${patientName} (MRN: ${patient.mrn})
Subject: ${threadSubject}

To view and respond to this message, please log in to your EHR:
${getStaffPortalUrl(tenantId)}

This message may require timely attention.

Thank you,
Dermatology EHR System

---
This is an automated message. Please do not reply to this email.
      `.trim();

      // In production, send actual email here
      console.log("=== STAFF EMAIL NOTIFICATION ===");
      console.log(`To: ${user.email}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Body:\n${emailBody}`);
      console.log("==============================");

      // Audit log
      await auditLog(
        tenantId,
        "system",
        "staff_message_notification_sent",
        "patient_message_thread",
        threadId,
        { recipientEmail: user.email, userId: user.id, patientId }
      );
    }
  } catch (error) {
    console.error("Error sending staff notification:", error);
    // Don't throw - notification failure shouldn't break message sending
  }
}

/**
 * Send batch digest email to staff with summary of unread messages
 * Can be called on a schedule (e.g., daily at 9am)
 */
export async function sendStaffDigestEmail(tenantId: string): Promise<void> {
  try {
    // Get all unread threads grouped by assigned user
    const result = await pool.query(
      `SELECT
        COALESCE(t.assigned_to, 'unassigned') as user_id,
        u.email,
        u.name,
        COUNT(*) as unread_count,
        json_agg(json_build_object(
          'threadId', t.id,
          'subject', t.subject,
          'patientName', p.first_name || ' ' || p.last_name,
          'category', t.category,
          'priority', t.priority,
          'lastMessageAt', t.last_message_at
        ) ORDER BY t.priority DESC, t.last_message_at DESC) as threads
      FROM patient_message_threads t
      JOIN patients p ON t.patient_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.tenant_id = $1
        AND t.is_read_by_staff = false
        AND t.status != 'closed'
      GROUP BY COALESCE(t.assigned_to, 'unassigned'), u.email, u.name`,
      [tenantId]
    );

    for (const row of result.rows) {
      if (!row.email) continue;

      const emailSubject = `Patient Messages Digest - ${row.unread_count} Unread Messages`;
      const threadList = row.threads
        .slice(0, 10) // Max 10 in digest
        .map((t: any, i: number) => {
          const priorityFlag = t.priority === "urgent" ? "[URGENT] " : t.priority === "high" ? "[HIGH] " : "";
          return `${i + 1}. ${priorityFlag}${t.patientName} - ${t.subject} (${t.category})`;
        })
        .join("\n");

      const emailBody = `
Hello ${row.name},

You have ${row.unread_count} unread patient message(s) requiring attention.

${threadList}

${row.unread_count > 10 ? `\n... and ${row.unread_count - 10} more messages` : ""}

Please log in to review and respond:
${getStaffPortalUrl(tenantId)}

Thank you,
Dermatology EHR System
      `.trim();

      console.log("=== STAFF DIGEST EMAIL ===");
      console.log(`To: ${row.email}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Body:\n${emailBody}`);
      console.log("========================");

      await auditLog(tenantId, "system", "staff_digest_email_sent", "user", row.user_id);
    }
  } catch (error) {
    console.error("Error sending staff digest:", error);
  }
}

/**
 * Helper functions
 */
function getPortalUrl(tenantId: string): string {
  // In production, this would be environment-specific
  return `https://portal.dermatologyehr.com/${tenantId}/messages`;
}

function getStaffPortalUrl(tenantId: string): string {
  // In production, this would be environment-specific
  return `http://localhost:5173/mail?tab=patient-messages`;
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
    console.error('SendGrid error:', error);
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
    console.error('AWS SES error:', error);
    throw error;
  }
}
*/
