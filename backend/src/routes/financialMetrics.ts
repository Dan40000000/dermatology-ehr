import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import { getFinancialSnapshots } from "../services/financialSnapshotService";
import { ensureStoreSchemaAndCatalog } from "../services/productSalesService";
import {
  classifyRevenueCategory,
  revenueCategoryLabel,
  type RevenueCategoryKey,
  type RevenueCategorySummary,
} from "../services/financialRevenueCategories";

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
  storePaymentsCents: number;
  badDebtCents?: number;
  collectionsReferralBalanceCents?: number;
  collectionsReferralCount?: number;
  paymentCount: number;
  billCount: number;
  revenueCategories?: RevenueCategorySummary[];
};

type RevenueCategoryDetailRow = {
  day: string;
  total_charges_cents: string | number | null;
  notes: string | null;
  appointment_type_name: string | null;
  cpt_codes: string | null;
  line_descriptions: string | null;
  encounter_id: string | null;
  category_override?: RevenueCategoryKey | null;
};

type RevenueDetailQueryRow = RevenueCategoryDetailRow & {
  source_type: string;
  source_id: string;
  source_label: string | null;
  patient_name: string | null;
  provider_name: string | null;
  bill_number: string | null;
  status: string | null;
  paid_amount_cents: string | number | null;
  balance_cents: string | number | null;
};

const REVENUE_CATEGORY_KEYS: RevenueCategoryKey[] = [
  "office_visit",
  "procedure",
  "cosmetic",
  "late_fee",
  "no_show_fee",
  "product_sale",
  "other",
];

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

function isMissingOptionalFinancialSchemaError(error: unknown): boolean {
  const code = (error as any)?.code;
  return code === "42P01" || code === "42703";
}

async function optionalFinancialQuery<T extends Record<string, any>>(
  query: string,
  params: unknown[],
  fallbackRows: T[],
): Promise<{ rows: T[] }> {
  try {
    return await pool.query(query, params);
  } catch (error) {
    if (isMissingOptionalFinancialSchemaError(error)) {
      logger.warn("Optional financial reporting table or column is unavailable", {
        error: toSafeErrorMessage(error),
      });
      return { rows: fallbackRows };
    }
    throw error;
  }
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

function parseRevenueCategoryOrNull(value: unknown): RevenueCategoryKey | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = value.trim() as RevenueCategoryKey;
  return REVENUE_CATEGORY_KEYS.includes(normalized) ? normalized : null;
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

function createRevenueCategoryAccumulator(): Record<RevenueCategoryKey, RevenueCategorySummary> {
  return {
    office_visit: { key: "office_visit", label: revenueCategoryLabel("office_visit"), revenueCents: 0, itemCount: 0 },
    procedure: { key: "procedure", label: revenueCategoryLabel("procedure"), revenueCents: 0, itemCount: 0 },
    cosmetic: { key: "cosmetic", label: revenueCategoryLabel("cosmetic"), revenueCents: 0, itemCount: 0 },
    late_fee: { key: "late_fee", label: revenueCategoryLabel("late_fee"), revenueCents: 0, itemCount: 0 },
    no_show_fee: { key: "no_show_fee", label: revenueCategoryLabel("no_show_fee"), revenueCents: 0, itemCount: 0 },
    product_sale: { key: "product_sale", label: revenueCategoryLabel("product_sale"), revenueCents: 0, itemCount: 0 },
    other: { key: "other", label: revenueCategoryLabel("other"), revenueCents: 0, itemCount: 0 },
  };
}

function addRevenueCategory(
  accumulator: Record<RevenueCategoryKey, RevenueCategorySummary>,
  categoryKey: RevenueCategoryKey,
  revenueCents: number,
): void {
  if (revenueCents <= 0) {
    return;
  }
  accumulator[categoryKey].revenueCents += revenueCents;
  accumulator[categoryKey].itemCount += 1;
}

function summarizeRevenueCategories(
  accumulator: Record<RevenueCategoryKey, RevenueCategorySummary>,
): RevenueCategorySummary[] {
  return Object.values(accumulator)
    .filter((entry) => entry.revenueCents > 0)
    .sort((left, right) => right.revenueCents - left.revenueCents);
}

function parseCents(value: string | number | null | undefined): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function classifyRevenueDetailRow(row: RevenueCategoryDetailRow): RevenueCategoryKey {
  return (
    row.category_override ||
    classifyRevenueCategory({
      appointmentTypeName: row.appointment_type_name,
      notes: row.notes,
      cptCodes: row.cpt_codes,
      lineDescriptions: row.line_descriptions,
      encounterBacked: Boolean(row.encounter_id),
    })
  );
}

// Get financial dashboard metrics
financialMetricsRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { date } = req.query;

  const dashboardDate = parseIsoDateOrNull(date);
  const referenceDate = dashboardDate ? new Date(`${dashboardDate}T00:00:00Z`) : new Date();
  const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

  try {
    const snapshots = await getFinancialSnapshots(tenantId, dashboardDate ?? undefined);

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
    await ensureStoreSchemaAndCatalog(tenantId);

    const [trendResult, revenueCategoryResult, badDebtTrendResult, collectionsReferralResult] = await Promise.all([
      pool.query(
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
       store_payments as (
         select
           ps.sale_date::date as day,
           coalesce(sum(coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0)), 0) as store_payments_cents,
           count(*) as store_payment_count
         from product_sales ps
         left join store_order_fulfillments sof
           on sof.sale_id::text = ps.id::text
          and sof.tenant_id = ps.tenant_id
         where ps.tenant_id = $1
           and ps.status = 'completed'
           and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
           and ps.sale_date::date >= $2::date
           and ps.sale_date::date <= $3::date
         group by ps.sale_date::date
       ),
       appointment_revenue as (
         select
           coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date as day,
           coalesce(sum(
             case
               when c.status is null or c.status not in ('void', 'voided') then coalesce(c.amount_cents, 0)
               else 0
             end
           ), 0) as revenue_earned_cents
         from appointments a
         left join encounters e
           on e.appointment_id = a.id
          and e.tenant_id = a.tenant_id
         left join charges c
           on c.encounter_id = e.id
          and c.tenant_id = a.tenant_id
         where a.tenant_id = $1
           and a.status = 'completed'
           and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date >= $2::date
           and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date <= $3::date
         group by a.id, coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date
       ),
       standalone_bill_revenue as (
         select
           bill_date::date as day,
           coalesce(total_charges_cents, 0) as revenue_earned_cents
         from bills
         where tenant_id = $1
           and encounter_id is null
           and bill_date >= $2
           and bill_date <= $3
       ),
       store_revenue as (
         select
           ps.sale_date::date as day,
           coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0) as revenue_earned_cents
         from product_sales ps
         left join store_order_fulfillments sof
           on sof.sale_id::text = ps.id::text
          and sof.tenant_id = ps.tenant_id
         where ps.tenant_id = $1
           and ps.status = 'completed'
           and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
           and ps.sale_date::date >= $2::date
           and ps.sale_date::date <= $3::date
       ),
       revenue_items as (
         select day, revenue_earned_cents
         from appointment_revenue
         where revenue_earned_cents > 0
         union all
         select day, revenue_earned_cents
         from standalone_bill_revenue
         where revenue_earned_cents > 0
         union all
         select day, revenue_earned_cents
         from store_revenue
         where revenue_earned_cents > 0
       ),
       revenue as (
         select
           day,
           coalesce(sum(revenue_earned_cents), 0) as revenue_earned_cents,
           count(*) as bill_count
         from revenue_items
         group by day
       )
       select
         d.day::text as date,
         coalesce(p.patient_payments_cents, 0) as patient_payments_cents,
         coalesce(py.payer_payments_cents, 0) as payer_payments_cents,
         coalesce(sp.store_payments_cents, 0) as store_payments_cents,
         (coalesce(p.patient_payments_cents, 0) + coalesce(py.payer_payments_cents, 0) + coalesce(sp.store_payments_cents, 0)) as payments_collected_cents,
         coalesce(r.revenue_earned_cents, 0) as revenue_earned_cents,
         (coalesce(p.patient_payment_count, 0) + coalesce(py.payer_payment_count, 0) + coalesce(sp.store_payment_count, 0)) as payment_count,
         coalesce(r.bill_count, 0) as bill_count
       from days d
       left join patient p on p.day = d.day
       left join payer py on py.day = d.day
       left join store_payments sp on sp.day = d.day
       left join revenue r on r.day = d.day
       order by d.day asc`,
      [tenantId, startDate, endDate],
      ),
      pool.query(
        `with appointment_revenue as (
           select
             coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date::text as day,
             coalesce(sum(
               case
                 when c.status is null or c.status not in ('void', 'voided') then coalesce(c.amount_cents, 0)
                 else 0
               end
             ), 0) as total_charges_cents,
             null::text as notes,
             max(at.name) as appointment_type_name,
             string_agg(distinct coalesce(c.cpt_code, ''), ',') as cpt_codes,
             string_agg(distinct coalesce(c.description, ''), ' | ') as line_descriptions,
             max(e.id)::text as encounter_id,
             null::text as category_override
           from appointments a
           join appointment_types at
             on at.id = a.appointment_type_id
           left join encounters e
             on e.appointment_id = a.id
            and e.tenant_id = a.tenant_id
           left join charges c
             on c.encounter_id = e.id
            and c.tenant_id = a.tenant_id
           where a.tenant_id = $1
             and a.status = 'completed'
             and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date >= $2::date
             and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date <= $3::date
           group by a.id, coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date
         ),
         standalone_bill_revenue as (
           select
             b.bill_date::date::text as day,
             b.total_charges_cents,
             b.notes,
             max(at.name) as appointment_type_name,
             string_agg(distinct coalesce(bli.cpt_code, ''), ',') as cpt_codes,
             string_agg(distinct coalesce(bli.description, ''), ' | ') as line_descriptions,
             b.encounter_id::text as encounter_id,
             null::text as category_override
           from bills b
           left join bill_line_items bli
             on bli.bill_id = b.id
            and bli.tenant_id = b.tenant_id
           left join encounters e
             on e.id = b.encounter_id
            and e.tenant_id = b.tenant_id
           left join appointments a
             on a.id = e.appointment_id
            and a.tenant_id = b.tenant_id
           left join appointment_types at
             on at.id = a.appointment_type_id
           where b.tenant_id = $1
             and b.encounter_id is null
             and b.bill_date >= $2
             and b.bill_date <= $3
           group by b.id, b.bill_date, b.total_charges_cents, b.notes, b.encounter_id
         ),
         store_revenue as (
           select
             ps.sale_date::date::text as day,
             coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0) as total_charges_cents,
             'Patient portal store order'::text as notes,
             null::text as appointment_type_name,
             'STORE'::text as cpt_codes,
             string_agg(distinct coalesce(psi.product_name, 'Store product'), ' | ') as line_descriptions,
             null::text as encounter_id,
             'product_sale'::text as category_override
           from product_sales ps
           left join store_order_fulfillments sof
             on sof.sale_id::text = ps.id::text
            and sof.tenant_id = ps.tenant_id
           left join product_sale_items psi
             on psi.sale_id::text = ps.id::text
           where ps.tenant_id = $1
             and ps.status = 'completed'
             and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
             and ps.sale_date::date >= $2::date
             and ps.sale_date::date <= $3::date
           group by ps.id, ps.sale_date, ps.total, sof.shipping_fee
         )
         select *
         from appointment_revenue
         where total_charges_cents > 0
         union all
         select *
         from standalone_bill_revenue
         where total_charges_cents > 0
         union all
         select *
         from store_revenue
         where total_charges_cents > 0`,
        [tenantId, startDate, endDate],
      ),
      pool.query(
        `select
           coalesce(written_off_at, updated_at)::date::text as day,
           coalesce(sum(greatest(0, coalesce(adjustment_amount_cents, 0))), 0) as bad_debt_cents
         from bills
         where tenant_id = $1
           and (status = 'written_off' or follow_up_status = 'write_off' or written_off_at is not null)
           and coalesce(written_off_at, updated_at)::date >= $2::date
           and coalesce(written_off_at, updated_at)::date <= $3::date
         group by coalesce(written_off_at, updated_at)::date`,
        [tenantId, startDate, endDate],
      ).catch((error) => {
        if ((error as any)?.code === "42703") {
          return { rows: [] };
        }
        throw error;
      }),
      pool.query(
        `select
           coalesce(collections_flagged_at, updated_at)::date::text as day,
           coalesce(sum(balance_cents), 0) as collections_referral_balance_cents,
           count(*) as collections_referral_count
         from bills
         where tenant_id = $1
           and coalesce(balance_cents, 0) > 0
           and status not in ('paid', 'cancelled', 'written_off')
           and (
             follow_up_status = 'collections'
             or collections_status in ('flagged', 'sent_to_collections')
           )
           and coalesce(collections_flagged_at, updated_at)::date >= $2::date
           and coalesce(collections_flagged_at, updated_at)::date <= $3::date
         group by coalesce(collections_flagged_at, updated_at)::date`,
        [tenantId, startDate, endDate],
      ).catch((error) => {
        if ((error as any)?.code === "42703") {
          return { rows: [] };
        }
        throw error;
      }),
    ]);

    const dailyPoints: TrendPoint[] = trendResult.rows.map((row: any) => ({
      bucketStartDate: row.date,
      bucketEndDate: row.date,
      paymentsCollectedCents: Number(row.payments_collected_cents || 0),
      revenueEarnedCents: Number(row.revenue_earned_cents || 0),
      patientPaymentsCents: Number(row.patient_payments_cents || 0),
      payerPaymentsCents: Number(row.payer_payments_cents || 0),
      storePaymentsCents: Number(row.store_payments_cents || 0),
      paymentCount: Number(row.payment_count || 0),
      billCount: Number(row.bill_count || 0),
    }));

    const badDebtByDay = new Map<string, number>();
    (Array.isArray(badDebtTrendResult.rows) ? badDebtTrendResult.rows : []).forEach((row: any) => {
      badDebtByDay.set(String(row.day), Number(row.bad_debt_cents || 0));
    });
    const collectionsReferralByDay = new Map<string, { balanceCents: number; count: number }>();
    (Array.isArray(collectionsReferralResult.rows) ? collectionsReferralResult.rows : []).forEach((row: any) => {
      collectionsReferralByDay.set(String(row.day), {
        balanceCents: Number(row.collections_referral_balance_cents || 0),
        count: Number(row.collections_referral_count || 0),
      });
    });
    dailyPoints.forEach((point) => {
      point.badDebtCents = badDebtByDay.get(point.bucketStartDate) || 0;
      const referral = collectionsReferralByDay.get(point.bucketStartDate);
      point.collectionsReferralBalanceCents = referral?.balanceCents || 0;
      point.collectionsReferralCount = referral?.count || 0;
    });

    const categoryRows = Array.isArray(revenueCategoryResult.rows)
      ? (revenueCategoryResult.rows as RevenueCategoryDetailRow[])
      : [];
    const dailyCategoryAccumulators = new Map<string, Record<RevenueCategoryKey, RevenueCategorySummary>>();

    categoryRows.forEach((row) => {
      const day = String(row.day || "");
      const amountCents = Number(row.total_charges_cents || 0);
      if (!day || amountCents <= 0) {
        return;
      }

      const categoryKey =
        row.category_override ||
        classifyRevenueCategory({
          appointmentTypeName: row.appointment_type_name,
          notes: row.notes,
          cptCodes: row.cpt_codes,
          lineDescriptions: row.line_descriptions,
          encounterBacked: Boolean(row.encounter_id),
        });
      const accumulator = dailyCategoryAccumulators.get(day) || createRevenueCategoryAccumulator();
      addRevenueCategory(accumulator, categoryKey, amountCents);
      dailyCategoryAccumulators.set(day, accumulator);
    });

    dailyPoints.forEach((point) => {
      const accumulator = dailyCategoryAccumulators.get(point.bucketStartDate);
      point.revenueCategories = accumulator ? summarizeRevenueCategories(accumulator) : [];
    });

    let trendData: TrendPoint[] = dailyPoints;
    if (granularity !== "day") {
      const bucketed = new Map<string, TrendPoint>();
      const bucketedCategories = new Map<string, Record<RevenueCategoryKey, RevenueCategorySummary>>();

      dailyPoints.forEach((point) => {
        const key = bucketDate(point.bucketStartDate, granularity);
        const existing = bucketed.get(key);
        if (!existing) {
          bucketed.set(key, { ...point, bucketStartDate: key, bucketEndDate: point.bucketEndDate });
          const accumulator = createRevenueCategoryAccumulator();
          (point.revenueCategories || []).forEach((category) => {
            addRevenueCategory(accumulator, category.key, category.revenueCents);
            accumulator[category.key].itemCount = category.itemCount;
          });
          bucketedCategories.set(key, accumulator);
          return;
        }

        existing.bucketEndDate = point.bucketEndDate;
        existing.paymentsCollectedCents += point.paymentsCollectedCents;
        existing.revenueEarnedCents += point.revenueEarnedCents;
        existing.patientPaymentsCents += point.patientPaymentsCents;
        existing.payerPaymentsCents += point.payerPaymentsCents;
        existing.storePaymentsCents += point.storePaymentsCents;
        existing.badDebtCents = (existing.badDebtCents || 0) + (point.badDebtCents || 0);
        existing.collectionsReferralBalanceCents =
          (existing.collectionsReferralBalanceCents || 0) + (point.collectionsReferralBalanceCents || 0);
        existing.collectionsReferralCount =
          (existing.collectionsReferralCount || 0) + (point.collectionsReferralCount || 0);
        existing.paymentCount += point.paymentCount;
        existing.billCount += point.billCount;
        const accumulator = bucketedCategories.get(key) || createRevenueCategoryAccumulator();
        (point.revenueCategories || []).forEach((category) => {
          addRevenueCategory(accumulator, category.key, category.revenueCents);
          accumulator[category.key].itemCount += Math.max(0, category.itemCount - 1);
        });
        bucketedCategories.set(key, accumulator);
      });

      trendData = Array.from(bucketed.values())
        .sort((a, b) => a.bucketStartDate.localeCompare(b.bucketStartDate))
        .map((point) => ({
          ...point,
          revenueCategories: summarizeRevenueCategories(
            bucketedCategories.get(point.bucketStartDate) || createRevenueCategoryAccumulator(),
          ),
        }));
    }

    const summary = dailyPoints.reduce(
      (acc, point) => {
        acc.totalPaymentsCollectedCents += point.paymentsCollectedCents;
        acc.totalRevenueEarnedCents += point.revenueEarnedCents;
        acc.totalPatientPaymentsCents += point.patientPaymentsCents;
        acc.totalPayerPaymentsCents += point.payerPaymentsCents;
        acc.totalStorePaymentsCents += point.storePaymentsCents;
        acc.totalBadDebtCents += point.badDebtCents || 0;
        acc.collectionsReferralBalanceCents += point.collectionsReferralBalanceCents || 0;
        acc.collectionsReferralCount += point.collectionsReferralCount || 0;
        acc.totalPaymentCount += point.paymentCount;
        acc.totalBillCount += point.billCount;
        return acc;
      },
      {
        totalPaymentsCollectedCents: 0,
        totalRevenueEarnedCents: 0,
        totalPatientPaymentsCents: 0,
        totalPayerPaymentsCents: 0,
        totalStorePaymentsCents: 0,
        totalBadDebtCents: 0,
        collectionsReferralBalanceCents: 0,
        collectionsReferralCount: 0,
        totalPaymentCount: 0,
        totalBillCount: 0,
      },
    );
    const summaryCategoryAccumulator = createRevenueCategoryAccumulator();
    categoryRows.forEach((row) => {
      const amountCents = Number(row.total_charges_cents || 0);
      if (amountCents <= 0) {
        return;
      }
      const categoryKey =
        row.category_override ||
        classifyRevenueCategory({
          appointmentTypeName: row.appointment_type_name,
          notes: row.notes,
          cptCodes: row.cpt_codes,
          lineDescriptions: row.line_descriptions,
          encounterBacked: Boolean(row.encounter_id),
        });
      addRevenueCategory(summaryCategoryAccumulator, categoryKey, amountCents);
    });

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
        revenueCategories: summarizeRevenueCategories(summaryCategoryAccumulator),
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

// Get line-level revenue detail for the revenue page drill-downs.
financialMetricsRouter.get("/revenue-details", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const parsedStartDate = parseIsoDateOrNull(req.query.startDate);
  const parsedEndDate = parseIsoDateOrNull(req.query.endDate);
  const requestedCategory = req.query.category;
  const categoryFilter = parseRevenueCategoryOrNull(requestedCategory);

  if (!parsedStartDate || !parsedEndDate) {
    return res.status(400).json({ error: "startDate and endDate are required as valid ISO dates (YYYY-MM-DD)" });
  }

  if (parsedStartDate > parsedEndDate) {
    return res.status(400).json({ error: "startDate must be on or before endDate" });
  }

  if (requestedCategory && !categoryFilter) {
    return res.status(400).json({ error: "category must be a known revenue category" });
  }

  const start = new Date(`${parsedStartDate}T00:00:00Z`);
  const end = new Date(`${parsedEndDate}T00:00:00Z`);
  const daySpan = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (daySpan > 730) {
    return res.status(400).json({ error: "Date range too large. Maximum is 730 days." });
  }

  try {
    await ensureStoreSchemaAndCatalog(tenantId);

    const detailResult = await pool.query(
      `with charge_totals as (
         select
           e.appointment_id,
           max(e.id)::text as encounter_id,
           coalesce(sum(
             case
               when c.status is null or c.status not in ('void', 'voided') then coalesce(c.amount_cents, 0)
               else 0
             end
           ), 0)::bigint as total_charges_cents,
           string_agg(distinct coalesce(c.cpt_code, ''), ',') as cpt_codes,
           string_agg(distinct coalesce(c.description, ''), ' | ') as line_descriptions
         from encounters e
         left join charges c
           on c.encounter_id = e.id
          and c.tenant_id = e.tenant_id
         where e.tenant_id = $1
         group by e.appointment_id
       ),
       appointment_bill_totals as (
         select
           e.appointment_id,
           string_agg(distinct b.bill_number, ', ') as bill_number,
           max(b.status) as status,
           coalesce(sum(b.paid_amount_cents), 0)::bigint as paid_amount_cents,
           coalesce(sum(b.balance_cents), 0)::bigint as balance_cents,
           string_agg(distinct coalesce(b.notes, ''), ' | ') as notes
         from bills b
         join encounters e
           on e.id = b.encounter_id
          and e.tenant_id = b.tenant_id
         where b.tenant_id = $1
         group by e.appointment_id
       ),
       appointment_revenue as (
         select
           coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date::text as day,
           'appointment'::text as source_type,
           a.id::text as source_id,
           at.name::text as source_label,
           concat_ws(' ', p.first_name, p.last_name) as patient_name,
           pr.full_name::text as provider_name,
           abt.bill_number,
           coalesce(abt.status, 'unbilled') as status,
           coalesce(ct.total_charges_cents, 0)::bigint as total_charges_cents,
           coalesce(abt.paid_amount_cents, 0)::bigint as paid_amount_cents,
           coalesce(abt.balance_cents, 0)::bigint as balance_cents,
           abt.notes,
           at.name::text as appointment_type_name,
           ct.cpt_codes,
           ct.line_descriptions,
           ct.encounter_id,
           null::text as category_override
         from appointments a
         join appointment_types at
           on at.id = a.appointment_type_id
         left join patients p
           on p.id = a.patient_id
          and p.tenant_id = a.tenant_id
         left join providers pr
           on pr.id = a.provider_id
          and pr.tenant_id = a.tenant_id
         left join charge_totals ct
           on ct.appointment_id = a.id
         left join appointment_bill_totals abt
           on abt.appointment_id = a.id
         where a.tenant_id = $1
           and a.status = 'completed'
           and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date >= $2::date
           and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date <= $3::date
           and coalesce(ct.total_charges_cents, 0) > 0
       ),
       standalone_bill_revenue as (
         select
           b.bill_date::date::text as day,
           'bill'::text as source_type,
           b.id::text as source_id,
           coalesce(b.bill_number, b.id)::text as source_label,
           concat_ws(' ', p.first_name, p.last_name) as patient_name,
           null::text as provider_name,
           b.bill_number,
           b.status,
           coalesce(b.total_charges_cents, 0)::bigint as total_charges_cents,
           coalesce(b.paid_amount_cents, 0)::bigint as paid_amount_cents,
           coalesce(b.balance_cents, 0)::bigint as balance_cents,
           b.notes,
           max(at.name)::text as appointment_type_name,
           string_agg(distinct coalesce(bli.cpt_code, ''), ',') as cpt_codes,
           string_agg(distinct coalesce(bli.description, ''), ' | ') as line_descriptions,
           b.encounter_id::text as encounter_id,
           null::text as category_override
         from bills b
         left join patients p
           on p.id = b.patient_id
          and p.tenant_id = b.tenant_id
         left join bill_line_items bli
           on bli.bill_id = b.id
          and bli.tenant_id = b.tenant_id
         left join encounters e
           on e.id = b.encounter_id
          and e.tenant_id = b.tenant_id
         left join appointments a
           on a.id = e.appointment_id
          and a.tenant_id = b.tenant_id
         left join appointment_types at
           on at.id = a.appointment_type_id
         where b.tenant_id = $1
           and b.encounter_id is null
           and b.bill_date >= $2::date
           and b.bill_date <= $3::date
           and coalesce(b.total_charges_cents, 0) > 0
         group by b.id, b.bill_date, b.bill_number, b.status, b.total_charges_cents, b.paid_amount_cents, b.balance_cents, b.notes, b.encounter_id, p.first_name, p.last_name
       ),
       store_revenue as (
         select
           ps.sale_date::date::text as day,
           'store_order'::text as source_type,
           ps.id::text as source_id,
           'Patient portal store order'::text as source_label,
           concat_ws(' ', p.first_name, p.last_name) as patient_name,
           null::text as provider_name,
           null::text as bill_number,
           ps.status,
           (coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0))::bigint as total_charges_cents,
           (coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0))::bigint as paid_amount_cents,
           0::bigint as balance_cents,
           ''::text as notes,
           null::text as appointment_type_name,
           'STORE'::text as cpt_codes,
           string_agg(distinct coalesce(psi.product_name, 'Store product'), ' | ') as line_descriptions,
           null::text as encounter_id,
           'product_sale'::text as category_override
         from product_sales ps
         left join patients p
           on p.id::text = ps.patient_id::text
          and p.tenant_id = ps.tenant_id
         left join store_order_fulfillments sof
           on sof.sale_id::text = ps.id::text
          and sof.tenant_id = ps.tenant_id
         left join product_sale_items psi
           on psi.sale_id::text = ps.id::text
         where ps.tenant_id = $1
           and ps.status = 'completed'
           and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
           and ps.sale_date::date >= $2::date
           and ps.sale_date::date <= $3::date
           and (coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0)) > 0
         group by ps.id, ps.sale_date, ps.total, ps.status, sof.shipping_fee, p.first_name, p.last_name
       )
       select *
       from appointment_revenue
       union all
       select *
       from standalone_bill_revenue
       union all
       select *
       from store_revenue
       order by day desc, total_charges_cents desc`,
      [tenantId, parsedStartDate, parsedEndDate],
    );

    const allRows = (Array.isArray(detailResult.rows) ? (detailResult.rows as RevenueDetailQueryRow[]) : [])
      .map((row) => {
        const categoryKey = classifyRevenueDetailRow(row);
        return {
          sourceType: row.source_type,
          sourceId: row.source_id,
          sourceLabel: row.source_label || row.source_id,
          revenueDate: row.day,
          categoryKey,
          categoryLabel: revenueCategoryLabel(categoryKey),
          patientName: row.patient_name || "Unknown patient",
          providerName: row.provider_name || null,
          billNumber: row.bill_number || null,
          status: row.status || null,
          totalChargesCents: parseCents(row.total_charges_cents),
          paidAmountCents: parseCents(row.paid_amount_cents),
          balanceCents: parseCents(row.balance_cents),
          notes: row.notes || null,
          appointmentTypeName: row.appointment_type_name || null,
          cptCodes: row.cpt_codes || null,
          lineDescriptions: row.line_descriptions || null,
          encounterId: row.encounter_id || null,
        };
      });

    const categoryAccumulator = createRevenueCategoryAccumulator();
    allRows.forEach((row) => {
      addRevenueCategory(categoryAccumulator, row.categoryKey, row.totalChargesCents);
    });

    const rows = categoryFilter ? allRows.filter((row) => row.categoryKey === categoryFilter) : allRows;

    res.json({
      rows,
      summary: {
        itemCount: rows.length,
        totalRevenueCents: rows.reduce((sum, row) => sum + row.totalChargesCents, 0),
        paidAmountCents: rows.reduce((sum, row) => sum + row.paidAmountCents, 0),
        balanceCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
        categories: summarizeRevenueCategories(categoryAccumulator),
      },
      period: {
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        category: categoryFilter,
      },
    });
  } catch (error) {
    logFinancialMetricsError("Error fetching revenue details", error);
    res.status(500).json({ error: "Failed to fetch revenue details" });
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
  const { period = 'mtd', startDate: requestedStartDate, endDate: requestedEndDate } = req.query;

  const today = new Date();
  let startDate: Date;
  let endDate = today;
  const explicitStartDate = parseIsoDateOrNull(requestedStartDate);
  const explicitEndDate = parseIsoDateOrNull(requestedEndDate);

  // Calculate date range based on period
  if (explicitStartDate && explicitEndDate) {
    if (explicitStartDate > explicitEndDate) {
      return res.status(400).json({ error: "startDate must be on or before endDate" });
    }
    startDate = new Date(`${explicitStartDate}T00:00:00Z`);
    endDate = new Date(`${explicitEndDate}T00:00:00Z`);
  } else if (period === 'mtd') {
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
      `select avg(pp.payment_date::date - b.bill_date::date)::int as avg_days
       from patient_payments pp
       join bills b on b.tenant_id = pp.tenant_id
        and (
          b.patient_id = pp.patient_id
          or b.id = pp.applied_to_invoice_id
        )
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
         and submitted_at < ($3::date + interval '1 day')`,
      [tenantId, startDateStr, endDateStr],
    );

    const acceptedFirstPassResult = await optionalFinancialQuery(
      `select count(*) as accepted
       from claims c
       where c.tenant_id = $1
         and c.submitted_at >= $2
         and c.submitted_at < ($3::date + interval '1 day')
         and c.status in ('accepted', 'paid')
         and not exists (
           select 1 from claim_status_history csh
           where csh.claim_id = c.id
             and csh.status = 'rejected'
         )`,
      [tenantId, startDateStr, endDateStr],
      [{ accepted: "0" }],
    );

    const totalClaims = parseInt(totalClaimsResult.rows[0].total);
    const acceptedFirstPass = parseInt(acceptedFirstPassResult.rows[0]?.accepted || "0");
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
         and submitted_at < ($3::date + interval '1 day')`,
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
        type: explicitStartDate && explicitEndDate ? "custom" : period,
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
      `with claim_by_encounter as (
         select
           encounter_id,
           max(coalesce(payer_name, payer)) as payer_name,
           count(*)::int as claim_count
         from claims
         where tenant_id = $1
         group by encounter_id
       ),
       patient_applied_by_bill as (
         select
           applied_to_invoice_id as bill_id,
           coalesce(sum(amount_cents), 0) as patient_collections_cents
         from patient_payments
         where tenant_id = $1
           and status = 'posted'
           and applied_to_invoice_id is not null
           and payment_date >= $2::date
           and payment_date <= $3::date
         group by applied_to_invoice_id
       ),
       payer_applied_by_encounter as (
         select
           c.encounter_id,
           coalesce(sum(ppli.amount_cents), 0) as payer_collections_cents
         from payer_payment_line_items ppli
         join claims c
           on c.id = ppli.claim_id
          and c.tenant_id = ppli.tenant_id
         join payer_payments pp
           on pp.id = ppli.payer_payment_id
          and pp.tenant_id = ppli.tenant_id
         where ppli.tenant_id = $1
           and pp.payment_date >= $2::date
           and pp.payment_date <= $3::date
         group by c.encounter_id
       ),
       bill_rows as (
         select
           b.id,
           coalesce(cbe.payer_name, p.insurance_plan_name, 'Self-Pay') as payer,
           coalesce(cbe.claim_count, 0) as claim_count,
           coalesce(b.total_charges_cents, 0) as charges_cents,
           coalesce(pabb.patient_collections_cents, 0) as patient_collections_cents,
           coalesce(pabe.payer_collections_cents, 0) as payer_collections_cents
         from bills b
         join patients p
           on p.id = b.patient_id
          and p.tenant_id = b.tenant_id
         left join claim_by_encounter cbe
           on cbe.encounter_id = b.encounter_id
         left join patient_applied_by_bill pabb
           on pabb.bill_id = b.id
         left join payer_applied_by_encounter pabe
           on pabe.encounter_id = b.encounter_id
         where b.tenant_id = $1
           and b.bill_date >= $2::date
           and b.bill_date <= $3::date
       )
       select
         payer,
         sum(claim_count)::int as claim_count,
         coalesce(sum(charges_cents), 0)::bigint as charges,
         coalesce(sum(patient_collections_cents + payer_collections_cents), 0)::bigint as collections
       from bill_rows
       group by payer
       order by collections desc, charges desc
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
        coalesce(c.cpt_code, 'UNSPECIFIED') as "cptCode",
        coalesce(c.description, 'Unspecified service') as description,
        count(*)::int as procedure_count,
        coalesce(sum(coalesce(c.amount_cents, c.fee_cents * coalesce(c.quantity, 1), 0)), 0)::bigint as revenue
       from charges c
       left join encounters e
         on e.id = c.encounter_id
        and e.tenant_id = c.tenant_id
       left join appointments a
         on a.id = e.appointment_id
        and a.tenant_id = c.tenant_id
       where c.tenant_id = $1
         and coalesce(c.status, 'posted') <> 'void'
         and coalesce(c.service_date, a.completed_at::date, c.created_at::date) >= $2::date
         and coalesce(c.service_date, a.completed_at::date, c.created_at::date) <= $3::date
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
        count(distinct e.id)::int as "encounterCount",
        count(distinct e.patient_id)::int as "patientCount",
        coalesce(sum(coalesce(c.amount_cents, c.fee_cents * coalesce(c.quantity, 1), 0)), 0)::bigint as "totalCharges",
        coalesce(
          avg(extract(epoch from (coalesce(a.completed_at, a.scheduled_end) - coalesce(a.checked_in_at, a.scheduled_start))) / 60)
            filter (where a.id is not null and a.completed_at is not null),
          0
        )::int as "avgVisitMinutes"
       from providers pr
       left join encounters e
         on e.provider_id = pr.id
        and e.tenant_id = $1
       left join appointments a
         on a.id = e.appointment_id
        and a.tenant_id = e.tenant_id
       left join charges c
         on c.encounter_id = e.id
        and c.tenant_id = e.tenant_id
        and coalesce(c.status, 'posted') <> 'void'
       where pr.tenant_id = $1
         and (
           e.id is null
           or coalesce(c.service_date, a.completed_at::date, a.scheduled_start::date, e.created_at::date) >= $2::date
         )
         and (
           e.id is null
           or coalesce(c.service_date, a.completed_at::date, a.scheduled_start::date, e.created_at::date) <= $3::date
         )
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
        count(*)::int as count
       from charges c
       left join encounters e
         on e.id = c.encounter_id
        and e.tenant_id = c.tenant_id
       left join appointments a
         on a.id = e.appointment_id
        and a.tenant_id = c.tenant_id
       where c.tenant_id = $1
         and c.cpt_code like '992%'
         and coalesce(c.status, 'posted') <> 'void'
         and coalesce(c.service_date, a.completed_at::date, c.created_at::date) >= $2::date
         and coalesce(c.service_date, a.completed_at::date, c.created_at::date) <= $3::date
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
  const requestedAsOfDate = req.query.asOfDate;
  const parsedAsOfDate = parseIsoDateOrNull(requestedAsOfDate);
  const asOfDate = parsedAsOfDate || toIsoDate(new Date());

  if (requestedAsOfDate && !parsedAsOfDate) {
    return res.status(400).json({ error: "asOfDate must be a valid ISO date (YYYY-MM-DD)" });
  }

  try {
    const date30 = addDays(asOfDate, -30);
    const date60 = addDays(asOfDate, -60);
    const date90 = addDays(asOfDate, -90);

    const result = await pool.query(
      `with aged_claims as (
         select
           case
             when submitted_at::date >= $2::date then 'Current'
             when submitted_at::date >= $3::date and submitted_at::date < $2::date then '30-60 Days'
             when submitted_at::date >= $4::date and submitted_at::date < $3::date then '60-90 Days'
             else '90+ Days'
           end as bucket,
           case
             when submitted_at::date >= $2::date then 1
             when submitted_at::date >= $3::date and submitted_at::date < $2::date then 2
             when submitted_at::date >= $4::date and submitted_at::date < $3::date then 3
             else 4
           end as sort_order,
           coalesce(total_cents, 0) as total_cents
         from claims
         where tenant_id = $1
           and status not in ('paid', 'rejected')
           and submitted_at is not null
           and submitted_at::date <= $5::date
       )
       select
         bucket,
         count(*)::int as claim_count,
         coalesce(sum(total_cents), 0)::bigint as total_amount
       from aged_claims
       group by bucket, sort_order
       order by sort_order`,
      [tenantId, date30, date60, date90, asOfDate],
    );

    res.json({
      asOfDate,
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
