/**
 * Prior Authorization Service
 * Business logic for PA workflow, expiration tracking, stats calculation
 * CRITICAL: Staff spend 3.5 hours/day on PAs - this service aims to save that time
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

export interface PriorAuthStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  expiring_soon: number; // Within 30 days
  expiring_urgent: number; // Within 7 days
  avg_days_pending: number;
  success_rate: number; // % approved on first submission
  total_resubmissions: number;
}

export interface ExpiringPA {
  id: string;
  patient_name: string;
  medication_name: string;
  procedure_code: string;
  expiration_date: string;
  days_until_expiration: number;
  auth_number: string;
  payer_name: string;
}

export interface PriorAuthNotification {
  type: 'expiring_soon' | 'overdue' | 'status_change' | 'denial';
  prior_auth_id: string;
  patient_id: string;
  message: string;
  urgency: 'low' | 'medium' | 'high';
}

export class PriorAuthService {
  /**
   * Generate unique reference number for PA tracking
   * Format: PA-YYYYMMDD-XXXXXX
   */
  static async generateReferenceNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Get count of PAs created today
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM prior_authorizations
       WHERE tenant_id = $1
         AND DATE(created_at) = CURRENT_DATE`,
      [tenantId]
    );

    const count = parseInt(countResult.rows[0].count) + 1;
    const sequenceStr = String(count).padStart(6, '0');

    return `PA-${dateStr}-${sequenceStr}`;
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(tenantId: string): Promise<PriorAuthStats> {
    const statsQuery = `
      WITH pa_stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending' OR status = 'submitted') as pending,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'denied') as denied,
          COUNT(*) FILTER (WHERE status = 'approved' AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon,
          COUNT(*) FILTER (WHERE status = 'approved' AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as expiring_urgent,
          AVG(days_pending) FILTER (WHERE status IN ('pending', 'submitted')) as avg_days_pending,
          SUM(resubmission_count) as total_resubmissions,
          COUNT(*) FILTER (WHERE status = 'approved' AND resubmission_count = 0) as first_time_success,
          COUNT(*) FILTER (WHERE status IN ('approved', 'denied')) as total_decided
        FROM prior_authorizations
        WHERE tenant_id = $1
          AND created_at > NOW() - INTERVAL '90 days'
      )
      SELECT
        total,
        pending,
        approved,
        denied,
        expiring_soon,
        expiring_urgent,
        COALESCE(avg_days_pending, 0) as avg_days_pending,
        COALESCE(total_resubmissions, 0) as total_resubmissions,
        CASE
          WHEN total_decided > 0 THEN (first_time_success::FLOAT / total_decided::FLOAT * 100)
          ELSE 0
        END as success_rate
      FROM pa_stats
    `;

    const result = await pool.query(statsQuery, [tenantId]);

    if (result.rows.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        denied: 0,
        expiring_soon: 0,
        expiring_urgent: 0,
        avg_days_pending: 0,
        success_rate: 0,
        total_resubmissions: 0,
      };
    }

    return {
      total: parseInt(result.rows[0].total),
      pending: parseInt(result.rows[0].pending),
      approved: parseInt(result.rows[0].approved),
      denied: parseInt(result.rows[0].denied),
      expiring_soon: parseInt(result.rows[0].expiring_soon),
      expiring_urgent: parseInt(result.rows[0].expiring_urgent),
      avg_days_pending: parseFloat(result.rows[0].avg_days_pending).toFixed(1) as any,
      success_rate: parseFloat(result.rows[0].success_rate).toFixed(1) as any,
      total_resubmissions: parseInt(result.rows[0].total_resubmissions),
    };
  }

  /**
   * Get expiring PAs (critical for biologics that need annual renewal)
   */
  static async getExpiringPAs(tenantId: string, daysThreshold: number = 30): Promise<ExpiringPA[]> {
    const query = `
      SELECT
        pa.id,
        p.first_name || ' ' || p.last_name as patient_name,
        pa.medication_name,
        pa.procedure_code,
        pa.expiration_date,
        (pa.expiration_date - CURRENT_DATE) as days_until_expiration,
        pa.auth_number,
        pa.payer_name
      FROM prior_authorizations pa
      JOIN patients p ON pa.patient_id = p.id
      WHERE pa.tenant_id = $1
        AND pa.status = 'approved'
        AND pa.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${daysThreshold} days'
      ORDER BY pa.expiration_date ASC
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Add status history entry and update main PA record
   */
  static async updateStatus(
    priorAuthId: string,
    tenantId: string,
    status: string,
    notes: string | null,
    referenceNumber: string | null,
    contactedPerson: string | null,
    contactMethod: string | null,
    userId: string
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Add to status history
      await client.query(
        `INSERT INTO prior_auth_status_history
         (prior_auth_id, status, notes, reference_number, contacted_person, contact_method, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [priorAuthId, status, notes, referenceNumber, contactedPerson, contactMethod, userId]
      );

      // Update main PA record
      const updateFields: string[] = ['status = $2', 'updated_by = $3', 'updated_at = NOW()'];
      const updateValues: any[] = [priorAuthId, status, userId];

      if (status === 'submitted' && notes) {
        // Track first submission date
        updateFields.push('first_submission_date = COALESCE(first_submission_date, NOW())');
        updateFields.push('submitted_at = NOW()');
      }

      if (status === 'approved') {
        updateFields.push('decision_at = NOW()');
      }

      if (status === 'denied') {
        updateFields.push('decision_at = NOW()');
      }

      await client.query(
        `UPDATE prior_authorizations
         SET ${updateFields.join(', ')}
         WHERE id = $1 AND tenant_id = $4`,
        [...updateValues, tenantId]
      );

      await client.query('COMMIT');

      logger.info(`PA status updated: ${priorAuthId} -> ${status}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating PA status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add communication log entry
   */
  static async addCommunicationLog(
    priorAuthId: string,
    tenantId: string,
    logEntry: {
      type: 'phone' | 'fax' | 'portal' | 'email' | 'mail';
      direction: 'inbound' | 'outbound';
      notes: string;
      contactPerson?: string;
      referenceNumber?: string;
    },
    userId: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const entry = {
      ...logEntry,
      timestamp,
      userId,
    };

    await pool.query(
      `UPDATE prior_authorizations
       SET communication_log = communication_log || $1::jsonb,
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $3 AND tenant_id = $4`,
      [JSON.stringify(entry), userId, priorAuthId, tenantId]
    );

    logger.info(`Communication log added to PA ${priorAuthId}: ${logEntry.type} ${logEntry.direction}`);
  }

  /**
   * Check for expiring PAs and generate notifications
   */
  static async checkExpirations(tenantId: string): Promise<PriorAuthNotification[]> {
    const notifications: PriorAuthNotification[] = [];

    // Get PAs expiring within 30 days
    const expiringSoon = await this.getExpiringPAs(tenantId, 30);

    for (const pa of expiringSoon) {
      const urgency = pa.days_until_expiration <= 7 ? 'high' : pa.days_until_expiration <= 14 ? 'medium' : 'low';

      notifications.push({
        type: 'expiring_soon',
        prior_auth_id: pa.id,
        patient_id: '', // Would need to join to get this
        message: `${pa.medication_name || pa.procedure_code} authorization for ${pa.patient_name} expires in ${pa.days_until_expiration} days`,
        urgency,
      });
    }

    return notifications;
  }

  /**
   * Calculate success metrics for reporting
   */
  static async getSuccessMetrics(tenantId: string, startDate: Date, endDate: Date) {
    const query = `
      SELECT
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'denied') as denied_count,
        COUNT(*) FILTER (WHERE status = 'approved' AND resubmission_count = 0) as first_time_approvals,
        AVG(EXTRACT(DAY FROM (decision_at - submitted_at))) FILTER (WHERE decision_at IS NOT NULL AND submitted_at IS NOT NULL) as avg_decision_days,
        AVG(resubmission_count) as avg_resubmissions,
        COUNT(DISTINCT assigned_to) as staff_count,
        auth_type,
        COUNT(*) as count_by_type
      FROM prior_authorizations
      WHERE tenant_id = $1
        AND submitted_at BETWEEN $2 AND $3
      GROUP BY auth_type
    `;

    const result = await pool.query(query, [tenantId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get PAs for a specific patient (useful for patient chart view)
   */
  static async getPatientPAs(patientId: string, tenantId: string) {
    const query = `
      SELECT
        pa.*,
        (
          SELECT COUNT(*)
          FROM prior_auth_appeals
          WHERE prior_auth_id = pa.id
        ) as appeal_count,
        (
          SELECT json_agg(
            json_build_object(
              'status', status,
              'notes', notes,
              'created_at', created_at,
              'contacted_person', contacted_person
            )
            ORDER BY created_at DESC
          )
          FROM prior_auth_status_history
          WHERE prior_auth_id = pa.id
          LIMIT 10
        ) as recent_history
      FROM prior_authorizations pa
      WHERE pa.patient_id = $1
        AND pa.tenant_id = $2
      ORDER BY pa.created_at DESC
    `;

    const result = await pool.query(query, [patientId, tenantId]);
    return result.rows;
  }

  /**
   * Auto-expire approved PAs that are past expiration date
   */
  static async expireOutdatedPAs(tenantId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE prior_authorizations
       SET status = 'expired',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND status = 'approved'
         AND expiration_date < CURRENT_DATE
       RETURNING id`,
      [tenantId]
    );

    const expiredCount = result.rows.length;

    if (expiredCount > 0) {
      logger.info(`Auto-expired ${expiredCount} PAs for tenant ${tenantId}`);
    }

    return expiredCount;
  }

  /**
   * Get template suggestions based on medication or procedure
   */
  static async getSuggestedTemplates(
    tenantId: string,
    authType: string,
    medicationName?: string,
    procedureCode?: string
  ) {
    const query = `
      SELECT *
      FROM prior_auth_templates
      WHERE (tenant_id = $1 OR tenant_id = 'default')
        AND auth_type = $2
        AND is_active = true
        AND (
          medication_name IS NULL
          OR medication_name ILIKE $3
          OR $3 ILIKE '%' || medication_name || '%'
        )
      ORDER BY tenant_id DESC, usage_count DESC
      LIMIT 5
    `;

    const result = await pool.query(query, [tenantId, authType, medicationName || procedureCode || '']);
    return result.rows;
  }

  /**
   * Increment template usage counter
   */
  static async incrementTemplateUsage(templateId: string): Promise<void> {
    await pool.query(
      `UPDATE prior_auth_templates
       SET usage_count = usage_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [templateId]
    );
  }
}
