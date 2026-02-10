/**
 * Wait Time Service
 *
 * Handles patient-facing wait time display functionality including:
 * - Wait time estimation and prediction
 * - Queue management and position tracking
 * - Real-time updates via WebSocket
 * - SMS notifications for wait time changes
 * - Historical analytics
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface WaitTimeSnapshot {
  id: string;
  locationId: string;
  snapshotTime: Date;
  avgWaitMinutes: number;
  patientsWaiting: number;
  providerDelays: Record<string, ProviderDelay>;
  longestWaitMinutes: number;
  shortestWaitMinutes: number;
  medianWaitMinutes: number;
}

export interface ProviderDelay {
  name: string;
  delayMinutes: number;
  reason?: string;
}

export interface KioskConfig {
  id: string;
  locationId: string;
  displayMode: 'waiting_room_tv' | 'kiosk' | 'both';
  welcomeMessage: string;
  showWaitTime: boolean;
  customBranding: CustomBranding;
  anonymizeNames: boolean;
  useQueueNumbers: boolean;
  showProviderNames: boolean;
  refreshIntervalSeconds: number;
  showEstimatedTimes: boolean;
  showQueuePosition: boolean;
  enableSmsUpdates: boolean;
  smsDelayThresholdMinutes: number;
}

export interface CustomBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  practiceName?: string;
}

export interface QueueEntry {
  id: string;
  appointmentId: string;
  displayName: string;
  queueNumber: number | null;
  checkInTime: Date;
  estimatedCallTime: Date | null;
  position: number;
  status: 'waiting' | 'called' | 'in_room' | 'complete' | 'no_show';
  providerId: string | null;
  providerName: string | null;
  roomNumber: string | null;
  estimatedWaitMinutes: number | null;
  actualWaitMinutes: number | null;
}

export interface WaitingRoomDisplayData {
  locationId: string;
  locationName: string;
  config: KioskConfig;
  currentWait: {
    avgWaitMinutes: number;
    patientsWaiting: number;
    longestWaitMinutes: number;
  };
  queue: QueueEntry[];
  providerStatus: ProviderStatus[];
  lastUpdated: Date;
}

export interface ProviderStatus {
  providerId: string;
  providerName: string;
  status: 'available' | 'with_patient' | 'running_late' | 'unavailable';
  currentPatient?: string;
  delayMinutes: number;
  estimatedNextAvailable?: Date;
}

export interface WaitTimeEstimate {
  appointmentId: string;
  patientName: string;
  position: number;
  estimatedWaitMinutes: number;
  estimatedCallTime: Date;
  checkInTime: Date;
  providerName: string | null;
  status: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface HistoricalWaitTime {
  dayOfWeek: number;
  hourOfDay: number;
  avgWaitMinutes: number;
  sampleCount: number;
  stdDeviation: number;
}

// ============================================
// WAIT TIME SERVICE CLASS
// ============================================

class WaitTimeService {
  private wsEmitter: ((event: string, data: unknown) => void) | null = null;

  /**
   * Set WebSocket emitter for real-time updates
   */
  setWebSocketEmitter(emitter: (event: string, data: unknown) => void): void {
    this.wsEmitter = emitter;
  }

  /**
   * Emit a real-time update via WebSocket
   */
  private emitUpdate(event: string, data: unknown): void {
    if (this.wsEmitter) {
      this.wsEmitter(event, data);
    }
  }

  // ============================================
  // WAIT TIME ESTIMATION
  // ============================================

  /**
   * Calculate estimated wait time for a specific appointment
   */
  async calculateEstimatedWait(
    appointmentId: string,
    tenantId: string
  ): Promise<WaitTimeEstimate> {
    logger.info('Calculating estimated wait', { appointmentId });

    // Get queue entry and appointment details
    const result = await pool.query(
      `SELECT
        pqd.id,
        pqd.appointment_id,
        pqd.display_name,
        pqd.position,
        pqd.check_in_time,
        pqd.estimated_call_time,
        pqd.estimated_wait_minutes,
        pqd.status,
        pqd.provider_id,
        pqd.provider_name,
        pqd.location_id,
        a.scheduled_start,
        a.appointment_type_id,
        at.duration_minutes,
        p.first_name,
        p.last_name
       FROM patient_queue_display pqd
       JOIN appointments a ON a.id = pqd.appointment_id
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE pqd.appointment_id = $1 AND pqd.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Appointment not found in queue');
    }

    const entry = result.rows[0];

    // Calculate estimated wait based on position and historical data
    const estimatedWaitMinutes = await this.predictWaitTime(
      entry.location_id,
      tenantId,
      entry.position,
      entry.provider_id,
      entry.duration_minutes || 15
    );

    // Calculate estimated call time
    const estimatedCallTime = new Date(
      Date.now() + estimatedWaitMinutes * 60 * 1000
    );

    // Determine confidence based on data quality
    const confidence = this.calculateConfidence(
      entry.position,
      estimatedWaitMinutes
    );

    // Update the queue entry with new estimates
    await pool.query(
      `UPDATE patient_queue_display
       SET estimated_wait_minutes = $1,
           estimated_call_time = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [estimatedWaitMinutes, estimatedCallTime, entry.id]
    );

    return {
      appointmentId,
      patientName: `${entry.first_name} ${entry.last_name}`,
      position: entry.position,
      estimatedWaitMinutes,
      estimatedCallTime,
      checkInTime: entry.check_in_time,
      providerName: entry.provider_name,
      status: entry.status,
      confidence,
    };
  }

  /**
   * Predict wait time based on historical data and current conditions
   */
  private async predictWaitTime(
    locationId: string,
    tenantId: string,
    position: number,
    providerId: string | null,
    appointmentDuration: number
  ): Promise<number> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hourOfDay = now.getHours();

    // Get historical average for this time slot
    const historicalResult = await pool.query(
      `SELECT avg_wait_minutes, sample_count
       FROM wait_time_historical_averages
       WHERE tenant_id = $1
         AND location_id = $2
         AND day_of_week = $3
         AND hour_of_day = $4
         AND (provider_id = $5 OR provider_id IS NULL)
       ORDER BY provider_id NULLS LAST
       LIMIT 1`,
      [tenantId, locationId, dayOfWeek, hourOfDay, providerId]
    );

    let baseWaitMinutes = 15; // Default wait time
    if (historicalResult.rows.length > 0 && historicalResult.rows[0]) {
      baseWaitMinutes = parseFloat(historicalResult.rows[0].avg_wait_minutes) || 15;
    }

    // Get current provider delay if any
    const delayResult = await pool.query(
      `SELECT provider_delays
       FROM wait_time_snapshots
       WHERE tenant_id = $1 AND location_id = $2
       ORDER BY snapshot_time DESC
       LIMIT 1`,
      [tenantId, locationId]
    );

    let providerDelay = 0;
    if (delayResult.rows.length > 0 && delayResult.rows[0]?.provider_delays && providerId) {
      const delays = delayResult.rows[0].provider_delays as Record<string, ProviderDelay>;
      if (delays[providerId]) {
        providerDelay = delays[providerId].delayMinutes || 0;
      }
    }

    // Calculate based on position (each patient ahead adds ~appointment duration)
    const positionWait = (position - 1) * appointmentDuration;

    // Combine factors with weights
    const estimatedWait = Math.round(
      baseWaitMinutes * 0.3 + // Historical average
      positionWait * 0.5 +    // Position-based
      providerDelay * 0.2     // Current delays
    );

    return Math.max(0, estimatedWait);
  }

  /**
   * Calculate confidence level for wait estimate
   */
  private calculateConfidence(
    position: number,
    estimatedWait: number
  ): 'high' | 'medium' | 'low' {
    if (position <= 2 && estimatedWait < 15) {
      return 'high';
    } else if (position <= 5 && estimatedWait < 45) {
      return 'medium';
    }
    return 'low';
  }

  // ============================================
  // WAITING ROOM DISPLAY
  // ============================================

  /**
   * Get data for waiting room TV display
   */
  async getWaitingRoomDisplay(
    locationId: string,
    tenantId: string
  ): Promise<WaitingRoomDisplayData> {
    logger.info('Getting waiting room display data', { locationId });

    // Get location info
    const locationResult = await pool.query(
      `SELECT id, name FROM locations WHERE id = $1 AND tenant_id = $2`,
      [locationId, tenantId]
    );

    if (locationResult.rows.length === 0) {
      throw new Error('Location not found');
    }

    const location = locationResult.rows[0];

    // Get kiosk config
    const config = await this.getKioskConfig(locationId, tenantId);

    // Get current wait time stats
    const waitResult = await pool.query(
      `SELECT * FROM calculate_current_wait_time($1, $2)`,
      [tenantId, locationId]
    );

    const currentWait = waitResult.rows[0] || {
      avg_wait_minutes: 0,
      patients_waiting: 0,
      longest_wait_minutes: 0,
    };

    // Get queue entries
    const queueResult = await pool.query(
      `SELECT
        pqd.id,
        pqd.appointment_id,
        pqd.display_name,
        pqd.queue_number,
        pqd.check_in_time,
        pqd.estimated_call_time,
        pqd.position,
        pqd.status,
        pqd.provider_id,
        pqd.provider_name,
        pqd.room_number,
        pqd.estimated_wait_minutes,
        pqd.actual_wait_minutes
       FROM patient_queue_display pqd
       WHERE pqd.tenant_id = $1
         AND pqd.location_id = $2
         AND pqd.status IN ('waiting', 'called')
       ORDER BY pqd.position ASC`,
      [tenantId, locationId]
    );

    const queue: QueueEntry[] = queueResult.rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      displayName: row.display_name,
      queueNumber: row.queue_number,
      checkInTime: row.check_in_time,
      estimatedCallTime: row.estimated_call_time,
      position: row.position,
      status: row.status,
      providerId: row.provider_id,
      providerName: row.provider_name,
      roomNumber: row.room_number,
      estimatedWaitMinutes: row.estimated_wait_minutes,
      actualWaitMinutes: row.actual_wait_minutes,
    }));

    // Get provider status
    const providerStatus = await this.getProviderStatus(locationId, tenantId);

    return {
      locationId,
      locationName: location.name,
      config,
      currentWait: {
        avgWaitMinutes: currentWait.avg_wait_minutes || 0,
        patientsWaiting: currentWait.patients_waiting || 0,
        longestWaitMinutes: currentWait.longest_wait_minutes || 0,
      },
      queue,
      providerStatus,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get kiosk configuration for a location
   */
  async getKioskConfig(
    locationId: string,
    tenantId: string
  ): Promise<KioskConfig> {
    const result = await pool.query(
      `SELECT
        id,
        location_id,
        display_mode,
        welcome_message,
        show_wait_time,
        custom_branding,
        anonymize_names,
        use_queue_numbers,
        show_provider_names,
        refresh_interval_seconds,
        show_estimated_times,
        show_queue_position,
        enable_sms_updates,
        sms_delay_threshold_minutes
       FROM check_in_kiosk_config
       WHERE location_id = $1 AND tenant_id = $2`,
      [locationId, tenantId]
    );

    if (result.rows.length === 0) {
      // Return default config
      return {
        id: '',
        locationId,
        displayMode: 'both',
        welcomeMessage: 'Welcome! Please check in for your appointment.',
        showWaitTime: true,
        customBranding: {},
        anonymizeNames: false,
        useQueueNumbers: false,
        showProviderNames: true,
        refreshIntervalSeconds: 30,
        showEstimatedTimes: true,
        showQueuePosition: true,
        enableSmsUpdates: true,
        smsDelayThresholdMinutes: 15,
      };
    }

    const row = result.rows[0];
    return {
      id: row.id,
      locationId: row.location_id,
      displayMode: row.display_mode,
      welcomeMessage: row.welcome_message,
      showWaitTime: row.show_wait_time,
      customBranding: row.custom_branding || {},
      anonymizeNames: row.anonymize_names,
      useQueueNumbers: row.use_queue_numbers,
      showProviderNames: row.show_provider_names,
      refreshIntervalSeconds: row.refresh_interval_seconds,
      showEstimatedTimes: row.show_estimated_times,
      showQueuePosition: row.show_queue_position,
      enableSmsUpdates: row.enable_sms_updates,
      smsDelayThresholdMinutes: row.sms_delay_threshold_minutes,
    };
  }

  /**
   * Get provider availability status for a location
   */
  async getProviderStatus(
    locationId: string,
    tenantId: string
  ): Promise<ProviderStatus[]> {
    // Get providers for this location with their current status
    const result = await pool.query(
      `SELECT DISTINCT
        p.id as provider_id,
        p.full_name as provider_name,
        CASE
          WHEN e.id IS NOT NULL AND e.status = 'in_progress' THEN 'with_patient'
          WHEN pqd.id IS NOT NULL AND pqd.status = 'called' THEN 'with_patient'
          ELSE 'available'
        END as status,
        pqd.display_name as current_patient,
        COALESCE((wts.provider_delays->p.id->>'delay_minutes')::integer, 0) as delay_minutes
       FROM providers p
       LEFT JOIN appointments a ON a.provider_id = p.id
         AND a.tenant_id = $1
         AND DATE(a.scheduled_start) = CURRENT_DATE
       LEFT JOIN encounters e ON e.appointment_id = a.id AND e.status = 'in_progress'
       LEFT JOIN patient_queue_display pqd ON pqd.provider_id = p.id
         AND pqd.tenant_id = $1
         AND pqd.status = 'called'
       LEFT JOIN LATERAL (
         SELECT provider_delays
         FROM wait_time_snapshots
         WHERE tenant_id = $1 AND location_id = $2
         ORDER BY snapshot_time DESC
         LIMIT 1
       ) wts ON true
       WHERE p.tenant_id = $1
         AND EXISTS (
           SELECT 1 FROM appointments apt
           WHERE apt.provider_id = p.id
             AND apt.location_id = $2
             AND DATE(apt.scheduled_start) = CURRENT_DATE
         )`,
      [tenantId, locationId]
    );

    return result.rows.map((row) => ({
      providerId: row.provider_id,
      providerName: row.provider_name,
      status: row.delay_minutes > 15 ? 'running_late' : row.status,
      currentPatient: row.current_patient,
      delayMinutes: row.delay_minutes || 0,
    }));
  }

  // ============================================
  // QUEUE MANAGEMENT
  // ============================================

  /**
   * Add patient to queue on check-in
   */
  async addToQueue(
    appointmentId: string,
    tenantId: string,
    options?: { customDisplayName?: string }
  ): Promise<QueueEntry> {
    logger.info('Adding patient to queue', { appointmentId });

    // Get appointment and patient info
    const apptResult = await pool.query(
      `SELECT
        a.id,
        a.patient_id,
        a.provider_id,
        a.location_id,
        p.first_name,
        p.last_name,
        pr.full_name as provider_name,
        ckc.anonymize_names,
        ckc.use_queue_numbers
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN providers pr ON pr.id = a.provider_id
       LEFT JOIN check_in_kiosk_config ckc ON ckc.location_id = a.location_id AND ckc.tenant_id = a.tenant_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (apptResult.rows.length === 0) {
      throw new Error('Appointment not found');
    }

    const appt = apptResult.rows[0];

    // Get next queue number if using queue numbers
    let queueNumber = null;
    if (appt.use_queue_numbers) {
      const queueResult = await pool.query(
        `SELECT COALESCE(MAX(queue_number), 0) + 1 as next_number
         FROM patient_queue_display
         WHERE tenant_id = $1 AND location_id = $2
           AND DATE(check_in_time) = CURRENT_DATE`,
        [tenantId, appt.location_id]
      );
      queueNumber = queueResult.rows[0]?.next_number || 1;
    }

    // Generate display name
    let displayName = options?.customDisplayName;
    if (!displayName) {
      if (appt.anonymize_names && queueNumber) {
        displayName = `Queue #${queueNumber}`;
      } else {
        displayName = `${appt.first_name} ${appt.last_name?.charAt(0) || ''}.`;
      }
    }

    // Get current position (end of queue)
    const positionResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_position
       FROM patient_queue_display
       WHERE tenant_id = $1 AND location_id = $2 AND status = 'waiting'`,
      [tenantId, appt.location_id]
    );

    const position = positionResult.rows[0]?.next_position || 1;

    // Calculate initial wait estimate
    const estimatedWaitMinutes = await this.predictWaitTime(
      appt.location_id,
      tenantId,
      position,
      appt.provider_id,
      15 // Default appointment duration
    );

    const estimatedCallTime = new Date(
      Date.now() + estimatedWaitMinutes * 60 * 1000
    );

    // Create queue entry
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO patient_queue_display (
        id, tenant_id, location_id, appointment_id, display_name,
        queue_number, check_in_time, estimated_call_time, position,
        status, provider_id, provider_name, estimated_wait_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, 'waiting', $9, $10, $11)
       ON CONFLICT (tenant_id, appointment_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         queue_number = EXCLUDED.queue_number,
         check_in_time = NOW(),
         estimated_call_time = EXCLUDED.estimated_call_time,
         position = EXCLUDED.position,
         status = 'waiting',
         estimated_wait_minutes = EXCLUDED.estimated_wait_minutes,
         updated_at = NOW()`,
      [
        id,
        tenantId,
        appt.location_id,
        appointmentId,
        displayName,
        queueNumber,
        estimatedCallTime,
        position,
        appt.provider_id,
        appt.provider_name,
        estimatedWaitMinutes,
      ]
    );

    const entry: QueueEntry = {
      id,
      appointmentId,
      displayName,
      queueNumber,
      checkInTime: new Date(),
      estimatedCallTime,
      position,
      status: 'waiting',
      providerId: appt.provider_id,
      providerName: appt.provider_name,
      roomNumber: null,
      estimatedWaitMinutes,
      actualWaitMinutes: null,
    };

    // Emit real-time update
    this.emitUpdate('queue:patient_added', {
      locationId: appt.location_id,
      entry,
    });

    return entry;
  }

  /**
   * Update queue position for all patients after a change
   */
  async updateQueuePosition(
    appointmentId: string,
    tenantId: string
  ): Promise<void> {
    logger.info('Updating queue position', { appointmentId });

    // Get location for this appointment
    const result = await pool.query(
      `SELECT location_id FROM patient_queue_display
       WHERE appointment_id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (result.rows.length === 0) {
      return;
    }

    const locationId = result.rows[0]?.location_id;

    // Recalculate all positions
    await pool.query(
      `SELECT update_queue_positions($1, $2)`,
      [tenantId, locationId]
    );

    // Recalculate wait times for all waiting patients
    const queueResult = await pool.query(
      `SELECT appointment_id FROM patient_queue_display
       WHERE tenant_id = $1 AND location_id = $2 AND status = 'waiting'`,
      [tenantId, locationId]
    );

    for (const row of queueResult.rows) {
      if (row.appointment_id) {
        await this.calculateEstimatedWait(row.appointment_id, tenantId);
      }
    }

    // Get updated display data
    const displayData = await this.getWaitingRoomDisplay(locationId, tenantId);

    // Emit real-time update
    this.emitUpdate('queue:updated', {
      locationId,
      displayData,
    });
  }

  /**
   * Update patient status in queue (called, in_room, complete)
   */
  async updatePatientStatus(
    appointmentId: string,
    tenantId: string,
    status: 'called' | 'in_room' | 'complete' | 'no_show',
    roomNumber?: string
  ): Promise<void> {
    logger.info('Updating patient status', { appointmentId, status });

    const now = new Date();

    // Get current entry
    const currentResult = await pool.query(
      `SELECT id, location_id, check_in_time, status as current_status
       FROM patient_queue_display
       WHERE appointment_id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error('Patient not found in queue');
    }

    const current = currentResult.rows[0];

    // Calculate actual wait if being called
    let actualWaitMinutes = null;
    if (status === 'called' && current.check_in_time) {
      actualWaitMinutes = Math.round(
        (now.getTime() - new Date(current.check_in_time).getTime()) / 60000
      );
    }

    // Update the entry
    await pool.query(
      `UPDATE patient_queue_display
       SET status = $1,
           room_number = COALESCE($2, room_number),
           actual_call_time = CASE WHEN $1 = 'called' THEN NOW() ELSE actual_call_time END,
           actual_wait_minutes = COALESCE($3, actual_wait_minutes),
           updated_at = NOW()
       WHERE appointment_id = $4 AND tenant_id = $5`,
      [status, roomNumber, actualWaitMinutes, appointmentId, tenantId]
    );

    // Update positions for remaining patients
    await this.updateQueuePosition(appointmentId, tenantId);

    // Emit real-time update
    this.emitUpdate('queue:patient_status_changed', {
      locationId: current.location_id,
      appointmentId,
      status,
      roomNumber,
    });
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Notify patient of significant wait time change
   */
  async notifyPatientUpdate(
    appointmentId: string,
    tenantId: string
  ): Promise<{ sent: boolean; message: string }> {
    logger.info('Checking if patient needs notification', { appointmentId });

    // Get queue entry with patient contact info
    const result = await pool.query(
      `SELECT
        pqd.id,
        pqd.estimated_wait_minutes,
        pqd.patient_notified_of_delay,
        pqd.sms_notifications_sent,
        pqd.last_sms_sent_at,
        pqd.location_id,
        p.phone,
        p.sms_consent,
        p.first_name,
        a.patient_id,
        ckc.enable_sms_updates,
        ckc.sms_delay_threshold_minutes
       FROM patient_queue_display pqd
       JOIN appointments a ON a.id = pqd.appointment_id
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN check_in_kiosk_config ckc ON ckc.location_id = pqd.location_id AND ckc.tenant_id = pqd.tenant_id
       WHERE pqd.appointment_id = $1 AND pqd.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (result.rows.length === 0) {
      return { sent: false, message: 'Patient not in queue' };
    }

    const entry = result.rows[0];

    // Check if SMS updates are enabled
    if (!entry.enable_sms_updates) {
      return { sent: false, message: 'SMS updates disabled for this location' };
    }

    // Check if patient has SMS consent
    if (!entry.sms_consent || !entry.phone) {
      return { sent: false, message: 'Patient has no SMS consent or phone number' };
    }

    // Check if delay is significant enough
    const threshold = entry.sms_delay_threshold_minutes || 15;
    if ((entry.estimated_wait_minutes || 0) < threshold) {
      return { sent: false, message: 'Wait time below notification threshold' };
    }

    // Check if already notified recently (within 10 minutes)
    if (entry.last_sms_sent_at) {
      const timeSinceLastSms =
        (Date.now() - new Date(entry.last_sms_sent_at).getTime()) / 60000;
      if (timeSinceLastSms < 10) {
        return { sent: false, message: 'Already notified recently' };
      }
    }

    // Send notification (using existing SMS service)
    const message = `Hi ${entry.first_name}, we wanted to let you know there's currently a ${entry.estimated_wait_minutes} minute wait. Thank you for your patience. You will be seen as soon as possible.`;

    // Log the notification
    const notificationId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO wait_time_notifications (
        id, tenant_id, appointment_id, patient_id, notification_type,
        message_content, status, estimated_wait_at_send
       ) VALUES ($1, $2, $3, $4, 'sms', $5, 'pending', $6)`,
      [
        notificationId,
        tenantId,
        appointmentId,
        entry.patient_id,
        message,
        entry.estimated_wait_minutes,
      ]
    );

    // Update queue entry
    await pool.query(
      `UPDATE patient_queue_display
       SET sms_notifications_sent = sms_notifications_sent + 1,
           last_sms_sent_at = NOW(),
           patient_notified_of_delay = true,
           updated_at = NOW()
       WHERE id = $1`,
      [entry.id]
    );

    // In a real implementation, this would call the SMS service
    // For now, we'll just log and return success
    logger.info('Wait time notification queued', {
      appointmentId,
      patientPhone: entry.phone,
      estimatedWait: entry.estimated_wait_minutes,
    });

    return { sent: true, message: 'Notification sent successfully' };
  }

  // ============================================
  // ANALYTICS & HISTORICAL DATA
  // ============================================

  /**
   * Get historical wait times by day of week and time slot
   */
  async getHistoricalWaitTimes(
    locationId: string,
    tenantId: string,
    dayOfWeek?: number
  ): Promise<HistoricalWaitTime[]> {
    const params: (string | number)[] = [tenantId, locationId];
    let dayFilter = '';

    if (dayOfWeek !== undefined) {
      dayFilter = 'AND day_of_week = $3';
      params.push(dayOfWeek);
    }

    const result = await pool.query(
      `SELECT
        day_of_week,
        hour_of_day,
        avg_wait_minutes,
        sample_count,
        std_deviation
       FROM wait_time_historical_averages
       WHERE tenant_id = $1 AND location_id = $2 ${dayFilter}
       ORDER BY day_of_week, hour_of_day`,
      params
    );

    return result.rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      hourOfDay: row.hour_of_day,
      avgWaitMinutes: parseFloat(row.avg_wait_minutes) || 0,
      sampleCount: row.sample_count,
      stdDeviation: parseFloat(row.std_deviation) || 0,
    }));
  }

  /**
   * Get wait time analytics for a location
   */
  async getWaitTimeAnalytics(
    locationId: string,
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    avgWaitMinutes: number;
    medianWaitMinutes: number;
    maxWaitMinutes: number;
    totalPatients: number;
    waitTimesByHour: { hour: number; avgWait: number }[];
    waitTimesByDay: { day: number; avgWait: number }[];
    providerStats: { providerId: string; providerName: string; avgWait: number }[];
  }> {
    // Overall stats
    const statsResult = await pool.query(
      `SELECT
        AVG(actual_wait_minutes) as avg_wait,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY actual_wait_minutes) as median_wait,
        MAX(actual_wait_minutes) as max_wait,
        COUNT(*) as total_patients
       FROM patient_queue_display
       WHERE tenant_id = $1
         AND location_id = $2
         AND check_in_time >= $3::date
         AND check_in_time < $4::date + interval '1 day'
         AND actual_wait_minutes IS NOT NULL`,
      [tenantId, locationId, startDate, endDate]
    );

    const stats = statsResult.rows[0] || {};

    // Wait times by hour
    const hourlyResult = await pool.query(
      `SELECT
        EXTRACT(HOUR FROM check_in_time)::integer as hour,
        AVG(actual_wait_minutes) as avg_wait
       FROM patient_queue_display
       WHERE tenant_id = $1
         AND location_id = $2
         AND check_in_time >= $3::date
         AND check_in_time < $4::date + interval '1 day'
         AND actual_wait_minutes IS NOT NULL
       GROUP BY EXTRACT(HOUR FROM check_in_time)
       ORDER BY hour`,
      [tenantId, locationId, startDate, endDate]
    );

    // Wait times by day of week
    const dailyResult = await pool.query(
      `SELECT
        EXTRACT(DOW FROM check_in_time)::integer as day,
        AVG(actual_wait_minutes) as avg_wait
       FROM patient_queue_display
       WHERE tenant_id = $1
         AND location_id = $2
         AND check_in_time >= $3::date
         AND check_in_time < $4::date + interval '1 day'
         AND actual_wait_minutes IS NOT NULL
       GROUP BY EXTRACT(DOW FROM check_in_time)
       ORDER BY day`,
      [tenantId, locationId, startDate, endDate]
    );

    // Provider stats
    const providerResult = await pool.query(
      `SELECT
        pqd.provider_id,
        pqd.provider_name,
        AVG(pqd.actual_wait_minutes) as avg_wait
       FROM patient_queue_display pqd
       WHERE pqd.tenant_id = $1
         AND pqd.location_id = $2
         AND pqd.check_in_time >= $3::date
         AND pqd.check_in_time < $4::date + interval '1 day'
         AND pqd.actual_wait_minutes IS NOT NULL
         AND pqd.provider_id IS NOT NULL
       GROUP BY pqd.provider_id, pqd.provider_name
       ORDER BY avg_wait DESC`,
      [tenantId, locationId, startDate, endDate]
    );

    return {
      avgWaitMinutes: parseFloat(stats.avg_wait) || 0,
      medianWaitMinutes: parseFloat(stats.median_wait) || 0,
      maxWaitMinutes: parseInt(stats.max_wait) || 0,
      totalPatients: parseInt(stats.total_patients) || 0,
      waitTimesByHour: hourlyResult.rows.map((row) => ({
        hour: row.hour,
        avgWait: parseFloat(row.avg_wait) || 0,
      })),
      waitTimesByDay: dailyResult.rows.map((row) => ({
        day: row.day,
        avgWait: parseFloat(row.avg_wait) || 0,
      })),
      providerStats: providerResult.rows.map((row) => ({
        providerId: row.provider_id,
        providerName: row.provider_name,
        avgWait: parseFloat(row.avg_wait) || 0,
      })),
    };
  }

  /**
   * Capture a snapshot of current wait times (for historical tracking)
   */
  async captureWaitTimeSnapshot(
    locationId: string,
    tenantId: string
  ): Promise<WaitTimeSnapshot> {
    // Get current wait metrics
    const waitResult = await pool.query(
      `SELECT * FROM calculate_current_wait_time($1, $2)`,
      [tenantId, locationId]
    );

    const metrics = waitResult.rows[0] || {
      avg_wait_minutes: 0,
      patients_waiting: 0,
      longest_wait_minutes: 0,
    };

    // Get provider delays
    const providerResult = await pool.query(
      `SELECT
        pqd.provider_id,
        pqd.provider_name,
        AVG(EXTRACT(EPOCH FROM (NOW() - pqd.check_in_time)) / 60)::integer as avg_delay
       FROM patient_queue_display pqd
       WHERE pqd.tenant_id = $1
         AND pqd.location_id = $2
         AND pqd.status = 'waiting'
         AND pqd.provider_id IS NOT NULL
       GROUP BY pqd.provider_id, pqd.provider_name
       HAVING AVG(EXTRACT(EPOCH FROM (NOW() - pqd.check_in_time)) / 60) > 15`,
      [tenantId, locationId]
    );

    const providerDelays: Record<string, ProviderDelay> = {};
    for (const row of providerResult.rows) {
      if (row.provider_id) {
        providerDelays[row.provider_id] = {
          name: row.provider_name || 'Unknown',
          delayMinutes: row.avg_delay || 0,
        };
      }
    }

    // Get additional stats
    const statsResult = await pool.query(
      `SELECT
        MIN(EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60)::integer as shortest_wait,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60
        )::integer as median_wait
       FROM patient_queue_display
       WHERE tenant_id = $1 AND location_id = $2 AND status = 'waiting'`,
      [tenantId, locationId]
    );

    const additionalStats = statsResult.rows[0] || {};

    // Create snapshot
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO wait_time_snapshots (
        id, tenant_id, location_id, snapshot_time,
        avg_wait_minutes, patients_waiting, provider_delays,
        longest_wait_minutes, shortest_wait_minutes, median_wait_minutes
       ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)`,
      [
        id,
        tenantId,
        locationId,
        metrics.avg_wait_minutes || 0,
        metrics.patients_waiting || 0,
        JSON.stringify(providerDelays),
        metrics.longest_wait_minutes || 0,
        additionalStats.shortest_wait || 0,
        additionalStats.median_wait || 0,
      ]
    );

    const snapshot: WaitTimeSnapshot = {
      id,
      locationId,
      snapshotTime: new Date(),
      avgWaitMinutes: metrics.avg_wait_minutes || 0,
      patientsWaiting: metrics.patients_waiting || 0,
      providerDelays,
      longestWaitMinutes: metrics.longest_wait_minutes || 0,
      shortestWaitMinutes: additionalStats.shortest_wait || 0,
      medianWaitMinutes: additionalStats.median_wait || 0,
    };

    return snapshot;
  }

  /**
   * Update historical averages based on completed wait times
   */
  async updateHistoricalAverages(
    locationId: string,
    tenantId: string
  ): Promise<void> {
    logger.info('Updating historical wait time averages', { locationId });

    // Calculate averages from recent completed waits (last 30 days)
    await pool.query(
      `INSERT INTO wait_time_historical_averages (
        id, tenant_id, location_id, provider_id, day_of_week, hour_of_day,
        avg_wait_minutes, sample_count, std_deviation, computed_at
       )
       SELECT
        gen_random_uuid()::text,
        $1,
        $2,
        pqd.provider_id,
        EXTRACT(DOW FROM pqd.check_in_time)::integer,
        EXTRACT(HOUR FROM pqd.check_in_time)::integer,
        AVG(pqd.actual_wait_minutes),
        COUNT(*),
        STDDEV(pqd.actual_wait_minutes),
        NOW()
       FROM patient_queue_display pqd
       WHERE pqd.tenant_id = $1
         AND pqd.location_id = $2
         AND pqd.actual_wait_minutes IS NOT NULL
         AND pqd.check_in_time >= NOW() - interval '30 days'
       GROUP BY pqd.provider_id, EXTRACT(DOW FROM pqd.check_in_time), EXTRACT(HOUR FROM pqd.check_in_time)
       ON CONFLICT (tenant_id, location_id, COALESCE(provider_id, ''), day_of_week, hour_of_day)
       DO UPDATE SET
         avg_wait_minutes = EXCLUDED.avg_wait_minutes,
         sample_count = EXCLUDED.sample_count,
         std_deviation = EXCLUDED.std_deviation,
         computed_at = NOW()`,
      [tenantId, locationId]
    );
  }

  // ============================================
  // KIOSK CONFIGURATION MANAGEMENT
  // ============================================

  /**
   * Update kiosk configuration
   */
  async updateKioskConfig(
    locationId: string,
    tenantId: string,
    config: Partial<KioskConfig>
  ): Promise<KioskConfig> {
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO check_in_kiosk_config (
        id, tenant_id, location_id, display_mode, welcome_message,
        show_wait_time, custom_branding, anonymize_names, use_queue_numbers,
        show_provider_names, refresh_interval_seconds, show_estimated_times,
        show_queue_position, enable_sms_updates, sms_delay_threshold_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (tenant_id, location_id) DO UPDATE SET
         display_mode = COALESCE(EXCLUDED.display_mode, check_in_kiosk_config.display_mode),
         welcome_message = COALESCE(EXCLUDED.welcome_message, check_in_kiosk_config.welcome_message),
         show_wait_time = COALESCE(EXCLUDED.show_wait_time, check_in_kiosk_config.show_wait_time),
         custom_branding = COALESCE(EXCLUDED.custom_branding, check_in_kiosk_config.custom_branding),
         anonymize_names = COALESCE(EXCLUDED.anonymize_names, check_in_kiosk_config.anonymize_names),
         use_queue_numbers = COALESCE(EXCLUDED.use_queue_numbers, check_in_kiosk_config.use_queue_numbers),
         show_provider_names = COALESCE(EXCLUDED.show_provider_names, check_in_kiosk_config.show_provider_names),
         refresh_interval_seconds = COALESCE(EXCLUDED.refresh_interval_seconds, check_in_kiosk_config.refresh_interval_seconds),
         show_estimated_times = COALESCE(EXCLUDED.show_estimated_times, check_in_kiosk_config.show_estimated_times),
         show_queue_position = COALESCE(EXCLUDED.show_queue_position, check_in_kiosk_config.show_queue_position),
         enable_sms_updates = COALESCE(EXCLUDED.enable_sms_updates, check_in_kiosk_config.enable_sms_updates),
         sms_delay_threshold_minutes = COALESCE(EXCLUDED.sms_delay_threshold_minutes, check_in_kiosk_config.sms_delay_threshold_minutes),
         updated_at = NOW()`,
      [
        id,
        tenantId,
        locationId,
        config.displayMode || 'both',
        config.welcomeMessage || 'Welcome! Please check in for your appointment.',
        config.showWaitTime ?? true,
        JSON.stringify(config.customBranding || {}),
        config.anonymizeNames ?? false,
        config.useQueueNumbers ?? false,
        config.showProviderNames ?? true,
        config.refreshIntervalSeconds || 30,
        config.showEstimatedTimes ?? true,
        config.showQueuePosition ?? true,
        config.enableSmsUpdates ?? true,
        config.smsDelayThresholdMinutes || 15,
      ]
    );

    return this.getKioskConfig(locationId, tenantId);
  }
}

// Export singleton instance
export const waitTimeService = new WaitTimeService();
