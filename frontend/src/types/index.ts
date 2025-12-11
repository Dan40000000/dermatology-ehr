// Authentication Types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'provider' | 'ma' | 'front_desk';
}

export interface Session {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Patient Types
export interface PatientInsurance {
  planName: string;
  memberId: string;
  groupNumber?: string;
  copay?: number;
}

export interface Patient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dob?: string;
  dateOfBirth?: string; // Alias for dob
  sex?: 'M' | 'F' | 'O';
  mrn?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  insurance?: PatientInsurance;
  allergies?: string[];
  alerts?: string[];
  medications?: string;
  lastVisit?: string;
  createdAt: string;
}

export interface CreatePatientData {
  firstName: string;
  lastName: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  insurance?: string;
  allergies?: string;
  medications?: string;
}

// Provider Types
export interface Provider {
  id: string;
  tenantId: string;
  fullName: string;
  name: string; // alias for fullName
  specialty?: string;
  createdAt: string;
}

// Location Types
export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  createdAt: string;
}

// Appointment Types
export interface AppointmentType {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  createdAt: string;
}

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  locationId: string;
  locationName?: string;
  appointmentTypeId: string;
  appointmentTypeName?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'scheduled' | 'checked_in' | 'in_room' | 'with_provider' | 'completed' | 'cancelled' | 'no_show';
  createdAt: string;
}

export interface CreateAppointmentData {
  patientId: string;
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface Availability {
  id: string;
  tenantId: string;
  providerId: string;
  dayOfWeek: number; // 0-6
  startTime: string;
  endTime: string;
  createdAt: string;
}

// Encounter Types
export interface Encounter {
  id: string;
  tenantId: string;
  appointmentId?: string;
  patientId: string;
  providerId: string;
  status: 'draft' | 'finalized' | 'signed' | 'locked';
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEncounterData {
  appointmentId?: string;
  patientId: string;
  providerId: string;
  chiefComplaint?: string;
}

export interface UpdateEncounterData {
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
}

// Vitals Types
export interface Vitals {
  id: string;
  tenantId: string;
  encounterId: string;
  heightCm?: number;
  weightKg?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  tempC?: number;
  createdAt: string;
}

export interface CreateVitalsData {
  encounterId: string;
  heightCm?: number;
  weightKg?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  tempC?: number;
}

// Order Types
export interface Order {
  id: string;
  tenantId: string;
  encounterId?: string;
  patientId: string;
  providerId: string;
  type: string;
  status: 'pending' | 'draft' | 'ordered' | 'in-progress' | 'completed' | 'cancelled';
  priority?: 'stat' | 'urgent' | 'routine';
  details?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateOrderData {
  encounterId?: string;
  patientId: string;
  providerId: string;
  type: string;
  details?: string;
}

// Task Types
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskCategory =
  | 'patient-followup'
  | 'prior-auth'
  | 'lab-path-followup'
  | 'prescription-refill'
  | 'insurance-verification'
  | 'general';

export interface Task {
  id: string;
  tenantId: string;
  patientId?: string;
  patientFirstName?: string;
  patientLastName?: string;
  encounterId?: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  dueAt?: string; // Deprecated, use dueDate
  assignedTo?: string;
  assignedToName?: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
}

export interface CreateTaskData {
  patientId?: string;
  encounterId?: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  assignedTo?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  assignedTo?: string;
}

export interface TaskComment {
  id: string;
  comment: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  category?: TaskCategory;
  assignedTo?: string;
  priority?: TaskPriority;
  search?: string;
}

// Message Types
export interface Message {
  id: string;
  tenantId: string;
  patientId?: string;
  subject?: string;
  body: string;
  sender?: string;
  isRead?: boolean;
  createdAt: string;
}

export interface CreateMessageData {
  patientId?: string;
  subject?: string;
  body: string;
}

// Messaging Thread Types
export interface MessageThreadParticipant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface MessageThreadMessage {
  id: string;
  body: string;
  sender: string;
  createdAt: string;
  senderFirstName?: string;
  senderLastName?: string;
}

export interface MessageThreadPreview {
  id: string;
  subject: string;
  patientId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  lastReadAt?: string;
  unreadCount: number;
  participants: MessageThreadParticipant[];
  lastMessage?: {
    id: string;
    body: string;
    sender: string;
    createdAt: string;
  };
  patientFirstName?: string;
  patientLastName?: string;
}

export interface MessageThread {
  id: string;
  subject: string;
  patientId?: string;
  createdBy: string;
  createdAt: string;
  isArchived: boolean;
  participants: MessageThreadParticipant[];
  patientFirstName?: string;
  patientLastName?: string;
}

export interface CreateThreadData {
  subject: string;
  patientId?: string;
  participantIds: string[];
  message: string;
}

export interface SendMessageData {
  body: string;
}

// Charge Types
export interface Charge {
  id: string;
  tenantId: string;
  encounterId?: string;
  cptCode: string;
  description?: string;
  icdCodes?: string[];
  linkedDiagnosisIds?: string[];
  quantity?: number;
  feeCents?: number;
  amountCents: number;
  status: 'pending' | 'submitted' | 'paid' | 'denied';
  createdAt: string;
}

export interface CreateChargeData {
  encounterId?: string;
  cptCode: string;
  description?: string;
  icdCodes?: string[];
  linkedDiagnosisIds?: string[];
  quantity?: number;
  feeCents?: number;
  amountCents: number;
}

export interface UpdateChargeData {
  description?: string;
  icdCodes?: string[];
  linkedDiagnosisIds?: string[];
  quantity?: number;
  feeCents?: number;
  status?: 'pending' | 'submitted' | 'paid' | 'denied';
}

// Diagnosis Types
export interface EncounterDiagnosis {
  id: string;
  encounterId: string;
  icd10Code: string;
  description: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface CreateDiagnosisData {
  encounterId: string;
  icd10Code: string;
  description: string;
  isPrimary?: boolean;
}

// Coding Reference Types
export interface ICD10Code {
  code: string;
  description: string;
  category?: string;
  isCommon?: boolean;
}

export interface CPTCode {
  code: string;
  description: string;
  category?: string;
  defaultFeeCents?: number;
  isCommon?: boolean;
}

// Document Types
export interface Document {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string;
  title: string;
  type?: string;
  category?: string;
  description?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
  storage?: 'local' | 's3';
  objectKey?: string;
  createdAt: string;
}

export interface CreateDocumentData {
  patientId: string;
  encounterId?: string;
  title: string;
  url: string;
  storage?: 'local' | 's3';
  objectKey?: string;
}

// Photo Types
export type PhotoType = 'clinical' | 'before' | 'after' | 'dermoscopy' | 'baseline';

export interface PhotoAnnotationShape {
  type: 'arrow' | 'circle' | 'rectangle' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  text?: string;
  thickness?: number;
}

export interface PhotoAnnotations {
  shapes: PhotoAnnotationShape[];
}

export interface Photo {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string;
  bodyLocation?: string;
  bodyRegion?: string;
  lesionId?: string;
  photoType?: PhotoType;
  category?: string;
  description?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
  storage?: 'local' | 's3';
  objectKey?: string;
  annotations?: PhotoAnnotations;
  comparisonGroupId?: string;
  sequenceNumber?: number;
  createdAt: string;
}

export interface CreatePhotoData {
  patientId: string;
  encounterId?: string;
  bodyLocation?: string;
  lesionId?: string;
  photoType?: PhotoType;
  url: string;
  storage?: 'local' | 's3';
  objectKey?: string;
  category?: string;
  bodyRegion?: string;
  description?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  comparisonGroupId?: string;
  sequenceNumber?: number;
}

export interface PhotoComparisonGroup {
  id: string;
  tenantId: string;
  patientId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  photos?: Photo[];
}

export interface CreateComparisonGroupData {
  patientId: string;
  name: string;
  description?: string;
}

export interface UpdatePhotoAnnotationsData {
  annotations: PhotoAnnotations;
}

// Analytics Types
export interface AnalyticsSummary {
  patients: number;
  appointments: number;
  encounters: number;
  charges: number;
  providers: number;
  revenueCents: number;
}

export interface AnalyticsPoint {
  day?: string;
  provider?: string;
  status?: string;
  count?: number;
  amount?: number;
}

export interface AnalyticsFilter {
  startDate: string;
  endDate: string;
  providerId: string;
}

// Audit Types
export interface AuditEntry {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
}

// Interop Types
export interface InteropCapability {
  fhirVersion?: string;
  resources?: string[];
}

// Note Template Types
export interface NoteTemplate {
  id: string;
  name: string;
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
}

// Conflict Detection Types
export interface ConflictInfo {
  provider: string;
  time: string;
  count: number;
  patients: string[];
}

// Body Map Types (Derm-Specific)
export interface BodyRegion {
  id: string;
  name: string;
  parentRegion?: string;
}

export interface LesionLocation {
  id: string;
  patientId: string;
  encounterId?: string;
  regionId: string;
  x: number; // percentage position
  y: number; // percentage position
  description?: string;
  photoIds?: string[];
  createdAt: string;
}

// Fee Schedule Types
export interface CPTCode {
  code: string;
  description: string;
  category?: string;
}

export interface FeeScheduleItem {
  id: string;
  feeScheduleId: string;
  cptCode: string;
  cptDescription?: string;
  feeCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeeSchedule {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  items?: FeeScheduleItem[];
}

export interface CreateFeeScheduleData {
  name: string;
  isDefault?: boolean;
  description?: string;
  cloneFromId?: string;
}

export interface UpdateFeeScheduleData {
  name?: string;
  isDefault?: boolean;
  description?: string;
}

export interface CreateFeeScheduleItemData {
  cptCode: string;
  feeCents: number;
}

export interface UpdateFeeScheduleItemData {
  feeCents: number;
}

export interface ImportFeeData {
  cptCode: string;
  fee: number;
}

// Claims Management Types
export type ClaimStatus = 'draft' | 'ready' | 'submitted' | 'accepted' | 'rejected' | 'paid';

export interface Claim {
  id: string;
  tenantId: string;
  encounterId?: string;
  patientId: string;
  claimNumber: string;
  totalCents: number;
  status: ClaimStatus;
  payer?: string;
  payerId?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  patientFirstName?: string;
  patientLastName?: string;
  providerName?: string;
}

export interface ClaimDetail extends Claim {
  dob?: string;
  insurancePlanName?: string;
}

export interface ClaimPayment {
  id: string;
  tenantId: string;
  claimId: string;
  amountCents: number;
  paymentDate: string;
  paymentMethod?: string;
  payer?: string;
  checkNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface ClaimStatusHistory {
  id: string;
  tenantId: string;
  claimId: string;
  status: ClaimStatus;
  notes?: string;
  changedBy?: string;
  changedAt: string;
}

export interface CreateClaimData {
  encounterId?: string;
  patientId: string;
  payer?: string;
  payerId?: string;
}

export interface UpdateClaimStatusData {
  status: ClaimStatus;
  notes?: string;
}

export interface CreateClaimPaymentData {
  amountCents: number;
  paymentDate: string;
  paymentMethod?: string;
  payer?: string;
  checkNumber?: string;
  notes?: string;
}

export interface ClaimWithDetails {
  claim: ClaimDetail;
  diagnoses: Array<{
    id: string;
    icd10Code: string;
    description: string;
    isPrimary: boolean;
  }>;
  charges: Array<{
    id: string;
    cptCode: string;
    description: string;
    quantity: number;
    feeCents: number;
    linkedDiagnosisIds?: string[];
  }>;
  payments: ClaimPayment[];
  statusHistory: ClaimStatusHistory[];
}

// Body Diagram Types (Enhanced)
export interface BodyLocation {
  id: string;
  code: string;
  name: string;
  category: string;
  svgCoordinates?: {
    front?: { x: number; y: number };
    back?: { x: number; y: number };
  };
}

export type MarkingType = 'lesion' | 'examined' | 'biopsy' | 'excision' | 'injection';
export type MarkingStatus = 'active' | 'resolved' | 'monitored' | 'biopsied' | 'excised';

export interface BodyMarking {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string;
  locationCode: string;
  locationName?: string;
  locationCategory?: string;
  locationX: number;
  locationY: number;
  viewType: 'front' | 'back';
  markingType: MarkingType;
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  status: MarkingStatus;
  examinedDate?: string;
  resolvedDate?: string;
  description?: string;
  treatmentNotes?: string;
  photoIds?: string[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBodyMarkingData {
  patientId: string;
  encounterId?: string;
  locationCode: string;
  locationX: number;
  locationY: number;
  viewType: 'front' | 'back';
  markingType: MarkingType;
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  status?: MarkingStatus;
  examinedDate?: string;
  resolvedDate?: string;
  description?: string;
  treatmentNotes?: string;
  photoIds?: string[];
}

export interface UpdateBodyMarkingData {
  locationCode?: string;
  locationX?: number;
  locationY?: number;
  viewType?: 'front' | 'back';
  markingType?: MarkingType;
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  status?: MarkingStatus;
  examinedDate?: string;
  resolvedDate?: string;
  description?: string;
  treatmentNotes?: string;
  photoIds?: string[];
}
