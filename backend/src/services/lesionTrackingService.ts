/**
 * Lesion Tracking Service
 * Business logic for lesion comparison and tracking system
 * Critical for dermatology: early detection of changes in suspicious lesions
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// =====================================================
// INTERFACES
// =====================================================

export interface CreateLesionParams {
  patientId: string;
  locationCode: string;
  locationDescription: string;
  clinicalDescription?: string;
  suspicionLevel?: number;
  lesionId?: string;
}

export interface AddImageParams {
  lesionId: string;
  encounterId?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  capturedBy: string;
  dermoscopy?: boolean;
  measurements?: Record<string, unknown>;
}

export interface RecordMeasurementsParams {
  lesionId: string;
  encounterId?: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  color?: string;
  border?: string;
  symmetry?: string;
  notes?: string;
  measuredBy: string;
}

export interface ABCDEScores {
  asymmetry: number;
  border: number;
  color: number;
  diameter: number;
  evolution: number;
  notes?: string;
}

export interface CalculateABCDEParams {
  lesionId: string;
  encounterId?: string;
  scores: ABCDEScores;
  assessedBy: string;
}

export interface TrackedLesion {
  id: string;
  tenantId: string;
  patientId: string;
  bodyLocationCode: string;
  bodyLocationDescription: string;
  firstDocumented: string;
  status: 'active' | 'resolved' | 'excised';
  clinicalDescription: string | null;
  suspicionLevel: number;
  lesionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LesionImage {
  id: string;
  lesionId: string;
  encounterId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  capturedAt: string;
  capturedBy: string;
  dermoscopy: boolean;
  measurements: Record<string, unknown>;
}

export interface LesionMeasurement {
  id: string;
  lesionId: string;
  encounterId: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  color: string | null;
  border: string | null;
  symmetry: string | null;
  notes: string | null;
  measuredAt: string;
  measuredBy: string;
}

export interface ABCDEScore {
  id: string;
  lesionId: string;
  encounterId: string | null;
  asymmetry: number;
  border: number;
  color: number;
  diameter: number;
  evolution: number;
  totalScore: number;
  assessedAt: string;
  assessedBy: string;
  notes: string | null;
}

export interface LesionOutcome {
  id: string;
  lesionId: string;
  outcomeType: 'biopsy' | 'excision' | 'monitoring' | 'referral' | 'resolved';
  outcomeDate: string;
  pathologyResult: string | null;
  diagnosisCode: string | null;
  biopsyId: string | null;
  documentedBy: string;
  notes: string | null;
}

export interface LesionChangeAlert {
  id: string;
  lesionId: string;
  patientId: string;
  alertType: string;
  severity: string;
  previousValue: Record<string, unknown>;
  currentValue: Record<string, unknown>;
  changePercentage: number | null;
  message: string;
  status: string;
  createdAt: string;
}

export interface ComparisonData {
  lesionId: string;
  image1: LesionImage | null;
  image2: LesionImage | null;
  measurement1: LesionMeasurement | null;
  measurement2: LesionMeasurement | null;
  sizeChange: number | null;
  timespan: string;
}

export interface LesionHistory {
  lesion: TrackedLesion;
  images: LesionImage[];
  measurements: LesionMeasurement[];
  abcdeScores: ABCDEScore[];
  outcomes: LesionOutcome[];
  alerts: LesionChangeAlert[];
}

export interface ChangingLesion {
  lesionId: string;
  patientId: string;
  patientName: string;
  bodyLocation: string;
  suspicionLevel: number;
  latestAbcdeScore: number | null;
  sizeChangePercentage: number | null;
  activeAlertCount: number;
  lastMeasured: string | null;
  alerts: LesionChangeAlert[];
}

// =====================================================
// LESION TRACKING SERVICE
// =====================================================

export class LesionTrackingService {
  /**
   * Create a new tracked lesion
   * Start tracking a lesion for comparison over time
   */
  static async createLesion(
    tenantId: string,
    params: CreateLesionParams,
    createdBy: string
  ): Promise<TrackedLesion> {
    const {
      patientId,
      locationCode,
      locationDescription,
      clinicalDescription,
      suspicionLevel = 1,
      lesionId
    } = params;

    const query = `
      INSERT INTO tracked_lesions (
        tenant_id,
        patient_id,
        body_location_code,
        body_location_description,
        clinical_description,
        suspicion_level,
        lesion_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        tenant_id as "tenantId",
        patient_id as "patientId",
        body_location_code as "bodyLocationCode",
        body_location_description as "bodyLocationDescription",
        first_documented as "firstDocumented",
        status,
        clinical_description as "clinicalDescription",
        suspicion_level as "suspicionLevel",
        lesion_id as "lesionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const result = await pool.query(query, [
      tenantId,
      patientId,
      locationCode,
      locationDescription,
      clinicalDescription || null,
      suspicionLevel,
      lesionId || null,
      createdBy
    ]);

    logger.info('Tracked lesion created', {
      lesionId: result.rows[0]?.id,
      patientId,
      locationCode,
      createdBy
    });

    return result.rows[0] as TrackedLesion;
  }

  /**
   * Add a new image for a tracked lesion
   */
  static async addImage(
    tenantId: string,
    params: AddImageParams
  ): Promise<LesionImage> {
    const {
      lesionId,
      encounterId,
      imageUrl,
      thumbnailUrl,
      capturedBy,
      dermoscopy = false,
      measurements = {}
    } = params;

    const query = `
      INSERT INTO lesion_images (
        tenant_id,
        lesion_id,
        encounter_id,
        image_url,
        thumbnail_url,
        captured_by,
        dermoscopy,
        measurements
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        lesion_id as "lesionId",
        encounter_id as "encounterId",
        image_url as "imageUrl",
        thumbnail_url as "thumbnailUrl",
        captured_at as "capturedAt",
        captured_by as "capturedBy",
        dermoscopy,
        measurements
    `;

    const result = await pool.query(query, [
      tenantId,
      lesionId,
      encounterId || null,
      imageUrl,
      thumbnailUrl || null,
      capturedBy,
      dermoscopy,
      JSON.stringify(measurements)
    ]);

    logger.info('Lesion image added', {
      imageId: result.rows[0]?.id,
      lesionId,
      dermoscopy
    });

    return result.rows[0] as LesionImage;
  }

  /**
   * Record measurements for a tracked lesion
   * This will trigger automatic change detection
   */
  static async recordMeasurements(
    tenantId: string,
    params: RecordMeasurementsParams
  ): Promise<LesionMeasurement> {
    const {
      lesionId,
      encounterId,
      lengthMm,
      widthMm,
      heightMm,
      color,
      border,
      symmetry,
      notes,
      measuredBy
    } = params;

    const query = `
      INSERT INTO lesion_tracking_measurements (
        tenant_id,
        lesion_id,
        encounter_id,
        length_mm,
        width_mm,
        height_mm,
        color,
        border,
        symmetry,
        notes,
        measured_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        lesion_id as "lesionId",
        encounter_id as "encounterId",
        length_mm as "lengthMm",
        width_mm as "widthMm",
        height_mm as "heightMm",
        color,
        border,
        symmetry,
        notes,
        measured_at as "measuredAt",
        measured_by as "measuredBy"
    `;

    const result = await pool.query(query, [
      tenantId,
      lesionId,
      encounterId || null,
      lengthMm || null,
      widthMm || null,
      heightMm || null,
      color || null,
      border || null,
      symmetry || null,
      notes || null,
      measuredBy
    ]);

    logger.info('Lesion measurements recorded', {
      measurementId: result.rows[0]?.id,
      lesionId,
      lengthMm,
      widthMm
    });

    return result.rows[0] as LesionMeasurement;
  }

  /**
   * Calculate and record ABCDE score
   * This will trigger automatic alert creation if score increases
   */
  static async calculateABCDE(
    tenantId: string,
    params: CalculateABCDEParams
  ): Promise<ABCDEScore> {
    const { lesionId, encounterId, scores, assessedBy } = params;

    const query = `
      INSERT INTO lesion_abcde_scores (
        tenant_id,
        lesion_id,
        encounter_id,
        asymmetry,
        border,
        color,
        diameter,
        evolution,
        assessed_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        lesion_id as "lesionId",
        encounter_id as "encounterId",
        asymmetry,
        border,
        color,
        diameter,
        evolution,
        total_score as "totalScore",
        assessed_at as "assessedAt",
        assessed_by as "assessedBy",
        notes
    `;

    const result = await pool.query(query, [
      tenantId,
      lesionId,
      encounterId || null,
      scores.asymmetry,
      scores.border,
      scores.color,
      scores.diameter,
      scores.evolution,
      assessedBy,
      scores.notes || null
    ]);

    // Update suspicion level based on ABCDE score
    const totalScore = scores.asymmetry + scores.border + scores.color + scores.diameter + scores.evolution;
    let newSuspicionLevel = 1;
    if (totalScore >= 7) newSuspicionLevel = 5;
    else if (totalScore >= 5) newSuspicionLevel = 4;
    else if (totalScore >= 3) newSuspicionLevel = 3;
    else if (totalScore >= 2) newSuspicionLevel = 2;

    await pool.query(
      `UPDATE tracked_lesions
       SET suspicion_level = GREATEST(suspicion_level, $1)
       WHERE id = $2 AND tenant_id = $3`,
      [newSuspicionLevel, lesionId, tenantId]
    );

    logger.info('ABCDE score recorded', {
      scoreId: result.rows[0]?.id,
      lesionId,
      totalScore
    });

    return result.rows[0] as ABCDEScore;
  }

  /**
   * Get side-by-side comparison data for two dates
   */
  static async compareImages(
    tenantId: string,
    lesionId: string,
    date1: Date,
    date2: Date
  ): Promise<ComparisonData> {
    // Get images closest to each date
    const imageQuery = `
      SELECT
        id,
        lesion_id as "lesionId",
        encounter_id as "encounterId",
        image_url as "imageUrl",
        thumbnail_url as "thumbnailUrl",
        captured_at as "capturedAt",
        captured_by as "capturedBy",
        dermoscopy,
        measurements
      FROM lesion_images
      WHERE lesion_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      ORDER BY ABS(EXTRACT(EPOCH FROM (captured_at - $3::timestamptz)))
      LIMIT 1
    `;

    const [image1Result, image2Result] = await Promise.all([
      pool.query(imageQuery, [lesionId, tenantId, date1.toISOString()]),
      pool.query(imageQuery, [lesionId, tenantId, date2.toISOString()])
    ]);

    // Get measurements closest to each date
    const measurementQuery = `
      SELECT
        id,
        lesion_id as "lesionId",
        encounter_id as "encounterId",
        length_mm as "lengthMm",
        width_mm as "widthMm",
        height_mm as "heightMm",
        color,
        border,
        symmetry,
        notes,
        measured_at as "measuredAt",
        measured_by as "measuredBy"
      FROM lesion_tracking_measurements
      WHERE lesion_id = $1 AND tenant_id = $2
      ORDER BY ABS(EXTRACT(EPOCH FROM (measured_at - $3::timestamptz)))
      LIMIT 1
    `;

    const [meas1Result, meas2Result] = await Promise.all([
      pool.query(measurementQuery, [lesionId, tenantId, date1.toISOString()]),
      pool.query(measurementQuery, [lesionId, tenantId, date2.toISOString()])
    ]);

    const measurement1 = meas1Result.rows[0] as LesionMeasurement | undefined;
    const measurement2 = meas2Result.rows[0] as LesionMeasurement | undefined;

    // Calculate size change
    let sizeChange: number | null = null;
    if (measurement1 && measurement2) {
      const area1 = (measurement1.lengthMm || 0) * (measurement1.widthMm || 0);
      const area2 = (measurement2.lengthMm || 0) * (measurement2.widthMm || 0);
      if (area1 > 0) {
        sizeChange = ((area2 - area1) / area1) * 100;
      }
    }

    // Calculate timespan
    const timeDiff = Math.abs(date2.getTime() - date1.getTime());
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    let timespan: string;
    if (days < 30) {
      timespan = `${days} days`;
    } else if (days < 365) {
      timespan = `${Math.floor(days / 30)} months`;
    } else {
      timespan = `${Math.floor(days / 365)} years`;
    }

    return {
      lesionId,
      image1: (image1Result.rows[0] as LesionImage | undefined) || null,
      image2: (image2Result.rows[0] as LesionImage | undefined) || null,
      measurement1: measurement1 || null,
      measurement2: measurement2 || null,
      sizeChange,
      timespan
    };
  }

  /**
   * Get full timeline/history for a lesion
   */
  static async getLesionHistory(
    tenantId: string,
    lesionId: string
  ): Promise<LesionHistory | null> {
    // Get lesion details
    const lesionQuery = `
      SELECT
        id,
        tenant_id as "tenantId",
        patient_id as "patientId",
        body_location_code as "bodyLocationCode",
        body_location_description as "bodyLocationDescription",
        first_documented as "firstDocumented",
        status,
        clinical_description as "clinicalDescription",
        suspicion_level as "suspicionLevel",
        lesion_id as "lesionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM tracked_lesions
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;

    const lesionResult = await pool.query(lesionQuery, [lesionId, tenantId]);
    if (lesionResult.rows.length === 0) {
      return null;
    }

    // Get all related data in parallel
    const [imagesResult, measurementsResult, scoresResult, outcomesResult, alertsResult] = await Promise.all([
      pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          encounter_id as "encounterId",
          image_url as "imageUrl",
          thumbnail_url as "thumbnailUrl",
          captured_at as "capturedAt",
          captured_by as "capturedBy",
          dermoscopy,
          measurements
        FROM lesion_images
        WHERE lesion_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY captured_at DESC
      `, [lesionId, tenantId]),

      pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          encounter_id as "encounterId",
          length_mm as "lengthMm",
          width_mm as "widthMm",
          height_mm as "heightMm",
          color,
          border,
          symmetry,
          notes,
          measured_at as "measuredAt",
          measured_by as "measuredBy"
        FROM lesion_tracking_measurements
        WHERE lesion_id = $1 AND tenant_id = $2
        ORDER BY measured_at DESC
      `, [lesionId, tenantId]),

      pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          encounter_id as "encounterId",
          asymmetry,
          border,
          color,
          diameter,
          evolution,
          total_score as "totalScore",
          assessed_at as "assessedAt",
          assessed_by as "assessedBy",
          notes
        FROM lesion_abcde_scores
        WHERE lesion_id = $1 AND tenant_id = $2
        ORDER BY assessed_at DESC
      `, [lesionId, tenantId]),

      pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          outcome_type as "outcomeType",
          outcome_date as "outcomeDate",
          pathology_result as "pathologyResult",
          diagnosis_code as "diagnosisCode",
          biopsy_id as "biopsyId",
          documented_by as "documentedBy",
          notes
        FROM lesion_outcomes
        WHERE lesion_id = $1 AND tenant_id = $2
        ORDER BY outcome_date DESC
      `, [lesionId, tenantId]),

      pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          patient_id as "patientId",
          alert_type as "alertType",
          severity,
          previous_value as "previousValue",
          current_value as "currentValue",
          change_percentage as "changePercentage",
          message,
          status,
          created_at as "createdAt"
        FROM lesion_change_alerts
        WHERE lesion_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
      `, [lesionId, tenantId])
    ]);

    return {
      lesion: lesionResult.rows[0] as TrackedLesion,
      images: imagesResult.rows as LesionImage[],
      measurements: measurementsResult.rows as LesionMeasurement[],
      abcdeScores: scoresResult.rows as ABCDEScore[],
      outcomes: outcomesResult.rows as LesionOutcome[],
      alerts: alertsResult.rows as LesionChangeAlert[]
    };
  }

  /**
   * Get lesions with significant changes for a patient
   * Returns lesions with active alerts or recent size increases
   */
  static async getChangingLesions(
    tenantId: string,
    patientId: string
  ): Promise<ChangingLesion[]> {
    const query = `
      SELECT
        tl.id as "lesionId",
        tl.patient_id as "patientId",
        p.first_name || ' ' || p.last_name as "patientName",
        tl.body_location_description as "bodyLocation",
        tl.suspicion_level as "suspicionLevel",
        (
          SELECT total_score
          FROM lesion_abcde_scores
          WHERE lesion_id = tl.id
          ORDER BY assessed_at DESC
          LIMIT 1
        ) as "latestAbcdeScore",
        (
          SELECT lca.change_percentage
          FROM lesion_change_alerts lca
          WHERE lca.lesion_id = tl.id AND lca.alert_type = 'size_increase'
          ORDER BY lca.created_at DESC
          LIMIT 1
        ) as "sizeChangePercentage",
        (
          SELECT COUNT(*)
          FROM lesion_change_alerts
          WHERE lesion_id = tl.id AND status = 'active'
        )::INTEGER as "activeAlertCount",
        (
          SELECT measured_at
          FROM lesion_tracking_measurements
          WHERE lesion_id = tl.id
          ORDER BY measured_at DESC
          LIMIT 1
        ) as "lastMeasured"
      FROM tracked_lesions tl
      JOIN patients p ON tl.patient_id = p.id
      WHERE tl.tenant_id = $1
        AND tl.patient_id = $2
        AND tl.status = 'active'
        AND tl.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM lesion_change_alerts
            WHERE lesion_id = tl.id AND status = 'active'
          )
          OR tl.suspicion_level >= 3
          OR EXISTS (
            SELECT 1 FROM lesion_abcde_scores
            WHERE lesion_id = tl.id AND total_score >= 5
          )
        )
      ORDER BY
        (SELECT COUNT(*) FROM lesion_change_alerts WHERE lesion_id = tl.id AND status = 'active') DESC,
        tl.suspicion_level DESC
    `;

    const result = await pool.query(query, [tenantId, patientId]);

    // Get alerts for each lesion
    const lesions = result.rows as ChangingLesion[];
    for (const lesion of lesions) {
      const alertsResult = await pool.query(`
        SELECT
          id,
          lesion_id as "lesionId",
          patient_id as "patientId",
          alert_type as "alertType",
          severity,
          previous_value as "previousValue",
          current_value as "currentValue",
          change_percentage as "changePercentage",
          message,
          status,
          created_at as "createdAt"
        FROM lesion_change_alerts
        WHERE lesion_id = $1 AND tenant_id = $2 AND status = 'active'
        ORDER BY severity DESC, created_at DESC
        LIMIT 5
      `, [lesion.lesionId, tenantId]);
      lesion.alerts = alertsResult.rows as LesionChangeAlert[];
    }

    return lesions;
  }

  /**
   * Get lesions by patient
   */
  static async getPatientLesions(
    tenantId: string,
    patientId: string
  ): Promise<TrackedLesion[]> {
    const query = `
      SELECT
        id,
        tenant_id as "tenantId",
        patient_id as "patientId",
        body_location_code as "bodyLocationCode",
        body_location_description as "bodyLocationDescription",
        first_documented as "firstDocumented",
        status,
        clinical_description as "clinicalDescription",
        suspicion_level as "suspicionLevel",
        lesion_id as "lesionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM tracked_lesions
      WHERE tenant_id = $1 AND patient_id = $2 AND deleted_at IS NULL
      ORDER BY suspicion_level DESC, first_documented DESC
    `;

    const result = await pool.query(query, [tenantId, patientId]);
    return result.rows as TrackedLesion[];
  }

  /**
   * Record an outcome for a lesion
   */
  static async recordOutcome(
    tenantId: string,
    lesionId: string,
    outcomeType: 'biopsy' | 'excision' | 'monitoring' | 'referral' | 'resolved',
    outcomeDate: Date,
    documentedBy: string,
    options?: {
      pathologyResult?: string;
      diagnosisCode?: string;
      biopsyId?: string;
      notes?: string;
    }
  ): Promise<LesionOutcome> {
    const query = `
      INSERT INTO lesion_outcomes (
        tenant_id,
        lesion_id,
        outcome_type,
        outcome_date,
        pathology_result,
        diagnosis_code,
        biopsy_id,
        documented_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        lesion_id as "lesionId",
        outcome_type as "outcomeType",
        outcome_date as "outcomeDate",
        pathology_result as "pathologyResult",
        diagnosis_code as "diagnosisCode",
        biopsy_id as "biopsyId",
        documented_by as "documentedBy",
        notes
    `;

    const result = await pool.query(query, [
      tenantId,
      lesionId,
      outcomeType,
      outcomeDate,
      options?.pathologyResult || null,
      options?.diagnosisCode || null,
      options?.biopsyId || null,
      documentedBy,
      options?.notes || null
    ]);

    // Update lesion status if excision or resolved
    if (outcomeType === 'excision' || outcomeType === 'resolved') {
      const newStatus = outcomeType === 'excision' ? 'excised' : 'resolved';
      await pool.query(
        `UPDATE tracked_lesions SET status = $1 WHERE id = $2 AND tenant_id = $3`,
        [newStatus, lesionId, tenantId]
      );
    }

    logger.info('Lesion outcome recorded', {
      outcomeId: result.rows[0]?.id,
      lesionId,
      outcomeType
    });

    return result.rows[0] as LesionOutcome;
  }

  /**
   * Acknowledge an alert
   */
  static async acknowledgeAlert(
    tenantId: string,
    alertId: string,
    acknowledgedBy: string
  ): Promise<void> {
    await pool.query(
      `UPDATE lesion_change_alerts
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND tenant_id = $3`,
      [acknowledgedBy, alertId, tenantId]
    );

    logger.info('Lesion alert acknowledged', { alertId, acknowledgedBy });
  }

  /**
   * Resolve an alert
   */
  static async resolveAlert(
    tenantId: string,
    alertId: string,
    resolvedBy: string,
    resolutionNotes?: string
  ): Promise<void> {
    await pool.query(
      `UPDATE lesion_change_alerts
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE id = $3 AND tenant_id = $4`,
      [resolvedBy, resolutionNotes || null, alertId, tenantId]
    );

    logger.info('Lesion alert resolved', { alertId, resolvedBy });
  }

  /**
   * Get active alerts for a tenant
   */
  static async getActiveAlerts(
    tenantId: string,
    patientId?: string
  ): Promise<LesionChangeAlert[]> {
    let query = `
      SELECT
        lca.id,
        lca.lesion_id as "lesionId",
        lca.patient_id as "patientId",
        lca.alert_type as "alertType",
        lca.severity,
        lca.previous_value as "previousValue",
        lca.current_value as "currentValue",
        lca.change_percentage as "changePercentage",
        lca.message,
        lca.status,
        lca.created_at as "createdAt",
        tl.body_location_description as "bodyLocation",
        p.first_name || ' ' || p.last_name as "patientName"
      FROM lesion_change_alerts lca
      JOIN tracked_lesions tl ON lca.lesion_id = tl.id
      JOIN patients p ON lca.patient_id = p.id
      WHERE lca.tenant_id = $1 AND lca.status = 'active'
    `;

    const params: (string | undefined)[] = [tenantId];

    if (patientId) {
      query += ` AND lca.patient_id = $2`;
      params.push(patientId);
    }

    query += ` ORDER BY
      CASE lca.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      lca.created_at DESC
    `;

    const result = await pool.query(query, params.filter((p): p is string => p !== undefined));
    return result.rows as LesionChangeAlert[];
  }

  /**
   * Update lesion status
   */
  static async updateLesionStatus(
    tenantId: string,
    lesionId: string,
    status: 'active' | 'resolved' | 'excised'
  ): Promise<void> {
    await pool.query(
      `UPDATE tracked_lesions SET status = $1 WHERE id = $2 AND tenant_id = $3`,
      [status, lesionId, tenantId]
    );

    logger.info('Lesion status updated', { lesionId, status });
  }

  /**
   * Update suspicion level
   */
  static async updateSuspicionLevel(
    tenantId: string,
    lesionId: string,
    suspicionLevel: number
  ): Promise<void> {
    if (suspicionLevel < 1 || suspicionLevel > 5) {
      throw new Error('Suspicion level must be between 1 and 5');
    }

    await pool.query(
      `UPDATE tracked_lesions SET suspicion_level = $1 WHERE id = $2 AND tenant_id = $3`,
      [suspicionLevel, lesionId, tenantId]
    );

    logger.info('Lesion suspicion level updated', { lesionId, suspicionLevel });
  }
}
