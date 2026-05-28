/**
 * WebSocket Event Emitter Service
 * Centralized service for emitting WebSocket events throughout the application
 * Handles tenant isolation and proper event typing
 */

import { getIO } from './index';
import { logger } from '../lib/logger';
import type { ModuleKey } from '../config/moduleAccess';
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
 * Base emitter function with tenant isolation and module scoping.
 */
function emitToModules(tenantId: string, event: string, data: any, modules: ModuleKey[]) {
  try {
    const io = getIO();
    const rooms = [...new Set(modules)].map((moduleKey) => `tenant:${tenantId}:module:${moduleKey}`);
    rooms.forEach((room) => io.to(room).emit(event, data));

    logger.debug('WebSocket event emitted', {
      event,
      tenantId,
      rooms,
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

const appointmentModules: ModuleKey[] = ['home', 'schedule', 'office_flow', 'appt_flow', 'waitlist'];
const patientModules: ModuleKey[] = ['home', 'patients'];
const clinicalModules: ModuleKey[] = ['home', 'notes', 'clinical_inbox'];
const orderModules: ModuleKey[] = ['home', 'orders', 'labs', 'radiology', 'clinical_inbox'];
const rxModules: ModuleKey[] = ['home', 'rx', 'epa', 'clinical_inbox'];
const billingModules: ModuleKey[] = ['home', 'financials', 'claims', 'clearinghouse'];
const notificationModules: ModuleKey[] = ['home'];

function sanitizeAppointment(appointment: AppointmentEventData) {
  const { patientName, ...safeAppointment } = appointment;
  return safeAppointment;
}

function sanitizePatient(patient: PatientEventData) {
  return {
    id: patient.id,
    lastUpdated: patient.lastUpdated,
  };
}

function sanitizeEncounter(encounter: EncounterEventData) {
  const { patientName, chiefComplaint, ...safeEncounter } = encounter;
  return safeEncounter;
}

function sanitizeBiopsy(biopsy: BiopsyEventData) {
  const { patientName, diagnosis, pathLabCaseNumber, ...safeBiopsy } = biopsy;
  return safeBiopsy;
}

function sanitizePrescription(prescription: PrescriptionEventData) {
  const { patientName, medication, ...safePrescription } = prescription;
  return safePrescription;
}

function sanitizeClaim(claim: ClaimEventData) {
  const { patientName, payer, payerName, denialReason, ...safeClaim } = claim;
  return safeClaim;
}

function sanitizePayment(payment: PaymentEventData) {
  const { patientName, paymentMethod, payer, ...safePayment } = payment;
  return safePayment;
}

function sanitizePriorAuth(priorAuth: PriorAuthEventData) {
  const { patientName, insurancePlan, authNumber, ...safePriorAuth } = priorAuth;
  return safePriorAuth;
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
  emitToModules(tenantId, 'appointment:created', {
    appointment: sanitizeAppointment(appointment),
    timestamp: new Date().toISOString(),
  }, appointmentModules);
}

export function emitAppointmentUpdated(tenantId: string, appointment: AppointmentEventData) {
  emitToModules(tenantId, 'appointment:updated', {
    appointment: sanitizeAppointment(appointment),
    timestamp: new Date().toISOString(),
  }, appointmentModules);
}

export function emitAppointmentCancelled(tenantId: string, appointmentId: string, reason?: string) {
  emitToModules(tenantId, 'appointment:cancelled', {
    appointmentId,
    reason,
    timestamp: new Date().toISOString(),
  }, appointmentModules);
}

export function emitAppointmentCheckedIn(
  tenantId: string,
  appointmentId: string,
  patientId: string,
  _patientName?: string
) {
  emitToModules(tenantId, 'appointment:checkedin', {
    appointmentId,
    patientId,
    timestamp: new Date().toISOString(),
  }, appointmentModules);
}

// ============================================
// PATIENT EVENTS
// ============================================

export function emitPatientUpdated(tenantId: string, patient: PatientEventData) {
  emitToModules(tenantId, 'patient:updated', {
    patient: sanitizePatient(patient),
    timestamp: new Date().toISOString(),
  }, patientModules);
}

export function emitPatientInsuranceVerified(
  tenantId: string,
  patientId: string,
  _insuranceInfo: any
) {
  emitToModules(tenantId, 'patient:insurance_verified', {
    patientId,
    insuranceInfo: { verified: true },
    timestamp: new Date().toISOString(),
  }, patientModules);
}

export function emitPatientBalanceChanged(
  tenantId: string,
  patientId: string,
  _oldBalance: number,
  _newBalance: number
) {
  emitToModules(tenantId, 'patient:balance_changed', {
    patientId,
    balanceChanged: true,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

// ============================================
// ENCOUNTER EVENTS
// ============================================

export function emitEncounterCreated(tenantId: string, encounter: EncounterEventData) {
  emitToModules(tenantId, 'encounter:created', {
    encounter: sanitizeEncounter(encounter),
    timestamp: new Date().toISOString(),
  }, clinicalModules);
}

export function emitEncounterUpdated(tenantId: string, encounter: EncounterEventData) {
  emitToModules(tenantId, 'encounter:updated', {
    encounter: sanitizeEncounter(encounter),
    timestamp: new Date().toISOString(),
  }, clinicalModules);
}

export function emitEncounterCompleted(
  tenantId: string,
  encounterId: string,
  providerId: string
) {
  emitToModules(tenantId, 'encounter:completed', {
    encounterId,
    providerId,
    timestamp: new Date().toISOString(),
  }, clinicalModules);
}

export function emitEncounterSigned(
  tenantId: string,
  encounterId: string,
  providerId: string
) {
  emitToModules(tenantId, 'encounter:signed', {
    encounterId,
    providerId,
    timestamp: new Date().toISOString(),
  }, clinicalModules);
}

// ============================================
// BIOPSY EVENTS
// ============================================

export function emitBiopsyCreated(tenantId: string, biopsy: BiopsyEventData) {
  emitToModules(tenantId, 'biopsy:created', {
    biopsy: sanitizeBiopsy(biopsy),
    timestamp: new Date().toISOString(),
  }, orderModules);
}

export function emitBiopsyUpdated(tenantId: string, biopsy: BiopsyEventData) {
  emitToModules(tenantId, 'biopsy:updated', {
    biopsy: sanitizeBiopsy(biopsy),
    timestamp: new Date().toISOString(),
  }, orderModules);
}

export function emitBiopsyResultReceived(
  tenantId: string,
  biopsyId: string,
  patientId: string,
  _diagnosis: string
) {
  emitToModules(tenantId, 'biopsy:result_received', {
    biopsyId,
    patientId,
    resultReceived: true,
    timestamp: new Date().toISOString(),
  }, orderModules);
}

export function emitBiopsyReviewed(
  tenantId: string,
  biopsyId: string,
  patientId: string,
  reviewedBy: string
) {
  emitToModules(tenantId, 'biopsy:reviewed', {
    biopsyId,
    patientId,
    reviewedBy,
    timestamp: new Date().toISOString(),
  }, orderModules);
}

// ============================================
// PRESCRIPTION EVENTS
// ============================================

export function emitPrescriptionCreated(tenantId: string, prescription: PrescriptionEventData) {
  emitToModules(tenantId, 'prescription:created', {
    prescription: sanitizePrescription(prescription),
    timestamp: new Date().toISOString(),
  }, rxModules);
}

export function emitPrescriptionSent(
  tenantId: string,
  prescriptionId: string,
  patientId: string,
  _medication: string
) {
  emitToModules(tenantId, 'prescription:sent', {
    prescriptionId,
    patientId,
    timestamp: new Date().toISOString(),
  }, rxModules);
}

export function emitPrescriptionStatusChanged(
  tenantId: string,
  prescriptionId: string,
  status: string
) {
  emitToModules(tenantId, 'prescription:status_changed', {
    prescriptionId,
    status,
    timestamp: new Date().toISOString(),
  }, rxModules);
}

// ============================================
// CLAIM EVENTS
// ============================================

export function emitClaimCreated(tenantId: string, claim: ClaimEventData) {
  emitToModules(tenantId, 'claim:created', {
    claim: sanitizeClaim(claim),
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitClaimUpdated(tenantId: string, claim: ClaimEventData) {
  emitToModules(tenantId, 'claim:updated', {
    claim: sanitizeClaim(claim),
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitClaimStatusChanged(
  tenantId: string,
  claimId: string,
  oldStatus: string,
  newStatus: string
) {
  emitToModules(tenantId, 'claim:status_changed', {
    claimId,
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitClaimSubmitted(
  tenantId: string,
  claimId: string,
  payer: string
) {
  emitToModules(tenantId, 'claim:submitted', {
    claimId,
    payer,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitClaimDenied(
  tenantId: string,
  claimId: string,
  _reason: string
) {
  emitToModules(tenantId, 'claim:denied', {
    claimId,
    denied: true,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitClaimPaid(
  tenantId: string,
  claimId: string,
  amount: number
) {
  emitToModules(tenantId, 'claim:paid', {
    claimId,
    amount,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

// ============================================
// PAYMENT EVENTS
// ============================================

export function emitPaymentReceived(tenantId: string, payment: PaymentEventData) {
  emitToModules(tenantId, 'payment:received', {
    payment: sanitizePayment(payment),
    timestamp: new Date().toISOString(),
  }, billingModules);
}

export function emitPaymentPosted(
  tenantId: string,
  paymentId: string,
  patientId: string,
  amount: number
) {
  emitToModules(tenantId, 'payment:posted', {
    paymentId,
    patientId,
    amount,
    timestamp: new Date().toISOString(),
  }, billingModules);
}

// ============================================
// PRIOR AUTHORIZATION EVENTS
// ============================================

export function emitPriorAuthCreated(tenantId: string, priorAuth: PriorAuthEventData) {
  emitToModules(tenantId, 'prior_auth:created', {
    priorAuth: sanitizePriorAuth(priorAuth),
    timestamp: new Date().toISOString(),
  }, rxModules);
}

export function emitPriorAuthStatusChanged(
  tenantId: string,
  priorAuthId: string,
  oldStatus: string,
  newStatus: string
) {
  emitToModules(tenantId, 'prior_auth:status_changed', {
    priorAuthId,
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
  }, rxModules);
}

export function emitPriorAuthApproved(
  tenantId: string,
  priorAuthId: string,
  _authNumber: string
) {
  emitToModules(tenantId, 'prior_auth:approved', {
    priorAuthId,
    approved: true,
    timestamp: new Date().toISOString(),
  }, rxModules);
}

export function emitPriorAuthDenied(
  tenantId: string,
  priorAuthId: string,
  _reason: string
) {
  emitToModules(tenantId, 'prior_auth:denied', {
    priorAuthId,
    denied: true,
    timestamp: new Date().toISOString(),
  }, rxModules);
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
    emitToModules(tenantId, 'notification:new', payload, notificationModules);
  }
}
