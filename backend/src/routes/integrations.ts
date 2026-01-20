import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { notificationService } from "../services/integrations/notificationService";
import { logger } from "../lib/logger";

const router = Router();

// Validation schemas
const createSlackIntegrationSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
  channelName: z.string().optional(),
  notificationTypes: z.array(
    z.enum([
      "appointment_booked",
      "appointment_cancelled",
      "patient_checked_in",
      "prior_auth_approved",
      "prior_auth_denied",
      "lab_results_ready",
      "urgent_message",
      "daily_schedule_summary",
      "end_of_day_report",
    ])
  ),
});

const createTeamsIntegrationSchema = z.object({
  webhookUrl: z.string().url().includes("webhook.office.com"),
  channelName: z.string().optional(),
  notificationTypes: z.array(
    z.enum([
      "appointment_booked",
      "appointment_cancelled",
      "patient_checked_in",
      "prior_auth_approved",
      "prior_auth_denied",
      "lab_results_ready",
      "urgent_message",
      "daily_schedule_summary",
      "end_of_day_report",
    ])
  ),
});

const updateIntegrationSchema = z.object({
  channelName: z.string().optional(),
  enabled: z.boolean().optional(),
  notificationTypes: z
    .array(
      z.enum([
        "appointment_booked",
        "appointment_cancelled",
        "patient_checked_in",
        "prior_auth_approved",
        "prior_auth_denied",
        "lab_results_ready",
        "urgent_message",
        "daily_schedule_summary",
        "end_of_day_report",
      ])
    )
    .optional(),
});

/**
 * @swagger
 * /api/integrations:
 *   get:
 *     summary: List all integrations for tenant
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;

    const result = await pool.query(
      `SELECT id, type, webhook_url, channel_name, enabled,
              notification_types, created_at, updated_at
       FROM integrations
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    // Get stats for each integration
    const integrationsWithStats = await Promise.all(
      result.rows.map(async (integration) => {
        const stats = await notificationService.getIntegrationStats(
          tenantId,
          integration.id
        );
        return {
          ...integration,
          stats,
        };
      })
    );

    res.json({ integrations: integrationsWithStats });
  } catch (error: any) {
    logger.error("Error fetching integrations", { error: error.message });
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

/**
 * @swagger
 * /api/integrations/slack:
 *   post:
 *     summary: Create Slack integration
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.post("/slack", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = createSlackIntegrationSchema.parse(req.body);

    // Check if Slack integration already exists for this tenant
    const existing = await pool.query(
      `SELECT id FROM integrations WHERE tenant_id = $1 AND type = 'slack'`,
      [tenantId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Slack integration already exists for this tenant" });
    }

    const result = await pool.query(
      `INSERT INTO integrations
       (tenant_id, type, webhook_url, channel_name, notification_types, enabled)
       VALUES ($1, 'slack', $2, $3, $4, true)
       RETURNING *`,
      [tenantId, data.webhookUrl, data.channelName, data.notificationTypes]
    );

    await auditLog(
      tenantId,
      userId,
      "integration.created",
      "integration",
      result.rows[0].id
    );

    logger.info("Slack integration created", {
      tenantId,
      integrationId: result.rows[0].id,
    });

    res.status(201).json({ integration: result.rows[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error("Error creating Slack integration", { error: error.message });
    res.status(500).json({ error: "Failed to create Slack integration" });
  }
});

/**
 * @swagger
 * /api/integrations/teams:
 *   post:
 *     summary: Create Microsoft Teams integration
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.post("/teams", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = createTeamsIntegrationSchema.parse(req.body);

    // Check if Teams integration already exists for this tenant
    const existing = await pool.query(
      `SELECT id FROM integrations WHERE tenant_id = $1 AND type = 'teams'`,
      [tenantId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Teams integration already exists for this tenant" });
    }

    const result = await pool.query(
      `INSERT INTO integrations
       (tenant_id, type, webhook_url, channel_name, notification_types, enabled)
       VALUES ($1, 'teams', $2, $3, $4, true)
       RETURNING *`,
      [tenantId, data.webhookUrl, data.channelName, data.notificationTypes]
    );

    await auditLog(
      tenantId,
      userId,
      "integration.created",
      "integration",
      result.rows[0].id
    );

    logger.info("Teams integration created", {
      tenantId,
      integrationId: result.rows[0].id,
    });

    res.status(201).json({ integration: result.rows[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error("Error creating Teams integration", { error: error.message });
    res.status(500).json({ error: "Failed to create Teams integration" });
  }
});

/**
 * @swagger
 * /api/integrations/{id}:
 *   patch:
 *     summary: Update integration
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.patch("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const data = updateIntegrationSchema.parse(req.body);

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.channelName !== undefined) {
      updates.push(`channel_name = $${paramIndex}`);
      values.push(data.channelName);
      paramIndex++;
    }

    if (data.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex}`);
      values.push(data.enabled);
      paramIndex++;
    }

    if (data.notificationTypes !== undefined) {
      updates.push(`notification_types = $${paramIndex}`);
      values.push(data.notificationTypes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    values.push(id, tenantId);

    const result = await pool.query(
      `UPDATE integrations
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }

    await auditLog(
      tenantId,
      userId,
      "integration.updated",
      "integration",
      id!
    );

    logger.info("Integration updated", { tenantId, integrationId: id });

    res.json({ integration: result.rows[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error("Error updating integration", { error: error.message });
    res.status(500).json({ error: "Failed to update integration" });
  }
});

/**
 * @swagger
 * /api/integrations/{id}:
 *   delete:
 *     summary: Delete integration
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM integrations
       WHERE id = $1 AND tenant_id = $2
       RETURNING type`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }

    await auditLog(
      tenantId,
      userId,
      "integration.deleted",
      "integration",
      id!
    );

    logger.info("Integration deleted", { tenantId, integrationId: id });

    res.json({ message: "Integration deleted successfully" });
  } catch (error: any) {
    logger.error("Error deleting integration", { error: error.message });
    res.status(500).json({ error: "Failed to delete integration" });
  }
});

/**
 * @swagger
 * /api/integrations/{id}/test:
 *   post:
 *     summary: Test integration connection
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.post("/:id/test", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const result = await notificationService.testIntegration(id!, tenantId);

    if (result.success) {
      res.json({ message: "Test notification sent successfully" });
    } else {
      res.status(400).json({ error: result.error || "Test failed" });
    }
  } catch (error: any) {
    logger.error("Error testing integration", { error: error.message });
    res.status(500).json({ error: "Failed to test integration" });
  }
});

/**
 * @swagger
 * /api/integrations/logs:
 *   get:
 *     summary: Get notification logs
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.get("/logs", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { integrationId, success, limit, offset } = req.query;

    const options: any = {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    if (integrationId) {
      options.integrationId = integrationId as string;
    }

    if (success !== undefined) {
      options.success = success === "true";
    }

    const result = await notificationService.getNotificationLogs(tenantId, options);

    res.json(result);
  } catch (error: any) {
    logger.error("Error fetching notification logs", { error: error.message });
    res.status(500).json({ error: "Failed to fetch notification logs" });
  }
});

/**
 * @swagger
 * /api/integrations/stats:
 *   get:
 *     summary: Get integration statistics
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 */
router.get("/stats", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { integrationId } = req.query;

    const stats = await notificationService.getIntegrationStats(
      tenantId,
      integrationId as string | undefined
    );

    res.json({ stats });
  } catch (error: any) {
    logger.error("Error fetching integration stats", { error: error.message });
    res.status(500).json({ error: "Failed to fetch integration stats" });
  }
});

export const integrationsRouter = router;
