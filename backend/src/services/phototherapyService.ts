/**
 * Phototherapy Service
 * Business logic for UV light therapy tracking
 * Supports NB-UVB, BB-UVB, PUVA, and UVA1 treatments
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// Types
export type LightType = 'NB-UVB' | 'BB-UVB' | 'PUVA' | 'UVA1';
export type CourseStatus = 'active' | 'completed' | 'discontinued' | 'on_hold';
export type ErythemaResponse = 'none' | 'minimal' | 'mild' | 'moderate' | 'severe' | 'blistering';
export type FitzpatrickSkinType = 1 | 2 | 3 | 4 | 5 | 6;

interface CreateCourseParams {
  tenantId: string;
  patientId: string;
  protocolId: string;
  providerId: string;
  fitzpatrickSkinType: FitzpatrickSkinType;
  diagnosisCode?: string;
  diagnosisDescription?: string;
  indication?: string;
  targetBodyAreas?: string[];
  treatmentPercentageBsa?: number;
  targetTreatmentCount?: number;
  clinicalNotes?: string;
  precautions?: string;
  createdBy: string;
}

interface RecordTreatmentParams {
  tenantId: string;
  courseId: string;
  cabinetId?: string;
  treatmentDate: string;
  treatmentTime?: string;
  doseMj: number;
  durationSeconds?: number;
  bodyAreas?: string[];
  skinType?: number;
  preTreatmentNotes?: string;
  psoralenTaken?: boolean;
  psoralenTime?: string;
  psoralenDoseMg?: number;
  eyeProtectionVerified?: boolean;
  administeredBy: string;
  supervisedBy?: string;
  notes?: string;
}

interface RecordErythemaParams {
  tenantId: string;
  treatmentId: string;
  erythemaResponse: ErythemaResponse;
  erythemaScore?: number;
  responseNotes?: string;
}

interface DoseCalculation {
  recommendedDose: number;
  previousDose: number;
  adjustmentReason: string;
  incrementPercent: number;
  maxDose: number;
  warnings: string[];
  isMaxDose: boolean;
}

interface ComplianceReport {
  courseId: string;
  patientName: string;
  startDate: string;
  totalTreatments: number;
  targetTreatments: number | null;
  completionPercent: number;
  treatmentsThisWeek: number;
  treatmentsLastWeek: number;
  missedTreatments: number;
  averageDose: number;
  lastTreatmentDate: string | null;
  daysSinceLastTreatment: number | null;
  adherenceScore: number; // 0-100
  status: CourseStatus;
}

// Fitzpatrick skin type starting doses (mJ/cm2) for NB-UVB
const FITZPATRICK_STARTING_DOSES: Record<FitzpatrickSkinType, number> = {
  1: 130,  // Type I - Very fair, always burns, never tans
  2: 220,  // Type II - Fair, usually burns, tans minimally
  3: 260,  // Type III - Medium, sometimes burns, tans uniformly
  4: 330,  // Type IV - Olive, rarely burns, tans well
  5: 350,  // Type V - Brown, very rarely burns, tans very easily
  6: 400,  // Type VI - Dark brown/black, never burns
};

// Erythema-based dose adjustments
const ERYTHEMA_DOSE_ADJUSTMENTS: Record<ErythemaResponse, number> = {
  none: 1.0,      // No change, proceed with normal increment
  minimal: 1.0,   // Target response, normal increment
  mild: 0.0,      // Hold dose, no increment
  moderate: -0.1, // Reduce 10%
  severe: -0.25,  // Reduce 25%
  blistering: -0.5, // Reduce 50% and consider holding
};

export class PhototherapyService {
  /**
   * Create a new phototherapy course for a patient
   */
  static async createCourse(params: CreateCourseParams) {
    const {
      tenantId,
      patientId,
      protocolId,
      providerId,
      fitzpatrickSkinType,
      diagnosisCode,
      diagnosisDescription,
      indication,
      targetBodyAreas,
      treatmentPercentageBsa,
      targetTreatmentCount,
      clinicalNotes,
      precautions,
      createdBy,
    } = params;

    // Check for existing active course
    const existingCourse = await pool.query(
      `SELECT id FROM phototherapy_courses
       WHERE patient_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [patientId, tenantId]
    );

    if (existingCourse.rows.length > 0) {
      throw new Error('Patient already has an active phototherapy course. Please complete or discontinue it first.');
    }

    const query = `
      INSERT INTO phototherapy_courses (
        tenant_id, patient_id, protocol_id, prescribing_provider_id,
        fitzpatrick_skin_type, diagnosis_code, diagnosis_description,
        indication, target_body_areas, treatment_percentage_bsa,
        start_date, target_treatment_count, clinical_notes, precautions,
        status, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11, $12, $13, 'active', $14
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      patientId,
      protocolId,
      providerId,
      fitzpatrickSkinType,
      diagnosisCode || null,
      diagnosisDescription || null,
      indication || null,
      targetBodyAreas || null,
      treatmentPercentageBsa || null,
      targetTreatmentCount || null,
      clinicalNotes || null,
      precautions || null,
      createdBy,
    ]);

    logger.info('Phototherapy course created', {
      courseId: result.rows[0].id,
      patientId,
      protocolId,
    });

    return result.rows[0];
  }

  /**
   * Record a phototherapy treatment session
   */
  static async recordTreatment(params: RecordTreatmentParams) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        tenantId,
        courseId,
        cabinetId,
        treatmentDate,
        treatmentTime,
        doseMj,
        durationSeconds,
        bodyAreas,
        skinType,
        preTreatmentNotes,
        psoralenTaken,
        psoralenTime,
        psoralenDoseMg,
        eyeProtectionVerified,
        administeredBy,
        supervisedBy,
        notes,
      } = params;

      // Get course details and verify it's active
      const courseResult = await client.query(
        `SELECT pc.*, pp.max_dose, pp.light_type
         FROM phototherapy_courses pc
         JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
         WHERE pc.id = $1 AND pc.tenant_id = $2`,
        [courseId, tenantId]
      );

      if (courseResult.rows.length === 0) {
        throw new Error('Course not found');
      }

      const course = courseResult.rows[0];

      if (course.status !== 'active') {
        throw new Error('Cannot record treatment for inactive course');
      }

      // Check if dose exceeds maximum
      const warnings: string[] = [];
      if (course.max_dose && doseMj > course.max_dose) {
        warnings.push(`Dose exceeds protocol maximum of ${course.max_dose} mJ/cm2`);
        // Create alert
        await this.createAlert({
          tenantId,
          patientId: course.patient_id,
          courseId,
          alertType: 'max_dose_exceeded',
          severity: 'high',
          title: 'Maximum Dose Exceeded',
          message: `Treatment dose of ${doseMj} mJ/cm2 exceeds protocol maximum of ${course.max_dose} mJ/cm2`,
        });
      }

      // Get next treatment number
      const treatmentCountResult = await client.query(
        `SELECT COALESCE(MAX(treatment_number), 0) + 1 as next_number
         FROM phototherapy_treatments WHERE course_id = $1`,
        [courseId]
      );
      const treatmentNumber = treatmentCountResult.rows[0].next_number;

      // Get previous treatment info for dose tracking
      const prevTreatmentResult = await client.query(
        `SELECT dose_mj FROM phototherapy_treatments
         WHERE course_id = $1 ORDER BY treatment_number DESC LIMIT 1`,
        [courseId]
      );
      const previousDose = prevTreatmentResult.rows[0]?.dose_mj || null;

      // Insert treatment
      const treatmentQuery = `
        INSERT INTO phototherapy_treatments (
          tenant_id, course_id, cabinet_id, treatment_number, treatment_date,
          treatment_time, dose_mj, duration_seconds, body_areas, skin_type,
          pre_treatment_notes, psoralen_taken, psoralen_time, psoralen_dose_mg,
          eye_protection_verified, administered_by, supervised_by, notes,
          previous_dose_mj
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING *
      `;

      const treatmentResult = await client.query(treatmentQuery, [
        tenantId,
        courseId,
        cabinetId || null,
        treatmentNumber,
        treatmentDate,
        treatmentTime || null,
        doseMj,
        durationSeconds || null,
        bodyAreas || null,
        skinType || course.fitzpatrick_skin_type,
        preTreatmentNotes || null,
        psoralenTaken || false,
        psoralenTime || null,
        psoralenDoseMg || null,
        eyeProtectionVerified !== false,
        administeredBy,
        supervisedBy || null,
        notes || null,
        previousDose,
      ]);

      // Update cabinet bulb hours if duration provided
      if (cabinetId && durationSeconds) {
        await client.query(
          `UPDATE phototherapy_cabinets
           SET bulb_hours = bulb_hours + $1, updated_at = now()
           WHERE id = $2`,
          [durationSeconds / 3600, cabinetId]
        );
      }

      await client.query('COMMIT');

      // Check cumulative dose after treatment (trigger handles update)
      await this.checkCumulativeDoseAlert(tenantId, course.patient_id);

      logger.info('Phototherapy treatment recorded', {
        treatmentId: treatmentResult.rows[0].id,
        courseId,
        treatmentNumber,
        doseMj,
      });

      return {
        treatment: treatmentResult.rows[0],
        warnings,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate the next recommended dose based on protocol and previous treatments
   */
  static async calculateNextDose(courseId: string, tenantId: string): Promise<DoseCalculation> {
    // Get course, protocol, and last treatment
    const query = `
      SELECT
        pc.*,
        pp.light_type,
        pp.starting_dose,
        pp.starting_dose_type_i,
        pp.starting_dose_type_ii,
        pp.starting_dose_type_iii,
        pp.starting_dose_type_iv,
        pp.starting_dose_type_v,
        pp.starting_dose_type_vi,
        pp.increment_percent,
        pp.max_dose,
        pt.dose_mj as last_dose,
        pt.erythema_response as last_erythema,
        pt.treatment_date as last_treatment_date
      FROM phototherapy_courses pc
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      LEFT JOIN phototherapy_treatments pt ON pt.course_id = pc.id
        AND pt.treatment_number = (
          SELECT MAX(treatment_number) FROM phototherapy_treatments WHERE course_id = pc.id
        )
      WHERE pc.id = $1 AND pc.tenant_id = $2
    `;

    const result = await pool.query(query, [courseId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Course not found');
    }

    const data = result.rows[0];
    const warnings: string[] = [];
    let recommendedDose: number;
    let adjustmentReason: string;
    const incrementPercent = data.increment_percent || 10;
    const maxDose = data.max_dose || 3000;
    const skinType = data.fitzpatrick_skin_type as FitzpatrickSkinType;

    // Get starting dose based on skin type
    const getStartingDose = (): number => {
      const skinTypeField = `starting_dose_type_${['i', 'ii', 'iii', 'iv', 'v', 'vi'][skinType - 1]}`;
      return data[skinTypeField] || data.starting_dose || FITZPATRICK_STARTING_DOSES[skinType];
    };

    if (!data.last_dose) {
      // First treatment - use starting dose
      recommendedDose = getStartingDose();
      adjustmentReason = `Starting dose for Fitzpatrick skin type ${skinType}`;
    } else {
      const previousDose = parseFloat(data.last_dose);
      const lastErythema = data.last_erythema as ErythemaResponse | null;

      if (lastErythema && ERYTHEMA_DOSE_ADJUSTMENTS[lastErythema] !== undefined) {
        const adjustment = ERYTHEMA_DOSE_ADJUSTMENTS[lastErythema];

        if (adjustment > 0) {
          // Normal increment
          recommendedDose = previousDose * (1 + incrementPercent / 100);
          adjustmentReason = `${incrementPercent}% increase from previous dose (${lastErythema} erythema)`;
        } else if (adjustment === 0) {
          // Hold dose
          recommendedDose = previousDose;
          adjustmentReason = `Dose held due to ${lastErythema} erythema`;
          warnings.push(`Previous treatment showed ${lastErythema} erythema - dose held`);
        } else {
          // Reduce dose
          recommendedDose = previousDose * (1 + adjustment);
          adjustmentReason = `${Math.abs(adjustment * 100)}% decrease due to ${lastErythema} erythema`;
          warnings.push(`Previous treatment showed ${lastErythema} erythema - dose reduced`);
        }
      } else {
        // No erythema response recorded, assume normal increment
        recommendedDose = previousDose * (1 + incrementPercent / 100);
        adjustmentReason = `${incrementPercent}% increase from previous dose`;
      }
    }

    // Check against max dose
    let isMaxDose = false;
    if (recommendedDose > maxDose) {
      recommendedDose = maxDose;
      adjustmentReason = 'Maximum protocol dose reached';
      isMaxDose = true;
      warnings.push('Maximum dose reached - cannot increase further');
    }

    // Round to reasonable precision
    recommendedDose = Math.round(recommendedDose);

    return {
      recommendedDose,
      previousDose: data.last_dose ? parseFloat(data.last_dose) : 0,
      adjustmentReason,
      incrementPercent,
      maxDose,
      warnings,
      isMaxDose,
    };
  }

  /**
   * Adjust dose recommendation based on erythema response
   */
  static async adjustForErythema(params: RecordErythemaParams) {
    const { tenantId, treatmentId, erythemaResponse, erythemaScore, responseNotes } = params;

    const query = `
      UPDATE phototherapy_treatments
      SET
        erythema_response = $1,
        erythema_score = $2,
        response_notes = $3,
        updated_at = now()
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `;

    const result = await pool.query(query, [
      erythemaResponse,
      erythemaScore || null,
      responseNotes || null,
      treatmentId,
      tenantId,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Treatment not found');
    }

    const treatment = result.rows[0];

    // Create alert for severe erythema
    if (erythemaResponse === 'severe' || erythemaResponse === 'blistering') {
      await this.createAlert({
        tenantId,
        treatmentId,
        courseId: treatment.course_id,
        alertType: 'severe_erythema',
        severity: erythemaResponse === 'blistering' ? 'critical' : 'high',
        title: `${erythemaResponse === 'blistering' ? 'Blistering' : 'Severe'} Erythema Reported`,
        message: `Patient experienced ${erythemaResponse} erythema following treatment #${treatment.treatment_number}. Review treatment protocol.`,
      });
    }

    logger.info('Erythema response recorded', {
      treatmentId,
      erythemaResponse,
    });

    return result.rows[0];
  }

  /**
   * Get cumulative lifetime dose for a patient
   */
  static async getCumulativeDose(patientId: string, tenantId: string) {
    const query = `
      SELECT
        pcd.*,
        p.first_name || ' ' || p.last_name as patient_name
      FROM phototherapy_cumulative_doses pcd
      JOIN patients p ON pcd.patient_id = p.id
      WHERE pcd.patient_id = $1 AND pcd.tenant_id = $2
    `;

    const result = await pool.query(query, [patientId, tenantId]);

    if (result.rows.length === 0) {
      // Return empty record if no treatments yet
      return {
        patientId,
        patientName: null,
        nbUvbLifetimeDose: 0,
        bbUvbLifetimeDose: 0,
        puvaLifetimeDose: 0,
        uva1LifetimeDose: 0,
        nbUvbTreatmentCount: 0,
        bbUvbTreatmentCount: 0,
        puvaTreatmentCount: 0,
        uva1TreatmentCount: 0,
        totalLifetimeDose: 0,
        totalTreatmentCount: 0,
      };
    }

    const data = result.rows[0];
    const nbUvb = parseFloat(data.nb_uvb_lifetime_dose || 0);
    const bbUvb = parseFloat(data.bb_uvb_lifetime_dose || 0);
    const puva = parseFloat(data.puva_lifetime_dose || 0);
    const uva1 = parseFloat(data.uva1_lifetime_dose || 0);

    return {
      patientId,
      patientName: data.patient_name,
      nbUvbLifetimeDose: nbUvb,
      bbUvbLifetimeDose: bbUvb,
      puvaLifetimeDose: puva,
      uva1LifetimeDose: uva1,
      nbUvbTreatmentCount: data.nb_uvb_treatment_count || 0,
      bbUvbTreatmentCount: data.bb_uvb_treatment_count || 0,
      puvaTreatmentCount: data.puva_treatment_count || 0,
      uva1TreatmentCount: data.uva1_treatment_count || 0,
      nbUvbLastTreatment: data.nb_uvb_last_treatment,
      bbUvbLastTreatment: data.bb_uvb_last_treatment,
      puvaLastTreatment: data.puva_last_treatment,
      uva1LastTreatment: data.uva1_last_treatment,
      externalNbUvbDose: parseFloat(data.external_nb_uvb_dose || 0),
      externalBbUvbDose: parseFloat(data.external_bb_uvb_dose || 0),
      externalPuvaDose: parseFloat(data.external_puva_dose || 0),
      externalUva1Dose: parseFloat(data.external_uva1_dose || 0),
      externalHistoryNotes: data.external_history_notes,
      totalLifetimeDose: nbUvb + bbUvb + puva + uva1,
      totalTreatmentCount:
        (data.nb_uvb_treatment_count || 0) +
        (data.bb_uvb_treatment_count || 0) +
        (data.puva_treatment_count || 0) +
        (data.uva1_treatment_count || 0),
    };
  }

  /**
   * Get compliance report for a course
   */
  static async getComplianceReport(courseId: string, tenantId: string): Promise<ComplianceReport> {
    const query = `
      SELECT
        pc.id as course_id,
        pc.start_date,
        pc.target_treatment_count,
        pc.total_treatments,
        pc.status,
        p.first_name || ' ' || p.last_name as patient_name,
        pp.frequency,
        (
          SELECT COUNT(*) FROM phototherapy_treatments pt
          WHERE pt.course_id = pc.id
          AND pt.treatment_date >= CURRENT_DATE - INTERVAL '7 days'
        ) as treatments_this_week,
        (
          SELECT COUNT(*) FROM phototherapy_treatments pt
          WHERE pt.course_id = pc.id
          AND pt.treatment_date >= CURRENT_DATE - INTERVAL '14 days'
          AND pt.treatment_date < CURRENT_DATE - INTERVAL '7 days'
        ) as treatments_last_week,
        (
          SELECT MAX(treatment_date) FROM phototherapy_treatments pt
          WHERE pt.course_id = pc.id
        ) as last_treatment_date,
        (
          SELECT AVG(dose_mj) FROM phototherapy_treatments pt
          WHERE pt.course_id = pc.id
        ) as average_dose
      FROM phototherapy_courses pc
      JOIN patients p ON pc.patient_id = p.id
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      WHERE pc.id = $1 AND pc.tenant_id = $2
    `;

    const result = await pool.query(query, [courseId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Course not found');
    }

    const data = result.rows[0];
    const startDate = new Date(data.start_date);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate expected treatments based on frequency
    let expectedTreatmentsPerWeek = 3;
    if (data.frequency === '2x_weekly') expectedTreatmentsPerWeek = 2;
    if (data.frequency === 'weekly') expectedTreatmentsPerWeek = 1;

    const weeksElapsed = Math.max(1, daysSinceStart / 7);
    const expectedTreatments = Math.floor(weeksElapsed * expectedTreatmentsPerWeek);
    const missedTreatments = Math.max(0, expectedTreatments - data.total_treatments);

    // Calculate adherence score (0-100)
    const adherenceScore = expectedTreatments > 0
      ? Math.round((data.total_treatments / expectedTreatments) * 100)
      : 100;

    // Calculate completion percent
    const completionPercent = data.target_treatment_count
      ? Math.round((data.total_treatments / data.target_treatment_count) * 100)
      : 0;

    // Days since last treatment
    const lastTreatmentDate = data.last_treatment_date
      ? new Date(data.last_treatment_date)
      : null;
    const daysSinceLastTreatment = lastTreatmentDate
      ? Math.floor((now.getTime() - lastTreatmentDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      courseId: data.course_id,
      patientName: data.patient_name,
      startDate: data.start_date,
      totalTreatments: data.total_treatments,
      targetTreatments: data.target_treatment_count,
      completionPercent,
      treatmentsThisWeek: parseInt(data.treatments_this_week),
      treatmentsLastWeek: parseInt(data.treatments_last_week),
      missedTreatments,
      averageDose: parseFloat(data.average_dose) || 0,
      lastTreatmentDate: data.last_treatment_date,
      daysSinceLastTreatment,
      adherenceScore: Math.min(100, adherenceScore),
      status: data.status,
    };
  }

  /**
   * Get patient's treatment history
   */
  static async getPatientHistory(patientId: string, tenantId: string) {
    const coursesQuery = `
      SELECT
        pc.*,
        pp.name as protocol_name,
        pp.light_type,
        pp.condition,
        pr.first_name || ' ' || pr.last_name as prescribing_provider_name,
        (
          SELECT COUNT(*) FROM phototherapy_treatments pt WHERE pt.course_id = pc.id
        ) as treatment_count
      FROM phototherapy_courses pc
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      JOIN providers pr ON pc.prescribing_provider_id = pr.id
      WHERE pc.patient_id = $1 AND pc.tenant_id = $2
      ORDER BY pc.start_date DESC
    `;

    const courses = await pool.query(coursesQuery, [patientId, tenantId]);

    // Get cumulative doses
    const cumulative = await this.getCumulativeDose(patientId, tenantId);

    return {
      courses: courses.rows,
      cumulativeDose: cumulative,
    };
  }

  /**
   * Create a safety alert
   */
  static async createAlert(params: {
    tenantId: string;
    patientId?: string;
    courseId?: string;
    treatmentId?: string;
    alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
  }) {
    const query = `
      INSERT INTO phototherapy_alerts (
        tenant_id, patient_id, course_id, treatment_id,
        alert_type, severity, title, message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.tenantId,
      params.patientId || null,
      params.courseId || null,
      params.treatmentId || null,
      params.alertType,
      params.severity,
      params.title,
      params.message,
    ]);

    logger.info('Phototherapy alert created', {
      alertId: result.rows[0].id,
      alertType: params.alertType,
      severity: params.severity,
    });

    return result.rows[0];
  }

  /**
   * Check and create alert for high cumulative dose
   */
  private static async checkCumulativeDoseAlert(tenantId: string, patientId: string) {
    const query = `
      SELECT pcd.*, pp.high_cumulative_warning, pp.max_cumulative_dose
      FROM phototherapy_cumulative_doses pcd
      JOIN phototherapy_courses pc ON pc.patient_id = pcd.patient_id AND pc.tenant_id = pcd.tenant_id
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      WHERE pcd.patient_id = $1 AND pcd.tenant_id = $2 AND pc.status = 'active'
      LIMIT 1
    `;

    const result = await pool.query(query, [patientId, tenantId]);

    if (result.rows.length === 0) return;

    const data = result.rows[0];
    const totalDose =
      parseFloat(data.nb_uvb_lifetime_dose || 0) +
      parseFloat(data.bb_uvb_lifetime_dose || 0) +
      parseFloat(data.puva_lifetime_dose || 0) +
      parseFloat(data.uva1_lifetime_dose || 0);

    // Check warning threshold
    if (data.high_cumulative_warning && totalDose >= data.high_cumulative_warning) {
      if (!data.high_exposure_alert_sent) {
        await this.createAlert({
          tenantId,
          patientId,
          alertType: 'high_cumulative_exposure',
          severity: 'high',
          title: 'High Cumulative UV Exposure',
          message: `Patient has reached ${totalDose.toFixed(2)} J/cm2 cumulative UV exposure, exceeding warning threshold of ${data.high_cumulative_warning} J/cm2.`,
        });

        await pool.query(
          `UPDATE phototherapy_cumulative_doses
           SET high_exposure_alert_sent = true, high_exposure_alert_date = now()
           WHERE patient_id = $1 AND tenant_id = $2`,
          [patientId, tenantId]
        );
      }
    }
  }

  /**
   * Get all protocols (templates or active)
   */
  static async getProtocols(tenantId: string, isTemplate?: boolean) {
    let query = `
      SELECT * FROM phototherapy_protocols
      WHERE tenant_id = $1 AND is_active = true
    `;
    const params: any[] = [tenantId];

    if (isTemplate !== undefined) {
      query += ` AND is_template = $2`;
      params.push(isTemplate);
    }

    query += ` ORDER BY name`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get course details with treatments
   */
  static async getCourseDetails(courseId: string, tenantId: string) {
    const courseQuery = `
      SELECT
        pc.*,
        pp.name as protocol_name,
        pp.light_type,
        pp.condition,
        pp.increment_percent,
        pp.max_dose,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        p.dob,
        pr.first_name || ' ' || pr.last_name as prescribing_provider_name
      FROM phototherapy_courses pc
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      JOIN patients p ON pc.patient_id = p.id
      JOIN providers pr ON pc.prescribing_provider_id = pr.id
      WHERE pc.id = $1 AND pc.tenant_id = $2
    `;

    const courseResult = await pool.query(courseQuery, [courseId, tenantId]);

    if (courseResult.rows.length === 0) {
      throw new Error('Course not found');
    }

    const treatmentsQuery = `
      SELECT
        pt.*,
        u.first_name || ' ' || u.last_name as administered_by_name,
        pc.cabinet_name
      FROM phototherapy_treatments pt
      LEFT JOIN users u ON pt.administered_by = u.id
      LEFT JOIN phototherapy_cabinets pc ON pt.cabinet_id = pc.id
      WHERE pt.course_id = $1
      ORDER BY pt.treatment_number DESC
    `;

    const treatmentsResult = await pool.query(treatmentsQuery, [courseId]);

    // Get next dose recommendation
    const nextDose = await this.calculateNextDose(courseId, tenantId);

    return {
      course: courseResult.rows[0],
      treatments: treatmentsResult.rows,
      nextDose,
    };
  }

  /**
   * Update course status
   */
  static async updateCourseStatus(
    courseId: string,
    tenantId: string,
    status: CourseStatus,
    reason?: string
  ) {
    const query = `
      UPDATE phototherapy_courses
      SET
        status = $1,
        discontinuation_reason = CASE WHEN $1 = 'discontinued' THEN $2 ELSE discontinuation_reason END,
        discontinuation_date = CASE WHEN $1 = 'discontinued' THEN CURRENT_DATE ELSE discontinuation_date END,
        end_date = CASE WHEN $1 IN ('completed', 'discontinued') THEN CURRENT_DATE ELSE end_date END,
        updated_at = now()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [status, reason || null, courseId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Course not found');
    }

    logger.info('Phototherapy course status updated', {
      courseId,
      status,
    });

    return result.rows[0];
  }

  /**
   * Get active courses (for dashboard)
   */
  static async getActiveCourses(tenantId: string, providerId?: string) {
    let query = `
      SELECT
        pc.*,
        pp.name as protocol_name,
        pp.light_type,
        pp.condition,
        p.first_name || ' ' || p.last_name as patient_name,
        p.mrn,
        pr.first_name || ' ' || pr.last_name as prescribing_provider_name,
        (
          SELECT MAX(treatment_date) FROM phototherapy_treatments pt WHERE pt.course_id = pc.id
        ) as last_treatment_date
      FROM phototherapy_courses pc
      JOIN phototherapy_protocols pp ON pc.protocol_id = pp.id
      JOIN patients p ON pc.patient_id = p.id
      JOIN providers pr ON pc.prescribing_provider_id = pr.id
      WHERE pc.tenant_id = $1 AND pc.status = 'active'
    `;

    const params: any[] = [tenantId];

    if (providerId) {
      query += ` AND pc.prescribing_provider_id = $2`;
      params.push(providerId);
    }

    query += ` ORDER BY last_treatment_date DESC NULLS LAST`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get cabinets
   */
  static async getCabinets(tenantId: string, locationId?: string) {
    let query = `
      SELECT pc.*, l.name as location_name
      FROM phototherapy_cabinets pc
      LEFT JOIN locations l ON pc.location_id = l.id
      WHERE pc.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (locationId) {
      query += ` AND pc.location_id = $2`;
      params.push(locationId);
    }

    query += ` ORDER BY pc.cabinet_name`;

    const result = await pool.query(query, params);
    return result.rows;
  }
}
