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
  // First, update the balance to ensure it's current
  await pool.query("select update_patient_balance($1, $2)", [tenantId, patientId]);

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

  if (!result.rowCount) return null;

  return result.rows[0];
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
        paymentMethod,
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
    amountDue: number;
    collectionPoint: string;
    result: string;
    amountCollected?: number;
    skipReason?: string;
    notes?: string;
    talkingPointsUsed?: string;
    attemptedBy?: string;
  }
): Promise<string> {
  const attemptId = crypto.randomUUID();

  await pool.query(
    `insert into collection_attempts (
      id, tenant_id, patient_id, encounter_id, attempt_date,
      amount_due, collection_point, result, amount_collected,
      skip_reason, notes, talking_points_used, attempted_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      attemptId,
      tenantId,
      attempt.patientId,
      attempt.encounterId || null,
      new Date(),
      attempt.amountDue,
      attempt.collectionPoint,
      attempt.result,
      attempt.amountCollected || 0,
      attempt.skipReason || null,
      attempt.notes || null,
      attempt.talkingPointsUsed || null,
      attempt.attemptedBy || null,
    ]
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
  }>;
}> {
  // Update all patient balances first
  await pool.query(
    `select update_patient_balance(tenant_id, patient_id)
     from patients
     where tenant_id = $1`,
    [tenantId]
  );

  // Get aggregate buckets
  const bucketResult = await pool.query(
    `select
      coalesce(sum(current_balance), 0) as current,
      coalesce(sum(balance_31_60), 0) as "days31_60",
      coalesce(sum(balance_61_90), 0) as "days61_90",
      coalesce(sum(balance_over_90), 0) as "over90",
      coalesce(sum(total_balance), 0) as total,
      count(*) as "patientCount"
    from patient_balances
    where tenant_id = $1 and total_balance > 0`,
    [tenantId]
  );

  // Get individual patients with balances
  const patientsResult = await pool.query(
    `select
      pb.patient_id as "patientId",
      p.first_name || ' ' || p.last_name as "patientName",
      pb.total_balance as "totalBalance",
      pb.current_balance as "currentBalance",
      pb.balance_31_60 as "balance31_60",
      pb.balance_61_90 as "balance61_90",
      pb.balance_over_90 as "balanceOver90",
      pb.oldest_charge_date as "oldestChargeDate"
    from patient_balances pb
    join patients p on p.id = pb.patient_id
    where pb.tenant_id = $1 and pb.total_balance > 0
    order by pb.balance_over_90 desc, pb.total_balance desc`,
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
