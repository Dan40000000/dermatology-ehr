/**
 * Staff Scheduling & Resource Management Service
 *
 * Handles:
 * - Staff schedule management
 * - Shift swap requests
 * - PTO requests and balances
 * - Room scheduling
 * - Credential tracking
 * - Training compliance
 * - Overtime alerts
 * - Productivity metrics
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// =====================================================
// TYPES & INTERFACES
// =====================================================

export enum CredentialType {
  MEDICAL_LICENSE = 'MEDICAL_LICENSE',
  DEA = 'DEA',
  NPI = 'NPI',
  BOARD_CERTIFICATION = 'BOARD_CERTIFICATION',
  BLS = 'BLS',
  ACLS = 'ACLS',
}

export enum ShiftType {
  REGULAR = 'regular',
  ON_CALL = 'on_call',
  OVERTIME = 'overtime',
  SPLIT = 'split',
}

export enum ScheduleStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum SwapStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  CANCELLED = 'cancelled',
}

export enum PTOType {
  VACATION = 'vacation',
  SICK = 'sick',
  PERSONAL = 'personal',
  BEREAVEMENT = 'bereavement',
  JURY_DUTY = 'jury_duty',
  FMLA = 'fmla',
  OTHER = 'other',
}

export enum PTOStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  CANCELLED = 'cancelled',
}

export enum RoomType {
  EXAM_ROOM = 'exam_room',
  PROCEDURE_ROOM = 'procedure_room',
  CONSULTATION = 'consultation',
  LAB = 'lab',
  IMAGING = 'imaging',
  WAITING = 'waiting',
}

export enum RoomStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
  OUT_OF_SERVICE = 'out_of_service',
}

export interface StaffSchedule {
  id: string;
  tenantId: string;
  staffId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  status: ScheduleStatus;
  notes?: string;
  createdAt: string;
  staffName?: string;
}

export interface ShiftSwapRequest {
  id: string;
  originalScheduleId: string;
  requestingStaffId: string;
  targetStaffId: string;
  status: SwapStatus;
  reason?: string;
  requestedAt: string;
  resolvedAt?: string;
}

export interface PTORequest {
  id: string;
  tenantId: string;
  staffId: string;
  requestType: PTOType;
  startDate: string;
  endDate: string;
  hours: number;
  status: PTOStatus;
  reason?: string;
  approvedBy?: string;
  requestedAt: string;
}

export interface PTOBalance {
  id: string;
  tenantId: string;
  staffId: string;
  ptoType: PTOType;
  balanceHours: number;
  accruedYtd: number;
  usedYtd: number;
  year: number;
}

export interface Room {
  id: string;
  tenantId: string;
  name: string;
  roomType: RoomType;
  capacity: number;
  equipment: string[];
  status: RoomStatus;
  locationId?: string;
}

export interface RoomSchedule {
  id: string;
  roomId: string;
  appointmentId?: string;
  startTime: string;
  endTime: string;
  status: string;
  purpose?: string;
}

export interface StaffCredential {
  id: string;
  tenantId: string;
  staffId: string;
  credentialType: CredentialType;
  credentialNumber?: string;
  issuingAuthority?: string;
  issuingState?: string;
  issueDate?: string;
  expirationDate?: string;
  verified: boolean;
  verificationDate?: string;
  documentUrl?: string;
}

export interface TrainingRequirement {
  id: string;
  tenantId: string;
  role: string;
  trainingName: string;
  description?: string;
  required: boolean;
  frequencyMonths?: number;
  category?: string;
}

export interface StaffTrainingRecord {
  id: string;
  staffId: string;
  trainingId: string;
  completedDate: string;
  expirationDate?: string;
  score?: number;
  certificateUrl?: string;
  status: string;
}

export interface OvertimeAlert {
  id: string;
  tenantId: string;
  staffId: string;
  weekStart: string;
  hoursWorked: number;
  threshold: number;
  alertType: string;
  alertSentAt: string;
}

export interface ProductivityMetrics {
  staffId: string;
  staffName?: string;
  metricDate: string;
  scheduledHours: number;
  workedHours: number;
  patientEncounters: number;
  proceduresPerformed: number;
  rvuTotal: number;
  utilizationPercent: number;
}

export interface SchedulingDashboard {
  todaySchedules: StaffSchedule[];
  pendingSwapRequests: number;
  pendingPTORequests: number;
  roomsAvailable: number;
  roomsOccupied: number;
  expiringCredentials: number;
  overdueTraining: number;
  overtimeRisks: number;
}

// =====================================================
// STAFF SCHEDULE MANAGEMENT
// =====================================================

/**
 * Create a new staff schedule
 */
export async function createSchedule(
  tenantId: string,
  staffId: string,
  scheduleDate: string,
  startTime: string,
  endTime: string,
  shiftType: ShiftType = ShiftType.REGULAR,
  notes?: string,
  createdBy?: string
): Promise<StaffSchedule> {
  logger.info('Creating staff schedule', { tenantId, staffId, scheduleDate });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO staff_schedules
     (id, tenant_id, staff_id, schedule_date, start_time, end_time, shift_type, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, tenantId, staffId, scheduleDate, startTime, endTime, shiftType, ScheduleStatus.SCHEDULED, notes, createdBy]
  );

  const row = result.rows[0];
  return mapScheduleRow(row);
}

/**
 * Get staff schedules with optional filters
 */
export async function getSchedules(
  tenantId: string,
  options: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
    status?: ScheduleStatus;
  } = {}
): Promise<StaffSchedule[]> {
  let query = `
    SELECT ss.*, u.first_name, u.last_name
    FROM staff_schedules ss
    JOIN users u ON u.id = ss.staff_id
    WHERE ss.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND ss.staff_id = $${paramIndex++}`;
    params.push(options.staffId);
  }

  if (options.startDate) {
    query += ` AND ss.schedule_date >= $${paramIndex++}`;
    params.push(options.startDate);
  }

  if (options.endDate) {
    query += ` AND ss.schedule_date <= $${paramIndex++}`;
    params.push(options.endDate);
  }

  if (options.status) {
    query += ` AND ss.status = $${paramIndex++}`;
    params.push(options.status);
  }

  query += ` ORDER BY ss.schedule_date, ss.start_time`;

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    ...mapScheduleRow(row),
    staffName: `${row.first_name} ${row.last_name}`,
  }));
}

/**
 * Update schedule status
 */
export async function updateScheduleStatus(
  scheduleId: string,
  status: ScheduleStatus
): Promise<StaffSchedule | null> {
  const result = await pool.query(
    `UPDATE staff_schedules SET status = $1 WHERE id = $2 RETURNING *`,
    [status, scheduleId]
  );

  if (result.rows.length === 0) return null;
  return mapScheduleRow(result.rows[0]);
}

// =====================================================
// SHIFT SWAP MANAGEMENT
// =====================================================

/**
 * Request a shift swap
 */
export async function requestShiftSwap(
  originalScheduleId: string,
  requestingStaffId: string,
  targetStaffId: string,
  reason?: string
): Promise<ShiftSwapRequest> {
  logger.info('Creating shift swap request', { originalScheduleId, requestingStaffId, targetStaffId });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO shift_swap_requests
     (id, original_schedule_id, requesting_staff_id, target_staff_id, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, originalScheduleId, requestingStaffId, targetStaffId, reason]
  );

  return mapSwapRequestRow(result.rows[0]);
}

/**
 * Get pending shift swap requests
 */
export async function getShiftSwapRequests(
  tenantId: string,
  options: {
    staffId?: string;
    status?: SwapStatus;
  } = {}
): Promise<ShiftSwapRequest[]> {
  let query = `
    SELECT ssr.*
    FROM shift_swap_requests ssr
    JOIN staff_schedules ss ON ss.id = ssr.original_schedule_id
    WHERE ss.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND (ssr.requesting_staff_id = $${paramIndex} OR ssr.target_staff_id = $${paramIndex})`;
    params.push(options.staffId);
    paramIndex++;
  }

  if (options.status) {
    query += ` AND ssr.status = $${paramIndex++}`;
    params.push(options.status);
  }

  query += ` ORDER BY ssr.requested_at DESC`;

  const result = await pool.query(query, params);
  return result.rows.map(mapSwapRequestRow);
}

/**
 * Approve or deny a shift swap request
 */
export async function resolveShiftSwap(
  swapRequestId: string,
  status: SwapStatus.APPROVED | SwapStatus.DENIED,
  resolvedBy: string,
  adminNotes?: string
): Promise<ShiftSwapRequest | null> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the swap request
    const swapResult = await client.query(
      `SELECT * FROM shift_swap_requests WHERE id = $1`,
      [swapRequestId]
    );

    if (swapResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const swap = swapResult.rows[0];

    // Update the swap request
    const updateResult = await client.query(
      `UPDATE shift_swap_requests
       SET status = $1, resolved_at = NOW(), resolved_by = $2, admin_notes = $3
       WHERE id = $4
       RETURNING *`,
      [status, resolvedBy, adminNotes, swapRequestId]
    );

    // If approved, swap the staff assignments
    if (status === SwapStatus.APPROVED) {
      // Get the original schedule
      const scheduleResult = await client.query(
        `SELECT * FROM staff_schedules WHERE id = $1`,
        [swap.original_schedule_id]
      );

      if (scheduleResult.rows.length > 0) {
        const schedule = scheduleResult.rows[0];

        // Update the original schedule to the target staff
        await client.query(
          `UPDATE staff_schedules SET staff_id = $1 WHERE id = $2`,
          [swap.target_staff_id, swap.original_schedule_id]
        );

        // Create a new schedule for the requesting staff on target's day if needed
        // This is a simplified swap - in production you might want to swap specific shifts
        logger.info('Shift swap approved', {
          swapRequestId,
          originalSchedule: swap.original_schedule_id,
          newStaff: swap.target_staff_id,
        });
      }
    }

    await client.query('COMMIT');
    return mapSwapRequestRow(updateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =====================================================
// PTO MANAGEMENT
// =====================================================

/**
 * Request PTO
 */
export async function requestPTO(
  tenantId: string,
  staffId: string,
  requestType: PTOType,
  startDate: string,
  endDate: string,
  hours: number,
  reason?: string
): Promise<PTORequest> {
  logger.info('Creating PTO request', { tenantId, staffId, requestType, startDate, endDate, hours });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO pto_requests
     (id, tenant_id, staff_id, request_type, start_date, end_date, hours, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, tenantId, staffId, requestType, startDate, endDate, hours, reason]
  );

  return mapPTORequestRow(result.rows[0]);
}

/**
 * Get PTO requests for a staff member
 */
export async function getPTORequests(
  tenantId: string,
  options: {
    staffId?: string;
    status?: PTOStatus;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<PTORequest[]> {
  let query = `
    SELECT * FROM pto_requests
    WHERE tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND staff_id = $${paramIndex++}`;
    params.push(options.staffId);
  }

  if (options.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(options.status);
  }

  if (options.startDate) {
    query += ` AND start_date >= $${paramIndex++}`;
    params.push(options.startDate);
  }

  if (options.endDate) {
    query += ` AND end_date <= $${paramIndex++}`;
    params.push(options.endDate);
  }

  query += ` ORDER BY start_date DESC`;

  const result = await pool.query(query, params);
  return result.rows.map(mapPTORequestRow);
}

/**
 * Approve or deny a PTO request
 */
export async function resolvePTORequest(
  ptoRequestId: string,
  status: PTOStatus.APPROVED | PTOStatus.DENIED,
  approvedBy: string,
  adminNotes?: string
): Promise<PTORequest | null> {
  logger.info('Resolving PTO request', { ptoRequestId, status, approvedBy });

  const result = await pool.query(
    `UPDATE pto_requests
     SET status = $1, approved_by = $2, admin_notes = $3, resolved_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [status, approvedBy, adminNotes, ptoRequestId]
  );

  if (result.rows.length === 0) return null;
  return mapPTORequestRow(result.rows[0]);
}

/**
 * Get PTO balance for a staff member
 */
export async function getPTOBalance(
  tenantId: string,
  staffId: string,
  year?: number
): Promise<PTOBalance[]> {
  const targetYear = year || new Date().getFullYear();

  const result = await pool.query(
    `SELECT * FROM pto_balances
     WHERE tenant_id = $1 AND staff_id = $2 AND year = $3
     ORDER BY pto_type`,
    [tenantId, staffId, targetYear]
  );

  return result.rows.map(mapPTOBalanceRow);
}

/**
 * Initialize or update PTO balance for a staff member
 */
export async function upsertPTOBalance(
  tenantId: string,
  staffId: string,
  ptoType: PTOType,
  balanceHours: number,
  year?: number
): Promise<PTOBalance> {
  const targetYear = year || new Date().getFullYear();

  const result = await pool.query(
    `INSERT INTO pto_balances (id, tenant_id, staff_id, pto_type, balance_hours, year)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, staff_id, pto_type, year)
     DO UPDATE SET balance_hours = $5, updated_at = NOW()
     RETURNING *`,
    [crypto.randomUUID(), tenantId, staffId, ptoType, balanceHours, targetYear]
  );

  return mapPTOBalanceRow(result.rows[0]);
}

// =====================================================
// ROOM MANAGEMENT
// =====================================================

/**
 * Get rooms with optional filters
 */
export async function getRooms(
  tenantId: string,
  options: {
    roomType?: RoomType;
    status?: RoomStatus;
    locationId?: string;
  } = {}
): Promise<Room[]> {
  let query = `SELECT * FROM rooms WHERE tenant_id = $1`;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.roomType) {
    query += ` AND room_type = $${paramIndex++}`;
    params.push(options.roomType);
  }

  if (options.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(options.status);
  }

  if (options.locationId) {
    query += ` AND location_id = $${paramIndex++}`;
    params.push(options.locationId);
  }

  query += ` ORDER BY name`;

  const result = await pool.query(query, params);
  return result.rows.map(mapRoomRow);
}

/**
 * Create a new room
 */
export async function createRoom(
  tenantId: string,
  name: string,
  roomType: RoomType,
  options: {
    capacity?: number;
    equipment?: string[];
    locationId?: string;
    notes?: string;
  } = {}
): Promise<Room> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO rooms (id, tenant_id, name, room_type, capacity, equipment, location_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      tenantId,
      name,
      roomType,
      options.capacity || 1,
      JSON.stringify(options.equipment || []),
      options.locationId,
      options.notes,
    ]
  );

  return mapRoomRow(result.rows[0]);
}

/**
 * Schedule a room for an appointment or other purpose
 */
export async function scheduleRoom(
  roomId: string,
  startTime: string,
  endTime: string,
  options: {
    appointmentId?: string;
    reservedBy?: string;
    purpose?: string;
    notes?: string;
  } = {}
): Promise<RoomSchedule> {
  logger.info('Scheduling room', { roomId, startTime, endTime });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO room_schedules (id, room_id, appointment_id, start_time, end_time, reserved_by, purpose, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, roomId, options.appointmentId, startTime, endTime, options.reservedBy, options.purpose, options.notes]
  );

  return mapRoomScheduleRow(result.rows[0]);
}

/**
 * Check room availability for a time range
 */
export async function checkRoomAvailability(
  tenantId: string,
  startTime: string,
  endTime: string,
  options: {
    roomType?: RoomType;
    locationId?: string;
    requiredEquipment?: string[];
  } = {}
): Promise<Room[]> {
  let query = `
    SELECT r.* FROM rooms r
    WHERE r.tenant_id = $1
      AND r.status = 'available'
      AND r.id NOT IN (
        SELECT rs.room_id FROM room_schedules rs
        WHERE rs.status NOT IN ('cancelled', 'completed')
          AND tstzrange(rs.start_time, rs.end_time) && tstzrange($2::timestamptz, $3::timestamptz)
      )
  `;
  const params: any[] = [tenantId, startTime, endTime];
  let paramIndex = 4;

  if (options.roomType) {
    query += ` AND r.room_type = $${paramIndex++}`;
    params.push(options.roomType);
  }

  if (options.locationId) {
    query += ` AND r.location_id = $${paramIndex++}`;
    params.push(options.locationId);
  }

  if (options.requiredEquipment && options.requiredEquipment.length > 0) {
    query += ` AND r.equipment @> $${paramIndex++}::jsonb`;
    params.push(JSON.stringify(options.requiredEquipment));
  }

  query += ` ORDER BY r.name`;

  const result = await pool.query(query, params);
  return result.rows.map(mapRoomRow);
}

/**
 * Get room schedules
 */
export async function getRoomSchedules(
  roomId: string,
  startDate: string,
  endDate: string
): Promise<RoomSchedule[]> {
  const result = await pool.query(
    `SELECT * FROM room_schedules
     WHERE room_id = $1
       AND start_time >= $2
       AND end_time <= $3
       AND status NOT IN ('cancelled')
     ORDER BY start_time`,
    [roomId, startDate, endDate]
  );

  return result.rows.map(mapRoomScheduleRow);
}

// =====================================================
// CREDENTIAL MANAGEMENT
// =====================================================

/**
 * Track a staff credential
 */
export async function trackCredential(
  tenantId: string,
  staffId: string,
  credentialType: CredentialType,
  data: {
    credentialNumber?: string;
    issuingAuthority?: string;
    issuingState?: string;
    issueDate?: string;
    expirationDate?: string;
    documentUrl?: string;
    notes?: string;
  }
): Promise<StaffCredential> {
  logger.info('Tracking credential', { tenantId, staffId, credentialType });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO staff_credentials
     (id, tenant_id, staff_id, credential_type, credential_number, issuing_authority, issuing_state, issue_date, expiration_date, document_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      id,
      tenantId,
      staffId,
      credentialType,
      data.credentialNumber,
      data.issuingAuthority,
      data.issuingState,
      data.issueDate,
      data.expirationDate,
      data.documentUrl,
      data.notes,
    ]
  );

  return mapCredentialRow(result.rows[0]);
}

/**
 * Get credentials for a staff member or all staff
 */
export async function getCredentials(
  tenantId: string,
  options: {
    staffId?: string;
    credentialType?: CredentialType;
    verified?: boolean;
  } = {}
): Promise<StaffCredential[]> {
  let query = `SELECT * FROM staff_credentials WHERE tenant_id = $1`;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND staff_id = $${paramIndex++}`;
    params.push(options.staffId);
  }

  if (options.credentialType) {
    query += ` AND credential_type = $${paramIndex++}`;
    params.push(options.credentialType);
  }

  if (options.verified !== undefined) {
    query += ` AND verified = $${paramIndex++}`;
    params.push(options.verified);
  }

  query += ` ORDER BY expiration_date ASC NULLS LAST`;

  const result = await pool.query(query, params);
  return result.rows.map(mapCredentialRow);
}

/**
 * Alert on credentials expiring within a specified number of days
 */
export async function alertExpiringCredentials(
  tenantId: string,
  daysUntilExpiration: number = 30
): Promise<StaffCredential[]> {
  const result = await pool.query(
    `SELECT sc.*, u.first_name, u.last_name, u.email
     FROM staff_credentials sc
     JOIN users u ON u.id = sc.staff_id
     WHERE sc.tenant_id = $1
       AND sc.expiration_date IS NOT NULL
       AND sc.expiration_date <= CURRENT_DATE + INTERVAL '1 day' * $2
       AND sc.expiration_date >= CURRENT_DATE
     ORDER BY sc.expiration_date ASC`,
    [tenantId, daysUntilExpiration]
  );

  logger.info('Found expiring credentials', {
    tenantId,
    count: result.rows.length,
    daysUntilExpiration,
  });

  return result.rows.map(mapCredentialRow);
}

/**
 * Verify a credential
 */
export async function verifyCredential(
  credentialId: string,
  verifiedBy: string
): Promise<StaffCredential | null> {
  const result = await pool.query(
    `UPDATE staff_credentials
     SET verified = TRUE, verification_date = NOW(), verified_by = $1
     WHERE id = $2
     RETURNING *`,
    [verifiedBy, credentialId]
  );

  if (result.rows.length === 0) return null;
  return mapCredentialRow(result.rows[0]);
}

// =====================================================
// TRAINING MANAGEMENT
// =====================================================

/**
 * Get training requirements
 */
export async function getTrainingRequirements(
  tenantId: string,
  role?: string
): Promise<TrainingRequirement[]> {
  let query = `SELECT * FROM training_requirements WHERE tenant_id = $1`;
  const params: any[] = [tenantId];

  if (role) {
    query += ` AND (role = $2 OR role = 'all')`;
    params.push(role);
  }

  query += ` ORDER BY required DESC, training_name`;

  const result = await pool.query(query, params);
  return result.rows.map(mapTrainingRequirementRow);
}

/**
 * Create a training requirement
 */
export async function createTrainingRequirement(
  tenantId: string,
  role: string,
  trainingName: string,
  options: {
    description?: string;
    required?: boolean;
    frequencyMonths?: number;
    category?: string;
    passingScore?: number;
  } = {}
): Promise<TrainingRequirement> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO training_requirements
     (id, tenant_id, role, training_name, description, required, frequency_months, category, passing_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      tenantId,
      role,
      trainingName,
      options.description,
      options.required ?? true,
      options.frequencyMonths,
      options.category,
      options.passingScore,
    ]
  );

  return mapTrainingRequirementRow(result.rows[0]);
}

/**
 * Record training completion
 */
export async function recordTrainingCompletion(
  staffId: string,
  trainingId: string,
  completedDate: string,
  options: {
    expirationDate?: string;
    score?: number;
    certificateUrl?: string;
    notes?: string;
  } = {}
): Promise<StaffTrainingRecord> {
  logger.info('Recording training completion', { staffId, trainingId });

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO staff_training_records
     (id, staff_id, training_id, completed_date, expiration_date, score, certificate_url, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')
     RETURNING *`,
    [
      id,
      staffId,
      trainingId,
      completedDate,
      options.expirationDate,
      options.score,
      options.certificateUrl,
      options.notes,
    ]
  );

  return mapTrainingRecordRow(result.rows[0]);
}

/**
 * Track training compliance for staff
 */
export async function trackTrainingCompliance(
  tenantId: string,
  staffId?: string
): Promise<{
  staffId: string;
  staffName: string;
  totalRequired: number;
  completed: number;
  overdue: number;
  expiringSoon: number;
}[]> {
  let query = `
    WITH staff_requirements AS (
      SELECT
        u.id as staff_id,
        u.first_name || ' ' || u.last_name as staff_name,
        u.role,
        tr.id as training_id,
        tr.training_name,
        tr.required,
        tr.frequency_months
      FROM users u
      CROSS JOIN training_requirements tr
      WHERE u.tenant_id = $1
        AND tr.tenant_id = $1
        AND (tr.role = u.role OR tr.role = 'all')
        AND tr.required = TRUE
    ),
    completion_status AS (
      SELECT
        sr.staff_id,
        sr.staff_name,
        sr.training_id,
        str.completed_date,
        str.expiration_date,
        str.status,
        CASE
          WHEN str.id IS NULL THEN 'missing'
          WHEN str.expiration_date < CURRENT_DATE THEN 'expired'
          WHEN str.expiration_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
          ELSE 'current'
        END as compliance_status
      FROM staff_requirements sr
      LEFT JOIN staff_training_records str ON str.staff_id = sr.staff_id
        AND str.training_id = sr.training_id
        AND str.status = 'completed'
    )
    SELECT
      staff_id,
      staff_name,
      COUNT(*) as total_required,
      COUNT(CASE WHEN compliance_status = 'current' OR compliance_status = 'expiring_soon' THEN 1 END) as completed,
      COUNT(CASE WHEN compliance_status IN ('missing', 'expired') THEN 1 END) as overdue,
      COUNT(CASE WHEN compliance_status = 'expiring_soon' THEN 1 END) as expiring_soon
    FROM completion_status
  `;

  const params: any[] = [tenantId];

  if (staffId) {
    query += ` WHERE staff_id = $2`;
    params.push(staffId);
  }

  query += ` GROUP BY staff_id, staff_name ORDER BY overdue DESC, staff_name`;

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    staffId: row.staff_id,
    staffName: row.staff_name,
    totalRequired: parseInt(row.total_required),
    completed: parseInt(row.completed),
    overdue: parseInt(row.overdue),
    expiringSoon: parseInt(row.expiring_soon),
  }));
}

// =====================================================
// OVERTIME MANAGEMENT
// =====================================================

/**
 * Check overtime risk for staff
 */
export async function checkOvertimeRisk(
  tenantId: string,
  threshold: number = 40,
  warningThreshold: number = 36
): Promise<OvertimeAlert[]> {
  // Calculate week start (Monday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStart = monday.toISOString().split('T')[0];

  // Calculate hours worked this week
  const hoursQuery = await pool.query(
    `SELECT
      ss.staff_id,
      SUM(
        EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600
      ) as hours_worked
     FROM staff_schedules ss
     WHERE ss.tenant_id = $1
       AND ss.schedule_date >= $2
       AND ss.schedule_date <= $2::date + INTERVAL '6 days'
       AND ss.status NOT IN ('cancelled')
     GROUP BY ss.staff_id
     HAVING SUM(EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600) >= $3`,
    [tenantId, weekStart, warningThreshold]
  );

  const alerts: OvertimeAlert[] = [];

  for (const row of hoursQuery.rows) {
    const hoursWorked = parseFloat(row.hours_worked);
    const alertType = hoursWorked >= threshold ? 'exceeded' : 'approaching';

    // Check if alert already sent this week
    const existingAlert = await pool.query(
      `SELECT id FROM overtime_alerts
       WHERE tenant_id = $1 AND staff_id = $2 AND week_start = $3 AND alert_type = $4`,
      [tenantId, row.staff_id, weekStart, alertType]
    );

    if (existingAlert.rows.length === 0) {
      // Create new alert
      const alertId = crypto.randomUUID();
      const alertResult = await pool.query(
        `INSERT INTO overtime_alerts
         (id, tenant_id, staff_id, week_start, hours_worked, threshold, alert_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [alertId, tenantId, row.staff_id, weekStart, hoursWorked, threshold, alertType]
      );

      alerts.push(mapOvertimeAlertRow(alertResult.rows[0]));
    }
  }

  logger.info('Overtime risk check completed', {
    tenantId,
    weekStart,
    alertsGenerated: alerts.length,
  });

  return alerts;
}

/**
 * Get overtime alerts
 */
export async function getOvertimeAlerts(
  tenantId: string,
  options: {
    staffId?: string;
    weekStart?: string;
    acknowledged?: boolean;
  } = {}
): Promise<OvertimeAlert[]> {
  let query = `
    SELECT oa.*, u.first_name, u.last_name
    FROM overtime_alerts oa
    JOIN users u ON u.id = oa.staff_id
    WHERE oa.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND oa.staff_id = $${paramIndex++}`;
    params.push(options.staffId);
  }

  if (options.weekStart) {
    query += ` AND oa.week_start = $${paramIndex++}`;
    params.push(options.weekStart);
  }

  if (options.acknowledged !== undefined) {
    if (options.acknowledged) {
      query += ` AND oa.acknowledged_at IS NOT NULL`;
    } else {
      query += ` AND oa.acknowledged_at IS NULL`;
    }
  }

  query += ` ORDER BY oa.alert_sent_at DESC`;

  const result = await pool.query(query, params);
  return result.rows.map(mapOvertimeAlertRow);
}

// =====================================================
// PRODUCTIVITY METRICS
// =====================================================

/**
 * Get productivity metrics for staff
 */
export async function getProductivityMetrics(
  tenantId: string,
  options: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<ProductivityMetrics[]> {
  let query = `
    SELECT
      spm.*,
      u.first_name || ' ' || u.last_name as staff_name
    FROM staff_productivity_metrics spm
    JOIN users u ON u.id = spm.staff_id
    WHERE spm.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options.staffId) {
    query += ` AND spm.staff_id = $${paramIndex++}`;
    params.push(options.staffId);
  }

  if (options.startDate) {
    query += ` AND spm.metric_date >= $${paramIndex++}`;
    params.push(options.startDate);
  }

  if (options.endDate) {
    query += ` AND spm.metric_date <= $${paramIndex++}`;
    params.push(options.endDate);
  }

  query += ` ORDER BY spm.metric_date DESC, staff_name`;

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    staffId: row.staff_id,
    staffName: row.staff_name,
    metricDate: row.metric_date,
    scheduledHours: parseFloat(row.scheduled_hours) || 0,
    workedHours: parseFloat(row.worked_hours) || 0,
    patientEncounters: parseInt(row.patient_encounters) || 0,
    proceduresPerformed: parseInt(row.procedures_performed) || 0,
    rvuTotal: parseFloat(row.rvu_total) || 0,
    utilizationPercent: parseFloat(row.utilization_percent) || 0,
  }));
}

/**
 * Calculate and store productivity metrics for a date
 */
export async function calculateProductivityMetrics(
  tenantId: string,
  staffId: string,
  metricDate: string
): Promise<ProductivityMetrics> {
  const client = await pool.connect();

  try {
    // Get scheduled hours
    const scheduledResult = await client.query(
      `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as hours
       FROM staff_schedules
       WHERE tenant_id = $1 AND staff_id = $2 AND schedule_date = $3 AND status != 'cancelled'`,
      [tenantId, staffId, metricDate]
    );
    const scheduledHours = parseFloat(scheduledResult.rows[0]?.hours) || 0;

    // Get patient encounters
    const encountersResult = await client.query(
      `SELECT COUNT(*) as count
       FROM encounters
       WHERE tenant_id = $1 AND provider_id = $2 AND DATE(start_time) = $3`,
      [tenantId, staffId, metricDate]
    );
    const patientEncounters = parseInt(encountersResult.rows[0]?.count) || 0;

    // Get procedures performed (from charges)
    const proceduresResult = await client.query(
      `SELECT COUNT(*) as count
       FROM charges c
       JOIN encounters e ON e.id = c.encounter_id
       WHERE e.tenant_id = $1 AND e.provider_id = $2 AND DATE(e.start_time) = $3`,
      [tenantId, staffId, metricDate]
    );
    const proceduresPerformed = parseInt(proceduresResult.rows[0]?.count) || 0;

    // Calculate RVUs (simplified - would need actual RVU values)
    const rvuResult = await client.query(
      `SELECT COALESCE(SUM(fs.work_rvu), 0) as total_rvu
       FROM charges c
       JOIN encounters e ON e.id = c.encounter_id
       LEFT JOIN fee_schedules fs ON fs.cpt_code = c.cpt_code AND fs.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.provider_id = $2 AND DATE(e.start_time) = $3`,
      [tenantId, staffId, metricDate]
    );
    const rvuTotal = parseFloat(rvuResult.rows[0]?.total_rvu) || 0;

    // Estimate worked hours based on encounters
    const workedHours = Math.min(patientEncounters * 0.5, scheduledHours) || scheduledHours;

    // Calculate utilization
    const utilizationPercent = scheduledHours > 0 ? (workedHours / scheduledHours) * 100 : 0;

    // Upsert metrics
    const result = await client.query(
      `INSERT INTO staff_productivity_metrics
       (id, tenant_id, staff_id, metric_date, scheduled_hours, worked_hours, patient_encounters, procedures_performed, rvu_total, utilization_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, staff_id, metric_date)
       DO UPDATE SET
         scheduled_hours = $5,
         worked_hours = $6,
         patient_encounters = $7,
         procedures_performed = $8,
         rvu_total = $9,
         utilization_percent = $10,
         updated_at = NOW()
       RETURNING *`,
      [
        crypto.randomUUID(),
        tenantId,
        staffId,
        metricDate,
        scheduledHours,
        workedHours,
        patientEncounters,
        proceduresPerformed,
        rvuTotal,
        utilizationPercent,
      ]
    );

    return {
      staffId,
      metricDate,
      scheduledHours,
      workedHours,
      patientEncounters,
      proceduresPerformed,
      rvuTotal,
      utilizationPercent,
    };
  } finally {
    client.release();
  }
}

// =====================================================
// DASHBOARD
// =====================================================

/**
 * Get scheduling dashboard overview
 */
export async function getSchedulingDashboard(tenantId: string): Promise<SchedulingDashboard> {
  const today = new Date().toISOString().split('T')[0];

  // Get today's schedules
  const schedulesResult = await pool.query(
    `SELECT ss.*, u.first_name, u.last_name
     FROM staff_schedules ss
     JOIN users u ON u.id = ss.staff_id
     WHERE ss.tenant_id = $1 AND ss.schedule_date = $2
     ORDER BY ss.start_time`,
    [tenantId, today]
  );

  // Get pending swap requests count
  const swapResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM shift_swap_requests ssr
     JOIN staff_schedules ss ON ss.id = ssr.original_schedule_id
     WHERE ss.tenant_id = $1 AND ssr.status = 'pending'`,
    [tenantId]
  );

  // Get pending PTO requests count
  const ptoResult = await pool.query(
    `SELECT COUNT(*) as count FROM pto_requests WHERE tenant_id = $1 AND status = 'pending'`,
    [tenantId]
  );

  // Get room counts
  const roomsResult = await pool.query(
    `SELECT
       COUNT(CASE WHEN status = 'available' THEN 1 END) as available,
       COUNT(CASE WHEN status = 'occupied' THEN 1 END) as occupied
     FROM rooms WHERE tenant_id = $1`,
    [tenantId]
  );

  // Get expiring credentials count (within 30 days)
  const credentialsResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM staff_credentials
     WHERE tenant_id = $1
       AND expiration_date IS NOT NULL
       AND expiration_date <= CURRENT_DATE + INTERVAL '30 days'
       AND expiration_date >= CURRENT_DATE`,
    [tenantId]
  );

  // Get overdue training count
  const trainingResult = await pool.query(
    `SELECT COUNT(DISTINCT str.staff_id) as count
     FROM staff_training_records str
     WHERE str.status = 'completed'
       AND str.expiration_date < CURRENT_DATE`,
    []
  );

  // Get overtime risks count
  const overtimeResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM overtime_alerts
     WHERE tenant_id = $1
       AND acknowledged_at IS NULL
       AND week_start >= CURRENT_DATE - INTERVAL '7 days'`,
    [tenantId]
  );

  return {
    todaySchedules: schedulesResult.rows.map((row) => ({
      ...mapScheduleRow(row),
      staffName: `${row.first_name} ${row.last_name}`,
    })),
    pendingSwapRequests: parseInt(swapResult.rows[0]?.count) || 0,
    pendingPTORequests: parseInt(ptoResult.rows[0]?.count) || 0,
    roomsAvailable: parseInt(roomsResult.rows[0]?.available) || 0,
    roomsOccupied: parseInt(roomsResult.rows[0]?.occupied) || 0,
    expiringCredentials: parseInt(credentialsResult.rows[0]?.count) || 0,
    overdueTraining: parseInt(trainingResult.rows[0]?.count) || 0,
    overtimeRisks: parseInt(overtimeResult.rows[0]?.count) || 0,
  };
}

// =====================================================
// AUTOMATION FUNCTIONS
// =====================================================

/**
 * Daily credential expiration check automation
 */
export async function runDailyCredentialCheck(tenantId: string): Promise<void> {
  logger.info('Running daily credential expiration check', { tenantId });

  const expiringCredentials = await alertExpiringCredentials(tenantId, 30);

  for (const credential of expiringCredentials) {
    // In production, this would send notifications
    logger.warn('Credential expiring soon', {
      credentialId: credential.id,
      staffId: credential.staffId,
      credentialType: credential.credentialType,
      expirationDate: credential.expirationDate,
    });
  }

  logger.info('Daily credential check completed', {
    tenantId,
    expiringCount: expiringCredentials.length,
  });
}

/**
 * Weekly overtime risk calculation automation
 */
export async function runWeeklyOvertimeCheck(tenantId: string): Promise<void> {
  logger.info('Running weekly overtime risk check', { tenantId });

  const alerts = await checkOvertimeRisk(tenantId, 40, 36);

  for (const alert of alerts) {
    // In production, this would send notifications
    logger.warn('Overtime risk detected', {
      alertId: alert.id,
      staffId: alert.staffId,
      hoursWorked: alert.hoursWorked,
      alertType: alert.alertType,
    });
  }

  logger.info('Weekly overtime check completed', {
    tenantId,
    alertsGenerated: alerts.length,
  });
}

/**
 * Monthly training compliance report automation
 */
export async function runMonthlyTrainingReport(tenantId: string): Promise<{
  totalStaff: number;
  fullyCompliant: number;
  withOverdue: number;
  details: any[];
}> {
  logger.info('Running monthly training compliance report', { tenantId });

  const compliance = await trackTrainingCompliance(tenantId);

  const fullyCompliant = compliance.filter((c) => c.overdue === 0).length;
  const withOverdue = compliance.filter((c) => c.overdue > 0).length;

  const report = {
    totalStaff: compliance.length,
    fullyCompliant,
    withOverdue,
    details: compliance,
  };

  logger.info('Monthly training report completed', {
    tenantId,
    ...report,
  });

  return report;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function mapScheduleRow(row: any): StaffSchedule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffId: row.staff_id,
    scheduleDate: row.schedule_date,
    startTime: row.start_time,
    endTime: row.end_time,
    shiftType: row.shift_type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapSwapRequestRow(row: any): ShiftSwapRequest {
  return {
    id: row.id,
    originalScheduleId: row.original_schedule_id,
    requestingStaffId: row.requesting_staff_id,
    targetStaffId: row.target_staff_id,
    status: row.status,
    reason: row.reason,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
  };
}

function mapPTORequestRow(row: any): PTORequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffId: row.staff_id,
    requestType: row.request_type,
    startDate: row.start_date,
    endDate: row.end_date,
    hours: parseFloat(row.hours),
    status: row.status,
    reason: row.reason,
    approvedBy: row.approved_by,
    requestedAt: row.requested_at,
  };
}

function mapPTOBalanceRow(row: any): PTOBalance {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffId: row.staff_id,
    ptoType: row.pto_type,
    balanceHours: parseFloat(row.balance_hours),
    accruedYtd: parseFloat(row.accrued_ytd),
    usedYtd: parseFloat(row.used_ytd),
    year: row.year,
  };
}

function mapRoomRow(row: any): Room {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    roomType: row.room_type,
    capacity: row.capacity,
    equipment: row.equipment || [],
    status: row.status,
    locationId: row.location_id,
  };
}

function mapRoomScheduleRow(row: any): RoomSchedule {
  return {
    id: row.id,
    roomId: row.room_id,
    appointmentId: row.appointment_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    purpose: row.purpose,
  };
}

function mapCredentialRow(row: any): StaffCredential {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffId: row.staff_id,
    credentialType: row.credential_type,
    credentialNumber: row.credential_number,
    issuingAuthority: row.issuing_authority,
    issuingState: row.issuing_state,
    issueDate: row.issue_date,
    expirationDate: row.expiration_date,
    verified: row.verified,
    verificationDate: row.verification_date,
    documentUrl: row.document_url,
  };
}

function mapTrainingRequirementRow(row: any): TrainingRequirement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    role: row.role,
    trainingName: row.training_name,
    description: row.description,
    required: row.required,
    frequencyMonths: row.frequency_months,
    category: row.category,
  };
}

function mapTrainingRecordRow(row: any): StaffTrainingRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    trainingId: row.training_id,
    completedDate: row.completed_date,
    expirationDate: row.expiration_date,
    score: row.score,
    certificateUrl: row.certificate_url,
    status: row.status,
  };
}

function mapOvertimeAlertRow(row: any): OvertimeAlert {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffId: row.staff_id,
    weekStart: row.week_start,
    hoursWorked: parseFloat(row.hours_worked),
    threshold: parseFloat(row.threshold),
    alertType: row.alert_type,
    alertSentAt: row.alert_sent_at,
  };
}

// Export the service as an object for easy imports
export const staffSchedulingService = {
  // Schedule management
  createSchedule,
  getSchedules,
  updateScheduleStatus,

  // Shift swaps
  requestShiftSwap,
  getShiftSwapRequests,
  resolveShiftSwap,

  // PTO
  requestPTO,
  getPTORequests,
  resolvePTORequest,
  getPTOBalance,
  upsertPTOBalance,

  // Rooms
  getRooms,
  createRoom,
  scheduleRoom,
  checkRoomAvailability,
  getRoomSchedules,

  // Credentials
  trackCredential,
  getCredentials,
  alertExpiringCredentials,
  verifyCredential,

  // Training
  getTrainingRequirements,
  createTrainingRequirement,
  recordTrainingCompletion,
  trackTrainingCompliance,

  // Overtime
  checkOvertimeRisk,
  getOvertimeAlerts,

  // Productivity
  getProductivityMetrics,
  calculateProductivityMetrics,

  // Dashboard
  getSchedulingDashboard,

  // Automation
  runDailyCredentialCheck,
  runWeeklyOvertimeCheck,
  runMonthlyTrainingReport,
};
