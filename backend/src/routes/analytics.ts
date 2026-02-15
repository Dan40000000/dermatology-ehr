import { Router, Response } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { analyticsService, DateRange } from "../services/analyticsService";
import { logger } from "../lib/logger";
import { userHasRole } from "../lib/roles";

export const analyticsRouter = Router();

// Helper to parse date range from query params
function parseDateRange(query: any): DateRange {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    startDate: query.startDate || (thirtyDaysAgo.toISOString().split('T')[0] ?? ''),
    endDate: query.endDate || (today.toISOString().split('T')[0] ?? ''),
  };
}

analyticsRouter.use(rateLimit({ windowMs: 60_000, max: 120 }));

analyticsRouter.get("/summary", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const [patientsRes, apptRes, encRes, chargeRes, providersRes, revenueRes] = await Promise.all([
    pool.query(`select count(*) from patients where tenant_id = $1`, [tenantId]),
    pool.query(`select count(*) from appointments where tenant_id = $1`, [tenantId]),
    pool.query(`select count(*) from encounters where tenant_id = $1`, [tenantId]),
    pool.query(`select count(*) from charges where tenant_id = $1`, [tenantId]),
    pool.query(`select count(*) from providers where tenant_id = $1`, [tenantId]),
    pool.query(`select coalesce(sum(amount_cents),0) as total from charges where tenant_id = $1`, [tenantId]),
  ]);
  res.json({
    counts: {
      patients: Number(patientsRes.rows[0].count),
      appointments: Number(apptRes.rows[0].count),
      encounters: Number(encRes.rows[0].count),
      charges: Number(chargeRes.rows[0].count),
      providers: Number(providersRes.rows[0].count),
      revenueCents: Number(revenueRes.rows[0].total),
    },
  });
});

analyticsRouter.get("/appointments-by-day", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, providerId } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";
  if (providerId) {
    params.push(providerId);
    where += ` and provider_id = $${params.length}`;
  }
  if (startDate) {
    params.push(startDate);
    where += ` and scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and scheduled_start <= $${params.length}`;
  }
  const result = await pool.query(
    `select date_trunc('day', scheduled_start) as day, count(*) as count
     from appointments
     where ${where}
     group by 1
     order by day desc
     limit 14`,
    params,
  );
  res.json({ points: result.rows });
});

analyticsRouter.get("/appointments-by-provider", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, providerId } = req.query;
  const params: any[] = [tenantId];
  let where = "a.tenant_id = $1";
  if (providerId) {
    params.push(providerId);
    where += ` and a.provider_id = $${params.length}`;
  }
  if (startDate) {
    params.push(startDate);
    where += ` and a.scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and a.scheduled_start <= $${params.length}`;
  }
  const result = await pool.query(
    `select pr.full_name as provider, count(*) as count
     from appointments a
     join providers pr on pr.id = a.provider_id
     where ${where}
     group by pr.full_name
     order by count desc`,
    params,
  );
  res.json({ points: result.rows });
});

analyticsRouter.get("/status-counts", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate, providerId } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";
  if (providerId) {
    params.push(providerId);
    where += ` and provider_id = $${params.length}`;
  }
  if (startDate) {
    params.push(startDate);
    where += ` and scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and scheduled_start <= $${params.length}`;
  }
  const result = await pool.query(
    `select status, count(*) as count from appointments where ${where} group by status`,
    params,
  );
  res.json({ points: result.rows });
});

analyticsRouter.get("/revenue-by-day", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";
  if (startDate) {
    params.push(startDate);
    where += ` and created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and created_at <= $${params.length}`;
  }
  const result = await pool.query(
    `select date_trunc('day', created_at) as day, sum(amount_cents) as amount
     from charges
     where ${where}
     group by 1
     order by day desc
     limit 14`,
    params,
  );
  res.json({ points: result.rows });
});

// GET /api/analytics/dashboard - Get dashboard summary (all KPIs)
analyticsRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let dateWhere = "";

  if (startDate && endDate) {
    params.push(startDate, endDate);
    dateWhere = ` and scheduled_start >= $${params.length - 1} and scheduled_start <= $${params.length}`;
  }

  const [
    totalPatientsRes,
    todayAppointmentsRes,
    monthRevenueRes,
    activeEncountersRes,
  ] = await Promise.all([
    pool.query(`select count(*) from patients where tenant_id = $1`, [tenantId]),
    pool.query(
      `select count(*) from appointments
       where tenant_id = $1
       and date_trunc('day', scheduled_start) = current_date
       and status in ('scheduled', 'checked_in')`,
      [tenantId]
    ),
    pool.query(
      `select coalesce(sum(amount_cents), 0) as total
       from charges
       where tenant_id = $1
       and date_trunc('month', created_at) = date_trunc('month', current_date)`,
      [tenantId]
    ),
    pool.query(
      `select count(*) from encounters where tenant_id = $1 and status = 'draft'`,
      [tenantId]
    ),
  ]);

  res.json({
    totalPatients: Number(totalPatientsRes.rows[0].count),
    todayAppointments: Number(todayAppointmentsRes.rows[0].count),
    monthRevenue: Number(monthRevenueRes.rows[0].total),
    activeEncounters: Number(activeEncountersRes.rows[0].count),
  });
});

// GET /api/analytics/appointments/trend - Appointment trend over time
analyticsRouter.get("/appointments/trend", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and scheduled_start <= $${params.length}`;
  }

  const result = await pool.query(
    `select date_trunc('day', scheduled_start) as date, count(*) as count
     from appointments
     where ${where}
     group by 1
     order by date asc`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/revenue/trend - Revenue trend over time
analyticsRouter.get("/revenue/trend", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `select date_trunc('day', created_at) as date, sum(amount_cents) as revenue
     from charges
     where ${where}
     group by 1
     order by date asc`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/top-diagnoses - Top 10 diagnoses
analyticsRouter.get("/top-diagnoses", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "ed.tenant_id = $1";

  if (startDate || endDate) {
    where += " and e.id in (select id from encounters where tenant_id = $1";
    if (startDate) {
      params.push(startDate);
      where += ` and created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      where += ` and created_at <= $${params.length}`;
    }
    where += ")";
  }

  const result = await pool.query(
    `select ed.description as name, count(*) as count
     from encounter_diagnoses ed
     join encounters e on e.id = ed.encounter_id
     where ${where}
     group by ed.description
     order by count desc
     limit 10`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/top-procedures - Top 10 procedures
analyticsRouter.get("/top-procedures", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1 and description is not null";

  if (startDate) {
    params.push(startDate);
    where += ` and created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `select description as name, count(*) as count
     from charges
     where ${where}
     group by description
     order by count desc
     limit 10`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/provider-productivity - Stats per provider
analyticsRouter.get("/provider-productivity", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let appointmentWhere = "a.tenant_id = $1";
  let encounterWhere = "e.tenant_id = $1";
  let chargeWhere = "c.tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    appointmentWhere += ` and a.scheduled_start >= $${params.length}`;
    encounterWhere += ` and e.created_at >= $${params.length}`;
    chargeWhere += ` and c.created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    appointmentWhere += ` and a.scheduled_start <= $${params.length}`;
    encounterWhere += ` and e.created_at <= $${params.length}`;
    chargeWhere += ` and c.created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `select
       p.id,
       p.full_name as provider_name,
       count(distinct pt.id) as patients_seen,
       count(distinct a.id) as appointments,
       coalesce(sum(c.amount_cents), 0) as revenue_cents
     from providers p
     left join appointments a on a.provider_id = p.id and ${appointmentWhere.replace('a.tenant_id', 'a.tenant_id')}
     left join encounters e on e.provider_id = p.id and ${encounterWhere.replace('e.tenant_id', 'e.tenant_id')}
     left join patients pt on pt.id = e.patient_id
     left join charges c on c.encounter_id = e.id and ${chargeWhere.replace('c.tenant_id', 'c.tenant_id')}
     where p.tenant_id = $1
     group by p.id, p.full_name
     order by revenue_cents desc`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/patient-demographics - Age groups, gender distribution
analyticsRouter.get("/patient-demographics", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  const ageGroupsResult = await pool.query(
    `select
       case
         when date_part('year', age(current_date, dob)) < 18 then '0-17'
         when date_part('year', age(current_date, dob)) between 18 and 34 then '18-34'
         when date_part('year', age(current_date, dob)) between 35 and 54 then '35-54'
         when date_part('year', age(current_date, dob)) between 55 and 74 then '55-74'
         else '75+'
       end as age_group,
       count(*) as count
     from patients
     where tenant_id = $1 and dob is not null
     group by age_group
     order by age_group`,
    [tenantId]
  );

  const genderResult = await pool.query(
    `select
       coalesce(sex, 'Unknown') as gender,
       count(*) as count
     from patients
     where tenant_id = $1
     group by sex
     order by count desc`,
    [tenantId]
  );

  res.json({
    ageGroups: ageGroupsResult.rows,
    gender: genderResult.rows
  });
});

// GET /api/analytics/appointment-types - Distribution by type
analyticsRouter.get("/appointment-types", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "a.tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and a.scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and a.scheduled_start <= $${params.length}`;
  }

  const result = await pool.query(
    `select
       at.name as type_name,
       count(*) as count
     from appointments a
     join appointment_types at on at.id = a.appointment_type_id
     where ${where}
     group by at.name
     order by count desc`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/overview - Comprehensive overview with key metrics
analyticsRouter.get("/overview", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  // Calculate comparison period (previous period of same length)
  let currentStart = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let currentEnd = endDate ? new Date(endDate as string) : new Date();
  const periodLength = currentEnd.getTime() - currentStart.getTime();
  const previousStart = new Date(currentStart.getTime() - periodLength);
  const previousEnd = new Date(currentStart.getTime());

  const params = [tenantId, currentStart.toISOString(), currentEnd.toISOString()];
  const prevParams = [tenantId, previousStart.toISOString(), previousEnd.toISOString()];

  const [
    currentPatients,
    previousPatients,
    currentAppointments,
    previousAppointments,
    currentRevenue,
    previousRevenue,
    appointmentStatusBreakdown,
    collectionRate,
  ] = await Promise.all([
    // Current period new patients
    pool.query(
      `select count(*) from patients where tenant_id = $1 and created_at >= $2 and created_at <= $3`,
      params
    ),
    // Previous period new patients
    pool.query(
      `select count(*) from patients where tenant_id = $1 and created_at >= $2 and created_at <= $3`,
      prevParams
    ),
    // Current period appointments
    pool.query(
      `select count(*) from appointments where tenant_id = $1 and scheduled_start >= $2 and scheduled_start <= $3`,
      params
    ),
    // Previous period appointments
    pool.query(
      `select count(*) from appointments where tenant_id = $1 and scheduled_start >= $2 and scheduled_start <= $3`,
      prevParams
    ),
    // Current period revenue
    pool.query(
      `select coalesce(sum(amount_cents), 0) as total from charges where tenant_id = $1 and created_at >= $2 and created_at <= $3`,
      params
    ),
    // Previous period revenue
    pool.query(
      `select coalesce(sum(amount_cents), 0) as total from charges where tenant_id = $1 and created_at >= $2 and created_at <= $3`,
      prevParams
    ),
    // Appointment status breakdown for current period
    pool.query(
      `select status, count(*) as count from appointments where tenant_id = $1 and scheduled_start >= $2 and scheduled_start <= $3 group by status`,
      params
    ),
    // Collection rate
    pool.query(
      `select
        coalesce(sum(amount_cents), 0) as total_charges,
        coalesce(sum(case when status = 'paid' then amount_cents else 0 end), 0) as paid_charges
       from charges
       where tenant_id = $1`,
      [tenantId]
    ),
  ]);

  const currentNewPatients = Number(currentPatients.rows[0].count);
  const previousNewPatients = Number(previousPatients.rows[0].count);
  const currentAppts = Number(currentAppointments.rows[0].count);
  const previousAppts = Number(previousAppointments.rows[0].count);
  const currentRev = Number(currentRevenue.rows[0].total);
  const previousRev = Number(previousRevenue.rows[0].total);

  const totalCharges = Number(collectionRate.rows[0].total_charges);
  const paidCharges = Number(collectionRate.rows[0].paid_charges);
  const collectionRatePercent = totalCharges > 0 ? (paidCharges / totalCharges) * 100 : 0;

  // Calculate trends
  const patientTrend = previousNewPatients > 0
    ? ((currentNewPatients - previousNewPatients) / previousNewPatients) * 100
    : currentNewPatients > 0 ? 100 : 0;

  const appointmentTrend = previousAppts > 0
    ? ((currentAppts - previousAppts) / previousAppts) * 100
    : currentAppts > 0 ? 100 : 0;

  const revenueTrend = previousRev > 0
    ? ((currentRev - previousRev) / previousRev) * 100
    : currentRev > 0 ? 100 : 0;

  res.json({
    newPatients: {
      current: currentNewPatients,
      previous: previousNewPatients,
      trend: patientTrend,
    },
    appointments: {
      current: currentAppts,
      previous: previousAppts,
      trend: appointmentTrend,
      byStatus: appointmentStatusBreakdown.rows,
    },
    revenue: {
      current: currentRev,
      previous: previousRev,
      trend: revenueTrend,
    },
    collectionRate: collectionRatePercent,
  });
});

// GET /api/analytics/appointments - Appointment statistics with detailed breakdown
analyticsRouter.get("/appointments", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and scheduled_start >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and scheduled_start <= $${params.length}`;
  }

  const [statusBreakdown, typeBreakdown, providerBreakdown, avgWaitTime] = await Promise.all([
    pool.query(
      `select status, count(*) as count from appointments where ${where} group by status`,
      params
    ),
    pool.query(
      `select at.name as type_name, count(*) as count
       from appointments a
       join appointment_types at on at.id = a.appointment_type_id
       where ${where}
       group by at.name
       order by count desc`,
      params
    ),
    pool.query(
      `select p.full_name as provider_name, count(*) as count
       from appointments a
       join providers p on p.id = a.provider_id
       where ${where}
       group by p.full_name
       order by count desc`,
      params
    ),
    // Calculate average wait time (time between scheduled and actual start)
    pool.query(
      `select avg(extract(epoch from (checked_in_at - scheduled_start))/60) as avg_wait_minutes
       from appointments
       where ${where} and checked_in_at is not null and scheduled_start is not null`,
      params
    ),
  ]);

  res.json({
    byStatus: statusBreakdown.rows,
    byType: typeBreakdown.rows,
    byProvider: providerBreakdown.rows,
    avgWaitTimeMinutes: avgWaitTime.rows[0]?.avg_wait_minutes || 0,
  });
});

// GET /api/analytics/revenue - Revenue metrics with payments and collections
analyticsRouter.get("/revenue", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and created_at <= $${params.length}`;
  }

  const [chargeStats, paymentStats, procedureRevenue] = await Promise.all([
    pool.query(
      `select
        count(*) as total_charges,
        sum(amount_cents) as total_billed,
        sum(case when status = 'paid' then amount_cents else 0 end) as total_paid,
        sum(case when status = 'pending' then amount_cents else 0 end) as total_pending,
        sum(case when status = 'denied' then amount_cents else 0 end) as total_denied
       from charges
       where ${where}`,
      params
    ),
    // Get payment methods breakdown
    pool.query(
      `select
        payment_method,
        count(*) as count,
        sum(amount_cents) as total_amount
       from patient_payments
       where tenant_id = $1 and status = 'completed'
       ${startDate ? `and created_at >= $${params.length}` : ''}
       ${endDate ? `and created_at <= $${params.length + (startDate ? 1 : 0)}` : ''}
       group by payment_method`,
      startDate || endDate ? [...params.slice(1)] : []
    ),
    // Top revenue generating procedures
    pool.query(
      `select
        description,
        count(*) as count,
        sum(amount_cents) as total_revenue
       from charges
       where ${where} and description is not null
       group by description
       order by total_revenue desc
       limit 10`,
      params
    ),
  ]);

  const stats = chargeStats.rows[0];
  const totalBilled = Number(stats.total_billed) || 0;
  const totalPaid = Number(stats.total_paid) || 0;
  const collectionRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;

  res.json({
    summary: {
      totalCharges: Number(stats.total_charges) || 0,
      totalBilled,
      totalPaid,
      totalPending: Number(stats.total_pending) || 0,
      totalDenied: Number(stats.total_denied) || 0,
      collectionRate,
    },
    paymentMethods: paymentStats.rows,
    topProcedures: procedureRevenue.rows,
  });
});

// GET /api/analytics/patients - Patient demographics and trends
analyticsRouter.get("/patients", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  const [totalPatients, newPatients, demographics, payerMix] = await Promise.all([
    pool.query(`select count(*) from patients where tenant_id = $1`, [tenantId]),
    pool.query(
      `select
        date_trunc('month', created_at) as month,
        count(*) as count
       from patients
       where tenant_id = $1
       ${startDate ? `and created_at >= $2` : ''}
       ${endDate ? `and created_at <= $${startDate ? '3' : '2'}` : ''}
       group by date_trunc('month', created_at)
       order by month desc
       limit 12`,
      startDate || endDate
        ? [tenantId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
        : [tenantId]
    ),
    pool.query(
      `select
         case
           when date_part('year', age(current_date, dob)) < 18 then '0-17'
           when date_part('year', age(current_date, dob)) between 18 and 34 then '18-34'
           when date_part('year', age(current_date, dob)) between 35 and 54 then '35-54'
           when date_part('year', age(current_date, dob)) between 55 and 74 then '55-74'
           else '75+'
         end as age_group,
         coalesce(sex, 'Unknown') as gender,
         count(*) as count
       from patients
       where tenant_id = $1 and dob is not null
       group by age_group, gender
       order by age_group, gender`,
      [tenantId]
    ),
    // Payer mix
    pool.query(
      `select
        insurance_provider,
        count(*) as count
       from patients
       where tenant_id = $1 and insurance_provider is not null
       group by insurance_provider
       order by count desc
       limit 10`,
      [tenantId]
    ),
  ]);

  res.json({
    totalPatients: Number(totalPatients.rows[0].count),
    newPatientsPerMonth: newPatients.rows,
    demographics: demographics.rows,
    payerMix: payerMix.rows,
  });
});

// GET /api/analytics/providers - Provider productivity metrics
analyticsRouter.get("/providers", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let appointmentWhere = "a.tenant_id = $1";
  let encounterWhere = "e.tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    appointmentWhere += ` and a.scheduled_start >= $${params.length}`;
    encounterWhere += ` and e.created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    appointmentWhere += ` and a.scheduled_start <= $${params.length}`;
    encounterWhere += ` and e.created_at <= $${params.length}`;
  }

  const result = await pool.query(
    `select
       p.id,
       p.full_name as provider_name,
       count(distinct a.id) filter (where a.status = 'completed') as completed_appointments,
       count(distinct a.id) filter (where a.status = 'cancelled') as cancelled_appointments,
       count(distinct a.id) filter (where a.status = 'no_show') as no_shows,
       count(distinct e.id) as total_encounters,
       count(distinct e.patient_id) as unique_patients,
       coalesce(sum(c.amount_cents), 0) as revenue_cents,
       coalesce(avg(extract(epoch from (a.checked_out_at - a.checked_in_at))/60), 0) as avg_visit_duration_minutes
     from providers p
     left join appointments a on a.provider_id = p.id and ${appointmentWhere.replace('a.tenant_id', 'a.tenant_id')}
     left join encounters e on e.provider_id = p.id and ${encounterWhere.replace('e.tenant_id', 'e.tenant_id')}
     left join charges c on c.encounter_id = e.id
     where p.tenant_id = $1
     group by p.id, p.full_name
     order by revenue_cents desc`,
    params
  );

  res.json({ data: result.rows });
});

// GET /api/analytics/quality - Quality measures and compliance metrics
analyticsRouter.get("/quality", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;
  const params: any[] = [tenantId];
  let where = "tenant_id = $1";

  if (startDate) {
    params.push(startDate);
    where += ` and created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    where += ` and created_at <= $${params.length}`;
  }

  const [
    encounterCompletionRate,
    documentationCompliance,
    followUpCompliance,
  ] = await Promise.all([
    // Encounter completion rate
    pool.query(
      `select
        count(*) filter (where status = 'signed') as signed,
        count(*) filter (where status = 'draft') as draft,
        count(*) as total
       from encounters
       where ${where}`,
      params
    ),
    // Documentation compliance (encounters with required fields)
    pool.query(
      `select
        count(*) filter (where chief_complaint is not null and chief_complaint != '') as with_cc,
        count(*) filter (where assessment is not null and assessment != '') as with_assessment,
        count(*) filter (where plan is not null and plan != '') as with_plan,
        count(*) as total
       from encounters
       where ${where}`,
      params
    ),
    // Follow-up compliance
    pool.query(
      `select
        count(*) filter (where follow_up_date is not null) as with_followup,
        count(*) as total
       from encounters
       where ${where} and status = 'signed'`,
      params
    ),
  ]);

  const encounterStats = encounterCompletionRate.rows[0];
  const docStats = documentationCompliance.rows[0];
  const followUpStats = followUpCompliance.rows[0];

  const totalEncounters = Number(encounterStats.total) || 0;
  const signedEncounters = Number(encounterStats.signed) || 0;
  const completionRate = totalEncounters > 0 ? (signedEncounters / totalEncounters) * 100 : 0;

  const withCC = Number(docStats.with_cc) || 0;
  const withAssessment = Number(docStats.with_assessment) || 0;
  const withPlan = Number(docStats.with_plan) || 0;
  const ccCompliance = totalEncounters > 0 ? (withCC / totalEncounters) * 100 : 0;
  const assessmentCompliance = totalEncounters > 0 ? (withAssessment / totalEncounters) * 100 : 0;
  const planCompliance = totalEncounters > 0 ? (withPlan / totalEncounters) * 100 : 0;

  const totalSigned = Number(followUpStats.total) || 0;
  const withFollowUp = Number(followUpStats.with_followup) || 0;
  const followUpRate = totalSigned > 0 ? (withFollowUp / totalSigned) * 100 : 0;

  res.json({
    encounterCompletion: {
      rate: completionRate,
      signed: signedEncounters,
      draft: Number(encounterStats.draft) || 0,
      total: totalEncounters,
    },
    documentation: {
      chiefComplaintCompliance: ccCompliance,
      assessmentCompliance,
      planCompliance,
    },
    followUp: {
      rate: followUpRate,
      withFollowUp,
      total: totalSigned,
    },
  });
});

// ============================================================================
// COMPREHENSIVE DASHBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/dashboard/practice
 * Practice overview dashboard - today's snapshot
 */
analyticsRouter.get("/dashboard/practice", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const date = req.query.date as string | undefined;

    // Check cache first
    const cacheKey = `practice_overview_${date || 'today'}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const overview = await analyticsService.getPracticeOverview(tenantId, date);

    // Cache for 1 minute
    await analyticsService.setCache(tenantId, cacheKey, overview, 60);

    return res.json(overview);
  } catch (error) {
    logger.error('Error getting practice overview', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get practice overview' });
  }
});

/**
 * GET /api/analytics/dashboard/provider/:id
 * Provider performance dashboard
 */
analyticsRouter.get("/dashboard/provider/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.params.id!;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `provider_${providerId}_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const performance = await analyticsService.getProviderPerformance(tenantId, providerId, dateRange);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, performance, 300);

    return res.json(performance);
  } catch (error) {
    logger.error('Error getting provider performance', { error, tenantId: req.user?.tenantId, providerId: req.params.id });
    return res.status(500).json({ error: 'Failed to get provider performance' });
  }
});

/**
 * GET /api/analytics/dashboard/revenue
 * Revenue analytics dashboard
 */
analyticsRouter.get("/dashboard/revenue", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `revenue_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const analytics = await analyticsService.getRevenueAnalytics(tenantId, dateRange);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, analytics, 300);

    return res.json(analytics);
  } catch (error) {
    logger.error('Error getting revenue analytics', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get revenue analytics' });
  }
});

/**
 * GET /api/analytics/dashboard/quality
 * Quality measures dashboard
 */
analyticsRouter.get("/dashboard/quality", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `quality_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const dashboard = await analyticsService.getQualityDashboard(tenantId, dateRange);

    // Cache for 10 minutes (quality data changes less frequently)
    await analyticsService.setCache(tenantId, cacheKey, dashboard, 600);

    return res.json(dashboard);
  } catch (error) {
    logger.error('Error getting quality dashboard', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get quality dashboard' });
  }
});

/**
 * GET /api/analytics/dashboard/operations
 * Operations metrics dashboard
 */
analyticsRouter.get("/dashboard/operations", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `operations_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const dashboard = await analyticsService.getOperationsDashboard(tenantId, dateRange);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, dashboard, 300);

    return res.json(dashboard);
  } catch (error) {
    logger.error('Error getting operations dashboard', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get operations dashboard' });
  }
});

/**
 * GET /api/analytics/dashboard/engagement
 * Patient engagement dashboard
 */
analyticsRouter.get("/dashboard/engagement", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `engagement_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const dashboard = await analyticsService.getEngagementDashboard(tenantId, dateRange);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, dashboard, 300);

    return res.json(dashboard);
  } catch (error) {
    logger.error('Error getting engagement dashboard', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get engagement dashboard' });
  }
});

/**
 * GET /api/analytics/dashboard/inventory
 * Inventory status dashboard
 */
analyticsRouter.get("/dashboard/inventory", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Check cache
    const cacheKey = 'inventory_dashboard';
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const dashboard = await analyticsService.getInventoryDashboard(tenantId);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, dashboard, 300);

    return res.json(dashboard);
  } catch (error) {
    logger.error('Error getting inventory dashboard', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get inventory dashboard' });
  }
});

// ============================================================================
// METRICS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/metrics/:type
 * Get specific metrics by type
 */
analyticsRouter.get("/metrics/:type", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const metricType = req.params.type;
    const dateRange = parseDateRange(req.query);

    let data: any;
    switch (metricType) {
      case 'practice':
        data = await analyticsService.getPracticeOverview(tenantId);
        break;
      case 'revenue':
        data = await analyticsService.getRevenueAnalytics(tenantId, dateRange);
        break;
      case 'quality':
        data = await analyticsService.getQualityDashboard(tenantId, dateRange);
        break;
      case 'operations':
        data = await analyticsService.getOperationsDashboard(tenantId, dateRange);
        break;
      case 'engagement':
        data = await analyticsService.getEngagementDashboard(tenantId, dateRange);
        break;
      case 'inventory':
        data = await analyticsService.getInventoryDashboard(tenantId);
        break;
      default:
        return res.status(400).json({ error: `Unknown metric type: ${metricType}` });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error getting metrics', { error, tenantId: req.user?.tenantId, type: req.params.type });
    return res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /api/analytics/trends/:metric
 * Get trend data for a specific metric
 */
analyticsRouter.get("/trends/:metric", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const metricName = req.params.metric!;
    const dateRange = parseDateRange(req.query);
    const granularity = (req.query.granularity as 'daily' | 'weekly' | 'monthly') || 'daily';

    const trend = await analyticsService.getTrendData(tenantId, metricName, dateRange, granularity);

    return res.json(trend);
  } catch (error) {
    logger.error('Error getting trend data', { error, tenantId: req.user?.tenantId, metric: req.params.metric });
    return res.status(500).json({ error: 'Failed to get trend data' });
  }
});

/**
 * GET /api/analytics/compare
 * Compare current period to previous period
 */
analyticsRouter.get("/compare", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const metricName = req.query.metric as string;

    if (!metricName) {
      return res.status(400).json({ error: 'metric parameter is required' });
    }

    const currentRange = parseDateRange(req.query);

    // Calculate previous period (same duration before current period)
    const currentStart = new Date(currentRange.startDate);
    const currentEnd = new Date(currentRange.endDate);
    const duration = currentEnd.getTime() - currentStart.getTime();

    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);

    const previousRange: DateRange = {
      startDate: previousStart.toISOString().split('T')[0] ?? '',
      endDate: previousEnd.toISOString().split('T')[0] ?? '',
    };

    const comparison = await analyticsService.comparePeriods(tenantId, metricName, currentRange, previousRange);

    return res.json({
      metric: metricName,
      currentPeriod: currentRange,
      previousPeriod: previousRange,
      comparison,
    });
  } catch (error) {
    logger.error('Error comparing periods', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to compare periods' });
  }
});

// ============================================================================
// KPI ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/kpis
 * Get all KPIs with targets and current values
 */
analyticsRouter.get("/kpis", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const kpis = await analyticsService.getKPIsWithTargets(tenantId);
    return res.json({ kpis });
  } catch (error) {
    logger.error('Error getting KPIs', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get KPIs' });
  }
});

/**
 * GET /api/analytics/kpis/:name
 * Get specific KPI details
 */
analyticsRouter.get("/kpis/:name", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const kpiName = req.params.name;

    const kpis = await analyticsService.getKPIsWithTargets(tenantId);
    const kpi = kpis.find((k) => k.kpiName === kpiName);

    if (!kpi) {
      return res.status(404).json({ error: 'KPI not found' });
    }

    // Get trend data for the KPI
    const dateRange: DateRange = {
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '',
      endDate: new Date().toISOString().split('T')[0] ?? '',
    };
    const trend = await analyticsService.getTrendData(tenantId, kpiName!, dateRange, 'weekly');

    return res.json({ kpi, trend });
  } catch (error) {
    logger.error('Error getting KPI', { error, tenantId: req.user?.tenantId, name: req.params.name });
    return res.status(500).json({ error: 'Failed to get KPI' });
  }
});

/**
 * POST /api/analytics/kpis/targets
 * Set or update KPI targets
 */
analyticsRouter.post("/kpis/targets", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { targets } = req.body;

    if (!Array.isArray(targets)) {
      return res.status(400).json({ error: 'targets array is required' });
    }

    for (const target of targets) {
      await pool.query(
        `INSERT INTO kpi_targets (
          tenant_id, kpi_name, kpi_category, target_value, target_type,
          warning_threshold, critical_threshold, period_type, effective_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id, kpi_name, period_type, effective_date, provider_id, location_id)
        DO UPDATE SET
          target_value = $4,
          warning_threshold = $6,
          critical_threshold = $7,
          updated_at = NOW()`,
        [
          tenantId,
          target.kpiName,
          target.kpiCategory || 'general',
          target.targetValue,
          target.targetType || 'minimum',
          target.warningThreshold || null,
          target.criticalThreshold || null,
          target.periodType || 'monthly',
          target.effectiveDate || new Date().toISOString().split('T')[0],
          userId,
        ]
      );
    }

    // Invalidate KPI cache
    await analyticsService.invalidateCache(tenantId, 'kpi');

    logger.info('KPI targets updated', { tenantId, count: targets.length });

    return res.json({ success: true, updatedCount: targets.length });
  } catch (error) {
    logger.error('Error setting KPI targets', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to set KPI targets' });
  }
});

// ============================================================================
// SAVED REPORTS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/reports
 * Get saved reports for user
 */
analyticsRouter.get("/reports", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const reports = await analyticsService.getSavedReports(tenantId, userId);
    return res.json({ reports });
  } catch (error) {
    logger.error('Error getting saved reports', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get saved reports' });
  }
});

/**
 * POST /api/analytics/reports
 * Save a new report configuration
 */
analyticsRouter.post("/reports", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { name, description, reportType, filters, columns, sortBy, sortOrder, groupBy, isPublic } = req.body;

    if (!name || !reportType || !filters) {
      return res.status(400).json({ error: 'name, reportType, and filters are required' });
    }

    const reportId = await analyticsService.saveReport(tenantId, userId, {
      name,
      description,
      reportType,
      filters,
      columns,
      sortBy,
      sortOrder,
      groupBy,
      isPublic,
    });

    return res.status(201).json({ id: reportId, message: 'Report saved successfully' });
  } catch (error) {
    logger.error('Error saving report', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to save report' });
  }
});

/**
 * GET /api/analytics/reports/:id
 * Get a specific saved report configuration
 */
analyticsRouter.get("/reports/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reportId = req.params.id!;

    const report = await analyticsService.getReport(tenantId, reportId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json(report);
  } catch (error) {
    logger.error('Error getting report', { error, tenantId: req.user?.tenantId, reportId: req.params.id });
    return res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * DELETE /api/analytics/reports/:id
 * Delete a saved report
 */
analyticsRouter.delete("/reports/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const reportId = req.params.id;

    // Only allow deletion by creator or admin
    const result = await pool.query(
      `DELETE FROM saved_reports
      WHERE id = $1 AND tenant_id = $2 AND (created_by = $3 OR $4 = true)
      RETURNING id`,
      [reportId, tenantId, userId, userHasRole(req.user, 'admin')]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found or access denied' });
    }

    logger.info('Report deleted', { tenantId, reportId });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting report', { error, tenantId: req.user?.tenantId, reportId: req.params.id });
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

/**
 * POST /api/analytics/reports/:id/run
 * Execute a saved report and return data
 */
analyticsRouter.post("/reports/:id/run", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reportId = req.params.id!;

    const data = await analyticsService.runReport(tenantId, reportId);

    return res.json({ data });
  } catch (error) {
    logger.error('Error running report', { error, tenantId: req.user?.tenantId, reportId: req.params.id });
    return res.status(500).json({ error: 'Failed to run report' });
  }
});

/**
 * GET /api/analytics/reports/export/:id
 * Export report to CSV or JSON
 */
analyticsRouter.get("/reports/export/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reportId = req.params.id!;
    const format = (req.query.format as string) || 'csv';

    // Run the report first
    const data = await analyticsService.runReport(tenantId, reportId);
    const report = await analyticsService.getReport(tenantId, reportId);

    if (format === 'csv') {
      // Generate CSV
      const rows: string[] = [];

      if (data && typeof data === 'object') {
        const flatData = flattenObject(data);
        rows.push(Object.keys(flatData).join(','));
        rows.push(Object.values(flatData).map((v) => `"${v}"`).join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report.name}_${new Date().toISOString().split('T')[0]}.csv"`);

      return res.send(rows.join('\n'));
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.name}_${new Date().toISOString().split('T')[0]}.json"`);

      return res.json(data);
    } else {
      return res.status(400).json({ error: 'Unsupported format. Use csv or json' });
    }
  } catch (error) {
    logger.error('Error exporting report', { error, tenantId: req.user?.tenantId, reportId: req.params.id });
    return res.status(500).json({ error: 'Failed to export report' });
  }
});

// ============================================================================
// WIDGET ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/widgets/:dashboardType
 * Get widget configurations for a dashboard type
 */
analyticsRouter.get("/widgets/:dashboardType", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const dashboardType = req.params.dashboardType!;

    const widgets = await analyticsService.getWidgets(tenantId, dashboardType, userId);

    return res.json({ widgets });
  } catch (error) {
    logger.error('Error getting widgets', { error, tenantId: req.user?.tenantId, dashboardType: req.params.dashboardType });
    return res.status(500).json({ error: 'Failed to get widgets' });
  }
});

/**
 * PATCH /api/analytics/widgets/:id
 * Update widget position or visibility
 */
analyticsRouter.patch("/widgets/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const widgetId = req.params.id!;
    const { position, isVisible, config } = req.body;

    await analyticsService.updateWidget(tenantId, widgetId, { position, isVisible, config });

    logger.info('Widget updated', { tenantId, widgetId });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error updating widget', { error, tenantId: req.user?.tenantId, widgetId: req.params.id });
    return res.status(500).json({ error: 'Failed to update widget' });
  }
});

/**
 * POST /api/analytics/widgets
 * Create a custom widget
 */
analyticsRouter.post("/widgets", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { dashboardType, widgetName, widgetType, config, position, width, height } = req.body;

    if (!dashboardType || !widgetName || !widgetType) {
      return res.status(400).json({ error: 'dashboardType, widgetName, and widgetType are required' });
    }

    const crypto = await import('crypto');
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO dashboard_widgets (
        id, tenant_id, user_id, dashboard_type, widget_name, widget_type,
        config, position, width, height, is_visible
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
      [
        id,
        tenantId,
        userId,
        dashboardType,
        widgetName,
        widgetType,
        JSON.stringify(config || {}),
        position || 0,
        width || 1,
        height || 1,
      ]
    );

    logger.info('Widget created', { tenantId, widgetId: id });

    return res.status(201).json({ id, message: 'Widget created successfully' });
  } catch (error) {
    logger.error('Error creating widget', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to create widget' });
  }
});

/**
 * DELETE /api/analytics/widgets/:id
 * Delete a custom widget
 */
analyticsRouter.delete("/widgets/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const widgetId = req.params.id;

    // Only allow deletion of user-created widgets
    const result = await pool.query(
      `DELETE FROM dashboard_widgets
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING id`,
      [widgetId, tenantId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Widget not found or cannot delete system widgets' });
    }

    logger.info('Widget deleted', { tenantId, widgetId });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting widget', { error, tenantId: req.user?.tenantId, widgetId: req.params.id });
    return res.status(500).json({ error: 'Failed to delete widget' });
  }
});

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * POST /api/analytics/cache/invalidate
 * Invalidate analytics cache
 */
analyticsRouter.post("/cache/invalidate", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { pattern } = req.body;

    await analyticsService.invalidateCache(tenantId, pattern);

    logger.info('Cache invalidated', { tenantId, pattern });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error invalidating cache', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to invalidate cache' });
  }
});

// ============================================================================
// ALERTS
// ============================================================================

/**
 * GET /api/analytics/alerts
 * Get unacknowledged analytics alerts
 */
analyticsRouter.get("/alerts", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const limit = parseInt(req.query.limit as string) || 50;
    const includeAcknowledged = req.query.includeAcknowledged === 'true';

    const result = await pool.query(
      `SELECT a.*, r.name as rule_name
      FROM analytics_alerts a
      JOIN analytics_alert_rules r ON r.id = a.rule_id
      WHERE a.tenant_id = $1
        ${includeAcknowledged ? '' : 'AND a.acknowledged = false'}
      ORDER BY a.created_at DESC
      LIMIT $2`,
      [tenantId, limit]
    );

    return res.json({ alerts: result.rows });
  } catch (error) {
    logger.error('Error getting alerts', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * POST /api/analytics/alerts/:id/acknowledge
 * Acknowledge an alert
 */
analyticsRouter.post("/alerts/:id/acknowledge", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const alertId = req.params.id;

    const result = await pool.query(
      `UPDATE analytics_alerts
      SET acknowledged = true, acknowledged_by = $3, acknowledged_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id`,
      [alertId, tenantId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    logger.info('Alert acknowledged', { tenantId, alertId });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error acknowledging alert', { error, tenantId: req.user?.tenantId, alertId: req.params.id });
    return res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// ============================================================================
// BENCHMARKS
// ============================================================================

/**
 * GET /api/analytics/benchmarks
 * Get industry benchmarks for comparison
 */
analyticsRouter.get("/benchmarks", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const specialty = (req.query.specialty as string) || 'dermatology';
    const practiceSize = req.query.practiceSize as string;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    let query = `SELECT * FROM benchmark_data WHERE specialty = $1 AND year = $2`;
    const params: any[] = [specialty, year];

    if (practiceSize) {
      query += ` AND practice_size = $3`;
      params.push(practiceSize);
    }

    query += ` ORDER BY metric_name`;

    const result = await pool.query(query, params);

    return res.json({ benchmarks: result.rows });
  } catch (error) {
    logger.error('Error getting benchmarks', { error });
    return res.status(500).json({ error: 'Failed to get benchmarks' });
  }
});

// ============================================================================
// DERMATOLOGY-SPECIFIC METRICS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/dermatology-metrics
 * Get dermatology-specific metrics including biopsies, cosmetic/medical split, skin conditions
 */
analyticsRouter.get("/dermatology-metrics", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `derm_metrics_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const metrics = await analyticsService.getDermatologyMetrics(tenantId, dateRange);

    // Cache for 5 minutes
    await analyticsService.setCache(tenantId, cacheKey, metrics, 300);

    return res.json(metrics);
  } catch (error) {
    logger.error('Error getting dermatology metrics', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get dermatology metrics' });
  }
});

// ============================================================================
// YEAR-OVER-YEAR COMPARISON ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/yoy-comparison
 * Compare current period to same period last year
 */
analyticsRouter.get("/yoy-comparison", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `yoy_comparison_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const comparison = await analyticsService.getYearOverYearComparison(tenantId, dateRange);

    // Cache for 10 minutes (historical data changes less frequently)
    await analyticsService.setCache(tenantId, cacheKey, comparison, 600);

    return res.json(comparison);
  } catch (error) {
    logger.error('Error getting YoY comparison', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get year-over-year comparison' });
  }
});

// ============================================================================
// PREDICTIVE NO-SHOW ANALYSIS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/no-show-risk
 * Get predictive no-show analysis and risk factors
 */
analyticsRouter.get("/no-show-risk", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const dateRange = parseDateRange(req.query);

    // Check cache
    const cacheKey = `no_show_risk_${dateRange.startDate}_${dateRange.endDate}`;
    const cached = await analyticsService.getCached(tenantId, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const analysis = await analyticsService.getNoShowRiskAnalysis(tenantId, dateRange);

    // Cache for 15 minutes
    await analyticsService.setCache(tenantId, cacheKey, analysis, 900);

    return res.json(analysis);
  } catch (error) {
    logger.error('Error getting no-show risk analysis', { error, tenantId: req.user?.tenantId });
    return res.status(500).json({ error: 'Failed to get no-show risk analysis' });
  }
});

/**
 * GET /api/analytics/no-show-risk/patient/:patientId
 * Get no-show risk score for a specific patient
 */
analyticsRouter.get("/no-show-risk/patient/:patientId", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    // Get patient's appointment history
    const historyResult = await pool.query(
      `SELECT
        COUNT(*) as total_appointments,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        MAX(scheduled_start) as last_appointment,
        MIN(scheduled_start) as first_appointment
      FROM appointments
      WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    const history = historyResult.rows[0];
    const total = parseInt(history.total_appointments) || 0;
    const noShows = parseInt(history.no_shows) || 0;
    const completed = parseInt(history.completed) || 0;

    // Calculate risk score (0-100)
    let riskScore = 0;

    if (total > 0) {
      const noShowRate = (noShows / total) * 100;
      riskScore = Math.min(100, Math.round(noShowRate * 1.5)); // Weight no-shows heavily

      // Adjust for completed appointments (reliability)
      const completionRate = completed / total;
      if (completionRate > 0.9) riskScore = Math.max(0, riskScore - 10);
      if (completionRate > 0.95) riskScore = Math.max(0, riskScore - 10);
    } else {
      // New patient - default moderate risk
      riskScore = 25;
    }

    let riskLevel: 'low' | 'medium' | 'high';
    if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    return res.json({
      patientId,
      riskScore,
      riskLevel,
      history: {
        totalAppointments: total,
        completed,
        noShows,
        cancelled: parseInt(history.cancelled) || 0,
        noShowRate: total > 0 ? Math.round((noShows / total) * 100 * 100) / 100 : 0,
        lastAppointment: history.last_appointment,
        firstAppointment: history.first_appointment,
      },
      recommendations: riskScore >= 50
        ? ['Send additional reminders', 'Consider requiring confirmation call', 'Flag for overbooking consideration']
        : riskScore >= 25
        ? ['Send standard reminders', 'Consider text confirmation']
        : ['Standard scheduling practices apply'],
    });
  } catch (error) {
    logger.error('Error getting patient no-show risk', { error, tenantId: req.user?.tenantId, patientId: req.params.patientId });
    return res.status(500).json({ error: 'Failed to get patient no-show risk' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc: Record<string, any>, k) => {
    const pre = prefix.length ? `${prefix}_` : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else if (Array.isArray(obj[k])) {
      acc[pre + k] = JSON.stringify(obj[k]);
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}
