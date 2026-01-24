/**
 * SMTP Email Adapter
 *
 * Adapter that implements IEmailService interface using console logging.
 * In production, this should be replaced with a real email service
 * (nodemailer, SendGrid, AWS SES, etc.)
 *
 * To use with nodemailer:
 * 1. npm install nodemailer @types/nodemailer
 * 2. Uncomment the nodemailer implementation below
 */

import { IEmailService, SendEmailParams, SendEmailResult, EmailAttachment } from "../../types/services";
import { logger } from "../../logger";
import { config } from "../../../config";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  fromName?: string;
}

/**
 * Console-based email adapter for development
 *
 * Logs email content instead of sending.
 * Replace with nodemailer implementation for production.
 */
export class SmtpEmailAdapter implements IEmailService {
  private defaultFrom: string;
  private templates: Map<string, (variables: Record<string, unknown>) => { subject: string; html: string; text?: string }> =
    new Map();

  constructor(smtpConfig?: Partial<SmtpConfig>) {
    const emailConfig = config.email;

    const from = smtpConfig?.from || emailConfig.from.email;
    const fromName = smtpConfig?.fromName || emailConfig.from.name;

    this.defaultFrom = fromName ? `${fromName} <${from}>` : from;

    logger.info("SmtpEmailAdapter initialized (console mode)", { from });

    this.registerDefaultTemplates();
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const to = Array.isArray(params.to) ? params.to : [params.to];
    const messageId = `<${Date.now()}-${Math.random().toString(36).substring(2)}@dermatologyehr.local>`;

    // Log email content (in production, this would actually send)
    logger.info("Email prepared for sending", {
      messageId,
      from: params.from || this.defaultFrom,
      to,
      subject: params.subject,
      hasHtml: !!params.html,
      hasText: !!params.text,
      attachmentCount: params.attachments?.length || 0,
    });

    // In development, log more details
    if (config.isDevelopment) {
      logger.debug("Email content (development mode)", {
        subject: params.subject,
        textPreview: params.text?.substring(0, 200),
      });
    }

    return {
      messageId,
      accepted: to,
      rejected: [],
    };
  }

  async sendTemplatedEmail(
    templateId: string,
    to: string | string[],
    variables: Record<string, unknown>
  ): Promise<SendEmailResult> {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Email template not found: ${templateId}`);
    }

    const { subject, html, text } = template(variables);

    return this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }

  async verifyConnection(): Promise<boolean> {
    // In console mode, always return true
    logger.info("Email connection verified (console mode)");
    return true;
  }

  /**
   * Register a custom email template
   */
  registerTemplate(
    templateId: string,
    builder: (variables: Record<string, unknown>) => { subject: string; html: string; text?: string }
  ): void {
    this.templates.set(templateId, builder);
    logger.debug("Email template registered", { templateId });
  }

  private registerDefaultTemplates(): void {
    // Appointment reminder
    this.templates.set("appointment_reminder", (vars) => ({
      subject: `Appointment Reminder - ${vars.appointmentDate as string}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><style>body { font-family: Arial, sans-serif; }</style></head>
        <body>
          <h1>Appointment Reminder</h1>
          <p>Dear ${vars.patientName as string},</p>
          <p>This is a reminder for your upcoming appointment:</p>
          <ul>
            <li><strong>Date:</strong> ${vars.appointmentDate as string}</li>
            <li><strong>Time:</strong> ${vars.appointmentTime as string}</li>
            <li><strong>Provider:</strong> ${vars.providerName as string}</li>
          </ul>
          <p>If you need to reschedule, please call ${vars.clinicPhone as string}.</p>
          <p>Thank you,<br>${(vars.clinicName as string) || "Dermatology EHR"}</p>
        </body>
        </html>
      `,
      text: `
Appointment Reminder

Dear ${vars.patientName as string},

This is a reminder for your upcoming appointment:
- Date: ${vars.appointmentDate as string}
- Time: ${vars.appointmentTime as string}
- Provider: ${vars.providerName as string}

If you need to reschedule, please call ${vars.clinicPhone as string}.

Thank you,
${(vars.clinicName as string) || "Dermatology EHR"}
      `.trim(),
    }));

    // Password reset
    this.templates.set("password_reset", (vars) => ({
      subject: "Password Reset Request",
      html: `
        <!DOCTYPE html>
        <html>
        <head><style>body { font-family: Arial, sans-serif; }</style></head>
        <body>
          <h1>Password Reset</h1>
          <p>You requested a password reset for your account.</p>
          <p><a href="${vars.resetLink as string}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>This link expires in ${(vars.expiresIn as string) || "1 hour"}.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </body>
        </html>
      `,
      text: `
Password Reset

You requested a password reset for your account.

Click here to reset your password: ${vars.resetLink as string}

This link expires in ${(vars.expiresIn as string) || "1 hour"}.

If you didn't request this, please ignore this email.
      `.trim(),
    }));

    // New message notification (HIPAA compliant - no PHI)
    this.templates.set("new_message", (vars) => ({
      subject: "You have a new message from your healthcare provider",
      html: `
        <!DOCTYPE html>
        <html>
        <head><style>body { font-family: Arial, sans-serif; }</style></head>
        <body>
          <h1>New Message</h1>
          <p>Dear ${vars.recipientName as string},</p>
          <p>You have received a new message from your healthcare provider.</p>
          <p>To view this message, please log in to your patient portal:</p>
          <p><a href="${vars.portalUrl as string}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Message</a></p>
          <p>For security reasons, we do not include message content in email notifications.</p>
          <p>Thank you,<br>Your Healthcare Team</p>
          <hr>
          <p style="font-size: 12px; color: #666;">This is an automated message. Please do not reply to this email.</p>
        </body>
        </html>
      `,
      text: `
New Message

Dear ${vars.recipientName as string},

You have received a new message from your healthcare provider.

To view this message, please log in to your patient portal:
${vars.portalUrl as string}

For security reasons, we do not include message content in email notifications.

Thank you,
Your Healthcare Team

---
This is an automated message. Please do not reply to this email.
      `.trim(),
    }));
  }
}

/*
 * NODEMAILER IMPLEMENTATION
 *
 * To use nodemailer, install it first:
 *   npm install nodemailer @types/nodemailer
 *
 * Then uncomment and use this implementation:
 *
 * import nodemailer, { Transporter } from "nodemailer";
 *
 * export class NodemailerEmailAdapter implements IEmailService {
 *   private transporter: Transporter;
 *   private defaultFrom: string;
 *   private templates: Map<string, TemplateBuilder> = new Map();
 *
 *   constructor(smtpConfig?: Partial<SmtpConfig>) {
 *     const emailConfig = config.email;
 *     const host = smtpConfig?.host || emailConfig.smtp.host;
 *     const port = smtpConfig?.port || emailConfig.smtp.port;
 *     const secure = smtpConfig?.secure ?? emailConfig.smtp.secure;
 *     const user = smtpConfig?.auth?.user || emailConfig.smtp.user;
 *     const pass = smtpConfig?.auth?.pass || emailConfig.smtp.password;
 *     const from = smtpConfig?.from || emailConfig.from.email;
 *     const fromName = smtpConfig?.fromName || emailConfig.from.name;
 *
 *     this.defaultFrom = fromName ? `${fromName} <${from}>` : from;
 *
 *     const transportConfig = { host, port, secure, auth: user && pass ? { user, pass } : undefined };
 *     this.transporter = nodemailer.createTransport(transportConfig);
 *   }
 *
 *   async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
 *     const result = await this.transporter.sendMail({
 *       from: params.from || this.defaultFrom,
 *       to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
 *       subject: params.subject,
 *       text: params.text,
 *       html: params.html,
 *       replyTo: params.replyTo,
 *       cc: params.cc,
 *       bcc: params.bcc,
 *       attachments: params.attachments?.map(att => ({
 *         filename: att.filename,
 *         content: att.content,
 *         contentType: att.contentType,
 *       })),
 *     });
 *     return { messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
 *   }
 *
 *   async verifyConnection(): Promise<boolean> {
 *     await this.transporter.verify();
 *     return true;
 *   }
 * }
 */
