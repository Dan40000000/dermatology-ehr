import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { waitlistAutoFillService } from "../services/waitlistAutoFillService";
import { notificationService } from "../services/integrations/notificationService";
import { workflowOrchestrator } from "../services/workflowOrchestrator";
import { logger } from "../lib/logger";
import { getPracticeTimeZone, getUtcRangeForPracticeDate } from "../lib/practiceTimeZone";
import {
  emitAppointmentCreated,
  emitAppointmentUpdated,
  emitAppointmentCancelled,
  emitAppointmentCheckedIn,
} from "../websocket/emitter";

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

const waiveLateFeeSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

const assessCancellationFeeSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

const APPOINTMENT_WINDOW_START_MINUTES = 7 * 60;
const APPOINTMENT_WINDOW_END_MINUTES = 18 * 60;
const APPOINTMENT_WINDOW_TIME_ZONE = getPracticeTimeZone();
const appointmentWindowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APPOINTMENT_WINDOW_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const LATE_FEE_AMOUNT_CENTS = 5000;
const LATE_FEE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LATE_FEE_CPT_CODE = "LATEFEE";
const LATE_FEE_NOTE_PREFIX = "[LATE_FEE]";
const NO_SHOW_FEE_AMOUNT_CENTS = Number(process.env.NO_SHOW_FEE_AMOUNT_CENTS || 5000);
const NO_SHOW_FEE_CPT_CODE = "NOSHOW";
const NO_SHOW_FEE_NOTE_PREFIX = "[NO_SHOW_FEE]";
const NO_SHOW_CHECK_IN_GRACE_MINUTES = Math.max(0, Number(process.env.NO_SHOW_CHECK_IN_GRACE_MINUTES || 15));
const NO_SHOW_CHECK_IN_GRACE_MS = NO_SHOW_CHECK_IN_GRACE_MINUTES * 60 * 1000;

type LateFeeTrigger = "cancel" | "reschedule";
type QueryExecutor = {
  query: (text: string, params?: any[]) => Promise<any>;
};

function getMinutesInAppointmentWindowTimeZone(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = appointmentWindowFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? Number.NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? Number.NaN);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function isWithinAppointmentWindow(scheduledStart: string, scheduledEnd: string): boolean {
  const startMinutes = getMinutesInAppointmentWindowTimeZone(scheduledStart);
  const endMinutes = getMinutesInAppointmentWindowTimeZone(scheduledEnd);
  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  return (
    startMinutes >= APPOINTMENT_WINDOW_START_MINUTES &&
    endMinutes <= APPOINTMENT_WINDOW_END_MINUTES &&
    endMinutes > startMinutes
  );
}

function getDateOnly(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const [day] = date.toISOString().split("T");
  return day ?? date.toISOString();
}

function isWithinLateFeeWindow(scheduledStart: string | Date, reference = new Date()): boolean {
  const scheduledDate = scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart);
  const diffMs = scheduledDate.getTime() - reference.getTime();
  return diffMs > 0 && diffMs <= LATE_FEE_WINDOW_MS;
}

function buildLateFeeDescription(trigger: LateFeeTrigger): string {
  return trigger === "cancel"
    ? "Late cancellation fee (appointment cancelled within 24 hours)"
    : "Late reschedule fee (appointment rescheduled within 24 hours)";
}

function buildLateFeeSignature(appointmentId: string, trigger: LateFeeTrigger, referenceScheduledStart: string | Date): string {
  const referenceIso = new Date(referenceScheduledStart).toISOString();
  return `${LATE_FEE_NOTE_PREFIX}|appointmentId=${appointmentId}|trigger=${trigger}|referenceStart=${referenceIso}`;
}

async function createLateFeeBillIfNeeded(
  queryable: QueryExecutor,
  params: {
    tenantId: string;
    appointmentId: string;
    patientId: string;
    referenceScheduledStart: string | Date;
    trigger: LateFeeTrigger;
    assessedBy: string;
    bypassWindow?: boolean;
    reason?: string;
  },
): Promise<string | null> {
  if (!params.bypassWindow && !isWithinLateFeeWindow(params.referenceScheduledStart)) {
    return null;
  }

  const signature = buildLateFeeSignature(params.appointmentId, params.trigger, params.referenceScheduledStart);
  const description = buildLateFeeDescription(params.trigger);
  const reasonLine = params.reason?.trim() ? `\nreason=${params.reason.trim()}` : "";
  const notes = `${signature}\n${description}${reasonLine}`;
  const serviceDate = getDateOnly(params.referenceScheduledStart);

  const existingResult = await queryable.query(
    `select id from bills where tenant_id = $1 and notes like $2 limit 1`,
    [params.tenantId, `${signature}%`],
  );
  if (existingResult.rowCount) {
    return existingResult.rows[0].id as string;
  }

  const billId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const billDate = getDateOnly(new Date());
  const dueDate = getDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const billNumber = `LATE-${billDate.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await queryable.query(
    `insert into bills(
      id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
      total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
      paid_amount_cents, adjustment_amount_cents, balance_cents, status,
      service_date_start, service_date_end, notes, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      billId,
      params.tenantId,
      params.patientId,
      null,
      billNumber,
      billDate,
      dueDate,
      LATE_FEE_AMOUNT_CENTS,
      0,
      LATE_FEE_AMOUNT_CENTS,
      0,
      0,
      LATE_FEE_AMOUNT_CENTS,
      "new",
      serviceDate,
      serviceDate,
      notes,
      params.assessedBy,
    ],
  );

  await queryable.query(
    `insert into bill_line_items(
      id, tenant_id, bill_id, charge_id, service_date, cpt_code,
      description, quantity, unit_price_cents, total_cents, icd_codes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      lineItemId,
      params.tenantId,
      billId,
      null,
      serviceDate,
      LATE_FEE_CPT_CODE,
      description,
      1,
      LATE_FEE_AMOUNT_CENTS,
      LATE_FEE_AMOUNT_CENTS,
      [],
    ],
  );

  return billId;
}

function buildNoShowFeeSignature(appointmentId: string, referenceScheduledStart: string | Date): string {
  const referenceIso = new Date(referenceScheduledStart).toISOString();
  return `${NO_SHOW_FEE_NOTE_PREFIX}|appointmentId=${appointmentId}|referenceStart=${referenceIso}`;
}

async function createNoShowFeeBillIfNeeded(
  queryable: QueryExecutor,
  params: {
    tenantId: string;
    appointmentId: string;
    patientId: string;
    referenceScheduledStart: string | Date;
    assessedBy: string;
    reason?: string;
  },
): Promise<string | null> {
  const scheduledDate = new Date(params.referenceScheduledStart);
  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() > Date.now()) {
    return null;
  }

  const signature = buildNoShowFeeSignature(params.appointmentId, params.referenceScheduledStart);
  const reasonLine = params.reason?.trim() ? `\nreason=${params.reason.trim()}` : "";
  const notes = `${signature}\nNo-show fee (missed appointment)${reasonLine}`;
  const serviceDate = getDateOnly(params.referenceScheduledStart);

  const existingResult = await queryable.query(
    `select id from bills where tenant_id = $1 and notes like $2 limit 1`,
    [params.tenantId, `${signature}%`],
  );
  if (existingResult.rowCount) {
    return existingResult.rows[0].id as string;
  }

  const billId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const billDate = getDateOnly(new Date());
  const dueDate = getDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const billNumber = `NOSHOW-${billDate.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await queryable.query(
    `insert into bills(
      id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
      total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
      paid_amount_cents, adjustment_amount_cents, balance_cents, status,
      service_date_start, service_date_end, notes, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      billId,
      params.tenantId,
      params.patientId,
      null,
      billNumber,
      billDate,
      dueDate,
      NO_SHOW_FEE_AMOUNT_CENTS,
      0,
      NO_SHOW_FEE_AMOUNT_CENTS,
      0,
      0,
      NO_SHOW_FEE_AMOUNT_CENTS,
      "new",
      serviceDate,
      serviceDate,
      notes,
      params.assessedBy,
    ],
  );

  await queryable.query(
    `insert into bill_line_items(
      id, tenant_id, bill_id, charge_id, service_date, cpt_code,
      description, quantity, unit_price_cents, total_cents, icd_codes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      lineItemId,
      params.tenantId,
      billId,
      null,
      serviceDate,
      NO_SHOW_FEE_CPT_CODE,
      "No-show fee (missed appointment)",
      1,
      NO_SHOW_FEE_AMOUNT_CENTS,
      NO_SHOW_FEE_AMOUNT_CENTS,
      [],
    ],
  );

  return billId;
}

async function hasConflict(
  tenantId: string,
  providerId: string,
  start: string,
  end: string,
  ignoreId?: string,
  queryable: QueryExecutor = pool,
) {
  const result = await queryable.query(
    `select 1 from appointments
     where tenant_id = $1
       and provider_id = $2
       and id <> $5
       and scheduled_start is not null
       and scheduled_end is not null
       and scheduled_start <= scheduled_end
       and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     limit 1`,
    [tenantId, providerId, start, end, ignoreId || "0000"],
  );
  return (result.rowCount || 0) > 0;
}

const updateStatusSchema = z.object({
  status: z.string(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth, requireModuleAccess("schedule"));

const syntheticAppointmentPrefixes = [
  "appt-skin-%",
  "appt-riley-%",
  "appt-phil-%",
  "appt-martinez-%",
  "appt-sarah-%",
  "appt-telehealth-%",
];

const demoSyntheticCleanupSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-05-18"),
});

appointmentsRouter.delete(
  "/demo-cleanup/stale-synthetic",
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = demoSyntheticCleanupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const cleanupDate = parsed.data.date;
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `CREATE TEMP TABLE stale_synthetic_appointments (
           id text primary key
         ) ON COMMIT DROP`,
      );
      await client.query(
        `INSERT INTO stale_synthetic_appointments (id)
         SELECT id
         FROM appointments
         WHERE tenant_id = $1
           AND status = 'scheduled'
           AND (scheduled_start AT TIME ZONE $2)::date = $3::date
           AND id LIKE ANY($4::text[])`,
        [tenantId, APPOINTMENT_WINDOW_TIME_ZONE, cleanupDate, syntheticAppointmentPrefixes],
      );

      const targetResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM stale_synthetic_appointments`,
      );
      const targetCount = Number(targetResult.rows[0]?.count || 0);

      await client.query(`
        DO $$
        DECLARE
          target_table regclass;
        BEGIN
          FOR target_table IN
            SELECT format('%I.%I', table_schema, table_name)::regclass
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_name = 'appointment_id'
              AND table_name <> 'appointments'
          LOOP
            EXECUTE format(
              'DELETE FROM %s WHERE appointment_id::text IN (SELECT id FROM stale_synthetic_appointments)',
              target_table
            );
          END LOOP;
        END $$;
      `);

      const deleteResult = await client.query(
        `DELETE FROM appointments
         WHERE id IN (SELECT id FROM stale_synthetic_appointments)
         RETURNING id`,
      );
      await client.query("commit");

      await auditLog(
        tenantId,
        req.user!.id,
        "demo_synthetic_appointments_cleanup",
        "appointment",
        cleanupDate,
      );

      return res.json({
        ok: true,
        date: cleanupDate,
        matched: targetCount,
        deleted: deleteResult.rowCount || 0,
        appointmentIds: deleteResult.rows.map((row) => row.id),
      });
    } catch (error: any) {
      await client.query("rollback").catch(() => undefined);
      logger.error("Failed to clean up stale synthetic appointments", {
        error: error.message,
        tenantId,
        date: cleanupDate,
      });
      return res.status(500).json({ error: "Failed to clean up stale synthetic appointments" });
    } finally {
      client.release();
    }
  },
);

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     summary: List appointments
 *     description: Retrieve appointments with optional filters for patient, date, or date range (limited to 200).
 *     tags:
 *       - Appointments
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by patient ID
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by specific date (YYYY-MM-DD)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appointments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Appointment'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
     join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
     join providers pr on pr.id = a.provider_id and pr.tenant_id = a.tenant_id
     join locations l on l.id = a.location_id and l.tenant_id = a.tenant_id
     join appointment_types at on at.id = a.appointment_type_id and at.tenant_id = a.tenant_id
     where a.tenant_id = $1`;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (patientId) {
    query += ` and a.patient_id = $${paramIndex}`;
    params.push(patientId);
    paramIndex++;
  }

  // Filter date keys in the practice timezone so Railway/server UTC does not shift clinic days.
  if (date) {
    const { start, end } = getUtcRangeForPracticeDate(date, APPOINTMENT_WINDOW_TIME_ZONE);
    query += ` and a.scheduled_start >= $${paramIndex}::timestamptz`;
    params.push(start.toISOString());
    paramIndex++;
    query += ` and a.scheduled_start < $${paramIndex}::timestamptz`;
    params.push(end.toISOString());
    paramIndex++;
  } else if (startDate && endDate) {
    const { start } = getUtcRangeForPracticeDate(startDate, APPOINTMENT_WINDOW_TIME_ZONE);
    const { end } = getUtcRangeForPracticeDate(endDate, APPOINTMENT_WINDOW_TIME_ZONE);
    query += ` and a.scheduled_start >= $${paramIndex}::timestamptz`;
    params.push(start.toISOString());
    paramIndex++;
    query += ` and a.scheduled_start < $${paramIndex}::timestamptz`;
    params.push(end.toISOString());
    paramIndex++;
  } else if (startDate) {
    const { start } = getUtcRangeForPracticeDate(startDate, APPOINTMENT_WINDOW_TIME_ZONE);
    query += ` and a.scheduled_start >= $${paramIndex}::timestamptz`;
    params.push(start.toISOString());
    paramIndex++;
  }

  query += ` order by a.scheduled_start asc`;

  const result = await pool.query(query, params);
  return res.json({ appointments: result.rows });
});

/**
 * @swagger
 * /api/appointments:
 *   post:
 *     summary: Create an appointment
 *     description: Create a new appointment. Checks for provider time conflicts. Requires admin, front_desk, ma, or provider role.
 *     tags:
 *       - Appointments
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAppointmentRequest'
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: Time conflict for provider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
appointmentsRouter.post("/", requireAuth, requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const actorId = req.user?.id || "unknown";
  const payload = parsed.data;
  if (!isWithinAppointmentWindow(payload.scheduledStart, payload.scheduledEnd)) {
    return res.status(400).json({
      error: `Appointments must be scheduled between 07:00 and 18:00 (${APPOINTMENT_WINDOW_TIME_ZONE})`,
    });
  }

  const conflict = await hasConflict(tenantId, payload.providerId, payload.scheduledStart, payload.scheduledEnd, id);
  if (conflict) return res.status(409).json({ error: "Time conflict for provider" });

  const referenceCheck = await pool.query(
    `select
       exists(select 1 from patients where id = $1 and tenant_id = $5) as "patientOk",
       exists(select 1 from providers where id = $2 and tenant_id = $5) as "providerOk",
       exists(select 1 from locations where id = $3 and tenant_id = $5) as "locationOk",
       exists(select 1 from appointment_types where id = $4 and tenant_id = $5) as "appointmentTypeOk"`,
    [payload.patientId, payload.providerId, payload.locationId, payload.appointmentTypeId, tenantId],
  );
  const refs = referenceCheck.rows[0];
  if (!refs?.patientOk || !refs?.providerOk || !refs?.locationOk || !refs?.appointmentTypeOk) {
    return res.status(400).json({ error: "Appointment references must belong to this tenant" });
  }

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
  await auditLog(tenantId, actorId, "appointment_create", "appointment", id);

  // Send integration notification for new appointment
  try {
    const appointmentDetails = await pool.query(
      `SELECT a.*,
              p.first_name || ' ' || p.last_name as patient_name,
              pr.full_name as provider_name,
              l.name as location_name,
              at.name as appointment_type
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
       JOIN providers pr ON pr.id = a.provider_id AND pr.tenant_id = a.tenant_id
       JOIN locations l ON l.id = a.location_id AND l.tenant_id = a.tenant_id
       JOIN appointment_types at ON at.id = a.appointment_type_id AND at.tenant_id = a.tenant_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [id, tenantId]
    );

    if (appointmentDetails.rows.length > 0) {
      const appt = appointmentDetails.rows[0];
      await notificationService.sendNotification({
        tenantId,
        notificationType: "appointment_booked",
        data: {
          patientName: appt.patient_name,
          appointmentType: appt.appointment_type,
          scheduledStart: appt.scheduled_start,
          scheduledEnd: appt.scheduled_end,
          providerName: appt.provider_name,
          locationName: appt.location_name,
        },
      });

      // Emit WebSocket event for real-time updates
      emitAppointmentCreated(tenantId, {
        id: appt.id,
        patientId: appt.patient_id,
        patientName: appt.patient_name,
        providerId: appt.provider_id,
        providerName: appt.provider_name,
        locationId: appt.location_id,
        locationName: appt.location_name,
        scheduledStart: appt.scheduled_start,
        scheduledEnd: appt.scheduled_end,
        status: appt.status,
        appointmentTypeId: appt.appointment_type_id,
        appointmentTypeName: appt.appointment_type,
      });

      // WORKFLOW: Trigger appointment scheduled workflow
      // This schedules reminders, checks eligibility, and checks for prior auth requirements
      await workflowOrchestrator.processEvent({
        type: 'appointment_scheduled',
        tenantId,
        userId: actorId,
        entityType: 'appointment',
        entityId: id,
        data: {
          patientId: appt.patient_id,
          providerId: appt.provider_id,
          appointmentType: appt.appointment_type,
          scheduledStart: appt.scheduled_start,
        },
        timestamp: new Date(),
      });
      logger.info("Workflow appointment scheduled triggered", { appointmentId: id });
    }
  } catch (error: any) {
    // Log error but don't fail the appointment creation
    logger.error("Failed to send appointment booked notification", {
      error: error.message,
      appointmentId: id,
    });
  }

  return res.status(201).json({ id });
});

/**
 * @swagger
 * /api/appointments/{id}/reschedule:
 *   post:
 *     summary: Reschedule an appointment
 *     description: Change the date/time and optionally the provider for an existing appointment. Checks for time conflicts. Requires admin, front_desk, or ma role.
 *     tags:
 *       - Appointments
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RescheduleAppointmentRequest'
 *     responses:
 *       200:
 *         description: Appointment rescheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Time conflict for provider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
appointmentsRouter.post("/:id/reschedule", requireAuth, requireRoles(["admin", "front_desk", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  if (!isWithinAppointmentWindow(parsed.data.scheduledStart, parsed.data.scheduledEnd)) {
    return res.status(400).json({
      error: `Appointments must be scheduled between 07:00 and 18:00 (${APPOINTMENT_WINDOW_TIME_ZONE})`,
    });
  }
  const tenantId = req.user!.tenantId;
  const apptId = String(req.params.id);
  const client = await pool.connect();
  let lateFeeBillId: string | null = null;
  try {
    await client.query("begin");
    const apptRes = await client.query(
      `select provider_id, patient_id, scheduled_start
       from appointments
       where id = $1 and tenant_id = $2
       for update`,
      [apptId, tenantId],
    );
    if (!apptRes.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Not found" });
    }

    // Use new provider if provided, otherwise keep the original
    const newProviderId = parsed.data.providerId || (apptRes.rows[0].provider_id as string);
    const conflict = await hasConflict(
      tenantId,
      newProviderId,
      parsed.data.scheduledStart,
      parsed.data.scheduledEnd,
      apptId,
      client,
    );
    if (conflict) {
      await client.query("rollback");
      return res.status(409).json({ error: "Time conflict for provider" });
    }

    lateFeeBillId = await createLateFeeBillIfNeeded(client, {
      tenantId,
      appointmentId: apptId,
      patientId: apptRes.rows[0].patient_id as string,
      referenceScheduledStart: apptRes.rows[0].scheduled_start as string,
      trigger: "reschedule",
      assessedBy: req.user!.id,
    });

    // Update with new time and optionally new provider
    await client.query(
      `update appointments set scheduled_start = $1, scheduled_end = $2, provider_id = $3 where id = $4 and tenant_id = $5`,
      [parsed.data.scheduledStart, parsed.data.scheduledEnd, newProviderId, apptId, tenantId],
    );
    await client.query("commit");
  } catch (error: any) {
    await client.query("rollback");
    logger.error("Failed to reschedule appointment", {
      error: error.message,
      appointmentId: apptId,
    });
    return res.status(500).json({ error: "Failed to reschedule appointment" });
  } finally {
    client.release();
  }

  await auditLog(tenantId, req.user!.id, "appointment_reschedule", "appointment", apptId);

  // Emit WebSocket event for reschedule
  try {
    const updatedAppt = await pool.query(
      `SELECT a.id, a.patient_id, a.provider_id, a.location_id, a.appointment_type_id,
              a.scheduled_start, a.scheduled_end, a.status,
              p.first_name || ' ' || p.last_name as patient_name,
              pr.full_name as provider_name,
              l.name as location_name,
              at.name as appointment_type_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       JOIN locations l ON l.id = a.location_id
       JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE a.id = $1`,
      [apptId]
    );
    if (updatedAppt.rows.length > 0) {
      const appt = updatedAppt.rows[0];
      emitAppointmentUpdated(tenantId, {
        id: appt.id,
        patientId: appt.patient_id,
        patientName: appt.patient_name,
        providerId: appt.provider_id,
        providerName: appt.provider_name,
        locationId: appt.location_id,
        locationName: appt.location_name,
        scheduledStart: appt.scheduled_start,
        scheduledEnd: appt.scheduled_end,
        status: appt.status,
        appointmentTypeId: appt.appointment_type_id,
        appointmentTypeName: appt.appointment_type_name,
      });
    }
  } catch (error: any) {
    logger.error("Failed to emit appointment rescheduled event", {
      error: error.message,
      appointmentId: apptId,
    });
  }

  res.json({ ok: true, lateFeeBillId });
});

/**
 * @swagger
 * /api/appointments/{id}/status:
 *   post:
 *     summary: Update appointment status
 *     description: Change an appointment's status. Triggers waitlist auto-fill when status is 'cancelled'. Requires admin, front_desk, ma, or provider role.
 *     tags:
 *       - Appointments
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateAppointmentStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
appointmentsRouter.post("/:id/status", requireAuth, requireRoles(["admin", "front_desk", "ma", "provider"]), async (req: AuthedRequest, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const tenantId = req.user!.tenantId;
  const apptId = String(req.params.id);
  const client = await pool.connect();
  let lateFeeBillId: string | null = null;
  let noShowFeeBillId: string | null = null;

  try {
    await client.query("begin");
    const currentAppointmentResult = await client.query(
      `select patient_id, scheduled_start, status
       from appointments
       where id = $1 and tenant_id = $2
       for update`,
      [apptId, tenantId],
    );

    if (!currentAppointmentResult.rowCount) {
      await client.query("rollback");
      return res.status(404).json({ error: "Not found" });
    }

    const currentAppointment = currentAppointmentResult.rows[0];
    if (
      parsed.data.status === "cancelled" &&
      currentAppointment.status !== "cancelled"
    ) {
      lateFeeBillId = await createLateFeeBillIfNeeded(client, {
        tenantId,
        appointmentId: apptId,
        patientId: currentAppointment.patient_id as string,
        referenceScheduledStart: currentAppointment.scheduled_start as string,
        trigger: "cancel",
        assessedBy: req.user!.id,
      });
    }

    if (
      parsed.data.status === "no_show" &&
      currentAppointment.status !== "no_show"
    ) {
      if (currentAppointment.status !== "scheduled") {
        await client.query("rollback");
        return res.status(400).json({ error: "Only scheduled appointments can be marked as no-show" });
      }

      const scheduledStartMs = new Date(currentAppointment.scheduled_start as string).getTime();
      if (Number.isNaN(scheduledStartMs)) {
        await client.query("rollback");
        return res.status(400).json({ error: "Appointment has an invalid scheduled start time" });
      }

      if (Date.now() < scheduledStartMs + NO_SHOW_CHECK_IN_GRACE_MS) {
        await client.query("rollback");
        return res
          .status(400)
          .json({ error: `No-show can be confirmed after ${NO_SHOW_CHECK_IN_GRACE_MINUTES} minutes without check-in` });
      }

      noShowFeeBillId = await createNoShowFeeBillIfNeeded(client, {
        tenantId,
        appointmentId: apptId,
        patientId: currentAppointment.patient_id as string,
        referenceScheduledStart: currentAppointment.scheduled_start as string,
        assessedBy: req.user!.id,
        reason: parsed.data.reason,
      });
    }

    await client.query(
      `update appointments set status = $1 where id = $2 and tenant_id = $3`,
      [parsed.data.status, apptId, tenantId],
    );
    await client.query(
      `insert into appointment_status_history(id, tenant_id, appointment_id, status, changed_by)
       values ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), tenantId, apptId, parsed.data.status, req.user!.id],
    );
    await client.query("commit");
  } catch (error: any) {
    await client.query("rollback");
    logger.error("Failed to update appointment status", {
      error: error.message,
      appointmentId: apptId,
      status: parsed.data.status,
    });
    return res.status(500).json({ error: "Failed to update appointment status" });
  } finally {
    client.release();
  }

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

    // Send integration notification for cancelled appointment
    try {
      const appointmentDetails = await pool.query(
        `SELECT a.*,
                p.first_name || ' ' || p.last_name as patient_name,
                pr.full_name as provider_name,
                at.name as appointment_type
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN providers pr ON pr.id = a.provider_id
         JOIN appointment_types at ON at.id = a.appointment_type_id
         WHERE a.id = $1`,
        [apptId]
      );

      if (appointmentDetails.rows.length > 0) {
        const appt = appointmentDetails.rows[0];
        await notificationService.sendNotification({
          tenantId,
          notificationType: "appointment_cancelled",
          data: {
            patientName: appt.patient_name,
            appointmentType: appt.appointment_type,
            scheduledStart: appt.scheduled_start,
            providerName: appt.provider_name,
          },
        });

        // Emit WebSocket event for cancellation
        emitAppointmentCancelled(tenantId, apptId);
      }
    } catch (error: any) {
      logger.error("Failed to send appointment cancelled notification", {
        error: error.message,
        appointmentId: apptId,
      });
    }
  }

  // Send integration notification for patient check-in
  if (parsed.data.status === 'checked_in') {
    try {
      const appointmentDetails = await pool.query(
        `SELECT a.*,
                p.first_name || ' ' || p.last_name as patient_name,
                pr.full_name as provider_name,
                at.name as appointment_type
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN providers pr ON pr.id = a.provider_id
         JOIN appointment_types at ON at.id = a.appointment_type_id
         WHERE a.id = $1`,
        [apptId]
      );

      if (appointmentDetails.rows.length > 0) {
        const appt = appointmentDetails.rows[0];
        await notificationService.sendNotification({
          tenantId,
          notificationType: "patient_checked_in",
          data: {
            patientName: appt.patient_name,
            appointmentType: appt.appointment_type,
            scheduledStart: appt.scheduled_start,
            providerName: appt.provider_name,
            checkedInAt: new Date().toISOString(),
          },
        });

        // Emit WebSocket event for check-in
        emitAppointmentCheckedIn(tenantId, apptId, appt.patient_id, appt.patient_name);

        // WORKFLOW: Trigger check-in workflow (auto-creates encounter, collects copay, etc.)
        await workflowOrchestrator.processEvent({
          type: 'appointment_checkin',
          tenantId,
          userId: req.user!.id,
          entityType: 'appointment',
          entityId: apptId,
          data: {
            patientId: appt.patient_id,
            providerId: appt.provider_id,
            appointmentType: appt.appointment_type,
          },
          timestamp: new Date(),
        });
        logger.info("Workflow check-in triggered", { appointmentId: apptId });
      }
    } catch (error: any) {
      logger.error("Failed to send patient checked in notification", {
        error: error.message,
        appointmentId: apptId,
      });
    }
  }

  // WORKFLOW: Trigger checkout workflow (follow-up scheduling, surveys, etc.)
  if (parsed.data.status === 'checked_out' || parsed.data.status === 'completed') {
    try {
      await workflowOrchestrator.processEvent({
        type: 'appointment_checkout',
        tenantId,
        userId: req.user!.id,
        entityType: 'appointment',
        entityId: apptId,
        data: {
          followUpDays: req.body.followUpDays,
          followUpType: req.body.followUpType,
        },
        timestamp: new Date(),
      });
      logger.info("Workflow checkout triggered", { appointmentId: apptId });
    } catch (error: any) {
      logger.error("Failed to trigger checkout workflow", {
        error: error.message,
        appointmentId: apptId,
      });
    }
  }

  // WORKFLOW: Trigger roomed workflow for wait time tracking
  if (parsed.data.status === 'roomed') {
    try {
      await workflowOrchestrator.processEvent({
        type: 'appointment_roomed',
        tenantId,
        userId: req.user!.id,
        entityType: 'appointment',
        entityId: apptId,
        data: {},
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error("Failed to trigger roomed workflow", {
        error: error.message,
        appointmentId: apptId,
      });
    }
  }

  // Emit general appointment updated event for all status changes
  try {
    const updatedAppt = await pool.query(
      `SELECT a.id, a.patient_id, a.provider_id, a.location_id, a.appointment_type_id,
              a.scheduled_start, a.scheduled_end, a.status,
              p.first_name || ' ' || p.last_name as patient_name,
              pr.full_name as provider_name,
              l.name as location_name,
              at.name as appointment_type_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       JOIN locations l ON l.id = a.location_id
       JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE a.id = $1`,
      [apptId]
    );
    if (updatedAppt.rows.length > 0) {
      const appt = updatedAppt.rows[0];
      emitAppointmentUpdated(tenantId, {
        id: appt.id,
        patientId: appt.patient_id,
        patientName: appt.patient_name,
        providerId: appt.provider_id,
        providerName: appt.provider_name,
        locationId: appt.location_id,
        locationName: appt.location_name,
        scheduledStart: appt.scheduled_start,
        scheduledEnd: appt.scheduled_end,
        status: appt.status,
        appointmentTypeId: appt.appointment_type_id,
        appointmentTypeName: appt.appointment_type_name,
      });
    }
  } catch (error: any) {
    logger.error("Failed to emit appointment updated event", {
      error: error.message,
      appointmentId: apptId,
    });
  }

  res.json({ ok: true, lateFeeBillId, noShowFeeBillId });
});

appointmentsRouter.post(
  "/:id/cancellation-fee/assess",
  requireAuth,
  requireRoles(["admin", "front_desk", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = assessCancellationFeeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const apptId = String(req.params.id);
    const client = await pool.connect();
    let billId: string | null = null;
    let feeType: "late_fee" | "no_show_fee" | null = null;

    try {
      await client.query("begin");
      const appointmentResult = await client.query(
        `select patient_id, scheduled_start, status
         from appointments
         where id = $1 and tenant_id = $2
         for update`,
        [apptId, tenantId],
      );

      if (!appointmentResult.rowCount) {
        await client.query("rollback");
        return res.status(404).json({ error: "Appointment not found" });
      }

      const appointment = appointmentResult.rows[0];
      const status = String(appointment.status || "");
      if (status !== "cancelled" && status !== "no_show") {
        await client.query("rollback");
        return res.status(400).json({ error: "Cancellation fees can only be assessed on cancelled or no-show appointments" });
      }

      if (status === "no_show") {
        feeType = "no_show_fee";
        billId = await createNoShowFeeBillIfNeeded(client, {
          tenantId,
          appointmentId: apptId,
          patientId: appointment.patient_id as string,
          referenceScheduledStart: appointment.scheduled_start as string,
          assessedBy: req.user!.id,
          reason: parsed.data.reason,
        });
      } else {
        feeType = "late_fee";
        billId = await createLateFeeBillIfNeeded(client, {
          tenantId,
          appointmentId: apptId,
          patientId: appointment.patient_id as string,
          referenceScheduledStart: appointment.scheduled_start as string,
          trigger: "cancel",
          assessedBy: req.user!.id,
          bypassWindow: true,
          reason: parsed.data.reason,
        });
      }

      if (!billId) {
        await client.query("rollback");
        return res.status(400).json({ error: "Fee could not be assessed for this appointment timing" });
      }

      await client.query("commit");
    } catch (error: any) {
      await client.query("rollback").catch(() => undefined);
      logger.error("Failed to assess cancellation fee", {
        error: error.message,
        appointmentId: apptId,
      });
      return res.status(500).json({ error: "Failed to assess cancellation fee" });
    } finally {
      client.release();
    }

    await auditLog(tenantId, req.user!.id, "cancellation_fee_assess", "appointment", apptId);
    return res.json({ ok: true, appointmentId: apptId, billId, feeType });
  },
);

appointmentsRouter.post(
  "/late-fees/:billId/waive",
  requireAuth,
  requireRoles(["admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = waiveLateFeeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const billId = String(req.params.billId);
    const reason = parsed.data.reason || "Waived by authorized staff";

    const billResult = await pool.query(
      `select patient_responsibility_cents, paid_amount_cents, adjustment_amount_cents, notes
       from bills
       where id = $1 and tenant_id = $2`,
      [billId, tenantId],
    );
    if (!billResult.rowCount) {
      return res.status(404).json({ error: "Late fee bill not found" });
    }

    const bill = billResult.rows[0];
    const notes = String(bill.notes || "");
    if (!notes.includes(LATE_FEE_NOTE_PREFIX)) {
      return res.status(400).json({ error: "Bill is not a late fee" });
    }

    const patientResponsibility = Number(bill.patient_responsibility_cents || 0);
    const paidAmount = Number(bill.paid_amount_cents || 0);
    const currentAdjustment = Number(bill.adjustment_amount_cents || 0);
    const remainingBalance = Math.max(0, patientResponsibility - paidAmount - currentAdjustment);

    if (remainingBalance <= 0) {
      return res.json({ ok: true, alreadyWaived: true, billId });
    }

    const nextAdjustment = currentAdjustment + remainingBalance;
    const nextBalance = Math.max(0, patientResponsibility - paidAmount - nextAdjustment);
    const nextStatus = nextBalance === 0 ? (paidAmount > 0 ? "paid" : "written_off") : "partial";
    const waiverAudit = `[LATE_FEE_WAIVED]|by=${req.user!.id}|at=${new Date().toISOString()}|reason=${reason}`;
    const nextNotes = notes.includes("[LATE_FEE_WAIVED]") ? notes : `${notes}\n${waiverAudit}`;

    await pool.query(
      `update bills
       set adjustment_amount_cents = $1,
           balance_cents = $2,
           status = $3,
           notes = $4,
           updated_at = now()
       where id = $5 and tenant_id = $6`,
      [nextAdjustment, nextBalance, nextStatus, nextNotes, billId, tenantId],
    );

    await auditLog(tenantId, req.user!.id, "late_fee_waive", "bill", billId);
    return res.json({
      ok: true,
      billId,
      waivedAmountCents: remainingBalance,
    });
  },
);
