/**
 * WebSocket Event Emitter Service
 * Centralized service for emitting WebSocket events throughout the application
 * Handles tenant isolation and proper event typing
 */

import { getIO } from './index';
import { logger } from '../lib/logger';
import {
  AppointmentEventData,
  PatientEventData,
  EncounterEventData,
  BiopsyEventData,
  PrescriptionEventData,
  ClaimEventData,
  PaymentEventData,
  PriorAuthEventData,
  NotificationEventData,
} from './types';

/**
 * Base emitter function with tenant isolation
 */
function emitToTenant(tenantId: string, event: string, data: any) {
  try {
    const io = getIO();
    const room = `tenant:${tenantId}`;
    io.to(room).emit(event, data);

    logger.debug('WebSocket event emitted', {
      event,
      tenantId,
      room,
      dataKeys: Object.keys(data),
    });
  } catch (error) {
    logger.error('Failed to emit WebSocket event', {
      event,
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Emit to specific user
 */
function emitToUser(userId: string, event: string, data: any) {
  try {
    const io = getIO();
    const room = `user:${userId}`;
    io.to(room).emit(event, data);

    logger.debug('WebSocket event emitted to user', {
      event,
      userId,
      room,
    });
  } catch (error) {
    logger.error('Failed to emit WebSocket event to user', {
      event,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================
// APPOINTMENT EVENTS
// ============================================

export function emitAppointmentCreated(tenantId: string, appointment: AppointmentEventData) {
  emitToTenant(tenantId, 'appointment:created', {
    appointment,
    timestamp: new Date().toISOString(),
  });
}

export function emitAppointmentUpdated(tenantId: string, appointment: AppointmentEventData) {
  emitToTenant(tenantId, 'appointment:updated', {
    appointment,
    timestamp: new Date().toISOString(),
  });
}

export function emitAppointmentCancelled(tenantId: string, appointmentId: string, reason?: string) {
  emitToTenant(tenantId, 'appointment:cancelled', {
    appointmentId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export function emitAppointmentCheckedIn(
  tenantId: string,
  appointmentId: string,
  patientId: string,
  patientName?: string
) {
  emitToTenant(tenantId, 'appointment:checkedin', {
    appointmentId,
    patientId,
    patientName,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// PATIENT EVENTS
// ============================================

export function emitPatientUpdated(tenantId: string, patient: PatientEventData) {
  emitToTenant(tenantId, 'patient:updated', {
    patient,
    timestamp: new Date().toISOString(),
  });
}

export function emitPatientInsuranceVerified(
  tenantId: string,
  patientId: string,
  insuranceInfo: any
) {
  emitToTenant(tenantId, 'patient:insurance_verified', {
    patientId,
    insuranceInfo,
    timestamp: new Date().toISOString(),
  });
}

export function emitPatientBalanceChanged(
  tenantId: string,
  patientId: string,
  oldBalance: number,
  newBalance: number
) {
  emitToTenant(tenantId, 'patient:balance_changed', {
    patientId,
    oldBalance,
    newBalance,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// ENCOUNTER EVENTS
// ============================================

export function emitEncounterCreated(tenantId: string, encounter: EncounterEventData) {
  emitToTenant(tenantId, 'encounter:created', {
    encounter,
    timestamp: new Date().toISOString(),
  });
}

export function emitEncounterUpdated(tenantId: string, encounter: EncounterEventData) {
  emitToTenant(tenantId, 'encounter:updated', {
    encounter,
    timestamp: new Date().toISOString(),
  });
}

export function emitEncounterCompleted(
  tenantId: string,
  encounterId: string,
  providerId: string
) {
  emitToTenant(tenantId, 'encounter:completed', {
    encounterId,
    providerId,
    timestamp: new Date().toISOString(),
  });
}

export function emitEncounterSigned(
  tenantId: string,
  encounterId: string,
  providerId: string
) {
  emitToTenant(tenantId, 'encounter:signed', {
    encounterId,
    providerId,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// BIOPSY EVENTS
// ============================================

export function emitBiopsyCreated(tenantId: string, biopsy: BiopsyEventData) {
  emitToTenant(tenantId, 'biopsy:created', {
    biopsy,
    timestamp: new Date().toISOString(),
  });
}

export function emitBiopsyUpdated(tenantId: string, biopsy: BiopsyEventData) {
  emitToTenant(tenantId, 'biopsy:updated', {
    biopsy,
    timestamp: new Date().toISOString(),
  });
}

export function emitBiopsyResultReceived(
  tenantId: string,
  biopsyId: string,
  patientId: string,
  diagnosis: string
) {
  emitToTenant(tenantId, 'biopsy:result_received', {
    biopsyId,
    patientId,
    diagnosis,
    timestamp: new Date().toISOString(),
  });
}

export function emitBiopsyReviewed(
  tenantId: string,
  biopsyId: string,
  patientId: string,
  reviewedBy: string
) {
  emitToTenant(tenantId, 'biopsy:reviewed', {
    biopsyId,
    patientId,
    reviewedBy,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// PRESCRIPTION EVENTS
// ============================================

export function emitPrescriptionCreated(tenantId: string, prescription: PrescriptionEventData) {
  emitToTenant(tenantId, 'prescription:created', {
    prescription,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionSent(
  tenantId: string,
  prescriptionId: string,
  patientId: string,
  medication: string
) {
  emitToTenant(tenantId, 'prescription:sent', {
    prescriptionId,
    patientId,
    medication,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionStatusChanged(
  tenantId: string,
  prescriptionId: string,
  status: string
) {
  emitToTenant(tenantId, 'prescription:status_changed', {
    prescriptionId,
    status,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// CLAIM EVENTS
// ============================================

export function emitClaimCreated(tenantId: string, claim: ClaimEventData) {
  emitToTenant(tenantId, 'claim:created', {
    claim,
    timestamp: new Date().toISOString(),
  });
}

export function emitClaimUpdated(tenantId: string, claim: ClaimEventData) {
  emitToTenant(tenantId, 'claim:updated', {
    claim,
    timestamp: new Date().toISOString(),
  });
}

export function emitClaimStatusChanged(
  tenantId: string,
  claimId: string,
  oldStatus: string,
  newStatus: string
) {
  emitToTenant(tenantId, 'claim:status_changed', {
    claimId,
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
  });
}

export function emitClaimSubmitted(
  tenantId: string,
  claimId: string,
  payer: string
) {
  emitToTenant(tenantId, 'claim:submitted', {
    claimId,
    payer,
    timestamp: new Date().toISOString(),
  });
}

export function emitClaimDenied(
  tenantId: string,
  claimId: string,
  reason: string
) {
  emitToTenant(tenantId, 'claim:denied', {
    claimId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export function emitClaimPaid(
  tenantId: string,
  claimId: string,
  amount: number
) {
  emitToTenant(tenantId, 'claim:paid', {
    claimId,
    amount,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// PAYMENT EVENTS
// ============================================

export function emitPaymentReceived(tenantId: string, payment: PaymentEventData) {
  emitToTenant(tenantId, 'payment:received', {
    payment,
    timestamp: new Date().toISOString(),
  });
}

export function emitPaymentPosted(
  tenantId: string,
  paymentId: string,
  patientId: string,
  amount: number
) {
  emitToTenant(tenantId, 'payment:posted', {
    paymentId,
    patientId,
    amount,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// PRIOR AUTHORIZATION EVENTS
// ============================================

export function emitPriorAuthCreated(tenantId: string, priorAuth: PriorAuthEventData) {
  emitToTenant(tenantId, 'prior_auth:created', {
    priorAuth,
    timestamp: new Date().toISOString(),
  });
}

export function emitPriorAuthStatusChanged(
  tenantId: string,
  priorAuthId: string,
  oldStatus: string,
  newStatus: string
) {
  emitToTenant(tenantId, 'prior_auth:status_changed', {
    priorAuthId,
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
  });
}

export function emitPriorAuthApproved(
  tenantId: string,
  priorAuthId: string,
  authNumber: string
) {
  emitToTenant(tenantId, 'prior_auth:approved', {
    priorAuthId,
    authNumber,
    timestamp: new Date().toISOString(),
  });
}

export function emitPriorAuthDenied(
  tenantId: string,
  priorAuthId: string,
  reason: string
) {
  emitToTenant(tenantId, 'prior_auth:denied', {
    priorAuthId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// NOTIFICATION EVENTS
// ============================================

export function emitNotification(
  tenantId: string,
  notification: NotificationEventData,
  targetUserId?: string
) {
  const payload = {
    notification,
    timestamp: new Date().toISOString(),
  };

  if (targetUserId) {
    // Send to specific user
    emitToUser(targetUserId, 'notification:new', payload);
  } else {
    // Send to entire tenant
    emitToTenant(tenantId, 'notification:new', payload);
  }
}
