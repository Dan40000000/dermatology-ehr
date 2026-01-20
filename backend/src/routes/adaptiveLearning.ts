import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import {
  recordDiagnosisUsage,
  recordProcedureUsage,
  recordDiagnosisProcedurePair,
  calculateAdaptiveScore,
} from "../services/learningService";

export const adaptiveLearningRouter = Router();

// Schema for manual learning requests
const learnDiagnosisSchema = z.object({
  providerId: z.string(),
  icd10Code: z.string(),
});

const learnProcedureSchema = z.object({
  providerId: z.string(),
  cptCode: z.string(),
});

const learnPairSchema = z.object({
  providerId: z.string(),
  icd10Code: z.string(),
  cptCode: z.string(),
});

/**
 * @swagger
 * /api/adaptive/diagnoses/suggested:
 *   get:
 *     summary: Get suggested diagnoses for a provider
 *     description: Retrieve top diagnoses sorted by adaptive score (frequency + recency) for a specific provider.
 *     tags:
 *       - Adaptive Learning
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID (defaults to current user if not specified)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of suggestions to return
 *     responses:
 *       200:
 *         description: List of suggested diagnoses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       icd10Code:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       frequencyCount:
 *                         type: integer
 *                       lastUsed:
 *                         type: string
 *                         format: date-time
 *                       adaptiveScore:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch suggestions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.get("/diagnoses/suggested", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const providerId = String(req.query.providerId || req.user!.id);
  const limit = parseInt(String(req.query.limit || "10"), 10);

  try {
    const result = await pool.query(
      `SELECT
        pdf.icd10_code as "icd10Code",
        pdf.frequency_count as "frequencyCount",
        pdf.last_used as "lastUsed",
        icd.description,
        icd.category
       FROM provider_diagnosis_frequency pdf
       LEFT JOIN icd10_codes icd ON icd.code = pdf.icd10_code
       WHERE pdf.tenant_id = $1 AND pdf.provider_id = $2
       ORDER BY pdf.frequency_count DESC, pdf.last_used DESC
       LIMIT $3`,
      [tenantId, providerId, limit],
    );

    // Calculate adaptive scores
    const suggestions = result.rows.map((row) => ({
      icd10Code: row.icd10Code,
      description: row.description || "Unknown diagnosis",
      category: row.category,
      frequencyCount: row.frequencyCount,
      lastUsed: row.lastUsed,
      adaptiveScore: calculateAdaptiveScore(row.frequencyCount, new Date(row.lastUsed)),
    }));

    // Re-sort by adaptive score
    suggestions.sort((a, b) => b.adaptiveScore - a.adaptiveScore);

    res.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggested diagnoses:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * @swagger
 * /api/adaptive/procedures/suggested:
 *   get:
 *     summary: Get suggested procedures for a provider
 *     description: Retrieve top procedures sorted by adaptive score (frequency + recency) for a specific provider.
 *     tags:
 *       - Adaptive Learning
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID (defaults to current user if not specified)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of suggestions to return
 *     responses:
 *       200:
 *         description: List of suggested procedures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cptCode:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       defaultFeeCents:
 *                         type: integer
 *                       frequencyCount:
 *                         type: integer
 *                       lastUsed:
 *                         type: string
 *                         format: date-time
 *                       adaptiveScore:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch suggestions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.get("/procedures/suggested", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const providerId = String(req.query.providerId || req.user!.id);
  const limit = parseInt(String(req.query.limit || "10"), 10);

  try {
    const result = await pool.query(
      `SELECT
        ppf.cpt_code as "cptCode",
        ppf.frequency_count as "frequencyCount",
        ppf.last_used as "lastUsed",
        cpt.description,
        cpt.category,
        cpt.default_fee_cents as "defaultFeeCents"
       FROM provider_procedure_frequency ppf
       LEFT JOIN cpt_codes cpt ON cpt.code = ppf.cpt_code
       WHERE ppf.tenant_id = $1 AND ppf.provider_id = $2
       ORDER BY ppf.frequency_count DESC, ppf.last_used DESC
       LIMIT $3`,
      [tenantId, providerId, limit],
    );

    // Calculate adaptive scores
    const suggestions = result.rows.map((row) => ({
      cptCode: row.cptCode,
      description: row.description || "Unknown procedure",
      category: row.category,
      defaultFeeCents: row.defaultFeeCents,
      frequencyCount: row.frequencyCount,
      lastUsed: row.lastUsed,
      adaptiveScore: calculateAdaptiveScore(row.frequencyCount, new Date(row.lastUsed)),
    }));

    // Re-sort by adaptive score
    suggestions.sort((a, b) => b.adaptiveScore - a.adaptiveScore);

    res.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggested procedures:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * @swagger
 * /api/adaptive/procedures/for-diagnosis/{icd10Code}:
 *   get:
 *     summary: Get procedures commonly paired with a diagnosis
 *     description: Retrieve procedures frequently used with a specific diagnosis, sorted by adaptive score.
 *     tags:
 *       - Adaptive Learning
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: icd10Code
 *         required: true
 *         schema:
 *           type: string
 *         description: ICD-10 diagnosis code
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID (defaults to current user if not specified)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of suggestions to return
 *     responses:
 *       200:
 *         description: List of suggested procedures for the diagnosis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cptCode:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       defaultFeeCents:
 *                         type: integer
 *                       pairCount:
 *                         type: integer
 *                       lastUsed:
 *                         type: string
 *                         format: date-time
 *                       adaptiveScore:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch suggestions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.get("/procedures/for-diagnosis/:icd10Code", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const providerId = String(req.query.providerId || req.user!.id);
  const { icd10Code } = req.params;
  const limit = parseInt(String(req.query.limit || "10"), 10);

  try {
    const result = await pool.query(
      `SELECT
        dpp.cpt_code as "cptCode",
        dpp.pair_count as "pairCount",
        dpp.last_used as "lastUsed",
        cpt.description,
        cpt.category,
        cpt.default_fee_cents as "defaultFeeCents"
       FROM diagnosis_procedure_pairs dpp
       LEFT JOIN cpt_codes cpt ON cpt.code = dpp.cpt_code
       WHERE dpp.tenant_id = $1
         AND dpp.provider_id = $2
         AND dpp.icd10_code = $3
       ORDER BY dpp.pair_count DESC, dpp.last_used DESC
       LIMIT $4`,
      [tenantId, providerId, icd10Code, limit],
    );

    // Calculate adaptive scores using pair_count as frequency
    const suggestions = result.rows.map((row) => ({
      cptCode: row.cptCode,
      description: row.description || "Unknown procedure",
      category: row.category,
      defaultFeeCents: row.defaultFeeCents,
      pairCount: row.pairCount,
      lastUsed: row.lastUsed,
      adaptiveScore: calculateAdaptiveScore(row.pairCount, new Date(row.lastUsed)),
    }));

    // Re-sort by adaptive score
    suggestions.sort((a, b) => b.adaptiveScore - a.adaptiveScore);

    res.json({ suggestions });
  } catch (error) {
    console.error("Error fetching paired procedures:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * @swagger
 * /api/adaptive/learn/diagnosis:
 *   post:
 *     summary: Record diagnosis usage
 *     description: Manually record that a provider used a specific diagnosis code. Updates frequency tracking for adaptive learning. Requires provider or admin role.
 *     tags:
 *       - Adaptive Learning
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
 *               - providerId
 *               - icd10Code
 *             properties:
 *               providerId:
 *                 type: string
 *                 format: uuid
 *               icd10Code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usage recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to record usage
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.post(
  "/learn/diagnosis",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = learnDiagnosisSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { providerId, icd10Code } = parsed.data;

    try {
      await recordDiagnosisUsage(tenantId, providerId, icd10Code);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording diagnosis usage:", error);
      res.status(500).json({ error: "Failed to record usage" });
    }
  },
);

/**
 * @swagger
 * /api/adaptive/learn/procedure:
 *   post:
 *     summary: Record procedure usage
 *     description: Manually record that a provider used a specific procedure code. Updates frequency tracking for adaptive learning. Requires provider or admin role.
 *     tags:
 *       - Adaptive Learning
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
 *               - providerId
 *               - cptCode
 *             properties:
 *               providerId:
 *                 type: string
 *                 format: uuid
 *               cptCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usage recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to record usage
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.post(
  "/learn/procedure",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = learnProcedureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { providerId, cptCode } = parsed.data;

    try {
      await recordProcedureUsage(tenantId, providerId, cptCode);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording procedure usage:", error);
      res.status(500).json({ error: "Failed to record usage" });
    }
  },
);

/**
 * @swagger
 * /api/adaptive/learn/pair:
 *   post:
 *     summary: Record diagnosis-procedure pair
 *     description: Manually record that a provider used a specific diagnosis and procedure together. Updates pairing tracking for adaptive learning. Requires provider or admin role.
 *     tags:
 *       - Adaptive Learning
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
 *               - providerId
 *               - icd10Code
 *               - cptCode
 *             properties:
 *               providerId:
 *                 type: string
 *                 format: uuid
 *               icd10Code:
 *                 type: string
 *               cptCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pair recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to record pair
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.post(
  "/learn/pair",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = learnPairSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { providerId, icd10Code, cptCode } = parsed.data;

    try {
      await recordDiagnosisProcedurePair(tenantId, providerId, icd10Code, cptCode);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording diagnosis-procedure pair:", error);
      res.status(500).json({ error: "Failed to record pair" });
    }
  },
);

/**
 * @swagger
 * /api/adaptive/stats/{providerId}:
 *   get:
 *     summary: Get provider learning statistics
 *     description: Retrieve adaptive learning statistics for a provider including top diagnoses, procedures, and usage counts.
 *     tags:
 *       - Adaptive Learning
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID
 *     responses:
 *       200:
 *         description: Provider learning statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topDiagnoses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       icd10Code:
 *                         type: string
 *                       frequencyCount:
 *                         type: integer
 *                       description:
 *                         type: string
 *                 topProcedures:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cptCode:
 *                         type: string
 *                       frequencyCount:
 *                         type: integer
 *                       description:
 *                         type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalDiagnoses:
 *                       type: integer
 *                     totalProcedures:
 *                       type: integer
 *                     totalPairs:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
adaptiveLearningRouter.get("/stats/:providerId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { providerId } = req.params;

  try {
    // Get top diagnoses
    const topDiagnosesResult = await pool.query(
      `SELECT
        pdf.icd10_code as "icd10Code",
        pdf.frequency_count as "frequencyCount",
        icd.description
       FROM provider_diagnosis_frequency pdf
       LEFT JOIN icd10_codes icd ON icd.code = pdf.icd10_code
       WHERE pdf.tenant_id = $1 AND pdf.provider_id = $2
       ORDER BY pdf.frequency_count DESC
       LIMIT 5`,
      [tenantId, providerId],
    );

    // Get top procedures
    const topProceduresResult = await pool.query(
      `SELECT
        ppf.cpt_code as "cptCode",
        ppf.frequency_count as "frequencyCount",
        cpt.description
       FROM provider_procedure_frequency ppf
       LEFT JOIN cpt_codes cpt ON cpt.code = ppf.cpt_code
       WHERE ppf.tenant_id = $1 AND ppf.provider_id = $2
       ORDER BY ppf.frequency_count DESC
       LIMIT 5`,
      [tenantId, providerId],
    );

    // Get total counts
    const statsResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM provider_diagnosis_frequency WHERE tenant_id = $1 AND provider_id = $2) as "totalDiagnoses",
        (SELECT COUNT(*) FROM provider_procedure_frequency WHERE tenant_id = $1 AND provider_id = $2) as "totalProcedures",
        (SELECT COUNT(*) FROM diagnosis_procedure_pairs WHERE tenant_id = $1 AND provider_id = $2) as "totalPairs"`,
      [tenantId, providerId],
    );

    res.json({
      topDiagnoses: topDiagnosesResult.rows,
      topProcedures: topProceduresResult.rows,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error("Error fetching provider stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});
