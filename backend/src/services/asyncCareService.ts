/**
 * Async Care Service
 * Handles patient photo upload requests for telederm/async care
 *
 * Features:
 * - Create and manage async care requests
 * - Handle photo uploads with compression
 * - Provider queue management
 * - Response handling and notifications
 * - Appointment escalation
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { PhotoService } from './photoService';
import { notificationService } from './notificationService';

// ============================================================================
// TYPES
// ============================================================================

export type RequestType = 'photo_consult' | 'follow_up' | 'new_concern' | 'medication_question';
export type RequestStatus = 'pending' | 'in_review' | 'reviewed' | 'responded' | 'closed' | 'cancelled';
export type Urgency = 'routine' | 'soon' | 'urgent';
export type ResponseType = 'assessment' | 'question' | 'referral' | 'prescription' | 'self_care' | 'schedule_visit';

export interface CreateRequestParams {
  patientId: string;
  requestType: RequestType;
  concernCategory?: string;
  chiefComplaint?: string;
  symptomDuration?: string;
  symptomChanges?: string;
  painLevel?: number;
  itchingLevel?: number;
  questionnaireResponses?: Record<string, any>;
  urgency?: Urgency;
  portalAccountId?: string;
}

export interface UploadPhotoParams {
  requestId: string;
  patientId: string;
  imageBuffer: Buffer;
  originalFilename: string;
  bodyLocation: string;
  bodyLocationDetail?: string;
  bodyView?: string;
  description?: string;
  isCloseUp?: boolean;
  sequenceNumber?: number;
}

export interface SubmitResponseParams {
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
  submittedAt: Date;
  firstViewedAt?: Date;
  lastUpdatedAt: Date;
  closedAt?: Date;
  escalatedToAppointment: boolean;
  escalatedAppointmentId?: string;
  photoCount?: number;
  responseCount?: number;
  photos?: PatientUploadedPhoto[];
  responses?: AsyncCareResponse[];
}

export interface PatientUploadedPhoto {
  id: string;
  tenantId: string;
  requestId: string;
  patientId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  originalFilename?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  bodyLocation: string;
  bodyLocationDetail?: string;
  bodyView?: string;
  description?: string;
  isCloseUp: boolean;
  processingStatus: string;
  sequenceNumber: number;
  uploadedAt: Date;
}

export interface AsyncCareResponse {
  id: string;
  tenantId: string;
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
  respondedAt: Date;
  readByPatientAt?: Date;
}

export interface AsyncCareTemplate {
  id: string;
  tenantId: string;
  conditionType: string;
  name: string;
  description?: string;
  autoQuestions: any[];
  photoRequirements: any[];
  urgencyTriggers: any[];
  defaultProviderId?: string;
  specialtyRequired?: string;
  isActive: boolean;
  minPhotos: number;
  maxPhotos: number;
}

export interface QueueFilters {
  status?: RequestStatus | RequestStatus[];
  urgency?: Urgency;
  providerId?: string;
  unassignedOnly?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// REQUEST MANAGEMENT
// ============================================================================

/**
 * Create a new async care request (patient-initiated)
 */
export async function createRequest(
  tenantId: string,
  params: CreateRequestParams
): Promise<AsyncCareRequest> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO async_care_requests (
      id, tenant_id, patient_id, request_type, concern_category,
      chief_complaint, symptom_duration, symptom_changes,
      pain_level, itching_level, questionnaire_responses,
      urgency, status, portal_account_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13)
    RETURNING *`,
    [
      id,
      tenantId,
      params.patientId,
      params.requestType,
      params.concernCategory || null,
      params.chiefComplaint || null,
      params.symptomDuration || null,
      params.symptomChanges || null,
      params.painLevel ?? null,
      params.itchingLevel ?? null,
      JSON.stringify(params.questionnaireResponses || {}),
      params.urgency || 'routine',
      params.portalAccountId || null,
    ]
  );

  const request = mapRowToRequest(result.rows[0]);

  logger.info('Async care request created', {
    requestId: id,
    patientId: params.patientId,
    requestType: params.requestType,
    urgency: params.urgency || 'routine',
  });

  // Notify relevant providers about new request
  await notifyProvidersOfNewRequest(tenantId, request);

  return request;
}

/**
 * Get a single request by ID
 */
export async function getRequest(
  tenantId: string,
  requestId: string
): Promise<AsyncCareRequest | null> {
  const result = await pool.query(
    `SELECT
      r.*,
      p.first_name as patient_first_name,
      p.last_name as patient_last_name,
      pr.full_name as assigned_provider_name,
      (SELECT COUNT(*) FROM patient_uploaded_photos WHERE request_id = r.id) as photo_count,
      (SELECT COUNT(*) FROM async_care_responses WHERE request_id = r.id) as response_count
    FROM async_care_requests r
    LEFT JOIN patients p ON r.patient_id = p.id
    LEFT JOIN providers pr ON r.assigned_provider_id = pr.id
    WHERE r.id = $1 AND r.tenant_id = $2`,
    [requestId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRequest(result.rows[0]);
}

/**
 * Get request with photos and responses
 */
export async function getRequestWithDetails(
  tenantId: string,
  requestId: string
): Promise<AsyncCareRequest | null> {
  const request = await getRequest(tenantId, requestId);
  if (!request) {
    return null;
  }

  // Get photos
  const photosResult = await pool.query(
    `SELECT * FROM patient_uploaded_photos
     WHERE request_id = $1 AND tenant_id = $2
     ORDER BY sequence_number ASC`,
    [requestId, tenantId]
  );
  request.photos = photosResult.rows.map(mapRowToPhoto);

  // Get responses
  const responsesResult = await pool.query(
    `SELECT r.*, pr.full_name as provider_name
     FROM async_care_responses r
     LEFT JOIN providers pr ON r.provider_id = pr.id
     WHERE r.request_id = $1 AND r.tenant_id = $2
     ORDER BY r.responded_at DESC`,
    [requestId, tenantId]
  );
  request.responses = responsesResult.rows.map(mapRowToResponse);

  return request;
}

/**
 * Get requests for a patient
 */
export async function getPatientRequests(
  tenantId: string,
  patientId: string,
  includeDetails: boolean = false
): Promise<AsyncCareRequest[]> {
  const result = await pool.query(
    `SELECT
      r.*,
      (SELECT COUNT(*) FROM patient_uploaded_photos WHERE request_id = r.id) as photo_count,
      (SELECT COUNT(*) FROM async_care_responses WHERE request_id = r.id) as response_count,
      (SELECT COUNT(*) FROM async_care_responses WHERE request_id = r.id AND read_by_patient_at IS NULL AND visible_to_patient = TRUE) as unread_response_count
    FROM async_care_requests r
    WHERE r.patient_id = $1 AND r.tenant_id = $2
    ORDER BY r.submitted_at DESC`,
    [patientId, tenantId]
  );

  const requests = result.rows.map(mapRowToRequest);

  if (includeDetails) {
    for (const request of requests) {
      const photosResult = await pool.query(
        `SELECT * FROM patient_uploaded_photos
         WHERE request_id = $1
         ORDER BY sequence_number ASC LIMIT 5`,
        [request.id]
      );
      request.photos = photosResult.rows.map(mapRowToPhoto);
    }
  }

  return requests;
}

/**
 * Update request status
 */
export async function updateRequestStatus(
  tenantId: string,
  requestId: string,
  status: RequestStatus,
  changedBy?: string
): Promise<AsyncCareRequest | null> {
  const updates: string[] = ['status = $3'];
  const params: any[] = [requestId, tenantId, status];
  let paramIndex = 4;

  if (status === 'closed' || status === 'cancelled') {
    updates.push(`closed_at = NOW()`);
  }

  const result = await pool.query(
    `UPDATE async_care_requests
     SET ${updates.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Log status change
  await pool.query(
    `INSERT INTO async_care_request_history (id, tenant_id, request_id, new_status, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), tenantId, requestId, status, changedBy || 'system']
  );

  return mapRowToRequest(result.rows[0]);
}

// ============================================================================
// PHOTO MANAGEMENT
// ============================================================================

/**
 * Upload a photo for a request
 */
export async function uploadPhoto(
  tenantId: string,
  params: UploadPhotoParams
): Promise<PatientUploadedPhoto> {
  // Verify request exists and is open
  const requestCheck = await pool.query(
    `SELECT id, status FROM async_care_requests
     WHERE id = $1 AND tenant_id = $2 AND patient_id = $3`,
    [params.requestId, tenantId, params.patientId]
  );

  if (requestCheck.rows.length === 0) {
    throw new Error('Request not found');
  }

  if (!['pending', 'in_review'].includes(requestCheck.rows[0].status)) {
    throw new Error('Cannot add photos to a closed request');
  }

  // Check photo limit
  const photoCount = await pool.query(
    `SELECT COUNT(*) FROM patient_uploaded_photos WHERE request_id = $1`,
    [params.requestId]
  );

  if (parseInt(photoCount.rows[0].count) >= 5) {
    throw new Error('Maximum of 5 photos per request');
  }

  const id = crypto.randomUUID();

  // Process and store the image
  let processed;
  try {
    processed = await PhotoService.processPhoto(
      params.imageBuffer,
      tenantId,
      params.patientId,
      params.originalFilename
    );
  } catch (error: any) {
    logger.error('Failed to process photo', { error: error.message, requestId: params.requestId });
    throw new Error('Failed to process photo: ' + error.message);
  }

  // Get sequence number
  const seqResult = await pool.query(
    `SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
     FROM patient_uploaded_photos WHERE request_id = $1`,
    [params.requestId]
  );
  const sequenceNumber = params.sequenceNumber || seqResult.rows[0].next_seq;

  // Store in database
  const result = await pool.query(
    `INSERT INTO patient_uploaded_photos (
      id, tenant_id, request_id, patient_id,
      image_url, thumbnail_url, original_filename,
      file_size_bytes, mime_type, width, height,
      body_location, body_location_detail, body_view,
      description, is_close_up, processing_status,
      exif_stripped, sequence_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'ready', TRUE, $17)
    RETURNING *`,
    [
      id,
      tenantId,
      params.requestId,
      params.patientId,
      processed.filePath,
      processed.thumbnailPath,
      params.originalFilename,
      processed.compressedSize,
      'image/jpeg',
      processed.metadata.width,
      processed.metadata.height,
      params.bodyLocation,
      params.bodyLocationDetail || null,
      params.bodyView || null,
      params.description || null,
      params.isCloseUp || false,
      sequenceNumber,
    ]
  );

  logger.info('Photo uploaded for async care request', {
    photoId: id,
    requestId: params.requestId,
    bodyLocation: params.bodyLocation,
  });

  return mapRowToPhoto(result.rows[0]);
}

/**
 * Get photos for a request
 */
export async function getRequestPhotos(
  tenantId: string,
  requestId: string
): Promise<PatientUploadedPhoto[]> {
  const result = await pool.query(
    `SELECT * FROM patient_uploaded_photos
     WHERE request_id = $1 AND tenant_id = $2
     ORDER BY sequence_number ASC`,
    [requestId, tenantId]
  );

  return result.rows.map(mapRowToPhoto);
}

/**
 * Delete a photo
 */
export async function deletePhoto(
  tenantId: string,
  photoId: string,
  patientId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM patient_uploaded_photos
     WHERE id = $1 AND tenant_id = $2 AND patient_id = $3
     RETURNING id, image_url, thumbnail_url`,
    [photoId, tenantId, patientId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  // Clean up files
  try {
    await PhotoService.deletePhoto(
      result.rows[0].image_url,
      result.rows[0].thumbnail_url
    );
  } catch (error) {
    logger.warn('Failed to delete photo files', { photoId, error });
  }

  return true;
}

// ============================================================================
// PROVIDER QUEUE MANAGEMENT
// ============================================================================

/**
 * Assign a request to a provider
 */
export async function assignToProvider(
  tenantId: string,
  requestId: string,
  providerId: string
): Promise<AsyncCareRequest | null> {
  const result = await pool.query(
    `UPDATE async_care_requests
     SET assigned_provider_id = $3,
         assigned_at = NOW(),
         status = CASE WHEN status = 'pending' THEN 'in_review' ELSE status END
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [requestId, tenantId, providerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info('Request assigned to provider', { requestId, providerId });

  return mapRowToRequest(result.rows[0]);
}

/**
 * Get provider's request queue
 */
export async function getRequestQueue(
  tenantId: string,
  providerId: string | null,
  filters: QueueFilters = {}
): Promise<{ requests: AsyncCareRequest[]; total: number }> {
  const whereClauses: string[] = ['r.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (providerId) {
    whereClauses.push(`r.assigned_provider_id = $${paramIndex}`);
    params.push(providerId);
    paramIndex++;
  }

  if (filters.unassignedOnly) {
    whereClauses.push('r.assigned_provider_id IS NULL');
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      whereClauses.push(`r.status = ANY($${paramIndex})`);
      params.push(filters.status);
    } else {
      whereClauses.push(`r.status = $${paramIndex}`);
      params.push(filters.status);
    }
    paramIndex++;
  } else {
    // Default to pending and in_review
    whereClauses.push(`r.status IN ('pending', 'in_review')`);
  }

  if (filters.urgency) {
    whereClauses.push(`r.urgency = $${paramIndex}`);
    params.push(filters.urgency);
    paramIndex++;
  }

  if (filters.startDate) {
    whereClauses.push(`r.submitted_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    whereClauses.push(`r.submitted_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  const whereClause = whereClauses.join(' AND ');
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM async_care_requests r WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get requests
  const result = await pool.query(
    `SELECT
      r.*,
      p.first_name as patient_first_name,
      p.last_name as patient_last_name,
      pr.full_name as assigned_provider_name,
      (SELECT COUNT(*) FROM patient_uploaded_photos WHERE request_id = r.id) as photo_count,
      (SELECT COUNT(*) FROM async_care_responses WHERE request_id = r.id) as response_count
    FROM async_care_requests r
    LEFT JOIN patients p ON r.patient_id = p.id
    LEFT JOIN providers pr ON r.assigned_provider_id = pr.id
    WHERE ${whereClause}
    ORDER BY
      CASE r.urgency WHEN 'urgent' THEN 1 WHEN 'soon' THEN 2 ELSE 3 END,
      r.submitted_at ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    requests: result.rows.map(mapRowToRequest),
    total,
  };
}

/**
 * Mark request as first viewed (when provider opens it)
 */
export async function markAsViewed(
  tenantId: string,
  requestId: string
): Promise<void> {
  await pool.query(
    `UPDATE async_care_requests
     SET first_viewed_at = COALESCE(first_viewed_at, NOW())
     WHERE id = $1 AND tenant_id = $2`,
    [requestId, tenantId]
  );
}

// ============================================================================
// RESPONSE MANAGEMENT
// ============================================================================

/**
 * Submit a provider response
 */
export async function submitResponse(
  tenantId: string,
  requestId: string,
  providerId: string,
  params: SubmitResponseParams
): Promise<AsyncCareResponse> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO async_care_responses (
      id, tenant_id, request_id, provider_id,
      response_type, response_text, clinical_assessment,
      recommended_action, suggested_diagnosis, suggested_icd10,
      follow_up_instructions, follow_up_timeframe,
      visible_to_patient, internal_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      id,
      tenantId,
      requestId,
      providerId,
      params.responseType,
      params.responseText,
      params.clinicalAssessment || null,
      params.recommendedAction || null,
      params.suggestedDiagnosis || null,
      params.suggestedIcd10 || null,
      params.followUpInstructions || null,
      params.followUpTimeframe || null,
      params.visibleToPatient !== false,
      params.internalNotes || null,
    ]
  );

  // Update request status
  await pool.query(
    `UPDATE async_care_requests
     SET status = 'responded'
     WHERE id = $1 AND tenant_id = $2 AND status IN ('pending', 'in_review', 'reviewed')`,
    [requestId, tenantId]
  );

  const response = mapRowToResponse(result.rows[0]);

  logger.info('Provider response submitted', {
    responseId: id,
    requestId,
    providerId,
    responseType: params.responseType,
  });

  // Notify patient
  if (params.visibleToPatient !== false) {
    await notifyPatient(tenantId, requestId, id);
  }

  return response;
}

/**
 * Get responses for a request
 */
export async function getRequestResponses(
  tenantId: string,
  requestId: string,
  patientView: boolean = false
): Promise<AsyncCareResponse[]> {
  let query = `
    SELECT r.*, pr.full_name as provider_name
    FROM async_care_responses r
    LEFT JOIN providers pr ON r.provider_id = pr.id
    WHERE r.request_id = $1 AND r.tenant_id = $2
  `;

  if (patientView) {
    query += ' AND r.visible_to_patient = TRUE';
  }

  query += ' ORDER BY r.responded_at DESC';

  const result = await pool.query(query, [requestId, tenantId]);
  return result.rows.map(mapRowToResponse);
}

/**
 * Mark response as read by patient
 */
export async function markResponseAsRead(
  tenantId: string,
  responseId: string
): Promise<void> {
  await pool.query(
    `UPDATE async_care_responses
     SET read_by_patient_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND read_by_patient_at IS NULL`,
    [responseId, tenantId]
  );
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Notify patient of new response
 */
export async function notifyPatient(
  tenantId: string,
  requestId: string,
  responseId: string
): Promise<void> {
  try {
    // Get request details
    const request = await getRequest(tenantId, requestId);
    if (!request) return;

    // Get patient's portal account
    const accountResult = await pool.query(
      `SELECT id, email FROM patient_portal_accounts
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, request.patientId]
    );

    if (accountResult.rows.length === 0) return;

    const account = accountResult.rows[0];

    // Send notification (email and/or in-app)
    await notificationService.sendInApp(tenantId, account.id, {
      type: 'async_care_response',
      category: 'patient',
      title: 'Provider Response Ready',
      message: 'Your provider has responded to your photo consultation request.',
      data: { requestId, responseId },
      actionUrl: `/portal/async-care/${requestId}`,
      actionLabel: 'View Response',
      priority: 'high',
    });

    logger.info('Patient notified of response', { requestId, responseId, patientId: request.patientId });
  } catch (error: any) {
    logger.error('Failed to notify patient', { error: error.message, requestId, responseId });
  }
}

/**
 * Notify providers of new request
 */
async function notifyProvidersOfNewRequest(
  tenantId: string,
  request: AsyncCareRequest
): Promise<void> {
  try {
    // Get providers to notify
    const providersResult = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'provider'`,
      [tenantId]
    );

    for (const provider of providersResult.rows) {
      await notificationService.sendInApp(tenantId, provider.id, {
        type: 'async_care_new_request',
        category: 'clinical',
        title: 'New Async Care Request',
        message: `New ${request.requestType.replace('_', ' ')} request from patient`,
        data: { requestId: request.id, urgency: request.urgency },
        actionUrl: `/async-care/queue`,
        actionLabel: 'View Queue',
        priority: request.urgency === 'urgent' ? 'urgent' : 'normal',
      });
    }
  } catch (error: any) {
    logger.error('Failed to notify providers', { error: error.message, requestId: request.id });
  }
}

// ============================================================================
// ESCALATION
// ============================================================================

/**
 * Convert an async care request to an in-person appointment
 */
export async function convertToAppointment(
  tenantId: string,
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
  // Get request details
  const request = await getRequest(tenantId, requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  // Create appointment
  const appointmentId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO appointments (
      id, tenant_id, patient_id, provider_id, location_id,
      appointment_type_id, scheduled_start, scheduled_end,
      status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9)`,
    [
      appointmentId,
      tenantId,
      request.patientId,
      appointmentData.providerId,
      appointmentData.locationId,
      appointmentData.appointmentTypeId,
      appointmentData.scheduledStart,
      appointmentData.scheduledEnd,
      appointmentData.notes || `Escalated from async care request: ${request.chiefComplaint || request.concernCategory}`,
    ]
  );

  // Update request
  await pool.query(
    `UPDATE async_care_requests
     SET escalated_to_appointment = TRUE,
         escalated_appointment_id = $3,
         status = 'closed',
         closed_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [requestId, tenantId, appointmentId]
  );

  logger.info('Async care request escalated to appointment', {
    requestId,
    appointmentId,
    patientId: request.patientId,
  });

  // Notify patient
  await notifyPatient(tenantId, requestId, 'escalated');

  return { appointmentId };
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Get templates for a condition type
 */
export async function getTemplates(
  tenantId: string,
  conditionType?: string
): Promise<AsyncCareTemplate[]> {
  let query = `
    SELECT * FROM async_care_templates
    WHERE (tenant_id = $1 OR tenant_id = 'default') AND is_active = TRUE
  `;
  const params: any[] = [tenantId];

  if (conditionType) {
    query += ` AND condition_type = $2`;
    params.push(conditionType);
  }

  query += ' ORDER BY name ASC';

  const result = await pool.query(query, params);
  return result.rows.map(mapRowToTemplate);
}

/**
 * Get a single template
 */
export async function getTemplate(
  tenantId: string,
  templateId: string
): Promise<AsyncCareTemplate | null> {
  const result = await pool.query(
    `SELECT * FROM async_care_templates
     WHERE id = $1 AND (tenant_id = $2 OR tenant_id = 'default')`,
    [templateId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToTemplate(result.rows[0]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapRowToRequest(row: any): AsyncCareRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    patientFirstName: row.patient_first_name,
    patientLastName: row.patient_last_name,
    requestType: row.request_type,
    concernCategory: row.concern_category,
    status: row.status,
    urgency: row.urgency,
    assignedProviderId: row.assigned_provider_id,
    assignedProviderName: row.assigned_provider_name,
    chiefComplaint: row.chief_complaint,
    symptomDuration: row.symptom_duration,
    symptomChanges: row.symptom_changes,
    painLevel: row.pain_level,
    itchingLevel: row.itching_level,
    questionnaireResponses: row.questionnaire_responses,
    submittedAt: row.submitted_at,
    firstViewedAt: row.first_viewed_at,
    lastUpdatedAt: row.last_updated_at,
    closedAt: row.closed_at,
    escalatedToAppointment: row.escalated_to_appointment,
    escalatedAppointmentId: row.escalated_appointment_id,
    photoCount: row.photo_count ? parseInt(row.photo_count, 10) : undefined,
    responseCount: row.response_count ? parseInt(row.response_count, 10) : undefined,
  };
}

function mapRowToPhoto(row: any): PatientUploadedPhoto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    requestId: row.request_id,
    patientId: row.patient_id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    bodyLocation: row.body_location,
    bodyLocationDetail: row.body_location_detail,
    bodyView: row.body_view,
    description: row.description,
    isCloseUp: row.is_close_up,
    processingStatus: row.processing_status,
    sequenceNumber: row.sequence_number,
    uploadedAt: row.uploaded_at,
  };
}

function mapRowToResponse(row: any): AsyncCareResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    requestId: row.request_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    responseType: row.response_type,
    responseText: row.response_text,
    clinicalAssessment: row.clinical_assessment,
    recommendedAction: row.recommended_action,
    suggestedDiagnosis: row.suggested_diagnosis,
    suggestedIcd10: row.suggested_icd10,
    followUpInstructions: row.follow_up_instructions,
    followUpTimeframe: row.follow_up_timeframe,
    visibleToPatient: row.visible_to_patient,
    internalNotes: row.internal_notes,
    respondedAt: row.responded_at,
    readByPatientAt: row.read_by_patient_at,
  };
}

function mapRowToTemplate(row: any): AsyncCareTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conditionType: row.condition_type,
    name: row.name,
    description: row.description,
    autoQuestions: row.auto_questions || [],
    photoRequirements: row.photo_requirements || [],
    urgencyTriggers: row.urgency_triggers || [],
    defaultProviderId: row.default_provider_id,
    specialtyRequired: row.specialty_required,
    isActive: row.is_active,
    minPhotos: row.min_photos,
    maxPhotos: row.max_photos,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export const asyncCareService = {
  // Request management
  createRequest,
  getRequest,
  getRequestWithDetails,
  getPatientRequests,
  updateRequestStatus,

  // Photo management
  uploadPhoto,
  getRequestPhotos,
  deletePhoto,

  // Provider queue
  assignToProvider,
  getRequestQueue,
  markAsViewed,

  // Responses
  submitResponse,
  getRequestResponses,
  markResponseAsRead,

  // Notifications
  notifyPatient,

  // Escalation
  convertToAppointment,

  // Templates
  getTemplates,
  getTemplate,
};

export default asyncCareService;
