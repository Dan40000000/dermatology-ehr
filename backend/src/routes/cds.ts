import express from "express";
import { clinicalDecisionSupportService } from "../services/clinicalDecisionSupport";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

const router = express.Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logCdsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * Clinical Decision Support Routes
 *
 * Intelligent clinical alerts and recommendations
 */

// POST /api/cds/check/:patientId - Run CDS checks for a patient
router.post(
  "/check/:patientId",
  requireAuth,
  requireRoles(["provider", "ma", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const { encounterId } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Verify patient exists
      const patientCheck = await pool.query(
        `select id from patients where id = $1 and tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: "Patient not found" });
      }

      // Run CDS checks
      const alerts = await clinicalDecisionSupportService.runCDSChecks({
        patientId: patientId!,
        encounterId: encounterId || undefined,
        tenantId,
      });

      await auditLog(tenantId, userId, "cds_check", "patient", patientId!);

      res.json({
        alerts,
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
        warningAlerts: alerts.filter((a) => a.severity === "warning").length,
        infoAlerts: alerts.filter((a) => a.severity === "info").length,
      });
    } catch (error) {
      logCdsError("CDS check error:", error);
      res.status(500).json({ error: "Failed to run CDS checks" });
    }
  }
);

// GET /api/cds/alerts/:patientId - Get active alerts for a patient
router.get("/alerts/:patientId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const alerts = await clinicalDecisionSupportService.getPatientAlerts(
      patientId!,
      tenantId
    );

    res.json({
      alerts,
      total: alerts.length,
    });
  } catch (error) {
    logCdsError("Get patient alerts error:", error);
    res.status(500).json({ error: "Failed to retrieve alerts" });
  }
});

// GET /api/cds/alerts - Get all active alerts for the tenant
router.get("/alerts", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { severity, actionRequired } = req.query;

    let query = `
      select
        a.id,
        a.patient_id as "patientId",
        a.alert_type as "alertType",
        a.severity,
        a.title,
        a.description,
        a.action_required as "actionRequired",
        a.created_at as "createdAt",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName"
      from cds_alerts a
      join patients p on p.id = a.patient_id
      where a.tenant_id = $1 and a.dismissed = false
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (severity) {
      query += ` and a.severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (actionRequired !== undefined) {
      query += ` and a.action_required = $${paramIndex}`;
      params.push(actionRequired === "true");
      paramIndex++;
    }

    query += ` order by
      case a.severity
        when 'critical' then 1
        when 'warning' then 2
        when 'info' then 3
      end,
      a.created_at desc
      limit 100`;

    const result = await pool.query(query, params);

    res.json({
      alerts: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    logCdsError("Get alerts error:", error);
    res.status(500).json({ error: "Failed to retrieve alerts" });
  }
});

// POST /api/cds/alerts/:alertId/dismiss - Dismiss an alert
router.post(
  "/alerts/:alertId/dismiss",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { alertId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      await clinicalDecisionSupportService.dismissAlert(alertId!, userId, tenantId);

      await auditLog(tenantId, userId, "cds_alert_dismiss", "cds_alert", alertId!);

      res.json({ success: true });
    } catch (error) {
      logCdsError("Dismiss alert error:", error);
      res.status(500).json({ error: "Failed to dismiss alert" });
    }
  }
);

// GET /api/cds/stats - Get CDS statistics
router.get("/stats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const stats = await pool.query(
      `select
        count(*) as "totalAlerts",
        count(*) filter (where dismissed = false) as "activeAlerts",
        count(*) filter (where severity = 'critical' and dismissed = false) as "criticalAlerts",
        count(*) filter (where severity = 'warning' and dismissed = false) as "warningAlerts",
        count(*) filter (where action_required = true and dismissed = false) as "actionRequiredAlerts",
        count(distinct patient_id) as "patientsWithAlerts"
       from cds_alerts
       where tenant_id = $1`,
      [tenantId]
    );

    res.json(stats.rows[0]);
  } catch (error) {
    logCdsError("Get CDS stats error:", error);
    res.status(500).json({ error: "Failed to retrieve statistics" });
  }
});

// POST /api/cds/batch-check - Run CDS checks for multiple patients
router.post(
  "/batch-check",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { patientIds } = req.body;
      const tenantId = req.user!.tenantId;

      if (!Array.isArray(patientIds) || patientIds.length === 0) {
        return res.status(400).json({ error: "patientIds array is required" });
      }

      if (patientIds.length > 100) {
        return res.status(400).json({ error: "Maximum 100 patients per batch" });
      }

      const results = [];

      for (const patientId of patientIds) {
        try {
          const alerts = await clinicalDecisionSupportService.runCDSChecks({
            patientId,
            tenantId,
          });
          results.push({
            patientId,
            alertCount: alerts.length,
            success: true,
          });
        } catch (error) {
          results.push({
            patientId,
            alertCount: 0,
            success: false,
            error: "Failed to run checks",
          });
        }
      }

      res.json({
        results,
        totalPatients: patientIds.length,
        successCount: results.filter((r) => r.success).length,
      });
    } catch (error) {
      logCdsError("Batch CDS check error:", error);
      res.status(500).json({ error: "Failed to run batch CDS checks" });
    }
  }
);

export default router;
