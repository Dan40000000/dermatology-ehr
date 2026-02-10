/**
 * Async Care API Client
 * Patient photo upload system for telederm
 */

import { API_BASE_URL } from '../utils/apiBase';

const API_BASE = API_BASE_URL;
const TENANT_HEADER = 'x-tenant-id';

// ============================================================================
// Types
// ============================================================================

export type RequestType = 'photo_consult' | 'follow_up' | 'new_concern' | 'medication_question';
export type RequestStatus = 'pending' | 'in_review' | 'reviewed' | 'responded' | 'closed' | 'cancelled';
export type Urgency = 'routine' | 'soon' | 'urgent';
export type ResponseType = 'assessment' | 'question' | 'referral' | 'prescription' | 'self_care' | 'schedule_visit';

export interface AsyncCareRequest {
  id: string;
  tenantId: string;
  patientId: string;
  patientFirstName?: string;
  patientLastName?: string;
  requestType: RequestType;
  concernCategory?: string;
  status: RequestStatus;
  urgency: Urgency;
  assignedProviderId?: string;
  assignedProviderName?: string;
  chiefComplaint?: string;
  symptomDuration?: string;
  symptomChanges?: string;
  painLevel?: number;
  itchingLevel?: number;
  questionnaireResponses?: Record<string, any>;
  submittedAt: string;
  firstViewedAt?: string;
  lastUpdatedAt: string;
  closedAt?: string;
  escalatedToAppointment: boolean;
  escalatedAppointmentId?: string;
  photoCount?: number;
  responseCount?: number;
  photos?: PatientUploadedPhoto[];
  responses?: AsyncCareResponse[];
}

export interface PatientUploadedPhoto {
  id: string;
  requestId: string;
  patientId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  originalFilename?: string;
  fileSizeBytes?: number;
  bodyLocation: string;
  bodyLocationDetail?: string;
  bodyView?: string;
  description?: string;
  isCloseUp: boolean;
  processingStatus: string;
  sequenceNumber: number;
  uploadedAt: string;
}

export interface AsyncCareResponse {
  id: string;
  requestId: string;
  providerId: string;
  providerName?: string;
  responseType: ResponseType;
  responseText: string;
  clinicalAssessment?: string;
  recommendedAction?: string;
  suggestedDiagnosis?: string;
  suggestedIcd10?: string;
  followUpInstructions?: string;
  followUpTimeframe?: string;
  visibleToPatient: boolean;
  internalNotes?: string;
  respondedAt: string;
  readByPatientAt?: string;
}

export interface AsyncCareTemplate {
  id: string;
  conditionType: string;
  name: string;
  description?: string;
  autoQuestions: TemplateQuestion[];
  photoRequirements: PhotoRequirement[];
  urgencyTriggers: UrgencyTrigger[];
  minPhotos: number;
  maxPhotos: number;
}

export interface TemplateQuestion {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'boolean' | 'scale';
  options?: string[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  required: boolean;
}

export interface PhotoRequirement {
  description: string;
  bodyLocation: string;
  required: boolean;
  exampleUrl?: string;
}

export interface UrgencyTrigger {
  condition: string;
  urgency: Urgency;
  message: string;
}

export interface CreateRequestData {
  requestType: RequestType;
  concernCategory?: string;
  chiefComplaint?: string;
  symptomDuration?: string;
  symptomChanges?: string;
  painLevel?: number;
  itchingLevel?: number;
  questionnaireResponses?: Record<string, any>;
  urgency?: Urgency;
}

export interface SubmitResponseData {
  responseType: ResponseType;
  responseText: string;
  clinicalAssessment?: string;
  recommendedAction?: string;
  suggestedDiagnosis?: string;
  suggestedIcd10?: string;
  followUpInstructions?: string;
  followUpTimeframe?: string;
  visibleToPatient?: boolean;
  internalNotes?: string;
}

export interface QueueFilters {
  status?: RequestStatus | RequestStatus[];
  urgency?: Urgency;
  providerId?: string;
  unassignedOnly?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface FetchOptions {
  tenantId: string;
  accessToken: string;
}

interface PatientPortalOptions {
  sessionToken: string;
  tenantId: string;
}

// ============================================================================
// Staff/Provider API (uses staff auth)
// ============================================================================

/**
 * Get provider's request queue
 */
export async function fetchAsyncCareQueue(
  options: FetchOptions,
  filters?: QueueFilters
): Promise<{ requests: AsyncCareRequest[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      filters.status.forEach(s => params.append('status', s));
    } else {
      params.append('status', filters.status);
    }
  }
  if (filters?.urgency) params.append('urgency', filters.urgency);
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.unassignedOnly) params.append('unassignedOnly', 'true');
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());

  const res = await fetch(`${API_BASE}/api/async-care/queue?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch queue');
  return res.json();
}

/**
 * Get a specific request with details (provider view)
 */
export async function fetchAsyncCareRequest(
  options: FetchOptions,
  requestId: string
): Promise<{ request: AsyncCareRequest }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch request');
  return res.json();
}

/**
 * Assign request to provider
 */
export async function assignAsyncCareRequest(
  options: FetchOptions,
  requestId: string,
  providerId: string
): Promise<{ request: AsyncCareRequest }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/assign`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify({ providerId }),
  });

  if (!res.ok) throw new Error('Failed to assign request');
  return res.json();
}

/**
 * Submit provider response
 */
export async function submitAsyncCareResponse(
  options: FetchOptions,
  requestId: string,
  data: SubmitResponseData
): Promise<{ response: AsyncCareResponse }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error('Failed to submit response');
  return res.json();
}

/**
 * Update request status
 */
export async function updateAsyncCareStatus(
  options: FetchOptions,
  requestId: string,
  status: RequestStatus
): Promise<{ request: AsyncCareRequest }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

/**
 * Escalate to appointment
 */
export async function escalateToAppointment(
  options: FetchOptions,
  requestId: string,
  appointmentData: {
    providerId: string;
    locationId: string;
    appointmentTypeId: string;
    scheduledStart: string;
    scheduledEnd: string;
    notes?: string;
  }
): Promise<{ appointmentId: string }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/escalate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify(appointmentData),
  });

  if (!res.ok) throw new Error('Failed to escalate to appointment');
  return res.json();
}

/**
 * Get patient's requests (staff view)
 */
export async function fetchPatientAsyncCareRequests(
  options: FetchOptions,
  patientId: string
): Promise<{ requests: AsyncCareRequest[] }> {
  const res = await fetch(`${API_BASE}/api/async-care/patient/${patientId}/requests`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch patient requests');
  return res.json();
}

/**
 * Get queue statistics
 */
export async function fetchAsyncCareStats(
  options: FetchOptions
): Promise<{
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
  avgHoursToView: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/async-care/stats`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch statistics');
  return res.json();
}

// ============================================================================
// Patient Portal API (uses patient portal auth)
// ============================================================================

/**
 * Create a new async care request (patient portal)
 */
export async function createAsyncCareRequest(
  options: PatientPortalOptions,
  data: CreateRequestData
): Promise<{ request: AsyncCareRequest }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error('Failed to create request');
  return res.json();
}

/**
 * Upload photo for request (patient portal)
 */
export async function uploadAsyncCarePhoto(
  options: PatientPortalOptions,
  requestId: string,
  file: File,
  metadata: {
    bodyLocation: string;
    bodyLocationDetail?: string;
    bodyView?: 'front' | 'back' | 'side';
    description?: string;
    isCloseUp?: boolean;
  }
): Promise<{ photo: PatientUploadedPhoto }> {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('metadata', JSON.stringify(metadata));

  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/photos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to upload photo' }));
    throw new Error(error.error || 'Failed to upload photo');
  }
  return res.json();
}

/**
 * Delete photo (patient portal)
 */
export async function deleteAsyncCarePhoto(
  options: PatientPortalOptions,
  requestId: string,
  photoId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/async-care/requests/${requestId}/photos/${photoId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to delete photo');
  return res.json();
}

/**
 * Get patient's requests (patient portal)
 */
export async function fetchMyAsyncCareRequests(
  options: PatientPortalOptions
): Promise<{ requests: AsyncCareRequest[] }> {
  const res = await fetch(`${API_BASE}/api/async-care/patient/requests`, {
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

/**
 * Get specific request (patient portal)
 */
export async function fetchMyAsyncCareRequest(
  options: PatientPortalOptions,
  requestId: string
): Promise<{ request: AsyncCareRequest }> {
  const res = await fetch(`${API_BASE}/api/async-care/patient/requests/${requestId}`, {
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch request');
  return res.json();
}

/**
 * Mark response as read (patient portal)
 */
export async function markResponseAsRead(
  options: PatientPortalOptions,
  requestId: string,
  responseId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/async-care/patient/requests/${requestId}/responses/${responseId}/read`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${options.sessionToken}`,
        [TENANT_HEADER]: options.tenantId,
      },
    }
  );

  if (!res.ok) throw new Error('Failed to mark as read');
  return res.json();
}

/**
 * Get templates (patient portal)
 */
export async function fetchAsyncCareTemplates(
  options: PatientPortalOptions,
  conditionType?: string
): Promise<{ templates: AsyncCareTemplate[] }> {
  const params = new URLSearchParams();
  if (conditionType) params.append('conditionType', conditionType);

  const res = await fetch(`${API_BASE}/api/async-care/templates?${params}`, {
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

/**
 * Get specific template (patient portal)
 */
export async function fetchAsyncCareTemplate(
  options: PatientPortalOptions,
  templateId: string
): Promise<{ template: AsyncCareTemplate }> {
  const res = await fetch(`${API_BASE}/api/async-care/templates/${templateId}`, {
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });

  if (!res.ok) throw new Error('Failed to fetch template');
  return res.json();
}
