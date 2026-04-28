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

export interface FinancialSnapshotPeriod {
  key: 'daily' | 'weekly' | 'monthly';
  label: string;
  rangeLabel: string;
  completedAppointments: number;
  actualRevenueCents: number;
  benchmarkRevenueCents: number;
  standaloneRevenueCents: number;
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
  collected_on: string;
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

function parseSnapshotDate(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split('-').map(Number);
    const year = parts[0] ?? Number.NaN;
    const month = parts[1] ?? Number.NaN;
    const day = parts[2] ?? Number.NaN;
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfRollingWeek(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() - 6);
  return result;
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

function formatRangeLabel(start: Date, end: Date): string {
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
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

export async function getFinancialSnapshots(tenantId: string): Promise<FinancialSnapshots> {
  const now = new Date();
  const dailyStart = startOfDay(now);
  const weeklyStart = startOfRollingWeek(now);
  const monthlyStart = startOfMonth(now);
  const maxStart = monthlyStart;

  const [appointmentRevenueResult, patientCollectionsResult, payerCollectionsResult, standaloneRevenueResult] =
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
         AND COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start) <= $3
       GROUP BY a.id, COALESCE(a.completed_at, a.scheduled_end, a.scheduled_start), at.name, at.duration_minutes`,
      [tenantId, maxStart.toISOString(), now.toISOString()]
    ),
    pool.query(
      `SELECT
         payment_date::date AS collected_on,
         SUM(amount_cents) AS amount_cents
       FROM patient_payments
       WHERE tenant_id = $1
         AND payment_date >= $2::date
         AND payment_date <= $3::date
         AND status = 'posted'
       GROUP BY payment_date::date`,
      [tenantId, maxStart.toISOString(), now.toISOString()]
    ),
    pool.query(
      `SELECT
         payment_date::date AS collected_on,
         SUM(applied_amount_cents) AS amount_cents
       FROM payer_payments
       WHERE tenant_id = $1
         AND payment_date >= $2::date
         AND payment_date <= $3::date
       GROUP BY payment_date::date`,
      [tenantId, maxStart.toISOString(), now.toISOString()]
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
      [tenantId, maxStart.toISOString(), now.toISOString()]
    ),
  ]);

  const periods: Array<{ key: FinancialSnapshotPeriod['key']; label: string; start: Date; rangeLabel: string }> = [
    { key: 'daily', label: 'Daily Snapshot', start: dailyStart, rangeLabel: 'Today' },
    { key: 'weekly', label: 'Weekly Snapshot', start: weeklyStart, rangeLabel: formatRangeLabel(weeklyStart, now) },
    { key: 'monthly', label: 'Monthly Snapshot', start: monthlyStart, rangeLabel: formatMonthLabel(now) },
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
      if (completedAt < period.start || completedAt > now) {
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
      if (billedOn < period.start || billedOn > now) {
        continue;
      }

      const bucket = snapshots[period.key];
      bucket.standaloneRevenueCents += totalRevenueCents;
      bucket.totalRevenueCents += totalRevenueCents;
      addRevenueCategory(categoryAccumulators[period.key], categoryKey, totalRevenueCents);
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
      if (collectedOn < period.start || collectedOn > now) {
        continue;
      }

      snapshots[period.key].collectionsCents += amountCents;
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
