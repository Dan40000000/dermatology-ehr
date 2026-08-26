export const DEFAULT_RECALL_SMS_TEMPLATE =
  "Hi {firstName}, this is {practiceName}. It's time to schedule your follow-up visit. Reply here or call {clinicPhone} and we'll help. Reply STOP to opt out.";

export const RECALL_SMS_VARIABLES = [
  '{firstName}',
  '{practiceName}',
  '{clinicPhone}',
  '{portalUrl}',
] as const;

type RecallSmsContext = {
  firstName?: string | null;
  practiceName?: string | null;
  clinicPhone?: string | null;
  portalUrl?: string | null;
};

const VARIABLE_PATTERN = /\{([a-zA-Z]+)\}/g;

export function renderRecallSmsTemplate(
  template: string | null | undefined,
  context: RecallSmsContext,
): string {
  const values: Record<string, string> = {
    firstName: context.firstName?.trim() || 'there',
    practiceName: context.practiceName?.trim() || 'your dermatology office',
    clinicName: context.practiceName?.trim() || 'your dermatology office',
    clinicPhone: context.clinicPhone?.trim() || 'our office',
    portalUrl: context.portalUrl?.trim() || 'the patient portal',
  };

  const source = template?.trim() || DEFAULT_RECALL_SMS_TEMPLATE;
  const message = !context.clinicPhone?.trim() && source === DEFAULT_RECALL_SMS_TEMPLATE
    ? source.replace("Reply here or call {clinicPhone} and we'll help.", "Reply here and we'll help.")
    : source;

  return message
    .replace(VARIABLE_PATTERN, (match, variable: string) => values[variable] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

export function findUnsupportedRecallSmsVariables(template: string): string[] {
  const supported = new Set([
    ...RECALL_SMS_VARIABLES.map((variable) => variable.slice(1, -1)),
    'clinicName',
  ]);
  const found = Array.from(template.matchAll(VARIABLE_PATTERN), (match) => match[1]);
  return Array.from(new Set(found.filter((variable) => !supported.has(variable))));
}

export function estimateSmsSegments(message: string): number {
  if (!message.length) return 0;
  return message.length <= 160 ? 1 : Math.ceil(message.length / 153);
}
