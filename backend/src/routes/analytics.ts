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
