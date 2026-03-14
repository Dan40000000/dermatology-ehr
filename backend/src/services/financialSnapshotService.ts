import { pool } from '../db/pool';
import {
  CMS_2026_VISIT_RATE_SOURCE_NOTE,
  inferVisitRevenueBenchmark,
} from '../data/appointmentRevenueBenchmarks';

export interface FinancialSnapshotPeriod {
  key: 'daily' | 'weekly' | 'monthly';
  label: string;
  rangeLabel: string;
  completedAppointments: number;
  actualRevenueCents: number;
  benchmarkRevenueCents: number;
  totalRevenueCents: number;
  collectionsCents: number;
  avgRevenuePerVisitCents: number;
  benchmarkVisitsCount: number;
  collectionRate: number;
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
    totalRevenueCents: 0,
    collectionsCents: 0,
    avgRevenuePerVisitCents: 0,
    benchmarkVisitsCount: 0,
    collectionRate: 0,
  };
}

export async function getFinancialSnapshots(tenantId: string): Promise<FinancialSnapshots> {
  const now = new Date();
  const dailyStart = startOfDay(now);
  const weeklyStart = startOfRollingWeek(now);
  const monthlyStart = startOfMonth(now);
  const maxStart = monthlyStart;

  const [appointmentRevenueResult, patientCollectionsResult, payerCollectionsResult] = await Promise.all([
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
  ]);

  const periods: Array<{ key: FinancialSnapshotPeriod['key']; label: string; start: Date; rangeLabel: string }> = [
    { key: 'daily', label: 'Daily Snapshot', start: dailyStart, rangeLabel: 'Today' },
    { key: 'weekly', label: 'Weekly Snapshot', start: weeklyStart, rangeLabel: formatRangeLabel(weeklyStart, now) },
    { key: 'monthly', label: 'Monthly Snapshot', start: monthlyStart, rangeLabel: formatMonthLabel(now) },
  ];

  const snapshots = Object.fromEntries(
    periods.map((period) => [period.key, buildEmptyPeriod(period.key, period.label, period.rangeLabel)])
  ) as Record<FinancialSnapshotPeriod['key'], FinancialSnapshotPeriod>;

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
      bucket.completedAppointments += 1;
      bucket.actualRevenueCents += actualRevenueCents;
      bucket.benchmarkRevenueCents += benchmarkRevenueCents;
      bucket.totalRevenueCents += totalRevenueCents;
      if (benchmarkRevenueCents > 0) {
        bucket.benchmarkVisitsCount += 1;
      }
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
  }

  return {
    daily: snapshots.daily,
    weekly: snapshots.weekly,
    monthly: snapshots.monthly,
    sourceNote: CMS_2026_VISIT_RATE_SOURCE_NOTE,
  };
}
