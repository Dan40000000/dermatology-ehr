import express from "express";
import { z } from "zod";
import { aiLesionAnalysisService } from "../services/aiLesionAnalysisService";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const router = express.Router();

/**
 * AI Lesion Analysis Routes
 *
 * PROVIDER-ONLY endpoints for AI-powered lesion image analysis.
 * Includes differential diagnosis, ABCDE scoring, dermoscopy pattern recognition,
 * and risk stratification.
 *
 * All responses include disclaimer: "AI assistance only, not a diagnosis"
 */

// All routes require authentication
router.use(requireAuth);

// Request validation schemas
const analyzeImageSchema = z.object({
  imageId: z.string().uuid(),
  analysisType: z.enum(["standard", "dermoscopy"]).optional().default("standard"),
});

const compareImagesSchema = z.object({
  currentImageId: z.string().uuid(),
  priorImageId: z.string().uuid(),
});

const feedbackSchema = z.object({
  wasAccurate: z.boolean(),
  accuracyRating: z.number().min(1).max(5).optional(),
  actualDiagnosis: z.string().optional(),
  actualIcd10Code: z.string().optional(),
  classificationWasCorrect: z.boolean().optional(),
  correctClassification: z.enum(["benign", "suspicious", "likely_malignant"]).optional(),
  riskAssessmentWasCorrect: z.boolean().optional(),
  correctRiskLevel: z.enum(["low", "moderate", "high"]).optional(),
  abcdeScoringAccuracy: z.number().min(1).max(5).optional(),
  feedbackNotes: z.string().optional(),
  missedFeatures: z.array(z.string()).optional(),
  falsePositiveFeatures: z.array(z.string()).optional(),
  biopsyPerformed: z.boolean().optional(),
  biopsyResult: z.string().optional(),
  finalPathology: z.string().optional(),
});

/**
 * @swagger
 * /api/ai-lesion-analysis/analyze:
 *   post:
 *     summary: Analyze lesion image with AI
 *     description: |
 *       Perform comprehensive AI-powered analysis on a lesion image including:
 *       - Primary classification (benign/suspicious/likely malignant)
 *       - Differential diagnoses with confidence scores
 *       - ABCDE feature auto-scoring
 *       - Dermoscopy pattern recognition (if dermoscopic image)
 *       - Risk stratification
 *       - Clinical recommendations
 *
 *       **PROVIDER-ONLY feature. All analyses are logged for audit.**
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageId
 *             properties:
 *               imageId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the lesion image to analyze
 *               analysisType:
 *                 type: string
 *                 enum: [standard, dermoscopy]
 *                 default: standard
 *                 description: Type of analysis to perform
 *     responses:
 *       200:
 *         description: Analysis complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 analysis:
 *                   $ref: '#/components/schemas/AILesionAnalysis'
 *                 disclaimer:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - provider role required
 *       404:
 *         description: Image not found
 *       500:
 *         description: Analysis failed
 */
router.post("/analyze", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const validation = analyzeImageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { imageId, analysisType } = validation.data;
    const user = req.user!;

    const analysis = await aiLesionAnalysisService.analyzeImage(
      imageId,
      user.tenantId,
      user.id,
      analysisType
    );

    res.json({
      success: true,
      analysis,
      disclaimer: "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required.",
    });
  } catch (error) {
    console.error("AI Lesion Analysis Error:", error);
    const message = error instanceof Error ? error.message : "Failed to analyze image";
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/{analysisId}:
 *   get:
 *     summary: Get analysis by ID
 *     description: Retrieve a specific AI lesion analysis by its ID.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Analysis ID
 *     responses:
 *       200:
 *         description: Analysis details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Analysis not found
 */
router.get("/:analysisId", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const { analysisId } = req.params;
    const user = req.user!;

    if (!analysisId) {
      return res.status(400).json({ error: "Analysis ID required" });
    }

    const analysis = await aiLesionAnalysisService.getAnalysis(analysisId, user.tenantId);

    res.json({
      success: true,
      analysis,
      disclaimer: "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required.",
    });
  } catch (error) {
    console.error("Get Analysis Error:", error);
    const message = error instanceof Error ? error.message : "Failed to retrieve analysis";
    if (message === "Analysis not found") {
      return res.status(404).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/image/{imageId}:
 *   get:
 *     summary: Get analysis for image
 *     description: Retrieve AI analysis results for a specific image.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Image ID
 *     responses:
 *       200:
 *         description: Analysis details or null if not analyzed
 *       401:
 *         description: Unauthorized
 */
router.get("/image/:imageId", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const { imageId } = req.params;
    const user = req.user!;

    if (!imageId) {
      return res.status(400).json({ error: "Image ID required" });
    }

    const analysis = await aiLesionAnalysisService.getAnalysisForImage(imageId, user.tenantId);

    res.json({
      success: true,
      analysis,
      hasAnalysis: analysis !== null,
      disclaimer: analysis
        ? "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required."
        : null,
    });
  } catch (error) {
    console.error("Get Image Analysis Error:", error);
    res.status(500).json({ error: "Failed to retrieve analysis" });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/compare:
 *   post:
 *     summary: Compare two lesion images
 *     description: |
 *       AI-powered change detection between two images of the same lesion.
 *       Analyzes size, color, border, symmetry changes and identifies new or resolved features.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentImageId
 *               - priorImageId
 *             properties:
 *               currentImageId:
 *                 type: string
 *                 format: uuid
 *               priorImageId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Comparison complete
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Image(s) not found
 */
router.post("/compare", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const validation = compareImagesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    const { currentImageId, priorImageId } = validation.data;
    const user = req.user!;

    const comparison = await aiLesionAnalysisService.compareToPrior(
      currentImageId,
      priorImageId,
      user.tenantId,
      user.id
    );

    res.json({
      success: true,
      comparison,
      disclaimer: "AI-powered change detection is for clinical decision support only. Professional evaluation required.",
    });
  } catch (error) {
    console.error("Compare Images Error:", error);
    const message = error instanceof Error ? error.message : "Failed to compare images";
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/{analysisId}/feedback:
 *   post:
 *     summary: Submit provider feedback
 *     description: |
 *       Submit feedback on AI analysis accuracy. This data is used to track model
 *       performance and improve future analyses.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wasAccurate
 *             properties:
 *               wasAccurate:
 *                 type: boolean
 *               accuracyRating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               actualDiagnosis:
 *                 type: string
 *               feedbackNotes:
 *                 type: string
 *               biopsyPerformed:
 *                 type: boolean
 *               biopsyResult:
 *                 type: string
 *     responses:
 *       200:
 *         description: Feedback recorded
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Analysis not found
 */
router.post("/:analysisId/feedback", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const { analysisId } = req.params;
    const validation = feedbackSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.issues });
    }

    if (!analysisId) {
      return res.status(400).json({ error: "Analysis ID required" });
    }

    const user = req.user!;

    const result = await aiLesionAnalysisService.recordFeedback(
      analysisId,
      user.id,
      user.tenantId,
      validation.data
    );

    res.json({
      success: true,
      feedbackId: result.id,
      message: "Feedback recorded successfully. Thank you for helping improve AI accuracy.",
    });
  } catch (error) {
    console.error("Record Feedback Error:", error);
    const message = error instanceof Error ? error.message : "Failed to record feedback";
    if (message === "Analysis not found") {
      return res.status(404).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/patient/{patientId}/high-risk:
 *   get:
 *     summary: Get high-risk lesions for patient
 *     description: Retrieve all high-risk lesion analyses for a specific patient.
 *     tags:
 *       - AI Lesion Analysis
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
 *     responses:
 *       200:
 *         description: List of high-risk analyses
 *       401:
 *         description: Unauthorized
 */
router.get("/patient/:patientId/high-risk", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const user = req.user!;

    if (!patientId) {
      return res.status(400).json({ error: "Patient ID required" });
    }

    // Verify patient exists and belongs to tenant
    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, user.tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const analyses = await aiLesionAnalysisService.getPatientHighRiskLesions(
      patientId,
      user.tenantId
    );

    res.json({
      success: true,
      count: analyses.length,
      analyses,
      disclaimer: "AI assistance only - this is not a diagnosis. Clinical correlation and professional evaluation required.",
    });
  } catch (error) {
    console.error("Get High-Risk Lesions Error:", error);
    res.status(500).json({ error: "Failed to retrieve high-risk lesions" });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/patient/{patientId}/history:
 *   get:
 *     summary: Get analysis history for patient
 *     description: Retrieve all AI lesion analyses for a specific patient.
 *     tags:
 *       - AI Lesion Analysis
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of analyses
 *       401:
 *         description: Unauthorized
 */
router.get("/patient/:patientId/history", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const user = req.user!;

    if (!patientId) {
      return res.status(400).json({ error: "Patient ID required" });
    }

    // Verify patient exists
    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, user.tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const analyses = await aiLesionAnalysisService.getPatientAnalysisHistory(
      patientId,
      user.tenantId,
      limit
    );

    res.json({
      success: true,
      count: analyses.length,
      analyses,
    });
  } catch (error) {
    console.error("Get Patient History Error:", error);
    res.status(500).json({ error: "Failed to retrieve analysis history" });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/metrics:
 *   get:
 *     summary: Get AI accuracy metrics
 *     description: Retrieve accuracy metrics for AI model performance tracking.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Accuracy metrics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 */
router.get("/metrics", requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;

    const metrics = await aiLesionAnalysisService.getAccuracyMetrics(user.tenantId);

    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error("Get Metrics Error:", error);
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
});

/**
 * @swagger
 * /api/ai-lesion-analysis/stats:
 *   get:
 *     summary: Get analysis statistics
 *     description: Get summary statistics for AI lesion analyses.
 *     tags:
 *       - AI Lesion Analysis
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;

    const statsResult = await pool.query(
      `SELECT
        COUNT(*) AS "totalAnalyses",
        COUNT(*) FILTER (WHERE risk_level = 'high') AS "highRiskCount",
        COUNT(*) FILTER (WHERE risk_level = 'moderate') AS "moderateRiskCount",
        COUNT(*) FILTER (WHERE risk_level = 'low') AS "lowRiskCount",
        COUNT(*) FILTER (WHERE analysis_date >= NOW() - INTERVAL '30 days') AS "last30Days",
        AVG(confidence_score) AS "avgConfidence"
       FROM ai_lesion_analyses
       WHERE tenant_id = $1 AND is_archived = false`,
      [user.tenantId]
    );

    const feedbackResult = await pool.query(
      `SELECT
        COUNT(*) AS "totalFeedback",
        COUNT(*) FILTER (WHERE was_accurate = true) AS "accurateCount",
        AVG(accuracy_rating) AS "avgRating"
       FROM ai_analysis_feedback
       WHERE tenant_id = $1`,
      [user.tenantId]
    );

    const classificationResult = await pool.query(
      `SELECT
        primary_classification,
        COUNT(*) AS count
       FROM ai_lesion_analyses
       WHERE tenant_id = $1 AND is_archived = false
       GROUP BY primary_classification`,
      [user.tenantId]
    );

    const stats = statsResult.rows[0];
    const feedback = feedbackResult.rows[0];
    const byClassification: Record<string, number> = {};

    for (const row of classificationResult.rows) {
      if (row?.primary_classification) {
        byClassification[row.primary_classification] = parseInt(row.count) || 0;
      }
    }

    res.json({
      success: true,
      stats: {
        totalAnalyses: parseInt(stats?.totalAnalyses) || 0,
        highRiskCount: parseInt(stats?.highRiskCount) || 0,
        moderateRiskCount: parseInt(stats?.moderateRiskCount) || 0,
        lowRiskCount: parseInt(stats?.lowRiskCount) || 0,
        last30Days: parseInt(stats?.last30Days) || 0,
        avgConfidence: parseFloat(stats?.avgConfidence) || 0,
        byClassification,
        feedback: {
          totalFeedback: parseInt(feedback?.totalFeedback) || 0,
          accurateCount: parseInt(feedback?.accurateCount) || 0,
          avgRating: parseFloat(feedback?.avgRating) || 0,
        },
      },
    });
  } catch (error) {
    console.error("Get Stats Error:", error);
    res.status(500).json({ error: "Failed to retrieve statistics" });
  }
});

export default router;
