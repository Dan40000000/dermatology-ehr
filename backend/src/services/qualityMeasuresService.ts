import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// Dermatology-specific measure IDs
export const DERM_MEASURES = {
  MELANOMA_MARGINS: 'DERM001',
  MELANOMA_RECALL: 'DERM002',
  PSORIASIS_RESPONSE: 'MIPS485',
  PSORIASIS_ITCH: 'DERM003',
  TB_SCREENING: 'DERM004',
  TOBACCO_SCREENING: 'MIPS226',
  MELANOMA_COORDINATION: 'MIPS137',
} as const;

// PI measure names
export const PI_MEASURES = {
  E_PRESCRIBING: 'e-Prescribing',
  HIE_RECEIVING: 'HIE: Receiving',
  HIE_SENDING: 'HIE: Sending',
  PORTAL_ACCESS: 'Patient Portal Access',
  SECURITY_RISK_ANALYSIS: 'Security Risk Analysis',
} as const;

export interface QualityMeasure {
  id: string;
  measureId: string;
  measureName: string;
  description: string;
  category: string;
  specialty: string;
  numeratorCriteria: Record<string, any>;
  denominatorCriteria: Record<string, any>;
  exclusionCriteria: Record<string, any>;
  benchmarkData: Record<string, any>;
  measureType: string;
  highPriority: boolean;
  isActive: boolean;
}

export interface PatientMeasureResult {
  patientId: string;
  measureId: string;
  isDenominatorEligible: boolean;
  numeratorMet: boolean;
  exclusionApplied: boolean;
  exclusionReason?: string;
  sourceData: Record<string, any>;
}

export interface MeasurePerformance {
  measureId: string;
  measureName: string;
  numeratorCount: number;
  denominatorCount: number;
  exclusionCount: number;
  performanceRate: number;
  benchmark: number;
  gap: number;
}

export interface MIPSDashboard {
  qualityScore: number;
  piScore: number;
  iaScore: number;
  costScore: number;
  estimatedFinalScore: number;
  paymentAdjustment: number;
  measures: MeasurePerformance[];
  careGaps: CareGap[];
  recommendations: string[];
}

export interface CareGap {
  patientId: string;
  patientName: string;
  measureId: string;
  measureName: string;
  gapReason: string;
  recommendedAction: string;
  priority: string;
  dueDate?: string;
}

export interface PITracking {
  measureName: string;
  numerator: number;
  denominator: number;
  performanceRate: number;
  isRequired: boolean;
  attestationStatus?: boolean;
}

export interface ImprovementActivity {
  activityId: string;
  activityName: string;
  weight: string;
  points: number;
  attestationStatus: string;
  startDate: string;
  endDate?: string;
}

export class QualityMeasuresService {
  /**
   * Evaluate a patient for a specific quality measure
   */
  async evaluatePatientForMeasure(
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId?: string,
    providerId?: string
  ): Promise<PatientMeasureResult> {
    const client = await pool.connect();
    try {
      // Get measure criteria
      const measureResult = await client.query(
        `SELECT * FROM quality_measures WHERE measure_id = $1 AND is_active = true`,
        [measureId]
      );

      if (!measureResult.rowCount) {
        throw new Error(`Measure ${measureId} not found or inactive`);
      }

      const measure = measureResult.rows[0];
      const denomCriteria = measure.denominator_criteria;
      const numCriteria = measure.numerator_criteria;
      const exclCriteria = measure.exclusion_criteria;

      // Check denominator eligibility
      const denominatorCheck = await this.checkDenominatorEligibility(
        client,
        tenantId,
        patientId,
        denomCriteria,
        encounterId
      );

      if (!denominatorCheck.eligible) {
        return {
          patientId,
          measureId,
          isDenominatorEligible: false,
          numeratorMet: false,
          exclusionApplied: false,
          sourceData: denominatorCheck.sourceData,
        };
      }

      // Check exclusions
      const exclusionCheck = await this.checkExclusions(
        client,
        tenantId,
        patientId,
        exclCriteria
      );

      if (exclusionCheck.excluded) {
        return {
          patientId,
          measureId,
          isDenominatorEligible: true,
          numeratorMet: false,
          exclusionApplied: true,
          exclusionReason: exclusionCheck.reason,
          sourceData: exclusionCheck.sourceData,
        };
      }

      // Check numerator
      const numeratorCheck = await this.checkNumeratorCriteria(
        client,
        tenantId,
        patientId,
        numCriteria,
        encounterId
      );

      return {
        patientId,
        measureId,
        isDenominatorEligible: true,
        numeratorMet: numeratorCheck.met,
        exclusionApplied: false,
        sourceData: {
          ...denominatorCheck.sourceData,
          ...numeratorCheck.sourceData,
        },
      };
    } catch (error) {
      logger.error('Error evaluating patient for measure:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Track measure performance for a patient
   */
  async trackMeasurePerformance(
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId: string,
    providerId: string,
    result: PatientMeasureResult
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const now = new Date();
      const year = now.getFullYear();
      const trackingPeriodStart = `${year}-01-01`;
      const trackingPeriodEnd = `${year}-12-31`;

      // Upsert patient measure tracking
      const trackingId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_measure_tracking (
          id, tenant_id, patient_id, measure_id, encounter_id, provider_id,
          is_denominator_eligible, performance_met, exclusion_applied, exclusion_reason,
          numerator_met, denominator_met, tracking_period_start, tracking_period_end,
          evaluated_at, source_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
        ON CONFLICT (tenant_id, patient_id, measure_id, tracking_period_start, encounter_id)
        DO UPDATE SET
          is_denominator_eligible = $7,
          performance_met = $8,
          exclusion_applied = $9,
          exclusion_reason = $10,
          numerator_met = $11,
          denominator_met = $12,
          evaluated_at = NOW(),
          source_data = $15,
          updated_at = NOW()`,
        [
          trackingId,
          tenantId,
          patientId,
          measureId,
          encounterId,
          providerId,
          result.isDenominatorEligible,
          result.numeratorMet,
          result.exclusionApplied,
          result.exclusionReason || null,
          result.numeratorMet,
          result.isDenominatorEligible,
          trackingPeriodStart,
          trackingPeriodEnd,
          JSON.stringify(result.sourceData),
        ]
      );

      // Record event
      const eventId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_measure_events (
          id, tenant_id, patient_id, measure_id, provider_id, encounter_id,
          event_date, event_type, numerator_met, denominator_met, excluded, exclusion_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11)`,
        [
          eventId,
          tenantId,
          patientId,
          measureId,
          providerId,
          encounterId,
          'encounter_evaluation',
          result.numeratorMet,
          result.isDenominatorEligible,
          result.exclusionApplied,
          result.exclusionReason || null,
        ]
      );

      // Update or create care gap
      if (result.isDenominatorEligible && !result.numeratorMet && !result.exclusionApplied) {
        await this.createOrUpdateCareGap(
          client,
          tenantId,
          patientId,
          measureId,
          providerId
        );
      } else {
        // Close any existing care gap
        await this.closeCareGap(client, tenantId, patientId, measureId, encounterId);
      }

      await client.query('COMMIT');
      logger.info(`Tracked measure performance for patient ${patientId}, measure ${measureId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error tracking measure performance:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate performance rate for a measure
   */
  async calculateMeasureRate(
    tenantId: string,
    measureId: string,
    providerId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<MeasurePerformance> {
    const now = new Date();
    const year = now.getFullYear();
    const periodStart = startDate || `${year}-01-01`;
    const periodEnd = endDate || `${year}-12-31`;

    const result = await pool.query(
      `SELECT
        qm.id as measure_db_id,
        qm.measure_id,
        qm.measure_name,
        qm.benchmark_data,
        COUNT(*) FILTER (WHERE pmt.denominator_met = true) as denominator_count,
        COUNT(*) FILTER (WHERE pmt.numerator_met = true) as numerator_count,
        COUNT(*) FILTER (WHERE pmt.exclusion_applied = true) as exclusion_count
      FROM quality_measures qm
      LEFT JOIN patient_measure_tracking pmt ON pmt.measure_id = qm.id
        AND pmt.tenant_id = $1
        AND pmt.tracking_period_start >= $3
        AND pmt.tracking_period_end <= $4
        ${providerId ? 'AND pmt.provider_id = $5' : ''}
      WHERE qm.measure_id = $2
      GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.benchmark_data`,
      providerId
        ? [tenantId, measureId, periodStart, periodEnd, providerId]
        : [tenantId, measureId, periodStart, periodEnd]
    );

    if (!result.rowCount) {
      throw new Error(`Measure ${measureId} not found`);
    }

    const row = result.rows[0];
    const numerator = parseInt(row.numerator_count) || 0;
    const denominator = (parseInt(row.denominator_count) || 0) - (parseInt(row.exclusion_count) || 0);
    const performanceRate = denominator > 0 ? (numerator / denominator) * 100 : 0;
    const benchmark = row.benchmark_data?.national_average || 0;

    return {
      measureId: row.measure_id,
      measureName: row.measure_name,
      numeratorCount: numerator,
      denominatorCount: denominator,
      exclusionCount: parseInt(row.exclusion_count) || 0,
      performanceRate: Math.round(performanceRate * 100) / 100,
      benchmark,
      gap: Math.round((benchmark - performanceRate) * 100) / 100,
    };
  }

  /**
   * Get dermatology-specific quality measures
   */
  async getDermatologyMeasures(tenantId: string): Promise<QualityMeasure[]> {
    const result = await pool.query(
      `SELECT * FROM quality_measures
       WHERE (specialty = 'dermatology' OR specialty = 'all')
         AND category = 'quality'
         AND is_active = true
       ORDER BY high_priority DESC, measure_id`,
      []
    );

    return result.rows.map(this.mapMeasure);
  }

  /**
   * Track Promoting Interoperability measure
   */
  async trackPromotingInteroperability(
    tenantId: string,
    measureName: string,
    incrementNumerator: boolean,
    incrementDenominator: boolean,
    userId?: string
  ): Promise<PITracking> {
    const client = await pool.connect();
    try {
      const now = new Date();
      const year = now.getFullYear();
      const trackingPeriodStart = `${year}-01-01`;
      const trackingPeriodEnd = `${year}-12-31`;

      // Get or create PI tracking record
      const existingResult = await client.query(
        `SELECT * FROM promoting_interoperability_tracking
         WHERE tenant_id = $1 AND measure_name = $2 AND tracking_period_start = $3`,
        [tenantId, measureName, trackingPeriodStart]
      );

      let numerator = 0;
      let denominator = 0;

      if (existingResult.rowCount) {
        numerator = existingResult.rows[0].numerator || 0;
        denominator = existingResult.rows[0].denominator || 0;
      }

      if (incrementNumerator) numerator++;
      if (incrementDenominator) denominator++;

      const performanceRate = denominator > 0 ? (numerator / denominator) * 100 : 0;

      const trackingId = existingResult.rowCount
        ? existingResult.rows[0].id
        : crypto.randomUUID();

      await client.query(
        `INSERT INTO promoting_interoperability_tracking (
          id, tenant_id, measure_name, numerator, denominator, performance_rate,
          tracking_period_start, tracking_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, measure_name, tracking_period_start)
        DO UPDATE SET
          numerator = $4,
          denominator = $5,
          performance_rate = $6,
          updated_at = NOW()`,
        [
          trackingId,
          tenantId,
          measureName,
          numerator,
          denominator,
          performanceRate,
          trackingPeriodStart,
          trackingPeriodEnd,
        ]
      );

      return {
        measureName,
        numerator,
        denominator,
        performanceRate: Math.round(performanceRate * 100) / 100,
        isRequired: true,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Attest to an improvement activity
   */
  async attestImprovementActivity(
    tenantId: string,
    activityId: string,
    userId: string,
    startDate: string,
    endDate?: string,
    documentation?: Record<string, any>
  ): Promise<ImprovementActivity> {
    const client = await pool.connect();
    try {
      // Get activity info from quality_measures
      const measureResult = await client.query(
        `SELECT * FROM quality_measures WHERE measure_id = $1 AND category = 'ia'`,
        [activityId]
      );

      if (!measureResult.rowCount) {
        throw new Error(`Improvement activity ${activityId} not found`);
      }

      const measure = measureResult.rows[0];
      const weight = measure.weight >= 20 ? 'high' : 'medium';
      const points = measure.weight >= 20 ? 20 : 10;

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO improvement_activities (
          id, tenant_id, activity_id, activity_name, activity_description,
          weight, points, start_date, end_date, attestation_date, attestation_by,
          attestation_status, documentation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12)
        ON CONFLICT (tenant_id, activity_id, start_date)
        DO UPDATE SET
          end_date = $9,
          attestation_date = NOW(),
          attestation_by = $10,
          attestation_status = $11,
          documentation = $12,
          updated_at = NOW()`,
        [
          id,
          tenantId,
          activityId,
          measure.measure_name,
          measure.description,
          weight,
          points,
          startDate,
          endDate || null,
          userId,
          'attested',
          documentation ? JSON.stringify(documentation) : '{}',
        ]
      );

      return {
        activityId,
        activityName: measure.measure_name,
        weight,
        points,
        attestationStatus: 'attested',
        startDate,
        endDate,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate QRDA III report for submission
   */
  async generateQRDAReport(
    tenantId: string,
    year: number,
    providerId?: string
  ): Promise<{ reportId: string; summary: Record<string, any> }> {
    const client = await pool.connect();
    try {
      const periodStart = `${year}-01-01`;
      const periodEnd = `${year}-12-31`;

      // Get all measure performance
      const measuresResult = await client.query(
        `SELECT
          qm.measure_id,
          qm.measure_name,
          qm.category,
          COUNT(DISTINCT pmt.patient_id) FILTER (WHERE pmt.denominator_met = true) as denominator_count,
          COUNT(DISTINCT pmt.patient_id) FILTER (WHERE pmt.numerator_met = true) as numerator_count,
          COUNT(DISTINCT pmt.patient_id) FILTER (WHERE pmt.exclusion_applied = true) as exclusion_count
        FROM quality_measures qm
        LEFT JOIN patient_measure_tracking pmt ON pmt.measure_id = qm.id
          AND pmt.tenant_id = $1
          AND pmt.tracking_period_start >= $2
          AND pmt.tracking_period_end <= $3
          ${providerId ? 'AND pmt.provider_id = $4' : ''}
        WHERE qm.is_active = true AND qm.category = 'quality'
        GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.category`,
        providerId
          ? [tenantId, periodStart, periodEnd, providerId]
          : [tenantId, periodStart, periodEnd]
      );

      // Get unique patient count
      const patientCountResult = await client.query(
        `SELECT COUNT(DISTINCT patient_id) as patient_count
         FROM patient_measure_tracking
         WHERE tenant_id = $1
           AND tracking_period_start >= $2
           AND tracking_period_end <= $3
           ${providerId ? 'AND provider_id = $4' : ''}`,
        providerId
          ? [tenantId, periodStart, periodEnd, providerId]
          : [tenantId, periodStart, periodEnd]
      );

      const measureData = measuresResult.rows.map((row) => ({
        measureId: row.measure_id,
        measureName: row.measure_name,
        category: row.category,
        numerator: parseInt(row.numerator_count) || 0,
        denominator: (parseInt(row.denominator_count) || 0) - (parseInt(row.exclusion_count) || 0),
        exclusions: parseInt(row.exclusion_count) || 0,
        performanceRate:
          row.denominator_count - row.exclusion_count > 0
            ? ((row.numerator_count / (row.denominator_count - row.exclusion_count)) * 100).toFixed(2)
            : 0,
      }));

      const summary = {
        reportType: 'QRDA-III',
        reportingYear: year,
        providerId: providerId || 'practice_aggregate',
        generatedAt: new Date().toISOString(),
        patientCount: parseInt(patientCountResult.rows[0]?.patient_count) || 0,
        measureCount: measureData.length,
        measures: measureData,
      };

      // Save report record
      const reportId = crypto.randomUUID();
      await client.query(
        `INSERT INTO qrda_reports (
          id, tenant_id, report_type, reporting_year, reporting_period,
          generated_by, patient_count, measure_count, summary_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          reportId,
          tenantId,
          'QRDA-III',
          year,
          'annual',
          providerId || null,
          summary.patientCount,
          summary.measureCount,
          JSON.stringify(summary),
        ]
      );

      logger.info(`Generated QRDA-III report ${reportId} for year ${year}`);

      return { reportId, summary };
    } finally {
      client.release();
    }
  }

  /**
   * Get comprehensive MIPS dashboard with scores and recommendations
   */
  async getMIPSDashboard(
    tenantId: string,
    year?: number,
    providerId?: string
  ): Promise<MIPSDashboard> {
    const reportingYear = year || new Date().getFullYear();
    const periodStart = `${reportingYear}-01-01`;
    const periodEnd = `${reportingYear}-12-31`;

    // Get quality measure performance
    const qualityResult = await pool.query(
      `SELECT
        qm.measure_id,
        qm.measure_name,
        qm.benchmark_data,
        qm.high_priority,
        COUNT(*) FILTER (WHERE pmt.denominator_met = true) as denominator_count,
        COUNT(*) FILTER (WHERE pmt.numerator_met = true) as numerator_count,
        COUNT(*) FILTER (WHERE pmt.exclusion_applied = true) as exclusion_count
      FROM quality_measures qm
      LEFT JOIN patient_measure_tracking pmt ON pmt.measure_id = qm.id
        AND pmt.tenant_id = $1
        AND pmt.tracking_period_start >= $2
        AND pmt.tracking_period_end <= $3
        ${providerId ? 'AND pmt.provider_id = $4' : ''}
      WHERE qm.category = 'quality' AND qm.is_active = true
        AND (qm.specialty = 'dermatology' OR qm.specialty = 'all')
      GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.benchmark_data, qm.high_priority`,
      providerId
        ? [tenantId, periodStart, periodEnd, providerId]
        : [tenantId, periodStart, periodEnd]
    );

    const measures: MeasurePerformance[] = qualityResult.rows.map((row) => {
      const numerator = parseInt(row.numerator_count) || 0;
      const denominator = (parseInt(row.denominator_count) || 0) - (parseInt(row.exclusion_count) || 0);
      const performanceRate = denominator > 0 ? (numerator / denominator) * 100 : 0;
      const benchmark = row.benchmark_data?.national_average || 75;

      return {
        measureId: row.measure_id,
        measureName: row.measure_name,
        numeratorCount: numerator,
        denominatorCount: denominator,
        exclusionCount: parseInt(row.exclusion_count) || 0,
        performanceRate: Math.round(performanceRate * 100) / 100,
        benchmark,
        gap: Math.round((benchmark - performanceRate) * 100) / 100,
      };
    });

    // Calculate quality score (simplified - actual MIPS scoring is more complex)
    const qualityScore = this.calculateQualityScore(measures);

    // Get PI score
    const piResult = await pool.query(
      `SELECT measure_name, performance_rate, is_required
       FROM promoting_interoperability_tracking
       WHERE tenant_id = $1
         AND tracking_period_start = $2`,
      [tenantId, periodStart]
    );
    const piScore = this.calculatePIScore(piResult.rows);

    // Get IA score
    const iaResult = await pool.query(
      `SELECT activity_id, weight, points, attestation_status
       FROM improvement_activities
       WHERE tenant_id = $1
         AND start_date >= $2
         AND attestation_status = 'attested'`,
      [tenantId, periodStart]
    );
    const iaScore = this.calculateIAScore(iaResult.rows);

    // Cost score (placeholder - typically calculated by CMS)
    const costScore = 0;

    // Calculate final score with weights
    const finalScore =
      qualityScore * 0.3 +
      piScore * 0.25 +
      iaScore * 0.15 +
      costScore * 0.3;

    // Get care gaps
    const gapsResult = await pool.query(
      `SELECT
        qg.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        qg.measure_id,
        qm.measure_name,
        qg.gap_reason,
        qg.recommended_action,
        qg.priority,
        qg.due_date
      FROM quality_gaps qg
      JOIN patients p ON p.id = qg.patient_id
      JOIN quality_measures qm ON qm.id = qg.measure_id
      WHERE qg.tenant_id = $1
        AND qg.status = 'open'
        ${providerId ? 'AND qg.provider_id = $2' : ''}
      ORDER BY
        CASE qg.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        qg.due_date NULLS LAST
      LIMIT 50`,
      providerId ? [tenantId, providerId] : [tenantId]
    );

    const careGaps: CareGap[] = gapsResult.rows.map((row) => ({
      patientId: row.patient_id,
      patientName: row.patient_name,
      measureId: row.measure_id,
      measureName: row.measure_name,
      gapReason: row.gap_reason || 'Performance not met',
      recommendedAction: row.recommended_action || 'Schedule follow-up visit',
      priority: row.priority,
      dueDate: row.due_date,
    }));

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      measures,
      qualityScore,
      piScore,
      iaScore,
      careGaps.length
    );

    // Calculate payment adjustment
    const paymentAdjustment = this.calculatePaymentAdjustment(finalScore);

    return {
      qualityScore: Math.round(qualityScore * 100) / 100,
      piScore: Math.round(piScore * 100) / 100,
      iaScore: Math.round(iaScore * 100) / 100,
      costScore,
      estimatedFinalScore: Math.round(finalScore * 100) / 100,
      paymentAdjustment,
      measures,
      careGaps,
      recommendations,
    };
  }

  /**
   * Get care gaps for a specific patient
   */
  async getPatientCareGaps(
    tenantId: string,
    patientId: string
  ): Promise<CareGap[]> {
    const result = await pool.query(
      `SELECT
        qg.patient_id,
        p.first_name || ' ' || p.last_name as patient_name,
        qm.measure_id,
        qm.measure_name,
        qg.gap_reason,
        qg.recommended_action,
        qg.priority,
        qg.due_date
      FROM quality_gaps qg
      JOIN patients p ON p.id = qg.patient_id
      JOIN quality_measures qm ON qm.id = qg.measure_id
      WHERE qg.tenant_id = $1
        AND qg.patient_id = $2
        AND qg.status = 'open'
      ORDER BY
        CASE qg.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      [tenantId, patientId]
    );

    return result.rows.map((row) => ({
      patientId: row.patient_id,
      patientName: row.patient_name,
      measureId: row.measure_id,
      measureName: row.measure_name,
      gapReason: row.gap_reason || 'Performance not met',
      recommendedAction: row.recommended_action || 'Address during visit',
      priority: row.priority,
      dueDate: row.due_date,
    }));
  }

  /**
   * Auto-evaluate patient on encounter completion
   */
  async evaluatePatientOnEncounterComplete(
    tenantId: string,
    encounterId: string,
    patientId: string,
    providerId: string
  ): Promise<PatientMeasureResult[]> {
    const results: PatientMeasureResult[] = [];

    // Get all active dermatology measures
    const measures = await this.getDermatologyMeasures(tenantId);

    for (const measure of measures) {
      try {
        const result = await this.evaluatePatientForMeasure(
          tenantId,
          patientId,
          measure.measureId,
          encounterId,
          providerId
        );

        await this.trackMeasurePerformance(
          tenantId,
          patientId,
          measure.measureId,
          encounterId,
          providerId,
          result
        );

        results.push(result);
      } catch (error) {
        logger.error(`Error evaluating measure ${measure.measureId}:`, error);
      }
    }

    logger.info(`Evaluated ${results.length} measures for encounter ${encounterId}`);
    return results;
  }

  /**
   * Generate quarterly MIPS progress report
   */
  async generateQuarterlyReport(
    tenantId: string,
    year: number,
    quarter: number
  ): Promise<Record<string, any>> {
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);
    const periodStart = quarterStart.toISOString().split('T')[0];
    const periodEnd = quarterEnd.toISOString().split('T')[0];

    const dashboard = await this.getMIPSDashboard(tenantId, year);

    // Get quarter-specific stats
    const quarterStats = await pool.query(
      `SELECT
        COUNT(DISTINCT patient_id) as patients_evaluated,
        COUNT(*) as total_evaluations,
        COUNT(*) FILTER (WHERE numerator_met = true) as performance_met_count,
        COUNT(*) FILTER (WHERE exclusion_applied = true) as exclusion_count
      FROM patient_measure_tracking
      WHERE tenant_id = $1
        AND evaluated_at >= $2
        AND evaluated_at <= $3`,
      [tenantId, periodStart, periodEnd]
    );

    const stats = quarterStats.rows[0];

    return {
      reportPeriod: `Q${quarter} ${year}`,
      periodStart,
      periodEnd,
      generatedAt: new Date().toISOString(),
      summary: {
        patientsEvaluated: parseInt(stats.patients_evaluated) || 0,
        totalEvaluations: parseInt(stats.total_evaluations) || 0,
        performanceMetCount: parseInt(stats.performance_met_count) || 0,
        exclusionCount: parseInt(stats.exclusion_count) || 0,
      },
      scores: {
        quality: dashboard.qualityScore,
        pi: dashboard.piScore,
        ia: dashboard.iaScore,
        estimated: dashboard.estimatedFinalScore,
      },
      openCareGaps: dashboard.careGaps.length,
      recommendations: dashboard.recommendations,
      measurePerformance: dashboard.measures,
    };
  }

  // Private helper methods

  private async checkDenominatorEligibility(
    client: any,
    tenantId: string,
    patientId: string,
    criteria: Record<string, any>,
    encounterId?: string
  ): Promise<{ eligible: boolean; sourceData: Record<string, any> }> {
    const sourceData: Record<string, any> = {};

    // Check age criteria
    if (criteria.age_min || criteria.age_max) {
      const patientResult = await client.query(
        `SELECT dob FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rowCount) {
        const dob = new Date(patientResult.rows[0].dob);
        const age = Math.floor(
          (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );
        sourceData.patientAge = age;

        if (criteria.age_min && age < criteria.age_min) {
          return { eligible: false, sourceData };
        }
        if (criteria.age_max && age > criteria.age_max) {
          return { eligible: false, sourceData };
        }
      }
    }

    // Check diagnosis codes
    if (criteria.diagnosis_codes && criteria.diagnosis_codes.length > 0) {
      const diagPattern = criteria.diagnosis_codes
        .map((code: string) => code.replace('*', '%'))
        .join("' OR d.code LIKE '");

      const diagResult = await client.query(
        `SELECT d.code, d.description
         FROM encounter_diagnoses ed
         JOIN diagnoses d ON d.id = ed.diagnosis_id
         JOIN encounters e ON e.id = ed.encounter_id
         WHERE e.patient_id = $1 AND e.tenant_id = $2
           AND (d.code LIKE '${diagPattern}')
         LIMIT 10`,
        [patientId, tenantId]
      );

      if (!diagResult.rowCount) {
        return { eligible: false, sourceData };
      }
      sourceData.diagnoses = diagResult.rows;
    }

    // Check encounter type
    if (criteria.encounter_types && encounterId) {
      const encounterResult = await client.query(
        `SELECT e.*, at.name as appointment_type_name
         FROM encounters e
         LEFT JOIN appointments a ON a.id = e.appointment_id
         LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (encounterResult.rowCount) {
        sourceData.encounterType = encounterResult.rows[0].appointment_type_name;
      }
    }

    return { eligible: true, sourceData };
  }

  private async checkExclusions(
    client: any,
    tenantId: string,
    patientId: string,
    criteria: Record<string, any>
  ): Promise<{ excluded: boolean; reason?: string; sourceData: Record<string, any> }> {
    const sourceData: Record<string, any> = {};

    // Check exclusion conditions
    if (criteria.conditions && criteria.conditions.length > 0) {
      for (const condition of criteria.conditions) {
        if (condition === 'hospice_care') {
          const hospiceResult = await client.query(
            `SELECT 1 FROM chronic_conditions cc
             JOIN chronic_condition_definitions ccd ON ccd.id = cc.condition_id
             WHERE cc.patient_id = $1 AND cc.tenant_id = $2
               AND ccd.name ILIKE '%hospice%'
               AND cc.status = 'active'`,
            [patientId, tenantId]
          );

          if (hospiceResult.rowCount) {
            return {
              excluded: true,
              reason: 'Patient in hospice care',
              sourceData: { exclusionType: 'hospice_care' },
            };
          }
        }

        if (condition === 'palliative_care') {
          const palliativeResult = await client.query(
            `SELECT 1 FROM chronic_conditions cc
             JOIN chronic_condition_definitions ccd ON ccd.id = cc.condition_id
             WHERE cc.patient_id = $1 AND cc.tenant_id = $2
               AND ccd.name ILIKE '%palliative%'
               AND cc.status = 'active'`,
            [patientId, tenantId]
          );

          if (palliativeResult.rowCount) {
            return {
              excluded: true,
              reason: 'Patient receiving palliative care',
              sourceData: { exclusionType: 'palliative_care' },
            };
          }
        }
      }
    }

    // Check exclusion diagnosis codes
    if (criteria.diagnosis_codes && criteria.diagnosis_codes.length > 0) {
      const diagPattern = criteria.diagnosis_codes
        .map((code: string) => code.replace('*', '%'))
        .join("' OR d.code LIKE '");

      const diagResult = await client.query(
        `SELECT d.code, d.description
         FROM encounter_diagnoses ed
         JOIN diagnoses d ON d.id = ed.diagnosis_id
         JOIN encounters e ON e.id = ed.encounter_id
         WHERE e.patient_id = $1 AND e.tenant_id = $2
           AND (d.code LIKE '${diagPattern}')
         LIMIT 1`,
        [patientId, tenantId]
      );

      if (diagResult.rowCount) {
        return {
          excluded: true,
          reason: `Exclusion diagnosis: ${diagResult.rows[0].description}`,
          sourceData: { exclusionDiagnosis: diagResult.rows[0] },
        };
      }
    }

    return { excluded: false, sourceData };
  }

  private async checkNumeratorCriteria(
    client: any,
    tenantId: string,
    patientId: string,
    criteria: Record<string, any>,
    encounterId?: string
  ): Promise<{ met: boolean; sourceData: Record<string, any> }> {
    const sourceData: Record<string, any> = {};

    // Check documentation requirements
    if (criteria.documentation_required && criteria.documentation_required.length > 0) {
      // This would need to check specific documentation in notes/templates
      // Simplified check for encounter notes
      if (encounterId) {
        const notesResult = await client.query(
          `SELECT content FROM notes
           WHERE encounter_id = $1 AND tenant_id = $2`,
          [encounterId, tenantId]
        );

        if (notesResult.rowCount) {
          sourceData.hasNotes = true;
          // In a real implementation, you'd parse notes for specific documentation
        }
      }
    }

    // Check procedure codes
    if (criteria.procedure_codes && criteria.procedure_codes.length > 0) {
      const codeRange = criteria.procedure_codes
        .map((code: string) => {
          if (code.includes('-')) {
            const [start, end] = code.split('-');
            return `(c.cpt_code >= '${start}' AND c.cpt_code <= '${end}')`;
          }
          return `c.cpt_code = '${code}'`;
        })
        .join(' OR ');

      const procResult = await client.query(
        `SELECT c.cpt_code, c.description
         FROM charges c
         JOIN encounters e ON e.id = c.encounter_id
         WHERE e.patient_id = $1 AND e.tenant_id = $2
           AND (${codeRange})
         LIMIT 10`,
        [patientId, tenantId]
      );

      if (procResult.rowCount) {
        sourceData.procedures = procResult.rows;
        return { met: true, sourceData };
      }
    }

    // Check lab tests
    if (criteria.lab_tests && criteria.lab_tests.length > 0) {
      const labResult = await client.query(
        `SELECT lr.test_name, lr.result_value, lr.result_date
         FROM lab_results lr
         WHERE lr.patient_id = $1 AND lr.tenant_id = $2
           AND lr.test_name = ANY($3)
           AND lr.result_date >= NOW() - INTERVAL '12 months'
         LIMIT 10`,
        [patientId, tenantId, criteria.lab_tests]
      );

      if (labResult.rowCount) {
        sourceData.labResults = labResult.rows;
        return { met: true, sourceData };
      }
    }

    // Check PRO instruments
    if (criteria.pro_instruments && criteria.pro_instruments.length > 0) {
      // Check psoriasis registry for PASI scores, itch NRS, etc.
      const proResult = await client.query(
        `SELECT current_pasi_score, current_dlqi_score, current_itch_severity
         FROM psoriasis_registry
         WHERE patient_id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (proResult.rowCount) {
        sourceData.proScores = proResult.rows[0];
        // Check if improvement threshold is met
        if (criteria.improvement_threshold) {
          // Would need baseline comparison
          return { met: true, sourceData };
        }
      }
    }

    // Default: check if there are any notes with documentation
    if (encounterId) {
      const notesResult = await client.query(
        `SELECT 1 FROM notes WHERE encounter_id = $1 AND tenant_id = $2 LIMIT 1`,
        [encounterId, tenantId]
      );

      if (notesResult.rowCount) {
        return { met: true, sourceData };
      }
    }

    return { met: false, sourceData };
  }

  private async createOrUpdateCareGap(
    client: any,
    tenantId: string,
    patientId: string,
    measureId: string,
    providerId?: string
  ): Promise<void> {
    const gapId = crypto.randomUUID();

    // Get measure details for recommended action
    const measureResult = await client.query(
      `SELECT id, measure_name, high_priority FROM quality_measures WHERE measure_id = $1`,
      [measureId]
    );

    const measure = measureResult.rows[0];
    const priority = measure?.high_priority ? 'high' : 'medium';

    await client.query(
      `INSERT INTO quality_gaps (
        id, tenant_id, patient_id, measure_id, provider_id,
        status, priority, gap_reason, recommended_action
      ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)
      ON CONFLICT ON CONSTRAINT quality_gaps_tenant_id_patient_id_measure_id_status_key
      DO UPDATE SET
        provider_id = COALESCE($5, quality_gaps.provider_id),
        priority = $6,
        updated_at = NOW()`,
      [
        gapId,
        tenantId,
        patientId,
        measure?.id || measureId,
        providerId || null,
        priority,
        'Performance criteria not met',
        'Schedule follow-up visit to address measure requirements',
      ]
    );
  }

  private async closeCareGap(
    client: any,
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId: string
  ): Promise<void> {
    // Get measure db id
    const measureResult = await client.query(
      `SELECT id FROM quality_measures WHERE measure_id = $1`,
      [measureId]
    );

    if (measureResult.rowCount) {
      await client.query(
        `UPDATE quality_gaps
         SET status = 'closed',
             closed_date = NOW(),
             resolution_encounter_id = $4,
             resolution_method = 'encounter',
             updated_at = NOW()
         WHERE tenant_id = $1
           AND patient_id = $2
           AND measure_id = $3
           AND status = 'open'`,
        [tenantId, patientId, measureResult.rows[0].id, encounterId]
      );
    }
  }

  private calculateQualityScore(measures: MeasurePerformance[]): number {
    if (measures.length === 0) return 0;

    // Simplified MIPS quality score calculation
    // Real calculation involves deciles, benchmarks, and measure weights
    const totalPerformance = measures.reduce((sum, m) => sum + m.performanceRate, 0);
    const averagePerformance = totalPerformance / measures.length;

    // Convert to 0-100 scale with some adjustments for benchmarks
    return Math.min(100, averagePerformance);
  }

  private calculatePIScore(piData: any[]): number {
    if (piData.length === 0) return 0;

    const requiredMeasures = piData.filter((m) => m.is_required);
    if (requiredMeasures.length === 0) return 0;

    // Check if all required measures meet threshold
    const allMet = requiredMeasures.every((m) => m.performance_rate >= 1);

    if (!allMet) return 0;

    // Calculate weighted score
    const totalRate = piData.reduce(
      (sum, m) => sum + (parseFloat(m.performance_rate) || 0),
      0
    );
    return Math.min(100, (totalRate / piData.length) * 10);
  }

  private calculateIAScore(iaData: any[]): number {
    // Need 40 points for full credit
    const totalPoints = iaData.reduce(
      (sum, a) => sum + (parseFloat(a.points) || 0),
      0
    );

    // Convert to 0-100 scale (40 points = 100)
    return Math.min(100, (totalPoints / 40) * 100);
  }

  private calculatePaymentAdjustment(finalScore: number): number {
    // MIPS payment adjustment based on final score
    // Scores below 75 result in negative adjustment
    // Scores above 75 result in positive adjustment
    // This is a simplified calculation

    if (finalScore < 11.25) return -9; // Maximum penalty
    if (finalScore < 30) return -7;
    if (finalScore < 45) return -5;
    if (finalScore < 60) return -3;
    if (finalScore < 75) return 0;
    if (finalScore < 85) return 1;
    if (finalScore < 95) return 3;
    return 5; // Maximum bonus (subject to budget neutrality)
  }

  private generateRecommendations(
    measures: MeasurePerformance[],
    qualityScore: number,
    piScore: number,
    iaScore: number,
    openGapsCount: number
  ): string[] {
    const recommendations: string[] = [];

    // Quality recommendations
    const lowPerformingMeasures = measures.filter((m) => m.performanceRate < m.benchmark);
    if (lowPerformingMeasures.length > 0) {
      recommendations.push(
        `Focus on improving ${lowPerformingMeasures.length} measures performing below benchmark: ${lowPerformingMeasures
          .slice(0, 3)
          .map((m) => m.measureName)
          .join(', ')}`
      );
    }

    // Care gaps
    if (openGapsCount > 0) {
      recommendations.push(
        `Address ${openGapsCount} open care gaps through patient outreach and scheduled visits`
      );
    }

    // PI recommendations
    if (piScore < 100) {
      recommendations.push(
        'Ensure all Promoting Interoperability measures are met, including e-Prescribing and patient portal access'
      );
    }

    // IA recommendations
    if (iaScore < 100) {
      recommendations.push(
        'Consider attesting to additional Improvement Activities to maximize IA score (need 40 points for full credit)'
      );
    }

    // Overall score recommendations
    if (qualityScore < 75) {
      recommendations.push(
        'Overall quality score is below performance threshold. Focus on high-priority measures and documentation'
      );
    }

    // Melanoma-specific
    const melanomaRecall = measures.find((m) => m.measureId === 'DERM002');
    if (melanomaRecall && melanomaRecall.performanceRate < 80) {
      recommendations.push(
        'Improve melanoma recall system enrollment - ensure all melanoma patients have documented surveillance schedules'
      );
    }

    // TB screening
    const tbScreening = measures.find((m) => m.measureId === 'DERM004');
    if (tbScreening && tbScreening.performanceRate < 95) {
      recommendations.push(
        'TB screening before systemic therapy is critical - verify screening for all patients starting biologics/JAK inhibitors'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Performance is on track. Continue current quality improvement efforts and maintain documentation standards.'
      );
    }

    return recommendations;
  }

  private mapMeasure(row: any): QualityMeasure {
    return {
      id: row.id,
      measureId: row.measure_id,
      measureName: row.measure_name,
      description: row.description,
      category: row.category,
      specialty: row.specialty,
      numeratorCriteria: row.numerator_criteria || {},
      denominatorCriteria: row.denominator_criteria || {},
      exclusionCriteria: row.exclusion_criteria || {},
      benchmarkData: row.benchmark_data || {},
      measureType: row.measure_type,
      highPriority: row.high_priority,
      isActive: row.is_active,
    };
  }
}

export const qualityMeasuresService = new QualityMeasuresService();
