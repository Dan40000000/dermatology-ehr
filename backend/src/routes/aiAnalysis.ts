import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { aiImageAnalysisService } from "../services/aiImageAnalysis";
import { pool } from "../db/pool";

const router = express.Router();

/**
 * AI Analysis Routes
 *
 * Endpoints for AI-powered image analysis and clinical decision support
 */

/**
 * @swagger
 * /api/ai-analysis/analyze-photo/{photoId}:
 *   post:
 *     summary: Analyze a photo with AI
 *     description: Perform AI-powered analysis on a clinical photo to detect skin lesions and assess risk.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Photo ID
 *     responses:
 *       200:
 *         description: Analysis complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 analysisId:
 *                   type: string
 *                   format: uuid
 *                 analysis:
 *                   type: object
 *                   properties:
 *                     riskLevel:
 *                       type: string
 *                       enum: [low, moderate, high, critical]
 *                     primaryFinding:
 *                       type: string
 *                     confidenceScore:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Photo not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to analyze photo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/analyze-photo/:photoId", async (req, res) => {
  try {
    const { photoId } = req.params;
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const userId = user.id;

    // Verify photo exists and belongs to tenant
    const photoResult = await pool.query(
      `select id, url, patient_id as "patientId" from photos
       where id = $1 and tenant_id = $2`,
      [photoId, tenantId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: "Photo not found" });
    }

    const photo = photoResult.rows[0];

    // Check if already analyzed
    const existingAnalysis = await aiImageAnalysisService.getAnalysisForPhoto(photoId, tenantId);
    if (existingAnalysis) {
      return res.json({
        message: "Photo already analyzed",
        analysisId: existingAnalysis.id,
        analysis: existingAnalysis,
      });
    }

    // Perform analysis
    const analysisId = await aiImageAnalysisService.analyzeSkinLesion(
      photoId,
      photo.url,
      tenantId,
      userId
    );

    // Get the complete analysis results
    const analysis = await aiImageAnalysisService.getAnalysisForPhoto(photoId, tenantId);

    // Create CDS alert if high or critical risk
    if (analysis && (analysis.riskLevel === "high" || analysis.riskLevel === "critical")) {
      await pool.query(
        `insert into cds_alerts (
          id, tenant_id, patient_id, alert_type, severity, title, description, action_required
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          photo.patientId,
          "high_risk_lesion",
          analysis.riskLevel === "critical" ? "critical" : "high",
          `High-Risk Lesion Detected`,
          `AI analysis flagged a ${analysis.riskLevel} risk lesion: ${analysis.primaryFinding}`,
          true,
        ]
      );
    }

    res.json({
      message: "Analysis complete",
      analysisId,
      analysis,
    });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze photo" });
  }
});

/**
 * @swagger
 * /api/ai-analysis/photo/{photoId}:
 *   get:
 *     summary: Get AI analysis for photo
 *     description: Retrieve AI analysis results for a specific photo.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Photo ID
 *     responses:
 *       200:
 *         description: Analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No analysis found for this photo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to retrieve analysis
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/photo/:photoId", async (req, res) => {
  try {
    const { photoId } = req.params;
    const user = (req as any).user;
    const tenantId = user.tenantId;

    const analysis = await aiImageAnalysisService.getAnalysisForPhoto(photoId, tenantId);

    if (!analysis) {
      return res.status(404).json({ error: "No analysis found for this photo" });
    }

    res.json(analysis);
  } catch (error) {
    console.error("Get Analysis Error:", error);
    res.status(500).json({ error: "Failed to retrieve analysis" });
  }
});

/**
 * @swagger
 * /api/ai-analysis/batch-analyze/{patientId}:
 *   post:
 *     summary: Batch analyze patient photos
 *     description: Analyze all unanalyzed photos for a patient with AI.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Batch analysis complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 analysisCount:
 *                   type: integer
 *                 analysisIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: uuid
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to batch analyze photos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/batch-analyze/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const userId = user.id;

    // Verify patient exists and belongs to tenant
    const patientResult = await pool.query(
      `select id from patients where id = $1 and tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Perform batch analysis
    const analysisIds = await aiImageAnalysisService.batchAnalyzePatientPhotos(
      patientId,
      tenantId,
      userId
    );

    res.json({
      message: "Batch analysis complete",
      analysisCount: analysisIds.length,
      analysisIds,
    });
  } catch (error) {
    console.error("Batch Analysis Error:", error);
    res.status(500).json({ error: "Failed to batch analyze photos" });
  }
});

/**
 * @swagger
 * /api/ai-analysis/cds-alerts:
 *   get:
 *     summary: Get CDS alerts
 *     description: Retrieve clinical decision support alerts generated from AI analysis.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by patient ID
 *       - in: query
 *         name: dismissed
 *         schema:
 *           type: boolean
 *         description: Filter by dismissed status
 *     responses:
 *       200:
 *         description: List of CDS alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to retrieve alerts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/cds-alerts", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const { patientId, dismissed } = req.query;

    let query = `
      select
        a.id,
        a.patient_id as "patientId",
        a.encounter_id as "encounterId",
        a.alert_type as "alertType",
        a.severity,
        a.title,
        a.description,
        a.action_required as "actionRequired",
        a.dismissed,
        a.dismissed_by as "dismissedBy",
        a.dismissed_at as "dismissedAt",
        a.created_at as "createdAt",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName",
        u.first_name as "dismissedByFirstName",
        u.last_name as "dismissedByLastName"
      from cds_alerts a
      left join patients p on a.patient_id = p.id
      left join users u on a.dismissed_by = u.id
      where a.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` and a.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (dismissed !== undefined) {
      query += ` and a.dismissed = $${paramIndex}`;
      params.push(dismissed === "true");
      paramIndex++;
    }

    query += ` order by a.created_at desc limit 100`;

    const result = await pool.query(query, params);

    res.json({
      alerts: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Get CDS Alerts Error:", error);
    res.status(500).json({ error: "Failed to retrieve alerts" });
  }
});

/**
 * @swagger
 * /api/ai-analysis/cds-alerts/{alertId}/dismiss:
 *   post:
 *     summary: Dismiss CDS alert
 *     description: Dismiss a clinical decision support alert.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert dismissed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to dismiss alert
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/cds-alerts/:alertId/dismiss", async (req, res) => {
  try {
    const { alertId } = req.params;
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const userId = user.id;

    const result = await pool.query(
      `update cds_alerts
       set dismissed = true, dismissed_by = $1, dismissed_at = now()
       where id = $2 and tenant_id = $3
       returning id`,
      [userId, alertId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.json({ message: "Alert dismissed" });
  } catch (error) {
    console.error("Dismiss Alert Error:", error);
    res.status(500).json({ error: "Failed to dismiss alert" });
  }
});

/**
 * @swagger
 * /api/ai-analysis/stats:
 *   get:
 *     summary: Get AI analysis statistics
 *     description: Retrieve statistics about AI analyses and CDS alerts.
 *     tags:
 *       - AI Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Analysis statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analyses:
 *                   type: object
 *                   properties:
 *                     totalAnalyses:
 *                       type: integer
 *                     highRiskCount:
 *                       type: integer
 *                     last30Days:
 *                       type: integer
 *                     avgConfidence:
 *                       type: number
 *                 alerts:
 *                   type: object
 *                   properties:
 *                     totalAlerts:
 *                       type: integer
 *                     activeAlerts:
 *                       type: integer
 *                     criticalAlerts:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to retrieve statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/stats", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;

    const stats = await pool.query(
      `select
        count(*) as "totalAnalyses",
        count(*) filter (where risk_level = 'high' or risk_level = 'critical') as "highRiskCount",
        count(*) filter (where analyzed_at >= now() - interval '30 days') as "last30Days",
        avg(confidence_score) as "avgConfidence"
       from photo_ai_analysis
       where tenant_id = $1`,
      [tenantId]
    );

    const alertStats = await pool.query(
      `select
        count(*) as "totalAlerts",
        count(*) filter (where dismissed = false) as "activeAlerts",
        count(*) filter (where severity = 'critical') as "criticalAlerts"
       from cds_alerts
       where tenant_id = $1`,
      [tenantId]
    );

    res.json({
      analyses: stats.rows[0],
      alerts: alertStats.rows[0],
    });
  } catch (error) {
    console.error("Get Stats Error:", error);
    res.status(500).json({ error: "Failed to retrieve statistics" });
  }
});

export default router;
