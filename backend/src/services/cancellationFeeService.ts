import crypto from "crypto";

const LATE_FEE_AMOUNT_CENTS = 5000;
const LATE_FEE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LATE_FEE_CPT_CODE = "LATEFEE";
export const LATE_FEE_NOTE_PREFIX = "[LATE_FEE]";
const NO_SHOW_FEE_AMOUNT_CENTS = Number(process.env.NO_SHOW_FEE_AMOUNT_CENTS || 5000);
const NO_SHOW_FEE_CPT_CODE = "NOSHOW";
export const NO_SHOW_FEE_NOTE_PREFIX = "[NO_SHOW_FEE]";

export type LateFeeTrigger = "cancel" | "reschedule";

export type QueryExecutor = {
  query: (text: string, params?: any[]) => Promise<any>;
};

function getDateOnly(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const [day] = date.toISOString().split("T");
  return day ?? date.toISOString();
}

function isWithinLateFeeWindow(scheduledStart: string | Date, reference = new Date()): boolean {
  const scheduledDate = scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart);
  const diffMs = scheduledDate.getTime() - reference.getTime();
  return diffMs > 0 && diffMs <= LATE_FEE_WINDOW_MS;
}

function buildLateFeeDescription(trigger: LateFeeTrigger): string {
  return trigger === "cancel"
    ? "Cancellation fee"
    : "Late reschedule fee (appointment rescheduled within 24 hours)";
}

function buildLateFeeSignature(appointmentId: string, trigger: LateFeeTrigger, referenceScheduledStart: string | Date): string {
  const referenceIso = new Date(referenceScheduledStart).toISOString();
  return `${LATE_FEE_NOTE_PREFIX}|appointmentId=${appointmentId}|trigger=${trigger}|referenceStart=${referenceIso}`;
}

export async function createLateFeeBillIfNeeded(
  queryable: QueryExecutor,
  params: {
    tenantId: string;
    appointmentId: string;
    patientId: string;
    referenceScheduledStart: string | Date;
    trigger: LateFeeTrigger;
    assessedBy: string;
    bypassWindow?: boolean;
    reason?: string;
  },
): Promise<string | null> {
  if (!params.bypassWindow && !isWithinLateFeeWindow(params.referenceScheduledStart)) {
    return null;
  }

  const signature = buildLateFeeSignature(params.appointmentId, params.trigger, params.referenceScheduledStart);
  const description = buildLateFeeDescription(params.trigger);
  const reasonLine = params.reason?.trim() ? `\nreason=${params.reason.trim()}` : "";
  const notes = `${signature}\n${description}${reasonLine}`;
  const serviceDate = getDateOnly(params.referenceScheduledStart);

  const existingResult = await queryable.query(
    `select id from bills where tenant_id = $1 and notes like $2 limit 1`,
    [params.tenantId, `${signature}%`],
  );
  if (existingResult.rowCount || existingResult.rows?.length) {
    return existingResult.rows[0].id as string;
  }

  const billId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const billDate = getDateOnly(new Date());
  const dueDate = getDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const billNumber = `LATE-${billDate.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await queryable.query(
    `insert into bills(
      id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
      total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
      paid_amount_cents, adjustment_amount_cents, balance_cents, status,
      service_date_start, service_date_end, notes, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      billId,
      params.tenantId,
      params.patientId,
      null,
      billNumber,
      billDate,
      dueDate,
      LATE_FEE_AMOUNT_CENTS,
      0,
      LATE_FEE_AMOUNT_CENTS,
      0,
      0,
      LATE_FEE_AMOUNT_CENTS,
      "new",
      serviceDate,
      serviceDate,
      notes,
      params.assessedBy,
    ],
  );

  await queryable.query(
    `insert into bill_line_items(
      id, tenant_id, bill_id, charge_id, service_date, cpt_code,
      description, quantity, unit_price_cents, total_cents, icd_codes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      lineItemId,
      params.tenantId,
      billId,
      null,
      serviceDate,
      LATE_FEE_CPT_CODE,
      description,
      1,
      LATE_FEE_AMOUNT_CENTS,
      LATE_FEE_AMOUNT_CENTS,
      [],
    ],
  );

  return billId;
}

function buildNoShowFeeSignature(appointmentId: string, referenceScheduledStart: string | Date): string {
  const referenceIso = new Date(referenceScheduledStart).toISOString();
  return `${NO_SHOW_FEE_NOTE_PREFIX}|appointmentId=${appointmentId}|referenceStart=${referenceIso}`;
}

export async function createNoShowFeeBillIfNeeded(
  queryable: QueryExecutor,
  params: {
    tenantId: string;
    appointmentId: string;
    patientId: string;
    referenceScheduledStart: string | Date;
    assessedBy: string;
    reason?: string;
  },
): Promise<string | null> {
  const scheduledDate = new Date(params.referenceScheduledStart);
  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() > Date.now()) {
    return null;
  }

  const signature = buildNoShowFeeSignature(params.appointmentId, params.referenceScheduledStart);
  const reasonLine = params.reason?.trim() ? `\nreason=${params.reason.trim()}` : "";
  const notes = `${signature}\nNo-show fee (missed appointment)${reasonLine}`;
  const serviceDate = getDateOnly(params.referenceScheduledStart);

  const existingResult = await queryable.query(
    `select id from bills where tenant_id = $1 and notes like $2 limit 1`,
    [params.tenantId, `${signature}%`],
  );
  if (existingResult.rowCount || existingResult.rows?.length) {
    return existingResult.rows[0].id as string;
  }

  const billId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const billDate = getDateOnly(new Date());
  const dueDate = getDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const billNumber = `NOSHOW-${billDate.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await queryable.query(
    `insert into bills(
      id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
      total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
      paid_amount_cents, adjustment_amount_cents, balance_cents, status,
      service_date_start, service_date_end, notes, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      billId,
      params.tenantId,
      params.patientId,
      null,
      billNumber,
      billDate,
      dueDate,
      NO_SHOW_FEE_AMOUNT_CENTS,
      0,
      NO_SHOW_FEE_AMOUNT_CENTS,
      0,
      0,
      NO_SHOW_FEE_AMOUNT_CENTS,
      "new",
      serviceDate,
      serviceDate,
      notes,
      params.assessedBy,
    ],
  );

  await queryable.query(
    `insert into bill_line_items(
      id, tenant_id, bill_id, charge_id, service_date, cpt_code,
      description, quantity, unit_price_cents, total_cents, icd_codes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      lineItemId,
      params.tenantId,
      billId,
      null,
      serviceDate,
      NO_SHOW_FEE_CPT_CODE,
      "No-show fee (missed appointment)",
      1,
      NO_SHOW_FEE_AMOUNT_CENTS,
      NO_SHOW_FEE_AMOUNT_CENTS,
      [],
    ],
  );

  return billId;
}
