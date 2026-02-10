import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { auditLog } from '../services/audit';
import { mipsService } from '../services/mipsService';
import { logger } from '../lib/logger';

export const mipsRouter = Router();

mipsRouter.use(rateLimit({ windowMs: 60_000, max: 100 }));

// ============================================================================
// QUALITY MEASURES
// ============================================================================

/**
 * GET /api/mips/measures - List available MIPS quality measures
 */
mipsRouter.get('/measures', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { category, specialty, active, dermatology } = req.query;

    let query = `
      SELECT id, measure_id, measure_name, description, category, specialty,
             numerator_criteria, denominator_criteria, exclusion_criteria,
             benchmark_data, weight, high_priority, is_active, points, cms_measure_id
      FROM quality_measures WHERE 1=1
    `;
    const params: unknown[] = [];

    if (dermatology === 'true') {
      query += ` AND (specialty = 'dermatology' OR specialty = 'all')`;
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (specialty && dermatology !== 'true') {
      params.push(specialty);
      query += ` AND specialty = $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ' ORDER BY high_priority DESC, category, measure_id';

    const result = await pool.query(query, params);

    res.json({
      measures: result.rows.map((row) => ({
        id: row.id,
        measureId: row.measure_id,
        measureName: row.measure_name,
        description: row.description,
        category: row.category,
        specialty: row.specialty,
        numeratorCriteria: row.numerator_criteria,
        denominatorCriteria: row.denominator_criteria,
        exclusionCriteria: row.exclusion_criteria,
        benchmarkData: row.benchmark_data,
        points: row.points,
        highPriority: row.high_priority,
        isActive: row.is_active,
        cmsMeasureId: row.cms_measure_id,
      })),
      count: result.rowCount,
    });
  } catch (err) {
    logger.error('Error fetching MIPS measures:', err);
    res.status(500).json({ error: 'Failed to fetch MIPS measures' });
  }
});

/**
 * GET /api/mips/measures/:id - Get measure details
 */
mipsRouter.get('/measures/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id);

    const result = await pool.query(
      `SELECT * FROM quality_measures WHERE id = $1 OR measure_id = $1`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Measure not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      measureId: row.measure_id,
      measureName: row.measure_name,
      description: row.description,
      category: row.category,
      specialty: row.specialty,
      numeratorCriteria: row.numerator_criteria,
      denominatorCriteria: row.denominator_criteria,
      exclusionCriteria: row.exclusion_criteria,
      benchmarkData: row.benchmark_data,
      points: row.points,
      highPriority: row.high_priority,
      isActive: row.is_active,
      cmsMeasureId: row.cms_measure_id,
    });
  } catch (err) {
    logger.error('Error fetching measure details:', err);
    res.status(500).json({ error: 'Failed to fetch measure details' });
  }
});

// ============================================================================
// PATIENT MEASURE STATUS
// ============================================================================

/**
 * GET /api/mips/patient/:patientId/status - Get patient's measure status
 */
mipsRouter.get('/patient/:patientId/status', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const { year } = req.query;

    const statuses = await mipsService.getPatientMeasureHistory(
      tenantId,
      patientId,
      year ? parseInt(year as string) : undefined
    );

    // Get care gap alerts
    const alerts = await mipsService.getPatientMeasureAlerts(tenantId, patientId);

    res.json({
      statuses,
      alerts,
      year: year ? parseInt(year as string) : new Date().getFullYear(),
    });
  } catch (err) {
    logger.error('Error fetching patient measure status:', err);
    res.status(500).json({ error: 'Failed to fetch patient measure status' });
  }
});

/**
 * POST /api/mips/patient/:patientId/measure - Record measure status for patient
 */
const recordMeasureSchema = z.object({
  measureId: z.string().min(1),
  encounterId: z.string().optional(),
  status: z.enum(['eligible', 'met', 'not_met', 'excluded', 'pending']),
  documentation: z.string().optional(),
  exclusionReason: z.string().optional(),
  documentationData: z.record(z.string(), z.unknown()).optional(),
});

mipsRouter.post('/patient/:patientId/measure', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = recordMeasureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const { measureId, encounterId, status, documentation, exclusionReason, documentationData } = parsed.data;

    const result = await mipsService.recordMeasureStatus(
      tenantId,
      patientId,
      measureId,
      encounterId,
      status,
      documentation,
      exclusionReason,
      documentationData
    );

    await auditLog(tenantId, req.user!.id, 'mips_measure_recorded', 'patient_measure_status', patientId);

    res.json({
      success: true,
      status: result,
    });
  } catch (err) {
    logger.error('Error recording patient measure:', err);
    res.status(500).json({ error: 'Failed to record patient measure' });
  }
});

// ============================================================================
// PROVIDER DASHBOARD
// ============================================================================

/**
 * GET /api/mips/provider/:providerId/dashboard - Provider MIPS dashboard
 */
mipsRouter.get('/provider/:providerId/dashboard', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.params.providerId === 'me' ? req.user!.id : String(req.params.providerId);
    const { year } = req.query;

    const reportingYear = year ? parseInt(year as string) : new Date().getFullYear();
    const periodStart = `${reportingYear}-01-01`;
    const periodEnd = `${reportingYear}-12-31`;

    // Get estimated score
    const estimate = await mipsService.estimateMIPSScore(tenantId, providerId, reportingYear);

    // Get quality measures performance
    const measuresResult = await pool.query(
      `SELECT
        qm.measure_id,
        qm.measure_name,
        qm.high_priority,
        qm.benchmark_data,
        COUNT(*) FILTER (WHERE pms.status IN ('met', 'not_met')) as denominator_count,
        COUNT(*) FILTER (WHERE pms.status = 'met') as numerator_count,
        COUNT(*) FILTER (WHERE pms.status = 'excluded') as exclusion_count
      FROM quality_measures qm
      LEFT JOIN patient_measure_status pms ON pms.measure_id = qm.id
        AND pms.tenant_id = $1
        AND pms.provider_id = $2
        AND pms.status_date >= $3::date
        AND pms.status_date <= $4::date
      WHERE qm.category = 'quality' AND qm.is_active = true
        AND (qm.specialty = 'dermatology' OR qm.specialty = 'all')
      GROUP BY qm.id, qm.measure_id, qm.measure_name, qm.high_priority, qm.benchmark_data
      ORDER BY qm.high_priority DESC, qm.measure_id`,
      [tenantId, providerId, periodStart, periodEnd]
    );

    const measures = measuresResult.rows.map((row) => {
      const numerator = parseInt(row.numerator_count) || 0;
      const denominator = parseInt(row.denominator_count) || 0;
      const exclusions = parseInt(row.exclusion_count) || 0;
      const adjustedDenom = denominator - exclusions;
      const rate = adjustedDenom > 0 ? (numerator / adjustedDenom) * 100 : 0;
      const benchmark = row.benchmark_data?.national_average || 75;

      return {
        measureId: row.measure_id,
        measureName: row.measure_name,
        highPriority: row.high_priority,
        numerator,
        denominator: adjustedDenom,
        exclusions,
        performanceRate: Math.round(rate * 100) / 100,
        benchmark,
        gap: Math.round((benchmark - rate) * 100) / 100,
        status: rate >= benchmark ? 'above' : rate >= 60 ? 'meeting' : 'below',
      };
    });

    // Get care gaps count
    const gapsResult = await pool.query(
      `SELECT COUNT(*) as count FROM quality_gaps
       WHERE tenant_id = $1 AND provider_id = $2 AND status = 'open'`,
      [tenantId, providerId]
    );

    // Get patient count
    const patientCountResult = await pool.query(
      `SELECT COUNT(DISTINCT patient_id) as count
       FROM patient_measure_status
       WHERE tenant_id = $1 AND provider_id = $2
         AND status_date >= $3::date AND status_date <= $4::date`,
      [tenantId, providerId, periodStart, periodEnd]
    );

    await auditLog(tenantId, req.user!.id, 'mips_dashboard_viewed', 'mips_dashboard', providerId);

    res.json({
      providerId,
      year: reportingYear,
      scores: {
        quality: estimate.quality,
        pi: estimate.pi,
        ia: estimate.ia,
        cost: estimate.cost,
        final: estimate.estimated,
        paymentAdjustment: estimate.paymentAdjustment,
        trajectory: estimate.trajectory,
      },
      measures,
      careGapCount: parseInt(gapsResult.rows[0]?.count) || 0,
      patientCount: parseInt(patientCountResult.rows[0]?.count) || 0,
    });
  } catch (err) {
    logger.error('Error fetching provider dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch provider dashboard' });
  }
});

/**
 * GET /api/mips/provider/:providerId/report - Generate MIPS report for provider
 */
mipsRouter.get('/provider/:providerId/report', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.params.providerId === 'me' ? req.user!.id : String(req.params.providerId);
    const { year } = req.query;

    const reportingYear = year ? parseInt(year as string) : new Date().getFullYear();

    const report = await mipsService.generateMIPSReport(tenantId, providerId, reportingYear);

    await auditLog(tenantId, req.user!.id, 'mips_report_generated', 'mips_report', report.reportId);

    res.json(report);
  } catch (err) {
    logger.error('Error generating MIPS report:', err);
    res.status(500).json({ error: 'Failed to generate MIPS report' });
  }
});

// ============================================================================
// IMPROVEMENT ACTIVITIES
// ============================================================================

/**
 * GET /api/mips/ia - Get improvement activities
 */
mipsRouter.get('/ia', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year } = req.query;

    const result = await mipsService.getImprovementActivities(
      tenantId,
      year ? parseInt(year as string) : undefined
    );

    res.json(result);
  } catch (err) {
    logger.error('Error fetching improvement activities:', err);
    res.status(500).json({ error: 'Failed to fetch improvement activities' });
  }
});

/**
 * POST /api/mips/ia/attest - Attest to an improvement activity
 */
const attestSchema = z.object({
  activityId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  documentation: z.record(z.string(), z.unknown()).optional(),
});

mipsRouter.post('/ia/attest', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const parsed = attestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { activityId, startDate, endDate, documentation } = parsed.data;

    const result = await mipsService.attestIAActivity(
      tenantId,
      activityId,
      userId,
      startDate,
      endDate,
      documentation
    );

    await auditLog(tenantId, userId, 'ia_activity_attested', 'ia_activities', activityId);

    res.json({
      success: true,
      activity: result,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to attest improvement activity';
    logger.error('Error attesting IA activity:', err);
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * DELETE /api/mips/ia/:activityId - Revoke IA attestation
 */
mipsRouter.delete('/ia/:activityId', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const activityId = String(req.params.activityId);

    await pool.query(
      `UPDATE ia_activities
       SET is_attested = false,
           attestation_status = 'revoked',
           updated_at = NOW()
       WHERE tenant_id = $1 AND activity_id = $2`,
      [tenantId, activityId]
    );

    await auditLog(tenantId, req.user!.id, 'ia_activity_revoked', 'ia_activities', activityId);

    res.json({ success: true });
  } catch (err) {
    logger.error('Error revoking IA attestation:', err);
    res.status(500).json({ error: 'Failed to revoke IA attestation' });
  }
});

// ============================================================================
// ENCOUNTER INTEGRATION
// ============================================================================

/**
 * POST /api/mips/encounter/:encounterId/evaluate - Evaluate measures for encounter
 */
mipsRouter.post('/encounter/:encounterId/evaluate', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const encounterId = String(req.params.encounterId);
    const { patientId, providerId } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    const results = await mipsService.evaluatePatientMeasures(
      tenantId,
      encounterId,
      patientId,
      providerId || req.user!.id
    );

    // Get checklist
    const checklist = await mipsService.getEncounterMeasureChecklist(tenantId, encounterId);

    // Get alerts
    const alerts = await mipsService.getPatientMeasureAlerts(tenantId, patientId);

    await auditLog(tenantId, req.user!.id, 'encounter_measures_evaluated', 'encounter_measure_checklist', encounterId);

    res.json({
      success: true,
      evaluated: results.length,
      results,
      checklist,
      alerts,
    });
  } catch (err) {
    logger.error('Error evaluating encounter measures:', err);
    res.status(500).json({ error: 'Failed to evaluate encounter measures' });
  }
});

/**
 * GET /api/mips/encounter/:encounterId/checklist - Get encounter measure checklist
 */
mipsRouter.get('/encounter/:encounterId/checklist', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const encounterId = String(req.params.encounterId);

    const checklist = await mipsService.getEncounterMeasureChecklist(tenantId, encounterId);

    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    res.json(checklist);
  } catch (err) {
    logger.error('Error fetching encounter checklist:', err);
    res.status(500).json({ error: 'Failed to fetch encounter checklist' });
  }
});

/**
 * PUT /api/mips/encounter/:encounterId/checklist/:measureId - Update checklist item
 */
const updateChecklistSchema = z.object({
  status: z.enum(['pending', 'met', 'not_met', 'excluded', 'not_applicable']),
  completedActions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

mipsRouter.put('/encounter/:encounterId/checklist/:measureId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const encounterId = String(req.params.encounterId);
    const measureId = String(req.params.measureId);
    const { status, completedActions, notes } = parsed.data;

    await mipsService.updateEncounterChecklistItem(
      tenantId,
      encounterId,
      measureId,
      status,
      completedActions,
      notes
    );

    res.json({ success: true });
  } catch (err) {
    logger.error('Error updating checklist item:', err);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// ============================================================================
// ALERTS
// ============================================================================

/**
 * GET /api/mips/alerts - Get measure alerts
 */
mipsRouter.get('/alerts', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, providerId, type, priority } = req.query;

    let query = `
      SELECT
        ma.*,
        p.first_name || ' ' || p.last_name as patient_name,
        qm.measure_id as measure_code,
        qm.measure_name
      FROM measure_alerts ma
      JOIN patients p ON p.id = ma.patient_id
      JOIN quality_measures qm ON qm.id = ma.measure_id
      WHERE ma.tenant_id = $1
        AND ma.is_dismissed = false
        AND ma.is_resolved = false
    `;
    const params: unknown[] = [tenantId];

    if (patientId) {
      params.push(patientId);
      query += ` AND ma.patient_id = $${params.length}`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` AND ma.provider_id = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND ma.alert_type = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      query += ` AND ma.alert_priority = $${params.length}`;
    }

    query += `
      ORDER BY
        CASE ma.alert_priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        ma.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query, params);

    res.json({
      alerts: result.rows.map((row) => ({
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
        createdAt: row.created_at,
      })),
      count: result.rowCount,
    });
  } catch (err) {
    logger.error('Error fetching measure alerts:', err);
    res.status(500).json({ error: 'Failed to fetch measure alerts' });
  }
});

/**
 * POST /api/mips/alerts/:alertId/dismiss - Dismiss an alert
 */
mipsRouter.post('/alerts/:alertId/dismiss', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const alertId = String(req.params.alertId);
    const { reason } = req.body;

    await mipsService.dismissMeasureAlert(tenantId, alertId, req.user!.id, reason);

    res.json({ success: true });
  } catch (err) {
    logger.error('Error dismissing alert:', err);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

// ============================================================================
// SUBMISSIONS
// ============================================================================

/**
 * POST /api/mips/submit - Submit MIPS data
 */
const submitSchema = z.object({
  year: z.number().min(2020).max(2099),
  quarter: z.number().min(1).max(4).optional(),
  providerId: z.string().optional(),
  submissionType: z.enum(['quality', 'pi', 'ia', 'cost', 'final', 'interim']).optional(),
});

mipsRouter.post('/submit', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { year, quarter, providerId, submissionType } = parsed.data;

    // Generate report
    const report = await mipsService.generateMIPSReport(tenantId, providerId, year);

    // Create submission record
    const confirmationNumber = `MIPS-${year}${quarter ? `-Q${quarter}` : ''}-${report.reportId.substring(0, 8).toUpperCase()}`;

    await pool.query(
      `INSERT INTO mips_submissions (
        id, tenant_id, provider_id, submission_year, submission_quarter,
        submission_type, status, quality_score, pi_score, ia_score, cost_score,
        final_score, submission_data, submitted_at, submitted_by, confirmation_number
      ) VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7, $8, $9, $10, $11, $12, NOW(), $13, $14)`,
      [
        report.reportId,
        tenantId,
        providerId || null,
        year,
        quarter || null,
        submissionType || 'final',
        report.qualityScore,
        report.piScore,
        report.iaScore,
        report.costScore,
        report.finalScore,
        JSON.stringify({
          measures: report.qualityMeasures,
          recommendations: report.recommendations,
          careGapCount: report.careGapCount,
        }),
        userId,
        confirmationNumber,
      ]
    );

    await auditLog(tenantId, userId, 'mips_data_submitted', 'mips_submissions', report.reportId);

    res.json({
      success: true,
      submissionId: report.reportId,
      confirmationNumber,
      scores: {
        quality: report.qualityScore,
        pi: report.piScore,
        ia: report.iaScore,
        cost: report.costScore,
        final: report.finalScore,
        paymentAdjustment: report.paymentAdjustment,
      },
    });
  } catch (err) {
    logger.error('Error submitting MIPS data:', err);
    res.status(500).json({ error: 'Failed to submit MIPS data' });
  }
});

/**
 * GET /api/mips/submissions - Get submission history
 */
mipsRouter.get('/submissions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId, status } = req.query;

    let query = `
      SELECT ms.*, u.full_name as submitted_by_name
      FROM mips_submissions ms
      LEFT JOIN users u ON u.id = ms.submitted_by
      WHERE ms.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];

    if (year) {
      params.push(parseInt(year as string));
      query += ` AND ms.submission_year = $${params.length}`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` AND ms.provider_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND ms.status = $${params.length}`;
    }

    query += ' ORDER BY ms.submitted_at DESC';

    const result = await pool.query(query, params);

    res.json({
      submissions: result.rows.map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        year: row.submission_year,
        quarter: row.submission_quarter,
        type: row.submission_type,
        status: row.status,
        confirmationNumber: row.confirmation_number,
        qualityScore: row.quality_score,
        piScore: row.pi_score,
        iaScore: row.ia_score,
        costScore: row.cost_score,
        finalScore: row.final_score,
        submittedAt: row.submitted_at,
        submittedByName: row.submitted_by_name,
      })),
    });
  } catch (err) {
    logger.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ============================================================================
// SCORE HISTORY
// ============================================================================

/**
 * GET /api/mips/score-history - Get MIPS score history
 */
mipsRouter.get('/score-history', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId } = req.query;

    const result = await pool.query(
      `SELECT * FROM mips_score_history
       WHERE tenant_id = $1
         AND reporting_year = $2
         ${providerId ? 'AND provider_id = $3' : 'AND provider_id IS NULL'}
       ORDER BY calculation_date DESC
       LIMIT 50`,
      providerId
        ? [tenantId, year || new Date().getFullYear(), providerId]
        : [tenantId, year || new Date().getFullYear()]
    );

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        calculationDate: row.calculation_date,
        year: row.reporting_year,
        qualityScore: row.quality_score,
        piScore: row.pi_score,
        iaScore: row.ia_score,
        costScore: row.cost_score,
        finalScore: row.final_score,
        paymentAdjustment: row.estimated_payment_adjustment,
      })),
    });
  } catch (err) {
    logger.error('Error fetching score history:', err);
    res.status(500).json({ error: 'Failed to fetch score history' });
  }
});
