import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { getIO } from '../websocket';
import crypto from 'crypto';

// ============================================
// TYPES & INTERFACES
// ============================================

export type FlowStatus =
  | 'checked_in'
  | 'rooming'
  | 'vitals_complete'
  | 'ready_for_provider'
  | 'with_provider'
  | 'checkout'
  | 'completed';

export interface ExamRoom {
  id: string;
  tenantId: string;
  roomName: string;
  roomNumber: string;
  locationId: string;
  locationName?: string;
  roomType: 'exam' | 'procedure' | 'consult' | 'triage';
  isActive: boolean;
  displayOrder: number;
  equipment: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientFlow {
  id: string;
  tenantId: string;
  appointmentId: string;
  patientId: string;
  roomId?: string;
  status: FlowStatus;
  statusChangedAt: string;
  checkedInAt?: string;
  roomingAt?: string;
  vitalsCompleteAt?: string;
  readyForProviderAt?: string;
  withProviderAt?: string;
  checkoutAt?: string;
  completedAt?: string;
  assignedProviderId?: string;
  assignedMaId?: string;
  priority: 'normal' | 'urgent' | 'add-on';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomBoardEntry {
  room: ExamRoom;
  currentPatient?: {
    flowId: string;
    patientId: string;
    patientName: string;
    appointmentId: string;
    appointmentType: string;
    status: FlowStatus;
    statusChangedAt: string;
    waitTimeMinutes: number;
    providerName?: string;
    maName?: string;
    priority: string;
  };
  assignedProvider?: {
    id: string;
    name: string;
  };
}

export interface ProviderQueueEntry {
  flowId: string;
  patientId: string;
  patientName: string;
  appointmentId: string;
  appointmentType: string;
  scheduledTime: string;
  status: FlowStatus;
  roomNumber?: string;
  roomName?: string;
  waitTimeMinutes: number;
  priority: string;
}

export interface WaitTimeStats {
  locationId: string;
  locationName: string;
  avgCheckinToRooming: number | null;
  avgRoomingToVitals: number | null;
  avgVitalsToProvider: number | null;
  avgProviderToCheckout: number | null;
  avgTotalVisitTime: number | null;
  currentWaitingCount: number;
  currentWithProviderCount: number;
}

export interface FlowStatusHistory {
  id: string;
  flowId: string;
  fromStatus?: string;
  toStatus: string;
  changedBy?: string;
  changedByName?: string;
  changedAt: string;
  notes?: string;
  durationSeconds?: number;
}

// ============================================
// PATIENT FLOW SERVICE CLASS
// ============================================

export class PatientFlowService {
  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  /**
   * Get all exam rooms for a location
   */
  async getRooms(tenantId: string, locationId?: string): Promise<ExamRoom[]> {
    try {
      let query = `
        SELECT
          r.id,
          r.tenant_id,
          r.room_name,
          r.room_number,
          r.location_id,
          l.name as location_name,
          r.room_type,
          r.is_active,
          r.display_order,
          r.equipment,
          r.notes,
          r.created_at,
          r.updated_at
        FROM exam_rooms r
        INNER JOIN locations l ON r.location_id = l.id
        WHERE r.tenant_id = $1
      `;

      const params: (string | undefined)[] = [tenantId];

      if (locationId) {
        query += ` AND r.location_id = $2`;
        params.push(locationId);
      }

      query += ` ORDER BY r.display_order ASC, r.room_number ASC`;

      const result = await pool.query(query, params);

      return result.rows.map((row) => this.mapRowToExamRoom(row));
    } catch (error) {
      logger.error('Error getting rooms:', error);
      throw error;
    }
  }

  /**
   * Create a new exam room
   */
  async createRoom(
    tenantId: string,
    data: {
      roomName: string;
      roomNumber: string;
      locationId: string;
      roomType?: string;
      equipment?: string[];
      notes?: string;
      displayOrder?: number;
    }
  ): Promise<ExamRoom> {
    try {
      const id = crypto.randomUUID();

      const result = await pool.query(
        `
        INSERT INTO exam_rooms (
          id, tenant_id, room_name, room_number, location_id,
          room_type, equipment, notes, display_order, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        RETURNING *
        `,
        [
          id,
          tenantId,
          data.roomName,
          data.roomNumber,
          data.locationId,
          data.roomType || 'exam',
          data.equipment || [],
          data.notes,
          data.displayOrder || 0,
        ]
      );

      return this.mapRowToExamRoom(result.rows[0]);
    } catch (error) {
      logger.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Update an exam room
   */
  async updateRoom(
    tenantId: string,
    roomId: string,
    data: Partial<{
      roomName: string;
      roomNumber: string;
      roomType: string;
      isActive: boolean;
      equipment: string[];
      notes: string;
      displayOrder: number;
    }>
  ): Promise<ExamRoom> {
    try {
      const updates: string[] = ['updated_at = NOW()'];
      const params: (string | boolean | string[] | number)[] = [tenantId, roomId];
      let paramCount = 2;

      if (data.roomName !== undefined) {
        paramCount++;
        updates.push(`room_name = $${paramCount}`);
        params.push(data.roomName);
      }
      if (data.roomNumber !== undefined) {
        paramCount++;
        updates.push(`room_number = $${paramCount}`);
        params.push(data.roomNumber);
      }
      if (data.roomType !== undefined) {
        paramCount++;
        updates.push(`room_type = $${paramCount}`);
        params.push(data.roomType);
      }
      if (data.isActive !== undefined) {
        paramCount++;
        updates.push(`is_active = $${paramCount}`);
        params.push(data.isActive);
      }
      if (data.equipment !== undefined) {
        paramCount++;
        updates.push(`equipment = $${paramCount}`);
        params.push(data.equipment);
      }
      if (data.notes !== undefined) {
        paramCount++;
        updates.push(`notes = $${paramCount}`);
        params.push(data.notes);
      }
      if (data.displayOrder !== undefined) {
        paramCount++;
        updates.push(`display_order = $${paramCount}`);
        params.push(data.displayOrder);
      }

      const result = await pool.query(
        `
        UPDATE exam_rooms
        SET ${updates.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
        `,
        params
      );

      if (!result.rows[0]) {
        throw new Error('Room not found');
      }

      return this.mapRowToExamRoom(result.rows[0]);
    } catch (error) {
      logger.error('Error updating room:', error);
      throw error;
    }
  }

  // ============================================
  // PATIENT FLOW OPERATIONS
  // ============================================

  /**
   * Update patient status in the flow
   */
  async updatePatientStatus(
    tenantId: string,
    appointmentId: string,
    newStatus: FlowStatus,
    options?: {
      roomId?: string;
      userId?: string;
      notes?: string;
    }
  ): Promise<PatientFlow> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get or create patient flow record
      let flowResult = await client.query(
        `SELECT * FROM patient_flow WHERE tenant_id = $1 AND appointment_id = $2`,
        [tenantId, appointmentId]
      );

      let flow = flowResult.rows[0];
      const previousStatus = flow?.status;

      if (!flow) {
        // Get appointment details to create flow record
        const appointmentResult = await client.query(
          `SELECT patient_id, provider_id FROM appointments WHERE id = $1 AND tenant_id = $2`,
          [appointmentId, tenantId]
        );

        if (!appointmentResult.rows[0]) {
          throw new Error('Appointment not found');
        }

        const apt = appointmentResult.rows[0];
        const flowId = crypto.randomUUID();

        // Create new flow record
        flow = (
          await client.query(
            `
          INSERT INTO patient_flow (
            id, tenant_id, appointment_id, patient_id,
            status, status_changed_at, assigned_provider_id,
            room_id, notes
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
          RETURNING *
          `,
            [
              flowId,
              tenantId,
              appointmentId,
              apt.patient_id,
              newStatus,
              apt.provider_id,
              options?.roomId,
              options?.notes,
            ]
          )
        ).rows[0];
      } else {
        // Update existing flow record
        const timestampField = this.getTimestampField(newStatus);
        const updates = [
          'status = $3',
          'status_changed_at = NOW()',
          `${timestampField} = COALESCE(${timestampField}, NOW())`,
          'updated_at = NOW()',
        ];
        const params: (string | undefined)[] = [tenantId, appointmentId, newStatus];
        let paramCount = 3;

        if (options?.roomId !== undefined) {
          paramCount++;
          updates.push(`room_id = $${paramCount}`);
          params.push(options.roomId);
        }

        if (options?.notes !== undefined) {
          paramCount++;
          updates.push(`notes = $${paramCount}`);
          params.push(options.notes);
        }

        flow = (
          await client.query(
            `
          UPDATE patient_flow
          SET ${updates.join(', ')}
          WHERE tenant_id = $1 AND appointment_id = $2
          RETURNING *
          `,
            params
          )
        ).rows[0];
      }

      // Calculate duration in previous status
      let durationSeconds: number | undefined;
      if (previousStatus && flow.status_changed_at) {
        const now = new Date();
        const previousTime = new Date(flow.status_changed_at);
        durationSeconds = Math.floor((now.getTime() - previousTime.getTime()) / 1000);
      }

      // Record history
      await client.query(
        `
        INSERT INTO flow_status_history (
          id, tenant_id, flow_id, from_status, to_status,
          changed_by, changed_at, notes, room_id, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
        `,
        [
          crypto.randomUUID(),
          tenantId,
          flow.id,
          previousStatus,
          newStatus,
          options?.userId,
          options?.notes,
          options?.roomId || flow.room_id,
          durationSeconds,
        ]
      );

      // Also update the appointment status for consistency
      await client.query(
        `
        UPDATE appointments
        SET status = $3,
            roomed_at = CASE WHEN $3 IN ('rooming', 'vitals_complete', 'ready_for_provider', 'with_provider')
                             THEN COALESCE(roomed_at, NOW()) ELSE roomed_at END,
            completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END
        WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, appointmentId, this.mapFlowStatusToAppointmentStatus(newStatus)]
      );

      await client.query('COMMIT');

      // Emit WebSocket event for real-time updates
      this.emitFlowUpdate(tenantId, flow, previousStatus);

      return this.mapRowToPatientFlow(flow);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating patient status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get room status board for a location
   */
  async getRoomBoard(tenantId: string, locationId: string): Promise<RoomBoardEntry[]> {
    try {
      // Get all active rooms for the location
      const roomsResult = await pool.query(
        `
        SELECT
          r.id,
          r.tenant_id,
          r.room_name,
          r.room_number,
          r.location_id,
          l.name as location_name,
          r.room_type,
          r.is_active,
          r.display_order,
          r.equipment,
          r.notes,
          r.created_at,
          r.updated_at
        FROM exam_rooms r
        INNER JOIN locations l ON r.location_id = l.id
        WHERE r.tenant_id = $1
          AND r.location_id = $2
          AND r.is_active = TRUE
        ORDER BY r.display_order ASC, r.room_number ASC
        `,
        [tenantId, locationId]
      );

      // Get current patient flows for these rooms
      const flowsResult = await pool.query(
        `
        SELECT
          pf.id as flow_id,
          pf.room_id,
          pf.patient_id,
          p.first_name || ' ' || p.last_name as patient_name,
          pf.appointment_id,
          at.name as appointment_type,
          pf.status,
          pf.status_changed_at,
          pf.priority,
          pf.assigned_provider_id,
          prov.full_name as provider_name,
          pf.assigned_ma_id,
          u.full_name as ma_name,
          EXTRACT(EPOCH FROM (NOW() - pf.status_changed_at)) / 60 as wait_time_minutes
        FROM patient_flow pf
        INNER JOIN patients p ON pf.patient_id = p.id
        INNER JOIN appointments a ON pf.appointment_id = a.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        LEFT JOIN providers prov ON pf.assigned_provider_id = prov.id
        LEFT JOIN users u ON pf.assigned_ma_id = u.id
        WHERE pf.tenant_id = $1
          AND pf.room_id IN (SELECT id FROM exam_rooms WHERE location_id = $2)
          AND pf.status NOT IN ('completed', 'checkout')
          AND DATE(pf.created_at) = CURRENT_DATE
        `,
        [tenantId, locationId]
      );

      // Get room assignments for today
      const today = new Date().getDay();
      const assignmentsResult = await pool.query(
        `
        SELECT
          ra.room_id,
          ra.provider_id,
          prov.full_name as provider_name
        FROM room_assignments ra
        INNER JOIN providers prov ON ra.provider_id = prov.id
        WHERE ra.tenant_id = $1
          AND ra.day_of_week = $2
          AND ra.is_active = TRUE
          AND (ra.effective_date IS NULL OR ra.effective_date <= CURRENT_DATE)
          AND (ra.end_date IS NULL OR ra.end_date >= CURRENT_DATE)
        `,
        [tenantId, today]
      );

      // Build the room board
      const flowsByRoom = new Map<string, typeof flowsResult.rows[number]>();
      flowsResult.rows.forEach((flow) => {
        flowsByRoom.set(flow.room_id, flow);
      });

      const assignmentsByRoom = new Map<string, { id: string; name: string }>();
      assignmentsResult.rows.forEach((assignment) => {
        assignmentsByRoom.set(assignment.room_id, {
          id: assignment.provider_id,
          name: assignment.provider_name,
        });
      });

      const board: RoomBoardEntry[] = roomsResult.rows.map((room) => {
        const flow = flowsByRoom.get(room.id);
        const assignment = assignmentsByRoom.get(room.id);

        const entry: RoomBoardEntry = {
          room: this.mapRowToExamRoom(room),
          assignedProvider: assignment,
        };

        if (flow) {
          entry.currentPatient = {
            flowId: flow.flow_id,
            patientId: flow.patient_id,
            patientName: flow.patient_name,
            appointmentId: flow.appointment_id,
            appointmentType: flow.appointment_type,
            status: flow.status as FlowStatus,
            statusChangedAt: flow.status_changed_at,
            waitTimeMinutes: Math.floor(parseFloat(flow.wait_time_minutes)),
            providerName: flow.provider_name,
            maName: flow.ma_name,
            priority: flow.priority,
          };
        }

        return entry;
      });

      return board;
    } catch (error) {
      logger.error('Error getting room board:', error);
      throw error;
    }
  }

  /**
   * Get provider queue - patients waiting for or with a specific provider
   */
  async getProviderQueue(tenantId: string, providerId: string): Promise<ProviderQueueEntry[]> {
    try {
      const result = await pool.query(
        `
        SELECT
          pf.id as flow_id,
          pf.patient_id,
          p.first_name || ' ' || p.last_name as patient_name,
          pf.appointment_id,
          at.name as appointment_type,
          a.scheduled_start as scheduled_time,
          pf.status,
          pf.priority,
          r.room_number,
          r.room_name,
          EXTRACT(EPOCH FROM (NOW() - pf.status_changed_at)) / 60 as wait_time_minutes
        FROM patient_flow pf
        INNER JOIN patients p ON pf.patient_id = p.id
        INNER JOIN appointments a ON pf.appointment_id = a.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        LEFT JOIN exam_rooms r ON pf.room_id = r.id
        WHERE pf.tenant_id = $1
          AND pf.assigned_provider_id = $2
          AND pf.status IN ('vitals_complete', 'ready_for_provider', 'with_provider')
          AND DATE(pf.created_at) = CURRENT_DATE
        ORDER BY
          CASE pf.priority
            WHEN 'urgent' THEN 1
            WHEN 'add-on' THEN 2
            ELSE 3
          END,
          pf.ready_for_provider_at ASC NULLS LAST,
          a.scheduled_start ASC
        `,
        [tenantId, providerId]
      );

      return result.rows.map((row) => ({
        flowId: row.flow_id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        appointmentId: row.appointment_id,
        appointmentType: row.appointment_type,
        scheduledTime: row.scheduled_time,
        status: row.status as FlowStatus,
        roomNumber: row.room_number,
        roomName: row.room_name,
        waitTimeMinutes: Math.floor(parseFloat(row.wait_time_minutes)),
        priority: row.priority,
      }));
    } catch (error) {
      logger.error('Error getting provider queue:', error);
      throw error;
    }
  }

  /**
   * Get wait time statistics for a location
   */
  async getWaitTimes(tenantId: string, locationId?: string): Promise<WaitTimeStats[]> {
    try {
      const result = await pool.query(
        `
        WITH flow_times AS (
          SELECT
            l.id as location_id,
            l.name as location_name,
            pf.id as flow_id,
            EXTRACT(EPOCH FROM (pf.rooming_at - pf.checked_in_at)) / 60 as checkin_to_rooming,
            EXTRACT(EPOCH FROM (pf.vitals_complete_at - pf.rooming_at)) / 60 as rooming_to_vitals,
            EXTRACT(EPOCH FROM (pf.with_provider_at - pf.ready_for_provider_at)) / 60 as vitals_to_provider,
            EXTRACT(EPOCH FROM (pf.completed_at - pf.with_provider_at)) / 60 as provider_to_checkout,
            EXTRACT(EPOCH FROM (pf.completed_at - pf.checked_in_at)) / 60 as total_visit_time
          FROM patient_flow pf
          INNER JOIN appointments a ON pf.appointment_id = a.id
          INNER JOIN locations l ON a.location_id = l.id
          WHERE pf.tenant_id = $1
            AND DATE(pf.created_at) = CURRENT_DATE
            ${locationId ? 'AND l.id = $2' : ''}
        ),
        current_counts AS (
          SELECT
            l.id as location_id,
            COUNT(*) FILTER (WHERE pf.status IN ('checked_in', 'rooming', 'vitals_complete', 'ready_for_provider')) as waiting_count,
            COUNT(*) FILTER (WHERE pf.status = 'with_provider') as with_provider_count
          FROM patient_flow pf
          INNER JOIN appointments a ON pf.appointment_id = a.id
          INNER JOIN locations l ON a.location_id = l.id
          WHERE pf.tenant_id = $1
            AND pf.status NOT IN ('completed', 'checkout')
            AND DATE(pf.created_at) = CURRENT_DATE
            ${locationId ? 'AND l.id = $2' : ''}
          GROUP BY l.id
        )
        SELECT
          ft.location_id,
          ft.location_name,
          ROUND(AVG(ft.checkin_to_rooming)::numeric, 1) as avg_checkin_to_rooming,
          ROUND(AVG(ft.rooming_to_vitals)::numeric, 1) as avg_rooming_to_vitals,
          ROUND(AVG(ft.vitals_to_provider)::numeric, 1) as avg_vitals_to_provider,
          ROUND(AVG(ft.provider_to_checkout)::numeric, 1) as avg_provider_to_checkout,
          ROUND(AVG(ft.total_visit_time)::numeric, 1) as avg_total_visit_time,
          COALESCE(cc.waiting_count, 0) as current_waiting_count,
          COALESCE(cc.with_provider_count, 0) as current_with_provider_count
        FROM flow_times ft
        LEFT JOIN current_counts cc ON ft.location_id = cc.location_id
        GROUP BY ft.location_id, ft.location_name, cc.waiting_count, cc.with_provider_count
        `,
        locationId ? [tenantId, locationId] : [tenantId]
      );

      return result.rows.map((row) => ({
        locationId: row.location_id,
        locationName: row.location_name,
        avgCheckinToRooming: row.avg_checkin_to_rooming ? parseFloat(row.avg_checkin_to_rooming) : null,
        avgRoomingToVitals: row.avg_rooming_to_vitals ? parseFloat(row.avg_rooming_to_vitals) : null,
        avgVitalsToProvider: row.avg_vitals_to_provider ? parseFloat(row.avg_vitals_to_provider) : null,
        avgProviderToCheckout: row.avg_provider_to_checkout ? parseFloat(row.avg_provider_to_checkout) : null,
        avgTotalVisitTime: row.avg_total_visit_time ? parseFloat(row.avg_total_visit_time) : null,
        currentWaitingCount: parseInt(row.current_waiting_count),
        currentWithProviderCount: parseInt(row.current_with_provider_count),
      }));
    } catch (error) {
      logger.error('Error getting wait times:', error);
      throw error;
    }
  }

  /**
   * Get flow history for an appointment
   */
  async getFlowHistory(tenantId: string, appointmentId: string): Promise<FlowStatusHistory[]> {
    try {
      const result = await pool.query(
        `
        SELECT
          fsh.id,
          fsh.flow_id,
          fsh.from_status,
          fsh.to_status,
          fsh.changed_by,
          u.full_name as changed_by_name,
          fsh.changed_at,
          fsh.notes,
          fsh.duration_seconds
        FROM flow_status_history fsh
        INNER JOIN patient_flow pf ON fsh.flow_id = pf.id
        LEFT JOIN users u ON fsh.changed_by = u.id
        WHERE pf.tenant_id = $1
          AND pf.appointment_id = $2
        ORDER BY fsh.changed_at ASC
        `,
        [tenantId, appointmentId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        flowId: row.flow_id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        changedBy: row.changed_by,
        changedByName: row.changed_by_name,
        changedAt: row.changed_at,
        notes: row.notes,
        durationSeconds: row.duration_seconds ? parseInt(row.duration_seconds) : undefined,
      }));
    } catch (error) {
      logger.error('Error getting flow history:', error);
      throw error;
    }
  }

  /**
   * Get all active patient flows for today
   */
  async getActiveFlows(tenantId: string, locationId?: string): Promise<PatientFlow[]> {
    try {
      let query = `
        SELECT pf.*
        FROM patient_flow pf
        INNER JOIN appointments a ON pf.appointment_id = a.id
        WHERE pf.tenant_id = $1
          AND pf.status NOT IN ('completed')
          AND DATE(pf.created_at) = CURRENT_DATE
      `;

      const params: string[] = [tenantId];

      if (locationId) {
        query += ` AND a.location_id = $2`;
        params.push(locationId);
      }

      query += ` ORDER BY pf.created_at ASC`;

      const result = await pool.query(query, params);

      return result.rows.map((row) => this.mapRowToPatientFlow(row));
    } catch (error) {
      logger.error('Error getting active flows:', error);
      throw error;
    }
  }

  // ============================================
  // ROOM ASSIGNMENTS
  // ============================================

  /**
   * Set room assignment for a provider
   */
  async setRoomAssignment(
    tenantId: string,
    roomId: string,
    providerId: string,
    dayOfWeek: number,
    timeSlot?: string
  ): Promise<void> {
    try {
      await pool.query(
        `
        INSERT INTO room_assignments (
          id, tenant_id, room_id, provider_id, day_of_week, time_slot, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT (tenant_id, room_id, day_of_week, time_slot, effective_date)
        DO UPDATE SET
          provider_id = EXCLUDED.provider_id,
          is_active = TRUE,
          updated_at = NOW()
        `,
        [crypto.randomUUID(), tenantId, roomId, providerId, dayOfWeek, timeSlot || 'all_day']
      );
    } catch (error) {
      logger.error('Error setting room assignment:', error);
      throw error;
    }
  }

  /**
   * Remove room assignment
   */
  async removeRoomAssignment(tenantId: string, roomId: string, dayOfWeek: number): Promise<void> {
    try {
      await pool.query(
        `
        UPDATE room_assignments
        SET is_active = FALSE, updated_at = NOW()
        WHERE tenant_id = $1 AND room_id = $2 AND day_of_week = $3
        `,
        [tenantId, roomId, dayOfWeek]
      );
    } catch (error) {
      logger.error('Error removing room assignment:', error);
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getTimestampField(status: FlowStatus): string {
    const mapping: Record<FlowStatus, string> = {
      checked_in: 'checked_in_at',
      rooming: 'rooming_at',
      vitals_complete: 'vitals_complete_at',
      ready_for_provider: 'ready_for_provider_at',
      with_provider: 'with_provider_at',
      checkout: 'checkout_at',
      completed: 'completed_at',
    };
    return mapping[status];
  }

  private mapFlowStatusToAppointmentStatus(status: FlowStatus): string {
    const mapping: Record<FlowStatus, string> = {
      checked_in: 'checked_in',
      rooming: 'in_room',
      vitals_complete: 'in_room',
      ready_for_provider: 'in_room',
      with_provider: 'with_provider',
      checkout: 'completed',
      completed: 'completed',
    };
    return mapping[status];
  }

  private mapRowToExamRoom(row: Record<string, unknown>): ExamRoom {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      roomName: row.room_name as string,
      roomNumber: row.room_number as string,
      locationId: row.location_id as string,
      locationName: row.location_name as string | undefined,
      roomType: row.room_type as ExamRoom['roomType'],
      isActive: row.is_active as boolean,
      displayOrder: row.display_order as number,
      equipment: (row.equipment as string[]) || [],
      notes: row.notes as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapRowToPatientFlow(row: Record<string, unknown>): PatientFlow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      appointmentId: row.appointment_id as string,
      patientId: row.patient_id as string,
      roomId: row.room_id as string | undefined,
      status: row.status as FlowStatus,
      statusChangedAt: row.status_changed_at as string,
      checkedInAt: row.checked_in_at as string | undefined,
      roomingAt: row.rooming_at as string | undefined,
      vitalsCompleteAt: row.vitals_complete_at as string | undefined,
      readyForProviderAt: row.ready_for_provider_at as string | undefined,
      withProviderAt: row.with_provider_at as string | undefined,
      checkoutAt: row.checkout_at as string | undefined,
      completedAt: row.completed_at as string | undefined,
      assignedProviderId: row.assigned_provider_id as string | undefined,
      assignedMaId: row.assigned_ma_id as string | undefined,
      priority: (row.priority as PatientFlow['priority']) || 'normal',
      notes: row.notes as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private emitFlowUpdate(
    tenantId: string,
    flow: Record<string, unknown>,
    previousStatus?: string
  ): void {
    try {
      const io = getIO();
      io.to(`tenant:${tenantId}`).emit('patient-flow:updated', {
        flowId: flow.id,
        appointmentId: flow.appointment_id,
        patientId: flow.patient_id,
        roomId: flow.room_id,
        status: flow.status,
        previousStatus,
        statusChangedAt: flow.status_changed_at,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // WebSocket not initialized, skip emission
      logger.debug('WebSocket not available for flow update emission');
    }
  }
}

export const patientFlowService = new PatientFlowService();
