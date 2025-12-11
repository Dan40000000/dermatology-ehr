import { pool } from "../db/pool";

export interface TimeSlot {
  startTime: string; // ISO datetime string
  endTime: string;   // ISO datetime string
  isAvailable: boolean;
  providerId: string;
  providerName?: string;
}

export interface AvailabilityParams {
  tenantId: string;
  providerId: string;
  appointmentTypeId: string;
  date: Date;
}

export interface BookingRules {
  isEnabled: boolean;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  bookingWindowDays: number;
}

/**
 * Get online booking settings for a tenant
 */
export async function getBookingSettings(tenantId: string): Promise<BookingRules> {
  const result = await pool.query(
    `SELECT is_enabled as "isEnabled",
            min_advance_hours as "minAdvanceHours",
            max_advance_days as "maxAdvanceDays",
            booking_window_days as "bookingWindowDays"
     FROM online_booking_settings
     WHERE tenant_id = $1`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    // Return default settings if none configured
    return {
      isEnabled: true,
      minAdvanceHours: 24,
      maxAdvanceDays: 90,
      bookingWindowDays: 60,
    };
  }

  return result.rows[0];
}

/**
 * Check if a date is within the allowed booking window
 */
export function isDateInBookingWindow(date: Date, rules: BookingRules): boolean {
  if (!rules.isEnabled) return false;

  const now = new Date();
  const minDate = new Date(now.getTime() + rules.minAdvanceHours * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + rules.maxAdvanceDays * 24 * 60 * 60 * 1000);

  return date >= minDate && date <= maxDate;
}

/**
 * Calculate available time slots for a given date, provider, and appointment type
 *
 * Algorithm:
 * 1. Get provider's availability template for this day of week
 * 2. Get provider's time-off periods that overlap with this date
 * 3. Get existing appointments for this date
 * 4. Get appointment type duration
 * 5. Generate time slots based on template
 * 6. Remove slots that:
 *    - Are during time-off
 *    - Overlap with existing appointments
 *    - Are in the past
 *    - Don't meet min_advance_hours requirement
 *    - Are beyond max_advance_days
 *    - Don't have enough consecutive slots for appointment duration
 * 7. Return available slots
 */
export async function calculateAvailableSlots(params: AvailabilityParams): Promise<TimeSlot[]> {
  const { tenantId, providerId, appointmentTypeId, date } = params;

  // Get booking rules
  const rules = await getBookingSettings(tenantId);
  if (!rules.isEnabled) {
    return [];
  }

  // Check if date is in booking window
  if (!isDateInBookingWindow(date, rules)) {
    return [];
  }

  // Get day of week (0=Sunday, 6=Saturday)
  const dayOfWeek = date.getDay();

  // 1. Get provider's availability template for this day
  const templateResult = await pool.query(
    `SELECT start_time as "startTime",
            end_time as "endTime",
            slot_duration_minutes as "slotDuration",
            allow_online_booking as "allowOnlineBooking"
     FROM provider_availability_templates
     WHERE tenant_id = $1
       AND provider_id = $2
       AND day_of_week = $3
       AND is_active = true
       AND allow_online_booking = true`,
    [tenantId, providerId, dayOfWeek]
  );

  if (templateResult.rows.length === 0) {
    // No availability template for this day
    return [];
  }

  const template = templateResult.rows[0];

  // 2. Get provider's time-off for this date
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  const timeOffResult = await pool.query(
    `SELECT start_datetime as "startDatetime",
            end_datetime as "endDatetime",
            is_all_day as "isAllDay"
     FROM provider_time_off
     WHERE tenant_id = $1
       AND provider_id = $2
       AND (
         (start_datetime <= $3 AND end_datetime >= $3)
         OR (start_datetime >= $3 AND start_datetime <= $4)
       )`,
    [tenantId, providerId, dateEnd, dateStart]
  );

  const timeOffPeriods = timeOffResult.rows;

  // If all-day time-off, no slots available
  if (timeOffPeriods.some((period) => period.isAllDay)) {
    return [];
  }

  // 3. Get existing appointments for this provider on this date
  const appointmentsResult = await pool.query(
    `SELECT scheduled_start as "scheduledStart",
            scheduled_end as "scheduledEnd"
     FROM appointments
     WHERE tenant_id = $1
       AND provider_id = $2
       AND status IN ('scheduled', 'confirmed', 'checked_in', 'in_room', 'with_provider')
       AND DATE(scheduled_start) = DATE($3::timestamptz)`,
    [tenantId, providerId, date.toISOString()]
  );

  const existingAppointments = appointmentsResult.rows;

  // 4. Get appointment type duration
  const appointmentTypeResult = await pool.query(
    `SELECT duration_minutes as "durationMinutes"
     FROM appointment_types
     WHERE id = $1 AND tenant_id = $2`,
    [appointmentTypeId, tenantId]
  );

  if (appointmentTypeResult.rows.length === 0) {
    throw new Error("Appointment type not found");
  }

  const appointmentDuration = appointmentTypeResult.rows[0].durationMinutes;

  // 5. Generate time slots based on template
  const slots: TimeSlot[] = [];
  const slotDuration = template.slotDuration;

  // Parse start and end times
  const [startHour, startMinute] = template.startTime.split(":").map(Number);
  const [endHour, endMinute] = template.endTime.split(":").map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Generate all possible slots
  for (let minutes = startMinutes; minutes < endMinutes; minutes += slotDuration) {
    const slotHour = Math.floor(minutes / 60);
    const slotMinute = minutes % 60;

    const slotStart = new Date(date);
    slotStart.setHours(slotHour, slotMinute, 0, 0);

    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      isAvailable: true, // Will be set to false if conflicts exist
      providerId,
    });
  }

  // 6. Filter out unavailable slots
  const now = new Date();
  const minBookingTime = new Date(now.getTime() + rules.minAdvanceHours * 60 * 60 * 1000);

  const availableSlots = slots.filter((slot) => {
    const slotStart = new Date(slot.startTime);
    const slotEnd = new Date(slot.endTime);

    // Check if slot is in the past or doesn't meet minimum advance time
    if (slotStart < minBookingTime) {
      return false;
    }

    // Check if slot overlaps with time-off
    const overlapsTimeOff = timeOffPeriods.some((period) => {
      const timeOffStart = new Date(period.startDatetime);
      const timeOffEnd = new Date(period.endDatetime);

      // Check if slot overlaps with time-off period
      return slotStart < timeOffEnd && slotEnd > timeOffStart;
    });

    if (overlapsTimeOff) {
      return false;
    }

    // For this slot to be bookable, we need enough consecutive slots
    // to fit the entire appointment duration
    const appointmentEnd = new Date(slotStart);
    appointmentEnd.setMinutes(appointmentEnd.getMinutes() + appointmentDuration);

    // Check if any existing appointments overlap with this potential appointment
    const overlapsAppointment = existingAppointments.some((appt) => {
      const apptStart = new Date(appt.scheduledStart);
      const apptEnd = new Date(appt.scheduledEnd);

      // Check if the potential appointment overlaps with existing appointment
      return slotStart < apptEnd && appointmentEnd > apptStart;
    });

    if (overlapsAppointment) {
      return false;
    }

    // Check if appointment would extend beyond provider's availability
    if (appointmentEnd > new Date(date.setHours(endHour, endMinute, 0, 0))) {
      return false;
    }

    return true;
  });

  return availableSlots;
}

/**
 * Get provider information for available slots
 */
export async function getProviderInfo(tenantId: string, providerId: string) {
  const result = await pool.query(
    `SELECT id,
            full_name as "fullName",
            specialty,
            bio,
            profile_image_url as "profileImageUrl"
     FROM providers
     WHERE id = $1 AND tenant_id = $2`,
    [providerId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Check if patient can cancel an appointment based on cutoff rules
 */
export async function canCancelAppointment(
  tenantId: string,
  appointmentId: string
): Promise<{ canCancel: boolean; reason?: string }> {
  // Get cancellation settings
  const settingsResult = await pool.query(
    `SELECT allow_cancellation as "allowCancellation",
            cancellation_cutoff_hours as "cutoffHours"
     FROM online_booking_settings
     WHERE tenant_id = $1`,
    [tenantId]
  );

  if (settingsResult.rows.length === 0 || !settingsResult.rows[0].allowCancellation) {
    return { canCancel: false, reason: "Online cancellation is not allowed" };
  }

  const settings = settingsResult.rows[0];

  // Get appointment scheduled time
  const apptResult = await pool.query(
    `SELECT scheduled_start as "scheduledStart"
     FROM appointments
     WHERE id = $1 AND tenant_id = $2`,
    [appointmentId, tenantId]
  );

  if (apptResult.rows.length === 0) {
    return { canCancel: false, reason: "Appointment not found" };
  }

  const appointment = apptResult.rows[0];
  const scheduledStart = new Date(appointment.scheduledStart);
  const now = new Date();
  const hoursUntilAppointment = (scheduledStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilAppointment < settings.cutoffHours) {
    return {
      canCancel: false,
      reason: `Appointments must be cancelled at least ${settings.cutoffHours} hours in advance`,
    };
  }

  return { canCancel: true };
}

/**
 * Get available dates in a month (dates that have at least one available slot)
 */
export async function getAvailableDatesInMonth(
  tenantId: string,
  providerId: string,
  appointmentTypeId: string,
  year: number,
  month: number // 0-11
): Promise<string[]> {
  const availableDates: string[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const rules = await getBookingSettings(tenantId);
  if (!rules.isEnabled) {
    return [];
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);

    // Skip if not in booking window
    if (!isDateInBookingWindow(date, rules)) {
      continue;
    }

    // Check if this day has availability template
    const dayOfWeek = date.getDay();
    const hasTemplate = await pool.query(
      `SELECT 1
       FROM provider_availability_templates
       WHERE tenant_id = $1
         AND provider_id = $2
         AND day_of_week = $3
         AND is_active = true
         AND allow_online_booking = true
       LIMIT 1`,
      [tenantId, providerId, dayOfWeek]
    );

    if (hasTemplate.rows.length > 0) {
      // Check if there are any available slots (quick check)
      const slots = await calculateAvailableSlots({
        tenantId,
        providerId,
        appointmentTypeId,
        date,
      });

      if (slots.length > 0) {
        availableDates.push(date.toISOString().split("T")[0]);
      }
    }
  }

  return availableDates;
}
