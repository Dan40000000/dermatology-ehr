import { pool } from "../db/pool";
import { auditLog } from "./audit";

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  providerId?: string;
  locationId?: string;
  patientId?: string;
  status?: string;
  appointmentTypeId?: string;
  paymentStatus?: string;
  diagnosisCode?: string;
  procedureCode?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  active?: boolean;
}

export interface AppointmentReportRow {
  date: string;
  time: string;
  patientName: string;
  providerName: string;
  locationName: string;
  appointmentType: string;
  status: string;
  duration: number;
}

export interface FinancialReportRow {
  date: string;
  patientName: string;
  services: string;
  chargesCents: number;
  paymentsCents: number;
  balanceCents: number;
  claimNumber?: string;
}

export interface ClinicalReportRow {
  date: string;
  patientName: string;
  diagnosisCode: string;
  diagnosisDescription: string;
  procedureCode: string;
  procedureDescription: string;
  providerName: string;
}

export interface PatientListReportRow {
  name: string;
  dob: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  lastVisit?: string;
  status: string;
}

export interface ProviderProductivityRow {
  providerName: string;
  patientsSeen: number;
  appointments: number;
  revenueCents: number;
  avgPerPatientCents: number;
}

export interface NoShowReportRow {
  date: string;
  patientName: string;
  providerName: string;
  appointmentType: string;
  reason: string;
  status: string;
}

export async function generateAppointmentReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<AppointmentReportRow[]> {
  let query = `
    select
      a.scheduled_start::date as date,
      to_char(a.scheduled_start, 'HH24:MI') as time,
      p.first_name || ' ' || p.last_name as "patientName",
      pr.full_name as "providerName",
      l.name as "locationName",
      at.name as "appointmentType",
      a.status,
      at.duration_minutes as duration
    from appointments a
    join patients p on p.id = a.patient_id
    join providers pr on pr.id = a.provider_id
    join locations l on l.id = a.location_id
    join appointment_types at on at.id = a.appointment_type_id
    where a.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and a.scheduled_start >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and a.scheduled_start < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  if (filters.providerId) {
    paramCount++;
    query += ` and a.provider_id = $${paramCount}`;
    params.push(filters.providerId);
  }

  if (filters.locationId) {
    paramCount++;
    query += ` and a.location_id = $${paramCount}`;
    params.push(filters.locationId);
  }

  if (filters.status) {
    paramCount++;
    query += ` and a.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters.appointmentTypeId) {
    paramCount++;
    query += ` and a.appointment_type_id = $${paramCount}`;
    params.push(filters.appointmentTypeId);
  }

  query += ` order by a.scheduled_start asc limit 10000`;

  const result = await pool.query(query, params);

  // Audit log
  if (userId) {
    await auditLog(tenantId, userId, "report_generate_appointments", "report", "appointments");
  }

  return result.rows;
}

export async function generateFinancialReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<FinancialReportRow[]> {
  let query = `
    select
      cl.created_at::date as date,
      p.first_name || ' ' || p.last_name as "patientName",
      string_agg(distinct ch.cpt_code, ', ') as services,
      cl.total_cents as "chargesCents",
      coalesce(sum(cp.amount_cents), 0) as "paymentsCents",
      cl.total_cents - coalesce(sum(cp.amount_cents), 0) as "balanceCents",
      cl.claim_number as "claimNumber"
    from claims cl
    join patients p on p.id = cl.patient_id
    left join encounters e on e.id = cl.encounter_id
    left join charges ch on ch.encounter_id = e.id
    left join claim_payments cp on cp.claim_id = cl.id
    where cl.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and cl.created_at >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and cl.created_at < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  if (filters.providerId) {
    paramCount++;
    query += ` and e.provider_id = $${paramCount}`;
    params.push(filters.providerId);
  }

  if (filters.paymentStatus) {
    paramCount++;
    query += ` and cl.status = $${paramCount}`;
    params.push(filters.paymentStatus);
  }

  query += ` group by cl.id, cl.created_at, p.first_name, p.last_name, cl.total_cents, cl.claim_number
             order by cl.created_at desc limit 10000`;

  const result = await pool.query(query, params);

  // Audit log
  if (userId) {
    await auditLog(tenantId, userId, "report_generate_financial", "report", "financial");
  }

  return result.rows;
}

export async function generateClinicalReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<ClinicalReportRow[]> {
  let query = `
    select
      e.created_at::date as date,
      p.first_name || ' ' || p.last_name as "patientName",
      coalesce(ed.icd10_code, 'N/A') as "diagnosisCode",
      coalesce(ed.description, 'No diagnosis') as "diagnosisDescription",
      coalesce(ch.cpt_code, 'N/A') as "procedureCode",
      coalesce(ch.description, 'No procedure') as "procedureDescription",
      pr.full_name as "providerName"
    from encounters e
    join patients p on p.id = e.patient_id
    join providers pr on pr.id = e.provider_id
    left join encounter_diagnoses ed on ed.encounter_id = e.id
    left join charges ch on ch.encounter_id = e.id
    where e.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and e.created_at >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and e.created_at < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  if (filters.providerId) {
    paramCount++;
    query += ` and e.provider_id = $${paramCount}`;
    params.push(filters.providerId);
  }

  if (filters.diagnosisCode) {
    paramCount++;
    query += ` and ed.icd10_code ilike $${paramCount}`;
    params.push(`%${filters.diagnosisCode}%`);
  }

  if (filters.procedureCode) {
    paramCount++;
    query += ` and ch.cpt_code ilike $${paramCount}`;
    params.push(`%${filters.procedureCode}%`);
  }

  query += ` order by e.created_at desc limit 10000`;

  const result = await pool.query(query, params);

  // Audit log
  if (userId) {
    await auditLog(tenantId, userId, "report_generate_clinical", "report", "clinical");
  }

  return result.rows;
}

export async function generatePatientListReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<PatientListReportRow[]> {
  let query = `
    select
      p.first_name || ' ' || p.last_name as name,
      p.dob::text,
      extract(year from age(p.dob)) as age,
      coalesce(p.sex, 'Unknown') as gender,
      coalesce(p.phone, '') as phone,
      coalesce(p.email, '') as email,
      max(a.scheduled_start)::date::text as "lastVisit",
      case when max(a.scheduled_start) >= now() - interval '1 year' then 'Active' else 'Inactive' end as status
    from patients p
    left join appointments a on a.patient_id = p.id and a.status = 'completed'
    where p.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.ageMin !== undefined) {
    paramCount++;
    query += ` and extract(year from age(p.dob)) >= $${paramCount}`;
    params.push(filters.ageMin);
  }

  if (filters.ageMax !== undefined) {
    paramCount++;
    query += ` and extract(year from age(p.dob)) <= $${paramCount}`;
    params.push(filters.ageMax);
  }

  if (filters.gender) {
    paramCount++;
    query += ` and p.sex = $${paramCount}`;
    params.push(filters.gender);
  }

  if (filters.locationId) {
    paramCount++;
    query += ` and exists (select 1 from appointments a2 where a2.patient_id = p.id and a2.location_id = $${paramCount})`;
    params.push(filters.locationId);
  }

  query += ` group by p.id, p.first_name, p.last_name, p.dob, p.sex, p.phone, p.email`;

  if (filters.active !== undefined) {
    query += ` having case when max(a.scheduled_start) >= now() - interval '1 year' then true else false end = $${paramCount + 1}`;
    params.push(filters.active);
  }

  query += ` order by p.last_name, p.first_name limit 10000`;

  const result = await pool.query(query, params);

  // Audit log
  if (userId) {
    await auditLog(tenantId, userId, "report_generate_patient_list", "report", "patient_list");
  }

  return result.rows.map((row) => ({
    ...row,
    age: parseInt(row.age) || 0,
  }));
}

export async function generateProviderProductivityReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<ProviderProductivityRow[]> {
  let query = `
    select
      pr.full_name as "providerName",
      count(distinct e.patient_id) as "patientsSeen",
      count(distinct a.id) as appointments,
      coalesce(sum(cl.total_cents), 0) as "revenueCents",
      case
        when count(distinct e.patient_id) > 0 then coalesce(sum(cl.total_cents), 0) / count(distinct e.patient_id)
        else 0
      end as "avgPerPatientCents"
    from providers pr
    left join encounters e on e.provider_id = pr.id and e.tenant_id = $1
    left join appointments a on a.provider_id = pr.id and a.tenant_id = $1 and a.status in ('completed', 'checked_out')
    left join claims cl on cl.encounter_id = e.id and cl.tenant_id = $1
    where pr.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and e.created_at >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and e.created_at < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  query += ` group by pr.id, pr.full_name
             order by "revenueCents" desc limit 100`;

  const result = await pool.query(query, params);

  // Audit log
  if (userId) {
    await auditLog(tenantId, userId, "report_generate_productivity", "report", "productivity");
  }

  return result.rows.map((row) => ({
    ...row,
    patientsSeen: parseInt(row.patientsSeen) || 0,
    appointments: parseInt(row.appointments) || 0,
  }));
}

export async function generateNoShowReport(
  tenantId: string,
  filters: ReportFilters,
  userId?: string
): Promise<NoShowReportRow[]> {
  let query = `
    select
      a.scheduled_start::date::text as date,
      p.first_name || ' ' || p.last_name as "patientName",
      pr.full_name as "providerName",
      at.name as "appointmentType",
      coalesce(ash.notes, 'No reason provided') as reason,
      a.status
    from appointments a
    join patients p on p.id = a.patient_id
    join providers pr on pr.id = a.provider_id
    join appointment_types at on at.id = a.appointment_type_id
    left join lateral (
      select notes
      from appointment_status_history
      where appointment_id = a.id and status in ('cancelled', 'no_show')
      order by changed_at desc
      limit 1
    ) ash on true
    where a.tenant_id = $1
      and a.status in ('cancelled', 'no_show')
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and a.scheduled_start >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and a.scheduled_start < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  if (filters.providerId) {
    paramCount++;
    query += ` and a.provider_id = $${paramCount}`;
    params.push(filters.providerId);
  }

  query += ` order by a.scheduled_start desc limit 10000`;

  const result = await pool.query(query, params);

  // Calculate no-show rate
  const totalQuery = `
    select count(*) as total
    from appointments
    where tenant_id = $1
      ${filters.startDate ? `and scheduled_start >= $2::date` : ""}
      ${filters.endDate ? `and scheduled_start < $${filters.startDate ? 3 : 2}::date + interval '1 day'` : ""}
  `;

  const totalParams: any[] = [tenantId];
  if (filters.startDate) totalParams.push(filters.startDate);
  if (filters.endDate) totalParams.push(filters.endDate);

  const totalResult = await pool.query(totalQuery, totalParams);
  const total = parseInt(totalResult.rows[0]?.total) || 1;
  const noShowCount = result.rows.length;
  const noShowRate = ((noShowCount / total) * 100).toFixed(2);

  // Audit log with no-show rate
  if (userId) {
    await auditLog(
      tenantId,
      userId,
      "report_generate_no_show",
      "report",
      `no_show_rate_${noShowRate}%`
    );
  }

  return result.rows;
}

export interface ReportSummary {
  totalCharges?: number;
  totalPayments?: number;
  totalOutstanding?: number;
  noShowRate?: string;
  totalRecords?: number;
}

export async function getFinancialSummary(
  tenantId: string,
  filters: ReportFilters
): Promise<ReportSummary> {
  let query = `
    select
      sum(cl.total_cents) as "totalCharges",
      sum(cp.total_paid) as "totalPayments"
    from claims cl
    left join (
      select claim_id, sum(amount_cents) as total_paid
      from claim_payments
      where tenant_id = $1
      group by claim_id
    ) cp on cp.claim_id = cl.id
    where cl.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.startDate) {
    paramCount++;
    query += ` and cl.created_at >= $${paramCount}::date`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    paramCount++;
    query += ` and cl.created_at < $${paramCount}::date + interval '1 day'`;
    params.push(filters.endDate);
  }

  const result = await pool.query(query, params);
  const row = result.rows[0];

  const totalCharges = parseInt(row?.totalCharges) || 0;
  const totalPayments = parseInt(row?.totalPayments) || 0;
  const totalOutstanding = totalCharges - totalPayments;

  return {
    totalCharges,
    totalPayments,
    totalOutstanding,
  };
}
