/**
 * Referral Management Service
 * Handles incoming referrals, status tracking, closed-loop communication,
 * and integration with appointment scheduling and prior authorization.
 *
 * Key Workflows:
 * 1. Process incoming referrals from PCPs/specialists
 * 2. Track referral status through complete lifecycle
 * 3. Send updates to referring providers (closed-loop communication)
 * 4. Convert referrals to scheduled appointments
 * 5. Generate consultation reports for referring providers
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { auditLog } from './audit';
import crypto from 'crypto';

// =====================================================
// TYPES & INTERFACES
// =====================================================

export type ReferralStatus =
  | 'received'
  | 'verified'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'report_sent'
  | 'declined'
  | 'cancelled';

export type ReferralPriority = 'routine' | 'urgent' | 'stat';

export type InsuranceAuthStatus = 'not_required' | 'pending' | 'approved' | 'denied';

export type CommunicationChannel = 'fax' | 'email' | 'phone' | 'portal' | 'sms' | 'mail';

export interface IncomingReferralData {
  patientId: string;
  referringProviderId?: string;
  referringProviderName?: string;
  referringPractice?: string;
  priority?: ReferralPriority;
  diagnosisCodes?: string[];
  reason?: string;
  clinicalNotes?: string;
  insuranceAuthNumber?: string;
}

export interface ReferralStatusUpdate {
  status: ReferralStatus;
  notes?: string;
  changedBy: string;
}

export interface ProviderUpdateData {
  referralId: string;
  referringProviderId: string;
  subject: string;
  message: string;
  channel: CommunicationChannel;
  attachments?: { filename: string; url: string; type: string }[];
}

export interface ConvertToAppointmentData {
  referralId: string;
  patientId: string;
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface ClosedLoopReportData {
  referralId: string;
  encounterId?: string;
  diagnosis?: string[];
  treatmentPlan?: string;
  followUpRecommendations?: string;
  additionalNotes?: string;
}

export interface ReferralMetrics {
  totalReferrals: number;
  pendingVerification: number;
  awaitingScheduling: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  reportSent: number;
  highPriority: number;
  stalledReferrals: number;
  avgDaysToSchedule: number | null;
  conversionRate: number;
  closedLoopRate: number;
}

export interface StalledReferral {
  id: string;
  patientName: string;
  referringProvider: string;
  status: ReferralStatus;
  priority: ReferralPriority;
  daysStalled: number;
  reason: string;
  createdAt: Date;
}

// =====================================================
// REFERRAL SERVICE CLASS
// =====================================================

export class ReferralService {
  /**
   * Process an incoming referral
   * - Validates data
   * - Creates referral record
   * - Auto-acknowledges if provider preferences allow
   * - Triggers notifications
   */
  static async processIncomingReferral(
    tenantId: string,
    data: IncomingReferralData,
    userId: string
  ): Promise<{ referralId: string; referralNumber: string; autoAcknowledged: boolean }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate referral number
      const refNumResult = await client.query(
        `SELECT generate_referral_number($1) as ref_number`,
        [tenantId]
      );
      const referralNumber = refNumResult.rows[0].ref_number;

      const referralId = crypto.randomUUID();

      // Create referral record
      await client.query(
        `INSERT INTO referrals (
          id, tenant_id, patient_id, referring_provider_id,
          referring_provider, referring_practice,
          referral_number, status, priority,
          diagnosis_codes, reason, clinical_notes,
          insurance_auth_number, received_at,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, NOW(), NOW())`,
        [
          referralId,
          tenantId,
          data.patientId,
          data.referringProviderId || null,
          data.referringProviderName || null,
          data.referringPractice || null,
          referralNumber,
          'received',
          data.priority || 'routine',
          data.diagnosisCodes || null,
          data.reason || null,
          data.clinicalNotes || null,
          data.insuranceAuthNumber || null,
          userId,
        ]
      );

      // Create initial status history entry
      await client.query(
        `INSERT INTO referral_status_history (referral_id, status, changed_by, notes)
         VALUES ($1, 'received', $2, 'Referral received and logged')`,
        [referralId, userId]
      );

      // Check if auto-acknowledge is enabled for this referring provider
      let autoAcknowledged = false;
      if (data.referringProviderId) {
        const providerPrefs = await client.query(
          `SELECT preferences FROM referring_providers WHERE id = $1`,
          [data.referringProviderId]
        );

        if (providerPrefs.rows.length > 0) {
          const prefs = providerPrefs.rows[0].preferences || {};
          if (prefs.auto_acknowledge) {
            // Send auto-acknowledgment
            await this.sendProviderAcknowledgment(
              tenantId,
              referralId,
              data.referringProviderId,
              userId,
              client
            );
            autoAcknowledged = true;
          }
        }
      }

      await client.query('COMMIT');

      logger.info('Incoming referral processed', {
        tenantId,
        referralId,
        referralNumber,
        patientId: data.patientId,
        autoAcknowledged,
      });

      // Audit log
      await auditLog(tenantId, userId, 'referral_received', 'referral', referralId);

      return { referralId, referralNumber, autoAcknowledged };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing incoming referral', { error, tenantId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update referral status with history tracking
   * - Validates status transition
   * - Records status change in history
   * - Triggers notifications based on new status
   */
  static async updateReferralStatus(
    tenantId: string,
    referralId: string,
    update: ReferralStatusUpdate
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current status
      const currentResult = await client.query(
        `SELECT status, referring_provider_id, patient_id FROM referrals
         WHERE id = $1 AND tenant_id = $2`,
        [referralId, tenantId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Referral not found');
      }

      const currentStatus = currentResult.rows[0].status;
      const referringProviderId = currentResult.rows[0].referring_provider_id;

      // Validate status transition
      if (!this.isValidStatusTransition(currentStatus, update.status)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${update.status}`);
      }

      // Update status
      const updateFields: string[] = ['status = $1', 'updated_at = NOW()'];
      const updateValues: any[] = [update.status];
      let paramIndex = 2;

      // Set timestamp fields based on new status
      if (update.status === 'verified') {
        updateFields.push(`verified_at = NOW()`);
        updateFields.push(`verified_by = $${paramIndex++}`);
        updateValues.push(update.changedBy);
      } else if (update.status === 'report_sent') {
        updateFields.push(`report_sent_at = NOW()`);
        updateFields.push(`report_sent_by = $${paramIndex++}`);
        updateValues.push(update.changedBy);
      }

      updateValues.push(referralId, tenantId);

      await client.query(
        `UPDATE referrals SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
        updateValues
      );

      // Record in status history
      await client.query(
        `INSERT INTO referral_status_history (referral_id, status, previous_status, changed_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [referralId, update.status, currentStatus, update.changedBy, update.notes || null]
      );

      await client.query('COMMIT');

      // Send notification to referring provider if enabled
      if (referringProviderId && this.shouldNotifyOnStatusChange(update.status)) {
        try {
          await this.sendStatusUpdateNotification(
            tenantId,
            referralId,
            referringProviderId,
            update.status,
            update.changedBy
          );
        } catch (notifyError) {
          logger.error('Failed to send status update notification', {
            error: notifyError,
            referralId,
          });
          // Don't fail the status update if notification fails
        }
      }

      logger.info('Referral status updated', {
        tenantId,
        referralId,
        previousStatus: currentStatus,
        newStatus: update.status,
      });

      await auditLog(tenantId, update.changedBy, 'referral_status_update', 'referral', referralId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating referral status', { error, referralId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send update to referring provider
   * - Supports multiple channels (fax, email, portal, phone)
   * - Logs all communication
   */
  static async sendReferringProviderUpdate(
    tenantId: string,
    data: ProviderUpdateData,
    userId: string
  ): Promise<string> {
    const communicationId = crypto.randomUUID();

    // Log the communication
    await pool.query(
      `INSERT INTO referral_communications (
        id, referral_id, direction, channel, subject, message,
        attachments, status, sent_at, created_by
      ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, 'pending', NOW(), $7)`,
      [
        communicationId,
        data.referralId,
        data.channel,
        data.subject,
        data.message,
        JSON.stringify(data.attachments || []),
        userId,
      ]
    );

    // In production, this would integrate with actual fax/email services
    // For now, we simulate sending
    try {
      await this.simulateSendCommunication(data.channel, data);

      // Update status to sent
      await pool.query(
        `UPDATE referral_communications SET status = 'sent', sent_at = NOW()
         WHERE id = $1`,
        [communicationId]
      );

      logger.info('Referring provider update sent', {
        tenantId,
        referralId: data.referralId,
        channel: data.channel,
        communicationId,
      });
    } catch (error: any) {
      // Update status to failed
      await pool.query(
        `UPDATE referral_communications SET status = 'failed', error_message = $1
         WHERE id = $2`,
        [error.message, communicationId]
      );

      throw error;
    }

    return communicationId;
  }

  /**
   * Convert referral to appointment
   * - Creates appointment
   * - Links referral to appointment
   * - Updates referral status to 'scheduled'
   */
  static async convertReferralToAppointment(
    tenantId: string,
    data: ConvertToAppointmentData,
    userId: string
  ): Promise<{ appointmentId: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify referral exists and is in valid state
      const referralResult = await client.query(
        `SELECT status FROM referrals WHERE id = $1 AND tenant_id = $2`,
        [data.referralId, tenantId]
      );

      if (referralResult.rows.length === 0) {
        throw new Error('Referral not found');
      }

      const currentStatus = referralResult.rows[0].status;
      if (!['received', 'verified'].includes(currentStatus)) {
        throw new Error(`Cannot schedule appointment for referral in status: ${currentStatus}`);
      }

      // Check for appointment conflicts
      const conflictResult = await client.query(
        `SELECT 1 FROM appointments
         WHERE tenant_id = $1 AND provider_id = $2
         AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         LIMIT 1`,
        [tenantId, data.providerId, data.scheduledStart, data.scheduledEnd]
      );

      if (conflictResult.rows.length > 0) {
        throw new Error('Time conflict with existing appointment');
      }

      // Create appointment
      const appointmentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO appointments (
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')`,
        [
          appointmentId,
          tenantId,
          data.patientId,
          data.providerId,
          data.locationId,
          data.appointmentTypeId,
          data.scheduledStart,
          data.scheduledEnd,
        ]
      );

      // Update referral
      const scheduledDate = new Date(data.scheduledStart).toISOString().split('T')[0];
      await client.query(
        `UPDATE referrals SET
          appointment_id = $1,
          assigned_provider_id = $2,
          scheduled_date = $3,
          status = 'scheduled',
          updated_at = NOW()
         WHERE id = $4`,
        [appointmentId, data.providerId, scheduledDate, data.referralId]
      );

      // Record status change
      await client.query(
        `INSERT INTO referral_status_history (referral_id, status, previous_status, changed_by, notes)
         VALUES ($1, 'scheduled', $2, $3, $4)`,
        [data.referralId, currentStatus, userId, `Appointment scheduled for ${scheduledDate}`]
      );

      await client.query('COMMIT');

      logger.info('Referral converted to appointment', {
        tenantId,
        referralId: data.referralId,
        appointmentId,
        scheduledDate,
      });

      await auditLog(tenantId, userId, 'referral_scheduled', 'referral', data.referralId);

      return { appointmentId };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error converting referral to appointment', { error, referralId: data.referralId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate closed-loop report for referring provider
   * - Creates consultation report
   * - Sends to referring provider via preferred channel
   * - Updates referral status
   */
  static async generateClosedLoopReport(
    tenantId: string,
    data: ClosedLoopReportData,
    userId: string
  ): Promise<{ reportId: string; sent: boolean }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get referral details
      const referralResult = await client.query(
        `SELECT r.*, rp.name as provider_name, rp.preferences,
                p.first_name || ' ' || p.last_name as patient_name
         FROM referrals r
         LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
         JOIN patients p ON r.patient_id = p.id
         WHERE r.id = $1 AND r.tenant_id = $2`,
        [data.referralId, tenantId]
      );

      if (referralResult.rows.length === 0) {
        throw new Error('Referral not found');
      }

      const referral = referralResult.rows[0];

      // Generate report content
      const reportContent = this.generateReportContent(referral, data);

      // Create document record
      const reportId = crypto.randomUUID();
      await client.query(
        `INSERT INTO referral_documents (
          id, referral_id, document_type, filename, file_path,
          description, uploaded_by
        ) VALUES ($1, $2, 'consultation_report', $3, $4, $5, $6)`,
        [
          reportId,
          data.referralId,
          `consultation_report_${data.referralId}.pdf`,
          `/reports/${tenantId}/${reportId}.pdf`, // In production, this would be actual storage path
          'Closed-loop consultation report',
          userId,
        ]
      );

      // Send to referring provider if they have a provider ID
      let sent = false;
      if (referral.referring_provider_id) {
        const prefs = referral.preferences || {};
        if (prefs.send_closed_loop_reports !== false) {
          const channel = prefs.preferred_contact_method || 'fax';

          await this.sendReferringProviderUpdate(
            tenantId,
            {
              referralId: data.referralId,
              referringProviderId: referral.referring_provider_id,
              subject: `Consultation Report: ${referral.patient_name}`,
              message: reportContent,
              channel: channel as CommunicationChannel,
              attachments: [
                {
                  filename: `consultation_report_${data.referralId}.pdf`,
                  url: `/reports/${tenantId}/${reportId}.pdf`,
                  type: 'application/pdf',
                },
              ],
            },
            userId
          );
          sent = true;
        }
      }

      // Update referral status
      await client.query(
        `UPDATE referrals SET
          status = 'report_sent',
          report_sent_at = NOW(),
          report_sent_by = $1,
          updated_at = NOW()
         WHERE id = $2`,
        [userId, data.referralId]
      );

      await client.query(
        `INSERT INTO referral_status_history (referral_id, status, previous_status, changed_by, notes)
         VALUES ($1, 'report_sent', $2, $3, 'Consultation report generated and sent')`,
        [data.referralId, referral.status, userId]
      );

      await client.query('COMMIT');

      logger.info('Closed-loop report generated', {
        tenantId,
        referralId: data.referralId,
        reportId,
        sent,
      });

      await auditLog(tenantId, userId, 'referral_report_sent', 'referral', data.referralId);

      return { reportId, sent };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error generating closed-loop report', { error, referralId: data.referralId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check insurance authorization status
   * - Queries prior authorization system
   * - Updates referral with auth status
   */
  static async checkInsuranceAuthorization(
    tenantId: string,
    referralId: string,
    userId: string
  ): Promise<{ status: InsuranceAuthStatus; authNumber?: string; expiryDate?: string }> {
    // Get referral details
    const referralResult = await pool.query(
      `SELECT r.patient_id, r.diagnosis_codes,
              a.appointment_type_id
       FROM referrals r
       LEFT JOIN appointments a ON r.appointment_id = a.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [referralId, tenantId]
    );

    if (referralResult.rows.length === 0) {
      throw new Error('Referral not found');
    }

    const referral = referralResult.rows[0];

    // Check if prior auth is required (this would integrate with prior auth service)
    const priorAuthResult = await pool.query(
      `SELECT id, status, auth_number, expiration_date
       FROM prior_authorizations
       WHERE tenant_id = $1 AND patient_id = $2
       AND status = 'approved'
       AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, referral.patient_id]
    );

    let authStatus: InsuranceAuthStatus = 'not_required';
    let authNumber: string | undefined;
    let expiryDate: string | undefined;

    if (priorAuthResult.rows.length > 0) {
      const auth = priorAuthResult.rows[0];
      authStatus = auth.status === 'approved' ? 'approved' : 'pending';
      authNumber = auth.auth_number;
      expiryDate = auth.expiration_date;
    }

    // Update referral with auth status
    await pool.query(
      `UPDATE referrals SET
        insurance_auth_status = $1,
        insurance_auth_number = $2,
        insurance_auth_expiry = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [authStatus, authNumber || null, expiryDate || null, referralId]
    );

    logger.info('Insurance authorization checked', {
      tenantId,
      referralId,
      authStatus,
    });

    return { status: authStatus, authNumber, expiryDate };
  }

  /**
   * Get referral metrics for analytics
   */
  static async getReferralMetrics(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ReferralMetrics> {
    const dateFilter = startDate && endDate
      ? `AND r.created_at BETWEEN $2 AND $3`
      : '';

    const params: any[] = [tenantId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
    }

    const result = await pool.query(
      `WITH referral_stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'received') as pending_verification,
          COUNT(*) FILTER (WHERE status = 'verified') as awaiting_scheduling,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'report_sent') as report_sent,
          COUNT(*) FILTER (WHERE priority IN ('urgent', 'stat')) as high_priority,
          COUNT(*) FILTER (
            WHERE status IN ('received', 'verified')
            AND created_at < NOW() - INTERVAL '5 days'
          ) as stalled,
          AVG(
            EXTRACT(EPOCH FROM (scheduled_date - received_at::date)) / 86400
          ) FILTER (WHERE scheduled_date IS NOT NULL) as avg_days_to_schedule
        FROM referrals r
        WHERE tenant_id = $1 ${dateFilter}
      ),
      conversion_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE appointment_id IS NOT NULL)::FLOAT /
            NULLIF(COUNT(*), 0) * 100 as conversion_rate,
          COUNT(*) FILTER (WHERE report_sent_at IS NOT NULL)::FLOAT /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'report_sent')), 0) * 100 as closed_loop_rate
        FROM referrals r
        WHERE tenant_id = $1 ${dateFilter}
      )
      SELECT
        s.total,
        s.pending_verification,
        s.awaiting_scheduling,
        s.scheduled,
        s.in_progress,
        s.completed,
        s.report_sent,
        s.high_priority,
        s.stalled,
        s.avg_days_to_schedule,
        c.conversion_rate,
        c.closed_loop_rate
      FROM referral_stats s
      CROSS JOIN conversion_stats c`,
      params
    );

    const row = result.rows[0] || {};

    return {
      totalReferrals: parseInt(row.total) || 0,
      pendingVerification: parseInt(row.pending_verification) || 0,
      awaitingScheduling: parseInt(row.awaiting_scheduling) || 0,
      scheduled: parseInt(row.scheduled) || 0,
      inProgress: parseInt(row.in_progress) || 0,
      completed: parseInt(row.completed) || 0,
      reportSent: parseInt(row.report_sent) || 0,
      highPriority: parseInt(row.high_priority) || 0,
      stalledReferrals: parseInt(row.stalled) || 0,
      avgDaysToSchedule: row.avg_days_to_schedule ? parseFloat(row.avg_days_to_schedule) : null,
      conversionRate: parseFloat(row.conversion_rate) || 0,
      closedLoopRate: parseFloat(row.closed_loop_rate) || 0,
    };
  }

  /**
   * Get stalled referrals (> 5 days without scheduling)
   */
  static async getStalledReferrals(tenantId: string): Promise<StalledReferral[]> {
    const result = await pool.query(
      `SELECT
        r.id,
        p.first_name || ' ' || p.last_name as patient_name,
        COALESCE(rp.name, r.referring_provider, 'Unknown') as referring_provider,
        r.status,
        r.priority,
        EXTRACT(DAY FROM NOW() - r.created_at)::INT as days_stalled,
        r.reason,
        r.created_at
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
      WHERE r.tenant_id = $1
        AND r.status IN ('received', 'verified')
        AND r.created_at < NOW() - INTERVAL '5 days'
      ORDER BY r.priority DESC, r.created_at ASC`,
      [tenantId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      patientName: row.patient_name,
      referringProvider: row.referring_provider,
      status: row.status,
      priority: row.priority,
      daysStalled: row.days_stalled,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private static isValidStatusTransition(from: ReferralStatus, to: ReferralStatus): boolean {
    const validTransitions: Record<ReferralStatus, ReferralStatus[]> = {
      received: ['verified', 'scheduled', 'declined', 'cancelled'],
      verified: ['scheduled', 'declined', 'cancelled'],
      scheduled: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: ['report_sent'],
      report_sent: [],
      declined: [],
      cancelled: [],
    };

    return validTransitions[from]?.includes(to) || false;
  }

  private static shouldNotifyOnStatusChange(status: ReferralStatus): boolean {
    const notifyStatuses: ReferralStatus[] = ['verified', 'scheduled', 'completed', 'report_sent'];
    return notifyStatuses.includes(status);
  }

  private static async sendProviderAcknowledgment(
    tenantId: string,
    referralId: string,
    providerId: string,
    userId: string,
    client: any
  ): Promise<void> {
    const message = 'Your referral has been received and is being processed. ' +
      'We will contact you with updates as the patient progresses through care.';

    await client.query(
      `INSERT INTO referral_communications (
        referral_id, direction, channel, subject, message, status, sent_at, created_by
      ) VALUES ($1, 'outbound', 'portal', 'Referral Acknowledgment', $2, 'sent', NOW(), $3)`,
      [referralId, message, userId]
    );
  }

  private static async sendStatusUpdateNotification(
    tenantId: string,
    referralId: string,
    providerId: string,
    status: ReferralStatus,
    userId: string
  ): Promise<void> {
    const statusMessages: Record<ReferralStatus, string> = {
      received: 'Referral has been received.',
      verified: 'Referral has been verified and is awaiting scheduling.',
      scheduled: 'Patient has been scheduled for an appointment.',
      in_progress: 'Patient is currently in care.',
      completed: 'Patient visit has been completed.',
      report_sent: 'Consultation report has been sent.',
      declined: 'Referral has been declined.',
      cancelled: 'Referral has been cancelled.',
    };

    const message = statusMessages[status] || `Status updated to: ${status}`;

    await pool.query(
      `INSERT INTO referral_communications (
        referral_id, direction, channel, subject, message, status, sent_at, created_by
      ) VALUES ($1, 'outbound', 'portal', 'Referral Status Update', $2, 'sent', NOW(), $3)`,
      [referralId, message, userId]
    );
  }

  private static async simulateSendCommunication(
    channel: CommunicationChannel,
    data: ProviderUpdateData
  ): Promise<void> {
    // In production, this would integrate with actual services:
    // - fax: Send via fax service (e.g., Twilio Fax)
    // - email: Send via email service
    // - sms: Send via SMS service (Twilio)
    // - portal: Update provider portal

    logger.info('Simulating communication send', {
      channel,
      referralId: data.referralId,
      subject: data.subject,
    });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private static generateReportContent(referral: any, data: ClosedLoopReportData): string {
    const report = `
CONSULTATION REPORT

Patient: ${referral.patient_name}
Referral Number: ${referral.referral_number}
Date of Visit: ${new Date().toLocaleDateString()}

REASON FOR REFERRAL:
${referral.reason || 'Not specified'}

CLINICAL FINDINGS:
${data.diagnosis?.join(', ') || 'See attached documentation'}

TREATMENT PLAN:
${data.treatmentPlan || 'See attached documentation'}

FOLLOW-UP RECOMMENDATIONS:
${data.followUpRecommendations || 'As needed'}

ADDITIONAL NOTES:
${data.additionalNotes || 'None'}

Thank you for the referral. Please contact us if you have any questions.
    `.trim();

    return report;
  }

  // =====================================================
  // EVENT ORCHESTRATION HELPER METHODS
  // =====================================================

  /**
   * Notify referring provider of a referral event
   */
  static async notifyReferringProvider(
    tenantId: string,
    referralId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<boolean> {
    const referralResult = await pool.query(
      `SELECT r.*, rp.name as provider_name, rp.email, rp.fax
       FROM referrals r
       LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [referralId, tenantId]
    );

    if (!referralResult.rowCount) {
      return false;
    }

    const referral = referralResult.rows[0];

    // Log the notification
    await pool.query(
      `INSERT INTO referral_communications (
        referral_id, direction, channel, subject, message, status, sent_at
      ) VALUES ($1, 'outbound', 'portal', $2, $3, 'sent', NOW())`,
      [
        referralId,
        `Referral Update: ${eventType}`,
        data.message || `Your referral has been ${eventType}.`,
      ]
    );

    logger.info('Referring provider notified', { referralId, eventType, tenantId });
    return true;
  }

  /**
   * Generate consultation report for a completed referral
   */
  static async generateConsultationReport(
    tenantId: string,
    referralId: string,
    encounterId?: string
  ): Promise<{ id: string; content: string } | null> {
    const referralResult = await pool.query(
      `SELECT r.*, p.first_name || ' ' || p.last_name as patient_name
       FROM referrals r
       JOIN patients p ON r.patient_id = p.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [referralId, tenantId]
    );

    if (!referralResult.rowCount) {
      return null;
    }

    const referral = referralResult.rows[0];

    // Get encounter data if available
    let encounterData: any = {};
    if (encounterId) {
      const encResult = await pool.query(
        `SELECT e.*,
         (SELECT array_agg(icd10_code) FROM encounter_diagnoses WHERE encounter_id = e.id) as diagnoses,
         (SELECT array_agg(cpt_code) FROM encounter_procedures WHERE encounter_id = e.id) as procedures
         FROM encounters e WHERE e.id = $1`,
        [encounterId]
      );
      if (encResult.rowCount) {
        encounterData = encResult.rows[0];
      }
    }

    const reportContent = this.generateReportContent(referral, {
      referralId: referral.id,
      encounterId: encounterId,
      diagnosis: encounterData.diagnoses || [],
      treatmentPlan: encounterData.assessment_plan || 'See clinical notes',
      followUpRecommendations: encounterData.follow_up || 'As needed',
    });

    const reportId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO referral_reports (id, tenant_id, referral_id, encounter_id, content, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [reportId, tenantId, referralId, encounterId, reportContent]
    );

    return { id: reportId, content: reportContent };
  }

  /**
   * Send report to referring provider
   */
  static async sendReportToReferringProvider(
    tenantId: string,
    referralId: string,
    reportId?: string
  ): Promise<boolean> {
    const referralResult = await pool.query(
      `SELECT r.*, rp.preferred_communication, rp.fax, rp.email
       FROM referrals r
       LEFT JOIN referring_providers rp ON r.referring_provider_id = rp.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [referralId, tenantId]
    );

    if (!referralResult.rowCount) {
      return false;
    }

    const referral = referralResult.rows[0];

    // Log the report sending
    await pool.query(
      `INSERT INTO referral_communications (
        referral_id, direction, channel, subject, message, status, sent_at
      ) VALUES ($1, 'outbound', $2, 'Consultation Report', 'Consultation report attached', 'sent', NOW())`,
      [referralId, referral.preferred_communication || 'portal']
    );

    // Update referral status to report_sent
    await pool.query(
      `UPDATE referrals SET status = 'report_sent', report_sent_at = NOW() WHERE id = $1`,
      [referralId]
    );

    logger.info('Report sent to referring provider', { referralId, tenantId });
    return true;
  }

  /**
   * Close the referral loop
   */
  static async closeReferralLoop(
    tenantId: string,
    referralId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE referrals
       SET closed_loop = true,
           closed_loop_at = NOW(),
           status = CASE WHEN status = 'completed' THEN 'report_sent' ELSE status END
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [referralId, tenantId]
    );

    if (!result.rowCount) {
      return false;
    }

    logger.info('Referral loop closed', { referralId, tenantId });
    return true;
  }
}

// Export for convenience
export const referralService = ReferralService;
