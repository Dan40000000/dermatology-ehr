import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const analyticsRouter = Router();

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
