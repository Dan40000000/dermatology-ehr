/**
 * SMTP Email Adapter
 *
 * Adapter that implements IEmailService with automatic transport selection:
 * - SMTP (nodemailer) when SMTP credentials are configured
 * - AWS SES when SES region/credentials are configured
 * - Console fallback in development/testing
 */

import { IEmailService, SendEmailParams, SendEmailResult, EmailAttachment } from "../../types/services";
import { logger } from "../../logger";
import { config } from "../../../config";
import {
  SESClient,
  SendEmailCommand,
  GetAccountSendingEnabledCommand,
} from "@aws-sdk/client-ses";
import nodemailer, { Transporter } from "nodemailer";

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

type SendGridAddress = {
  email: string;
  name?: string;
};

/**
 * Console-based email adapter for development
 *
 * Logs email content instead of sending.
 * Replace with nodemailer implementation for production.
 */
export class SmtpEmailAdapter implements IEmailService {
  private defaultFrom: string;
  private sendGridApiKey: string | null;
  private smtpTransporter: Transporter | null;
  private sesClient: SESClient | null;
  private sendMode: "console" | "sendgrid" | "smtp" | "ses";
  private templates: Map<string, (variables: Record<string, unknown>) => { subject: string; html: string; text?: string }> =
    new Map();

  constructor(smtpConfig?: Partial<SmtpConfig>) {
    const emailConfig = config.email;

    const from = smtpConfig?.from || emailConfig.from.email;
    const fromName = smtpConfig?.fromName || emailConfig.from.name;

    this.defaultFrom = fromName ? `${fromName} <${from}>` : from;
    this.sendGridApiKey = this.getSendGridApiKey();
    this.smtpTransporter = this.createSmtpTransporter(smtpConfig);
    this.sesClient = this.createSesClient();
    this.sendMode = this.sendGridApiKey ? "sendgrid" : this.smtpTransporter ? "smtp" : this.sesClient ? "ses" : "console";

    logger.info("SmtpEmailAdapter initialized", {
      from,
      mode: this.sendMode,
      sendGridConfigured: !!this.sendGridApiKey,
      smtpConfigured: !!this.smtpTransporter,
      sesRegion: process.env.AWS_SES_REGION || process.env.AWS_REGION || null,
    });

    this.registerDefaultTemplates();
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const to = Array.isArray(params.to) ? params.to : [params.to];
    const fallbackMessageId = `<${Date.now()}-${Math.random().toString(36).substring(2)}@dermatologyehr.local>`;

    if (this.sendMode === "sendgrid" && this.sendGridApiKey) {
      return this.sendViaSendGrid(params, to, fallbackMessageId);
    }

    if (this.sendMode === "smtp" && this.smtpTransporter) {
      const response = await this.smtpTransporter.sendMail({
        from: params.from || this.defaultFrom,
        to: this.normalizeAddressList(params.to),
        cc: this.normalizeAddressList(params.cc),
        bcc: this.normalizeAddressList(params.bcc),
        subject: params.subject || "Message from Dermatology EHR",
        text: params.text || this.stripHtml(params.html || ""),
        html: params.html,
        replyTo: this.normalizeAddressList(params.replyTo),
        attachments: params.attachments?.map((attachment) => this.toSmtpAttachment(attachment)),
      });

      const accepted = (response.accepted || []).map((entry: string | { address: string }) =>
        typeof entry === "string" ? entry : entry.address
      );
      const rejected = (response.rejected || []).map((entry: string | { address: string }) =>
        typeof entry === "string" ? entry : entry.address
      );
      const messageId = response.messageId || fallbackMessageId;

      logger.info("Email sent via SMTP", {
        messageId,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        subject: params.subject,
      });

      return {
        messageId,
        accepted: accepted.length > 0 ? accepted : to,
        rejected,
      };
    }

    if (this.sendMode === "ses" && this.sesClient) {
      if (params.attachments?.length) {
        // Simple SES sendEmail does not support attachments; keep this explicit.
        logger.warn("SES sendEmail called with attachments; attachments are ignored in simple SES mode", {
          attachmentCount: params.attachments.length,
        });
      }

      const destination = {
        ToAddresses: this.normalizeAddressList(params.to),
        CcAddresses: this.normalizeAddressList(params.cc),
        BccAddresses: this.normalizeAddressList(params.bcc),
      };

      const subject = params.subject || "Message from Dermatology EHR";
      const text = params.text || this.stripHtml(params.html || "");
      const html = params.html;
      const source = params.from || this.defaultFrom;

      const response = await this.sesClient.send(
        new SendEmailCommand({
          Source: source,
          ReplyToAddresses: this.normalizeAddressList(params.replyTo),
          Destination: destination,
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
            },
          },
        })
      );

      const messageId = response.MessageId || fallbackMessageId;
      logger.info("Email sent via SES", {
        messageId,
        to: destination.ToAddresses,
        ccCount: destination.CcAddresses?.length || 0,
        bccCount: destination.BccAddresses?.length || 0,
        subject,
      });

      return {
        messageId,
        accepted: to,
        rejected: [],
      };
    }

    // Log email content (in production, this would actually send)
    logger.info("Email prepared for sending", {
      messageId: fallbackMessageId,
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
      messageId: fallbackMessageId,
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
    if (this.sendMode === "sendgrid" && this.sendGridApiKey) {
      logger.info("Email connection configured (SendGrid API mode)");
      return true;
    }

    if (this.sendMode === "smtp" && this.smtpTransporter) {
      try {
        await this.smtpTransporter.verify();
        logger.info("Email connection verified (SMTP mode)");
        return true;
      } catch (error) {
        logger.error("Email SMTP verification failed", { error: (error as Error).message });
        return false;
      }
    }

    if (this.sendMode === "ses" && this.sesClient) {
      try {
        await this.sesClient.send(new GetAccountSendingEnabledCommand({}));
        logger.info("Email connection verified (SES mode)");
        return true;
      } catch (error) {
        logger.error("Email SES verification failed", { error: (error as Error).message });
        return false;
      }
    }

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

  private getSendGridApiKey(): string | null {
    const explicitKey = (
      process.env.SENDGRID_API_KEY ||
      process.env.SENDGRID_SMTP_API_KEY ||
      process.env.TWILIO_SENDGRID_API_KEY ||
      ""
    ).trim();

    if (explicitKey && !/^CHANGE_ME/i.test(explicitKey)) {
      return explicitKey;
    }

    const smtpHost = (
      process.env.SMTP_HOST ||
      process.env.SENDGRID_SMTP_HOST ||
      config.email.smtp.host ||
      ""
    ).trim();
    const smtpPassword = (process.env.SMTP_PASSWORD || config.email.smtp.password || "").trim();

    if (/sendgrid/i.test(smtpHost) && smtpPassword && !/^CHANGE_ME/i.test(smtpPassword)) {
      return smtpPassword;
    }

    return null;
  }

  private async sendViaSendGrid(
    params: SendEmailParams,
    acceptedRecipients: string[],
    fallbackMessageId: string
  ): Promise<SendEmailResult> {
    const subject = params.subject || "Message from Dermatology EHR";
    const text = params.text || this.stripHtml(params.html || "");
    const timeoutMs = this.getPositiveNumber(process.env.SENDGRID_TIMEOUT_MS, 15000);
    const toRecipients = this.normalizeAddressList(params.to);
    const ccRecipients = this.normalizeAddressList(params.cc);
    const bccRecipients = this.normalizeAddressList(params.bcc);
    const replyTo = this.normalizeAddressList(params.replyTo)[0];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.sendGridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: toRecipients.map((email) => ({ email })),
              ...(ccRecipients.length ? { cc: ccRecipients.map((email) => ({ email })) } : {}),
              ...(bccRecipients.length ? { bcc: bccRecipients.map((email) => ({ email })) } : {}),
            },
          ],
          from: this.parseEmailAddress(params.from || this.defaultFrom),
          ...(replyTo ? { reply_to: this.parseEmailAddress(replyTo) } : {}),
          subject,
          content: [
            { type: "text/plain", value: text || subject },
            ...(params.html ? [{ type: "text/html", value: params.html }] : []),
          ],
          ...(params.attachments?.length
            ? {
                attachments: params.attachments.map((attachment) => ({
                  content: Buffer.isBuffer(attachment.content)
                    ? attachment.content.toString("base64")
                    : Buffer.from(attachment.content).toString("base64"),
                  filename: attachment.filename,
                  ...(attachment.contentType ? { type: attachment.contentType } : {}),
                  disposition: "attachment",
                })),
              }
            : {}),
        }),
        signal: controller.signal,
      });

      const messageId = response.headers.get("x-message-id") || fallbackMessageId;

      if (!response.ok) {
        const errorText = await response.text();
        const reason = this.extractSendGridError(errorText) || response.statusText || "unknown provider error";

        logger.error("Email send via SendGrid API failed", {
          statusCode: response.status,
          error: reason,
          subject,
        });

        throw new Error(`SendGrid email send failed (${response.status}): ${reason}`);
      }

      logger.info("Email sent via SendGrid API", {
        messageId,
        acceptedCount: acceptedRecipients.length,
        subject,
      });

      return {
        messageId,
        accepted: acceptedRecipients,
        rejected: [],
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`SendGrid email send timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private createSmtpTransporter(smtpConfig?: Partial<SmtpConfig>): Transporter | null {
    const host = (
      smtpConfig?.host ||
      process.env.SMTP_HOST ||
      process.env.SENDGRID_SMTP_HOST ||
      config.email.smtp.host ||
      ""
    ).trim();
    const pass = (
      smtpConfig?.auth?.pass ||
      process.env.SMTP_PASSWORD ||
      process.env.SENDGRID_SMTP_API_KEY ||
      process.env.TWILIO_SENDGRID_API_KEY ||
      config.email.smtp.password ||
      ""
    ).trim();
    const explicitUser = (
      smtpConfig?.auth?.user ||
      process.env.SMTP_USER ||
      process.env.SENDGRID_SMTP_USERNAME ||
      config.email.smtp.user ||
      ""
    ).trim();
    const user = explicitUser || (/sendgrid/i.test(host) && pass ? "apikey" : "");

    if (!host || !user || !pass) {
      return null;
    }

    const parsedPort = Number(smtpConfig?.port ?? process.env.SMTP_PORT ?? config.email.smtp.port ?? 587);
    const port = Number.isFinite(parsedPort) ? parsedPort : 587;
    const secure = smtpConfig?.secure ?? config.email.smtp.secure;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      connectionTimeout: this.getPositiveNumber(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000),
      greetingTimeout: this.getPositiveNumber(process.env.SMTP_GREETING_TIMEOUT_MS, 10000),
      socketTimeout: this.getPositiveNumber(process.env.SMTP_SOCKET_TIMEOUT_MS, 15000),
      auth: {
        user,
        pass,
      },
    });
  }

  private createSesClient(): SESClient | null {
    const region = (process.env.AWS_SES_REGION || process.env.AWS_REGION || "").trim();
    if (!region) {
      return null;
    }

    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
    const sessionToken = (process.env.AWS_SESSION_TOKEN || "").trim();

    if (accessKeyId && secretAccessKey) {
      return new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {}),
        },
      });
    }

    // Allow IAM role/instance profile credential provider chain.
    return new SESClient({ region });
  }

  private normalizeAddressList(value?: string | string[]): string[] {
    if (!value) {
      return [];
    }
    const values = Array.isArray(value) ? value : [value];
    return values.map((entry) => entry.trim()).filter(Boolean);
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  private parseEmailAddress(value: string): SendGridAddress {
    const match = value.match(/^(.*?)\s*<([^>]+)>$/);
    if (match) {
      const name = (match[1] || "").trim().replace(/^"|"$/g, "");
      const email = (match[2] || "").trim();
      return name ? { email, name } : { email };
    }

    return { email: value.trim() };
  }

  private extractSendGridError(errorText: string): string | null {
    try {
      const parsed = JSON.parse(errorText) as { errors?: Array<{ message?: string }> };
      const message = parsed.errors?.map((error) => error.message).filter(Boolean).join("; ");
      return message || null;
    } catch {
      return errorText.trim() || null;
    }
  }

  private getPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toSmtpAttachment(attachment: EmailAttachment): {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  } {
    return {
      filename: attachment.filename,
      content: attachment.content,
      ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    };
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
