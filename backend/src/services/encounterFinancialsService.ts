import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

interface EncounterBillingContext {
  encounterId: string;
  patientId: string;
  providerId: string | null;
  serviceDate: string;
  latestVerificationId: string | null;
  payerId: string | null;
  payerName: string | null;
  memberId: string | null;
  verificationStatus: string | null;
  copaySpecialistCents: number;
  copayAmountCents: number;
  deductibleRemainingCents: number;
  coinsurancePct: number;
}

interface NormalizedCharge {
  id: string;
  cptCode: string;
  description: string;
  quantity: number;
  feeCents: number;
  amountCents: number;
  status: string;
  serviceDate: string;
  icdCodes: string[];
}

export interface EncounterFinancialsResult {
  billId: string | null;
  billNumber: string | null;
  totalChargesCents: number;
  insuranceResponsibilityCents: number;
  patientResponsibilityCents: number;
  balanceCents: number;
  chargeCount: number;
  payerName: string | null;
}

function toIsoDate(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function toInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  return [];
}

function hasBillableInsurance(context: EncounterBillingContext): boolean {
  const status = String(context.verificationStatus || "").toLowerCase();
  if (["inactive", "terminated", "error", "failed"].includes(status)) {
    return false;
  }
  return Boolean(context.payerId || context.payerName || context.memberId);
}

function estimatePatientResponsibility(
  context: EncounterBillingContext,
  insuranceEligibleCents: number,
): number {
  if (insuranceEligibleCents <= 0 || !hasBillableInsurance(context)) {
    return insuranceEligibleCents;
  }

  const copayCents = Math.max(context.copaySpecialistCents || context.copayAmountCents || 0, 0);
  const deductibleCents = Math.max(context.deductibleRemainingCents || 0, 0);
  const deductibleApplied = Math.min(insuranceEligibleCents, deductibleCents);
  const afterDeductible = Math.max(insuranceEligibleCents - deductibleApplied, 0);
  const coinsuranceCents = Math.round(afterDeductible * Math.max(context.coinsurancePct || 0, 0) / 100);

  return Math.min(insuranceEligibleCents, copayCents + deductibleApplied + coinsuranceCents);
}

async function getEncounterBillingContext(
  queryable: Queryable,
  tenantId: string,
  encounterId: string,
): Promise<EncounterBillingContext | null> {
  const result = await queryable.query(
    `select
       e.id as "encounterId",
       e.patient_id as "patientId",
       e.provider_id as "providerId",
       coalesce(a.scheduled_start::date, e.created_at::date, current_date) as "serviceDate",
       nullif(to_jsonb(p)->>'latest_verification_id', '') as "latestVerificationId",
       nullif(to_jsonb(p)->>'insurance_payer_id', '') as "payerId",
       coalesce(nullif(to_jsonb(p)->>'insurance_plan_name', ''), nullif(to_jsonb(p)->>'insurance', '')) as "payerName",
       nullif(to_jsonb(p)->>'insurance_member_id', '') as "memberId",
       nullif(to_jsonb(p)->>'eligibility_status', '') as "verificationStatus",
       0 as "copaySpecialistCents",
       0 as "copayAmountCents",
       0 as "deductibleRemainingCents",
       0 as "coinsurancePct"
     from encounters e
     join patients p on p.id = e.patient_id and p.tenant_id = e.tenant_id
     left join appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
     where e.id = $1 and e.tenant_id = $2
     limit 1`,
    [encounterId, tenantId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const context: EncounterBillingContext = {
    encounterId: row.encounterId,
    patientId: row.patientId,
    providerId: row.providerId || null,
    serviceDate: toIsoDate(row.serviceDate),
    latestVerificationId: coerceString(row.latestVerificationId),
    payerId: coerceString(row.payerId),
    payerName: coerceString(row.payerName),
    memberId: coerceString(row.memberId),
    verificationStatus: coerceString(row.verificationStatus),
    copaySpecialistCents: toInt(row.copaySpecialistCents),
    copayAmountCents: toInt(row.copayAmountCents),
    deductibleRemainingCents: toInt(row.deductibleRemainingCents),
    coinsurancePct: toNumber(row.coinsurancePct),
  };

  if (!context.latestVerificationId) {
    return context;
  }

  try {
    const verificationResult = await queryable.query(
      `select
         coalesce(nullif(to_jsonb(iv)->>'payer_id', ''), $3) as "payerId",
         coalesce(nullif(to_jsonb(iv)->>'payer_name', ''), nullif(to_jsonb(iv)->>'plan_name', ''), $4) as "payerName",
         coalesce(nullif(to_jsonb(iv)->>'member_id', ''), $5) as "memberId",
         coalesce(nullif(to_jsonb(iv)->>'verification_status', ''), $6) as "verificationStatus",
         coalesce(nullif(to_jsonb(iv)->>'copay_specialist_cents', '')::numeric, 0) as "copaySpecialistCents",
         coalesce(nullif(to_jsonb(iv)->>'copay_amount_cents', '')::numeric, 0) as "copayAmountCents",
         coalesce(
           nullif(to_jsonb(iv)->>'deductible_remaining_cents', '')::numeric,
           nullif(to_jsonb(iv)->>'deductible_remaining', '')::numeric,
           0
         ) as "deductibleRemainingCents",
         coalesce(nullif(to_jsonb(iv)->>'coinsurance_pct', '')::numeric, 0) as "coinsurancePct"
       from insurance_verifications iv
       where iv.id::text = $1
         and iv.tenant_id::text = $2
       limit 1`,
      [
        context.latestVerificationId,
        tenantId,
        context.payerId,
        context.payerName,
        context.memberId,
        context.verificationStatus,
      ],
    );
    const verification = verificationResult.rows[0];
    if (verification) {
      context.payerId = coerceString(verification.payerId);
      context.payerName = coerceString(verification.payerName);
      context.memberId = coerceString(verification.memberId);
      context.verificationStatus = coerceString(verification.verificationStatus);
      context.copaySpecialistCents = toInt(verification.copaySpecialistCents);
      context.copayAmountCents = toInt(verification.copayAmountCents);
      context.deductibleRemainingCents = toInt(verification.deductibleRemainingCents);
      context.coinsurancePct = toNumber(verification.coinsurancePct);
    }
  } catch (error: any) {
    if (error?.code !== "42P01") {
      throw error;
    }
    logger.warn?.("Insurance verification table unavailable; using patient insurance fields for financial estimate", {
      tenantId,
      encounterId,
    });
  }

  return context;
}

async function lookupFeeCents(queryable: Queryable, tenantId: string, cptCode: string): Promise<number> {
  const feeResult = await queryable.query(
    `select
       coalesce(fsi.fee_cents, round(fsi.fee_amount * 100)::int, 0) as "feeCents"
     from fee_schedule_items fsi
     join fee_schedules fs on fs.id = fsi.fee_schedule_id
     where fs.tenant_id = $1
       and upper(fsi.cpt_code) = upper($2)
     order by fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     limit 1`,
    [tenantId, cptCode],
  );

  const scheduledFee = toInt(feeResult.rows[0]?.feeCents);
  if (scheduledFee > 0) {
    return scheduledFee;
  }

  const cptResult = await queryable.query(
    `select coalesce(default_fee_cents, 0) as "feeCents"
     from cpt_codes
     where upper(code) = upper($1)
     limit 1`,
    [cptCode],
  );

  return toInt(cptResult.rows[0]?.feeCents);
}

export async function normalizeEncounterCharges(
  tenantId: string,
  encounterId: string,
  queryable: Queryable = pool,
): Promise<NormalizedCharge[]> {
  const context = await getEncounterBillingContext(queryable, tenantId, encounterId);
  if (!context) {
    throw new Error("Encounter not found");
  }

  const result = await queryable.query(
    `select
       c.id,
       c.cpt_code as "cptCode",
       c.description,
       coalesce(c.quantity, 1) as quantity,
       c.fee_cents as "feeCents",
       coalesce(c.amount_cents, round(c.amount * 100)::int) as "amountCents",
       coalesce(c.status, 'pending') as status,
       coalesce(c.service_date, $3::date) as "serviceDate",
       c.icd_codes as "icdCodes"
     from charges c
     where c.tenant_id = $1
       and c.encounter_id = $2
       and c.cpt_code is not null
       and coalesce(c.status, 'pending') <> 'voided'
     order by c.created_at asc`,
    [tenantId, encounterId, context.serviceDate],
  );

  const charges: NormalizedCharge[] = [];

  for (const row of result.rows) {
    const cptCode = String(row.cptCode || "").trim();
    if (!cptCode) {
      continue;
    }

    const quantity = Math.max(1, toInt(row.quantity, 1));
    const feeCents = toInt(row.feeCents) || await lookupFeeCents(queryable, tenantId, cptCode);
    const amountCents = toInt(row.amountCents) || feeCents * quantity;
    const serviceDate = toIsoDate(row.serviceDate || context.serviceDate);
    const currentStatus = String(row.status || "pending");
    const nextStatus = currentStatus === "draft" ? "pending" : currentStatus;
    const description = coerceString(row.description) || `CPT ${cptCode}`;
    const icdCodes = parseTextArray(row.icdCodes);

    await queryable.query(
      `update charges
       set fee_cents = $1,
           amount_cents = $2::int,
           amount = round(($2::numeric / 100), 2),
           patient_id = $3,
           service_date = $4,
           status = $5
       where id = $6 and tenant_id = $7`,
      [feeCents, amountCents, context.patientId, serviceDate, nextStatus, row.id, tenantId],
    );

    charges.push({
      id: row.id,
      cptCode,
      description,
      quantity,
      feeCents,
      amountCents,
      status: nextStatus,
      serviceDate,
      icdCodes,
    });
  }

  return charges;
}

async function syncPortalBalance(
  queryable: Queryable,
  tenantId: string,
  patientId: string,
): Promise<void> {
  const summaryResult = await queryable.query(
    `select
       coalesce(sum(patient_responsibility_cents), 0) as "patientChargesCents",
       coalesce(sum(paid_amount_cents), 0) as "billPaidCents",
       coalesce(sum(adjustment_amount_cents), 0) as "adjustmentCents"
     from bills
     where tenant_id = $1
       and patient_id = $2
       and status <> 'cancelled'`,
    [tenantId, patientId],
  );

  const patientPaymentsResult = await queryable.query(
    `select coalesce(sum(amount_cents), 0) as "paymentCents"
     from patient_payments
     where tenant_id = $1
       and patient_id = $2
       and status in ('posted', 'completed')`,
    [tenantId, patientId],
  );

  const patientChargesCents = toInt(summaryResult.rows[0]?.patientChargesCents);
  const billPaidCents = toInt(summaryResult.rows[0]?.billPaidCents);
  const adjustmentCents = toInt(summaryResult.rows[0]?.adjustmentCents);
  const patientPaymentCents = toInt(patientPaymentsResult.rows[0]?.paymentCents);
  const totalPaymentsCents = Math.max(billPaidCents, patientPaymentCents);

  await queryable.query(
    `insert into portal_patient_balances (
       tenant_id, patient_id, total_charges, total_payments, total_adjustments,
       last_updated
     ) values ($1, $2, $3, $4, $5, now())
     on conflict (patient_id)
     do update set
       tenant_id = excluded.tenant_id,
       total_charges = excluded.total_charges,
       total_payments = excluded.total_payments,
       total_adjustments = excluded.total_adjustments,
       last_updated = now()`,
    [
      tenantId,
      patientId,
      (patientChargesCents / 100).toFixed(2),
      (totalPaymentsCents / 100).toFixed(2),
      (adjustmentCents / 100).toFixed(2),
    ],
  );
}

async function resolveCreatedBy(queryable: Queryable, tenantId: string, userId: string): Promise<string> {
  const preferredResult = await queryable.query(
    `select id from users where id = $1 and tenant_id = $2 limit 1`,
    [userId, tenantId],
  );
  if (preferredResult.rows[0]?.id) {
    return preferredResult.rows[0].id as string;
  }

  const fallbackResult = await queryable.query(
    `select id from users where tenant_id = $1 order by created_at asc limit 1`,
    [tenantId],
  );
  return (fallbackResult.rows[0]?.id as string | undefined) || userId;
}

export async function ensureEncounterBill(
  tenantId: string,
  encounterId: string,
  userId: string,
  queryable: Queryable = pool,
  claimId?: string | null,
): Promise<EncounterFinancialsResult> {
  const context = await getEncounterBillingContext(queryable, tenantId, encounterId);
  if (!context) {
    throw new Error("Encounter not found");
  }

  const charges = await normalizeEncounterCharges(tenantId, encounterId, queryable);
  if (charges.length === 0) {
    return {
      billId: null,
      billNumber: null,
      totalChargesCents: 0,
      insuranceResponsibilityCents: 0,
      patientResponsibilityCents: 0,
      balanceCents: 0,
      chargeCount: 0,
      payerName: context.payerName,
    };
  }

  const totalChargesCents = charges.reduce((sum, charge) => sum + charge.amountCents, 0);
  const selfPayCents = charges
    .filter((charge) => charge.status === "self_pay")
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const insuranceEligibleCents = hasBillableInsurance(context)
    ? Math.max(0, totalChargesCents - selfPayCents)
    : 0;
  const insurancePatientCents = estimatePatientResponsibility(context, insuranceEligibleCents);
  const patientResponsibilityCents = Math.min(totalChargesCents, selfPayCents + insurancePatientCents);
  const insuranceResponsibilityCents = Math.max(0, totalChargesCents - patientResponsibilityCents);

  const existingBillResult = await queryable.query(
    `select id, bill_number as "billNumber", paid_amount_cents as "paidAmountCents",
            adjustment_amount_cents as "adjustmentAmountCents", status
     from bills
     where tenant_id = $1
       and encounter_id = $2
       and status <> 'cancelled'
     order by created_at asc
     limit 1`,
    [tenantId, encounterId],
  );

  const existingBill = existingBillResult.rows[0];
  const createdBy = await resolveCreatedBy(queryable, tenantId, userId);
  const paidAmountCents = toInt(existingBill?.paidAmountCents);
  const adjustmentAmountCents = toInt(existingBill?.adjustmentAmountCents);
  const balanceCents = Math.max(0, patientResponsibilityCents - paidAmountCents - adjustmentAmountCents);
  const status =
    balanceCents === 0
      ? (paidAmountCents > 0 ? "paid" : "new")
      : insuranceResponsibilityCents > 0
        ? "submitted"
        : "new";

  const notes = [
    "Auto-generated from encounter charges.",
    insuranceResponsibilityCents > 0
      ? `Insurance estimate: ${context.payerName || context.payerId || "payer"} responsible for $${(insuranceResponsibilityCents / 100).toFixed(2)}.`
      : "Patient/self-pay responsibility.",
    claimId ? `Claim: ${claimId}` : null,
  ].filter(Boolean).join(" ");

  let billId = existingBill?.id as string | undefined;
  let billNumber = existingBill?.billNumber as string | undefined;
  const billDate = toIsoDate(new Date());
  const dueDate = toIsoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const serviceDates = charges.map((charge) => charge.serviceDate).sort();
  const serviceDateStart = serviceDates[0] || context.serviceDate;
  const serviceDateEnd = serviceDates[serviceDates.length - 1] || context.serviceDate;

  if (!billId) {
    billId = crypto.randomUUID();
    const countResult = await queryable.query(
      `select count(*) as count from bills where tenant_id = $1`,
      [tenantId],
    );
    billNumber = `BILL-${new Date().getFullYear()}-${String(toInt(countResult.rows[0]?.count) + 1).padStart(6, "0")}`;

    await queryable.query(
      `insert into bills(
        id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
        total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
        paid_amount_cents, adjustment_amount_cents, balance_cents, status,
        service_date_start, service_date_end, primary_insurance_id, notes, created_by
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        billId,
        tenantId,
        context.patientId,
        encounterId,
        billNumber,
        billDate,
        dueDate,
        totalChargesCents,
        insuranceResponsibilityCents,
        patientResponsibilityCents,
        0,
        0,
        balanceCents,
        status,
        serviceDateStart,
        serviceDateEnd,
        context.payerId,
        notes,
        createdBy,
      ],
    );
  } else {
    await queryable.query(
      `update bills
       set total_charges_cents = $1,
           insurance_responsibility_cents = $2,
           patient_responsibility_cents = $3,
           balance_cents = $4,
           status = $5,
           service_date_start = $6,
           service_date_end = $7,
           primary_insurance_id = $8,
           notes = $9,
           updated_at = now()
       where id = $10 and tenant_id = $11`,
      [
        totalChargesCents,
        insuranceResponsibilityCents,
        patientResponsibilityCents,
        balanceCents,
        status,
        serviceDateStart,
        serviceDateEnd,
        context.payerId,
        notes,
        billId,
        tenantId,
      ],
    );
    await queryable.query(
      `delete from bill_line_items where bill_id = $1 and tenant_id = $2`,
      [billId, tenantId],
    );
  }

  for (const charge of charges) {
    await queryable.query(
      `insert into bill_line_items(
        id, tenant_id, bill_id, charge_id, service_date, cpt_code,
        description, quantity, unit_price_cents, total_cents, icd_codes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        crypto.randomUUID(),
        tenantId,
        billId,
        charge.id,
        charge.serviceDate,
        charge.cptCode,
        charge.description,
        charge.quantity,
        charge.feeCents,
        charge.amountCents,
        charge.icdCodes,
      ],
    );
  }

  await syncPortalBalance(queryable, tenantId, context.patientId);

  logger.info("Encounter charges linked to financials", {
    tenantId,
    encounterId,
    billId,
    totalChargesCents,
    insuranceResponsibilityCents,
    patientResponsibilityCents,
    balanceCents,
  });

  return {
    billId,
    billNumber: billNumber || null,
    totalChargesCents,
    insuranceResponsibilityCents,
    patientResponsibilityCents,
    balanceCents,
    chargeCount: charges.length,
    payerName: context.payerName,
  };
}
