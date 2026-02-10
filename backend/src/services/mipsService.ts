import { pool } from '../db/pool';
import { PoolClient } from 'pg';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MIPSMeasure {
  id: string;
  measureId: string;
  measureName: string;
  description: string;
  category: 'quality' | 'pi' | 'ia' | 'cost';
  specialty: string;
  numeratorCriteria: Record<string, unknown>;
  denominatorCriteria: Record<string, unknown>;
  exclusionCriteria: Record<string, unknown>;
  benchmarkData: Record<string, unknown>;
  points: number;
  highPriority: boolean;
  isActive: boolean;
  cmsMeasureId?: string;
}

export interface PatientMeasureStatus {
  id: string;
  patientId: string;
  measureId: string;
  encounterId?: string;
  status: 'eligible' | 'met' | 'not_met' | 'excluded' | 'pending';
  statusDate: string;
  documentation?: string;
  documentationData: Record<string, unknown>;
  exclusionReason?: string;
  performanceMet: boolean;
}

export interface MeasurePerformanceResult {
  measureId: string;
  measureCode: string;
  measureName: string;
  numeratorCount: number;
  denominatorCount: number;
  exclusionCount: number;
  performanceRate: number;
  benchmark: number;
  gap: number;
  metThreshold: boolean;
  decileScore: number;
  pointsEarned: number;
}

export interface MIPSReport {
  reportId: string;
  providerId?: string;
  reportingYear: number;
  generatedAt: string;
  qualityScore: number;
  piScore: number;
  iaScore: number;
  costScore: number;
  finalScore: number;
  paymentAdjustment: number;
  qualityMeasures: MeasurePerformanceResult[];
  piMeasures: PITracking[];
  iaActivities: IAActivity[];
  recommendations: string[];
  careGapCount: number;
  patientCount: number;
}

export interface PITracking {
  measureName: string;
  numerator: number;
  denominator: number;
  performanceRate: number;
  isRequired: boolean;
  threshold: number;
  metThreshold: boolean;
  attestationStatus?: boolean;
}

export interface IAActivity {
  activityId: string;
  activityName: string;
  weight: 'medium' | 'high';
  points: number;
  isAttested: boolean;
  attestationDate?: string;
  startDate?: string;
  endDate?: string;
}

export interface EncounterMeasureChecklist {
  encounterId: string;
  patientId: string;
  measures: Array<{
    measureId: string;
    measureCode: string;
    measureName: string;
    isApplicable: boolean;
    isCompleted: boolean;
    status: 'pending' | 'met' | 'not_met' | 'excluded' | 'not_applicable';
    requiredActions: string[];
    completedActions: string[];
    notes?: string;
  }>;
}

export interface MeasureAlert {
  id: string;
  patientId: string;
  patientName: string;
  measureId: string;
  measureCode: string;
  measureName: string;
  alertType: 'gap' | 'pending' | 'expiring' | 'reminder' | 'opportunity';
  alertPriority: 'low' | 'medium' | 'high' | 'critical';
  alertTitle: string;
  alertMessage: string;
  recommendedAction?: string;
}

// ============================================================================
// MIPS SERVICE CLASS
// ============================================================================

export class MIPSService {
  /**
   * Evaluate all applicable measures for a patient encounter
   */
  async evaluatePatientMeasures(
    tenantId: string,
    encounterId: string,
    patientId: string,
    providerId: string
  ): Promise<PatientMeasureStatus[]> {
    const client = await pool.connect();
    try {
      // Get applicable dermatology measures
      const measuresResult = await client.query(
        `SELECT * FROM quality_measures
         WHERE (specialty = 'dermatology' OR specialty = 'all')
           AND category = 'quality'
           AND is_active = true
         ORDER BY high_priority DESC, measure_id`
      );

      const results: PatientMeasureStatus[] = [];

      for (const measure of measuresResult.rows) {
        try {
          const status = await this.evaluateSingleMeasure(
            client,
            tenantId,
            patientId,
            encounterId,
            providerId,
            measure
          );
          results.push(status);

          // Record the status
          await this.recordMeasureStatusInternal(
            client,
            tenantId,
            patientId,
            measure.id,
            encounterId,
            providerId,
            status.status,
            status.documentation,
            status.exclusionReason,
            status.documentationData
          );
        } catch (err) {
          logger.error(`Error evaluating measure ${measure.measure_id}:`, err);
        }
      }

      // Generate checklist for encounter
      await this.generateEncounterChecklist(client, tenantId, encounterId, patientId, providerId, results);

      logger.info(`Evaluated ${results.length} measures for encounter ${encounterId}`);
      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Record measure status for a patient
   */
  async recordMeasureStatus(
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId: string | undefined,
    status: 'eligible' | 'met' | 'not_met' | 'excluded' | 'pending',
    documentation?: string,
    exclusionReason?: string,
    documentationData?: Record<string, unknown>
  ): Promise<PatientMeasureStatus> {
    const client = await pool.connect();
    try {
      // Get measure info
      const measureResult = await client.query(
        `SELECT * FROM quality_measures WHERE id = $1 OR measure_id = $1`,
        [measureId]
      );

      if (!measureResult.rowCount) {
        throw new Error(`Measure ${measureId} not found`);
      }

      const measure = measureResult.rows[0];

      const result = await this.recordMeasureStatusInternal(
        client,
        tenantId,
        patientId,
        measure.id,
        encounterId,
        undefined,
        status,
        documentation,
        exclusionReason,
        documentationData
      );

      // Update or close any existing alerts
      if (status === 'met' || status === 'excluded') {
        await this.resolvePatientMeasureAlerts(client, tenantId, patientId, measure.id, encounterId);
      }

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate performance for a provider and measure
   */
  async calculatePerformance(
    tenantId: string,
    providerId: string | undefined,
    measureId: string,
    startDate: string,
    endDate: string
  ): Promise<MeasurePerformanceResult> {
    const result = await pool.query(
      `SELECT
        qm.id,
        qm.measure_id,
        qm.measure_name,
        qm.benchmark_data,
        qm.points,
        COUNT(*) FILTER (WHERE pms.status IN ('met', 'not_met', 'eligible')) as denominator_count,
        COUNT(*) FILTER (WHERE pms.status = 'met') as numerator_count,
        COUNT(*) FILTER (WHERE pms.status = 'excluded') as exclusion_count
      FROM quality_measures qm
      LEFT JOIN patient_measure_status pms ON pms.measure_id = qm.id
        AND pms.tenant_id = $1
        AND pms.status_date >= $3::date
        AND pms.status_date <= $4::date
        ${providerId ? 'AND pms.provider_id = $5' : ''}
      WHERE (qm.id = $2 OR qm.measure_id = $2)
      GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.benchmark_data, qm.points`,
      providerId
        ? [tenantId, measureId, startDate, endDate, providerId]
        : [tenantId, measureId, startDate, endDate]
    );

    if (!result.rowCount) {
      throw new Error(`Measure ${measureId} not found`);
    }

    const row = result.rows[0];
    const numerator = parseInt(row.numerator_count) || 0;
    const denominator = (parseInt(row.denominator_count) || 0);
    const exclusions = parseInt(row.exclusion_count) || 0;
    const adjustedDenominator = denominator - exclusions;
    const performanceRate = adjustedDenominator > 0 ? (numerator / adjustedDenominator) * 100 : 0;
    const benchmark = row.benchmark_data?.national_average || 75;
    const topDecile = row.benchmark_data?.top_decile || 95;

    // Calculate decile score (simplified)
    const decileScore = this.calculateDecileScore(performanceRate, benchmark, topDecile);
    const pointsEarned = (decileScore / 10) * (row.points || 10);

    return {
      measureId: row.measure_id,
      measureCode: row.measure_id,
      measureName: row.measure_name,
      numeratorCount: numerator,
      denominatorCount: adjustedDenominator,
      exclusionCount: exclusions,
      performanceRate: Math.round(performanceRate * 100) / 100,
      benchmark,
      gap: Math.round((benchmark - performanceRate) * 100) / 100,
      metThreshold: performanceRate >= 60,
      decileScore,
      pointsEarned: Math.round(pointsEarned * 100) / 100,
    };
  }

  /**
   * Generate comprehensive MIPS report for a provider
   */
  async generateMIPSReport(
    tenantId: string,
    providerId: string | undefined,
    year: number
  ): Promise<MIPSReport> {
    const client = await pool.connect();
    try {
      const periodStart = `${year}-01-01`;
      const periodEnd = `${year}-12-31`;

      // Get quality measures performance
      const qualityMeasures = await this.getQualityMeasuresPerformance(
        client,
        tenantId,
        providerId,
        periodStart,
        periodEnd
      );

      // Get PI measures
      const piMeasures = await this.getPIMeasures(client, tenantId, periodStart);

      // Get IA activities
      const iaActivities = await this.getIAActivities(client, tenantId, periodStart);

      // Calculate scores
      const qualityScore = this.calculateQualityScore(qualityMeasures);
      const piScore = this.calculatePIScore(piMeasures);
      const iaScore = this.calculateIAScore(iaActivities);
      const costScore = 0; // Cost score is calculated by CMS

      // Calculate final score with weights
      const finalScore =
        qualityScore * 0.3 +
        piScore * 0.25 +
        iaScore * 0.15 +
        costScore * 0.3;

      // Calculate payment adjustment
      const paymentAdjustment = this.calculatePaymentAdjustment(finalScore);

      // Get care gap count
      const gapResult = await client.query(
        `SELECT COUNT(*) as count FROM quality_gaps
         WHERE tenant_id = $1 AND status = 'open'
         ${providerId ? 'AND provider_id = $2' : ''}`,
        providerId ? [tenantId, providerId] : [tenantId]
      );
      const careGapCount = parseInt(gapResult.rows[0]?.count) || 0;

      // Get patient count
      const patientResult = await client.query(
        `SELECT COUNT(DISTINCT patient_id) as count
         FROM patient_measure_status
         WHERE tenant_id = $1
           AND status_date >= $2
           AND status_date <= $3
         ${providerId ? 'AND provider_id = $4' : ''}`,
        providerId
          ? [tenantId, periodStart, periodEnd, providerId]
          : [tenantId, periodStart, periodEnd]
      );
      const patientCount = parseInt(patientResult.rows[0]?.count) || 0;

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        qualityMeasures,
        qualityScore,
        piScore,
        iaScore,
        careGapCount
      );

      // Save report
      const reportId = crypto.randomUUID();

      // Save to history
      await client.query(
        `INSERT INTO mips_score_history (
          id, tenant_id, provider_id, calculation_date, reporting_year,
          quality_score, pi_score, ia_score, cost_score, final_score,
          estimated_payment_adjustment, measure_details
        ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          reportId,
          tenantId,
          providerId || null,
          year,
          qualityScore,
          piScore,
          iaScore,
          costScore,
          finalScore,
          paymentAdjustment,
          JSON.stringify({ qualityMeasures, piMeasures, iaActivities }),
        ]
      );

      return {
        reportId,
        providerId,
        reportingYear: year,
        generatedAt: new Date().toISOString(),
        qualityScore: Math.round(qualityScore * 100) / 100,
        piScore: Math.round(piScore * 100) / 100,
        iaScore: Math.round(iaScore * 100) / 100,
        costScore,
        finalScore: Math.round(finalScore * 100) / 100,
        paymentAdjustment,
        qualityMeasures,
        piMeasures,
        iaActivities,
        recommendations,
        careGapCount,
        patientCount,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get improvement activities for a provider
   */
  async getImprovementActivities(
    tenantId: string,
    year?: number
  ): Promise<{ attested: IAActivity[]; available: IAActivity[]; totalPoints: number; requiredPoints: number }> {
    const reportingYear = year || new Date().getFullYear();
    const periodStart = `${reportingYear}-01-01`;

    const client = await pool.connect();
    try {
      // Get attested activities
      const attestedResult = await client.query(
        `SELECT * FROM ia_activities
         WHERE tenant_id = $1
           AND start_date >= $2
           AND is_attested = true
         ORDER BY weight DESC, activity_id`,
        [tenantId, periodStart]
      );

      const attested: IAActivity[] = attestedResult.rows.map((row) => ({
        activityId: row.activity_id,
        activityName: row.activity_name,
        weight: row.weight,
        points: row.points,
        isAttested: row.is_attested,
        attestationDate: row.attestation_date,
        startDate: row.start_date,
        endDate: row.end_date,
      }));

      // Get available activities
      const availableResult = await client.query(
        `SELECT measure_id, measure_name, description, weight
         FROM quality_measures
         WHERE category = 'ia' AND is_active = true
         ORDER BY weight DESC, measure_id`
      );

      const available: IAActivity[] = availableResult.rows.map((row) => ({
        activityId: row.measure_id,
        activityName: row.measure_name,
        weight: row.weight >= 20 ? 'high' : 'medium',
        points: row.weight >= 20 ? 20 : 10,
        isAttested: false,
      }));

      const totalPoints = attested.reduce((sum, a) => sum + a.points, 0);

      return {
        attested,
        available,
        totalPoints,
        requiredPoints: 40,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Attest to an improvement activity
   */
  async attestIAActivity(
    tenantId: string,
    activityId: string,
    userId: string,
    startDate: string,
    endDate?: string,
    documentation?: Record<string, unknown>
  ): Promise<IAActivity> {
    const client = await pool.connect();
    try {
      // Get activity info
      const activityResult = await client.query(
        `SELECT * FROM quality_measures WHERE measure_id = $1 AND category = 'ia'`,
        [activityId]
      );

      if (!activityResult.rowCount) {
        throw new Error(`Improvement activity ${activityId} not found`);
      }

      const activity = activityResult.rows[0];
      const weight = activity.weight >= 20 ? 'high' : 'medium';
      const points = activity.weight >= 20 ? 20 : 10;

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO ia_activities (
          id, tenant_id, activity_id, activity_name, activity_description,
          weight, category, points, is_attested, attestation_date, attestation_by,
          start_date, end_date, documentation, attestation_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_DATE, $9, $10, $11, $12, 'attested')
        ON CONFLICT (tenant_id, activity_id, start_date)
        DO UPDATE SET
          is_attested = true,
          attestation_date = CURRENT_DATE,
          attestation_by = $9,
          end_date = $11,
          documentation = $12,
          attestation_status = 'attested',
          updated_at = NOW()`,
        [
          id,
          tenantId,
          activityId,
          activity.measure_name,
          activity.description,
          weight,
          'ia',
          points,
          userId,
          startDate,
          endDate || null,
          JSON.stringify(documentation || {}),
        ]
      );

      logger.info(`Attested IA activity ${activityId} for tenant ${tenantId}`);

      return {
        activityId,
        activityName: activity.measure_name,
        weight,
        points,
        isAttested: true,
        attestationDate: new Date().toISOString().split('T')[0],
        startDate,
        endDate,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Estimate MIPS score with current data
   */
  async estimateMIPSScore(
    tenantId: string,
    providerId?: string,
    year?: number
  ): Promise<{
    estimated: number;
    quality: number;
    pi: number;
    ia: number;
    cost: number;
    paymentAdjustment: number;
    trajectory: 'improving' | 'declining' | 'stable';
    projectedYear: number;
  }> {
    const reportingYear = year || new Date().getFullYear();
    const report = await this.generateMIPSReport(tenantId, providerId, reportingYear);

    // Get historical scores for trajectory
    const historyResult = await pool.query(
      `SELECT final_score, calculation_date
       FROM mips_score_history
       WHERE tenant_id = $1
         AND reporting_year = $2
         ${providerId ? 'AND provider_id = $3' : 'AND provider_id IS NULL'}
       ORDER BY calculation_date DESC
       LIMIT 5`,
      providerId ? [tenantId, reportingYear, providerId] : [tenantId, reportingYear]
    );

    let trajectory: 'improving' | 'declining' | 'stable' = 'stable';
    if (historyResult.rows.length >= 2) {
      const recentScores = historyResult.rows.map((r) => parseFloat(r.final_score));
      const avgRecent = recentScores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const avgOlder = recentScores.slice(2).reduce((a, b) => a + b, 0) / Math.max(1, recentScores.length - 2);

      if (avgRecent > avgOlder + 2) trajectory = 'improving';
      else if (avgRecent < avgOlder - 2) trajectory = 'declining';
    }

    return {
      estimated: report.finalScore,
      quality: report.qualityScore,
      pi: report.piScore,
      ia: report.iaScore,
      cost: report.costScore,
      paymentAdjustment: report.paymentAdjustment,
      trajectory,
      projectedYear: reportingYear,
    };
  }

  /**
   * Get encounter measure checklist
   */
  async getEncounterMeasureChecklist(
    tenantId: string,
    encounterId: string
  ): Promise<EncounterMeasureChecklist | null> {
    const result = await pool.query(
      `SELECT
        emc.*,
        qm.measure_id as measure_code,
        qm.measure_name
      FROM encounter_measure_checklist emc
      JOIN quality_measures qm ON qm.id = emc.measure_id
      WHERE emc.tenant_id = $1 AND emc.encounter_id = $2
      ORDER BY qm.high_priority DESC, qm.measure_id`,
      [tenantId, encounterId]
    );

    if (!result.rowCount) {
      return null;
    }

    const firstRow = result.rows[0];
    return {
      encounterId,
      patientId: firstRow.patient_id,
      measures: result.rows.map((row) => ({
        measureId: row.measure_id,
        measureCode: row.measure_code,
        measureName: row.measure_name,
        isApplicable: row.is_applicable,
        isCompleted: row.is_completed,
        status: row.completion_status,
        requiredActions: row.required_actions || [],
        completedActions: row.completed_actions || [],
        notes: row.completion_notes,
      })),
    };
  }

  /**
   * Update encounter measure checklist item
   */
  async updateEncounterChecklistItem(
    tenantId: string,
    encounterId: string,
    measureId: string,
    status: 'pending' | 'met' | 'not_met' | 'excluded' | 'not_applicable',
    completedActions?: string[],
    notes?: string
  ): Promise<void> {
    const isCompleted = status === 'met' || status === 'excluded' || status === 'not_applicable';

    await pool.query(
      `UPDATE encounter_measure_checklist
       SET completion_status = $1,
           is_completed = $2,
           completed_actions = COALESCE($3, completed_actions),
           completion_notes = COALESCE($4, completion_notes),
           completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE tenant_id = $5 AND encounter_id = $6 AND measure_id = $7`,
      [status, isCompleted, completedActions ? JSON.stringify(completedActions) : null, notes, tenantId, encounterId, measureId]
    );

    // Also update patient_measure_status
    const checklistResult = await pool.query(
      `SELECT patient_id, provider_id FROM encounter_measure_checklist
       WHERE tenant_id = $1 AND encounter_id = $2 AND measure_id = $3`,
      [tenantId, encounterId, measureId]
    );

    if (checklistResult.rowCount) {
      const { patient_id, provider_id } = checklistResult.rows[0];
      await this.recordMeasureStatus(
        tenantId,
        patient_id,
        measureId,
        encounterId,
        status === 'not_applicable' ? 'excluded' : status,
        notes,
        status === 'not_applicable' ? 'Not applicable for this encounter' : undefined
      );
    }
  }

  /**
   * Get measure alerts for a patient
   */
  async getPatientMeasureAlerts(
    tenantId: string,
    patientId: string
  ): Promise<MeasureAlert[]> {
    const result = await pool.query(
      `SELECT
        ma.*,
        p.first_name || ' ' || p.last_name as patient_name,
        qm.measure_id as measure_code,
        qm.measure_name
      FROM measure_alerts ma
      JOIN patients p ON p.id = ma.patient_id
      JOIN quality_measures qm ON qm.id = ma.measure_id
      WHERE ma.tenant_id = $1
        AND ma.patient_id = $2
        AND ma.is_dismissed = false
        AND ma.is_resolved = false
      ORDER BY
        CASE ma.alert_priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        ma.created_at DESC`,
      [tenantId, patientId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      measureId: row.measure_id,
      measureCode: row.measure_code,
      measureName: row.measure_name,
      alertType: row.alert_type,
      alertPriority: row.alert_priority,
      alertTitle: row.alert_title,
      alertMessage: row.alert_message,
      recommendedAction: row.recommended_action,
    }));
  }

  /**
   * Dismiss a measure alert
   */
  async dismissMeasureAlert(
    tenantId: string,
    alertId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await pool.query(
      `UPDATE measure_alerts
       SET is_dismissed = true,
           dismissed_by = $1,
           dismissed_at = NOW(),
           dismiss_reason = $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [userId, reason, alertId, tenantId]
    );
  }

  /**
   * Get patient measure status history
   */
  async getPatientMeasureHistory(
    tenantId: string,
    patientId: string,
    year?: number
  ): Promise<PatientMeasureStatus[]> {
    const reportingYear = year || new Date().getFullYear();
    const periodStart = `${reportingYear}-01-01`;
    const periodEnd = `${reportingYear}-12-31`;

    const result = await pool.query(
      `SELECT
        pms.*,
        qm.measure_id as measure_code,
        qm.measure_name
      FROM patient_measure_status pms
      JOIN quality_measures qm ON qm.id = pms.measure_id
      WHERE pms.tenant_id = $1
        AND pms.patient_id = $2
        AND pms.status_date >= $3
        AND pms.status_date <= $4
      ORDER BY pms.status_date DESC, qm.measure_id`,
      [tenantId, patientId, periodStart, periodEnd]
    );

    return result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      measureId: row.measure_code,
      encounterId: row.encounter_id,
      status: row.status,
      statusDate: row.status_date,
      documentation: row.documentation,
      documentationData: row.documentation_data || {},
      exclusionReason: row.exclusion_reason,
      performanceMet: row.performance_met,
    }));
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async evaluateSingleMeasure(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    encounterId: string,
    providerId: string,
    measure: Record<string, unknown>
  ): Promise<PatientMeasureStatus> {
    const denomCriteria = measure.denominator_criteria as Record<string, unknown>;
    const numCriteria = measure.numerator_criteria as Record<string, unknown>;
    const exclCriteria = measure.exclusion_criteria as Record<string, unknown>;

    // Check denominator eligibility (patient is in measure population)
    const isEligible = await this.checkDenominatorCriteria(client, tenantId, patientId, encounterId, denomCriteria);

    if (!isEligible.eligible) {
      return {
        id: crypto.randomUUID(),
        patientId,
        measureId: measure.measure_id as string,
        encounterId,
        status: 'pending',
        statusDate: new Date().toISOString().split('T')[0] as string,
        documentation: 'Patient does not meet denominator criteria',
        documentationData: isEligible.data,
        performanceMet: false,
      };
    }

    // Check for exclusions
    const exclusion = await this.checkExclusionCriteria(client, tenantId, patientId, exclCriteria);

    if (exclusion.excluded) {
      return {
        id: crypto.randomUUID(),
        patientId,
        measureId: measure.measure_id as string,
        encounterId,
        status: 'excluded',
        statusDate: new Date().toISOString().split('T')[0] as string,
        documentation: 'Exclusion criteria met',
        documentationData: exclusion.data,
        exclusionReason: exclusion.reason,
        performanceMet: false,
      };
    }

    // Check numerator criteria (performance met)
    const performanceMet = await this.checkNumeratorCriteria(client, tenantId, patientId, encounterId, numCriteria);

    return {
      id: crypto.randomUUID(),
      patientId,
      measureId: measure.measure_id as string,
      encounterId,
      status: performanceMet.met ? 'met' : 'not_met',
      statusDate: new Date().toISOString().split('T')[0] as string,
      documentation: performanceMet.met ? 'Performance criteria met' : 'Performance criteria not met',
      documentationData: performanceMet.data,
      performanceMet: performanceMet.met,
    };
  }

  private async checkDenominatorCriteria(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    encounterId: string,
    criteria: Record<string, unknown>
  ): Promise<{ eligible: boolean; data: Record<string, unknown> }> {
    const data: Record<string, unknown> = {};

    // Check age
    if (criteria.age_min || criteria.age_max) {
      const patientResult = await client.query(
        `SELECT dob FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rowCount) {
        const dob = new Date(patientResult.rows[0].dob);
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        data.patientAge = age;

        if (criteria.age_min && age < (criteria.age_min as number)) {
          return { eligible: false, data };
        }
        if (criteria.age_max && age > (criteria.age_max as number)) {
          return { eligible: false, data };
        }
      }
    }

    // Check diagnosis codes
    if (criteria.diagnosis_codes && Array.isArray(criteria.diagnosis_codes) && criteria.diagnosis_codes.length > 0) {
      const diagCodes = criteria.diagnosis_codes as string[];
      const diagPattern = diagCodes.map((code) => code.replace('*', '%')).join("' OR d.code LIKE '");

      const diagResult = await client.query(
        `SELECT d.code, d.description
         FROM encounter_diagnoses ed
         JOIN diagnoses d ON d.id = ed.diagnosis_id
         JOIN encounters e ON e.id = ed.encounter_id
         WHERE e.patient_id = $1 AND e.tenant_id = $2
           AND (d.code LIKE '${diagPattern}')
         LIMIT 5`,
        [patientId, tenantId]
      );

      if (!diagResult.rowCount) {
        data.reason = 'No matching diagnoses found';
        return { eligible: false, data };
      }
      data.matchingDiagnoses = diagResult.rows;
    }

    return { eligible: true, data };
  }

  private async checkExclusionCriteria(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    criteria: Record<string, unknown>
  ): Promise<{ excluded: boolean; reason?: string; data: Record<string, unknown> }> {
    const data: Record<string, unknown> = {};

    if (!criteria.conditions || !Array.isArray(criteria.conditions)) {
      return { excluded: false, data };
    }

    const conditions = criteria.conditions as string[];

    for (const condition of conditions) {
      if (condition === 'hospice_care' || condition === 'palliative_care') {
        const conditionResult = await client.query(
          `SELECT 1 FROM chronic_conditions cc
           JOIN chronic_condition_definitions ccd ON ccd.id = cc.condition_id
           WHERE cc.patient_id = $1 AND cc.tenant_id = $2
             AND ccd.name ILIKE $3
             AND cc.status = 'active'`,
          [patientId, tenantId, `%${condition.replace('_', ' ')}%`]
        );

        if (conditionResult.rowCount) {
          data.exclusionType = condition;
          return {
            excluded: true,
            reason: `Patient has active ${condition.replace('_', ' ')}`,
            data,
          };
        }
      }
    }

    return { excluded: false, data };
  }

  private async checkNumeratorCriteria(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    encounterId: string,
    criteria: Record<string, unknown>
  ): Promise<{ met: boolean; data: Record<string, unknown> }> {
    const data: Record<string, unknown> = {};

    // Check documentation requirements
    if (criteria.documentation_required && Array.isArray(criteria.documentation_required)) {
      const notesResult = await client.query(
        `SELECT content FROM notes WHERE encounter_id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (notesResult.rowCount) {
        data.hasNotes = true;
        data.noteContent = notesResult.rows[0].content?.substring(0, 500);
      }
    }

    // Check procedure codes
    if (criteria.procedure_codes && Array.isArray(criteria.procedure_codes) && criteria.procedure_codes.length > 0) {
      const procCodes = criteria.procedure_codes as string[];
      const codeConditions = procCodes.map((code) => {
        if (code.includes('-')) {
          const [start, end] = code.split('-');
          return `(c.cpt_code >= '${start}' AND c.cpt_code <= '${end}')`;
        }
        return `c.cpt_code = '${code}'`;
      }).join(' OR ');

      const procResult = await client.query(
        `SELECT c.cpt_code, c.description
         FROM charges c
         WHERE c.encounter_id = $1 AND c.tenant_id = $2
           AND (${codeConditions})
         LIMIT 5`,
        [encounterId, tenantId]
      );

      if (procResult.rowCount) {
        data.procedures = procResult.rows;
        return { met: true, data };
      }
    }

    // Default: check if there's documented encounter content
    if (encounterId) {
      const encounterResult = await client.query(
        `SELECT notes FROM encounters WHERE id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (encounterResult.rowCount && encounterResult.rows[0].notes) {
        data.hasEncounterNotes = true;
        return { met: true, data };
      }
    }

    return { met: false, data };
  }

  private async recordMeasureStatusInternal(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId: string | undefined,
    providerId: string | undefined,
    status: string,
    documentation?: string,
    exclusionReason?: string,
    documentationData?: Record<string, unknown>
  ): Promise<PatientMeasureStatus> {
    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO patient_measure_status (
        id, tenant_id, patient_id, measure_id, encounter_id, provider_id,
        status, status_date, documentation, documentation_data,
        exclusion_reason, performance_met
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, patient_id, measure_id, encounter_id)
      WHERE encounter_id IS NOT NULL
      DO UPDATE SET
        status = $7,
        status_date = CURRENT_DATE,
        documentation = COALESCE($8, patient_measure_status.documentation),
        documentation_data = COALESCE($9, patient_measure_status.documentation_data),
        exclusion_reason = $10,
        performance_met = $11,
        updated_at = NOW()`,
      [
        id,
        tenantId,
        patientId,
        measureId,
        encounterId || null,
        providerId || null,
        status,
        documentation || null,
        JSON.stringify(documentationData || {}),
        exclusionReason || null,
        status === 'met',
      ]
    );

    return {
      id,
      patientId,
      measureId,
      encounterId,
      status: status as PatientMeasureStatus['status'],
      statusDate: new Date().toISOString().split('T')[0] as string,
      documentation,
      documentationData: documentationData || {},
      exclusionReason,
      performanceMet: status === 'met',
    };
  }

  private async generateEncounterChecklist(
    client: PoolClient,
    tenantId: string,
    encounterId: string,
    patientId: string,
    providerId: string,
    statuses: PatientMeasureStatus[]
  ): Promise<void> {
    for (const status of statuses) {
      // Get measure details
      const measureResult = await client.query(
        `SELECT id, measure_id, measure_name, numerator_criteria FROM quality_measures WHERE measure_id = $1`,
        [status.measureId]
      );

      if (!measureResult.rowCount) continue;

      const measure = measureResult.rows[0];
      const numCriteria = measure.numerator_criteria || {};
      const requiredActions = (numCriteria.documentation_required || []) as string[];

      await client.query(
        `INSERT INTO encounter_measure_checklist (
          id, tenant_id, encounter_id, patient_id, provider_id, measure_id,
          measure_code, measure_name, is_applicable, is_completed,
          completion_status, required_actions, completed_actions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '[]')
        ON CONFLICT (tenant_id, encounter_id, measure_id)
        DO UPDATE SET
          is_completed = $10,
          completion_status = $11,
          updated_at = NOW()`,
        [
          crypto.randomUUID(),
          tenantId,
          encounterId,
          patientId,
          providerId,
          measure.id,
          measure.measure_id,
          measure.measure_name,
          status.status !== 'pending',
          status.status === 'met' || status.status === 'excluded',
          status.status,
          JSON.stringify(requiredActions),
        ]
      );
    }
  }

  private async resolvePatientMeasureAlerts(
    client: PoolClient,
    tenantId: string,
    patientId: string,
    measureId: string,
    encounterId?: string
  ): Promise<void> {
    await client.query(
      `UPDATE measure_alerts
       SET is_resolved = true,
           resolved_at = NOW(),
           resolution_encounter_id = $4,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND patient_id = $2
         AND measure_id = $3
         AND is_resolved = false`,
      [tenantId, patientId, measureId, encounterId || null]
    );
  }

  private async getQualityMeasuresPerformance(
    client: PoolClient,
    tenantId: string,
    providerId: string | undefined,
    periodStart: string,
    periodEnd: string
  ): Promise<MeasurePerformanceResult[]> {
    const result = await client.query(
      `SELECT
        qm.id,
        qm.measure_id,
        qm.measure_name,
        qm.benchmark_data,
        qm.points,
        COUNT(*) FILTER (WHERE pms.status IN ('met', 'not_met', 'eligible')) as denominator_count,
        COUNT(*) FILTER (WHERE pms.status = 'met') as numerator_count,
        COUNT(*) FILTER (WHERE pms.status = 'excluded') as exclusion_count
      FROM quality_measures qm
      LEFT JOIN patient_measure_status pms ON pms.measure_id = qm.id
        AND pms.tenant_id = $1
        AND pms.status_date >= $2::date
        AND pms.status_date <= $3::date
        ${providerId ? 'AND pms.provider_id = $4' : ''}
      WHERE qm.category = 'quality' AND qm.is_active = true
        AND (qm.specialty = 'dermatology' OR qm.specialty = 'all')
      GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.benchmark_data, qm.points
      ORDER BY qm.high_priority DESC, qm.measure_id`,
      providerId
        ? [tenantId, periodStart, periodEnd, providerId]
        : [tenantId, periodStart, periodEnd]
    );

    return result.rows.map((row: any) => {
      const numerator = parseInt(row.numerator_count) || 0;
      const denominator = parseInt(row.denominator_count) || 0;
      const exclusions = parseInt(row.exclusion_count) || 0;
      const adjustedDenominator = denominator - exclusions;
      const performanceRate = adjustedDenominator > 0 ? (numerator / adjustedDenominator) * 100 : 0;
      const benchmark = row.benchmark_data?.national_average || 75;
      const topDecile = row.benchmark_data?.top_decile || 95;
      const decileScore = this.calculateDecileScore(performanceRate, benchmark, topDecile);

      return {
        measureId: row.id,
        measureCode: row.measure_id,
        measureName: row.measure_name,
        numeratorCount: numerator,
        denominatorCount: adjustedDenominator,
        exclusionCount: exclusions,
        performanceRate: Math.round(performanceRate * 100) / 100,
        benchmark,
        gap: Math.round((benchmark - performanceRate) * 100) / 100,
        metThreshold: performanceRate >= 60,
        decileScore,
        pointsEarned: Math.round((decileScore / 10) * (row.points || 10) * 100) / 100,
      };
    });
  }

  private async getPIMeasures(
    client: PoolClient,
    tenantId: string,
    periodStart: string
  ): Promise<PITracking[]> {
    const result = await client.query(
      `SELECT * FROM promoting_interoperability_tracking
       WHERE tenant_id = $1 AND tracking_period_start = $2
       ORDER BY is_required DESC, measure_name`,
      [tenantId, periodStart]
    );

    return result.rows.map((row: any) => ({
      measureName: row.measure_name,
      numerator: row.numerator || 0,
      denominator: row.denominator || 0,
      performanceRate: parseFloat(row.performance_rate) || 0,
      isRequired: row.is_required || false,
      threshold: row.threshold || 1,
      metThreshold: (parseFloat(row.performance_rate) || 0) >= (row.threshold || 1),
      attestationStatus: row.attestation_status,
    }));
  }

  private async getIAActivities(
    client: PoolClient,
    tenantId: string,
    periodStart: string
  ): Promise<IAActivity[]> {
    const result = await client.query(
      `SELECT * FROM ia_activities
       WHERE tenant_id = $1
         AND start_date >= $2
         AND is_attested = true
       ORDER BY weight DESC, activity_id`,
      [tenantId, periodStart]
    );

    return result.rows.map((row: any) => ({
      activityId: row.activity_id,
      activityName: row.activity_name,
      weight: row.weight,
      points: row.points,
      isAttested: row.is_attested,
      attestationDate: row.attestation_date,
      startDate: row.start_date,
      endDate: row.end_date,
    }));
  }

  private calculateDecileScore(performanceRate: number, benchmark: number, topDecile: number): number {
    if (performanceRate >= topDecile) return 10;
    if (performanceRate >= benchmark) {
      // Linear interpolation between benchmark (5) and top decile (10)
      return 5 + ((performanceRate - benchmark) / (topDecile - benchmark)) * 5;
    }
    // Below benchmark
    return Math.max(1, (performanceRate / benchmark) * 5);
  }

  private calculateQualityScore(measures: MeasurePerformanceResult[]): number {
    if (measures.length === 0) return 0;
    const totalPoints = measures.reduce((sum, m) => sum + m.pointsEarned, 0);
    const maxPoints = measures.reduce((sum, m) => sum + 10, 0);
    return maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;
  }

  private calculatePIScore(piMeasures: PITracking[]): number {
    if (piMeasures.length === 0) return 0;
    const required = piMeasures.filter((m) => m.isRequired);
    if (required.length === 0) return 100;

    const allRequiredMet = required.every((m) => m.metThreshold);
    if (!allRequiredMet) return 0;

    const avgPerformance = piMeasures.reduce((sum, m) => sum + m.performanceRate, 0) / piMeasures.length;
    return Math.min(100, avgPerformance);
  }

  private calculateIAScore(activities: IAActivity[]): number {
    const totalPoints = activities.reduce((sum, a) => sum + a.points, 0);
    return Math.min(100, (totalPoints / 40) * 100);
  }

  private calculatePaymentAdjustment(finalScore: number): number {
    if (finalScore < 11.25) return -9;
    if (finalScore < 30) return -7;
    if (finalScore < 45) return -5;
    if (finalScore < 60) return -3;
    if (finalScore < 75) return 0;
    if (finalScore < 85) return 1;
    if (finalScore < 95) return 3;
    return 5;
  }

  private generateRecommendations(
    measures: MeasurePerformanceResult[],
    qualityScore: number,
    piScore: number,
    iaScore: number,
    careGapCount: number
  ): string[] {
    const recommendations: string[] = [];

    // Quality recommendations
    const lowPerforming = measures.filter((m) => m.performanceRate < m.benchmark);
    if (lowPerforming.length > 0) {
      recommendations.push(
        `Focus on ${lowPerforming.length} measures performing below benchmark: ${lowPerforming
          .slice(0, 3)
          .map((m) => m.measureCode)
          .join(', ')}`
      );
    }

    if (careGapCount > 0) {
      recommendations.push(
        `Address ${careGapCount} open care gaps through patient outreach and follow-up visits`
      );
    }

    if (piScore < 100) {
      recommendations.push(
        'Ensure all Promoting Interoperability measures are met, especially e-Prescribing and patient portal access'
      );
    }

    if (iaScore < 100) {
      recommendations.push(
        'Consider attesting to additional Improvement Activities (40 points needed for full credit)'
      );
    }

    if (qualityScore < 75) {
      recommendations.push(
        'Overall quality score is below performance threshold - prioritize high-priority measures and documentation'
      );
    }

    // Dermatology-specific
    const melanomaRecall = measures.find((m) => m.measureCode === 'MIPS137');
    if (melanomaRecall && melanomaRecall.performanceRate < 80) {
      recommendations.push(
        'Improve melanoma recall system enrollment for all melanoma patients'
      );
    }

    const biopsyFollowup = measures.find((m) => m.measureCode === 'DERM-BIOPSY-FU');
    if (biopsyFollowup && biopsyFollowup.performanceRate < 90) {
      recommendations.push(
        'Ensure timely communication of biopsy results to patients within 14 days'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Performance is on track. Continue current quality improvement efforts.'
      );
    }

    return recommendations;
  }
}

export const mipsService = new MIPSService();
