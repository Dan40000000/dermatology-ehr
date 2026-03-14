import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import { getFinancialSnapshots } from "../services/financialSnapshotService";

export const financialMetricsRouter = Router();
const LATE_FEE_NOTE_PREFIX = "[LATE_FEE]";
type TrendGranularity = "day" | "week" | "month";

type TrendPoint = {
  bucketStartDate: string;
  bucketEndDate: string;
  paymentsCollectedCents: number;
  revenueEarnedCents: number;
  patientPaymentsCents: number;
  payerPaymentsCents: number;
  paymentCount: number;
  billCount: number;
};

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logFinancialMetricsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDateOrNull(value: unknown): string | null {
  if (!isIsoDate(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return value;
}

function addDays(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toIsoDate(parsed);
}

function bucketDate(isoDate: string, granularity: TrendGranularity): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (granularity === "month") {
    parsed.setUTCDate(1);
    return toIsoDate(parsed);
  }

  if (granularity === "week") {
    const day = parsed.getUTCDay(); // 0=Sun, 1=Mon
    const offset = day === 0 ? -6 : 1 - day;
    parsed.setUTCDate(parsed.getUTCDate() + offset);
    return toIsoDate(parsed);
  }

  return isoDate;
}

// Get financial dashboard metrics
financialMetricsRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { date } = req.query;

  const referenceDate = date ? new Date(String(date)) : new Date();
  const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

  try {
    const snapshots = await getFinancialSnapshots(tenantId);

    // Get new bills count (created this month, status = 'new')
    const newBillsResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and status = 'new'
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    // Get in progress bills count (status = 'in_progress' or 'submitted')
    const inProgressBillsResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and status in ('in_progress', 'submitted', 'pending_payment')`,
      [tenantId],
    );

    // Get outstanding amount (total balance_cents for all non-paid bills)
    const outstandingResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and status not in ('paid', 'written_off', 'cancelled')
         and balance_cents > 0`,
      [tenantId],
    );

    // Get payments this month (patient + payer payments)
    const patientPaymentsResult = await pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const payerPaymentsResult = await pool.query(
      `select coalesce(sum(applied_amount_cents), 0) as total
       from payer_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const paymentsThisMonth = parseInt(patientPaymentsResult.rows[0].total) + parseInt(payerPaymentsResult.rows[0].total);

    // A/R Aging buckets
    const today = new Date().toISOString().split('T')[0];
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const arCurrentResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date >= $2`,
      [tenantId, date30],
    );

    const ar3060Result = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2
         and bill_date >= $3`,
      [tenantId, date30, date60],
    );

    const ar6090Result = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2
         and bill_date >= $3`,
      [tenantId, date60, date90],
    );

    const ar90PlusResult = await pool.query(
      `select coalesce(sum(balance_cents), 0) as total
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')
         and bill_date < $2`,
      [tenantId, date90],
    );

    // Get overdue count
    const overdueResult = await pool.query(
      `select count(*) as count
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status = 'overdue'`,
      [tenantId],
    );

    // Get collection rate for the month
    const chargesThisMonthResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]],
    );

    const chargesThisMonth = parseInt(chargesThisMonthResult.rows[0].total);
    const lateFeesThisMonthResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1
         and bill_date >= $2
         and bill_date <= $3
         and notes like $4`,
      [tenantId, firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0], `%${LATE_FEE_NOTE_PREFIX}%`],
    );
    const lateFeesThisMonth = parseInt(lateFeesThisMonthResult.rows[0].total);
    const collectionRate = chargesThisMonth > 0 ? Math.round((paymentsThisMonth / chargesThisMonth) * 100) : 0;

    res.json({
      metrics: {
        newBillsCount: parseInt(newBillsResult.rows[0].count),
        inProgressBillsCount: parseInt(inProgressBillsResult.rows[0].count),
        outstandingAmountCents: parseInt(outstandingResult.rows[0].total),
        paymentsThisMonthCents: paymentsThisMonth,
        paymentsCollectedTodayCents: snapshots.daily.collectionsCents,
        revenueEarnedTodayCents: snapshots.daily.totalRevenueCents,
        lateFeesThisMonthCents: lateFeesThisMonth,
        overdueCount: parseInt(overdueResult.rows[0].count),
        collectionRate: snapshots.daily.collectionRate || collectionRate,
        arAging: {
          currentCents: parseInt(arCurrentResult.rows[0].total),
          days3060Cents: parseInt(ar3060Result.rows[0].total),
          days6090Cents: parseInt(ar6090Result.rows[0].total),
          days90PlusCents: parseInt(ar90PlusResult.rows[0].total),
        },
      },
      snapshots,
      period: {
        startDate: firstDayOfMonth.toISOString().split('T')[0],
        endDate: lastDayOfMonth.toISOString().split('T')[0],
      },
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching financial metrics', error);
    res.status(500).json({ error: 'Failed to fetch financial metrics' });
  }
});

// Get collections and earned revenue trend for an arbitrary history window.
financialMetricsRouter.get("/collections-trend", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const granularityParam = req.query.granularity;
  const granularity: TrendGranularity =
    granularityParam === "week" || granularityParam === "month" ? granularityParam : "day";

  const endDate =
    parseIsoDateOrNull(req.query.endDate) ||
    toIsoDate(new Date());
  const startDate =
    parseIsoDateOrNull(req.query.startDate) ||
    addDays(endDate, -29);

  if (startDate > endDate) {
    return res.status(400).json({ error: "startDate must be on or before endDate" });
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const daySpan = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (daySpan > 730) {
    return res.status(400).json({ error: "Date range too large. Maximum is 730 days." });
  }

  try {
    const trendResult = await pool.query(
      `with days as (
         select generate_series($2::date, $3::date, interval '1 day')::date as day
       ),
       patient as (
         select
           payment_date::date as day,
           coalesce(sum(amount_cents), 0) as patient_payments_cents,
           count(*) as patient_payment_count
         from patient_payments
         where tenant_id = $1
           and status = 'posted'
           and payment_date >= $2
           and payment_date <= $3
         group by payment_date::date
       ),
       payer as (
         select
           payment_date::date as day,
           coalesce(sum(applied_amount_cents), 0) as payer_payments_cents,
           count(*) as payer_payment_count
         from payer_payments
         where tenant_id = $1
           and payment_date >= $2
           and payment_date <= $3
         group by payment_date::date
       ),
       revenue as (
         select
           bill_date::date as day,
           coalesce(sum(total_charges_cents), 0) as revenue_earned_cents,
           count(*) as bill_count
         from bills
         where tenant_id = $1
           and bill_date >= $2
           and bill_date <= $3
         group by bill_date::date
       )
       select
         d.day::text as date,
         coalesce(p.patient_payments_cents, 0) as patient_payments_cents,
         coalesce(py.payer_payments_cents, 0) as payer_payments_cents,
         (coalesce(p.patient_payments_cents, 0) + coalesce(py.payer_payments_cents, 0)) as payments_collected_cents,
         coalesce(r.revenue_earned_cents, 0) as revenue_earned_cents,
         (coalesce(p.patient_payment_count, 0) + coalesce(py.payer_payment_count, 0)) as payment_count,
         coalesce(r.bill_count, 0) as bill_count
       from days d
       left join patient p on p.day = d.day
       left join payer py on py.day = d.day
       left join revenue r on r.day = d.day
       order by d.day asc`,
      [tenantId, startDate, endDate],
    );

    const dailyPoints: TrendPoint[] = trendResult.rows.map((row: any) => ({
      bucketStartDate: row.date,
      bucketEndDate: row.date,
      paymentsCollectedCents: Number(row.payments_collected_cents || 0),
      revenueEarnedCents: Number(row.revenue_earned_cents || 0),
      patientPaymentsCents: Number(row.patient_payments_cents || 0),
      payerPaymentsCents: Number(row.payer_payments_cents || 0),
      paymentCount: Number(row.payment_count || 0),
      billCount: Number(row.bill_count || 0),
    }));

    let trendData: TrendPoint[] = dailyPoints;
    if (granularity !== "day") {
      const bucketed = new Map<string, TrendPoint>();

      dailyPoints.forEach((point) => {
        const key = bucketDate(point.bucketStartDate, granularity);
        const existing = bucketed.get(key);
        if (!existing) {
          bucketed.set(key, { ...point, bucketStartDate: key, bucketEndDate: point.bucketEndDate });
          return;
        }

        existing.bucketEndDate = point.bucketEndDate;
        existing.paymentsCollectedCents += point.paymentsCollectedCents;
        existing.revenueEarnedCents += point.revenueEarnedCents;
        existing.patientPaymentsCents += point.patientPaymentsCents;
        existing.payerPaymentsCents += point.payerPaymentsCents;
        existing.paymentCount += point.paymentCount;
        existing.billCount += point.billCount;
      });

      trendData = Array.from(bucketed.values()).sort((a, b) => a.bucketStartDate.localeCompare(b.bucketStartDate));
    }

    const summary = dailyPoints.reduce(
      (acc, point) => {
        acc.totalPaymentsCollectedCents += point.paymentsCollectedCents;
        acc.totalRevenueEarnedCents += point.revenueEarnedCents;
        acc.totalPatientPaymentsCents += point.patientPaymentsCents;
        acc.totalPayerPaymentsCents += point.payerPaymentsCents;
        acc.totalPaymentCount += point.paymentCount;
        acc.totalBillCount += point.billCount;
        return acc;
      },
      {
        totalPaymentsCollectedCents: 0,
        totalRevenueEarnedCents: 0,
        totalPatientPaymentsCents: 0,
        totalPayerPaymentsCents: 0,
        totalPaymentCount: 0,
        totalBillCount: 0,
      },
    );

    const collectionRate =
      summary.totalRevenueEarnedCents > 0
        ? Math.round((summary.totalPaymentsCollectedCents / summary.totalRevenueEarnedCents) * 100)
        : 0;

    res.json({
      data: trendData,
      summary: {
        ...summary,
        dayCount: daySpan,
        avgDailyPaymentsCollectedCents: daySpan > 0 ? Math.round(summary.totalPaymentsCollectedCents / daySpan) : 0,
        avgDailyRevenueEarnedCents: daySpan > 0 ? Math.round(summary.totalRevenueEarnedCents / daySpan) : 0,
        collectionRate,
      },
      period: {
        startDate,
        endDate,
        granularity,
      },
    });
  } catch (error: any) {
    logFinancialMetricsError("Error fetching collections trend", error);
    res.status(500).json({ error: "Failed to fetch collections trend" });
  }
});

// Get payments summary
financialMetricsRouter.get("/payments-summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  const parsedStartDate = parseIsoDateOrNull(startDate);
  const parsedEndDate = parseIsoDateOrNull(endDate);

  if (!parsedStartDate || !parsedEndDate) {
    return res.status(400).json({ error: "startDate and endDate must be valid ISO dates (YYYY-MM-DD)" });
  }

  if (parsedStartDate > parsedEndDate) {
    return res.status(400).json({ error: "startDate must be on or before endDate" });
  }

  try {
    // Patient payments by method (posted cash actually collected)
    const patientPaymentsByMethodResult = await pool.query(
      `select payment_method as "paymentMethod",
              count(*) as count,
              coalesce(sum(amount_cents), 0) as "totalCents"
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= $2
         and payment_date <= $3
       group by payment_method
       order by "totalCents" desc`,
      [tenantId, parsedStartDate, parsedEndDate],
    );

    // Payer payment summary
    const payerPaymentsSummaryResult = await pool.query(
      `select count(*) as count,
              coalesce(sum(total_amount_cents), 0) as "totalCents",
              coalesce(sum(applied_amount_cents), 0) as "appliedCents",
              coalesce(sum(unapplied_amount_cents), 0) as "unappliedCents"
       from payer_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, parsedStartDate, parsedEndDate],
    );

    // Patient payment status summary (posted, pending, refunded, voided)
    const patientPaymentsByStatusResult = await pool.query(
      `select status,
              count(*) as count,
              coalesce(sum(amount_cents), 0) as "totalCents"
       from patient_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3
       group by status
       order by status asc`,
      [tenantId, parsedStartDate, parsedEndDate],
    );

    // A/R and bill charges context for payment performance
    const receivablesSummaryResult = await pool.query(
      `select
          coalesce(sum(case when status not in ('paid', 'written_off', 'cancelled') then balance_cents else 0 end), 0)
            as "outstandingBalanceCents",
          coalesce(sum(case when status = 'overdue' then balance_cents else 0 end), 0)
            as "overdueBalanceCents",
          coalesce(sum(case when status = 'overdue' then 1 else 0 end), 0)
            as "overdueCount",
          coalesce(sum(case when bill_date >= $2 and bill_date <= $3 then total_charges_cents else 0 end), 0)
            as "chargesInPeriodCents"
       from bills
       where tenant_id = $1`,
      [tenantId, parsedStartDate, parsedEndDate],
    );

    const payerPaymentsSummary = payerPaymentsSummaryResult.rows[0] || {
      count: 0,
      totalCents: 0,
      appliedCents: 0,
      unappliedCents: 0,
    };
    const receivables = receivablesSummaryResult.rows[0] || {
      outstandingBalanceCents: 0,
      overdueBalanceCents: 0,
      overdueCount: 0,
      chargesInPeriodCents: 0,
    };

    const statusMap = patientPaymentsByStatusResult.rows.reduce(
      (acc: Record<string, { count: number; totalCents: number }>, row: any) => {
        acc[String(row.status)] = {
          count: Number(row.count || 0),
          totalCents: Number(row.totalCents || 0),
        };
        return acc;
      },
      {},
    );

    const postedPatientPaymentsCents = statusMap.posted?.totalCents || 0;
    const refundedPatientPaymentsCents = statusMap.refunded?.totalCents || 0;
    const voidedPatientPaymentsCents = statusMap.voided?.totalCents || 0;
    const pendingPatientPaymentsCents = statusMap.pending?.totalCents || 0;
    const payerAppliedCents = Number(payerPaymentsSummary.appliedCents || 0);
    const netCollectionsCents = postedPatientPaymentsCents + payerAppliedCents;
    const chargesInPeriodCents = Number(receivables.chargesInPeriodCents || 0);
    const netCollectionRate =
      chargesInPeriodCents > 0 ? Math.round((netCollectionsCents / chargesInPeriodCents) * 100) : 0;

    res.json({
      patientPaymentsByMethod: patientPaymentsByMethodResult.rows,
      patientPaymentsByStatus: patientPaymentsByStatusResult.rows,
      payerPaymentsSummary,
      receivables,
      calculated: {
        postedPatientPaymentsCents,
        payerAppliedCents,
        netCollectionsCents,
        pendingPatientPaymentsCents,
        refundedPatientPaymentsCents,
        voidedPatientPaymentsCents,
        chargesInPeriodCents,
        netCollectionRate,
      },
      period: { startDate: parsedStartDate, endDate: parsedEndDate },
    });
  } catch (error) {
    logFinancialMetricsError("Error fetching payments summary", error);
    res.status(500).json({ error: "Failed to fetch payments summary" });
  }
});

// Get A/R aging with patient vs insurance split
financialMetricsRouter.get("/ar-aging", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const requestedAsOfDate = req.query.asOfDate;
  const parsedAsOfDate = parseIsoDateOrNull(requestedAsOfDate);
  const asOfDate = parsedAsOfDate || toIsoDate(new Date());

  if (requestedAsOfDate && !parsedAsOfDate) {
    return res.status(400).json({ error: "asOfDate must be a valid ISO date (YYYY-MM-DD)" });
  }

  try {
    const agingResult = await pool.query(
      `with patient_applied as (
         select
           applied_to_invoice_id as bill_id,
           coalesce(sum(amount_cents), 0)::bigint as applied_cents
         from patient_payments
         where tenant_id = $1
           and status = 'posted'
           and applied_to_invoice_id is not null
           and payment_date <= $2::date
         group by applied_to_invoice_id
       ),
       open_bills as (
         select
           b.id,
           b.bill_date,
           greatest(coalesce(b.balance_cents, 0), 0)::bigint as balance_cents,
           greatest(coalesce(b.patient_responsibility_cents, 0), 0)::bigint as patient_responsibility_cents,
           greatest(coalesce(pa.applied_cents, 0), 0)::bigint as patient_applied_cents
         from bills b
         left join patient_applied pa on pa.bill_id = b.id
         where b.tenant_id = $1
           and b.balance_cents > 0
           and b.status not in ('paid', 'written_off', 'cancelled')
           and b.bill_date <= $2::date
       ),
       classified as (
         select
           case
             when bill_date >= ($2::date - interval '30 days') then '0_30'
             when bill_date >= ($2::date - interval '60 days') then '31_60'
             when bill_date >= ($2::date - interval '90 days') then '61_90'
             when bill_date >= ($2::date - interval '120 days') then '91_120'
             else '120_plus'
           end as bucket_key,
           balance_cents,
           least(
             balance_cents,
             greatest(patient_responsibility_cents - patient_applied_cents, 0)
           )::bigint as patient_balance_cents
         from open_bills
       )
       select
         bucket_key as "bucketKey",
         count(*)::int as "billCount",
         coalesce(sum(balance_cents), 0)::bigint as "totalBalanceCents",
         coalesce(sum(patient_balance_cents), 0)::bigint as "patientBalanceCents",
         coalesce(sum(balance_cents - patient_balance_cents), 0)::bigint as "insuranceBalanceCents"
       from classified
       group by bucket_key`,
      [tenantId, asOfDate],
    );

    const bucketDefinitions = [
      { key: "0_30", label: "0-30 days" },
      { key: "31_60", label: "31-60 days" },
      { key: "61_90", label: "61-90 days" },
      { key: "91_120", label: "91-120 days" },
      { key: "120_plus", label: "120+ days" },
    ];

    const bucketRows = new Map(
      agingResult.rows.map((row: any) => [
        row.bucketKey,
        {
          billCount: Number(row.billCount || 0),
          totalBalanceCents: Number(row.totalBalanceCents || 0),
          patientBalanceCents: Number(row.patientBalanceCents || 0),
          insuranceBalanceCents: Number(row.insuranceBalanceCents || 0),
        },
      ]),
    );

    const totals = {
      totalBalanceCents: 0,
      patientBalanceCents: 0,
      insuranceBalanceCents: 0,
    };

    const buckets = bucketDefinitions.map((bucketDefinition) => {
      const values = bucketRows.get(bucketDefinition.key) || {
        billCount: 0,
        totalBalanceCents: 0,
        patientBalanceCents: 0,
        insuranceBalanceCents: 0,
      };

      totals.totalBalanceCents += values.totalBalanceCents;
      totals.patientBalanceCents += values.patientBalanceCents;
      totals.insuranceBalanceCents += values.insuranceBalanceCents;

      return {
        key: bucketDefinition.key,
        label: bucketDefinition.label,
        billCount: values.billCount,
        totalBalanceCents: values.totalBalanceCents,
        patientBalanceCents: values.patientBalanceCents,
        insuranceBalanceCents: values.insuranceBalanceCents,
      };
    });

    const over90BalanceCents = buckets
      .filter((bucket) => bucket.key === "91_120" || bucket.key === "120_plus")
      .reduce((sum, bucket) => sum + bucket.totalBalanceCents, 0);

    const patientSharePercent =
      totals.totalBalanceCents > 0
        ? Math.round((totals.patientBalanceCents / totals.totalBalanceCents) * 1000) / 10
        : 0;

    const insuranceSharePercent =
      totals.totalBalanceCents > 0
        ? Math.round((totals.insuranceBalanceCents / totals.totalBalanceCents) * 1000) / 10
        : 0;

    const over90Percent =
      totals.totalBalanceCents > 0 ? Math.round((over90BalanceCents / totals.totalBalanceCents) * 1000) / 10 : 0;

    res.json({
      asOfDate,
      totals: {
        ...totals,
        over90BalanceCents,
        patientSharePercent,
        insuranceSharePercent,
        over90Percent,
      },
      buckets: buckets.map((bucket) => ({
        ...bucket,
        percentageOfTotal:
          totals.totalBalanceCents > 0
            ? Math.round((bucket.totalBalanceCents / totals.totalBalanceCents) * 1000) / 10
            : 0,
      })),
    });
  } catch (error) {
    logFinancialMetricsError("Error fetching A/R aging", error);
    res.status(500).json({ error: "Failed to fetch A/R aging" });
  }
});

// Get bills summary
financialMetricsRouter.get("/bills-summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  // Bills by status
  const billsByStatusResult = await pool.query(
    `select status,
            count(*) as count,
            sum(balance_cents) as "balanceCents",
            sum(total_charges_cents) as "totalChargesCents"
     from bills
     where tenant_id = $1
       and bill_date >= $2
       and bill_date <= $3
     group by status
     order by count desc`,
    [tenantId, startDate, endDate],
  );

  res.json({
    billsByStatus: billsByStatusResult.rows,
    period: { startDate, endDate },
  });
});

// Get comprehensive RCM dashboard metrics
financialMetricsRouter.get("/rcm-dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { period = 'mtd' } = req.query;

  const today = new Date();
  let startDate: Date;
  let endDate = today;

  // Calculate date range based on period
  if (period === 'mtd') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (period === 'qtd') {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3;
    startDate = new Date(today.getFullYear(), quarterStart, 1);
  } else {
    startDate = new Date(today.getFullYear(), 0, 1);
  }

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  try {
    // Total Clinical Collections (patient + payer payments)
    const patientCollectionsResult = await pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const payerCollectionsResult = await pool.query(
      `select coalesce(sum(applied_amount_cents), 0) as total
       from payer_payments
       where tenant_id = $1
         and payment_date >= $2
         and payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const totalClinicalCollections = parseInt(patientCollectionsResult.rows[0].total) + parseInt(payerCollectionsResult.rows[0].total);

    // Total Charges
    const chargesResult = await pool.query(
      `select coalesce(sum(total_charges_cents), 0) as total
       from bills
       where tenant_id = $1
         and bill_date >= $2
         and bill_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const totalCharges = parseInt(chargesResult.rows[0].total);

    // Net Collection Ratio
    const netCollectionRatio = totalCharges > 0 ? Math.round((totalClinicalCollections / totalCharges) * 100) / 100 : 0;

    // Days Sales Outstanding (DSO) - Average days to collect
    const dsoResult = await pool.query(
      `select avg(extract(epoch from (payment_date - bill_date)) / 86400)::int as avg_days
       from patient_payments pp
       join bills b on b.patient_id = pp.patient_id
       where pp.tenant_id = $1
         and pp.status = 'posted'
         and pp.payment_date >= $2
         and pp.payment_date <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const dso = dsoResult.rows[0]?.avg_days || 45;

    // First Pass Claim Rate - Claims accepted on first submission
    const totalClaimsResult = await pool.query(
      `select count(*) as total
       from claims
       where tenant_id = $1
         and submitted_at >= $2
         and submitted_at <= $3`,
      [tenantId, startDateStr, endDateStr],
    );

    const acceptedFirstPassResult = await pool.query(
      `select count(*) as accepted
       from claims c
       where c.tenant_id = $1
         and c.submitted_at >= $2
         and c.submitted_at <= $3
         and c.status in ('accepted', 'paid')
         and not exists (
           select 1 from claim_status_history csh
           where csh.claim_id = c.id
             and csh.status = 'rejected'
         )`,
      [tenantId, startDateStr, endDateStr],
    );

    const totalClaims = parseInt(totalClaimsResult.rows[0].total);
    const acceptedFirstPass = parseInt(acceptedFirstPassResult.rows[0].accepted);
    const firstPassClaimRate = totalClaims > 0 ? Math.round((acceptedFirstPass / totalClaims) * 100) / 100 : 0.95;

    // Clean Claim Rate
    const cleanClaimRate = firstPassClaimRate + 0.02; // Approximation

    // Denial Rate
    const deniedResult = await pool.query(
      `select count(*) as denied
       from claims
       where tenant_id = $1
         and status = 'rejected'
         and submitted_at >= $2
         and submitted_at <= $3`,
      [tenantId, startDateStr, endDateStr],
    );
    const deniedClaims = parseInt(deniedResult.rows[0].denied);
    const denialRate = totalClaims > 0 ? Math.round((deniedClaims / totalClaims) * 100) / 100 : 0.03;

    // A/R Aging Breakdown
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date120 = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const arAgingResult = await pool.query(
      `select
        coalesce(sum(case when bill_date >= $2 then balance_cents else 0 end), 0) as current,
        coalesce(sum(case when bill_date < $2 and bill_date >= $3 then balance_cents else 0 end), 0) as days30_60,
        coalesce(sum(case when bill_date < $3 and bill_date >= $4 then balance_cents else 0 end), 0) as days60_90,
        coalesce(sum(case when bill_date < $4 and bill_date >= $5 then balance_cents else 0 end), 0) as days90_120,
        coalesce(sum(case when bill_date < $5 then balance_cents else 0 end), 0) as days120_plus
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')`,
      [tenantId, date30, date60, date90, date120],
    );

    const arAging = {
      current: parseInt(arAgingResult.rows[0].current),
      days30_60: parseInt(arAgingResult.rows[0].days30_60),
      days60_90: parseInt(arAgingResult.rows[0].days60_90),
      days90_120: parseInt(arAgingResult.rows[0].days90_120),
      days120_plus: parseInt(arAgingResult.rows[0].days120_plus),
    };

    const totalAR = arAging.current + arAging.days30_60 + arAging.days60_90 + arAging.days90_120 + arAging.days120_plus;

    // Monthly Trend Data (last 6 months)
    const monthlyTrendResult = await pool.query(
      `select
        date_trunc('month', payment_date)::date as month,
        sum(amount_cents) as collections
       from patient_payments
       where tenant_id = $1
         and status = 'posted'
         and payment_date >= date_trunc('month', current_date) - interval '6 months'
       group by date_trunc('month', payment_date)
       order by month asc`,
      [tenantId],
    );

    res.json({
      metrics: {
        totalClinicalCollections,
        netCollectionRatio,
        dso,
        firstPassClaimRate,
        cleanClaimRate: Math.min(cleanClaimRate, 1),
        denialRate,
        totalAR,
      },
      arAging,
      period: {
        type: period,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      monthlyTrend: monthlyTrendResult.rows,
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching RCM dashboard', error);
    res.status(500).json({ error: 'Failed to fetch RCM dashboard metrics' });
  }
});

// Get revenue by payer analytics
financialMetricsRouter.get("/revenue-by-payer", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        coalesce(p.insurance_plan_name, 'Self-Pay') as payer,
        count(distinct b.id) as claim_count,
        sum(b.total_charges_cents) as charges,
        sum(pp.amount_cents) + coalesce(sum(ppy.applied_amount_cents), 0) as collections
       from bills b
       join patients p on p.id = b.patient_id
       left join patient_payments pp on pp.patient_id = b.patient_id and pp.status = 'posted'
       left join payer_payments ppy on ppy.tenant_id = b.tenant_id
       where b.tenant_id = $1
         and b.bill_date >= $2
         and b.bill_date <= $3
       group by coalesce(p.insurance_plan_name, 'Self-Pay')
       order by collections desc
       limit 10`,
      [tenantId, start, end],
    );

    res.json({
      revenueByPayer: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching revenue by payer', error);
    res.status(500).json({ error: 'Failed to fetch revenue by payer' });
  }
});

// Get revenue by procedure (CPT code)
financialMetricsRouter.get("/revenue-by-procedure", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        c.cpt_code as "cptCode",
        c.description,
        count(*) as procedure_count,
        sum(c.fee_cents * c.quantity) as revenue
       from charges c
       join encounters e on e.id = c.encounter_id
       where c.tenant_id = $1
         and e.check_in_time >= $2
         and e.check_in_time <= $3
       group by c.cpt_code, c.description
       order by revenue desc
       limit 15`,
      [tenantId, start, end],
    );

    res.json({
      revenueByProcedure: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching revenue by procedure', error);
    res.status(500).json({ error: 'Failed to fetch revenue by procedure' });
  }
});

// Get provider productivity metrics
financialMetricsRouter.get("/provider-productivity", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `select
        pr.id as "providerId",
        pr.full_name as "providerName",
        count(distinct e.id) as "encounterCount",
        count(distinct e.patient_id) as "patientCount",
        sum(c.fee_cents * c.quantity) as "totalCharges",
        avg(extract(epoch from (e.check_out_time - e.check_in_time)) / 60)::int as "avgVisitMinutes"
       from providers pr
       left join encounters e on e.provider_id = pr.id and e.tenant_id = $1
       left join charges c on c.encounter_id = e.id
       where pr.tenant_id = $1
         and (e.check_in_time is null or (e.check_in_time >= $2 and e.check_in_time <= $3))
       group by pr.id, pr.full_name
       order by "totalCharges" desc nulls last`,
      [tenantId, start, end],
    );

    res.json({
      providerProductivity: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching provider productivity', error);
    res.status(500).json({ error: 'Failed to fetch provider productivity' });
  }
});

// Get E&M code distribution
financialMetricsRouter.get("/em-distribution", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    // E&M codes are typically 99201-99215 (office visits)
    const result = await pool.query(
      `select
        c.cpt_code as "cptCode",
        c.description,
        count(*) as count
       from charges c
       join encounters e on e.id = c.encounter_id
       where c.tenant_id = $1
         and c.cpt_code like '992%'
         and e.check_in_time >= $2
         and e.check_in_time <= $3
       group by c.cpt_code, c.description
       order by c.cpt_code`,
      [tenantId, start, end],
    );

    res.json({
      emDistribution: result.rows,
      period: { startDate: start, endDate: end },
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching E&M distribution', error);
    res.status(500).json({ error: 'Failed to fetch E&M distribution' });
  }
});

// Get claims aging report
financialMetricsRouter.get("/claims-aging", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await pool.query(
      `select
        case
          when submitted_at >= $2 then 'Current'
          when submitted_at >= $3 and submitted_at < $2 then '30-60 Days'
          when submitted_at >= $4 and submitted_at < $3 then '60-90 Days'
          else '90+ Days'
        end as bucket,
        count(*) as claim_count,
        sum(total_cents) as total_amount
       from claims
       where tenant_id = $1
         and status not in ('paid', 'rejected')
         and submitted_at is not null
       group by
        case
          when submitted_at >= $2 then 'Current'
          when submitted_at >= $3 and submitted_at < $2 then '30-60 Days'
          when submitted_at >= $4 and submitted_at < $3 then '60-90 Days'
          else '90+ Days'
        end
       order by
        case
          when submitted_at >= $2 then 1
          when submitted_at >= $3 and submitted_at < $2 then 2
          when submitted_at >= $4 and submitted_at < $3 then 3
          else 4
        end`,
      [tenantId, date30, date60, date90],
    );

    res.json({
      claimsAging: result.rows,
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching claims aging', error);
    res.status(500).json({ error: 'Failed to fetch claims aging' });
  }
});

// Get patient balance summary
financialMetricsRouter.get("/patient-balances", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { limit = 20 } = req.query;

  try {
    const result = await pool.query(
      `select
        p.id as "patientId",
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.email,
        p.phone,
        sum(b.balance_cents) as "balanceCents",
        max(b.bill_date) as "lastBillDate",
        count(b.id) as "billCount"
       from patients p
       join bills b on b.patient_id = p.id
       where p.tenant_id = $1
         and b.balance_cents > 0
         and b.status not in ('paid', 'written_off', 'cancelled')
       group by p.id, p.first_name, p.last_name, p.email, p.phone
       having sum(b.balance_cents) > 0
       order by sum(b.balance_cents) desc
       limit $2`,
      [tenantId, parseInt(String(limit))],
    );

    res.json({
      patientBalances: result.rows,
    });
  } catch (error: any) {
    logFinancialMetricsError('Error fetching patient balances', error);
    res.status(500).json({ error: 'Failed to fetch patient balances' });
  }
});
