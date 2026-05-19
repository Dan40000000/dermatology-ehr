import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import {
  FINANCIAL_DASHBOARD_ROLES,
  REVENUE_CYCLE_ROLES,
  userHasAnyRole,
} from "../lib/roles";
import {
  getDateKeyInTimeZone,
  getPracticeTimeZone,
  getUtcInstantForPracticeDateTime,
  getUtcRangeForPracticeDate,
} from "../lib/practiceTimeZone";
import { logger } from "../lib/logger";

export const commandCenterRouter = Router();

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMAND_CENTER_SCHEDULE_ROLES = [
  "admin",
  "front_desk",
  "scheduler",
  "manager",
  "provider",
  "ma",
  "nurse",
  "billing",
  "compliance_officer",
];

type FailedSource = {
  source: string;
  message: string;
};

type ScheduleSummary = {
  appointmentsCount: number;
  activeAppointmentsCount: number;
  checkedInCount: number;
  completedCount: number;
  waitingCount: number;
  inRoomsCount: number;
  checkoutCount: number;
  staleScheduledCount: number;
  noShowCount: number;
  cancelledCount: number;
  needsInsuranceVerification: number;
  balanceDueAppointments: number;
  copayDueCents: number;
};

type ClaimsSummary = {
  claimsInQueue: number;
  claimsDeniedRejected: number;
};

type FinancialSummary = {
  revenueTodayCents: number;
  netCollectionsCents: number;
  patientCollectionsCents: number;
  payerCollectionsCents: number;
  storeCollectionsCents: number;
  collectionRateToday: number;
  financialWorkQueueCount: number;
  claimWorkQueueCount: number;
  billingWorkQueueCount: number;
  arTotalCents: number;
  arOver90Cents: number;
};

const emptyScheduleSummary = (): ScheduleSummary => ({
  appointmentsCount: 0,
  activeAppointmentsCount: 0,
  checkedInCount: 0,
  completedCount: 0,
  waitingCount: 0,
  inRoomsCount: 0,
  checkoutCount: 0,
  staleScheduledCount: 0,
  noShowCount: 0,
  cancelledCount: 0,
  needsInsuranceVerification: 0,
  balanceDueAppointments: 0,
  copayDueCents: 0,
});

const emptyClaimsSummary = (): ClaimsSummary => ({
  claimsInQueue: 0,
  claimsDeniedRejected: 0,
});

const emptyFinancialSummary = (): FinancialSummary => ({
  revenueTodayCents: 0,
  netCollectionsCents: 0,
  patientCollectionsCents: 0,
  payerCollectionsCents: 0,
  storeCollectionsCents: 0,
  collectionRateToday: 0,
  financialWorkQueueCount: 0,
  claimWorkQueueCount: 0,
  billingWorkQueueCount: 0,
  arTotalCents: 0,
  arOver90Cents: 0,
});

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDateQuery(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function getCommandAsOfInstant(dateKey: string, timeZone: string): Date {
  const currentPracticeDate = getDateKeyInTimeZone(new Date(), timeZone);
  if (dateKey === currentPracticeDate) {
    return new Date();
  }

  return getUtcInstantForPracticeDateTime(dateKey, 17, 0, timeZone);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

async function loadScheduleSummary(
  tenantId: string,
  dateKey: string,
  timeZone: string,
): Promise<ScheduleSummary> {
  const { start, end } = getUtcRangeForPracticeDate(dateKey, timeZone);
  const asOf = getCommandAsOfInstant(dateKey, timeZone);

  const result = await pool.query(
    `with day_appointments as (
       select
         a.id,
         a.patient_id,
         lower(coalesce(a.status, 'scheduled')) as status,
         a.scheduled_start,
         a.scheduled_end,
         coalesce(a.arrived_at, a.checked_in_at) as arrived_at,
         a.roomed_at,
         p.eligibility_status,
         p.eligibility_checked_at,
         p.copay_amount_cents,
         coalesce((
           select sum(coalesce(b.balance_cents, 0))
           from bills b
           where b.tenant_id = a.tenant_id
             and b.patient_id = a.patient_id
             and b.status not in ('paid', 'written_off', 'cancelled')
         ), 0) as balance_due_cents
       from appointments a
       left join patients p
         on p.id = a.patient_id
        and p.tenant_id = a.tenant_id
       where a.tenant_id = $1
         and a.scheduled_start >= $2::timestamptz
         and a.scheduled_start < $3::timestamptz
     )
     select
       count(*) filter (where status <> 'cancelled') as appointments_count,
       count(*) filter (where status not in ('completed', 'checked_out', 'cancelled', 'no_show')) as active_appointments_count,
       count(*) filter (where status = 'checked_in') as checked_in_count,
       count(*) filter (where status in ('completed', 'checked_out')) as completed_count,
       count(*) filter (where status = 'checked_in') as waiting_count,
       count(*) filter (where status in ('in_room', 'with_provider')) as in_rooms_count,
       count(*) filter (where status in ('completed', 'checked_out')) as checkout_count,
       count(*) filter (
         where status = 'scheduled'
           and coalesce(scheduled_end, scheduled_start) + interval '15 minutes' < $4::timestamptz
       ) as stale_scheduled_count,
       count(*) filter (where status = 'no_show') as no_show_count,
       count(*) filter (where status = 'cancelled') as cancelled_count,
       count(*) filter (
         where status not in ('completed', 'checked_out', 'cancelled', 'no_show')
           and (
             eligibility_status is null
             or lower(eligibility_status) in ('unknown', 'pending', 'inactive', 'error', 'failed')
             or eligibility_checked_at is null
           )
       ) as needs_insurance_verification,
       count(*) filter (
         where status not in ('completed', 'checked_out', 'cancelled', 'no_show')
           and coalesce(balance_due_cents, 0) > 0
       ) as balance_due_appointments,
       coalesce(sum(
         case
           when status not in ('completed', 'checked_out', 'cancelled', 'no_show')
             then coalesce(copay_amount_cents, 0)
           else 0
         end
       ), 0) as copay_due_cents
     from day_appointments`,
    [tenantId, start.toISOString(), end.toISOString(), asOf.toISOString()],
  );

  const row = result.rows[0] || {};
  return {
    appointmentsCount: toNumber(row.appointments_count),
    activeAppointmentsCount: toNumber(row.active_appointments_count),
    checkedInCount: toNumber(row.checked_in_count),
    completedCount: toNumber(row.completed_count),
    waitingCount: toNumber(row.waiting_count),
    inRoomsCount: toNumber(row.in_rooms_count),
    checkoutCount: toNumber(row.checkout_count),
    staleScheduledCount: toNumber(row.stale_scheduled_count),
    noShowCount: toNumber(row.no_show_count),
    cancelledCount: toNumber(row.cancelled_count),
    needsInsuranceVerification: toNumber(row.needs_insurance_verification),
    balanceDueAppointments: toNumber(row.balance_due_appointments),
    copayDueCents: toNumber(row.copay_due_cents),
  };
}

async function loadClaimsSummary(tenantId: string): Promise<ClaimsSummary> {
  const result = await pool.query(
    `select
       count(*) filter (
         where lower(coalesce(status, '')) in ('draft', 'coding_review', 'ready', 'submitted', 'accepted', 'partially_paid')
       ) as claims_in_queue,
       count(*) filter (
         where lower(coalesce(status, '')) in ('denied', 'rejected', 'appealed')
            or lower(coalesce(scrub_status, '')) = 'failed'
       ) as claims_denied_rejected
     from claims
     where tenant_id = $1`,
    [tenantId],
  );

  const row = result.rows[0] || {};
  return {
    claimsInQueue: toNumber(row.claims_in_queue),
    claimsDeniedRejected: toNumber(row.claims_denied_rejected),
  };
}

async function loadFinancialSummary(tenantId: string, dateKey: string): Promise<FinancialSummary> {
  const [
    collectionsResult,
    workQueueResult,
    arResult,
  ] = await Promise.all([
    pool.query(
      `with patient as (
         select coalesce(sum(amount_cents), 0) as patient_collections_cents
         from patient_payments
         where tenant_id = $1
           and status = 'posted'
           and payment_date = $2::date
       ),
       payer as (
         select coalesce(sum(applied_amount_cents), 0) as payer_collections_cents
         from payer_payments
         where tenant_id = $1
           and payment_date = $2::date
       ),
       store as (
         select coalesce(sum(coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0)), 0) as store_collections_cents
         from product_sales ps
         left join store_order_fulfillments sof
           on sof.sale_id::text = ps.id::text
          and sof.tenant_id = ps.tenant_id
         where ps.tenant_id = $1
           and ps.status = 'completed'
           and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
           and ps.sale_date::date = $2::date
       ),
       appointment_revenue as (
         select coalesce(sum(revenue_earned_cents), 0) as revenue_cents
         from (
           select
             a.id,
             coalesce(sum(
               case
                 when c.status is null or c.status <> 'void' then coalesce(c.amount_cents, 0)
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
             and coalesce(a.completed_at, a.scheduled_end, a.scheduled_start)::date = $2::date
           group by a.id
         ) revenue_rows
       ),
       standalone_bill_revenue as (
         select coalesce(sum(total_charges_cents), 0) as revenue_cents
         from bills
         where tenant_id = $1
           and encounter_id is null
           and bill_date = $2::date
       ),
       store_revenue as (
         select coalesce(sum(coalesce(ps.total, 0) + coalesce(sof.shipping_fee, 0)), 0) as revenue_cents
         from product_sales ps
         left join store_order_fulfillments sof
           on sof.sale_id::text = ps.id::text
          and sof.tenant_id = ps.tenant_id
         where ps.tenant_id = $1
           and ps.status = 'completed'
           and coalesce(sof.stripe_payment_status, 'paid') in ('paid', 'succeeded')
           and ps.sale_date::date = $2::date
       )
       select
         patient.patient_collections_cents,
         payer.payer_collections_cents,
         store.store_collections_cents,
         (
           appointment_revenue.revenue_cents
           + standalone_bill_revenue.revenue_cents
           + store_revenue.revenue_cents
         ) as revenue_today_cents
       from patient, payer, store, appointment_revenue, standalone_bill_revenue, store_revenue`,
      [tenantId, dateKey],
    ),
    pool.query(
      `select
         count(*) filter (where status not in ('completed', 'cancelled', 'closed', 'done', 'resolved')) as financial_work_queue_count,
         count(*) filter (
           where status not in ('completed', 'cancelled', 'closed', 'done', 'resolved')
             and claim_id is not null
             and bill_id is null
         ) as claim_work_queue_count,
         count(*) filter (
           where status not in ('completed', 'cancelled', 'closed', 'done', 'resolved')
             and (bill_id is not null or claim_id is null)
         ) as billing_work_queue_count
       from financial_work_queue
       where tenant_id = $1`,
      [tenantId],
    ),
    pool.query(
      `select
         coalesce(sum(balance_cents), 0) as ar_total_cents,
         coalesce(sum(
           case
             when coalesce(due_date, service_date_start, bill_date, created_at::date) < $2::date - interval '90 days'
               then balance_cents
             else 0
           end
         ), 0) as ar_over_90_cents
       from bills
       where tenant_id = $1
         and balance_cents > 0
         and status not in ('paid', 'written_off', 'cancelled')`,
      [tenantId, dateKey],
    ),
  ]);

  const collections = collectionsResult.rows[0] || {};
  const workQueue = workQueueResult.rows[0] || {};
  const ar = arResult.rows[0] || {};
  const patientCollectionsCents = toNumber(collections.patient_collections_cents);
  const payerCollectionsCents = toNumber(collections.payer_collections_cents);
  const storeCollectionsCents = toNumber(collections.store_collections_cents);
  const netCollectionsCents = patientCollectionsCents + payerCollectionsCents;
  const totalCollectionsCents = netCollectionsCents + storeCollectionsCents;
  const revenueTodayCents = toNumber(collections.revenue_today_cents);

  return {
    revenueTodayCents,
    netCollectionsCents,
    patientCollectionsCents,
    payerCollectionsCents,
    storeCollectionsCents,
    collectionRateToday:
      revenueTodayCents > 0 ? Math.round((totalCollectionsCents / revenueTodayCents) * 100) : 0,
    financialWorkQueueCount: toNumber(workQueue.financial_work_queue_count),
    claimWorkQueueCount: toNumber(workQueue.claim_work_queue_count),
    billingWorkQueueCount: toNumber(workQueue.billing_work_queue_count),
    arTotalCents: toNumber(ar.ar_total_cents),
    arOver90Cents: toNumber(ar.ar_over_90_cents),
  };
}

async function safeSection<T>(
  source: string,
  failedSources: FailedSource[],
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    const message = getErrorMessage(error);
    failedSources.push({ source, message });
    logger.warn("Command Center summary source unavailable", { source, error: message });
    return fallback;
  }
}

commandCenterRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const queryDate = parseDateQuery(req.query.date);
  if (req.query.date && !queryDate) {
    return res.status(400).json({ error: "date must use YYYY-MM-DD format" });
  }

  const tenantId = req.tenantId || req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Missing tenant" });
  }

  const timeZone = getPracticeTimeZone();
  const businessDate = queryDate || getDateKeyInTimeZone(new Date(), timeZone);
  const failedSources: FailedSource[] = [];
  const canSeeSchedule = userHasAnyRole(req.user, COMMAND_CENTER_SCHEDULE_ROLES);
  const canSeeClaims = userHasAnyRole(req.user, REVENUE_CYCLE_ROLES) || userHasAnyRole(req.user, FINANCIAL_DASHBOARD_ROLES);
  const canSeeFinancials = userHasAnyRole(req.user, FINANCIAL_DASHBOARD_ROLES);

  const [schedule, claims, financials] = await Promise.all([
    canSeeSchedule
      ? safeSection(
          "schedule",
          failedSources,
          () => loadScheduleSummary(tenantId, businessDate, timeZone),
          emptyScheduleSummary(),
        )
      : Promise.resolve(null),
    canSeeClaims
      ? safeSection("claims", failedSources, () => loadClaimsSummary(tenantId), emptyClaimsSummary())
      : Promise.resolve(null),
    canSeeFinancials
      ? safeSection("financials", failedSources, () => loadFinancialSummary(tenantId, businessDate), emptyFinancialSummary())
      : Promise.resolve(null),
  ]);

  return res.json({
    businessDate,
    practiceTimeZone: timeZone,
    generatedAt: new Date().toISOString(),
    dataHealth: {
      failedSources,
    },
    schedule,
    claims,
    financials,
  });
});
