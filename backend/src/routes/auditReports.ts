import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { createAuditLog } from "../services/audit";
import {
  generateAccessReport,
  generateChangeReport,
  detectSuspiciousActivity,
  getPatientAccessHistory,
  getUserActivitySummary,
  createReportTemplate,
  getReportTemplates,
  getReportTemplate,
  scheduleReport,
  generateReport,
  getReportRun,
  getReportRuns,
  getSuspiciousActivities,
  reviewSuspiciousActivity,
  logSuspiciousActivity,
  type DateRange,
  type AccessReportFilters,
  type ChangeReportFilters
} from "../services/auditReportService";

export const auditReportsRouter = Router();

// ============================================================================
// Access Log Queries
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/access:
 *   get:
 *     summary: Query PHI access logs
 *     description: Retrieve logs of who accessed what patient records. Admin or compliance officer only.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of date range
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of date range
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Filter by patient ID
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *         description: Filter by IP address
 *     responses:
 *       200:
 *         description: Access log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rows:
 *                   type: array
 *                 total:
 *                   type: integer
 *       400:
 *         description: Missing required date range parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or compliance officer role required
 */
auditReportsRouter.get(
  "/access",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { startDate, endDate, userId, patientId, resourceType, accessType, ipAddress } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const dateRange: DateRange = {
        startDate: startDate as string,
        endDate: endDate as string
      };

      const filters: AccessReportFilters = {
        userId: userId as string | undefined,
        patientId: patientId as string | undefined,
        resourceType: resourceType as string | undefined,
        accessType: accessType as string | undefined,
        ipAddress: ipAddress as string | undefined
      };

      const result = await generateAccessReport(tenantId, dateRange, filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching access logs:", error);
      res.status(500).json({ error: "Failed to fetch access logs" });
    }
  }
);

// ============================================================================
// Change Log Queries
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/changes:
 *   get:
 *     summary: Query change logs
 *     description: Retrieve logs of modifications to clinical documentation and other records.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type (patient, encounter, prescription, etc.)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [create, update, delete]
 *     responses:
 *       200:
 *         description: Change log entries
 *       400:
 *         description: Missing required parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
auditReportsRouter.get(
  "/changes",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { startDate, endDate, entityType, userId, entityId, action } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const dateRange: DateRange = {
        startDate: startDate as string,
        endDate: endDate as string
      };

      const filters: ChangeReportFilters = {
        userId: userId as string | undefined,
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
        action: action as string | undefined
      };

      const result = await generateChangeReport(tenantId, dateRange, entityType as string | undefined, filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching change logs:", error);
      res.status(500).json({ error: "Failed to fetch change logs" });
    }
  }
);

// ============================================================================
// Patient Access History
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/patient/{patientId}:
 *   get:
 *     summary: Get patient access history
 *     description: Retrieve all access to a specific patient's records. Required for HIPAA accounting of disclosures.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Patient access history
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
auditReportsRouter.get(
  "/patient/:patientId",
  requireAuth,
  requireRoles(["admin", "compliance_officer", "provider"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;
      const { startDate, endDate, limit, offset } = req.query;

      const result = await getPatientAccessHistory(tenantId, patientId as string, {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined
      });

      // Log this access query itself
      await createAuditLog({
        tenantId,
        userId: req.user!.id,
        action: "view",
        resourceType: "patient_access_history",
        resourceId: patientId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        severity: "info",
        status: "success"
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching patient access history:", error);
      res.status(500).json({ error: "Failed to fetch patient access history" });
    }
  }
);

// ============================================================================
// User Activity
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/user/{userId}:
 *   get:
 *     summary: Get user activity summary
 *     description: Retrieve comprehensive activity summary for a specific user.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: User activity summary
 *       400:
 *         description: Missing required parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
auditReportsRouter.get(
  "/user/:userId",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const dateRange: DateRange = {
        startDate: startDate as string,
        endDate: endDate as string
      };

      const result = await getUserActivitySummary(tenantId, userId as string, dateRange);
      res.json(result);
    } catch (error) {
      console.error("Error fetching user activity:", error);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/user/{userId}/suspicious:
 *   get:
 *     summary: Detect suspicious activity for a user
 *     description: Run anomaly detection algorithms on a user's recent activity.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suspicious activity detection results
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
auditReportsRouter.get(
  "/user/:userId/suspicious",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { userId } = req.params;

      const result = await detectSuspiciousActivity(tenantId, userId as string);
      res.json(result);
    } catch (error) {
      console.error("Error detecting suspicious activity:", error);
      res.status(500).json({ error: "Failed to detect suspicious activity" });
    }
  }
);

// ============================================================================
// Report Templates
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/templates:
 *   get:
 *     summary: List report templates
 *     description: Get all audit report templates for the tenant.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [access, changes, phi, security, login, prescription, export]
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: List of report templates
 */
auditReportsRouter.get(
  "/templates",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { reportType, activeOnly } = req.query;

      const templates = await getReportTemplates(tenantId, {
        reportType: reportType as string | undefined,
        activeOnly: activeOnly !== "false"
      });

      res.json({ templates });
    } catch (error) {
      console.error("Error fetching report templates:", error);
      res.status(500).json({ error: "Failed to fetch report templates" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/templates:
 *   post:
 *     summary: Create a report template
 *     description: Create a new audit report template.
 *     tags:
 *       - Audit Reports
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
 *               - name
 *               - reportType
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [access, changes, phi, security, login, prescription, export]
 *               filters:
 *                 type: object
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *               scheduleCron:
 *                 type: string
 *               scheduleEnabled:
 *                 type: boolean
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Created template
 *       400:
 *         description: Invalid request body
 */
auditReportsRouter.post(
  "/templates",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { name, description, reportType, filters, columns, scheduleCron, scheduleEnabled, recipients } = req.body;

      if (!name || !reportType) {
        return res.status(400).json({ error: "name and reportType are required" });
      }

      const template = await createReportTemplate(tenantId, userId, {
        name,
        description,
        reportType,
        filters: filters ?? {},
        columns: columns ?? ["timestamp", "user", "action", "resource", "status"],
        scheduleCron,
        scheduleEnabled: scheduleEnabled ?? false,
        recipients: recipients ?? [],
        isActive: true
      });

      res.status(201).json({ template });
    } catch (error) {
      console.error("Error creating report template:", error);
      res.status(500).json({ error: "Failed to create report template" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/templates/{templateId}:
 *   get:
 *     summary: Get a specific report template
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report template
 *       404:
 *         description: Template not found
 */
auditReportsRouter.get(
  "/templates/:templateId",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { templateId } = req.params;

      const template = await getReportTemplate(tenantId, templateId as string);

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json({ template });
    } catch (error) {
      console.error("Error fetching report template:", error);
      res.status(500).json({ error: "Failed to fetch report template" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/templates/{templateId}/schedule:
 *   post:
 *     summary: Schedule a report template
 *     description: Enable or update the schedule for a report template.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cronExpression
 *             properties:
 *               cronExpression:
 *                 type: string
 *                 description: Cron expression (e.g., "0 8 * * 1" for Monday 8am)
 *     responses:
 *       200:
 *         description: Schedule updated
 *       400:
 *         description: Invalid cron expression
 */
auditReportsRouter.post(
  "/templates/:templateId/schedule",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { templateId } = req.params;
      const { cronExpression } = req.body;

      if (!cronExpression) {
        return res.status(400).json({ error: "cronExpression is required" });
      }

      await scheduleReport(tenantId, templateId as string, cronExpression);
      res.json({ message: "Schedule updated successfully" });
    } catch (error) {
      console.error("Error scheduling report:", error);
      res.status(500).json({ error: "Failed to schedule report" });
    }
  }
);

// ============================================================================
// Report Generation
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/generate:
 *   post:
 *     summary: Generate an audit report
 *     description: Generate a report from a template with specified date range.
 *     tags:
 *       - Audit Reports
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
 *               - templateId
 *               - startDate
 *               - endDate
 *             properties:
 *               templateId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Report run details
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Template not found
 */
auditReportsRouter.post(
  "/generate",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { templateId, startDate, endDate } = req.body;

      if (!templateId || !startDate || !endDate) {
        return res.status(400).json({ error: "templateId, startDate, and endDate are required" });
      }

      const dateRange: DateRange = { startDate, endDate };
      const run = await generateReport(tenantId, templateId, userId, dateRange);

      res.json({ run });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/runs:
 *   get:
 *     summary: List report runs
 *     description: Get history of report generations.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of report runs
 */
auditReportsRouter.get(
  "/runs",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { templateId, limit, offset } = req.query;

      const result = await getReportRuns(tenantId, {
        templateId: templateId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching report runs:", error);
      res.status(500).json({ error: "Failed to fetch report runs" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/runs/{runId}:
 *   get:
 *     summary: Get a specific report run
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report run details
 *       404:
 *         description: Report run not found
 */
auditReportsRouter.get(
  "/runs/:runId",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { runId } = req.params;

      const run = await getReportRun(tenantId, runId as string);

      if (!run) {
        return res.status(404).json({ error: "Report run not found" });
      }

      res.json({ run });
    } catch (error) {
      console.error("Error fetching report run:", error);
      res.status(500).json({ error: "Failed to fetch report run" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/runs/{runId}/download:
 *   get:
 *     summary: Download a generated report
 *     description: Download the generated report file.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Report not found or not ready
 */
auditReportsRouter.get(
  "/runs/:runId/download",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { runId } = req.params;

      const run = await getReportRun(tenantId, runId as string);

      if (!run) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (run.status !== "completed") {
        return res.status(400).json({ error: "Report is not ready for download" });
      }

      // Log the download
      await createAuditLog({
        tenantId,
        userId: req.user!.id,
        action: "download",
        resourceType: "audit_report",
        resourceId: runId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        severity: "warning",
        status: "success"
      });

      // In a real implementation, we would fetch the file from S3 or local storage
      // For now, we'll regenerate the report data
      const template = run.templateId ? await getReportTemplate(tenantId, run.templateId) : null;

      if (!template || !run.dateRangeStart || !run.dateRangeEnd) {
        return res.status(400).json({ error: "Cannot regenerate report" });
      }

      const dateRange: DateRange = {
        startDate: run.dateRangeStart,
        endDate: run.dateRangeEnd
      };

      let result: { rows: Record<string, unknown>[]; total: number };
      switch (template.reportType) {
        case "access":
        case "phi":
          result = await generateAccessReport(tenantId, dateRange, template.filters as AccessReportFilters);
          break;
        case "changes":
          result = await generateChangeReport(
            tenantId,
            dateRange,
            template.filters.entityType as string | undefined,
            template.filters as ChangeReportFilters
          );
          break;
        default:
          result = await generateAccessReport(tenantId, dateRange);
      }

      // Generate CSV
      const headers = template.columns.length > 0 ? template.columns : Object.keys(result.rows[0] ?? {});
      const csvLines = [headers.join(",")];

      for (const row of result.rows) {
        const values = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvLines.push(values.join(","));
      }

      const csv = csvLines.join("\n");
      const filename = `Audit_Report_${run.templateName?.replace(/\s+/g, "_") ?? "report"}_${run.runDate.split("T")[0]}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error downloading report:", error);
      res.status(500).json({ error: "Failed to download report" });
    }
  }
);

// ============================================================================
// Suspicious Activity
// ============================================================================

/**
 * @swagger
 * /api/audit-reports/suspicious:
 *   get:
 *     summary: List suspicious activities
 *     description: Get all flagged suspicious activities.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: activityType
 *         schema:
 *           type: string
 *       - in: query
 *         name: reviewed
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: minRiskScore
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of suspicious activities
 */
auditReportsRouter.get(
  "/suspicious",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { userId, activityType, reviewed, minRiskScore, limit, offset } = req.query;

      const result = await getSuspiciousActivities(tenantId, {
        userId: userId as string | undefined,
        activityType: activityType as string | undefined,
        reviewed: reviewed !== undefined ? reviewed === "true" : undefined,
        minRiskScore: minRiskScore ? parseInt(minRiskScore as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching suspicious activities:", error);
      res.status(500).json({ error: "Failed to fetch suspicious activities" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/suspicious:
 *   post:
 *     summary: Log a suspicious activity
 *     description: Manually log a suspicious activity for investigation.
 *     tags:
 *       - Audit Reports
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
 *               - activityType
 *               - riskScore
 *             properties:
 *               userId:
 *                 type: string
 *               activityType:
 *                 type: string
 *               riskScore:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *               details:
 *                 type: object
 *               ipAddress:
 *                 type: string
 *               relatedAuditIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               relatedPatientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Created suspicious activity record
 *       400:
 *         description: Invalid request
 */
auditReportsRouter.post(
  "/suspicious",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const {
        userId,
        activityType,
        riskScore,
        details,
        ipAddress,
        userAgent,
        relatedAuditIds,
        relatedPatientIds,
        requiresFollowUp,
        followUpDueDate
      } = req.body;

      if (!activityType || riskScore === undefined) {
        return res.status(400).json({ error: "activityType and riskScore are required" });
      }

      if (riskScore < 1 || riskScore > 100) {
        return res.status(400).json({ error: "riskScore must be between 1 and 100" });
      }

      const activity = await logSuspiciousActivity(tenantId, {
        userId,
        activityType,
        riskScore,
        details: details ?? {},
        ipAddress,
        userAgent,
        relatedAuditIds,
        relatedPatientIds,
        detectionMethod: "manual",
        requiresFollowUp: requiresFollowUp ?? false,
        followUpDueDate
      });

      res.status(201).json({ activity });
    } catch (error) {
      console.error("Error logging suspicious activity:", error);
      res.status(500).json({ error: "Failed to log suspicious activity" });
    }
  }
);

/**
 * @swagger
 * /api/audit-reports/suspicious/{activityId}/review:
 *   post:
 *     summary: Review a suspicious activity
 *     description: Mark a suspicious activity as reviewed and record the action taken.
 *     tags:
 *       - Audit Reports
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: activityId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actionTaken
 *             properties:
 *               actionTaken:
 *                 type: string
 *                 enum: [dismissed, acknowledged, user_notified, account_locked, session_terminated, reported_externally, escalated, under_investigation]
 *               reviewNotes:
 *                 type: string
 *               requiresFollowUp:
 *                 type: boolean
 *               followUpDueDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Updated suspicious activity
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Activity not found
 */
auditReportsRouter.post(
  "/suspicious/:activityId/review",
  requireAuth,
  requireRoles(["admin", "compliance_officer"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { activityId } = req.params;
      const { actionTaken, reviewNotes, requiresFollowUp, followUpDueDate } = req.body;

      if (!actionTaken) {
        return res.status(400).json({ error: "actionTaken is required" });
      }

      const activity = await reviewSuspiciousActivity(tenantId, activityId as string, req.user!.id, {
        actionTaken,
        reviewNotes,
        requiresFollowUp,
        followUpDueDate
      });

      if (!activity) {
        return res.status(404).json({ error: "Suspicious activity not found" });
      }

      res.json({ activity });
    } catch (error) {
      console.error("Error reviewing suspicious activity:", error);
      res.status(500).json({ error: "Failed to review suspicious activity" });
    }
  }
);

export default auditReportsRouter;
