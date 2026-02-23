import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { createAuditLog } from "../services/audit";
import { getAuditSchemaInfo } from "../services/auditSchema";
import { logger } from "../lib/logger";

// Comprehensive audit log routes for HIPAA compliance
export const auditRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logAuditRoutesError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * @swagger
 * /api/audit/appointments:
 *   get:
 *     summary: Get appointment status history
 *     description: Retrieve appointment status change history for audit purposes. Admin only.
 *     tags:
 *       - Audit
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Appointment status history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       appointmentId:
 *                         type: string
 *                         format: uuid
 *                       status:
 *                         type: string
 *                       changedBy:
 *                         type: string
 *                         format: uuid
 *                       changedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
auditRouter.get("/appointments", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select ash.id, ash.appointment_id as "appointmentId", ash.status, ash.changed_by as "changedBy", ash.changed_at as "changedAt"
     from appointment_status_history ash
     join appointments a on a.id = ash.appointment_id
     where ash.tenant_id = $1
     order by ash.changed_at desc
     limit 100`,
    [tenantId],
  );
  res.json({ history: result.rows });
});

/**
 * @swagger
 * /api/audit/log:
 *   get:
 *     summary: Get basic audit log
 *     description: Retrieve basic audit log entries (limited to 200). Admin only.
 *     tags:
 *       - Audit
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 audit:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
auditRouter.get("/log", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { columnMap } = await getAuditSchemaInfo();
  const result = await pool.query(
    `select id,
            ${columnMap.userId ? columnMap.userId : "NULL"} as "userId",
            action,
            ${columnMap.resourceType ? columnMap.resourceType : "NULL"} as "resourceType",
            ${columnMap.resourceId ? columnMap.resourceId : "NULL"} as "resourceId",
            created_at as "createdAt"
     from audit_log where tenant_id = $1 order by created_at desc limit 200`,
    [tenantId],
  );
  res.json({ audit: result.rows });
});

/**
 * @swagger
 * /api/audit:
 *   get:
 *     summary: Get detailed audit log
 *     description: Retrieve comprehensive audit log with advanced filtering options for HIPAA compliance. Admin or compliance officer only.
 *     tags:
 *       - Audit
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *         description: Filter by resource ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *         description: Filter by IP address
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *         description: Filter by severity level
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search across multiple fields
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Detailed audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auditLogs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin or compliance officer role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to retrieve audit log
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
auditRouter.get("/", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      userId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      ipAddress,
      severity,
      status,
      limit = "50",
      offset = "0",
      search,
    } = req.query;
    const { columnMap } = await getAuditSchemaInfo();

    // Build dynamic query against either enhanced or legacy audit schema
    const conditions: string[] = ["al.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (userId && columnMap.userId) {
      paramCount++;
      conditions.push(`al.${columnMap.userId} = $${paramCount}`);
      params.push(userId);
    }

    if (action) {
      paramCount++;
      conditions.push(`al.action = $${paramCount}`);
      params.push(action);
    }

    if (resourceType && columnMap.resourceType) {
      paramCount++;
      conditions.push(`al.${columnMap.resourceType} = $${paramCount}`);
      params.push(resourceType);
    }

    if (resourceId && columnMap.resourceId) {
      paramCount++;
      conditions.push(`al.${columnMap.resourceId} = $${paramCount}`);
      params.push(resourceId);
    }

    if (startDate) {
      paramCount++;
      conditions.push(`al.created_at >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      conditions.push(`al.created_at <= $${paramCount}`);
      params.push(endDate);
    }

    if (ipAddress && columnMap.ipAddress) {
      paramCount++;
      conditions.push(`al.${columnMap.ipAddress}::text = $${paramCount}`);
      params.push(ipAddress);
    }

    if (severity && columnMap.severity) {
      paramCount++;
      conditions.push(`al.${columnMap.severity} = $${paramCount}`);
      params.push(severity);
    }

    if (status && columnMap.status) {
      paramCount++;
      conditions.push(`al.${columnMap.status} = $${paramCount}`);
      params.push(status);
    }

    if (search) {
      paramCount++;
      const searchClauses: string[] = [`al.action ILIKE $${paramCount}`];
      if (columnMap.resourceType) {
        searchClauses.push(`al.${columnMap.resourceType} ILIKE $${paramCount}`);
      }
      if (columnMap.resourceId) {
        searchClauses.push(`al.${columnMap.resourceId} ILIKE $${paramCount}`);
      }
      if (columnMap.ipAddress) {
        searchClauses.push(`al.${columnMap.ipAddress}::text ILIKE $${paramCount}`);
      }
      conditions.push(`(${searchClauses.join(" OR ")})`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(" AND ");
    const userIdExpr = columnMap.userId ? `al.${columnMap.userId}` : "NULL";
    const resourceTypeExpr = columnMap.resourceType ? `al.${columnMap.resourceType}` : "NULL";
    const resourceIdExpr = columnMap.resourceId ? `al.${columnMap.resourceId}` : "NULL";
    const ipAddressExpr = columnMap.ipAddress ? `al.${columnMap.ipAddress}::text` : "NULL";
    const userAgentExpr = columnMap.userAgent ? `al.${columnMap.userAgent}` : "NULL";
    const changesExpr = columnMap.changes ? `al.${columnMap.changes}` : "NULL::jsonb";
    const metadataExpr = columnMap.metadata ? `al.${columnMap.metadata}` : "NULL::jsonb";
    const severityExpr = columnMap.severity ? `al.${columnMap.severity}` : "'info'";
    const statusExpr = columnMap.status ? `al.${columnMap.status}` : "'success'";
    const usersJoin = columnMap.userId ? `al.${columnMap.userId} = u.id` : "FALSE";

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_log al WHERE ${whereClause}`,
      params,
    );

    // Get paginated results with user info
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const result = await pool.query(
      `SELECT
        al.id,
        al.tenant_id as "tenantId",
        ${userIdExpr} as "userId",
        u.full_name as "userName",
        u.email as "userEmail",
        al.action,
        ${resourceTypeExpr} as "resourceType",
        ${resourceIdExpr} as "resourceId",
        ${ipAddressExpr} as "ipAddress",
        ${userAgentExpr} as "userAgent",
        ${changesExpr} as "changes",
        ${metadataExpr} as "metadata",
        ${severityExpr} as "severity",
        ${statusExpr} as "status",
        al.created_at as "createdAt"
      FROM audit_log al
      LEFT JOIN users u ON ${usersJoin}
      WHERE ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, parseInt(limit as string, 10), parseInt(offset as string, 10)],
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error: any) {
    logAuditRoutesError("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// User activity timeline
auditRouter.get("/user/:userId", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { userId } = req.params;
    const { startDate, endDate, limit = "100" } = req.query;
    const { columnMap } = await getAuditSchemaInfo();

    if (!columnMap.userId) {
      return res.json({ logs: [] });
    }

    const conditions: string[] = ["al.tenant_id = $1", `al.${columnMap.userId} = $2`];
    const params: any[] = [tenantId, userId];
    let paramCount = 2;

    if (startDate) {
      paramCount++;
      conditions.push(`al.created_at >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      conditions.push(`al.created_at <= $${paramCount}`);
      params.push(endDate);
    }

    paramCount++;
    const limitParam = paramCount;

    const result = await pool.query(
      `SELECT
        al.id,
        al.action,
        ${columnMap.resourceType ? `al.${columnMap.resourceType}` : "NULL"} as "resourceType",
        ${columnMap.resourceId ? `al.${columnMap.resourceId}` : "NULL"} as "resourceId",
        ${columnMap.ipAddress ? `al.${columnMap.ipAddress}::text` : "NULL"} as "ipAddress",
        ${columnMap.severity ? `al.${columnMap.severity}` : "'info'"} as "severity",
        ${columnMap.status ? `al.${columnMap.status}` : "'success'"} as "status",
        al.created_at as "createdAt"
      FROM audit_log al
      WHERE ${conditions.join(" AND ")}
      ORDER BY al.created_at DESC
      LIMIT $${limitParam}`,
      [...params, parseInt(limit as string, 10)],
    );

    res.json({ logs: result.rows });
  } catch (error: any) {
    logAuditRoutesError("Error fetching user activity:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

// Resource access log
auditRouter.get("/resource/:type/:id", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { type, id } = req.params;
    const { limit = "100" } = req.query;
    const { columnMap } = await getAuditSchemaInfo();

    if (!columnMap.resourceType || !columnMap.resourceId) {
      return res.json({ logs: [] });
    }

    const result = await pool.query(
      `SELECT
        al.id,
        ${columnMap.userId ? `al.${columnMap.userId}` : "NULL"} as "userId",
        u.full_name as "userName",
        u.email as "userEmail",
        al.action,
        ${columnMap.ipAddress ? `al.${columnMap.ipAddress}::text` : "NULL"} as "ipAddress",
        ${columnMap.severity ? `al.${columnMap.severity}` : "'info'"} as "severity",
        ${columnMap.status ? `al.${columnMap.status}` : "'success'"} as "status",
        al.created_at as "createdAt"
      FROM audit_log al
      LEFT JOIN users u ON ${columnMap.userId ? `al.${columnMap.userId} = u.id` : "FALSE"}
      WHERE al.tenant_id = $1
        AND al.${columnMap.resourceType} = $2
        AND al.${columnMap.resourceId} = $3
      ORDER BY al.created_at DESC
      LIMIT $4`,
      [tenantId, type, id, parseInt(limit as string, 10)],
    );

    res.json({ logs: result.rows });
  } catch (error: any) {
    logAuditRoutesError("Error fetching resource access log:", error);
    res.status(500).json({ error: "Failed to fetch resource access log" });
  }
});

// Audit summary statistics
auditRouter.get("/summary", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { columnMap } = await getAuditSchemaInfo();

    // Total events today
    const totalResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, today],
    );

    // Unique users today
    const usersResult = columnMap.userId
      ? await pool.query(
          `SELECT COUNT(DISTINCT ${columnMap.userId}) as count FROM audit_log
           WHERE tenant_id = $1 AND created_at >= $2 AND ${columnMap.userId} IS NOT NULL`,
          [tenantId, today],
        )
      : { rows: [{ count: "0" }] };

    // Failed logins today
    const failedLoginsResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2
       AND action = 'failed_login'`,
      [tenantId, today],
    );

    // Resource accesses today
    const accessesResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2
       AND action IN ('view', 'download', 'export')`,
      [tenantId, today],
    );

    // Action breakdown
    const actionsResult = await pool.query(
      `SELECT action, COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, today],
    );

    // Resource type breakdown
    const resourcesResult = columnMap.resourceType
      ? await pool.query(
          `SELECT ${columnMap.resourceType} as "resourceType", COUNT(*) as count FROM audit_log
           WHERE tenant_id = $1 AND created_at >= $2
           GROUP BY ${columnMap.resourceType}
           ORDER BY count DESC
           LIMIT 10`,
          [tenantId, today],
        )
      : { rows: [] as Array<{ resourceType: string; count: string }> };

    res.json({
      totalEvents: parseInt(totalResult.rows[0].count, 10),
      uniqueUsers: parseInt(usersResult.rows[0].count, 10),
      failedLogins: parseInt(failedLoginsResult.rows[0].count, 10),
      resourceAccesses: parseInt(accessesResult.rows[0].count, 10),
      actionBreakdown: actionsResult.rows,
      resourceBreakdown: resourcesResult.rows,
    });
  } catch (error: any) {
    logAuditRoutesError("Error fetching audit summary:", error);
    res.status(500).json({ error: "Failed to fetch audit summary" });
  }
});

// Export audit log (admin only)
auditRouter.post("/export", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
    const { filters } = req.body;
    const { columnMap } = await getAuditSchemaInfo();

    // Build query based on filters
    const conditions: string[] = ["al.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (filters?.userId && columnMap.userId) {
      paramCount++;
      conditions.push(`al.${columnMap.userId} = $${paramCount}`);
      params.push(filters.userId);
    }

    if (filters?.action) {
      paramCount++;
      conditions.push(`al.action = $${paramCount}`);
      params.push(filters.action);
    }

    if (filters?.resourceType && columnMap.resourceType) {
      paramCount++;
      conditions.push(`al.${columnMap.resourceType} = $${paramCount}`);
      params.push(filters.resourceType);
    }

    if (filters?.startDate) {
      paramCount++;
      conditions.push(`al.created_at >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      paramCount++;
      conditions.push(`al.created_at <= $${paramCount}`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.join(" AND ");

    const result = await pool.query(
      `SELECT
        al.id,
        ${columnMap.userId ? `al.${columnMap.userId}` : "NULL"} as "User ID",
        u.full_name as "User Name",
        u.email as "User Email",
        al.action as "Action",
        ${columnMap.resourceType ? `al.${columnMap.resourceType}` : "NULL"} as "Resource Type",
        ${columnMap.resourceId ? `al.${columnMap.resourceId}` : "NULL"} as "Resource ID",
        ${columnMap.ipAddress ? `al.${columnMap.ipAddress}::text` : "NULL"} as "IP Address",
        ${columnMap.severity ? `al.${columnMap.severity}` : "'info'"} as "Severity",
        ${columnMap.status ? `al.${columnMap.status}` : "'success'"} as "Status",
        al.created_at as "Timestamp"
      FROM audit_log al
      LEFT JOIN users u ON ${columnMap.userId ? `al.${columnMap.userId} = u.id` : "FALSE"}
      WHERE ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT 10000`,
      params,
    );

    // Generate CSV
    const rows = result.rows;
    if (rows.length === 0) {
      return res.status(404).json({ error: "No audit logs found for export" });
    }

    const headers = Object.keys(rows[0]).filter(k => k !== "id");
    const csvLines = [headers.join(",")];

    for (const row of rows) {
      const values = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        // Escape quotes and wrap in quotes if contains comma or quotes
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(","));
    }

    const csv = csvLines.join("\n");

    // Log the export action
    await createAuditLog({
      tenantId,
      userId,
      action: "export",
      resourceType: "audit_log",
      resourceId: "full_export",
      ipAddress,
      metadata: { recordCount: rows.length, filters },
      severity: "warning",
      status: "success",
    });

    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="Audit_Log_${date}.csv"`);
    res.send(csv);
  } catch (error: any) {
    logAuditRoutesError("Error exporting audit logs:", error);
    res.status(500).json({ error: "Failed to export audit logs" });
  }
});
