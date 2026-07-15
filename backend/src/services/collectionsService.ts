import { pool } from "../db/pool";
import crypto from "crypto";

/**
 * Collections Service
 * Handles patient balance calculations, payment processing, aging reports
 */

export interface PatientBalance {
  patientId: string;
  totalBalance: number;
  currentBalance: number;
  balance31_60: number;
  balance61_90: number;
  balanceOver90: number;
  oldestChargeDate: string | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  hasPaymentPlan: boolean;
  hasAutopay: boolean;
}

export interface AgingBucket {
  current: number; // 0-30 days
  days31_60: number;
  days61_90: number;
  over90: number;
  total: number;
  patientCount: number;
}

export interface CollectionAttempt {
  id: string;
  patientId: string;
  encounterId?: string;
  attemptDate: string;
  amountDue: number;
  collectionPoint: string;
  result: string;
  amountCollected: number;
  skipReason?: string;
  notes?: string;
  attemptedBy?: string;
  attemptedByName?: string | null;
  contactMethod?: string | null;
  contactDirection?: "outbound" | "inbound";
  contactPerson?: string | null;
  outcome?: string | null;
  patientResponse?: string | null;
  staffNextStep?: string | null;
  nextFollowUpDate?: string | null;
  followUpStatus?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  patientPromisedAmount?: number | null;
  patientPromisedDate?: string | null;
  disputeStatus?: string | null;
  financialAssistanceStatus?: string | null;
  paymentPlanDiscussed?: boolean;
  financialAssistanceDiscussed?: boolean;
  contactPreferenceConfirmed?: boolean;
  doNotContact?: boolean;
}

export interface CollectionContactInput {
  patientId: string;
  encounterId?: string;
  amountDue?: number;
  amountCollected?: number;
  collectionPoint?: string;
  contactMethod: string;
  contactDirection?: "outbound" | "inbound";
  contactPerson?: string;
  outcome: string;
  notes?: string;
  patientResponse?: string;
  staffNextStep?: string;
  nextFollowUpDate?: string;
  followUpStatus?: string;
  assignedTo?: string;
  patientPromisedAmount?: number;
  patientPromisedDate?: string;
  disputeStatus?: string;
  financialAssistanceStatus?: string;
  paymentPlanDiscussed?: boolean;
  financialAssistanceDiscussed?: boolean;
  contactPreferenceConfirmed?: boolean;
  doNotContact?: boolean;
  attemptedBy?: string;
}

export interface CollectionStats {
  date: string;
  period: string;
  totalCharges: number;
  collectedAtCheckin: number;
  collectedAtCheckout: number;
  collectedViaStatement: number;
  collectedViaPortal: number;
  totalCollected: number;
  collectionRateAtService: number;
  overallCollectionRate: number;
}

/**
 * Get patient balance details
 */
export async function getPatientBalance(
  tenantId: string,
  patientId: string
): Promise<PatientBalance | null> {
  // Best effort: keep the legacy charge-derived balance current, but do not
  // block bill-based A/R lookups if an older balance function cannot run.
  try {
    await pool.query("select update_patient_balance($1, $2)", [tenantId, patientId]);
  } catch {
    // Open bills below are the current financial source of truth.
  }

  const result = await pool.query(
    `select
      patient_id as "patientId",
      total_balance as "totalBalance",
      current_balance as "currentBalance",
      balance_31_60 as "balance31_60",
      balance_61_90 as "balance61_90",
      balance_over_90 as "balanceOver90",
      oldest_charge_date as "oldestChargeDate",
      last_payment_date as "lastPaymentDate",
      last_payment_amount as "lastPaymentAmount",
      has_payment_plan as "hasPaymentPlan",
      has_autopay as "hasAutopay"
    from patient_balances
    where tenant_id = $1 and patient_id = $2`,
    [tenantId, patientId]
  );

  const legacyTotalBalance = result.rows[0]?.totalBalance;
  if (
    result.rowCount &&
    (legacyTotalBalance === undefined || Number(legacyTotalBalance || 0) > 0)
  ) {
    return result.rows[0];
  }

  const billBalanceResult = await pool.query(
    `select
      b.patient_id as "patientId",
      coalesce(sum(b.balance_cents), 0) / 100.0 as "totalBalance",
      coalesce(sum(case
        when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) <= 30
        then b.balance_cents else 0 end), 0) / 100.0 as "currentBalance",
      coalesce(sum(case
        when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) between 31 and 60
        then b.balance_cents else 0 end), 0) / 100.0 as "balance31_60",
      coalesce(sum(case
        when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) between 61 and 90
        then b.balance_cents else 0 end), 0) / 100.0 as "balance61_90",
      coalesce(sum(case
        when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) > 90
        then b.balance_cents else 0 end), 0) / 100.0 as "balanceOver90",
      min(coalesce(b.service_date_start, b.bill_date, b.due_date)) as "oldestChargeDate",
      last_payment.payment_date as "lastPaymentDate",
      last_payment.amount_cents / 100.0 as "lastPaymentAmount",
      false as "hasPaymentPlan",
      false as "hasAutopay"
    from bills b
    left join lateral (
      select pp.payment_date, pp.amount_cents
      from patient_payments pp
      where pp.tenant_id = b.tenant_id
        and pp.patient_id = b.patient_id
        and pp.status = 'posted'
      order by pp.payment_date desc
      limit 1
    ) last_payment on true
    where b.tenant_id = $1
      and b.patient_id = $2
      and coalesce(b.balance_cents, 0) > 0
      and coalesce(b.status, 'open') not in ('paid', 'written_off', 'cancelled', 'void', 'voided')
    group by b.patient_id, last_payment.payment_date, last_payment.amount_cents`,
    [tenantId, patientId]
  );

  if (!billBalanceResult.rowCount || Number(billBalanceResult.rows[0].totalBalance || 0) <= 0) {
    return result.rowCount ? result.rows[0] : null;
  }

  return billBalanceResult.rows[0];
}

/**
 * Calculate estimated patient responsibility for upcoming visit
 */
export async function calculateEstimate(
  tenantId: string,
  patientId: string,
  cptCodes: string[],
  appointmentId?: string
): Promise<{
  estimatedTotal: number;
  breakdown: {
    totalCharges: number;
    insurancePays: number;
    patientResponsibility: number;
    copay: number;
    deductible: number;
    coinsurance: number;
  };
}> {
  // Get patient's insurance info
  const patientResult = await pool.query(
    `select
      insurance_id,
      insurance_name,
      insurance_copay,
      insurance_deductible,
      insurance_coinsurance_percent
    from patients
    where id = $1 and tenant_id = $2`,
    [patientId, tenantId]
  );

  if (!patientResult.rowCount) {
    throw new Error("Patient not found");
  }

  const patient = patientResult.rows[0];

  // Get fee schedule for CPT codes
  let totalCharges = 0;
  for (const cptCode of cptCodes) {
    const feeResult = await pool.query(
      `select fee_cents
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
         and fs.is_default = true
         and fsi.cpt_code = $2
       limit 1`,
      [tenantId, cptCode]
    );

    if (feeResult.rowCount) {
      totalCharges += feeResult.rows[0].fee_cents / 100;
    }
  }

  // Calculate patient responsibility
  const copay = patient.insurance_copay || 0;
  const deductible = patient.insurance_deductible || 0;
  const coinsurancePercent = patient.insurance_coinsurance_percent || 0;

  // Simple calculation (in production, this would be more sophisticated)
  let patientResponsibility = copay;

  // Add deductible portion
  const afterCopay = totalCharges - copay;
  const deductiblePortion = Math.min(afterCopay, deductible);
  patientResponsibility += deductiblePortion;

  // Add coinsurance on remaining
  const afterDeductible = afterCopay - deductiblePortion;
  const coinsurance = afterDeductible * (coinsurancePercent / 100);
  patientResponsibility += coinsurance;

  const insurancePays = totalCharges - patientResponsibility;

  return {
    estimatedTotal: patientResponsibility,
    breakdown: {
      totalCharges,
      insurancePays,
      patientResponsibility,
      copay,
      deductible: deductiblePortion,
      coinsurance,
    },
  };
}

/**
 * Process a payment
 */
export async function processPayment(
  tenantId: string,
  patientId: string,
  amount: number,
  paymentMethod: string,
  options: {
    encounterId?: string;
    collectionPoint?: string;
    cardLastFour?: string;
    checkNumber?: string;
    referenceNumber?: string;
    collectedBy?: string;
    notes?: string;
  }
): Promise<{ paymentId: string; receiptNumber: string }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentId = crypto.randomUUID();

    // Generate receipt number
    const receiptResult = await client.query(
      `select count(*) as count from patient_payments where tenant_id = $1`,
      [tenantId]
    );
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(
      parseInt(receiptResult.rows[0].count) + 1
    ).padStart(6, "0")}`;

    // Insert payment
    const amountCents = Math.round(amount * 100);
    const dbPaymentMethod = normalizePaymentMethod(paymentMethod);
    await client.query(
      `insert into patient_payments (
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, card_last_four, check_number, reference_number,
        receipt_number, status, notes, encounter_id, collection_point,
        collected_by, processed_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
      [
        paymentId,
        tenantId,
        patientId,
        new Date().toISOString().split("T")[0],
        amountCents,
        dbPaymentMethod,
        options.cardLastFour || null,
        options.checkNumber || null,
        options.referenceNumber || null,
        receiptNumber,
        "posted",
        options.notes || null,
        options.encounterId || null,
        options.collectionPoint || "other",
        options.collectedBy || null,
      ]
    );

    // Update patient balance
    await client.query("select update_patient_balance($1, $2)", [tenantId, patientId]);

    await client.query("COMMIT");

    return { paymentId, receiptNumber };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Record a collection attempt
 */
export async function recordCollectionAttempt(
  tenantId: string,
  attempt: {
    patientId: string;
    encounterId?: string;
    amountDue?: number;
    collectionPoint: string;
    result?: string;
    amountCollected?: number;
    skipReason?: string;
    notes?: string;
    talkingPointsUsed?: string;
    attemptedBy?: string;
    contactMethod?: string;
    contactDirection?: "outbound" | "inbound";
    contactPerson?: string;
    outcome?: string;
    patientResponse?: string;
    staffNextStep?: string;
    nextFollowUpDate?: string;
    followUpStatus?: string;
    assignedTo?: string;
    patientPromisedAmount?: number;
    patientPromisedDate?: string;
    disputeStatus?: string;
    financialAssistanceStatus?: string;
    paymentPlanDiscussed?: boolean;
    financialAssistanceDiscussed?: boolean;
    contactPreferenceConfirmed?: boolean;
    doNotContact?: boolean;
  }
): Promise<string> {
  const attemptId = crypto.randomUUID();
  const result = attempt.result || attempt.outcome || "skipped";
  const contactMethod = attempt.contactMethod || attempt.collectionPoint;
  const followUpStatus = attempt.doNotContact
    ? "do_not_contact"
    : attempt.followUpStatus || (attempt.nextFollowUpDate ? "scheduled" : "open");

  await pool.query(
    `insert into collection_attempts (
      id, tenant_id, patient_id, encounter_id, attempt_date,
      amount_due, collection_point, result, amount_collected,
      skip_reason, notes, talking_points_used, attempted_by,
      contact_method, contact_direction, contact_person, outcome,
      patient_response, staff_next_step, next_follow_up_date, follow_up_status,
      assigned_to, patient_promised_amount, patient_promised_date, dispute_status,
      financial_assistance_status, payment_plan_discussed, financial_assistance_discussed,
      contact_preference_confirmed, do_not_contact
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27, $28,
      $29, $30
    )`,
    [
      attemptId,
      tenantId,
      attempt.patientId,
      attempt.encounterId || null,
      new Date(),
      attempt.amountDue || 0,
      normalizeCollectionPoint(attempt.collectionPoint),
      result,
      attempt.amountCollected || 0,
      attempt.skipReason || null,
      attempt.notes || null,
      attempt.talkingPointsUsed || null,
      attempt.attemptedBy || null,
      normalizeContactMethod(contactMethod),
      attempt.contactDirection || "outbound",
      attempt.contactPerson || null,
      attempt.outcome || result,
      attempt.patientResponse || null,
      attempt.staffNextStep || null,
      attempt.nextFollowUpDate || null,
      followUpStatus,
      attempt.assignedTo || attempt.attemptedBy || null,
      attempt.patientPromisedAmount ?? null,
      attempt.patientPromisedDate || null,
      attempt.disputeStatus || null,
      attempt.financialAssistanceStatus || null,
      attempt.paymentPlanDiscussed || false,
      attempt.financialAssistanceDiscussed || false,
      attempt.contactPreferenceConfirmed || false,
      attempt.doNotContact || false,
    ]
  );

  await pool.query(
    `update patient_balances
     set last_collection_attempt_date = current_date,
         is_in_collections = case
           when $3 = 'resolved' then false
           when total_balance > 0 then true
           else is_in_collections
         end,
         updated_at = now()
     where tenant_id = $1 and patient_id = $2`,
    [tenantId, attempt.patientId, result]
  );

  return attemptId;
}

/**
 * Get aging report
 */
export async function getAgingReport(tenantId: string): Promise<{
  buckets: AgingBucket;
  patients: Array<{
    patientId: string;
    patientName: string;
    totalBalance: number;
    currentBalance: number;
    balance31_60: number;
    balance61_90: number;
    balanceOver90: number;
    oldestChargeDate: string | null;
    collectionAttemptCount: number;
    lastCollectionAttemptDate: string | null;
    lastContactMethod: string | null;
    lastContactOutcome: string | null;
    lastCollectionNotes: string | null;
    lastPatientResponse: string | null;
    nextFollowUpDate: string | null;
    followUpStatus: string | null;
    assignedTo: string | null;
    assignedToName: string | null;
    doNotContact: boolean;
    disputeStatus: string | null;
    financialAssistanceStatus: string | null;
  }>;
}> {
  const arSourceCte = `
    with bill_source as (
      select
        b.tenant_id,
        b.patient_id,
        coalesce(sum(case
          when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) <= 30
          then b.balance_cents else 0 end), 0) / 100.0 as current_balance,
        coalesce(sum(case
          when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) between 31 and 60
          then b.balance_cents else 0 end), 0) / 100.0 as balance_31_60,
        coalesce(sum(case
          when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) between 61 and 90
          then b.balance_cents else 0 end), 0) / 100.0 as balance_61_90,
        coalesce(sum(case
          when current_date - coalesce(b.due_date, b.bill_date, b.service_date_start, current_date) > 90
          then b.balance_cents else 0 end), 0) / 100.0 as balance_over_90,
        coalesce(sum(b.balance_cents), 0) / 100.0 as total_balance,
        min(coalesce(b.service_date_start, b.bill_date, b.due_date)) as oldest_charge_date
      from bills b
      where b.tenant_id = $1
        and coalesce(b.balance_cents, 0) > 0
        and coalesce(b.status, 'open') not in ('paid', 'written_off', 'cancelled', 'void', 'voided')
      group by b.tenant_id, b.patient_id
    ),
    legacy_source as (
      select
        pb.tenant_id,
        pb.patient_id,
        pb.current_balance,
        pb.balance_31_60,
        pb.balance_61_90,
        pb.balance_over_90,
        pb.total_balance,
        pb.oldest_charge_date
      from patient_balances pb
      where pb.tenant_id = $1
        and pb.total_balance > 0
        and not exists (
          select 1
          from bill_source bs
          where bs.tenant_id = pb.tenant_id
            and bs.patient_id = pb.patient_id
        )
    ),
    ar_source as (
      select * from bill_source
      union all
      select * from legacy_source
    )
  `;

  // Get aggregate buckets from open patient bills, falling back to legacy balances
  // only when that patient has no open bills.
  const bucketResult = await pool.query(
    `${arSourceCte}
    select
      coalesce(sum(current_balance), 0) as current,
      coalesce(sum(balance_31_60), 0) as "days31_60",
      coalesce(sum(balance_61_90), 0) as "days61_90",
      coalesce(sum(balance_over_90), 0) as "over90",
      coalesce(sum(total_balance), 0) as total,
      count(*)::int as "patientCount"
    from ar_source
    where total_balance > 0`,
    [tenantId]
  );

  // Get individual patients with balances and latest follow-up metadata.
  const patientsResult = await pool.query(
    `${arSourceCte}
    select
      ars.patient_id as "patientId",
      p.first_name || ' ' || p.last_name as "patientName",
      ars.total_balance as "totalBalance",
      ars.current_balance as "currentBalance",
      ars.balance_31_60 as "balance31_60",
      ars.balance_61_90 as "balance61_90",
      ars.balance_over_90 as "balanceOver90",
      ars.oldest_charge_date as "oldestChargeDate",
      coalesce(attempt_counts.attempt_count, 0)::int as "collectionAttemptCount",
      latest.attempt_date as "lastCollectionAttemptDate",
      latest.contact_method as "lastContactMethod",
      coalesce(latest.outcome, latest.result) as "lastContactOutcome",
      latest.notes as "lastCollectionNotes",
      latest.patient_response as "lastPatientResponse",
      latest.next_follow_up_date as "nextFollowUpDate",
      latest.follow_up_status as "followUpStatus",
      latest.assigned_to as "assignedTo",
      assigned_user.full_name as "assignedToName",
      coalesce(latest.do_not_contact, false) as "doNotContact",
      latest.dispute_status as "disputeStatus",
      latest.financial_assistance_status as "financialAssistanceStatus"
    from ar_source ars
    join patients p on p.id = ars.patient_id
      and p.tenant_id = ars.tenant_id
    left join lateral (
      select count(*) as attempt_count
      from collection_attempts ca
      where ca.tenant_id = ars.tenant_id
        and ca.patient_id = ars.patient_id
    ) attempt_counts on true
    left join lateral (
      select
        ca.attempt_date,
        ca.contact_method,
        ca.outcome,
        ca.result,
        ca.notes,
        ca.patient_response,
        ca.next_follow_up_date,
        ca.follow_up_status,
        ca.assigned_to,
        ca.do_not_contact,
        ca.dispute_status,
        ca.financial_assistance_status
      from collection_attempts ca
      where ca.tenant_id = ars.tenant_id
        and ca.patient_id = ars.patient_id
      order by ca.attempt_date desc, ca.created_at desc
      limit 1
    ) latest on true
    left join users assigned_user
      on assigned_user.id = latest.assigned_to
      and assigned_user.tenant_id = ars.tenant_id
    where ars.total_balance > 0
    order by
      case
        when latest.next_follow_up_date is not null
         and latest.next_follow_up_date <= current_date
         and coalesce(latest.follow_up_status, 'open') in ('open', 'scheduled')
        then 0
        else 1
      end,
      ars.balance_over_90 desc,
      ars.total_balance desc`,
    [tenantId]
  );

  return {
    buckets: bucketResult.rows[0] || {
      current: 0,
      days31_60: 0,
      days61_90: 0,
      over90: 0,
      total: 0,
      patientCount: 0,
    },
    patients: patientsResult.rows,
  };
}

export async function getPatientCollectionActivity(
  tenantId: string,
  patientId: string
): Promise<{
  balance: PatientBalance | null;
  attempts: CollectionAttempt[];
}> {
  const balance = await getPatientBalance(tenantId, patientId);
  const attemptsResult = await pool.query(
    `select
      ca.id,
      ca.patient_id as "patientId",
      ca.encounter_id as "encounterId",
      ca.attempt_date as "attemptDate",
      ca.amount_due as "amountDue",
      ca.collection_point as "collectionPoint",
      ca.result,
      ca.amount_collected as "amountCollected",
      ca.skip_reason as "skipReason",
      ca.notes,
      ca.attempted_by as "attemptedBy",
      attempted_user.full_name as "attemptedByName",
      ca.contact_method as "contactMethod",
      ca.contact_direction as "contactDirection",
      ca.contact_person as "contactPerson",
      ca.outcome,
      ca.patient_response as "patientResponse",
      ca.staff_next_step as "staffNextStep",
      ca.next_follow_up_date as "nextFollowUpDate",
      ca.follow_up_status as "followUpStatus",
      ca.assigned_to as "assignedTo",
      assigned_user.full_name as "assignedToName",
      ca.patient_promised_amount as "patientPromisedAmount",
      ca.patient_promised_date as "patientPromisedDate",
      ca.dispute_status as "disputeStatus",
      ca.financial_assistance_status as "financialAssistanceStatus",
      ca.payment_plan_discussed as "paymentPlanDiscussed",
      ca.financial_assistance_discussed as "financialAssistanceDiscussed",
      ca.contact_preference_confirmed as "contactPreferenceConfirmed",
      ca.do_not_contact as "doNotContact"
    from collection_attempts ca
    left join users attempted_user
      on attempted_user.id = ca.attempted_by
      and attempted_user.tenant_id = ca.tenant_id
    left join users assigned_user
      on assigned_user.id = ca.assigned_to
      and assigned_user.tenant_id = ca.tenant_id
    where ca.tenant_id = $1
      and ca.patient_id = $2
    order by ca.attempt_date desc, ca.created_at desc
    limit 100`,
    [tenantId, patientId]
  );

  return {
    balance,
    attempts: attemptsResult.rows,
  };
}

export async function createCollectionContactAttempt(
  tenantId: string,
  input: CollectionContactInput
): Promise<string> {
  return recordCollectionAttempt(tenantId, {
    patientId: input.patientId,
    encounterId: input.encounterId,
    amountDue: input.amountDue || 0,
    amountCollected: input.amountCollected || 0,
    collectionPoint: normalizeCollectionPoint(input.collectionPoint || input.contactMethod),
    result: input.outcome,
    contactMethod: input.contactMethod,
    contactDirection: input.contactDirection || "outbound",
    contactPerson: input.contactPerson,
    outcome: input.outcome,
    notes: input.notes,
    patientResponse: input.patientResponse,
    staffNextStep: input.staffNextStep,
    nextFollowUpDate: input.nextFollowUpDate,
    followUpStatus: input.followUpStatus,
    assignedTo: input.assignedTo,
    patientPromisedAmount: input.patientPromisedAmount,
    patientPromisedDate: input.patientPromisedDate,
    disputeStatus: input.disputeStatus,
    financialAssistanceStatus: input.financialAssistanceStatus,
    paymentPlanDiscussed: input.paymentPlanDiscussed,
    financialAssistanceDiscussed: input.financialAssistanceDiscussed,
    contactPreferenceConfirmed: input.contactPreferenceConfirmed,
    doNotContact: input.doNotContact,
    attemptedBy: input.attemptedBy,
  });
}

/**
 * Get collection statistics for a date range
 */
export async function getCollectionStats(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<CollectionStats[]> {
  const result = await pool.query(
    `select
      stat_date as date,
      stat_period as period,
      total_charges_cents / 100.0 as "totalCharges",
      collected_at_checkin_cents / 100.0 as "collectedAtCheckin",
      collected_at_checkout_cents / 100.0 as "collectedAtCheckout",
      collected_via_statement_cents / 100.0 as "collectedViaStatement",
      collected_via_portal_cents / 100.0 as "collectedViaPortal",
      total_collected_cents / 100.0 as "totalCollected",
      collection_rate_at_service as "collectionRateAtService",
      overall_collection_rate as "overallCollectionRate"
    from collection_stats
    where tenant_id = $1
      and stat_date >= $2
      and stat_date <= $3
      and stat_period = 'day'
    order by stat_date`,
    [tenantId, startDate, endDate]
  );

  return result.rows;
}

/**
 * Update daily collection statistics
 */
export async function updateCollectionStats(
  tenantId: string,
  date: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Calculate stats for the day
    const statsResult = await client.query(
      `select
        coalesce(sum(c.amount_cents), 0) as total_charges,
        coalesce(sum(case when pp.collection_point = 'check_in' then pp.amount_cents else 0 end), 0) as collected_checkin,
        coalesce(sum(case when pp.collection_point = 'check_out' then pp.amount_cents else 0 end), 0) as collected_checkout,
        coalesce(sum(case when pp.collection_point = 'statement' then pp.amount_cents else 0 end), 0) as collected_statement,
        coalesce(sum(case when pp.collection_point = 'portal' then pp.amount_cents else 0 end), 0) as collected_portal,
        coalesce(sum(pp.amount_cents), 0) as total_collected
      from charges c
      left join patient_payments pp on pp.encounter_id = c.encounter_id
        and pp.tenant_id = c.tenant_id
        and pp.payment_date = $2
      where c.tenant_id = $1
        and c.service_date = $2`,
      [tenantId, date]
    );

    const stats = statsResult.rows[0];
    const totalCharges = parseInt(stats.total_charges);
    const totalCollected = parseInt(stats.total_collected);
    const collectedAtService =
      parseInt(stats.collected_checkin) + parseInt(stats.collected_checkout);

    const collectionRateAtService =
      totalCharges > 0 ? (collectedAtService / totalCharges) * 100 : 0;
    const overallCollectionRate =
      totalCharges > 0 ? (totalCollected / totalCharges) * 100 : 0;

    // Upsert stats
    await client.query(
      `insert into collection_stats (
        id, tenant_id, stat_date, stat_period,
        total_charges_cents, collected_at_checkin_cents, collected_at_checkout_cents,
        collected_via_statement_cents, collected_via_portal_cents, total_collected_cents,
        collection_rate_at_service, overall_collection_rate
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (tenant_id, stat_date, stat_period) do update set
        total_charges_cents = excluded.total_charges_cents,
        collected_at_checkin_cents = excluded.collected_at_checkin_cents,
        collected_at_checkout_cents = excluded.collected_at_checkout_cents,
        collected_via_statement_cents = excluded.collected_via_statement_cents,
        collected_via_portal_cents = excluded.collected_via_portal_cents,
        total_collected_cents = excluded.total_collected_cents,
        collection_rate_at_service = excluded.collection_rate_at_service,
        overall_collection_rate = excluded.overall_collection_rate,
        updated_at = now()`,
      [
        crypto.randomUUID(),
        tenantId,
        date,
        "day",
        totalCharges,
        stats.collected_checkin,
        stats.collected_checkout,
        stats.collected_statement,
        stats.collected_portal,
        totalCollected,
        collectionRateAtService,
        overallCollectionRate,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get collection talking points based on balance age
 */
export function getCollectionTalkingPoints(
  balance: PatientBalance
): {
  script: string;
  tips: string[];
} {
  const ageInDays = balance.oldestChargeDate
    ? Math.floor(
        (Date.now() - new Date(balance.oldestChargeDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  if (ageInDays <= 30) {
    return {
      script:
        "Hi [Patient Name], I see you have a balance of $[Amount] from your recent visit. Would you like to take care of that today?",
      tips: [
        "Friendly and matter-of-fact",
        "Assume they want to pay",
        "Offer payment plan if over $200",
      ],
    };
  } else if (ageInDays <= 60) {
    return {
      script:
        "[Patient Name], you have an outstanding balance of $[Amount] from [Date]. We'd really appreciate if you could take care of this today.",
      tips: [
        "More direct tone",
        "Mention age of balance",
        "Strongly recommend payment plan",
      ],
    };
  } else if (ageInDays <= 90) {
    return {
      script:
        "[Patient Name], you have a balance of $[Amount] that's now over 60 days old. Our policy requires payment today before we can proceed with your visit. How would you like to handle this?",
      tips: [
        "Firm but professional",
        "Policy-based approach",
        "Payment required before service",
        "Offer payment plan or partial payment",
      ],
    };
  } else {
    return {
      script:
        "[Patient Name], you have a seriously overdue balance of $[Amount] from over 90 days ago. We need to collect this balance today. Can you pay in full, or would you like to set up a payment plan?",
      tips: [
        "Very firm, professional tone",
        "Do not provide service without payment/plan",
        "May require manager approval to proceed",
        "Consider collections agency referral if no resolution",
      ],
    };
  }
}

function normalizeCollectionPoint(collectionPoint?: string): string {
  switch (collectionPoint) {
    case "check_in":
    case "check_out":
    case "phone":
    case "statement":
    case "portal":
    case "text":
    case "other":
      return collectionPoint;
    case "email":
    case "mail":
    case "in_person":
      return "other";
    default:
      return "other";
  }
}

function normalizeContactMethod(contactMethod?: string): string {
  switch (contactMethod) {
    case "phone":
    case "text":
    case "email":
    case "mail":
    case "portal":
    case "in_person":
    case "statement":
    case "check_in":
    case "check_out":
    case "other":
      return contactMethod;
    default:
      return "other";
  }
}

function normalizePaymentMethod(paymentMethod: string): string {
  switch (paymentMethod) {
    case "card":
      return "credit";
    case "hsa":
      return "other";
    default:
      return paymentMethod;
  }
}
