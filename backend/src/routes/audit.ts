import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { createAuditLog } from "../services/audit";

// Comprehensive audit log routes for HIPAA compliance
export const auditRouter = Router();

// Legacy appointment status history
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

// Legacy basic audit log
auditRouter.get("/log", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, user_id as "userId", action, resource_type as "resourceType",
            resource_id as "resourceId", created_at as "createdAt"
     from audit_log where tenant_id = $1 order by created_at desc limit 200`,
    [tenantId],
  );
  res.json({ audit: result.rows });
});

// Main audit log endpoint with advanced filtering
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

    // Build dynamic query
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (userId) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      params.push(userId);
    }

    if (action) {
      paramCount++;
      conditions.push(`action = $${paramCount}`);
      params.push(action);
    }

    if (resourceType) {
      paramCount++;
      conditions.push(`resource_type = $${paramCount}`);
      params.push(resourceType);
    }

    if (resourceId) {
      paramCount++;
      conditions.push(`resource_id = $${paramCount}`);
      params.push(resourceId);
    }

    if (startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      params.push(endDate);
    }

    if (ipAddress) {
      paramCount++;
      conditions.push(`ip_address = $${paramCount}`);
      params.push(ipAddress);
    }

    if (severity) {
      paramCount++;
      conditions.push(`severity = $${paramCount}`);
      params.push(severity);
    }

    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (search) {
      paramCount++;
      conditions.push(`(
        action ILIKE $${paramCount} OR
        resource_type ILIKE $${paramCount} OR
        resource_id ILIKE $${paramCount} OR
        ip_address ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`,
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
        al.user_id as "userId",
        u.full_name as "userName",
        u.email as "userEmail",
        al.action,
        al.resource_type as "resourceType",
        al.resource_id as "resourceId",
        al.ip_address as "ipAddress",
        al.user_agent as "userAgent",
        al.changes,
        al.metadata,
        al.severity,
        al.status,
        al.created_at as "createdAt"
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
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
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// User activity timeline
auditRouter.get("/user/:userId", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { userId } = req.params;
    const { startDate, endDate, limit = "100" } = req.query;

    const conditions: string[] = ["tenant_id = $1", "user_id = $2"];
    const params: any[] = [tenantId, userId];
    let paramCount = 2;

    if (startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      params.push(endDate);
    }

    paramCount++;
    const limitParam = paramCount;

    const result = await pool.query(
      `SELECT
        al.id,
        al.action,
        al.resource_type as "resourceType",
        al.resource_id as "resourceId",
        al.ip_address as "ipAddress",
        al.severity,
        al.status,
        al.created_at as "createdAt"
      FROM audit_log al
      WHERE ${conditions.join(" AND ")}
      ORDER BY al.created_at DESC
      LIMIT $${limitParam}`,
      [...params, parseInt(limit as string, 10)],
    );

    res.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

// Resource access log
auditRouter.get("/resource/:type/:id", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { type, id } = req.params;
    const { limit = "100" } = req.query;

    const result = await pool.query(
      `SELECT
        al.id,
        al.user_id as "userId",
        u.full_name as "userName",
        u.email as "userEmail",
        al.action,
        al.ip_address as "ipAddress",
        al.severity,
        al.status,
        al.created_at as "createdAt"
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = $1
        AND al.resource_type = $2
        AND al.resource_id = $3
      ORDER BY al.created_at DESC
      LIMIT $4`,
      [tenantId, type, id, parseInt(limit as string, 10)],
    );

    res.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching resource access log:", error);
    res.status(500).json({ error: "Failed to fetch resource access log" });
  }
});

// Audit summary statistics
auditRouter.get("/summary", requireAuth, requireRoles(["admin", "compliance_officer"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total events today
    const totalResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, today],
    );

    // Unique users today
    const usersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2 AND user_id IS NOT NULL`,
      [tenantId, today],
    );

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
    const resourcesResult = await pool.query(
      `SELECT resource_type as "resourceType", COUNT(*) as count FROM audit_log
       WHERE tenant_id = $1 AND created_at >= $2
       GROUP BY resource_type
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, today],
    );

    res.json({
      totalEvents: parseInt(totalResult.rows[0].count, 10),
      uniqueUsers: parseInt(usersResult.rows[0].count, 10),
      failedLogins: parseInt(failedLoginsResult.rows[0].count, 10),
      resourceAccesses: parseInt(accessesResult.rows[0].count, 10),
      actionBreakdown: actionsResult.rows,
      resourceBreakdown: resourcesResult.rows,
    });
  } catch (error: any) {
    console.error("Error fetching audit summary:", error);
    res.status(500).json({ error: "Failed to fetch audit summary" });
  }
});

// Export audit log (admin only)
auditRouter.post("/export", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
    const { filters } = req.body;

    // Build query based on filters
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (filters?.userId) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      params.push(filters.userId);
    }

    if (filters?.action) {
      paramCount++;
      conditions.push(`action = $${paramCount}`);
      params.push(filters.action);
    }

    if (filters?.resourceType) {
      paramCount++;
      conditions.push(`resource_type = $${paramCount}`);
      params.push(filters.resourceType);
    }

    if (filters?.startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.join(" AND ");

    const result = await pool.query(
      `SELECT
        al.id,
        al.user_id as "User ID",
        u.full_name as "User Name",
        u.email as "User Email",
        al.action as "Action",
        al.resource_type as "Resource Type",
        al.resource_id as "Resource ID",
        al.ip_address as "IP Address",
        al.severity as "Severity",
        al.status as "Status",
        al.created_at as "Timestamp"
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
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
    console.error("Error exporting audit logs:", error);
    res.status(500).json({ error: "Failed to export audit logs" });
  }
});
