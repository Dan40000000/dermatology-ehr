import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { encounterService } from './encounterService';

export interface AppointmentWithDetails {
  id: string;
  tenantId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string;
  patientEmail?: string;
  providerId: string;
  providerName: string;
  locationId: string;
  locationName: string;
  appointmentTypeId: string;
  appointmentTypeName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  arrivedAt?: string;
  roomedAt?: string;
  completedAt?: string;
  // Insurance info
  insuranceVerified?: boolean;
  insurancePlanName?: string;
  copayAmount?: number;
  // Balance info
  outstandingBalance?: number;
  balanceAge?: number;
  // Wait time
  waitTimeMinutes?: number;
  // Metadata
  createdAt: string;
}

export interface DailyStats {
  totalScheduled: number;
  patientsArrived: number;
  patientsCompleted: number;
  noShows: number;
  collectionsToday: number;
  openSlotsRemaining: number;
  averageWaitTime?: number;
}

export interface WaitingRoomPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  scheduledTime: string;
  arrivedAt: string;
  waitTimeMinutes: number;
  isDelayed: boolean;
}

export class FrontDeskService {
  /**
   * Get today's schedule with all relevant details
   */
  async getTodaySchedule(tenantId: string, providerId?: string, statusFilter?: string): Promise<AppointmentWithDetails[]> {
    try {
      const today = new Date().toISOString().split('T')[0];

      let query = `
        SELECT
          a.id,
          a.tenant_id,
          a.patient_id,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.phone as patient_phone,
          p.email as patient_email,
          a.provider_id,
          prov.full_name as provider_name,
          a.location_id,
          l.name as location_name,
          a.appointment_type_id,
          at.name as appointment_type_name,
          a.scheduled_start,
          a.scheduled_end,
          a.status,
          a.arrived_at,
          a.roomed_at,
          a.completed_at,
          a.created_at,
          -- Insurance info
          CASE
            WHEN p.insurance_details IS NOT NULL
              AND (p.insurance_details->>'primary' IS NOT NULL)
              AND (p.insurance_details->'primary'->>'eligibilityStatus' = 'Active')
            THEN true
            ELSE false
          END as insurance_verified,
          p.insurance_details->'primary'->>'planName' as insurance_plan_name,
          CASE
            WHEN p.insurance_details IS NOT NULL
              AND (p.insurance_details->'primary'->>'copayAmount' IS NOT NULL)
            THEN (p.insurance_details->'primary'->>'copayAmount')::numeric
            ELSE 0
          END as copay_amount,
          -- Outstanding balance (placeholder - would come from billing system)
          COALESCE(
            (SELECT SUM(amount_cents) / 100.0
             FROM bills
             WHERE patient_id = p.id
               AND status IN ('pending', 'overdue')
            ), 0
          ) as outstanding_balance
        FROM appointments a
        INNER JOIN patients p ON a.patient_id = p.id
        INNER JOIN providers prov ON a.provider_id = prov.id
        INNER JOIN locations l ON a.location_id = l.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        WHERE a.tenant_id = $1
          AND DATE(a.scheduled_start) = $2
      `;

      const params: any[] = [tenantId, today];
      let paramCount = 2;

      if (providerId) {
        paramCount++;
        query += ` AND a.provider_id = $${paramCount}`;
        params.push(providerId);
      }

      if (statusFilter) {
        paramCount++;
        query += ` AND a.status = $${paramCount}`;
        params.push(statusFilter);
      }

      query += ` ORDER BY a.scheduled_start ASC`;

      const result = await pool.query(query, params);

      // Calculate wait times for patients who have arrived
      const appointments = result.rows.map((row: any) => {
        const apt: AppointmentWithDetails = {
          id: row.id,
          tenantId: row.tenant_id,
          patientId: row.patient_id,
          patientFirstName: row.patient_first_name,
          patientLastName: row.patient_last_name,
          patientPhone: row.patient_phone,
          patientEmail: row.patient_email,
          providerId: row.provider_id,
          providerName: row.provider_name,
          locationId: row.location_id,
          locationName: row.location_name,
          appointmentTypeId: row.appointment_type_id,
          appointmentTypeName: row.appointment_type_name,
          scheduledStart: row.scheduled_start,
          scheduledEnd: row.scheduled_end,
          status: row.status,
          arrivedAt: row.arrived_at,
          roomedAt: row.roomed_at,
          completedAt: row.completed_at,
          insuranceVerified: row.insurance_verified,
          insurancePlanName: row.insurance_plan_name,
          copayAmount: row.copay_amount ? parseFloat(row.copay_amount) : undefined,
          outstandingBalance: row.outstanding_balance ? parseFloat(row.outstanding_balance) : 0,
          createdAt: row.created_at,
        };

        // Calculate wait time if patient has arrived
        if (row.arrived_at && row.status === 'checked_in') {
          const arrivedTime = new Date(row.arrived_at);
          const now = new Date();
          apt.waitTimeMinutes = Math.floor((now.getTime() - arrivedTime.getTime()) / (1000 * 60));
        }

        return apt;
      });

      return appointments;
    } catch (error) {
      logger.error('Error getting today schedule:', error);
      throw error;
    }
  }

  /**
   * Get daily statistics
   */
  async getDailyStats(tenantId: string): Promise<DailyStats> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get appointment counts
      const appointmentStats = await pool.query(
        `
        SELECT
          COUNT(*) as total_scheduled,
          COUNT(*) FILTER (WHERE status IN ('checked_in', 'in_room', 'with_provider')) as patients_arrived,
          COUNT(*) FILTER (WHERE status = 'completed') as patients_completed,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows
        FROM appointments
        WHERE tenant_id = $1
          AND DATE(scheduled_start) = $2
        `,
        [tenantId, today]
      );

      // Get today's collections (from payments or charges marked as paid)
      const collectionsResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount_cents) / 100.0, 0) as collections_today
        FROM payments
        WHERE tenant_id = $1
          AND DATE(created_at) = $2
        `,
        [tenantId, today]
      );

      // Calculate open slots (simplified - assumes 15-min slots, 8am-5pm)
      const totalSlots = 36 * (await this.getProviderCount(tenantId)); // 36 slots per provider per day
      const bookedSlots = parseInt(appointmentStats.rows[0].total_scheduled);
      const openSlotsRemaining = Math.max(0, totalSlots - bookedSlots);

      // Calculate average wait time for patients who arrived and were roomed
      const waitTimeResult = await pool.query(
        `
        SELECT AVG(EXTRACT(EPOCH FROM (roomed_at - arrived_at)) / 60) as avg_wait_minutes
        FROM appointments
        WHERE tenant_id = $1
          AND DATE(scheduled_start) = $2
          AND arrived_at IS NOT NULL
          AND roomed_at IS NOT NULL
        `,
        [tenantId, today]
      );

      const stats: DailyStats = {
        totalScheduled: parseInt(appointmentStats.rows[0].total_scheduled),
        patientsArrived: parseInt(appointmentStats.rows[0].patients_arrived),
        patientsCompleted: parseInt(appointmentStats.rows[0].patients_completed),
        noShows: parseInt(appointmentStats.rows[0].no_shows),
        collectionsToday: parseFloat(collectionsResult.rows[0].collections_today),
        openSlotsRemaining,
        averageWaitTime: waitTimeResult.rows[0].avg_wait_minutes
          ? Math.round(parseFloat(waitTimeResult.rows[0].avg_wait_minutes))
          : undefined,
      };

      return stats;
    } catch (error) {
      logger.error('Error getting daily stats:', error);
      throw error;
    }
  }

  /**
   * Get patients currently in the waiting room
   */
  async getWaitingRoomPatients(tenantId: string): Promise<WaitingRoomPatient[]> {
    try {
      const result = await pool.query(
        `
        SELECT
          a.id as appointment_id,
          a.patient_id,
          p.first_name || ' ' || p.last_name as patient_name,
          a.provider_id,
          prov.full_name as provider_name,
          a.scheduled_start as scheduled_time,
          a.arrived_at,
          EXTRACT(EPOCH FROM (NOW() - a.arrived_at)) / 60 as wait_time_minutes
        FROM appointments a
        INNER JOIN patients p ON a.patient_id = p.id
        INNER JOIN providers prov ON a.provider_id = prov.id
        WHERE a.tenant_id = $1
          AND a.status = 'checked_in'
          AND a.arrived_at IS NOT NULL
        ORDER BY a.arrived_at ASC
        `,
        [tenantId]
      );

      return result.rows.map((row: any) => ({
        appointmentId: row.appointment_id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        providerId: row.provider_id,
        providerName: row.provider_name,
        scheduledTime: row.scheduled_time,
        arrivedAt: row.arrived_at,
        waitTimeMinutes: Math.floor(parseFloat(row.wait_time_minutes)),
        isDelayed: parseFloat(row.wait_time_minutes) > 15,
      }));
    } catch (error) {
      logger.error('Error getting waiting room patients:', error);
      throw error;
    }
  }

  /**
   * Check in a patient and automatically create an encounter
   */
  async checkInPatient(tenantId: string, appointmentId: string): Promise<{ encounterId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get appointment details
      const appointmentResult = await client.query(
        `SELECT patient_id, provider_id FROM appointments
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (!appointmentResult.rowCount) {
        throw new Error('Appointment not found');
      }

      const appointment = appointmentResult.rows[0];

      // Update appointment status
      await client.query(
        `UPDATE appointments
         SET status = 'checked_in', arrived_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, appointmentId]
      );

      // Release connection for encounterService to use
      await client.query('COMMIT');
      client.release();

      // Create encounter (this will check for existing encounter)
      const encounter = await encounterService.createEncounterFromAppointment(
        tenantId,
        appointmentId,
        appointment.patient_id,
        appointment.provider_id
      );

      logger.info(`Checked in patient and created encounter ${encounter.id} for appointment ${appointmentId}`);
      return { encounterId: encounter.id };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error checking in patient:', error);
      throw error;
    }
  }

  /**
   * Check out a patient
   */
  async checkOutPatient(tenantId: string, appointmentId: string): Promise<void> {
    try {
      await pool.query(
        `
        UPDATE appointments
        SET status = 'completed',
            completed_at = NOW()
        WHERE tenant_id = $1
          AND id = $2
        `,
        [tenantId, appointmentId]
      );
    } catch (error) {
      logger.error('Error checking out patient:', error);
      throw error;
    }
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    tenantId: string,
    appointmentId: string,
    status: string
  ): Promise<void> {
    try {
      // Update specific timestamp fields based on status
      const updates: string[] = ['status = $3'];

      if (status === 'checked_in' && updates) {
        updates.push('arrived_at = COALESCE(arrived_at, NOW())');
      } else if (status === 'in_room') {
        updates.push('roomed_at = COALESCE(roomed_at, NOW())');
      } else if (status === 'completed') {
        updates.push('completed_at = COALESCE(completed_at, NOW())');
      }

      const query = `
        UPDATE appointments
        SET ${updates.join(', ')}
        WHERE tenant_id = $1 AND id = $2
      `;

      await pool.query(query, [tenantId, appointmentId, status]);
    } catch (error) {
      logger.error('Error updating appointment status:', error);
      throw error;
    }
  }

  /**
   * Helper: Get count of active providers
   */
  private async getProviderCount(tenantId: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM providers WHERE tenant_id = $1',
      [tenantId]
    );
    return parseInt(result.rows[0].count) || 1;
  }

  /**
   * Get upcoming patients (next 3-5 arriving)
   */
  async getUpcomingPatients(tenantId: string, limit: number = 5): Promise<AppointmentWithDetails[]> {
    try {
      const now = new Date().toISOString();

      const result = await pool.query(
        `
        SELECT
          a.id,
          a.tenant_id,
          a.patient_id,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.phone as patient_phone,
          p.email as patient_email,
          a.provider_id,
          prov.full_name as provider_name,
          a.location_id,
          l.name as location_name,
          a.appointment_type_id,
          at.name as appointment_type_name,
          a.scheduled_start,
          a.scheduled_end,
          a.status,
          a.created_at,
          -- Insurance info
          CASE
            WHEN p.insurance_details IS NOT NULL
              AND (p.insurance_details->>'primary' IS NOT NULL)
              AND (p.insurance_details->'primary'->>'eligibilityStatus' = 'Active')
            THEN true
            ELSE false
          END as insurance_verified,
          p.insurance_details->'primary'->>'planName' as insurance_plan_name,
          CASE
            WHEN p.insurance_details IS NOT NULL
              AND (p.insurance_details->'primary'->>'copayAmount' IS NOT NULL)
            THEN (p.insurance_details->'primary'->>'copayAmount')::numeric
            ELSE 0
          END as copay_amount,
          -- Outstanding balance
          COALESCE(
            (SELECT SUM(amount_cents) / 100.0
             FROM bills
             WHERE patient_id = p.id
               AND status IN ('pending', 'overdue')
            ), 0
          ) as outstanding_balance
        FROM appointments a
        INNER JOIN patients p ON a.patient_id = p.id
        INNER JOIN providers prov ON a.provider_id = prov.id
        INNER JOIN locations l ON a.location_id = l.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        WHERE a.tenant_id = $1
          AND a.scheduled_start > $2
          AND a.status = 'scheduled'
        ORDER BY a.scheduled_start ASC
        LIMIT $3
        `,
        [tenantId, now, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        patientId: row.patient_id,
        patientFirstName: row.patient_first_name,
        patientLastName: row.patient_last_name,
        patientPhone: row.patient_phone,
        patientEmail: row.patient_email,
        providerId: row.provider_id,
        providerName: row.provider_name,
        locationId: row.location_id,
        locationName: row.location_name,
        appointmentTypeId: row.appointment_type_id,
        appointmentTypeName: row.appointment_type_name,
        scheduledStart: row.scheduled_start,
        scheduledEnd: row.scheduled_end,
        status: row.status,
        insuranceVerified: row.insurance_verified,
        insurancePlanName: row.insurance_plan_name,
        copayAmount: row.copay_amount ? parseFloat(row.copay_amount) : undefined,
        outstandingBalance: row.outstanding_balance ? parseFloat(row.outstanding_balance) : 0,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Error getting upcoming patients:', error);
      throw error;
    }
  }
}

export const frontDeskService = new FrontDeskService();
