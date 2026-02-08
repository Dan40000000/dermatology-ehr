/**
 * Biopsy Service
 * Business logic for biopsy tracking system
 * Critical for patient safety - comprehensive specimen tracking
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

interface BiopsySpecimenIdParams {
  tenantId: string;
  date?: Date;
}

interface BiopsyNotificationParams {
  biopsyId: string;
  tenantId: string;
  type: 'result_available' | 'overdue' | 'malignancy' | 'followup_required';
  recipientType: 'provider' | 'patient';
}

export class BiopsyService {
  /**
   * Generate unique specimen ID in format: BX-YYYYMMDD-XXX
   * Critical for specimen tracking and chain of custody
   */
  static async generateSpecimenId(params: BiopsySpecimenIdParams): Promise<string> {
    const { tenantId, date = new Date() } = params;

    // Format date as YYYYMMDD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Get count of biopsies created today for this tenant
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM biopsies
       WHERE tenant_id = $1
         AND DATE(ordered_at) = DATE($2)`,
      [tenantId, date]
    );

    const count = parseInt(countResult.rows[0].count) + 1;
    const sequenceStr = String(count).padStart(3, '0');

    return `BX-${dateStr}-${sequenceStr}`;
  }

  /**
   * Calculate turnaround time metrics
   */
  static calculateTurnaroundTime(sentAt: Date | null, resultedAt: Date | null): number | null {
    if (!sentAt || !resultedAt) return null;

    const diffTime = Math.abs(resultedAt.getTime() - sentAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Check if biopsy is overdue (>7 days without result)
   * Critical safety check
   */
  static isOverdue(sentAt: Date | null, resultedAt: Date | null, status: string): boolean {
    if (!sentAt || resultedAt || ['resulted', 'reviewed', 'closed'].includes(status)) {
      return false;
    }

    const now = new Date();
    const diffTime = now.getTime() - sentAt.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    return diffDays > 7;
  }

  /**
   * Get all overdue biopsies for a tenant
   * Used for safety alerts and dashboard
   */
  static async getOverdueBiopsies(tenantId: string) {
    const query = `
      SELECT
        b.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        pr.email as ordering_provider_email,
        EXTRACT(DAY FROM (NOW() - b.sent_at))::INTEGER as days_overdue
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers pr ON b.ordering_provider_id = pr.id
      WHERE b.tenant_id = $1
        AND b.is_overdue = true
        AND b.status NOT IN ('resulted', 'reviewed', 'closed')
        AND b.deleted_at IS NULL
      ORDER BY b.sent_at ASC
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Get biopsies pending review
   * Critical workflow step - results received but not reviewed
   */
  static async getPendingReviewBiopsies(tenantId: string, providerId?: string) {
    let query = `
      SELECT
        b.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob as date_of_birth,
        pr.first_name || ' ' || pr.last_name as ordering_provider_name,
        EXTRACT(DAY FROM (NOW() - b.resulted_at))::INTEGER as days_since_result
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers pr ON b.ordering_provider_id = pr.id
      WHERE b.tenant_id = $1
        AND b.status = 'resulted'
        AND b.deleted_at IS NULL
    `;

    const params: any[] = [tenantId];

    if (providerId) {
      query += ` AND b.ordering_provider_id = $2`;
      params.push(providerId);
    }

    query += ` ORDER BY b.resulted_at ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get biopsy statistics for dashboard
   */
  static async getBiopsyStats(tenantId: string, providerId?: string) {
    const params: any[] = [tenantId];
    let providerFilter = '';

    if (providerId) {
      providerFilter = 'AND b.ordering_provider_id = $2';
      params.push(providerId);
    }

    const query = `
      SELECT
        COUNT(*) FILTER (WHERE b.status = 'ordered') as ordered_count,
        COUNT(*) FILTER (WHERE b.status = 'collected') as collected_count,
        COUNT(*) FILTER (WHERE b.status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE b.status = 'resulted') as pending_review_count,
        COUNT(*) FILTER (WHERE b.is_overdue = true AND b.status NOT IN ('resulted', 'reviewed', 'closed')) as overdue_count,
        COUNT(*) FILTER (WHERE b.malignancy_type IS NOT NULL) as malignancy_count,
        COUNT(*) FILTER (WHERE b.malignancy_type = 'melanoma') as melanoma_count,
        COUNT(*) FILTER (WHERE b.status = 'reviewed' AND b.patient_notified = false) as needs_patient_notification,
        AVG(b.turnaround_time_days) FILTER (WHERE b.turnaround_time_days IS NOT NULL) as avg_turnaround_days,
        COUNT(*) as total_biopsies_all_time,
        COUNT(*) FILTER (WHERE b.ordered_at > NOW() - INTERVAL '30 days') as biopsies_last_30_days
      FROM biopsies b
      WHERE b.tenant_id = $1
        AND b.deleted_at IS NULL
        ${providerFilter}
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Link biopsy to lesion on body map
   */
  static async linkBiopsyToLesion(biopsyId: string, lesionId: string, tenantId: string) {
    const query = `
      UPDATE biopsies
      SET lesion_id = $1,
          updated_at = NOW()
      WHERE id = $2
        AND tenant_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [lesionId, biopsyId, tenantId]);
    return result.rows[0];
  }

  /**
   * Update lesion status when biopsy is performed
   */
  static async updateLesionStatusForBiopsy(lesionId: string, biopsyId: string) {
    const query = `
      UPDATE patient_body_markings
      SET status = 'biopsied',
          description = COALESCE(description, '') ||
            E'\nBiopsy performed: ' || (SELECT specimen_id FROM biopsies WHERE id = $1),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [biopsyId, lesionId]);
    return result.rows[0];
  }

  /**
   * Create alert for biopsy
   */
  static async createAlert(params: {
    biopsyId: string;
    tenantId: string;
    alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
  }) {
    const { biopsyId, tenantId, alertType, severity, title, message } = params;

    const query = `
      INSERT INTO biopsy_alerts (
        biopsy_id,
        tenant_id,
        alert_type,
        severity,
        title,
        message
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      biopsyId,
      tenantId,
      alertType,
      severity,
      title,
      message
    ]);

    return result.rows[0];
  }

  /**
   * Send notifications for biopsy events
   * Integrates with notification system (email, SMS, in-app)
   */
  static async sendNotification(params: BiopsyNotificationParams): Promise<void> {
    const { biopsyId, tenantId, type, recipientType } = params;

    // Get biopsy details
    const biopsyQuery = `
      SELECT
        b.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.email as patient_email,
        p.phone as patient_phone,
        pr.first_name || ' ' || pr.last_name as provider_name,
        pr.email as provider_email
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers pr ON b.ordering_provider_id = pr.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `;

    const biopsyResult = await pool.query(biopsyQuery, [biopsyId, tenantId]);
    if (biopsyResult.rows.length === 0) {
      throw new Error('Biopsy not found');
    }

    const biopsy = biopsyResult.rows[0];

    // Build notification content based on type
    let subject = '';
    let message = '';

    switch (type) {
      case 'result_available':
        subject = `Biopsy Result Available: ${biopsy.specimen_id}`;
        message = `Pathology results are now available for biopsy ${biopsy.specimen_id} (Patient: ${biopsy.patient_name}). Please review and take appropriate action.`;
        break;

      case 'overdue':
        subject = `URGENT: Overdue Biopsy Result - ${biopsy.specimen_id}`;
        message = `Biopsy ${biopsy.specimen_id} (Patient: ${biopsy.patient_name}) was sent ${biopsy.days_overdue} days ago and no result has been received. Please follow up with pathology lab.`;
        break;

      case 'malignancy':
        subject = `CRITICAL: Malignancy Detected - ${biopsy.specimen_id}`;
        message = `Malignancy detected in biopsy ${biopsy.specimen_id} (Patient: ${biopsy.patient_name}). Diagnosis: ${biopsy.malignancy_type}. Immediate review and follow-up required.`;
        break;

      case 'followup_required':
        subject = `Follow-up Required: ${biopsy.specimen_id}`;
        message = `Biopsy ${biopsy.specimen_id} requires follow-up action: ${biopsy.follow_up_action}. Patient: ${biopsy.patient_name}.`;
        break;
    }

    // Log notification (actual implementation would integrate with notification service)
    logger.info('Biopsy notification', {
      biopsyId,
      type,
      recipientType,
      subject,
      recipient: recipientType === 'provider' ? biopsy.provider_email : biopsy.patient_email
    });

    // TODO: Integrate with actual notification service (email/SMS/in-app)
    // This would call services like Twilio, SendGrid, or internal notification system
  }

  /**
   * Validate biopsy data before creation/update
   */
  static validateBiopsyData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!data.patient_id) errors.push('Patient ID is required');
    if (!data.ordering_provider_id) errors.push('Ordering provider is required');
    if (!data.body_location) errors.push('Body location is required');
    if (!data.specimen_type) errors.push('Specimen type is required');
    if (!data.path_lab) errors.push('Pathology lab is required');

    // Specimen type validation
    const validSpecimenTypes = ['punch', 'shave', 'excisional', 'incisional'];
    if (data.specimen_type && !validSpecimenTypes.includes(data.specimen_type)) {
      errors.push(`Invalid specimen type. Must be one of: ${validSpecimenTypes.join(', ')}`);
    }

    // Status validation
    const validStatuses = [
      'ordered',
      'collected',
      'sent',
      'received_by_lab',
      'processing',
      'resulted',
      'reviewed',
      'closed'
    ];
    if (data.status && !validStatuses.includes(data.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Track specimen in chain of custody
   */
  static async trackSpecimen(params: {
    biopsyId: string;
    eventType: string;
    eventBy?: string;
    location?: string;
    custodyPerson?: string;
    specimenQuality?: string;
    notes?: string;
  }) {
    const { biopsyId, eventType, eventBy, location, custodyPerson, specimenQuality, notes } = params;

    const query = `
      INSERT INTO biopsy_specimen_tracking (
        biopsy_id,
        event_type,
        event_by,
        location,
        custody_person,
        specimen_quality,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      biopsyId,
      eventType,
      eventBy || null,
      location || null,
      custodyPerson || null,
      specimenQuality || null,
      notes || null
    ]);

    return result.rows[0];
  }

  /**
   * Get quality metrics for reporting
   */
  static async getQualityMetrics(tenantId: string, startDate?: Date, endDate?: Date) {
    const params: any[] = [tenantId];
    let dateFilter = '';

    if (startDate && endDate) {
      dateFilter = 'AND b.ordered_at BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }

    const query = `
      SELECT
        COUNT(*) as total_biopsies,
        AVG(b.turnaround_time_days) as avg_turnaround_days,
        MAX(b.turnaround_time_days) as max_turnaround_days,
        MIN(b.turnaround_time_days) as min_turnaround_days,
        COUNT(*) FILTER (WHERE b.turnaround_time_days <= 7) as within_7_days,
        COUNT(*) FILTER (WHERE b.turnaround_time_days > 7) as over_7_days,
        COUNT(*) FILTER (WHERE b.is_overdue = true) as total_overdue,
        COUNT(*) FILTER (WHERE b.malignancy_type IS NOT NULL) as total_malignancies,
        COUNT(*) FILTER (WHERE b.malignancy_type = 'melanoma') as total_melanoma,
        COUNT(*) FILTER (WHERE b.patient_notified = true) as patients_notified,
        COUNT(*) FILTER (WHERE b.status = 'closed') as completed_biopsies,
        ROUND(
          (COUNT(*) FILTER (WHERE b.turnaround_time_days <= 7)::NUMERIC /
           NULLIF(COUNT(*) FILTER (WHERE b.turnaround_time_days IS NOT NULL), 0)) * 100,
          2
        ) as within_7_days_percentage
      FROM biopsies b
      WHERE b.tenant_id = $1
        AND b.deleted_at IS NULL
        ${dateFilter}
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Generate biopsy report data for export
   */
  static async exportBiopsyLog(tenantId: string, filters?: any) {
    const params: any[] = [tenantId];
    let filterQuery = '';
    let paramIndex = 2;

    if (filters?.startDate) {
      filterQuery += ` AND b.ordered_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      filterQuery += ` AND b.ordered_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.providerId) {
      filterQuery += ` AND b.ordering_provider_id = $${paramIndex}`;
      params.push(filters.providerId);
      paramIndex++;
    }

    const query = `
      SELECT
        b.specimen_id,
        b.ordered_at,
        b.collected_at,
        b.sent_at,
        b.resulted_at,
        b.reviewed_at,
        b.status,
        p.mrn,
        p.first_name || ' ' || p.last_name as patient_name,
        p.dob as date_of_birth,
        b.body_location,
        b.specimen_type,
        b.clinical_description,
        b.pathology_diagnosis,
        b.malignancy_type,
        b.diagnosis_code,
        b.diagnosis_description,
        b.margins,
        b.follow_up_action,
        b.patient_notified,
        b.turnaround_time_days,
        ordering_pr.first_name || ' ' || ordering_pr.last_name as ordering_provider,
        reviewing_pr.first_name || ' ' || reviewing_pr.last_name as reviewing_provider,
        b.path_lab,
        b.path_lab_case_number
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      JOIN providers ordering_pr ON b.ordering_provider_id = ordering_pr.id
      LEFT JOIN providers reviewing_pr ON b.reviewing_provider_id = reviewing_pr.id
      WHERE b.tenant_id = $1
        AND b.deleted_at IS NULL
        ${filterQuery}
      ORDER BY b.ordered_at DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }
}
