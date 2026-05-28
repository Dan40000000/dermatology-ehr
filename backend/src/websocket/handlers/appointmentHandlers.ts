import { Server } from "socket.io";
import { logger } from "../../lib/logger";

/**
 * Appointment-related WebSocket event handlers
 */

export interface AppointmentEventData {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  locationId: string;
  locationName?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  appointmentTypeId: string;
  appointmentTypeName?: string;
}

const APPOINTMENT_MODULES = ["home", "schedule", "office_flow", "appt_flow", "waitlist"] as const;

function tenantModuleRoom(tenantId: string, moduleKey: (typeof APPOINTMENT_MODULES)[number]) {
  return `tenant:${tenantId}:module:${moduleKey}`;
}

function emitToAppointmentModules(io: Server, tenantId: string, event: string, payload: unknown) {
  APPOINTMENT_MODULES.forEach((moduleKey) => {
    io.to(tenantModuleRoom(tenantId, moduleKey)).emit(event, payload);
  });
}

function sanitizeAppointment(appointment: AppointmentEventData) {
  const { patientName, ...safeAppointment } = appointment;
  return safeAppointment;
}

/**
 * Broadcast appointment created event to appointment-scoped module rooms
 */
export function broadcastAppointmentCreated(
  io: Server,
  tenantId: string,
  appointment: AppointmentEventData
) {
  logger.info("Broadcasting appointment:created", {
    tenantId,
    appointmentId: appointment.id,
  });

  emitToAppointmentModules(io, tenantId, "appointment:created", {
    appointment: sanitizeAppointment(appointment),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast appointment updated event to appointment-scoped module rooms
 */
export function broadcastAppointmentUpdated(
  io: Server,
  tenantId: string,
  appointment: AppointmentEventData
) {
  logger.info("Broadcasting appointment:updated", {
    tenantId,
    appointmentId: appointment.id,
  });

  emitToAppointmentModules(io, tenantId, "appointment:updated", {
    appointment: sanitizeAppointment(appointment),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast appointment cancelled event to appointment-scoped module rooms
 */
export function broadcastAppointmentCancelled(
  io: Server,
  tenantId: string,
  appointmentId: string,
  reason?: string
) {
  logger.info("Broadcasting appointment:cancelled", {
    tenantId,
    appointmentId,
  });

  emitToAppointmentModules(io, tenantId, "appointment:cancelled", {
    appointmentId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast patient check-in event to appointment-scoped module rooms
 */
export function broadcastPatientCheckIn(
  io: Server,
  tenantId: string,
  appointmentId: string,
  patientId: string,
  _patientName?: string
) {
  logger.info("Broadcasting patient:checkin", {
    tenantId,
    appointmentId,
    patientId,
  });

  emitToAppointmentModules(io, tenantId, "patient:checkin", {
    appointmentId,
    patientId,
    timestamp: new Date().toISOString(),
  });
}
