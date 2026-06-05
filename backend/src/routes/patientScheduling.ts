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
import { getPracticeTimeZone } from "../lib/practiceTimeZone";
import { logger } from "../lib/logger";
import { env } from "../config/env";
import { notificationService } from "../services/integrations/notificationService";
import { workflowOrchestrator } from "../services/workflowOrchestrator";
import { emitAppointmentCreated } from "../websocket/emitter";
import { createLateFeeBillIfNeeded } from "../services/cancellationFeeService";

// ============================================================================
// PATIENT PORTAL ROUTES (Public-facing for patients)
// ============================================================================

export const patientSchedulingRouter = Router();
const DEFAULT_GUEST_CANCELLATION_FEE_CENTS = 5000;
const GUEST_BOOKING_TEST_CARD_NUMBERS = new Set([
  "4242424242424242",
]);
const GUEST_BOOKING_TEST_CARD_MESSAGE =
  "Guest booking is currently in demo payment mode. Use the test card 4242 4242 4242 4242; do not enter a real card.";

type PublicBookingSettings = {
  isEnabled: boolean;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  bookingWindowDays: number;
  timeZone: string;
  customMessage?: string | null;
  requireReason?: boolean | null;
  allowGuestBooking?: boolean | null;
  requireCardOnFileForGuestBooking?: boolean | null;
  guestCancellationFeeCents?: number | null;
};

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPatientSchedulingError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function resolveTenantId(req: { header: (name: string) => string | undefined; query?: any }): string | null {
  const headerTenantId = req.header(env.tenantHeader);
  if (headerTenantId) {
    return headerTenantId;
  }

  const queryTenantId = typeof req.query?.tenantId === "string" ? req.query.tenantId.trim() : "";
  return queryTenantId || null;
}

async function getPublicBookingSettings(tenantId: string): Promise<PublicBookingSettings> {
  const bookingRules = await getBookingSettings(tenantId);

  const detailResult = await pool.query(
    `SELECT custom_message as "customMessage",
            require_reason as "requireReason",
            COALESCE(allow_guest_booking, true) as "allowGuestBooking",
            COALESCE(require_card_on_file_for_guest_booking, true) as "requireCardOnFileForGuestBooking",
            COALESCE(guest_cancellation_fee_cents, $2) as "guestCancellationFeeCents"
     FROM online_booking_settings
     WHERE tenant_id = $1`,
    [tenantId, DEFAULT_GUEST_CANCELLATION_FEE_CENTS]
  );

  return {
    ...bookingRules,
    timeZone: getPracticeTimeZone(),
    customMessage: detailResult.rows[0]?.customMessage ?? null,
    requireReason: detailResult.rows[0]?.requireReason ?? false,
    allowGuestBooking: detailResult.rows[0]?.allowGuestBooking ?? true,
    requireCardOnFileForGuestBooking:
      detailResult.rows[0]?.requireCardOnFileForGuestBooking ?? true,
    guestCancellationFeeCents:
      detailResult.rows[0]?.guestCancellationFeeCents ?? DEFAULT_GUEST_CANCELLATION_FEE_CENTS,
  };
}

async function getBookableProviders(tenantId: string) {
  const result = await pool.query(
    `SELECT DISTINCT
            p.id,
            p.full_name as "fullName",
            NULL::text as specialty,
            NULL::text as bio,
            NULL::text as "profileImageUrl"
     FROM providers p
     INNER JOIN provider_availability_templates pat
       ON p.id = pat.provider_id
     WHERE p.tenant_id = $1
       AND pat.is_active = true
       AND pat.allow_online_booking = true
     ORDER BY p.full_name`,
    [tenantId]
  );

  return result.rows;
}

async function getBookableAppointmentTypes(tenantId: string) {
  const result = await pool.query(
    `SELECT id, name, duration_minutes as "durationMinutes",
            description, color
     FROM appointment_types
     WHERE tenant_id = $1
       AND is_active = true
     ORDER BY name`,
    [tenantId]
  );

  return result.rows;
}

function inferCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");

  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(digits)) return "visa";
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7[01]\d{12}|720\d{12}))$/.test(digits)) {
    return "mastercard";
  }
  if (/^3[47]\d{13}$/.test(digits)) return "amex";
  if (/^(6011\d{12}|65\d{14}|64[4-9]\d{13})$/.test(digits)) return "discover";
  return "card";
}

async function findOrCreateGuestPatient(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  tenantId: string,
  guest: {
    firstName: string;
    lastName: string;
    dob: string;
    phone: string;
    email: string;
  },
): Promise<string> {
  const normalizedEmail = guest.email.trim().toLowerCase();
  const normalizedPhone = guest.phone.trim();

  let patientResult = await client.query(
    `SELECT id
     FROM patients
     WHERE tenant_id = $1
       AND LOWER(email) = $2
       AND dob = $3
     LIMIT 1`,
    [tenantId, normalizedEmail, guest.dob]
  );

  if (patientResult.rows.length === 0) {
    patientResult = await client.query(
      `SELECT id
       FROM patients
       WHERE tenant_id = $1
         AND phone = $2
         AND dob = $3
       LIMIT 1`,
      [tenantId, normalizedPhone, guest.dob]
    );
  }

  if (patientResult.rows.length > 0) {
    const patientId = patientResult.rows[0].id as string;
    await client.query(
      `UPDATE patients
       SET first_name = COALESCE(NULLIF(first_name, ''), $1),
           last_name = COALESCE(NULLIF(last_name, ''), $2),
           phone = COALESCE(NULLIF(phone, ''), $3),
           email = COALESCE(NULLIF(email, ''), $4),
           referral_source = COALESCE(referral_source, 'Website guest booking'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6`,
      [guest.firstName, guest.lastName, normalizedPhone, normalizedEmail, patientId, tenantId]
    );
    return patientId;
  }

  const patientId = crypto.randomUUID();
  await client.query(
    `INSERT INTO patients (
      id, tenant_id, first_name, last_name, dob, phone, email, referral_source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      patientId,
      tenantId,
      guest.firstName,
      guest.lastName,
      guest.dob,
      normalizedPhone,
      normalizedEmail,
      "Website guest booking",
    ]
  );

  return patientId;
}

/**
 * GET /api/patient-portal/scheduling/settings
 * Get online booking settings
 */
patientSchedulingRouter.get(
  "/settings",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const settings = await getPublicBookingSettings(req.patient!.tenantId);
      return res.json(settings);
    } catch (error) {
      logPatientSchedulingError("Get booking settings error", error);
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
      const providers = await getBookableProviders(req.patient!.tenantId);
      return res.json({ providers });
    } catch (error) {
      logPatientSchedulingError("Get providers error", error);
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
      const appointmentTypes = await getBookableAppointmentTypes(req.patient!.tenantId);
      return res.json({ appointmentTypes });
    } catch (error) {
      logPatientSchedulingError("Get appointment types error", error);
      return res.status(500).json({ error: "Failed to get appointment types" });
    }
  }
);

patientSchedulingRouter.get(
  "/public/settings",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    try {
      const settings = await getPublicBookingSettings(tenantId);
      return res.json(settings);
    } catch (error) {
      logPatientSchedulingError("Get public booking settings error", error);
      return res.status(500).json({ error: "Failed to get booking settings" });
    }
  }
);

patientSchedulingRouter.get(
  "/public/providers",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    try {
      const providers = await getBookableProviders(tenantId);
      return res.json({ providers });
    } catch (error) {
      logPatientSchedulingError("Get public providers error", error);
      return res.status(500).json({ error: "Failed to get providers" });
    }
  }
);

patientSchedulingRouter.get(
  "/public/appointment-types",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    try {
      const appointmentTypes = await getBookableAppointmentTypes(tenantId);
      return res.json({ appointmentTypes });
    } catch (error) {
      logPatientSchedulingError("Get public appointment types error", error);
      return res.status(500).json({ error: "Failed to get appointment types" });
    }
  }
);

/**
 * GET /api/patient-portal/scheduling/available-dates
 * Get dates in a month that have availability
 */
const bookingEntityId = z.string().trim().min(1).max(120);

const availableDatesSchema = z.object({
  providerId: bookingEntityId,
  appointmentTypeId: bookingEntityId,
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
      logPatientSchedulingError("Get available dates error", error);
      return res.status(500).json({ error: "Failed to get available dates" });
    }
  }
);

patientSchedulingRouter.get(
  "/public/available-dates",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = availableDatesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, appointmentTypeId, year, month } = parsed.data;

    try {
      const dates = await getAvailableDatesInMonth(
        tenantId,
        providerId,
        appointmentTypeId,
        parseInt(year),
        parseInt(month) - 1,
      );

      return res.json({ dates });
    } catch (error) {
      logPatientSchedulingError("Get public available dates error", error);
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
  providerId: bookingEntityId,
  appointmentTypeId: bookingEntityId,
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
      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId,
        appointmentTypeId,
        date,
      });

      // Add provider info to slots
      const providerInfo = await getProviderInfo(req.patient!.tenantId, providerId);

      const slotsWithProvider = slots.map((slot) => ({
        ...slot,
        providerName: providerInfo?.fullName,
      }));

      return res.json({ slots: slotsWithProvider });
    } catch (error) {
      logPatientSchedulingError("Get availability error", error);
      return res.status(500).json({ error: "Failed to get availability" });
    }
  }
);

patientSchedulingRouter.get(
  "/public/availability",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = availabilitySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { date, providerId, appointmentTypeId } = parsed.data;

    try {
      const slots = await calculateAvailableSlots({
        tenantId,
        providerId,
        appointmentTypeId,
        date,
      });

      const providerInfo = await getProviderInfo(tenantId, providerId);
      return res.json({
        slots: slots.map((slot) => ({
          ...slot,
          providerName: providerInfo?.fullName,
        })),
      });
    } catch (error) {
      logPatientSchedulingError("Get public availability error", error);
      return res.status(500).json({ error: "Failed to get availability" });
    }
  }
);

/**
 * POST /api/patient-portal/scheduling/book
 * Book a new appointment
 */
const bookAppointmentSchema = z.object({
  providerId: bookingEntityId,
  appointmentTypeId: bookingEntityId,
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const guestBookingSchema = z.object({
  providerId: bookingEntityId,
  appointmentTypeId: bookingEntityId,
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  reason: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(1000).optional(),
  guest: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email(),
  }),
  paymentMethod: z.object({
    cardNumber: z.string().trim().min(12).max(25),
    cardholderName: z.string().trim().min(2).max(120),
    expiryMonth: z.number().int().min(1).max(12),
    expiryYear: z.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 20),
    billingZip: z.string().trim().min(3).max(12),
  }),
  policy: z.object({
    acknowledged: z.literal(true),
    cancellationFeeCents: z.number().int().positive(),
  }),
});

type BookingSideEffectSource = "patient_portal" | "guest_booking";

async function getAppointmentDetailsForSideEffects(tenantId: string, appointmentId: string) {
  const result = await pool.query(
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
     WHERE a.id = $1 AND a.tenant_id = $2
     LIMIT 1`,
    [appointmentId, tenantId],
  );

  return result.rows[0] || null;
}

async function runBookingSideEffects(params: {
  tenantId: string;
  appointmentId: string;
  userId?: string | null;
  source: BookingSideEffectSource;
}) {
  try {
    const appt = await getAppointmentDetailsForSideEffects(params.tenantId, params.appointmentId);
    if (!appt) {
      return;
    }

    await notificationService.sendNotification({
      tenantId: params.tenantId,
      notificationType: "appointment_booked",
      data: {
        patientName: appt.patient_name,
        appointmentType: appt.appointment_type,
        scheduledStart: appt.scheduled_start,
        scheduledEnd: appt.scheduled_end,
        providerName: appt.provider_name,
        locationName: appt.location_name,
        source: params.source,
      },
    });

    emitAppointmentCreated(params.tenantId, {
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

    await workflowOrchestrator.processEvent({
      type: "appointment_scheduled",
      tenantId: params.tenantId,
      userId: params.userId || "patient_portal",
      entityType: "appointment",
      entityId: params.appointmentId,
      data: {
        patientId: appt.patient_id,
        providerId: appt.provider_id,
        appointmentType: appt.appointment_type,
        scheduledStart: appt.scheduled_start,
        source: params.source,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logPatientSchedulingError("Portal booking side effects failed", error);
  }
}

patientSchedulingRouter.post(
  "/book",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = bookAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, appointmentTypeId, scheduledStart, reason, notes } =
      parsed.data;

    const client = await pool.connect();
    const appointmentId = crypto.randomUUID();
    let scheduledEnd = parsed.data.scheduledEnd;

    try {
      await client.query("BEGIN");

      // Verify slot is still available
      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId,
        appointmentTypeId,
        date: scheduledStart,
      });

      const requestedSlot = slots.find((slot) => slot.startTime === scheduledStart);

      if (!requestedSlot || !requestedSlot.isAvailable) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Time slot is no longer available" });
      }

      scheduledEnd = requestedSlot.endTime;

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
      await client.query(
        `INSERT INTO appointments (
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end, status, reason, notes
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

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logPatientSchedulingError("Book appointment error", error);
      return res.status(500).json({ error: "Failed to book appointment" });
    } finally {
      client.release();
    }

    try {
      await pool.query(
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
    } catch (error) {
      logger.warn("Patient portal booking history was not recorded", {
        appointmentId,
        error: toSafeErrorMessage(error),
      });
    }

    try {
      await pool.query(
        `INSERT INTO audit_log (
          id, tenant_id, user_id, action, resource_type, resource_id,
          ip_address, user_agent, metadata, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          null,
          "patient_portal_book_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          JSON.stringify({
            source: "patient_portal",
            patientPortalAccountId: req.patient!.accountId,
            patientId: req.patient!.patientId,
          }),
          "info",
          "success",
        ]
      );
    } catch (error) {
      logger.warn("Patient portal booking audit log was not recorded", {
        appointmentId,
        error: toSafeErrorMessage(error),
      });
    }

    await runBookingSideEffects({
      tenantId: req.patient!.tenantId,
      appointmentId,
      userId: req.patient!.accountId,
      source: "patient_portal",
    });

    return res.status(201).json({
      appointmentId,
      scheduledStart,
      scheduledEnd,
      message: "Appointment booked successfully",
    });
  }
);

patientSchedulingRouter.post(
  "/public/book-guest",
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = guestBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { providerId, appointmentTypeId, scheduledStart, reason, notes, guest, paymentMethod, policy } =
      parsed.data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const settings = await getPublicBookingSettings(tenantId);
      if (!settings.isEnabled) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Online booking is currently unavailable" });
      }

      if (!settings.allowGuestBooking) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Guest booking is not enabled" });
      }

      const expectedFee = settings.guestCancellationFeeCents ?? DEFAULT_GUEST_CANCELLATION_FEE_CENTS;
      if (policy.cancellationFeeCents !== expectedFee) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Guest booking policy has changed. Please review and try again." });
      }

      const slots = await calculateAvailableSlots({
        tenantId,
        providerId,
        appointmentTypeId,
        date: scheduledStart,
      });
      const requestedSlot = slots.find((slot) => slot.startTime === scheduledStart);

      if (!requestedSlot || !requestedSlot.isAvailable) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Time slot is no longer available" });
      }

      const scheduledEnd = requestedSlot.endTime;

      const conflictCheck = await client.query(
        `SELECT 1 FROM appointments
         WHERE tenant_id = $1
           AND provider_id = $2
           AND status IN ('scheduled', 'confirmed', 'checked_in')
           AND tstzrange(scheduled_start, scheduled_end, '[)') &&
               tstzrange($3::timestamptz, $4::timestamptz, '[)')
         LIMIT 1`,
        [tenantId, providerId, scheduledStart, scheduledEnd]
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Time slot is no longer available" });
      }

      const normalizedCardNumber = paymentMethod.cardNumber.replace(/\D/g, "");
      if (!GUEST_BOOKING_TEST_CARD_NUMBERS.has(normalizedCardNumber)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: GUEST_BOOKING_TEST_CARD_MESSAGE });
      }

      const patientId = await findOrCreateGuestPatient(client, tenantId, guest);

      const locationResult = await client.query(
        `SELECT id FROM locations WHERE tenant_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1`,
        [tenantId]
      );

      if (locationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "No location found" });
      }

      const locationId = locationResult.rows[0].id as string;
      const appointmentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO appointments (
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end, status, reason, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          appointmentId,
          tenantId,
          patientId,
          providerId,
          locationId,
          appointmentTypeId,
          scheduledStart,
          scheduledEnd,
          "scheduled",
          reason,
          notes || null,
        ]
      );

      const paymentMethodId = crypto.randomUUID();
      const paymentToken = `pm_guest_${crypto.randomUUID().replace(/-/g, "")}`;
      await client.query(
        `INSERT INTO payment_methods (
          id, tenant_id, patient_id, stripe_payment_method_id, stripe_customer_id,
          type, card_brand, card_last4, card_exp_month, card_exp_year,
          billing_name, billing_zip, is_default, is_active
        ) VALUES ($1, $2, $3, $4, $5, 'card', $6, $7, $8, $9, $10, $11, false, true)`,
        [
          paymentMethodId,
          tenantId,
          patientId,
          paymentToken,
          null,
          inferCardBrand(normalizedCardNumber),
          normalizedCardNumber.slice(-4),
          paymentMethod.expiryMonth,
          paymentMethod.expiryYear,
          paymentMethod.cardholderName,
          paymentMethod.billingZip,
        ]
      );

      await client.query(
        `INSERT INTO online_booking_guest_guarantees (
          id, tenant_id, appointment_id, patient_id, payment_method_id,
          cancellation_fee_cents, policy_acknowledged, policy_text, processor, authorization_status
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)`,
        [
          crypto.randomUUID(),
          tenantId,
          appointmentId,
          patientId,
          paymentMethodId,
          expectedFee,
          `Guest booking card on file authorizes up to $${(expectedFee / 100).toFixed(2)} for late cancellation or no-show.`,
          "mock_stripe",
          "authorized",
        ]
      );

      await client.query(
        `INSERT INTO appointment_booking_history (
          id, tenant_id, appointment_id, patient_id, action,
          new_scheduled_start, new_scheduled_end, reason,
          booked_via, ip_address, user_agent, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          tenantId,
          appointmentId,
          patientId,
          "booked",
          scheduledStart,
          scheduledEnd,
          reason,
          "website_guest",
          req.ip,
          req.get("user-agent"),
          null,
        ]
      );

      await client.query(
        `INSERT INTO audit_log (
          id, tenant_id, user_id, action, resource_type, resource_id,
          ip_address, user_agent, metadata, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          tenantId,
          null,
          "website_guest_book_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          JSON.stringify({
            source: "website_guest",
            patientId,
            bookingEmail: guest.email,
            paymentMethodId,
            notes: notes || null,
          }),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      await runBookingSideEffects({
        tenantId,
        appointmentId,
        userId: null,
        source: "guest_booking",
      });

      return res.status(201).json({
        appointmentId,
        scheduledStart,
        scheduledEnd,
        message: "Appointment booked successfully",
        guestBooking: {
          patientId,
          cardLast4: normalizedCardNumber.slice(-4),
          cancellationFeeCents: expectedFee,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logPatientSchedulingError("Guest website booking error", error);
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
    const { scheduledStart, reason } = parsed.data;

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
      const canCancel = await canCancelAppointment(req.patient!.tenantId, appointmentId!);
      if (!canCancel.canCancel) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: canCancel.reason });
      }

      // Verify new slot is available
      const slots = await calculateAvailableSlots({
        tenantId: req.patient!.tenantId,
        providerId: appointment.providerId,
        appointmentTypeId: appointment.appointmentTypeId,
        date: scheduledStart,
      });

      const requestedSlot = slots.find((slot) => slot.startTime === scheduledStart);

      if (!requestedSlot || !requestedSlot.isAvailable) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "New time slot is not available" });
      }

      const scheduledEnd = requestedSlot.endTime;

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
             scheduled_end = $2
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
          ip_address, user_agent, metadata, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          null,
          "patient_portal_reschedule_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          JSON.stringify({
            source: "patient_portal",
            patientPortalAccountId: req.patient!.accountId,
            patientId: req.patient!.patientId,
          }),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      // TODO: Send reschedule confirmation email

      return res.json({ message: "Appointment rescheduled successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      logPatientSchedulingError("Reschedule appointment error", error);
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
                patient_id as "patientId",
                status
         FROM appointments
         WHERE id = $1
           AND tenant_id = $2
           AND patient_id = $3
         FOR UPDATE`,
        [appointmentId, req.patient!.tenantId, req.patient!.patientId]
      );

      if (apptResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Appointment not found" });
      }

      const appointment = apptResult.rows[0];

      // Check if appointment can be cancelled
      const canCancel = await canCancelAppointment(req.patient!.tenantId, appointmentId!);
      if (!canCancel.canCancel) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: canCancel.reason });
      }

      // Cancel appointment
      await client.query(
        `UPDATE appointments
         SET status = 'cancelled'
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, req.patient!.tenantId]
      );

      const cancellationFeeBillId =
        appointment.status === "cancelled"
          ? null
          : await createLateFeeBillIfNeeded(client, {
              tenantId: req.patient!.tenantId,
              appointmentId: appointmentId!,
              patientId: appointment.patientId,
              referenceScheduledStart: appointment.scheduledStart,
              trigger: "cancel",
              assessedBy: req.patient!.accountId,
              bypassWindow: true,
              reason: reason || "Cancelled by patient",
            });

      // Add status history
      await client.query(
        `INSERT INTO appointment_status_history (
          id, tenant_id, appointment_id, status, changed_by
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          appointmentId,
          "cancelled",
          req.patient!.accountId,
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
          ip_address, user_agent, metadata, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          null,
          "patient_portal_cancel_appointment",
          "appointment",
          appointmentId,
          req.ip,
          req.get("user-agent"),
          JSON.stringify({
            source: "patient_portal",
            patientPortalAccountId: req.patient!.accountId,
            patientId: req.patient!.patientId,
          }),
          "info",
          "success",
        ]
      );

      await client.query("COMMIT");

      // TODO: Send cancellation email

      return res.json({ message: "Appointment cancelled successfully", cancellationFeeBillId });
    } catch (error) {
      await client.query("ROLLBACK");
      logPatientSchedulingError("Cancel appointment error", error);
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
      logPatientSchedulingError("Get availability templates error", error);
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
      logPatientSchedulingError("Create availability template error", error);
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
      logPatientSchedulingError("Update availability template error", error);
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
      logPatientSchedulingError("Delete availability template error", error);
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
      logPatientSchedulingError("Get time-off error", error);
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
      logPatientSchedulingError("Create time-off error", error);
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
      logPatientSchedulingError("Delete time-off error", error);
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
      logPatientSchedulingError("Get settings error", error);
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
  allowGuestBooking: z.boolean().optional(),
  requireCardOnFileForGuestBooking: z.boolean().optional(),
  guestCancellationFeeCents: z.number().int().min(0).optional(),
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
      logPatientSchedulingError("Update settings error", error);
      return res.status(500).json({ error: "Failed to update settings" });
    }
  }
);
