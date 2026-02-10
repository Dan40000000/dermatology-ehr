import crypto from "crypto";
import { pool } from "../db/pool";
import { createAuditLog } from "./audit";

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AccessReportFilters {
  userId?: string;
  patientId?: string;
  resourceType?: string;
  accessType?: string;
  ipAddress?: string;
  includeBreakGlass?: boolean;
}

export interface ChangeReportFilters {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
}

export interface AuditReportTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  reportType: "access" | "changes" | "phi" | "security" | "login" | "prescription" | "export";
  filters: Record<string, unknown>;
  columns: string[];
  scheduleCron?: string;
  scheduleEnabled: boolean;
  recipients: string[];
  lastRunAt?: string;
  nextRunAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface AuditReportRun {
  id: string;
  tenantId: string;
  templateId?: string;
  templateName?: string;
  reportType: string;
  runDate: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  filtersApplied: Record<string, unknown>;
  generatedBy?: string;
  generatedByName?: string;
  rowCount: number;
  fileUrl?: string;
  fileSizeBytes?: number;
  fileFormat: string;
  status: "pending" | "processing" | "completed" | "failed" | "expired";
  errorMessage?: string;
  expiresAt?: string;
  checksum?: string;
  createdAt: string;
}

export interface SuspiciousActivity {
  id: string;
  tenantId: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  activityType: string;
  riskScore: number;
  riskLevel: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  relatedAuditIds?: string[];
  relatedPatientIds?: string[];
  detectedAt: string;
  detectionMethod?: string;
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  actionTaken?: string;
  requiresFollowUp: boolean;
  followUpDueDate?: string;
}

export interface UserActivitySummary {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  dateRange: DateRange;
  totalActions: number;
  uniquePatientsAccessed: number;
  documentsViewed: number;
  documentsExported: number;
  prescriptionsWritten: number;
  controlledRxWritten: number;
  failedLogins: number;
  afterHoursActions: number;
  topAccessedResources: Array<{ type: string; count: number }>;
  activityByDay: Array<{ date: string; count: number }>;
  suspiciousActivityCount: number;
}

export interface PatientAccessHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  accessType: string;
  resourceType: string;
  resourceId?: string;
  accessReason?: string;
  isBreakGlass: boolean;
  ipAddress?: string;
  accessedAt: string;
}

// ============================================================================
// Access Report Generation
// ============================================================================

export async function generateAccessReport(
  tenantId: string,
  dateRange: DateRange,
  filters: AccessReportFilters = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = ["al.tenant_id = $1", "al.created_at >= $2", "al.created_at <= $3"];
  const params: unknown[] = [tenantId, dateRange.startDate, dateRange.endDate];
  let paramCount = 3;

  // Filter by PHI-related actions
  conditions.push(`al.action IN ('view', 'patient_data_view', 'patient_data_export', 'download', 'export', 'print')`);

  if (filters.userId) {
    paramCount++;
    conditions.push(`al.user_id = $${paramCount}`);
    params.push(filters.userId);
  }

  if (filters.patientId) {
    paramCount++;
    conditions.push(`(al.resource_id = $${paramCount} OR al.metadata->>'patientId' = $${paramCount})`);
    params.push(filters.patientId);
  }

  if (filters.resourceType) {
    paramCount++;
    conditions.push(`al.resource_type = $${paramCount}`);
    params.push(filters.resourceType);
  }

  if (filters.ipAddress) {
    paramCount++;
    conditions.push(`al.ip_address = $${paramCount}`);
    params.push(filters.ipAddress);
  }

  const whereClause = conditions.join(" AND ");

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM audit_log al WHERE ${whereClause}`,
    params
  );

  // Get data with user info
  const dataResult = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      u.email as "userEmail",
      u.role as "userRole",
      al.action,
      al.resource_type as "resourceType",
      al.resource_id as "resourceId",
      al.ip_address as "ipAddress",
      al.user_agent as "userAgent",
      al.metadata,
      al.severity,
      al.created_at as "accessedAt",
      CASE WHEN al.metadata->>'phi_access' = 'true' THEN true ELSE false END as "isPHIAccess",
      CASE WHEN al.metadata->>'break_glass' = 'true' THEN true ELSE false END as "isBreakGlass"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT 10000`,
    params
  );

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10)
  };
}

// ============================================================================
// Change Report Generation
// ============================================================================

export async function generateChangeReport(
  tenantId: string,
  dateRange: DateRange,
  entityType?: string,
  filters: ChangeReportFilters = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = ["al.tenant_id = $1", "al.created_at >= $2", "al.created_at <= $3"];
  const params: unknown[] = [tenantId, dateRange.startDate, dateRange.endDate];
  let paramCount = 3;

  // Filter to modification actions
  conditions.push(`al.action IN ('create', 'update', 'delete', 'patch')`);

  if (entityType) {
    paramCount++;
    conditions.push(`al.resource_type = $${paramCount}`);
    params.push(entityType);
  }

  if (filters.userId) {
    paramCount++;
    conditions.push(`al.user_id = $${paramCount}`);
    params.push(filters.userId);
  }

  if (filters.entityId) {
    paramCount++;
    conditions.push(`al.resource_id = $${paramCount}`);
    params.push(filters.entityId);
  }

  if (filters.action) {
    paramCount++;
    conditions.push(`al.action = $${paramCount}`);
    params.push(filters.action);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM audit_log al WHERE ${whereClause}`,
    params
  );

  const dataResult = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      u.email as "userEmail",
      u.role as "userRole",
      al.action,
      al.resource_type as "resourceType",
      al.resource_id as "resourceId",
      al.changes,
      al.metadata,
      al.ip_address as "ipAddress",
      al.severity,
      al.status,
      al.created_at as "changedAt"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT 10000`,
    params
  );

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10)
  };
}

// ============================================================================
// Suspicious Activity Detection
// ============================================================================

interface SuspiciousActivityResult {
  activities: SuspiciousActivity[];
  riskFactors: Record<string, unknown>;
}

export async function detectSuspiciousActivity(
  tenantId: string,
  userId: string
): Promise<SuspiciousActivityResult> {
  const activities: SuspiciousActivity[] = [];
  const riskFactors: Record<string, unknown> = {};
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Check for excessive access in the last 24 hours
  const accessCountResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
       AND action IN ('view', 'patient_data_view')`,
    [tenantId, userId, last24Hours.toISOString()]
  );
  const accessCount = parseInt(accessCountResult.rows[0]?.count ?? "0", 10);

  // Get average access for comparison
  const avgAccessResult = await pool.query(
    `SELECT AVG(daily_count)::numeric as avg_count
     FROM (
       SELECT DATE(created_at) as day, COUNT(*) as daily_count
       FROM audit_log
       WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
         AND action IN ('view', 'patient_data_view')
       GROUP BY DATE(created_at)
     ) daily`,
    [tenantId, userId, last7Days.toISOString()]
  );
  const avgAccess = parseFloat(avgAccessResult.rows[0]?.avg_count ?? "0");

  if (avgAccess > 0 && accessCount > avgAccess * 3) {
    const riskScore = Math.min(100, Math.round((accessCount / avgAccess) * 20));
    activities.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      activityType: "excessive_access",
      riskScore,
      riskLevel: riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : "medium",
      details: {
        accessCount,
        averageAccess: avgAccess,
        ratio: accessCount / avgAccess
      },
      detectedAt: now.toISOString(),
      detectionMethod: "automated",
      reviewed: false,
      requiresFollowUp: riskScore >= 60
    });
    riskFactors["excessive_access"] = { count: accessCount, average: avgAccess };
  }

  // Check for after-hours access (before 6am or after 8pm)
  const afterHoursResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
       AND (EXTRACT(HOUR FROM created_at) < 6 OR EXTRACT(HOUR FROM created_at) >= 20)`,
    [tenantId, userId, last24Hours.toISOString()]
  );
  const afterHoursCount = parseInt(afterHoursResult.rows[0]?.count ?? "0", 10);

  if (afterHoursCount > 10) {
    const riskScore = Math.min(100, afterHoursCount * 3);
    activities.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      activityType: "after_hours_access",
      riskScore,
      riskLevel: riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : "medium",
      details: { afterHoursCount },
      detectedAt: now.toISOString(),
      detectionMethod: "automated",
      reviewed: false,
      requiresFollowUp: riskScore >= 40
    });
    riskFactors["after_hours"] = { count: afterHoursCount };
  }

  // Check for failed login attempts
  const failedLoginsResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
       AND action = 'failed_login'`,
    [tenantId, userId, last24Hours.toISOString()]
  );
  const failedLogins = parseInt(failedLoginsResult.rows[0]?.count ?? "0", 10);

  if (failedLogins >= 3) {
    const riskScore = Math.min(100, failedLogins * 15);
    activities.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      activityType: "failed_login_burst",
      riskScore,
      riskLevel: riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : "medium",
      details: { failedAttempts: failedLogins },
      detectedAt: now.toISOString(),
      detectionMethod: "automated",
      reviewed: false,
      requiresFollowUp: failedLogins >= 5
    });
    riskFactors["failed_logins"] = { count: failedLogins };
  }

  // Check for unusual IP addresses
  const ipResult = await pool.query(
    `SELECT DISTINCT ip_address
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
       AND ip_address IS NOT NULL`,
    [tenantId, userId, last24Hours.toISOString()]
  );

  const previousIpsResult = await pool.query(
    `SELECT DISTINCT ip_address
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at < $3 AND created_at >= $4
       AND ip_address IS NOT NULL`,
    [tenantId, userId, last24Hours.toISOString(), last7Days.toISOString()]
  );

  const currentIps = new Set(ipResult.rows.map(r => r.ip_address));
  const previousIps = new Set(previousIpsResult.rows.map(r => r.ip_address));
  const newIps = [...currentIps].filter(ip => !previousIps.has(ip));

  if (newIps.length > 0 && previousIps.size > 0) {
    const riskScore = Math.min(100, newIps.length * 25);
    activities.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      activityType: "unusual_ip",
      riskScore,
      riskLevel: riskScore >= 60 ? "high" : "medium",
      details: { newIpAddresses: newIps, previousIpCount: previousIps.size },
      detectedAt: now.toISOString(),
      detectionMethod: "automated",
      reviewed: false,
      requiresFollowUp: newIps.length >= 2
    });
    riskFactors["new_ips"] = { ips: newIps };
  }

  // Check for bulk downloads/exports
  const exportResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3
       AND action IN ('export', 'download', 'bulk_export')`,
    [tenantId, userId, last24Hours.toISOString()]
  );
  const exportCount = parseInt(exportResult.rows[0]?.count ?? "0", 10);

  if (exportCount >= 10) {
    const riskScore = Math.min(100, exportCount * 5);
    activities.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      activityType: "bulk_download",
      riskScore,
      riskLevel: riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : "medium",
      details: { exportCount },
      detectedAt: now.toISOString(),
      detectionMethod: "automated",
      reviewed: false,
      requiresFollowUp: exportCount >= 20
    });
    riskFactors["bulk_exports"] = { count: exportCount };
  }

  return { activities, riskFactors };
}

// ============================================================================
// Patient Access History
// ============================================================================

export async function getPatientAccessHistory(
  tenantId: string,
  patientId: string,
  options: { limit?: number; offset?: number; startDate?: string; endDate?: string } = {}
): Promise<{ entries: PatientAccessHistoryEntry[]; total: number }> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const conditions: string[] = [
    "al.tenant_id = $1",
    "(al.resource_id = $2 OR al.metadata->>'patientId' = $2 OR al.resource_type = 'patient' AND al.resource_id = $2)"
  ];
  const params: unknown[] = [tenantId, patientId];
  let paramCount = 2;

  if (options.startDate) {
    paramCount++;
    conditions.push(`al.created_at >= $${paramCount}`);
    params.push(options.startDate);
  }

  if (options.endDate) {
    paramCount++;
    conditions.push(`al.created_at <= $${paramCount}`);
    params.push(options.endDate);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM audit_log al WHERE ${whereClause}`,
    params
  );

  const dataResult = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      u.role as "userRole",
      al.action as "accessType",
      al.resource_type as "resourceType",
      al.resource_id as "resourceId",
      al.metadata->>'access_reason' as "accessReason",
      COALESCE((al.metadata->>'break_glass')::boolean, false) as "isBreakGlass",
      al.ip_address as "ipAddress",
      al.created_at as "accessedAt"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return {
    entries: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10)
  };
}

// ============================================================================
// User Activity Summary
// ============================================================================

export async function getUserActivitySummary(
  tenantId: string,
  userId: string,
  dateRange: DateRange
): Promise<UserActivitySummary> {
  // Get user info
  const userResult = await pool.query(
    `SELECT id, full_name, email, role FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error("User not found");
  }

  // Total actions
  const totalResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Unique patients accessed
  const patientsResult = await pool.query(
    `SELECT COUNT(DISTINCT COALESCE(
       CASE WHEN resource_type = 'patient' THEN resource_id END,
       metadata->>'patientId'
     )) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND (resource_type = 'patient' OR metadata->>'patientId' IS NOT NULL)`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Documents viewed
  const docsViewedResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND resource_type = 'document' AND action = 'view'`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Documents exported
  const docsExportedResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND resource_type = 'document' AND action IN ('export', 'download')`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Prescriptions written
  const rxWrittenResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND resource_type = 'prescription' AND action = 'create'`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Controlled Rx (this is an approximation - would need prescription data)
  const controlledRxResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND resource_type = 'prescription' AND action = 'create'
       AND (metadata->>'is_controlled' = 'true' OR metadata->>'dea_schedule' IS NOT NULL)`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Failed logins
  const failedLoginsResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND action = 'failed_login'`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // After hours actions (before 6am or after 8pm)
  const afterHoursResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
       AND (EXTRACT(HOUR FROM created_at) < 6 OR EXTRACT(HOUR FROM created_at) >= 20)`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Top accessed resources
  const topResourcesResult = await pool.query(
    `SELECT resource_type as type, COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
     GROUP BY resource_type
     ORDER BY count DESC
     LIMIT 10`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Activity by day
  const byDayResult = await pool.query(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  // Suspicious activity count
  const suspiciousResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM suspicious_activity_log
     WHERE tenant_id = $1 AND user_id = $2 AND detected_at >= $3 AND detected_at <= $4`,
    [tenantId, userId, dateRange.startDate, dateRange.endDate]
  );

  return {
    userId: user.id,
    userName: user.full_name,
    userEmail: user.email,
    role: user.role,
    dateRange,
    totalActions: parseInt(totalResult.rows[0]?.total ?? "0", 10),
    uniquePatientsAccessed: parseInt(patientsResult.rows[0]?.count ?? "0", 10),
    documentsViewed: parseInt(docsViewedResult.rows[0]?.count ?? "0", 10),
    documentsExported: parseInt(docsExportedResult.rows[0]?.count ?? "0", 10),
    prescriptionsWritten: parseInt(rxWrittenResult.rows[0]?.count ?? "0", 10),
    controlledRxWritten: parseInt(controlledRxResult.rows[0]?.count ?? "0", 10),
    failedLogins: parseInt(failedLoginsResult.rows[0]?.count ?? "0", 10),
    afterHoursActions: parseInt(afterHoursResult.rows[0]?.count ?? "0", 10),
    topAccessedResources: topResourcesResult.rows.map(r => ({
      type: r.type,
      count: parseInt(r.count, 10)
    })),
    activityByDay: byDayResult.rows.map(r => ({
      date: r.date,
      count: parseInt(r.count, 10)
    })),
    suspiciousActivityCount: parseInt(suspiciousResult.rows[0]?.count ?? "0", 10)
  };
}

// ============================================================================
// Report Templates Management
// ============================================================================

export async function createReportTemplate(
  tenantId: string,
  createdBy: string,
  data: Omit<AuditReportTemplate, "id" | "tenantId" | "createdAt" | "updatedAt" | "createdBy">
): Promise<AuditReportTemplate> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO audit_report_templates (
      id, tenant_id, name, description, report_type, filters, columns,
      schedule_cron, schedule_enabled, recipients, created_by, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      tenantId,
      data.name,
      data.description,
      data.reportType,
      JSON.stringify(data.filters),
      data.columns,
      data.scheduleCron,
      data.scheduleEnabled,
      data.recipients,
      createdBy,
      data.isActive ?? true
    ]
  );

  const result = await pool.query(
    `SELECT * FROM audit_report_templates WHERE id = $1`,
    [id]
  );

  return mapTemplateRow(result.rows[0]);
}

export async function getReportTemplates(
  tenantId: string,
  options: { reportType?: string; activeOnly?: boolean } = {}
): Promise<AuditReportTemplate[]> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let paramCount = 1;

  if (options.reportType) {
    paramCount++;
    conditions.push(`report_type = $${paramCount}`);
    params.push(options.reportType);
  }

  if (options.activeOnly) {
    conditions.push("is_active = true");
  }

  const result = await pool.query(
    `SELECT * FROM audit_report_templates WHERE ${conditions.join(" AND ")} ORDER BY name`,
    params
  );

  return result.rows.map(mapTemplateRow);
}

export async function getReportTemplate(
  tenantId: string,
  templateId: string
): Promise<AuditReportTemplate | null> {
  const result = await pool.query(
    `SELECT * FROM audit_report_templates WHERE id = $1 AND tenant_id = $2`,
    [templateId, tenantId]
  );

  return result.rows[0] ? mapTemplateRow(result.rows[0]) : null;
}

function mapTemplateRow(row: Record<string, unknown>): AuditReportTemplate {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    reportType: row.report_type as AuditReportTemplate["reportType"],
    filters: (row.filters ?? {}) as Record<string, unknown>,
    columns: (row.columns ?? []) as string[],
    scheduleCron: row.schedule_cron as string | undefined,
    scheduleEnabled: row.schedule_enabled as boolean,
    recipients: (row.recipients ?? []) as string[],
    lastRunAt: row.last_run_at as string | undefined,
    nextRunAt: row.next_run_at as string | undefined,
    createdBy: row.created_by as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    isActive: row.is_active as boolean
  };
}

// ============================================================================
// Report Generation and Scheduling
// ============================================================================

export async function scheduleReport(
  tenantId: string,
  templateId: string,
  cronExpression: string
): Promise<void> {
  const nextRun = calculateNextRunFromCron(cronExpression);

  await pool.query(
    `UPDATE audit_report_templates
     SET schedule_cron = $3, schedule_enabled = true, next_run_at = $4, updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [templateId, tenantId, cronExpression, nextRun]
  );
}

export async function generateReport(
  tenantId: string,
  templateId: string,
  generatedBy: string,
  dateRange: DateRange
): Promise<AuditReportRun> {
  const template = await getReportTemplate(tenantId, templateId);
  if (!template) {
    throw new Error("Template not found");
  }

  const runId = crypto.randomUUID();

  // Get user name
  const userResult = await pool.query(
    `SELECT full_name FROM users WHERE id = $1`,
    [generatedBy]
  );
  const generatedByName = userResult.rows[0]?.full_name ?? "Unknown";

  // Create run record
  await pool.query(
    `INSERT INTO audit_report_runs (
      id, tenant_id, template_id, template_name, report_type,
      date_range_start, date_range_end, filters_applied,
      generated_by, generated_by_name, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      runId,
      tenantId,
      templateId,
      template.name,
      template.reportType,
      dateRange.startDate,
      dateRange.endDate,
      JSON.stringify(template.filters),
      generatedBy,
      generatedByName,
      "processing"
    ]
  );

  try {
    // Generate report based on type
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
      case "security":
      case "login":
        result = await generateLoginReport(tenantId, dateRange);
        break;
      case "prescription":
        result = await generatePrescriptionReport(tenantId, dateRange);
        break;
      case "export":
        result = await generateExportReport(tenantId, dateRange);
        break;
      default:
        result = await generateAccessReport(tenantId, dateRange);
    }

    // Generate CSV content
    const csvContent = generateCSV(result.rows, template.columns);
    const checksum = crypto.createHash("sha256").update(csvContent).digest("hex");

    // Update run record
    await pool.query(
      `UPDATE audit_report_runs
       SET status = 'completed', row_count = $3, checksum = $4,
           file_size_bytes = $5, expires_at = now() + interval '30 days'
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, result.total, checksum, csvContent.length]
    );

    // Update template last run
    await pool.query(
      `UPDATE audit_report_templates
       SET last_run_at = now(), next_run_at = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId, template.scheduleCron ? calculateNextRunFromCron(template.scheduleCron) : null]
    );

    // Log the report generation
    await createAuditLog({
      tenantId,
      userId: generatedBy,
      action: "generate",
      resourceType: "audit_report",
      resourceId: runId,
      metadata: {
        templateId,
        templateName: template.name,
        reportType: template.reportType,
        rowCount: result.total
      },
      severity: "warning",
      status: "success"
    });

    return await getReportRun(tenantId, runId) as AuditReportRun;
  } catch (error) {
    // Update run as failed
    await pool.query(
      `UPDATE audit_report_runs
       SET status = 'failed', error_message = $3
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, (error as Error).message]
    );
    throw error;
  }
}

export async function getReportRun(
  tenantId: string,
  runId: string
): Promise<AuditReportRun | null> {
  const result = await pool.query(
    `SELECT * FROM audit_report_runs WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId]
  );

  return result.rows[0] ? mapReportRunRow(result.rows[0]) : null;
}

export async function getReportRuns(
  tenantId: string,
  options: { templateId?: string; limit?: number; offset?: number } = {}
): Promise<{ runs: AuditReportRun[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let paramCount = 1;

  if (options.templateId) {
    paramCount++;
    conditions.push(`template_id = $${paramCount}`);
    params.push(options.templateId);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM audit_report_runs WHERE ${whereClause}`,
    params
  );

  const result = await pool.query(
    `SELECT * FROM audit_report_runs WHERE ${whereClause}
     ORDER BY run_date DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return {
    runs: result.rows.map(mapReportRunRow),
    total: parseInt(countResult.rows[0]?.total ?? "0", 10)
  };
}

function mapReportRunRow(row: Record<string, unknown>): AuditReportRun {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    templateId: row.template_id as string | undefined,
    templateName: row.template_name as string | undefined,
    reportType: row.report_type as string,
    runDate: row.run_date as string,
    dateRangeStart: row.date_range_start as string | undefined,
    dateRangeEnd: row.date_range_end as string | undefined,
    filtersApplied: (row.filters_applied ?? {}) as Record<string, unknown>,
    generatedBy: row.generated_by as string | undefined,
    generatedByName: row.generated_by_name as string | undefined,
    rowCount: row.row_count as number,
    fileUrl: row.file_url as string | undefined,
    fileSizeBytes: row.file_size_bytes as number | undefined,
    fileFormat: row.file_format as string,
    status: row.status as AuditReportRun["status"],
    errorMessage: row.error_message as string | undefined,
    expiresAt: row.expires_at as string | undefined,
    checksum: row.checksum as string | undefined,
    createdAt: row.created_at as string
  };
}

// ============================================================================
// Suspicious Activity Management
// ============================================================================

export async function getSuspiciousActivities(
  tenantId: string,
  options: {
    userId?: string;
    activityType?: string;
    reviewed?: boolean;
    minRiskScore?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ activities: SuspiciousActivity[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let paramCount = 1;

  if (options.userId) {
    paramCount++;
    conditions.push(`user_id = $${paramCount}`);
    params.push(options.userId);
  }

  if (options.activityType) {
    paramCount++;
    conditions.push(`activity_type = $${paramCount}`);
    params.push(options.activityType);
  }

  if (options.reviewed !== undefined) {
    paramCount++;
    conditions.push(`reviewed = $${paramCount}`);
    params.push(options.reviewed);
  }

  if (options.minRiskScore !== undefined) {
    paramCount++;
    conditions.push(`risk_score >= $${paramCount}`);
    params.push(options.minRiskScore);
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM suspicious_activity_log WHERE ${whereClause}`,
    params
  );

  const result = await pool.query(
    `SELECT sal.*, u.full_name as user_name, u.email as user_email
     FROM suspicious_activity_log sal
     LEFT JOIN users u ON sal.user_id = u.id
     WHERE ${whereClause}
     ORDER BY sal.risk_score DESC, sal.detected_at DESC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return {
    activities: result.rows.map(mapSuspiciousActivityRow),
    total: parseInt(countResult.rows[0]?.total ?? "0", 10)
  };
}

export async function reviewSuspiciousActivity(
  tenantId: string,
  activityId: string,
  reviewedBy: string,
  data: {
    actionTaken: string;
    reviewNotes?: string;
    requiresFollowUp?: boolean;
    followUpDueDate?: string;
  }
): Promise<SuspiciousActivity | null> {
  await pool.query(
    `UPDATE suspicious_activity_log
     SET reviewed = true, reviewed_by = $3, reviewed_at = now(),
         action_taken = $4, review_notes = $5,
         requires_follow_up = $6, follow_up_due_date = $7,
         updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [
      activityId,
      tenantId,
      reviewedBy,
      data.actionTaken,
      data.reviewNotes,
      data.requiresFollowUp ?? false,
      data.followUpDueDate
    ]
  );

  const result = await pool.query(
    `SELECT sal.*, u.full_name as user_name, u.email as user_email
     FROM suspicious_activity_log sal
     LEFT JOIN users u ON sal.user_id = u.id
     WHERE sal.id = $1 AND sal.tenant_id = $2`,
    [activityId, tenantId]
  );

  return result.rows[0] ? mapSuspiciousActivityRow(result.rows[0]) : null;
}

export async function logSuspiciousActivity(
  tenantId: string,
  activity: Omit<SuspiciousActivity, "id" | "tenantId" | "detectedAt" | "reviewed" | "riskLevel">
): Promise<SuspiciousActivity> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO suspicious_activity_log (
      id, tenant_id, user_id, activity_type, risk_score, details,
      ip_address, user_agent, related_audit_ids, related_patient_ids,
      detection_method, requires_follow_up, follow_up_due_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      tenantId,
      activity.userId,
      activity.activityType,
      activity.riskScore,
      JSON.stringify(activity.details),
      activity.ipAddress,
      activity.userAgent,
      activity.relatedAuditIds,
      activity.relatedPatientIds,
      activity.detectionMethod ?? "manual",
      activity.requiresFollowUp,
      activity.followUpDueDate
    ]
  );

  const result = await pool.query(
    `SELECT sal.*, u.full_name as user_name, u.email as user_email
     FROM suspicious_activity_log sal
     LEFT JOIN users u ON sal.user_id = u.id
     WHERE sal.id = $1`,
    [id]
  );

  return mapSuspiciousActivityRow(result.rows[0]);
}

function mapSuspiciousActivityRow(row: Record<string, unknown>): SuspiciousActivity {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string | undefined,
    userName: row.user_name as string | undefined,
    userEmail: row.user_email as string | undefined,
    activityType: row.activity_type as string,
    riskScore: row.risk_score as number,
    riskLevel: row.risk_level as string,
    details: (row.details ?? {}) as Record<string, unknown>,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    relatedAuditIds: row.related_audit_ids as string[] | undefined,
    relatedPatientIds: row.related_patient_ids as string[] | undefined,
    detectedAt: row.detected_at as string,
    detectionMethod: row.detection_method as string | undefined,
    reviewed: row.reviewed as boolean,
    reviewedBy: row.reviewed_by as string | undefined,
    reviewedAt: row.reviewed_at as string | undefined,
    reviewNotes: row.review_notes as string | undefined,
    actionTaken: row.action_taken as string | undefined,
    requiresFollowUp: row.requires_follow_up as boolean,
    followUpDueDate: row.follow_up_due_date as string | undefined
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function generateLoginReport(
  tenantId: string,
  dateRange: DateRange
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const result = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      u.email as "userEmail",
      al.action,
      al.ip_address as "ipAddress",
      al.user_agent as "userAgent",
      al.severity,
      al.status,
      al.created_at as "timestamp"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.tenant_id = $1 AND al.created_at >= $2 AND al.created_at <= $3
      AND al.action IN ('login', 'logout', 'failed_login', 'password_change', 'session_expired')
    ORDER BY al.created_at DESC
    LIMIT 10000`,
    [tenantId, dateRange.startDate, dateRange.endDate]
  );

  return { rows: result.rows, total: result.rows.length };
}

async function generatePrescriptionReport(
  tenantId: string,
  dateRange: DateRange
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const result = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      al.action,
      al.resource_id as "prescriptionId",
      al.metadata->>'medication_name' as "medicationName",
      al.metadata->>'is_controlled' as "isControlled",
      al.metadata->>'dea_schedule' as "deaSchedule",
      al.ip_address as "ipAddress",
      al.created_at as "timestamp"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.tenant_id = $1 AND al.created_at >= $2 AND al.created_at <= $3
      AND al.resource_type = 'prescription'
    ORDER BY al.created_at DESC
    LIMIT 10000`,
    [tenantId, dateRange.startDate, dateRange.endDate]
  );

  return { rows: result.rows, total: result.rows.length };
}

async function generateExportReport(
  tenantId: string,
  dateRange: DateRange
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const result = await pool.query(
    `SELECT
      al.id,
      al.user_id as "userId",
      u.full_name as "userName",
      al.action,
      al.resource_type as "resourceType",
      al.resource_id as "resourceId",
      al.metadata->>'record_count' as "recordCount",
      al.metadata->>'format' as "format",
      al.ip_address as "ipAddress",
      al.created_at as "timestamp"
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.tenant_id = $1 AND al.created_at >= $2 AND al.created_at <= $3
      AND al.action IN ('export', 'download', 'print', 'fax')
    ORDER BY al.created_at DESC
    LIMIT 10000`,
    [tenantId, dateRange.startDate, dateRange.endDate]
  );

  return { rows: result.rows, total: result.rows.length };
}

function generateCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";

  const headers = columns ?? Object.keys(rows[0] ?? {});
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function calculateNextRunFromCron(cronExpression: string): Date {
  // Simple cron parser for basic expressions
  // Format: minute hour day month weekday
  const parts = cronExpression.split(" ");
  const now = new Date();
  const next = new Date(now);

  // Default to next day at the specified time
  if (parts.length >= 2) {
    const minute = parts[0] === "*" ? 0 : parseInt(parts[0] ?? "0", 10);
    const hour = parts[1] === "*" ? 0 : parseInt(parts[1] ?? "0", 10);

    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }

  return next;
}
