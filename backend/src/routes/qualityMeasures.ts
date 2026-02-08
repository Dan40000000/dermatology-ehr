import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { rateLimit } from "../middleware/rateLimit";
import { randomUUID } from "crypto";
import { auditLog } from "../services/audit";
import {
  qualityMeasuresService,
  DERM_MEASURES,
  PI_MEASURES,
} from "../services/qualityMeasuresService";
import { logger } from "../lib/logger";

export const qualityMeasuresRouter = Router();

qualityMeasuresRouter.use(rateLimit({ windowMs: 60_000, max: 100 }));

// ============================================================================
// QUALITY MEASURES
// ============================================================================

/**
 * GET /api/quality/measures - List available quality measures
 */
qualityMeasuresRouter.get("/measures", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { category, specialty, active, dermatology } = req.query;

    // If dermatology flag is set, use service method
    if (dermatology === 'true') {
      const measures = await qualityMeasuresService.getDermatologyMeasures(req.user!.tenantId);
      return res.json({ measures, count: measures.length });
    }

    let query = "SELECT * FROM quality_measures WHERE 1=1";
    const params: any[] = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (specialty) {
      params.push(specialty);
      query += ` AND specialty = $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += " ORDER BY high_priority DESC, category, measure_id";

    const result = await pool.query(query, params);
    res.json({ measures: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error("Error fetching quality measures:", err);
    res.status(500).json({ error: "Failed to fetch quality measures" });
  }
});

/**
 * GET /api/quality/measures/:id - Get measure details
 */
qualityMeasuresRouter.get("/measures/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id);

    const result = await pool.query(
      `SELECT * FROM quality_measures WHERE id = $1 OR measure_id = $1`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Measure not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error("Error fetching measure details:", err);
    res.status(500).json({ error: "Failed to fetch measure details" });
  }
});

// ============================================================================
// PATIENT MEASURE TRACKING
// ============================================================================

/**
 * POST /api/quality/tracking - Track patient measure performance
 */
const trackingSchema = z.object({
  patientId: z.string().min(1),
  measureId: z.string().min(1),
  encounterId: z.string().optional(),
  providerId: z.string().optional(),
});

qualityMeasuresRouter.post("/tracking", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = trackingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { patientId, measureId, encounterId, providerId } = parsed.data;

    // Evaluate patient for measure
    const result = await qualityMeasuresService.evaluatePatientForMeasure(
      tenantId,
      patientId,
      measureId,
      encounterId,
      providerId || req.user!.id
    );

    // Track the result if we have an encounter
    if (encounterId) {
      await qualityMeasuresService.trackMeasurePerformance(
        tenantId,
        patientId,
        measureId,
        encounterId,
        providerId || req.user!.id,
        result
      );
    }

    await auditLog(tenantId, req.user!.id, "quality_measure_tracked", "patient_measure_tracking", patientId);

    res.json({
      success: true,
      result,
      message: result.numeratorMet ? "Performance met" : "Performance not met",
    });
  } catch (err) {
    logger.error("Error tracking patient measure:", err);
    res.status(500).json({ error: "Failed to track patient measure" });
  }
});

/**
 * GET /api/quality/tracking/:patientId - Get patient's measure tracking
 */
qualityMeasuresRouter.get("/tracking/:patientId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const { year } = req.query;

    const trackingYear = year ? parseInt(year as string) : new Date().getFullYear();
    const periodStart = `${trackingYear}-01-01`;
    const periodEnd = `${trackingYear}-12-31`;

    const result = await pool.query(
      `SELECT
        pmt.*,
        qm.measure_id as measure_code,
        qm.measure_name,
        qm.category,
        qm.high_priority
      FROM patient_measure_tracking pmt
      JOIN quality_measures qm ON qm.id = pmt.measure_id
      WHERE pmt.tenant_id = $1
        AND pmt.patient_id = $2
        AND pmt.tracking_period_start >= $3
        AND pmt.tracking_period_end <= $4
      ORDER BY qm.high_priority DESC, qm.measure_id`,
      [tenantId, patientId, periodStart, periodEnd]
    );

    // Also get care gaps
    const gaps = await qualityMeasuresService.getPatientCareGaps(tenantId, patientId);

    res.json({
      tracking: result.rows,
      careGaps: gaps,
      year: trackingYear,
    });
  } catch (err) {
    logger.error("Error fetching patient tracking:", err);
    res.status(500).json({ error: "Failed to fetch patient tracking" });
  }
});

// ============================================================================
// PERFORMANCE & DASHBOARD
// ============================================================================

/**
 * GET /api/quality/performance - Get measure performance rates
 */
qualityMeasuresRouter.get("/performance", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, measureId, startDate, endDate, year, quarter } = req.query;

    // Determine reporting period
    let periodStart: string;
    let periodEnd: string;

    if (year && quarter) {
      const y = parseInt(year as string);
      const q = parseInt(quarter as string);
      const qStartMonth = (q - 1) * 3;
      periodStart = `${y}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
      const nextQ = q === 4 ? 1 : q + 1;
      const nextY = q === 4 ? y + 1 : y;
      const nextQStartMonth = (nextQ - 1) * 3;
      periodEnd = `${nextY}-${String(nextQStartMonth + 1).padStart(2, '0')}-01`;
    } else if (startDate && endDate) {
      periodStart = startDate as string;
      periodEnd = endDate as string;
    } else {
      const currentYear = new Date().getFullYear();
      periodStart = `${currentYear}-01-01`;
      periodEnd = `${currentYear}-12-31`;
    }

    // If specific measure requested, use service
    if (measureId) {
      const performance = await qualityMeasuresService.calculateMeasureRate(
        tenantId,
        measureId as string,
        providerId as string | undefined,
        periodStart,
        periodEnd
      );
      return res.json({ performance: [performance], periodStart, periodEnd });
    }

    // Get all measure performance
    let query = `
      SELECT
        mp.*,
        qm.measure_id as measure_code,
        qm.measure_name,
        qm.category,
        qm.description,
        qm.benchmark_data,
        u.full_name as provider_name
      FROM measure_performance mp
      JOIN quality_measures qm ON mp.measure_id = qm.id
      LEFT JOIN users u ON mp.provider_id = u.id
      WHERE mp.tenant_id = $1
        AND mp.reporting_period_start >= $2
        AND mp.reporting_period_end <= $3
    `;

    const params: any[] = [tenantId, periodStart, periodEnd];

    if (providerId) {
      params.push(providerId);
      query += ` AND mp.provider_id = $${params.length}`;
    }

    query += " ORDER BY qm.category, qm.measure_id";

    const result = await pool.query(query, params);

    // If no cached data, calculate on the fly
    if (result.rows.length === 0) {
      const measures = await pool.query(
        "SELECT * FROM quality_measures WHERE is_active = true AND category = 'quality'"
      );

      const calculatedPerformance = [];
      for (const measure of measures.rows) {
        try {
          const perf = await qualityMeasuresService.calculateMeasureRate(
            tenantId,
            measure.measure_id,
            providerId as string | undefined,
            periodStart,
            periodEnd
          );
          calculatedPerformance.push(perf);
        } catch (e) {
          // Skip measures that fail calculation
        }
      }

      return res.json({
        performance: calculatedPerformance,
        periodStart,
        periodEnd,
        calculated: true,
      });
    }

    res.json({
      performance: result.rows,
      periodStart,
      periodEnd,
    });
  } catch (err) {
    logger.error("Error calculating performance:", err);
    res.status(500).json({ error: "Failed to calculate performance" });
  }
});

/**
 * GET /api/quality/dashboard - MIPS Dashboard with scores and recommendations
 */
qualityMeasuresRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId } = req.query;

    const dashboard = await qualityMeasuresService.getMIPSDashboard(
      tenantId,
      year ? parseInt(year as string) : undefined,
      providerId as string | undefined
    );

    await auditLog(tenantId, req.user!.id, "mips_dashboard_viewed", "mips_dashboard", "dashboard");

    res.json(dashboard);
  } catch (err) {
    logger.error("Error fetching MIPS dashboard:", err);
    res.status(500).json({ error: "Failed to fetch MIPS dashboard" });
  }
});

// ============================================================================
// PROMOTING INTEROPERABILITY (PI)
// ============================================================================

/**
 * POST /api/quality/pi/track - Track PI measure
 */
const piTrackingSchema = z.object({
  measureName: z.string().min(1),
  incrementNumerator: z.boolean().optional().default(false),
  incrementDenominator: z.boolean().optional().default(false),
  attestation: z.boolean().optional(),
});

qualityMeasuresRouter.post("/pi/track", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = piTrackingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { measureName, incrementNumerator, incrementDenominator } = parsed.data;

    const result = await qualityMeasuresService.trackPromotingInteroperability(
      tenantId,
      measureName,
      incrementNumerator,
      incrementDenominator,
      req.user!.id
    );

    await auditLog(tenantId, req.user!.id, "pi_measure_tracked", "promoting_interoperability", measureName);

    res.json({
      success: true,
      tracking: result,
    });
  } catch (err) {
    logger.error("Error tracking PI measure:", err);
    res.status(500).json({ error: "Failed to track PI measure" });
  }
});

/**
 * GET /api/quality/pi - Get PI tracking status
 */
qualityMeasuresRouter.get("/pi", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year } = req.query;

    const trackingYear = year ? parseInt(year as string) : new Date().getFullYear();
    const periodStart = `${trackingYear}-01-01`;

    const result = await pool.query(
      `SELECT * FROM promoting_interoperability_tracking
       WHERE tenant_id = $1 AND tracking_period_start = $2
       ORDER BY is_required DESC, measure_name`,
      [tenantId, periodStart]
    );

    res.json({
      tracking: result.rows,
      year: trackingYear,
      availableMeasures: Object.values(PI_MEASURES),
    });
  } catch (err) {
    logger.error("Error fetching PI tracking:", err);
    res.status(500).json({ error: "Failed to fetch PI tracking" });
  }
});

// ============================================================================
// IMPROVEMENT ACTIVITIES (IA)
// ============================================================================

/**
 * POST /api/quality/ia/attest - Attest improvement activity
 */
const iaAttestSchema = z.object({
  activityId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  documentation: z.record(z.string(), z.any()).optional(),
});

qualityMeasuresRouter.post("/ia/attest", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = iaAttestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { activityId, startDate, endDate, documentation } = parsed.data;

    const result = await qualityMeasuresService.attestImprovementActivity(
      tenantId,
      activityId,
      userId,
      startDate,
      endDate,
      documentation
    );

    await auditLog(tenantId, userId, "ia_attested", "improvement_activity", activityId);

    res.json({
      success: true,
      activity: result,
    });
  } catch (err: any) {
    logger.error("Error attesting improvement activity:", err);
    res.status(500).json({ error: err.message || "Failed to attest improvement activity" });
  }
});

/**
 * GET /api/quality/ia - Get improvement activities
 */
qualityMeasuresRouter.get("/ia", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, status } = req.query;

    const trackingYear = year ? parseInt(year as string) : new Date().getFullYear();
    const periodStart = `${trackingYear}-01-01`;

    let query = `
      SELECT ia.*, qm.description as activity_description
      FROM improvement_activities ia
      LEFT JOIN quality_measures qm ON qm.measure_id = ia.activity_id
      WHERE ia.tenant_id = $1 AND ia.start_date >= $2
    `;

    const params: any[] = [tenantId, periodStart];

    if (status) {
      params.push(status);
      query += ` AND ia.attestation_status = $${params.length}`;
    }

    query += " ORDER BY ia.weight DESC, ia.activity_id";

    const result = await pool.query(query, params);

    // Get available activities from quality_measures
    const availableResult = await pool.query(
      `SELECT measure_id, measure_name, description, weight
       FROM quality_measures
       WHERE category = 'ia' AND is_active = true
       ORDER BY weight DESC, measure_id`
    );

    res.json({
      activities: result.rows,
      year: trackingYear,
      availableActivities: availableResult.rows,
      totalPoints: result.rows.reduce((sum, a) => sum + (parseFloat(a.points) || 0), 0),
      requiredPoints: 40,
    });
  } catch (err) {
    logger.error("Error fetching improvement activities:", err);
    res.status(500).json({ error: "Failed to fetch improvement activities" });
  }
});

// ============================================================================
// SUBMISSIONS & REPORTS
// ============================================================================

/**
 * POST /api/quality/submit - Generate MIPS submission
 */
const submitSchema = z.object({
  year: z.number().min(2020).max(2099),
  quarter: z.number().min(1).max(4).optional(),
  providerId: z.string().optional(),
  submissionType: z.enum(["quality", "pi", "ia", "cost", "final"]).optional(),
  generateQRDA: z.boolean().optional().default(false),
});

qualityMeasuresRouter.post("/submit", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { year, quarter, providerId, submissionType, generateQRDA } = parsed.data;

    // Get dashboard data for submission
    const dashboard = await qualityMeasuresService.getMIPSDashboard(
      tenantId,
      year,
      providerId
    );

    // Create submission record
    const submissionId = randomUUID();
    const confirmationNumber = `MIPS-${year}${quarter ? `-Q${quarter}` : ''}-${submissionId.substring(0, 8).toUpperCase()}`;

    await pool.query(
      `INSERT INTO mips_submissions (
        id, tenant_id, provider_id, submission_year, submission_quarter,
        submission_type, status, quality_score, pi_score, ia_score, cost_score,
        final_score, submission_data, submitted_at, submitted_by, confirmation_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, $15)`,
      [
        submissionId,
        tenantId,
        providerId || null,
        year,
        quarter || null,
        submissionType || 'final',
        'submitted',
        dashboard.qualityScore,
        dashboard.piScore,
        dashboard.iaScore,
        dashboard.costScore,
        dashboard.estimatedFinalScore,
        JSON.stringify({
          measures: dashboard.measures,
          recommendations: dashboard.recommendations,
          careGaps: dashboard.careGaps.length,
        }),
        userId,
        confirmationNumber,
      ]
    );

    // Generate QRDA if requested
    let qrdaReport = null;
    if (generateQRDA) {
      qrdaReport = await qualityMeasuresService.generateQRDAReport(tenantId, year, providerId);
    }

    await auditLog(tenantId, userId, "mips_submitted", "mips_submission", submissionId);

    res.json({
      success: true,
      submissionId,
      confirmationNumber,
      scores: {
        quality: dashboard.qualityScore,
        pi: dashboard.piScore,
        ia: dashboard.iaScore,
        cost: dashboard.costScore,
        final: dashboard.estimatedFinalScore,
        paymentAdjustment: dashboard.paymentAdjustment,
      },
      qrdaReport,
    });
  } catch (err) {
    logger.error("Error submitting MIPS data:", err);
    res.status(500).json({ error: "Failed to submit MIPS data" });
  }
});

/**
 * GET /api/quality/submissions - Get submission history
 */
qualityMeasuresRouter.get("/submissions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId } = req.query;

    let query = `
      SELECT ms.*, u.full_name as submitted_by_name, p.full_name as provider_name
      FROM mips_submissions ms
      LEFT JOIN users u ON u.id = ms.submitted_by
      LEFT JOIN users p ON p.id = ms.provider_id
      WHERE ms.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (year) {
      params.push(year);
      query += ` AND ms.submission_year = $${params.length}`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` AND ms.provider_id = $${params.length}`;
    }

    query += " ORDER BY ms.submitted_at DESC";

    const result = await pool.query(query, params);

    res.json({ submissions: result.rows });
  } catch (err) {
    logger.error("Error fetching submissions:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// ============================================================================
// CARE GAPS
// ============================================================================

/**
 * GET /api/quality/gaps - Identify care gaps for patients
 */
qualityMeasuresRouter.get("/gaps", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { measureId, providerId, priority, status, patientId } = req.query;

    // If patient-specific, use service method
    if (patientId) {
      const gaps = await qualityMeasuresService.getPatientCareGaps(tenantId, patientId as string);
      return res.json({ gaps, count: gaps.length });
    }

    let query = `
      SELECT
        qg.*,
        qm.measure_id as measure_code,
        qm.measure_name,
        qm.category,
        qm.high_priority,
        p.first_name || ' ' || p.last_name as patient_name,
        p.dob,
        p.phone,
        p.email,
        u.full_name as provider_name
      FROM quality_gaps qg
      JOIN quality_measures qm ON qg.measure_id = qm.id
      JOIN patients p ON qg.patient_id = p.id
      LEFT JOIN users u ON qg.provider_id = u.id
      WHERE qg.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (measureId) {
      params.push(measureId);
      query += ` AND (qg.measure_id = $${params.length} OR qm.measure_id = $${params.length})`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` AND qg.provider_id = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      query += ` AND qg.priority = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND qg.status = $${params.length}`;
    } else {
      query += " AND qg.status = 'open'";
    }

    query += " ORDER BY qg.priority DESC, qm.high_priority DESC, qg.due_date NULLS LAST, qg.created_at DESC LIMIT 100";

    const result = await pool.query(query, params);

    res.json({
      gaps: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    logger.error("Error fetching care gaps:", err);
    res.status(500).json({ error: "Failed to fetch care gaps" });
  }
});

/**
 * POST /api/quality/gaps/:id/close - Close a care gap
 */
qualityMeasuresRouter.post("/gaps/:id/close", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const id = String(req.params.id);
    const { interventionNotes, resolutionMethod } = req.body;

    const result = await pool.query(
      `UPDATE quality_gaps
       SET status = 'closed',
           closed_date = NOW(),
           closed_by = $1,
           intervention_notes = $2,
           resolution_method = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [userId, interventionNotes, resolutionMethod || 'manual', id, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Gap not found" });
    }

    await auditLog(tenantId, userId, "care_gap_closed", "quality_gap", id);

    res.json({ success: true, gap: result.rows[0] });
  } catch (err) {
    logger.error("Error closing care gap:", err);
    res.status(500).json({ error: "Failed to close care gap" });
  }
});

/**
 * POST /api/quality/gaps/:id/outreach - Record outreach attempt
 */
qualityMeasuresRouter.post("/gaps/:id/outreach", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = String(req.params.id);
    const { method, notes } = req.body;

    const result = await pool.query(
      `UPDATE quality_gaps
       SET outreach_attempts = outreach_attempts + 1,
           last_outreach_date = NOW(),
           last_outreach_method = $1,
           intervention_notes = COALESCE(intervention_notes, '') || E'\\n' || $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [method || 'phone', notes || `Outreach attempt on ${new Date().toISOString()}`, id, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Gap not found" });
    }

    res.json({ success: true, gap: result.rows[0] });
  } catch (err) {
    logger.error("Error recording outreach:", err);
    res.status(500).json({ error: "Failed to record outreach" });
  }
});

// ============================================================================
// REPORTS
// ============================================================================

/**
 * GET /api/quality/reports/quarterly - Generate quarterly progress report
 */
qualityMeasuresRouter.get("/reports/quarterly", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, quarter } = req.query;

    const reportYear = year ? parseInt(year as string) : new Date().getFullYear();
    const reportQuarter = quarter ? parseInt(quarter as string) : Math.ceil((new Date().getMonth() + 1) / 3);

    const report = await qualityMeasuresService.generateQuarterlyReport(
      tenantId,
      reportYear,
      reportQuarter
    );

    res.json(report);
  } catch (err) {
    logger.error("Error generating quarterly report:", err);
    res.status(500).json({ error: "Failed to generate quarterly report" });
  }
});

/**
 * GET /api/quality/reports/qrda - Generate QRDA report
 */
qualityMeasuresRouter.get("/reports/qrda", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId } = req.query;

    const reportYear = year ? parseInt(year as string) : new Date().getFullYear();

    const report = await qualityMeasuresService.generateQRDAReport(
      tenantId,
      reportYear,
      providerId as string | undefined
    );

    await auditLog(tenantId, req.user!.id, "qrda_report_generated", "qrda_report", report.reportId);

    res.json(report);
  } catch (err) {
    logger.error("Error generating QRDA report:", err);
    res.status(500).json({ error: "Failed to generate QRDA report" });
  }
});

// ============================================================================
// AUTOMATION - Encounter Integration
// ============================================================================

/**
 * POST /api/quality/evaluate-encounter - Auto-evaluate on encounter complete
 */
qualityMeasuresRouter.post("/evaluate-encounter", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { encounterId, patientId, providerId } = req.body;

    if (!encounterId || !patientId) {
      return res.status(400).json({ error: "encounterId and patientId are required" });
    }

    const results = await qualityMeasuresService.evaluatePatientOnEncounterComplete(
      tenantId,
      encounterId,
      patientId,
      providerId || req.user!.id
    );

    // Get any new care gaps for alert
    const careGaps = await qualityMeasuresService.getPatientCareGaps(tenantId, patientId);

    res.json({
      success: true,
      evaluated: results.length,
      results,
      careGaps,
      hasOpenGaps: careGaps.length > 0,
    });
  } catch (err) {
    logger.error("Error evaluating encounter:", err);
    res.status(500).json({ error: "Failed to evaluate encounter" });
  }
});

/**
 * POST /api/quality/recalculate - Recalculate performance for a period
 */
qualityMeasuresRouter.post("/recalculate", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, measureId, startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }

    // Get measures to recalculate
    let measuresQuery = "SELECT * FROM quality_measures WHERE is_active = true AND category = 'quality'";
    const measuresParams: any[] = [];

    if (measureId) {
      measuresParams.push(measureId);
      measuresQuery += ` AND (id = $${measuresParams.length} OR measure_id = $${measuresParams.length})`;
    }

    const measuresResult = await pool.query(measuresQuery, measuresParams);
    const measures = measuresResult.rows;

    const results = [];

    for (const measure of measures) {
      try {
        const perf = await qualityMeasuresService.calculateMeasureRate(
          tenantId,
          measure.measure_id,
          providerId,
          startDate,
          endDate
        );

        // Cache the result
        await pool.query(
          `INSERT INTO measure_performance (
            id, tenant_id, provider_id, measure_id,
            reporting_period_start, reporting_period_end,
            numerator_count, denominator_count, exclusion_count,
            performance_rate, last_calculated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (tenant_id, provider_id, measure_id, reporting_period_start, reporting_period_end)
          DO UPDATE SET
            numerator_count = $7,
            denominator_count = $8,
            exclusion_count = $9,
            performance_rate = $10,
            last_calculated_at = NOW()`,
          [
            randomUUID(),
            tenantId,
            providerId || null,
            measure.id,
            startDate,
            endDate,
            perf.numeratorCount,
            perf.denominatorCount,
            perf.exclusionCount,
            perf.performanceRate,
          ]
        );

        results.push(perf);
      } catch (e) {
        logger.error(`Error calculating measure ${measure.measure_id}:`, e);
      }
    }

    res.json({
      recalculated: results.length,
      results,
      periodStart: startDate,
      periodEnd: endDate,
    });
  } catch (err) {
    logger.error("Error recalculating performance:", err);
    res.status(500).json({ error: "Failed to recalculate performance" });
  }
});

// ============================================================================
// DERMATOLOGY-SPECIFIC MEASURES
// ============================================================================

/**
 * GET /api/quality/dermatology-measures - Get dermatology measure definitions
 */
qualityMeasuresRouter.get("/dermatology-measures", requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json({
      measures: DERM_MEASURES,
      descriptions: {
        MELANOMA_MARGINS: "Melanoma patients receiving excision with appropriate surgical margins based on Breslow depth",
        MELANOMA_RECALL: "Melanoma patients enrolled in structured recall/surveillance program",
        PSORIASIS_RESPONSE: "Psoriasis patients on systemic therapy with documented clinical response assessment (PASI/BSA/PGA)",
        PSORIASIS_ITCH: "Psoriasis patients demonstrating improvement in patient-reported itch severity",
        TB_SCREENING: "Patients starting biologics/JAK inhibitors with TB screening within 12 months",
        TOBACCO_SCREENING: "Patients screened for tobacco use with cessation intervention if user",
        MELANOMA_COORDINATION: "Melanoma patients with documented follow-up plan",
      },
    });
  } catch (err) {
    logger.error("Error fetching dermatology measures:", err);
    res.status(500).json({ error: "Failed to fetch dermatology measures" });
  }
});
