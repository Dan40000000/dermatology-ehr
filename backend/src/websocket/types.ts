/**
 * TypeScript type definitions for WebSocket events
 * Import these types when emitting/handling events for type safety
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
  status: 'scheduled' | 'checked_in' | 'in_room' | 'with_provider' | 'completed' | 'cancelled' | 'no_show';
  appointmentTypeId: string;
  appointmentTypeName?: string;
}

export interface MessageEventData {
  id: string;
  threadId: string;
  body: string;
  sender: string;
  senderFirstName?: string;
  senderLastName?: string;
  createdAt: string;
}

export interface MessageReadEventData {
  messageId: string;
  threadId: string;
  readBy: string;
  readAt: string;
}

export interface TypingEventData {
  threadId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface UnreadCountEventData {
  unreadCount: number;
  timestamp: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'prior_auth_status'
  | 'lab_result_ready'
  | 'urgent_alert'
  | 'appointment_reminder'
  | 'message_received'
  | 'prescription_ready'
  | 'general';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationEventData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  relatedEntityType?: 'appointment' | 'task' | 'order' | 'message' | 'prescription' | 'patient';
  relatedEntityId?: string;
  actionUrl?: string;
  createdAt: string;
}

export interface UserPresenceData {
  userId: string;
  userName: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: string;
}

export interface PatientViewingData {
  userId: string;
  userName: string;
  patientId: string;
  isViewing: boolean;
  startedAt?: string;
}

// Patient events
export interface PatientEventData {
  id: string;
  firstName: string;
  lastName: string;
  dob?: string;
  phone?: string;
  email?: string;
  insurance?: string;
  balance?: number;
  lastUpdated?: string;
}

// Encounter events
export interface EncounterEventData {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  appointmentId?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'signed';
  chiefComplaint?: string;
  createdAt: string;
  updatedAt: string;
}

// Biopsy events
export interface BiopsyEventData {
  id: string;
  patientId: string;
  patientName?: string;
  orderingProviderId: string;
  orderingProviderName?: string;
  status: 'ordered' | 'collected' | 'sent' | 'received_by_lab' | 'processing' | 'resulted' | 'reviewed' | 'closed';
  bodyLocation: string;
  specimenType: string;
  pathLab: string;
  pathLabCaseNumber?: string;
  diagnosis?: string;
  createdAt: string;
  resultedAt?: string;
}

// Prescription events
export interface PrescriptionEventData {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  medication: string;
  status: 'pending' | 'sent' | 'filled' | 'cancelled';
  sentAt?: string;
  createdAt: string;
}

// Billing/Claims events
export interface ClaimEventData {
  id: string;
  claimNumber: string;
  patientId: string;
  patientName?: string;
  encounterId?: string;
  status: 'draft' | 'scrubbed' | 'ready' | 'submitted' | 'accepted' | 'denied' | 'paid' | 'appealed';
  totalCharges: number;
  payer?: string;
  payerName?: string;
  serviceDate?: string;
  submittedAt?: string;
  scrubStatus?: string;
  denialReason?: string;
  appealStatus?: string;
}

// Payment events
export interface PaymentEventData {
  id: string;
  patientId: string;
  patientName?: string;
  claimId?: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  payer?: string;
  createdAt: string;
}

// Prior authorization events
export interface PriorAuthEventData {
  id: string;
  patientId: string;
  patientName?: string;
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'expired';
  serviceType: string;
  insurancePlan?: string;
  authNumber?: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * WebSocket event map for type-safe event emission
 * Use with Socket.IO's typed emit
 */
export interface ServerToClientEvents {
  // Appointment events
  'appointment:created': (data: { appointment: AppointmentEventData; timestamp: string }) => void;
  'appointment:updated': (data: { appointment: AppointmentEventData; timestamp: string }) => void;
  'appointment:cancelled': (data: { appointmentId: string; reason?: string; timestamp: string }) => void;
  'appointment:checkedin': (data: { appointmentId: string; patientId: string; patientName?: string; timestamp: string }) => void;
  'patient:checkin': (data: { appointmentId: string; patientId: string; patientName?: string; timestamp: string }) => void; // Deprecated - use appointment:checkedin

  // Patient events
  'patient:updated': (data: { patient: PatientEventData; timestamp: string }) => void;
  'patient:insurance_verified': (data: { patientId: string; insuranceInfo: any; timestamp: string }) => void;
  'patient:balance_changed': (data: { patientId: string; oldBalance: number; newBalance: number; timestamp: string }) => void;

  // Encounter events
  'encounter:created': (data: { encounter: EncounterEventData; timestamp: string }) => void;
  'encounter:updated': (data: { encounter: EncounterEventData; timestamp: string }) => void;
  'encounter:completed': (data: { encounterId: string; providerId: string; timestamp: string }) => void;
  'encounter:signed': (data: { encounterId: string; providerId: string; timestamp: string }) => void;

  // Biopsy events
  'biopsy:created': (data: { biopsy: BiopsyEventData; timestamp: string }) => void;
  'biopsy:updated': (data: { biopsy: BiopsyEventData; timestamp: string }) => void;
  'biopsy:result_received': (data: { biopsyId: string; patientId: string; diagnosis: string; timestamp: string }) => void;
  'biopsy:reviewed': (data: { biopsyId: string; patientId: string; reviewedBy: string; timestamp: string }) => void;

  // Prescription events
  'prescription:created': (data: { prescription: PrescriptionEventData; timestamp: string }) => void;
  'prescription:sent': (data: { prescriptionId: string; patientId: string; medication: string; timestamp: string }) => void;
  'prescription:status_changed': (data: { prescriptionId: string; status: string; timestamp: string }) => void;

  // Billing/Claims events
  'claim:created': (data: { claim: ClaimEventData; timestamp: string }) => void;
  'claim:updated': (data: { claim: ClaimEventData; timestamp: string }) => void;
  'claim:status_changed': (data: { claimId: string; oldStatus: string; newStatus: string; timestamp: string }) => void;
  'claim:submitted': (data: { claimId: string; payer: string; timestamp: string }) => void;
  'claim:denied': (data: { claimId: string; reason: string; timestamp: string }) => void;
  'claim:paid': (data: { claimId: string; amount: number; timestamp: string }) => void;

  // Payment events
  'payment:received': (data: { payment: PaymentEventData; timestamp: string }) => void;
  'payment:posted': (data: { paymentId: string; patientId: string; amount: number; timestamp: string }) => void;

  // Prior Authorization events
  'prior_auth:created': (data: { priorAuth: PriorAuthEventData; timestamp: string }) => void;
  'prior_auth:status_changed': (data: { priorAuthId: string; oldStatus: string; newStatus: string; timestamp: string }) => void;
  'prior_auth:approved': (data: { priorAuthId: string; authNumber: string; timestamp: string }) => void;
  'prior_auth:denied': (data: { priorAuthId: string; reason: string; timestamp: string }) => void;

  // Message events
  'message:new': (data: { message: MessageEventData; timestamp: string }) => void;
  'message:read': (data: MessageReadEventData & { timestamp: string }) => void;
  'message:typing': (data: TypingEventData) => void;
  'message:notification': (data: { threadId: string; messageId: string; sender: string; preview: string; timestamp: string }) => void;
  'message:unread-count': (data: UnreadCountEventData) => void;

  // Notification events
  'notification:new': (data: { notification: NotificationEventData; timestamp: string }) => void;

  // Presence events
  'user:online': (data: UserPresenceData) => void;
  'user:offline': (data: UserPresenceData) => void;
  'user:status': (data: UserPresenceData) => void;
  'patient:viewing': (data: PatientViewingData & { timestamp: string }) => void;
}

export interface ClientToServerEvents {
  // Message events
  'message:typing': (data: { threadId: string; isTyping: boolean }) => void;
  'message:join-thread': (threadId: string) => void;
  'message:leave-thread': (threadId: string) => void;

  // Presence events
  'user:status': (status: 'online' | 'away') => void;
  'patient:viewing': (data: { patientId: string; isViewing: boolean }) => void;
}

/**
 * Example usage with typed Socket.IO server:
 *
 * import { Server } from 'socket.io';
 * import { ServerToClientEvents, ClientToServerEvents } from './types';
 *
 * const io: Server<ClientToServerEvents, ServerToClientEvents> = new Server(httpServer, options);
 *
 * io.to(roomId).emit('appointment:created', {
 *   appointment: data,
 *   timestamp: new Date().toISOString()
 * });
 */
