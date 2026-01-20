/**
 * Real-time WebSocket Hooks
 * Export all real-time update hooks
 */

export { useAppointmentUpdates } from './useAppointmentUpdates';
export type { Appointment } from './useAppointmentUpdates';

export { usePatientUpdates } from './usePatientUpdates';
export type { PatientData } from './usePatientUpdates';

export { useEncounterUpdates } from './useEncounterUpdates';
export type { EncounterData } from './useEncounterUpdates';

export { useBillingUpdates } from './useBillingUpdates';
export type { ClaimData, PaymentData, PriorAuthData } from './useBillingUpdates';

export { useBiopsyUpdates } from './useBiopsyUpdates';
export type { BiopsyData } from './useBiopsyUpdates';
