/**
 * Biopsy Service
 * Business logic for biopsy tracking system
 * Critical for patient safety - comprehensive specimen tracking
 */

import { pool } from '../db/pool';
import { getTableColumns } from '../db/schema';
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

type BiopsySeverity = 'low' | 'medium' | 'high' | 'critical';

interface BiopsySafetyFlag {
  id: string;
  type: string;
  severity: BiopsySeverity;
  title: string;
  message: string;
  action: string;
}

interface BiopsyCommandCenterItem {
  [key: string]: any;
  days_since_ordered: number | null;
  days_since_sent: number | null;
  days_since_result: number | null;
  days_since_review: number | null;
  safety_flags: BiopsySafetyFlag[];
  highest_severity: BiopsySeverity | null;
  safety_stage: string;
  loop_status: string;
  next_action: string;
}

const severityRank: Record<BiopsySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: unknown, end: Date = new Date()): number | null {
  const startDate = asDate(start);
  if (!startDate) return null;
  return Math.max(0, Math.floor((end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function highestSeverity(flags: BiopsySafetyFlag[]): BiopsySeverity | null {
  if (flags.length === 0) return null;
  return flags.reduce<BiopsySeverity>((highest, flag) => (
    severityRank[flag.severity] > severityRank[highest] ? flag.severity : highest
  ), flags[0]!.severity);
}

function isTreatmentAction(action: unknown): boolean {
  return ['reexcision', 'mohs', 'oncology_referral', 'dermatology_followup'].includes(String(action || ''));
}

function emptySafetyCommandCenter(now = new Date()) {
  return {
    generated_at: now.toISOString(),
    summary: {
      total_open_loops: 0,
      overdue_results: 0,
      pending_review: 0,
      needs_patient_notification: 0,
      needs_treatment_scheduling: 0,
      open_malignancies: 0,
      open_melanomas: 0,
      closed_loop_complete: 0,
      critical_items: 0,
      avg_turnaround_days: null,
    },
    queues: {
      critical: [] as BiopsyCommandCenterItem[],
      pendingResults: [] as BiopsyCommandCenterItem[],
      pendingReview: [] as BiopsyCommandCenterItem[],
      pendingNotification: [] as BiopsyCommandCenterItem[],
      treatmentFollowUp: [] as BiopsyCommandCenterItem[],
      closed: [] as BiopsyCommandCenterItem[],
    },
    biopsies: [] as BiopsyCommandCenterItem[],
  };
}

function emptyBiopsyStats() {
  return {
    ordered_count: '0',
    collected_count: '0',
    sent_count: '0',
    pending_review_count: '0',
    overdue_count: '0',
    malignancy_count: '0',
    melanoma_count: '0',
    needs_patient_notification: '0',
    avg_turnaround_days: null,
    total_biopsies_all_time: '0',
    biopsies_last_30_days: '0',
  };
}

function emptyQualityMetrics() {
  return {
    total_biopsies: '0',
    avg_turnaround_days: null,
    max_turnaround_days: null,
    min_turnaround_days: null,
    within_7_days: '0',
    over_7_days: '0',
    total_overdue: '0',
    total_malignancies: '0',
    total_melanoma: '0',
    patients_notified: '0',
    completed_biopsies: '0',
    within_7_days_percentage: null,
  };
}

function timestampExpr(columns: Set<string>, column: string): string {
  return columns.has(column) ? `b.${column}` : 'NULL::timestamptz';
}

function textExpr(columns: Set<string>, column: string): string {
  return columns.has(column) ? `b.${column}` : 'NULL::text';
}

function booleanExpr(columns: Set<string>, column: string, fallback: boolean): string {
  return columns.has(column) ? `b.${column}` : `${fallback ? 'true' : 'false'}::boolean`;
}

function numberExpr(columns: Set<string>, column: string): string {
  return columns.has(column) ? `b.${column}` : 'NULL::numeric';
}

function providerNameExpr(alias: string, columns: Set<string>): string {
  const parts: string[] = [];
  if (columns.has('full_name')) {
    parts.push(`NULLIF(to_jsonb(${alias})->>'full_name', '')`);
  }
  if (columns.has('first_name') || columns.has('last_name')) {
    parts.push(`NULLIF(TRIM(CONCAT_WS(' ', to_jsonb(${alias})->>'first_name', to_jsonb(${alias})->>'last_name')), '')`);
  }
  if (columns.has('name')) {
    parts.push(`NULLIF(to_jsonb(${alias})->>'name', '')`);
  }
  return parts.length > 0 ? `COALESCE(${parts.join(', ')})` : 'NULL::text';
}

function providerDisplayName(alias: string): string {
  return `COALESCE(
    NULLIF(to_jsonb(${alias})->>'full_name', ''),
    NULLIF(TRIM(CONCAT_WS(' ', to_jsonb(${alias})->>'first_name', to_jsonb(${alias})->>'last_name')), ''),
    NULLIF(to_jsonb(${alias})->>'name', ''),
    'Unknown Provider'
  )`;
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
        ${providerDisplayName('pr')} as ordering_provider_name,
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
        ${providerDisplayName('pr')} as ordering_provider_name,
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
    const biopsyColumns = await getTableColumns('biopsies');
    if (!biopsyColumns.has('id') || !biopsyColumns.has('tenant_id')) {
      return emptyBiopsyStats();
    }

    const params: any[] = [tenantId];
    let providerFilter = '';
    const hasOrderingProvider = biopsyColumns.has('ordering_provider_id');

    if (providerId && hasOrderingProvider) {
      providerFilter = 'AND b.ordering_provider_id = $2';
      params.push(providerId);
    }

    const statusExpr = biopsyColumns.has('status') ? 'b.status' : `'ordered'::text`;
    const isOverdueExpr = booleanExpr(biopsyColumns, 'is_overdue', false);
    const malignancyExpr = textExpr(biopsyColumns, 'malignancy_type');
    const patientNotifiedExpr = booleanExpr(biopsyColumns, 'patient_notified', false);
    const turnaroundExpr = numberExpr(biopsyColumns, 'turnaround_time_days');
    const orderedAtExpr = biopsyColumns.has('ordered_at') ? 'b.ordered_at' : timestampExpr(biopsyColumns, 'created_at');
    const deletedFilter = biopsyColumns.has('deleted_at') ? 'AND b.deleted_at IS NULL' : '';

    const query = `
      SELECT
        COUNT(*) FILTER (WHERE ${statusExpr} = 'ordered') as ordered_count,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'collected') as collected_count,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'resulted') as pending_review_count,
        COUNT(*) FILTER (WHERE ${isOverdueExpr} = true AND ${statusExpr} NOT IN ('resulted', 'reviewed', 'closed')) as overdue_count,
        COUNT(*) FILTER (WHERE ${malignancyExpr} IS NOT NULL) as malignancy_count,
        COUNT(*) FILTER (WHERE ${malignancyExpr} = 'melanoma') as melanoma_count,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'reviewed' AND ${patientNotifiedExpr} = false) as needs_patient_notification,
        AVG(${turnaroundExpr}) FILTER (WHERE ${turnaroundExpr} IS NOT NULL) as avg_turnaround_days,
        COUNT(*) as total_biopsies_all_time,
        COUNT(*) FILTER (WHERE ${orderedAtExpr} > NOW() - INTERVAL '30 days') as biopsies_last_30_days
      FROM biopsies b
      WHERE b.tenant_id = $1
        ${deletedFilter}
        ${providerFilter}
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Build the biopsy safety command center.
   *
   * This intentionally computes loop status from the existing biopsy lifecycle
   * fields instead of requiring extra schema. The command center is used by
   * daily clinic workflows to catch missing specimens, overdue pathology,
   * unreviewed malignancies, missing patient notification, and treatment plans
   * that have not been scheduled.
   */
  static async getSafetyCommandCenter(tenantId: string, providerId?: string) {
    const now = new Date();
    const [biopsyColumns, providerColumns, alertColumns, patientColumns] = await Promise.all([
      getTableColumns('biopsies'),
      getTableColumns('providers'),
      getTableColumns('biopsy_alerts'),
      getTableColumns('patients'),
    ]);

    if (!biopsyColumns.has('id') || !biopsyColumns.has('tenant_id') || !biopsyColumns.has('patient_id')) {
      return emptySafetyCommandCenter(now);
    }

    if (!patientColumns.has('id')) {
      return emptySafetyCommandCenter(now);
    }

    const hasOrderingProvider = biopsyColumns.has('ordering_provider_id');
    const hasReviewingProvider = biopsyColumns.has('reviewing_provider_id');
    const canJoinProviders = providerColumns.has('id');

    if (providerId && !hasOrderingProvider) {
      return emptySafetyCommandCenter(now);
    }

    const params: any[] = [tenantId];
    let providerFilter = '';

    if (providerId) {
      providerFilter = 'AND b.ordering_provider_id = $2';
      params.push(providerId);
    }

    const orderedAtExpr = biopsyColumns.has('ordered_at')
      ? 'b.ordered_at'
      : timestampExpr(biopsyColumns, 'created_at');
    const sentAtExpr = timestampExpr(biopsyColumns, 'sent_at');
    const resultedAtExpr = timestampExpr(biopsyColumns, 'resulted_at');
    const reviewedAtExpr = timestampExpr(biopsyColumns, 'reviewed_at');
    const statusExpr = biopsyColumns.has('status') ? 'b.status' : `'ordered'::text`;
    const malignancyExpr = textExpr(biopsyColumns, 'malignancy_type');
    const patientNotifiedExpr = booleanExpr(biopsyColumns, 'patient_notified', false);
    const isOverdueExpr = booleanExpr(biopsyColumns, 'is_overdue', false);
    const deletedFilter = biopsyColumns.has('deleted_at') ? 'AND b.deleted_at IS NULL' : '';
    const orderingProviderJoin = hasOrderingProvider && canJoinProviders
      ? 'LEFT JOIN providers ordering_pr ON b.ordering_provider_id = ordering_pr.id'
      : '';
    const reviewingProviderJoin = hasReviewingProvider && canJoinProviders
      ? 'LEFT JOIN providers reviewing_pr ON b.reviewing_provider_id = reviewing_pr.id'
      : '';
    const orderingProviderNameExpr = hasOrderingProvider && canJoinProviders
      ? providerNameExpr('ordering_pr', providerColumns)
      : 'NULL::text';
    const reviewingProviderNameExpr = hasReviewingProvider && canJoinProviders
      ? providerNameExpr('reviewing_pr', providerColumns)
      : 'NULL::text';
    const activeAlertCountExpr = alertColumns.has('biopsy_id') && alertColumns.has('status')
      ? `(SELECT COUNT(*)::INTEGER FROM biopsy_alerts ba WHERE ba.biopsy_id = b.id AND ba.status = 'active')`
      : '0::INTEGER';

    const query = `
      SELECT
        b.*,
        ${statusExpr} as status,
        ${orderedAtExpr} as ordered_at,
        ${sentAtExpr} as sent_at,
        ${resultedAtExpr} as resulted_at,
        ${reviewedAtExpr} as reviewed_at,
        ${malignancyExpr} as malignancy_type,
        ${patientNotifiedExpr} as patient_notified,
        ${textExpr(biopsyColumns, 'follow_up_action')} as follow_up_action,
        ${timestampExpr(biopsyColumns, 'reexcision_scheduled_date')} as reexcision_scheduled_date,
        ${numberExpr(biopsyColumns, 'turnaround_time_days')} as turnaround_time_days,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob as date_of_birth,
        p.phone as patient_phone,
        p.email as patient_email,
        ${orderingProviderNameExpr} as ordering_provider_name,
        ${reviewingProviderNameExpr} as reviewing_provider_name,
        EXTRACT(DAY FROM (NOW() - ${orderedAtExpr}))::INTEGER as days_since_ordered,
        EXTRACT(DAY FROM (NOW() - ${sentAtExpr}))::INTEGER as days_since_sent,
        EXTRACT(DAY FROM (NOW() - ${resultedAtExpr}))::INTEGER as days_since_result,
        EXTRACT(DAY FROM (NOW() - ${reviewedAtExpr}))::INTEGER as days_since_review,
        ${activeAlertCountExpr} as active_alert_count
      FROM biopsies b
      JOIN patients p ON b.patient_id = p.id
      ${orderingProviderJoin}
      ${reviewingProviderJoin}
      WHERE b.tenant_id = $1
        ${deletedFilter}
        ${providerFilter}
        AND (
          ${statusExpr} <> 'closed'
          OR COALESCE(${orderedAtExpr}, NOW()) >= NOW() - INTERVAL '180 days'
        )
      ORDER BY
        CASE
          WHEN ${malignancyExpr} = 'melanoma' AND ${statusExpr} <> 'closed' THEN 0
          WHEN ${isOverdueExpr} = true THEN 1
          WHEN ${statusExpr} = 'resulted' THEN 2
          WHEN ${statusExpr} = 'reviewed' AND ${patientNotifiedExpr} = false THEN 3
          WHEN ${malignancyExpr} IS NOT NULL AND ${statusExpr} <> 'closed' THEN 4
          ELSE 5
        END,
        COALESCE(${resultedAtExpr}, ${sentAtExpr}, ${orderedAtExpr}, NOW()) ASC
    `;

    const result = await pool.query(query, params);
    const biopsies = result.rows.map((row) => BiopsyService.decorateSafetyItem(row, now));

    const queues = {
      critical: biopsies.filter((biopsy) => ['critical', 'high'].includes(String(biopsy.highest_severity || ''))),
      pendingResults: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_result'),
      pendingReview: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_review'),
      pendingNotification: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_notification'),
      treatmentFollowUp: biopsies.filter((biopsy) => biopsy.safety_stage === 'treatment_follow_up'),
      closed: biopsies.filter((biopsy) => biopsy.safety_stage === 'closed'),
    };

    const openBiopsies = biopsies.filter((biopsy) => biopsy.safety_stage !== 'closed');
    const completedTurnaround = biopsies
      .map((biopsy) => Number(biopsy.turnaround_time_days))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgTurnaround = completedTurnaround.length > 0
      ? completedTurnaround.reduce((sum, value) => sum + value, 0) / completedTurnaround.length
      : null;

    return {
      generated_at: now.toISOString(),
      summary: {
        total_open_loops: openBiopsies.length,
        overdue_results: queues.pendingResults.filter((biopsy) =>
          biopsy.safety_flags.some((flag) => flag.type === 'result_overdue')
        ).length,
        pending_review: queues.pendingReview.length,
        needs_patient_notification: queues.pendingNotification.length,
        needs_treatment_scheduling: queues.treatmentFollowUp.length,
        open_malignancies: openBiopsies.filter((biopsy) => biopsy.malignancy_type).length,
        open_melanomas: openBiopsies.filter((biopsy) => biopsy.malignancy_type === 'melanoma').length,
        closed_loop_complete: queues.closed.length,
        critical_items: queues.critical.filter((biopsy) => biopsy.highest_severity === 'critical').length,
        avg_turnaround_days: avgTurnaround,
      },
      queues,
      biopsies,
    };
  }

  private static decorateSafetyItem(row: any, now: Date): BiopsyCommandCenterItem {
    const status = String(row.status || 'ordered');
    const malignancyType = row.malignancy_type ? String(row.malignancy_type) : null;
    const daysSinceOrdered = row.days_since_ordered == null ? daysBetween(row.ordered_at, now) : Number(row.days_since_ordered);
    const daysSinceSent = row.days_since_sent == null ? daysBetween(row.sent_at, now) : Number(row.days_since_sent);
    const daysSinceResult = row.days_since_result == null ? daysBetween(row.resulted_at, now) : Number(row.days_since_result);
    const daysSinceReview = row.days_since_review == null ? daysBetween(row.reviewed_at, now) : Number(row.days_since_review);
    const flags: BiopsySafetyFlag[] = [];

    if (['ordered', 'collected'].includes(status) && daysSinceOrdered != null && daysSinceOrdered >= 2 && !row.sent_at) {
      flags.push({
        id: 'specimen_not_sent',
        type: 'specimen_not_sent',
        severity: daysSinceOrdered >= 4 ? 'high' : 'medium',
        title: 'Specimen not sent',
        message: `Specimen has been in ${status} status for ${daysSinceOrdered} days.`,
        action: 'Confirm collection and send to pathology lab.',
      });
    }

    if (['sent', 'received_by_lab', 'processing'].includes(status) && daysSinceSent != null && daysSinceSent > 7 && !row.resulted_at) {
      flags.push({
        id: 'result_overdue',
        type: 'result_overdue',
        severity: daysSinceSent >= 14 ? 'critical' : 'high',
        title: 'Pathology result overdue',
        message: `Specimen was sent ${daysSinceSent} days ago with no final result.`,
        action: 'Call pathology lab and document follow-up.',
      });
    }

    if (status === 'resulted') {
      flags.push({
        id: 'pending_provider_review',
        type: 'pending_provider_review',
        severity: malignancyType === 'melanoma' ? 'critical' : malignancyType ? 'high' : 'medium',
        title: 'Result needs provider review',
        message: malignancyType
          ? `${malignancyType} result is not signed off.`
          : 'Final pathology result is available but not signed off.',
        action: 'Review result, code diagnosis, and document follow-up plan.',
      });
    }

    if (status === 'reviewed' && row.patient_notified === false) {
      flags.push({
        id: 'patient_not_notified',
        type: 'patient_not_notified',
        severity: malignancyType === 'melanoma' ? 'critical' : malignancyType ? 'high' : 'medium',
        title: 'Patient notification missing',
        message: 'Provider review is complete but patient notification is not documented.',
        action: 'Notify patient and record method, date, and notes.',
      });
    }

    if (status !== 'closed' && malignancyType && row.patient_notified === true && isTreatmentAction(row.follow_up_action) && !row.reexcision_scheduled_date) {
      flags.push({
        id: 'treatment_not_scheduled',
        type: 'treatment_not_scheduled',
        severity: malignancyType === 'melanoma' ? 'critical' : 'high',
        title: 'Treatment follow-up not scheduled',
        message: `${row.follow_up_action} is planned but no treatment date is documented.`,
        action: 'Schedule treatment, Mohs, referral, or surveillance appointment.',
      });
    }

    if (Number(row.active_alert_count || 0) > 0) {
      flags.push({
        id: 'active_alert',
        type: 'active_alert',
        severity: 'medium',
        title: 'Active biopsy alert',
        message: `${row.active_alert_count} active alert${Number(row.active_alert_count) === 1 ? '' : 's'} on this specimen.`,
        action: 'Resolve or acknowledge active alert.',
      });
    }

    let safetyStage = 'closed';
    let loopStatus = 'Closed loop complete';
    let nextAction = 'No action needed';

    if (['ordered', 'collected', 'sent', 'received_by_lab', 'processing'].includes(status)) {
      safetyStage = 'pending_result';
      loopStatus = flags.some((flag) => flag.type === 'result_overdue') ? 'Result overdue' : 'Awaiting pathology';
      nextAction = flags[0]?.action || 'Monitor result status.';
    } else if (status === 'resulted') {
      safetyStage = 'pending_review';
      loopStatus = 'Needs provider review';
      nextAction = 'Review and sign pathology result.';
    } else if (status === 'reviewed' && row.patient_notified === false) {
      safetyStage = 'pending_notification';
      loopStatus = 'Needs patient notification';
      nextAction = 'Notify patient and document contact.';
    } else if (status !== 'closed' && malignancyType && isTreatmentAction(row.follow_up_action) && !row.reexcision_scheduled_date) {
      safetyStage = 'treatment_follow_up';
      loopStatus = 'Needs treatment scheduling';
      nextAction = 'Schedule treatment follow-up.';
    }

    return {
      ...row,
      days_since_ordered: daysSinceOrdered,
      days_since_sent: daysSinceSent,
      days_since_result: daysSinceResult,
      days_since_review: daysSinceReview,
      safety_flags: flags,
      highest_severity: highestSeverity(flags),
      safety_stage: safetyStage,
      loop_status: loopStatus,
      next_action: nextAction,
    };
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
        ${providerDisplayName('pr')} as provider_name,
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
    const biopsyColumns = await getTableColumns('biopsies');
    if (!biopsyColumns.has('id') || !biopsyColumns.has('tenant_id')) {
      return emptyQualityMetrics();
    }

    const params: any[] = [tenantId];
    let dateFilter = '';
    const orderedAtExpr = biopsyColumns.has('ordered_at') ? 'b.ordered_at' : timestampExpr(biopsyColumns, 'created_at');

    if (startDate && endDate) {
      dateFilter = `AND ${orderedAtExpr} BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    const turnaroundExpr = numberExpr(biopsyColumns, 'turnaround_time_days');
    const isOverdueExpr = booleanExpr(biopsyColumns, 'is_overdue', false);
    const malignancyExpr = textExpr(biopsyColumns, 'malignancy_type');
    const patientNotifiedExpr = booleanExpr(biopsyColumns, 'patient_notified', false);
    const statusExpr = biopsyColumns.has('status') ? 'b.status' : `'ordered'::text`;
    const deletedFilter = biopsyColumns.has('deleted_at') ? 'AND b.deleted_at IS NULL' : '';

    const query = `
      SELECT
        COUNT(*) as total_biopsies,
        AVG(${turnaroundExpr}) as avg_turnaround_days,
        MAX(${turnaroundExpr}) as max_turnaround_days,
        MIN(${turnaroundExpr}) as min_turnaround_days,
        COUNT(*) FILTER (WHERE ${turnaroundExpr} <= 7) as within_7_days,
        COUNT(*) FILTER (WHERE ${turnaroundExpr} > 7) as over_7_days,
        COUNT(*) FILTER (WHERE ${isOverdueExpr} = true) as total_overdue,
        COUNT(*) FILTER (WHERE ${malignancyExpr} IS NOT NULL) as total_malignancies,
        COUNT(*) FILTER (WHERE ${malignancyExpr} = 'melanoma') as total_melanoma,
        COUNT(*) FILTER (WHERE ${patientNotifiedExpr} = true) as patients_notified,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'closed') as completed_biopsies,
        ROUND(
          (COUNT(*) FILTER (WHERE ${turnaroundExpr} <= 7)::NUMERIC /
           NULLIF(COUNT(*) FILTER (WHERE ${turnaroundExpr} IS NOT NULL), 0)) * 100,
          2
        ) as within_7_days_percentage
      FROM biopsies b
      WHERE b.tenant_id = $1
        ${deletedFilter}
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
        ${providerDisplayName('ordering_pr')} as ordering_provider,
        ${providerDisplayName('reviewing_pr')} as reviewing_provider,
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
