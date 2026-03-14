import { formatPhoneDisplay } from '../utils/phone';

type QueryableClient = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

export type SMSPracticeBranding = {
  practiceName: string;
  practicePhone: string | null;
};

export async function getSMSPracticeBranding(
  tenantId: string,
  client: QueryableClient
): Promise<SMSPracticeBranding> {
  const result = await client.query(
    `SELECT
       COALESCE(NULLIF(practice_name, ''), NULLIF(name, '')) as "practiceName",
       practice_phone as "practicePhone"
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId]
  );

  const row = result.rows[0] || {};
  const practiceName =
    row.practiceName ||
    process.env.MESSAGING_FROM_NAME ||
    process.env.FROM_NAME ||
    'Our practice';

  return {
    practiceName,
    practicePhone: row.practicePhone || null,
  };
}

export function buildSMSConsentRequestText(branding: SMSPracticeBranding): string {
  return `${branding.practiceName}: Reply YES to receive text messages about appointments, billing, prescriptions, and care updates. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`;
}

export function buildSMSOptInConfirmationText(branding: SMSPracticeBranding): string {
  return `${branding.practiceName}: You are opted in for text messages. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`;
}

export function buildSMSOptOutConfirmationText(branding: SMSPracticeBranding): string {
  return `${branding.practiceName}: You are opted out of text messages and will no longer receive them. Reply START to opt back in.`;
}

export function buildSMSHelpText(branding: SMSPracticeBranding): string {
  const phone = branding.practicePhone ? ` or call ${formatPhoneDisplay(branding.practicePhone)}` : '';
  return `${branding.practiceName}: For help with text messages, reply STOP to opt out${phone}.`;
}
