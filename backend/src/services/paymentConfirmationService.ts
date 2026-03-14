import { getEmailService } from "../lib/container";
import { logger } from "../lib/logger";

export interface SendPatientPaymentReceiptEmailInput {
  tenantId: string;
  patientEmail?: string | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  amountCents: number;
  paymentMethod?: string | null;
  paymentDate?: string | Date | null;
  receiptNumber: string;
  paymentTypeLabel?: string;
}

export interface SendPatientPaymentReceiptEmailResult {
  attempted: boolean;
  sent: boolean;
  emailAddress?: string;
  messageId?: string;
  error?: string;
  skippedReason?: "missing_email";
}

function normalizeEmailAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : undefined;
}

function buildPatientName(firstName?: string | null, lastName?: string | null): string {
  const fullName = [firstName || "", lastName || ""].join(" ").replace(/\s+/g, " ").trim();
  return fullName || "Patient";
}

function formatPaymentMethod(paymentMethod?: string | null): string {
  if (!paymentMethod) {
    return "Card";
  }

  return paymentMethod
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatPaymentDate(value?: string | Date | null): string {
  if (!value) {
    return new Date().toLocaleDateString("en-US");
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return typeof value === "string" ? value : new Date().toLocaleDateString("en-US");
  }

  return parsedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function sendPatientPaymentReceiptEmail(
  payload: SendPatientPaymentReceiptEmailInput
): Promise<SendPatientPaymentReceiptEmailResult> {
  const emailAddress = normalizeEmailAddress(payload.patientEmail);
  if (!emailAddress) {
    return {
      attempted: false,
      sent: false,
      skippedReason: "missing_email",
    };
  }

  const patientName = buildPatientName(payload.patientFirstName, payload.patientLastName);
  const amount = (payload.amountCents / 100).toFixed(2);
  const paymentMethod = formatPaymentMethod(payload.paymentMethod);
  const paymentDate = formatPaymentDate(payload.paymentDate);
  const paymentType = payload.paymentTypeLabel || "Payment";
  const subject = `${paymentType} Receipt ${payload.receiptNumber}`;
  const text = [
    `Hi ${patientName},`,
    "",
    `We received your ${paymentType.toLowerCase()}.`,
    `Receipt: ${payload.receiptNumber}`,
    `Amount: $${amount}`,
    `Payment method: ${paymentMethod}`,
    `Date: ${paymentDate}`,
    "",
    "Thank you,",
    "Test Medical",
  ].join("\n");

  const html = `
    <p>Hi ${patientName},</p>
    <p>We received your ${paymentType.toLowerCase()}.</p>
    <p><strong>Receipt:</strong> ${payload.receiptNumber}<br />
    <strong>Amount:</strong> $${amount}<br />
    <strong>Payment method:</strong> ${paymentMethod}<br />
    <strong>Date:</strong> ${paymentDate}</p>
    <p>Thank you,<br />Test Medical</p>
  `;

  try {
    const emailResult = await getEmailService().sendEmail({
      to: emailAddress,
      subject,
      text,
      html,
    });

    const sent = emailResult.accepted.includes(emailAddress);
    return {
      attempted: true,
      sent,
      emailAddress,
      messageId: emailResult.messageId,
      ...(sent ? {} : { error: "Email provider rejected recipient" }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email";
    logger.error("Failed to send patient payment receipt email", {
      tenantId: payload.tenantId,
      emailAddress,
      error: message,
    });
    return {
      attempted: true,
      sent: false,
      emailAddress,
      error: message,
    };
  }
}
