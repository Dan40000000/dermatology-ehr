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

/**
 * Broadcast appointment created event to tenant room
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

  io.to(`tenant:${tenantId}`).emit("appointment:created", {
    appointment,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast appointment updated event to tenant room
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

  io.to(`tenant:${tenantId}`).emit("appointment:updated", {
    appointment,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast appointment cancelled event to tenant room
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

  io.to(`tenant:${tenantId}`).emit("appointment:cancelled", {
    appointmentId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast patient check-in event to tenant room
 */
export function broadcastPatientCheckIn(
  io: Server,
  tenantId: string,
  appointmentId: string,
  patientId: string,
  patientName?: string
) {
  logger.info("Broadcasting patient:checkin", {
    tenantId,
    appointmentId,
    patientId,
  });

  io.to(`tenant:${tenantId}`).emit("patient:checkin", {
    appointmentId,
    patientId,
    patientName,
    timestamp: new Date().toISOString(),
  });
}
