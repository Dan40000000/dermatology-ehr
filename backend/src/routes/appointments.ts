import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { waitlistAutoFillService } from "../services/waitlistAutoFillService";
import { logger } from "../lib/logger";

const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  locationId: z.string().min(1),
  appointmentTypeId: z.string().min(1),
  scheduledStart: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid start" }),
  scheduledEnd: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid end" }),
  status: z.string().optional(),
});

const rescheduleSchema = z.object({
  scheduledStart: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid start" }),
  scheduledEnd: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid end" }),
  providerId: z.string().min(1).optional(), // Optional: allow changing provider
});

async function hasConflict(tenantId: string, providerId: string, start: string, end: string, ignoreId?: string) {
  const result = await pool.query(
    `select 1 from appointments
     where tenant_id = $1
       and provider_id = $2
       and id <> $5
       and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     limit 1`,
    [tenantId, providerId, start, end, ignoreId || "0000"],
  );
  return (result.rowCount || 0) > 0;
}

const updateStatusSchema = z.object({
  status: z.string(),
});

export const appointmentsRouter = Router();

appointmentsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = req.query.patientId as string | undefined;
  const date = req.query.date as string | undefined; // YYYY-MM-DD format
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  let query = `select a.id,
            a.scheduled_start as "scheduledStart",
            a.scheduled_end as "scheduledEnd",
            a.status,
            a.patient_id as "patientId",
            a.provider_id as "providerId",
            a.location_id as "locationId",
            p.first_name || ' ' || p.last_name as "patientName",
            pr.full_name as "providerName",
            l.name as "locationName",
            at.name as "appointmentTypeName",
            at.duration_minutes as "durationMinutes",
            a.appointment_type_id as "appointmentTypeId"
     from appointments a
     join patients p on p.id = a.patient_id
     join providers pr on pr.id = a.provider_id
     join locations l on l.id = a.location_id
     join appointment_types at on at.id = a.appointment_type_id
     where a.tenant_id = $1`;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (patientId) {
    query += ` and a.patient_id = $${paramIndex}`;
    params.push(patientId);
    paramIndex++;
  }

  // Filter by specific date (returns appointments for that day)
  if (date) {
    query += ` and DATE(a.scheduled_start) = $${paramIndex}::date`;
    params.push(date);
    paramIndex++;
  } else if (startDate && endDate) {
    // Filter by date range
    query += ` and DATE(a.scheduled_start) >= $${paramIndex}::date`;
    params.push(startDate);
    paramIndex++;
    query += ` and DATE(a.scheduled_start) <= $${paramIndex}::date`;
    params.push(endDate);
    paramIndex++;
  } else if (startDate) {
    // Just start date - get everything from that date forward
    query += ` and DATE(a.scheduled_start) >= $${paramIndex}::date`;
    params.push(startDate);
    paramIndex++;
  }

  query += ` order by a.scheduled_start asc limit 200`;

  const result = await pool.query(query, params);
  return res.json({ appointments: result.rows });
});

appointmentsRouter.post("/", requireAuth, requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const payload = parsed.data;

  const conflict = await hasConflict(tenantId, payload.providerId, payload.scheduledStart, payload.scheduledEnd, id);
  if (conflict) return res.status(409).json({ error: "Time conflict for provider" });

  await pool.query(
    `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      tenantId,
      payload.patientId,
      payload.providerId,
      payload.locationId,
      payload.appointmentTypeId,
      payload.scheduledStart,
      payload.scheduledEnd,
      payload.status || "scheduled",
    ],
  );
  await auditLog(tenantId, req.user ? req.user.id : "unknown", "appointment_create", "appointment", id);

  return res.status(201).json({ id });
});

appointmentsRouter.post("/:id/reschedule", requireAuth, requireRoles(["admin", "front_desk", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const tenantId = req.user!.tenantId;
  const apptId = String(req.params.id);
  const apptRes = await pool.query(`select provider_id from appointments where id = $1 and tenant_id = $2`, [apptId, tenantId]);
  if (!apptRes.rowCount) return res.status(404).json({ error: "Not found" });

  // Use new provider if provided, otherwise keep the original
  const newProviderId = parsed.data.providerId || apptRes.rows[0].provider_id as string;

  const conflict = await hasConflict(tenantId, newProviderId, parsed.data.scheduledStart, parsed.data.scheduledEnd, apptId);
  if (conflict) return res.status(409).json({ error: "Time conflict for provider" });

  // Update with new time and optionally new provider
  await pool.query(
    `update appointments set scheduled_start = $1, scheduled_end = $2, provider_id = $3 where id = $4 and tenant_id = $5`,
    [parsed.data.scheduledStart, parsed.data.scheduledEnd, newProviderId, apptId, tenantId],
  );
  await auditLog(tenantId, req.user!.id, "appointment_reschedule", "appointment", apptId);
  res.json({ ok: true });
});

appointmentsRouter.post("/:id/status", requireAuth, requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const tenantId = req.user!.tenantId;
  const apptId = String(req.params.id);
  await pool.query(
    `update appointments set status = $1 where id = $2 and tenant_id = $3`,
    [parsed.data.status, apptId, tenantId],
  );
  await pool.query(
    `insert into appointment_status_history(id, tenant_id, appointment_id, status, changed_by)
     values ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), tenantId, apptId, parsed.data.status, req.user!.id],
  );
  await auditLog(tenantId, req.user!.id, "appointment_status_change", "appointment", apptId);

  // Trigger waitlist auto-fill when appointment is cancelled
  if (parsed.data.status === 'cancelled') {
    try {
      const matches = await waitlistAutoFillService.processAppointmentCancellation(tenantId, apptId);
      logger.info('Waitlist auto-fill triggered for cancelled appointment', {
        tenantId,
        appointmentId: apptId,
        matchesCreated: matches.length,
      });
    } catch (error: any) {
      // Log error but don't fail the status update
      logger.error('Waitlist auto-fill failed for cancelled appointment', {
        error: error.message,
        tenantId,
        appointmentId: apptId,
      });
    }
  }

  res.json({ ok: true });
});
