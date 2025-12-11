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
 * GET /api/adaptive/diagnoses/suggested
 * Get top diagnoses for a provider, sorted by adaptive score (frequency + recency)
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
 * GET /api/adaptive/procedures/suggested
 * Get top procedures for a provider, sorted by adaptive score
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
 * GET /api/adaptive/procedures/for-diagnosis/:icd10Code
 * Get procedures commonly paired with a specific diagnosis
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
 * POST /api/adaptive/learn/diagnosis
 * Manually record diagnosis usage (can be called directly or automatically)
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
 * POST /api/adaptive/learn/procedure
 * Manually record procedure usage
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
 * POST /api/adaptive/learn/pair
 * Manually record diagnosis-procedure pair
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
 * GET /api/adaptive/stats/:providerId
 * Get provider learning statistics (for display purposes)
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
