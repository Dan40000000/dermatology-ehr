import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import { rateLimit } from "../middleware/rateLimit";
import {
  calculateAvailableSlots,
  getBookingSettings,
  canCancelAppointment,
  getProviderInfo,
  getAvailableDatesInMonth,
} from "../services/availabilityService";

// ============================================================================
// PATIENT PORTAL ROUTES (Public-facing for patients)
// ============================================================================

export const patientSchedulingRouter = Router();

/**
 * GET /api/patient-portal/scheduling/settings
 * Get online booking settings
 */
patientSchedulingRouter.get(
  "/settings",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const settings = await getBookingSettings(req.patient!.tenantId);

      // Also get custom message
      const customMessageResult = await pool.query(
        `SELECT custom_message as "customMessage",
                require_reason as "requireReason"
         FROM online_booking_settings
         WHERE tenant_id = $1`,
        [req.patient!.tenantId]
      );

      return res.json({
        ...settings,
        customMessage: customMessageResult.rows[0]?.customMessage,
        requireReason: customMessageResult.rows[0]?.requireReason,
      });
    } catch (error) {
      console.error("Get booking settings error:", error);
      return res.status(500).json({ error: "Failed to get booking settings" });
    }
  }
);

/**
 * GET /api/patient-portal/scheduling/providers
 * Get list of providers available for online booking
 */
patientSchedulingRouter.get(
  "/providers",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT p.id, p.full_name as "fullName", p.specialty,
                p.bio, p.profile_image_url as "profileImageUrl"
         FROM providers p
         INNER JOIN provider_availability_templates pat
           ON p.id = pat.provider_id
         WHERE p.tenant_id = $1
           AND pat.is_active = true
           AND pat.allow_online_booking = true
         ORDER BY p.full_name`,
        [req.patient!.tenantId]
      );

      return res.json({ providers: result.rows });
    } catch (error) {
      console.error("Get providers error:", error);
      return res.status(500).json({ error: "Failed to get providers" });
    }
  }
);

/**
 * GET /api/patient-portal/scheduling/appointment-types
 * Get list of appointment types available for online booking
 */
patientSchedulingRouter.get(
  "/appointment-types",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, duration_minutes as "durationMinutes",
                description, color
         FROM appointment_types
         WHERE tenant_id = $1
           AND is_active = true
         ORDER BY name`,
        [req.patient!.tenantId]
      );

      return res.json({ appointmentTypes: result.rows });
    } catch (error) {
      console.error("Get appointment types error:", error);
      return res.status(500).json({ error: "Failed to get appointment types" });
    }
  }
);

/**
 * GET /api/patient-portal/scheduling/available-dates
 * Get dates in a month that have availability
 */
const availableDatesSchema = z.object({
  providerId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  year: z.string().regex(/^\d{4}$/),
  month: z.string().regex(/^(0?[1-9]|1[0-2])$/),
});

patientSchedulingRouter.get(
  "/available-dates",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    const parsed = availableDatesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, appointmentTypeId, year, month } = parsed.data;

    try {
      const dates = await getAvailableDatesInMonth(
        req.patient!.tenantId,
        providerId,
        appointmentTypeId,
        parseInt(year),
        parseInt(month) - 1 // Convert to 0-based month
      );

      return res.json({ dates });
    } catch (error) {
      console.error("Get available dates error:", error);
      return res.status(500).json({ error: "Failed to get available dates" });
    }
  }
);

/**
 * GET /api/patient-portal/scheduling/availability
 * Get available time slots for a specific date
 */
const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  providerId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
});

patientSchedulingRouter.get(
  "/availability",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 30 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = availabilitySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { date, providerId, appointmentTypeId } = parsed.data;

    try {
      const dateObj = new Date(date + "T00:00:00");

      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId,
        appointmentTypeId,
        date: dateObj,
      });

      // Add provider info to slots
      const providerInfo = await getProviderInfo(req.patient!.tenantId, providerId);

      const slotsWithProvider = slots.map((slot) => ({
        ...slot,
        providerName: providerInfo?.fullName,
      }));

      return res.json({ slots: slotsWithProvider });
    } catch (error) {
      console.error("Get availability error:", error);
      return res.status(500).json({ error: "Failed to get availability" });
    }
  }
);

/**
 * POST /api/patient-portal/scheduling/book
 * Book a new appointment
 */
const bookAppointmentSchema = z.object({
  providerId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

patientSchedulingRouter.post(
  "/book",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = bookAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, appointmentTypeId, scheduledStart, scheduledEnd, reason, notes } =
      parsed.data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify slot is still available
      const startDate = new Date(scheduledStart);
      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId,
        appointmentTypeId,
        date: startDate,
      });

      const requestedSlot = slots.find((slot) => slot.startTime === scheduledStart);

      if (!requestedSlot || !requestedSlot.isAvailable) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Time slot is no longer available" });
      }

      // Check for double-booking (race condition protection)
      const conflictCheck = await client.query(
        `SELECT 1 FROM appointments
         WHERE tenant_id = $1
           AND provider_id = $2
           AND status IN ('scheduled', 'confirmed', 'checked_in')
           AND tstzrange(scheduled_start, scheduled_end, '[)') &&
               tstzrange($3::timestamptz, $4::timestamptz, '[)')
         LIMIT 1`,
        [req.patient!.tenantId, providerId, scheduledStart, scheduledEnd]
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Time slot is no longer available" });
      }

      // Get default location (first location for tenant)
      const locationResult = await client.query(
        `SELECT id FROM locations WHERE tenant_id = $1 LIMIT 1`,
        [req.patient!.tenantId]
      );

      if (locationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "No location found" });
      }

      const locationId = locationResult.rows[0].id;

      // Create appointment
      const appointmentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO appointments (
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end, status,
          chief_complaint, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          appointmentId,
          req.patient!.tenantId,
          req.patient!.patientId,
          providerId,
          locationId,
          appointmentTypeId,
          scheduledStart,
          scheduledEnd,
          "scheduled",
          reason || null,
          notes || null,
        ]
      );

      // Log booking history
      await client.query(
        `INSERT INTO appointment_booking_history (
          id, tenant_id, appointment_id, patient_id, action,
          new_scheduled_start, new_scheduled_end, reason,
          booked_via, ip_address, user_agent, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          appointmentId,
          req.patient!.patientId,
          "booked",
          scheduledStart,
          scheduledEnd,
          reason || null,
          "patient_portal",
          req.ip,
          req.get("user-agent"),
          req.patient!.accountId,
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_log (
          id, tenant_id, user_id, action, resource_type, resource_id,
          ip_address, user_agent, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          req.patient!.accountId,
          "patient_portal_book_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      // TODO: Send confirmation email

      return res.status(201).json({
        appointmentId,
        message: "Appointment booked successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Book appointment error:", error);
      return res.status(500).json({ error: "Failed to book appointment" });
    } finally {
      client.release();
    }
  }
);

/**
 * PUT /api/patient-portal/scheduling/reschedule/:appointmentId
 * Reschedule an existing appointment
 */
const rescheduleSchema = z.object({
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  reason: z.string().optional(),
});

patientSchedulingRouter.put(
  "/reschedule/:appointmentId",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const appointmentId = req.params.appointmentId;
    const { scheduledStart, scheduledEnd, reason } = parsed.data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing appointment
      const apptResult = await client.query(
        `SELECT a.id, a.provider_id as "providerId",
                a.appointment_type_id as "appointmentTypeId",
                a.scheduled_start as "scheduledStart",
                a.scheduled_end as "scheduledEnd",
                a.status
         FROM appointments a
         WHERE a.id = $1
           AND a.tenant_id = $2
           AND a.patient_id = $3`,
        [appointmentId, req.patient!.tenantId, req.patient!.patientId]
      );

      if (apptResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Appointment not found" });
      }

      const appointment = apptResult.rows[0];

      // Check if appointment can be rescheduled (must meet cancellation cutoff)
      const canCancel = await canCancelAppointment(req.patient!.tenantId, appointmentId);
      if (!canCancel.canCancel) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: canCancel.reason });
      }

      // Verify new slot is available
      const startDate = new Date(scheduledStart);
      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId: appointment.providerId,
        appointmentTypeId: appointment.appointmentTypeId,
        date: startDate,
      });

      const requestedSlot = slots.find((slot) => slot.startTime === scheduledStart);

      if (!requestedSlot || !requestedSlot.isAvailable) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "New time slot is not available" });
      }

      // Check for double-booking
      const conflictCheck = await client.query(
        `SELECT 1 FROM appointments
         WHERE tenant_id = $1
           AND provider_id = $2
           AND id != $3
           AND status IN ('scheduled', 'confirmed', 'checked_in')
           AND tstzrange(scheduled_start, scheduled_end, '[)') &&
               tstzrange($4::timestamptz, $5::timestamptz, '[)')
         LIMIT 1`,
        [req.patient!.tenantId, appointment.providerId, appointmentId, scheduledStart, scheduledEnd]
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "New time slot is no longer available" });
      }

      // Update appointment
      await client.query(
        `UPDATE appointments
         SET scheduled_start = $1,
             scheduled_end = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND tenant_id = $4`,
        [scheduledStart, scheduledEnd, appointmentId, req.patient!.tenantId]
      );

      // Log booking history
      await client.query(
        `INSERT INTO appointment_booking_history (
          id, tenant_id, appointment_id, patient_id, action,
          previous_scheduled_start, previous_scheduled_end,
          new_scheduled_start, new_scheduled_end, reason,
          booked_via, ip_address, user_agent, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          appointmentId,
          req.patient!.patientId,
          "rescheduled",
          appointment.scheduledStart,
          appointment.scheduledEnd,
          scheduledStart,
          scheduledEnd,
          reason || null,
          "patient_portal",
          req.ip,
          req.get("user-agent"),
          req.patient!.accountId,
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_log (
          id, tenant_id, user_id, action, resource_type, resource_id,
          ip_address, user_agent, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          req.patient!.accountId,
          "patient_portal_reschedule_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      // TODO: Send reschedule confirmation email

      return res.json({ message: "Appointment rescheduled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Reschedule appointment error:", error);
      return res.status(500).json({ error: "Failed to reschedule appointment" });
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/patient-portal/scheduling/cancel/:appointmentId
 * Cancel an appointment
 */
const cancelSchema = z.object({
  reason: z.string().optional(),
});

patientSchedulingRouter.delete(
  "/cancel/:appointmentId",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const appointmentId = req.params.appointmentId;
    const { reason } = parsed.data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify appointment belongs to patient
      const apptResult = await client.query(
        `SELECT scheduled_start as "scheduledStart",
                scheduled_end as "scheduledEnd",
                status
         FROM appointments
         WHERE id = $1
           AND tenant_id = $2
           AND patient_id = $3`,
        [appointmentId, req.patient!.tenantId, req.patient!.patientId]
      );

      if (apptResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Appointment not found" });
      }

      const appointment = apptResult.rows[0];

      // Check if appointment can be cancelled
      const canCancel = await canCancelAppointment(req.patient!.tenantId, appointmentId);
      if (!canCancel.canCancel) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: canCancel.reason });
      }

      // Cancel appointment
      await client.query(
        `UPDATE appointments
         SET status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, req.patient!.tenantId]
      );

      // Add status history
      await client.query(
        `INSERT INTO appointment_status_history (
          id, tenant_id, appointment_id, status, changed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          appointmentId,
          "cancelled",
          req.patient!.accountId,
          reason || "Cancelled by patient via portal",
        ]
      );

      // Log booking history
      await client.query(
        `INSERT INTO appointment_booking_history (
          id, tenant_id, appointment_id, patient_id, action,
          previous_scheduled_start, previous_scheduled_end, reason,
          booked_via, ip_address, user_agent, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          appointmentId,
          req.patient!.patientId,
          "cancelled",
          appointment.scheduledStart,
          appointment.scheduledEnd,
          reason || "Cancelled by patient",
          "patient_portal",
          req.ip,
          req.get("user-agent"),
          req.patient!.accountId,
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_log (
          id, tenant_id, user_id, action, resource_type, resource_id,
          ip_address, user_agent, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          req.patient!.accountId,
          "patient_portal_cancel_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      // TODO: Send cancellation email

      return res.json({ message: "Appointment cancelled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Cancel appointment error:", error);
      return res.status(500).json({ error: "Failed to cancel appointment" });
    } finally {
      client.release();
    }
  }
);

// ============================================================================
// PROVIDER/ADMIN ROUTES (Internal staff management)
// ============================================================================

export const providerSchedulingRouter = Router();

/**
 * GET /api/scheduling/availability-templates
 * List all provider availability templates
 */
providerSchedulingRouter.get(
  "/availability-templates",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT pat.id, pat.provider_id as "providerId",
                p.full_name as "providerName",
                pat.day_of_week as "dayOfWeek",
                pat.start_time as "startTime",
                pat.end_time as "endTime",
                pat.slot_duration_minutes as "slotDuration",
                pat.allow_online_booking as "allowOnlineBooking",
                pat.is_active as "isActive",
                pat.created_at as "createdAt"
         FROM provider_availability_templates pat
         JOIN providers p ON pat.provider_id = p.id
         WHERE pat.tenant_id = $1
         ORDER BY p.full_name, pat.day_of_week, pat.start_time`,
        [req.user!.tenantId]
      );

      return res.json({ templates: result.rows });
    } catch (error) {
      console.error("Get availability templates error:", error);
      return res.status(500).json({ error: "Failed to get availability templates" });
    }
  }
);

/**
 * POST /api/scheduling/availability-templates
 * Create a new availability template
 */
const createTemplateSchema = z.object({
  providerId: z.string().uuid(),
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDuration: z.number().refine((val) => [15, 30, 60].includes(val)),
  allowOnlineBooking: z.boolean().optional(),
});

providerSchedulingRouter.post(
  "/availability-templates",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, dayOfWeek, startTime, endTime, slotDuration, allowOnlineBooking } =
      parsed.data;

    try {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO provider_availability_templates (
          id, tenant_id, provider_id, day_of_week, start_time, end_time,
          slot_duration_minutes, allow_online_booking
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          req.user!.tenantId,
          providerId,
          dayOfWeek,
          startTime,
          endTime,
          slotDuration,
          allowOnlineBooking ?? true,
        ]
      );

      return res.status(201).json({ id, message: "Availability template created" });
    } catch (error) {
      console.error("Create availability template error:", error);
      return res.status(500).json({ error: "Failed to create availability template" });
    }
  }
);

/**
 * PUT /api/scheduling/availability-templates/:id
 * Update an availability template
 */
const updateTemplateSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  slotDuration: z.number().refine((val) => [15, 30, 60].includes(val)).optional(),
  allowOnlineBooking: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

providerSchedulingRouter.put(
  "/availability-templates/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const templateId = req.params.id;
    const updates = parsed.data;

    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          setClauses.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(req.user!.tenantId, templateId);

      await pool.query(
        `UPDATE provider_availability_templates
         SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}`,
        values
      );

      return res.json({ message: "Availability template updated" });
    } catch (error) {
      console.error("Update availability template error:", error);
      return res.status(500).json({ error: "Failed to update availability template" });
    }
  }
);

/**
 * DELETE /api/scheduling/availability-templates/:id
 * Delete an availability template
 */
providerSchedulingRouter.delete(
  "/availability-templates/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      await pool.query(
        `DELETE FROM provider_availability_templates
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.user!.tenantId]
      );

      return res.json({ message: "Availability template deleted" });
    } catch (error) {
      console.error("Delete availability template error:", error);
      return res.status(500).json({ error: "Failed to delete availability template" });
    }
  }
);

/**
 * GET /api/scheduling/time-off
 * List provider time-off periods
 */
providerSchedulingRouter.get(
  "/time-off",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT pto.id, pto.provider_id as "providerId",
                p.full_name as "providerName",
                pto.start_datetime as "startDatetime",
                pto.end_datetime as "endDatetime",
                pto.reason, pto.notes,
                pto.is_all_day as "isAllDay",
                pto.created_at as "createdAt"
         FROM provider_time_off pto
         JOIN providers p ON pto.provider_id = p.id
         WHERE pto.tenant_id = $1
           AND pto.end_datetime >= CURRENT_TIMESTAMP
         ORDER BY pto.start_datetime`,
        [req.user!.tenantId]
      );

      return res.json({ timeOff: result.rows });
    } catch (error) {
      console.error("Get time-off error:", error);
      return res.status(500).json({ error: "Failed to get time-off" });
    }
  }
);

/**
 * POST /api/scheduling/time-off
 * Create a new time-off period
 */
const createTimeOffSchema = z.object({
  providerId: z.string().uuid(),
  startDatetime: z.string().datetime(),
  endDatetime: z.string().datetime(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  isAllDay: z.boolean().optional(),
});

providerSchedulingRouter.post(
  "/time-off",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = createTimeOffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, startDatetime, endDatetime, reason, notes, isAllDay } = parsed.data;

    try {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO provider_time_off (
          id, tenant_id, provider_id, start_datetime, end_datetime,
          reason, notes, is_all_day, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          req.user!.tenantId,
          providerId,
          startDatetime,
          endDatetime,
          reason || null,
          notes || null,
          isAllDay ?? false,
          req.user!.id,
        ]
      );

      return res.status(201).json({ id, message: "Time-off created" });
    } catch (error) {
      console.error("Create time-off error:", error);
      return res.status(500).json({ error: "Failed to create time-off" });
    }
  }
);

/**
 * DELETE /api/scheduling/time-off/:id
 * Delete a time-off period
 */
providerSchedulingRouter.delete(
  "/time-off/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      await pool.query(
        `DELETE FROM provider_time_off
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.user!.tenantId]
      );

      return res.json({ message: "Time-off deleted" });
    } catch (error) {
      console.error("Delete time-off error:", error);
      return res.status(500).json({ error: "Failed to delete time-off" });
    }
  }
);

/**
 * GET /api/scheduling/settings
 * Get online booking settings
 */
providerSchedulingRouter.get(
  "/settings",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM online_booking_settings WHERE tenant_id = $1`,
        [req.user!.tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Settings not found" });
      }

      return res.json({ settings: result.rows[0] });
    } catch (error) {
      console.error("Get settings error:", error);
      return res.status(500).json({ error: "Failed to get settings" });
    }
  }
);

/**
 * PUT /api/scheduling/settings
 * Update online booking settings
 */
const updateSettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  bookingWindowDays: z.number().min(1).optional(),
  minAdvanceHours: z.number().min(0).optional(),
  maxAdvanceDays: z.number().min(1).optional(),
  allowCancellation: z.boolean().optional(),
  cancellationCutoffHours: z.number().min(0).optional(),
  requireReason: z.boolean().optional(),
  confirmationEmail: z.boolean().optional(),
  reminderEmail: z.boolean().optional(),
  reminderHoursBefore: z.number().min(0).optional(),
  customMessage: z.string().optional(),
});

providerSchedulingRouter.put(
  "/settings",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updates = parsed.data;

    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          setClauses.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(req.user!.tenantId);

      await pool.query(
        `UPDATE online_booking_settings
         SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex}`,
        values
      );

      return res.json({ message: "Settings updated" });
    } catch (error) {
      console.error("Update settings error:", error);
      return res.status(500).json({ error: "Failed to update settings" });
    }
  }
);
