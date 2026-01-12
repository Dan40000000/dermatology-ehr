import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { aiNoteDraftingService } from "../services/aiNoteDrafting";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const router = express.Router();

/**
 * AI Note Drafting Routes
 *
 * Endpoints for AI-powered clinical note generation
 */

const draftRequestSchema = z.object({
  templateId: z.string().optional(),
  chiefComplaint: z.string().optional(),
  briefNotes: z.string().optional(),
  patientId: z.string(),
  encounterId: z.string().optional(),
  priorEncounterIds: z.array(z.string()).optional(),
});

const suggestionFeedbackSchema = z.object({
  accepted: z.boolean(),
  feedback: z.string().optional(),
});

const smartSuggestSchema = z.object({
  encounterId: z.string(),
  section: z.enum(["chiefComplaint", "hpi", "ros", "exam", "assessmentPlan"]),
  currentText: z.string(),
});

// POST /api/ai-notes/draft - Generate note draft
router.post(
  "/draft",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = draftRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const providerId = req.user!.id;
      const data = parsed.data;

      // Generate draft
      const draft = await aiNoteDraftingService.generateNoteDraft(
        {
          ...data,
          providerId,
        },
        tenantId
      );

      // Store suggestions in database for learning
      if (data.encounterId) {
        for (const suggestion of draft.suggestions) {
          const suggestionId = crypto.randomUUID();
          await pool.query(
            `insert into ai_note_suggestions (
              id, tenant_id, encounter_id, provider_id,
              suggestion_type, section, suggested_text, confidence_score
            ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              suggestionId,
              tenantId,
              data.encounterId,
              providerId,
              "auto_draft",
              suggestion.section,
              suggestion.suggestion,
              suggestion.confidence,
            ]
          );
        }
      }

      res.json({
        draft,
        message: "Note draft generated successfully",
      });
    } catch (error) {
      console.error("Draft generation error:", error);
      res.status(500).json({ error: "Failed to generate note draft" });
    }
  }
);

// POST /api/ai-notes/suggestions - Get smart auto-complete suggestions
router.post("/suggestions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = smartSuggestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const data = parsed.data;

    const suggestions = await aiNoteDraftingService.getSmartSuggestions(
      data.encounterId,
      data.section,
      data.currentText,
      tenantId
    );

    res.json({ suggestions });
  } catch (error) {
    console.error("Get suggestions error:", error);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

// POST /api/ai-notes/suggestions/:id/feedback - Record feedback on suggestion
router.post(
  "/suggestions/:id/feedback",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = suggestionFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const data = parsed.data;

      await aiNoteDraftingService.recordSuggestionFeedback(
        id!,
        data.accepted,
        data.feedback || null,
        tenantId
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Record feedback error:", error);
      res.status(500).json({ error: "Failed to record feedback" });
    }
  }
);

// GET /api/ai-notes/suggestions/:encounterId - Get all suggestions for an encounter
router.get(
  "/suggestions/:encounterId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { encounterId } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `select
          id,
          suggestion_type as "suggestionType",
          section,
          suggested_text as "suggestedText",
          confidence_score as "confidenceScore",
          accepted,
          feedback,
          created_at as "createdAt"
         from ai_note_suggestions
         where encounter_id = $1 and tenant_id = $2
         order by created_at desc`,
        [encounterId, tenantId]
      );

      res.json({ suggestions: result.rows });
    } catch (error) {
      console.error("Get encounter suggestions error:", error);
      res.status(500).json({ error: "Failed to retrieve suggestions" });
    }
  }
);

// GET /api/ai-notes/stats - Get AI note usage statistics
router.get("/stats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;

    const stats = await pool.query(
      `select
        count(*) as "totalSuggestions",
        count(*) filter (where accepted = true) as "acceptedSuggestions",
        count(*) filter (where accepted = false) as "rejectedSuggestions",
        avg(confidence_score) as "avgConfidence",
        count(distinct encounter_id) as "encountersWithSuggestions"
       from ai_note_suggestions
       where tenant_id = $1 and provider_id = $2`,
      [tenantId, providerId]
    );

    const acceptanceRate =
      stats.rows[0].totalSuggestions > 0
        ? (stats.rows[0].acceptedSuggestions / stats.rows[0].totalSuggestions) * 100
        : 0;

    res.json({
      ...stats.rows[0],
      acceptanceRate: acceptanceRate.toFixed(1),
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to retrieve statistics" });
  }
});

export default router;
