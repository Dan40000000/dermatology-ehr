import { pool } from '../db/pool';
import {
  CMS_2026_VISIT_RATE_SOURCE_NOTE,
  inferVisitRevenueBenchmark,
} from '../data/appointmentRevenueBenchmarks';
import {
  classifyRevenueCategory,
  revenueCategoryLabel,
  type RevenueCategoryKey,
  type RevenueCategorySummary,
} from './financialRevenueCategories';
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getUtcRangeForPracticeDate,
} from '../lib/practiceTimeZone';
import { ensureStoreSchemaAndCatalog } from './productSalesService';

export interface FinancialSnapshotPeriod {
  key: 'daily' | 'weekly' | 'monthly';
  label: string;
  rangeLabel: string;
  completedAppointments: number;
  actualRevenueCents: number;
  benchmarkRevenueCents: number;
  standaloneRevenueCents: number;
  storeRevenueCents: number;
  badDebtCents: number;
  collectionsReferralBalanceCents: number;
  collectionsReferralCount: number;
  totalRevenueCents: number;
  collectionsCents: number;
  avgRevenuePerVisitCents: number;
  benchmarkVisitsCount: number;
  collectionRate: number;
  revenueCategories: RevenueCategorySummary[];
}

export interface FinancialSnapshots {
  daily: FinancialSnapshotPeriod;
  weekly: FinancialSnapshotPeriod;
  monthly: FinancialSnapshotPeriod;
  sourceNote: string;
}

interface AppointmentRevenueRow {
  appointment_id: string;
  completed_at: string;
  appointment_type_name: string | null;
  duration_minutes: number | null;
  actual_charge_cents: string | number | null;
}

interface CollectionRow {
  collected_on: string | Date;
  amount_cents: string | number | null;
}

interface StandaloneBillRevenueRow {
  bill_id: string;
  billed_on: string;
  total_charges_cents: string | number | null;
  notes: string | null;
  appointment_type_name: string | null;
  cpt_codes: string | null;
  line_descriptions: string | null;
}

interface ProductSaleRevenueRow {
  sale_id: string;
  sold_on: string;
  total_cents: string | number | null;
}

interface BadDebtRow {
  bill_id: string;
  written_off_on: string;
  amount_cents: string | number | null;
}

interface CollectionsReferralRow {
  referred_on: string;
  balance_cents: string | number | null;
}

function parseSnapshotDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return getUtcRangeForPracticeDate(value).start;
    } catch {
      return null;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthStartDateKey(dateKey: string): string {
  return `${dateKey.slice(0, 8)}01`;
}

function dateKeyToUtcDate(dateKey: string): Date {
  const [yearPart, monthPart, dayPart] = dateKey.split('-').map(Number);
  const year = Number.isFinite(yearPart ?? Number.NaN) ? Number(yearPart) : 1970;
  const month = Number.isFinite(monthPart ?? Number.NaN) ? Number(monthPart) : 1;
  const day = Number.isFinite(dayPart ?? Number.NaN) ? Number(dayPart) : 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfPracticeDate(dateKey: string): Date {
  return getUtcRangeForPracticeDate(dateKey).start;
}

function parseCents(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return 0;
}

function formatRangeLabel(startDateKey: string, endDateKey: string): string {
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${dateFormatter.format(dateKeyToUtcDate(startDateKey))} - ${dateFormatter.format(dateKeyToUtcDate(endDateKey))}`;
}

function formatMonthLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateKeyToUtcDate(dateKey));
}

function buildEmptyPeriod(
  key: FinancialSnapshotPeriod['key'],
  label: string,
  rangeLabel: string
): FinancialSnapshotPeriod {
  return {
    key,
    label,
    rangeLabel,
    completedAppointments: 0,
    actualRevenueCents: 0,
    benchmarkRevenueCents: 0,
    standaloneRevenueCents: 0,
    storeRevenueCents: 0,
    badDebtCents: 0,
    collectionsReferralBalanceCents: 0,
    collectionsReferralCount: 0,
    totalRevenueCents: 0,
    collectionsCents: 0,
    avgRevenuePerVisitCents: 0,
    benchmarkVisitsCount: 0,
    collectionRate: 0,
    revenueCategories: [],
  };
}

function createCategoryAccumulator(): Record<RevenueCategoryKey, RevenueCategorySummary> {
  return {
    office_visit: { key: 'office_visit', label: revenueCategoryLabel('office_visit'), revenueCents: 0, itemCount: 0 },
    procedure: { key: 'procedure', label: revenueCategoryLabel('procedure'), revenueCents: 0, itemCount: 0 },
    cosmetic: { key: 'cosmetic', label: revenueCategoryLabel('cosmetic'), revenueCents: 0, itemCount: 0 },
    late_fee: { key: 'late_fee', label: revenueCategoryLabel('late_fee'), revenueCents: 0, itemCount: 0 },
    no_show_fee: { key: 'no_show_fee', label: revenueCategoryLabel('no_show_fee'), revenueCents: 0, itemCount: 0 },
    product_sale: { key: 'product_sale', label: revenueCategoryLabel('product_sale'), revenueCents: 0, itemCount: 0 },
    other: { key: 'other', label: revenueCategoryLabel('other'), revenueCents: 0, itemCount: 0 },
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

export async function getFinancialSnapshots(
  tenantId: string,
  referenceDateKey = getDateKeyInTimeZone(new Date()),
): Promise<FinancialSnapshots> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const todayDateKey = referenceDateKey;
  const weeklyStartDateKey = addDaysToDateKey(todayDateKey, -6);
  const monthlyStartDateKey = getMonthStartDateKey(todayDateKey);
  const dailyStart = startOfPracticeDate(todayDateKey);
  const weeklyStart = startOfPracticeDate(weeklyStartDateKey);
  const monthlyStart = startOfPracticeDate(monthlyStartDateKey);
  const periodEnd = startOfPracticeDate(addDaysToDateKey(todayDateKey, 1));
  const maxStart = monthlyStart;

  const [
    appointmentRevenueResult,
    patientCollectionsResult,
    payerCollectionsResult,
    standaloneRevenueResult,
    productSalesResult,
    badDebtResult,
    collectionsReferralResult,
  ] =
    await Promise.all([
    pool.query(
      `SELECT
         a.id AS appointment_id,
         COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start) AS completed_at,
         at.name AS appointment_type_name,
         at.duration_minutes,
         COALESCE(
           SUM(
             CASE
               WHEN c.status IS NULL OR c.status <> 'void' THEN COALESCE(c.amount_cents, 0)
               ELSE 0
             END
           ),
           0
         ) AS actual_charge_cents
       FROM appointments a
       JOIN appointment_types at ON at.id = a.appointment_type_id
       LEFT JOIN encounters e
         ON e.appointment_id = a.id
        AND e.tenant_id = a.tenant_id
       LEFT JOIN charges c
         ON c.encounter_id = e.id
        AND c.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1
         AND a.status = 'completed'
         AND COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start) >= $2
         AND COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start) < $3
       GROUP BY a.id, COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start), at.name, at.duration_minutes`,
      [tenantId, maxStart.toISOString(), periodEnd.toISOString()]
    ),
    pool.query(
      `SELECT
         payment_date::date::text AS collected_on,
         SUM(amount_cents) AS amount_cents
       FROM patient_payments
       WHERE tenant_id = $1
         AND payment_date >= $2::date
         AND payment_date <= $3::date
         AND status = 'posted'
       GROUP BY payment_date::date`,
      [tenantId, monthlyStartDateKey, todayDateKey]
    ),
    pool.query(
      `SELECT
         payment_date::date::text AS collected_on,
         SUM(applied_amount_cents) AS amount_cents
       FROM payer_payments
       WHERE tenant_id = $1
         AND payment_date >= $2::date
         AND payment_date <= $3::date
       GROUP BY payment_date::date`,
      [tenantId, monthlyStartDateKey, todayDateKey]
    ),
    pool.query(
      `SELECT
         b.id AS bill_id,
         b.bill_date::date::text AS billed_on,
         b.total_charges_cents,
         b.notes,
         MAX(at.name) AS appointment_type_name,
         STRING_AGG(DISTINCT COALESCE(bli.cpt_code, ''), ',') AS cpt_codes,
         STRING_AGG(DISTINCT COALESCE(bli.description, ''), ' | ') AS line_descriptions
       FROM bills b
       LEFT JOIN bill_line_items bli
         ON bli.bill_id = b.id
        AND bli.tenant_id = b.tenant_id
       LEFT JOIN encounters e
         ON e.id = b.encounter_id
        AND e.tenant_id = b.tenant_id
       LEFT JOIN appointments a
         ON a.id = e.appointment_id
        AND a.tenant_id = b.tenant_id
       LEFT JOIN appointment_types at
         ON at.id = a.appointment_type_id
       WHERE b.tenant_id = $1
         AND b.encounter_id IS NULL
         AND b.bill_date >= $2::date
         AND b.bill_date <= $3::date
       GROUP BY b.id, b.bill_date, b.total_charges_cents, b.notes`,
      [tenantId, monthlyStartDateKey, todayDateKey]
    ),
    pool.query(
      `SELECT
         ps.id AS sale_id,
         ps.sale_date::date::text AS sold_on,
         COALESCE(ps.total, 0) + COALESCE(sof.shipping_fee, 0) AS total_cents
       FROM product_sales ps
       LEFT JOIN store_order_fulfillments sof
         ON sof.sale_id::text = ps.id::text
        AND sof.tenant_id = ps.tenant_id
       WHERE ps.tenant_id = $1
         AND ps.status = 'completed'
         AND COALESCE(sof.stripe_payment_status, 'paid') IN ('paid', 'succeeded')
         AND ps.sale_date >= $2
         AND ps.sale_date < $3`,
      [tenantId, maxStart.toISOString(), periodEnd.toISOString()]
    ).catch((error) => {
      if ((error as any)?.code === '42P01' || (error as any)?.code === '42703') {
        return { rows: [] };
      }
      throw error;
    }),
    pool.query(
      `SELECT
         b.id AS bill_id,
         COALESCE(b.written_off_at, b.updated_at)::date::text AS written_off_on,
         GREATEST(0, COALESCE(b.adjustment_amount_cents, 0)) AS amount_cents
       FROM bills b
       WHERE b.tenant_id = $1
         AND (b.status = 'written_off' OR b.follow_up_status = 'write_off' OR b.written_off_at IS NOT NULL)
         AND COALESCE(b.written_off_at, b.updated_at) >= $2
         AND COALESCE(b.written_off_at, b.updated_at) < $3`,
      [tenantId, maxStart.toISOString(), periodEnd.toISOString()]
    ).catch((error) => {
      if ((error as any)?.code === '42703') {
        return { rows: [] };
      }
      throw error;
    }),
    pool.query(
      `SELECT
         COALESCE(b.collections_flagged_at, b.updated_at)::date::text AS referred_on,
         COALESCE(b.balance_cents, 0) AS balance_cents
       FROM bills b
       WHERE b.tenant_id = $1
         AND COALESCE(b.balance_cents, 0) > 0
         AND b.status NOT IN ('paid', 'cancelled', 'written_off')
         AND (
           b.follow_up_status = 'collections'
           OR b.collections_status IN ('flagged', 'sent_to_collections')
         )
         AND COALESCE(b.collections_flagged_at, b.updated_at) < $2`,
      [tenantId, periodEnd.toISOString()]
    ).catch((error) => {
      if ((error as any)?.code === '42703') {
        return { rows: [] };
      }
      throw error;
    }),
  ]);

  const periods: Array<{ key: FinancialSnapshotPeriod['key']; label: string; start: Date; rangeLabel: string }> = [
    { key: 'daily', label: 'Daily Snapshot', start: dailyStart, rangeLabel: 'Today' },
    { key: 'weekly', label: 'Weekly Snapshot', start: weeklyStart, rangeLabel: formatRangeLabel(weeklyStartDateKey, todayDateKey) },
    { key: 'monthly', label: 'Monthly Snapshot', start: monthlyStart, rangeLabel: formatMonthLabel(todayDateKey) },
  ];

  const snapshots = Object.fromEntries(
    periods.map((period) => [period.key, buildEmptyPeriod(period.key, period.label, period.rangeLabel)])
  ) as Record<FinancialSnapshotPeriod['key'], FinancialSnapshotPeriod>;
  const categoryAccumulators = Object.fromEntries(
    periods.map((period) => [period.key, createCategoryAccumulator()])
  ) as Record<FinancialSnapshotPeriod['key'], Record<RevenueCategoryKey, RevenueCategorySummary>>;

  const appointments = Array.isArray(appointmentRevenueResult.rows)
    ? (appointmentRevenueResult.rows as AppointmentRevenueRow[])
    : [];

  for (const appointment of appointments) {
    const completedAt = parseSnapshotDate(appointment.completed_at);
    if (!completedAt) {
      continue;
    }

    const actualRevenueCents = parseCents(appointment.actual_charge_cents);
    const benchmark = inferVisitRevenueBenchmark({
      appointmentTypeName: appointment.appointment_type_name,
      durationMinutes: appointment.duration_minutes,
    });
    const benchmarkRevenueCents = actualRevenueCents > 0 ? 0 : benchmark.amountCents;
    const totalRevenueCents = actualRevenueCents > 0 ? actualRevenueCents : benchmarkRevenueCents;

    for (const period of periods) {
      if (completedAt < period.start || completedAt >= periodEnd) {
        continue;
      }

      const bucket = snapshots[period.key];
      const categoryKey = classifyRevenueCategory({
        appointmentTypeName: appointment.appointment_type_name,
        encounterBacked: true,
      });
      bucket.completedAppointments += 1;
      bucket.actualRevenueCents += actualRevenueCents;
      bucket.benchmarkRevenueCents += benchmarkRevenueCents;
      bucket.totalRevenueCents += totalRevenueCents;
      if (benchmarkRevenueCents > 0) {
        bucket.benchmarkVisitsCount += 1;
      }
      addRevenueCategory(categoryAccumulators[period.key], categoryKey, totalRevenueCents);
    }
  }

  const standaloneBillRows = Array.isArray(standaloneRevenueResult.rows)
    ? (standaloneRevenueResult.rows as StandaloneBillRevenueRow[])
    : [];

  for (const bill of standaloneBillRows) {
    const billedOn = parseSnapshotDate(bill.billed_on);
    if (!billedOn) {
      continue;
    }

    const totalRevenueCents = parseCents(bill.total_charges_cents);
    if (totalRevenueCents <= 0) {
      continue;
    }

    const categoryKey = classifyRevenueCategory({
      appointmentTypeName: bill.appointment_type_name,
      notes: bill.notes,
      cptCodes: bill.cpt_codes,
      lineDescriptions: bill.line_descriptions,
      encounterBacked: false,
    });

    for (const period of periods) {
      if (billedOn < period.start || billedOn >= periodEnd) {
        continue;
      }

      const bucket = snapshots[period.key];
      bucket.standaloneRevenueCents += totalRevenueCents;
      bucket.totalRevenueCents += totalRevenueCents;
      addRevenueCategory(categoryAccumulators[period.key], categoryKey, totalRevenueCents);
    }
  }

  const productSales = Array.isArray(productSalesResult.rows)
    ? (productSalesResult.rows as ProductSaleRevenueRow[])
    : [];

  for (const sale of productSales) {
    const soldOn = parseSnapshotDate(sale.sold_on);
    if (!soldOn) {
      continue;
    }

    const totalRevenueCents = parseCents(sale.total_cents);
    if (totalRevenueCents <= 0) {
      continue;
    }

    for (const period of periods) {
      if (soldOn < period.start || soldOn >= periodEnd) {
        continue;
      }

      const bucket = snapshots[period.key];
      bucket.storeRevenueCents += totalRevenueCents;
      bucket.totalRevenueCents += totalRevenueCents;
      bucket.collectionsCents += totalRevenueCents;
      addRevenueCategory(categoryAccumulators[period.key], 'product_sale', totalRevenueCents);
    }
  }

  const collectionRows = [
    ...(Array.isArray(patientCollectionsResult.rows) ? (patientCollectionsResult.rows as CollectionRow[]) : []),
    ...(Array.isArray(payerCollectionsResult.rows) ? (payerCollectionsResult.rows as CollectionRow[]) : []),
  ];

  for (const collection of collectionRows) {
    const collectedOn = parseSnapshotDate(collection.collected_on);
    if (!collectedOn) {
      continue;
    }
    const amountCents = parseCents(collection.amount_cents);

    for (const period of periods) {
      if (collectedOn < period.start || collectedOn >= periodEnd) {
        continue;
      }

      snapshots[period.key].collectionsCents += amountCents;
    }
  }

  const badDebtRows = Array.isArray(badDebtResult.rows)
    ? (badDebtResult.rows as BadDebtRow[])
    : [];
  for (const badDebt of badDebtRows) {
    const writtenOffOn = parseSnapshotDate(badDebt.written_off_on);
    if (!writtenOffOn) {
      continue;
    }
    const amountCents = parseCents(badDebt.amount_cents);
    if (amountCents <= 0) {
      continue;
    }
    for (const period of periods) {
      if (writtenOffOn < period.start || writtenOffOn >= periodEnd) {
        continue;
      }
      snapshots[period.key].badDebtCents += amountCents;
    }
  }

  const referralRows = Array.isArray(collectionsReferralResult.rows)
    ? (collectionsReferralResult.rows as CollectionsReferralRow[])
    : [];
  for (const referral of referralRows) {
    const balanceCents = parseCents(referral.balance_cents);
    if (balanceCents <= 0) {
      continue;
    }
    for (const period of periods) {
      snapshots[period.key].collectionsReferralBalanceCents += balanceCents;
      snapshots[period.key].collectionsReferralCount += 1;
    }
  }

  for (const period of periods) {
    const bucket = snapshots[period.key];
    bucket.avgRevenuePerVisitCents =
      bucket.completedAppointments > 0
        ? Math.round(bucket.totalRevenueCents / bucket.completedAppointments)
        : 0;
    bucket.collectionRate =
      bucket.totalRevenueCents > 0
        ? Number(((bucket.collectionsCents / bucket.totalRevenueCents) * 100).toFixed(1))
        : 0;
    bucket.revenueCategories = Object.values(categoryAccumulators[period.key])
      .filter((category) => category.revenueCents > 0)
      .sort((left, right) => right.revenueCents - left.revenueCents);
  }

  return {
    daily: snapshots.daily,
    weekly: snapshots.weekly,
    monthly: snapshots.monthly,
    sourceNote: CMS_2026_VISIT_RATE_SOURCE_NOTE,
  };
}
