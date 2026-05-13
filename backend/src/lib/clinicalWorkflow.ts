export const ENCOUNTER_STATUSES = [
  "draft",
  "in_progress",
  "ready_for_review",
  "final",
  "signed",
  "locked",
  "finalized",
  "completed",
  "closed",
  "cancelled",
] as const;

export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export const ORDER_STATUSES = [
  "draft",
  "ordered",
  "pending",
  "scheduled",
  "sent",
  "received",
  "reviewed",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ENCOUNTER_STATUS_SET = new Set<string>(ENCOUNTER_STATUSES);
const ORDER_STATUS_SET = new Set<string>(ORDER_STATUSES);

const IMMUTABLE_ENCOUNTER_STATUSES = new Set<string>([
  "signed",
  "locked",
  "finalized",
  "completed",
  "closed",
]);

export function normalizeWorkflowStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

export function isValidEncounterStatus(status: unknown): status is EncounterStatus {
  return ENCOUNTER_STATUS_SET.has(normalizeWorkflowStatus(status));
}

export function isValidOrderStatus(status: unknown): status is OrderStatus {
  return ORDER_STATUS_SET.has(normalizeWorkflowStatus(status));
}

export function isImmutableEncounterStatus(status: unknown): boolean {
  return IMMUTABLE_ENCOUNTER_STATUSES.has(normalizeWorkflowStatus(status));
}

export function isEncounterClosureStatus(status: unknown): boolean {
  return isImmutableEncounterStatus(status);
}

export function immutableEncounterErrorMessage(status: unknown): string {
  const normalized = normalizeWorkflowStatus(status) || "locked";
  return `Encounter is ${normalized}; use a signed addendum or billing workflow instead of editing the clinical note.`;
}
