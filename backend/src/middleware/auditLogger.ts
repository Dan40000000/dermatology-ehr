/**
 * Enhanced Audit Logging Middleware
 *
 * Comprehensive audit logging for HIPAA compliance and security
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { AuthedRequest } from './auth';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'patient_create'
  | 'patient_update'
  | 'patient_view'
  | 'patient_delete'
  | 'encounter_create'
  | 'encounter_update'
  | 'encounter_sign'
  | 'encounter_delete'
  | 'prescription_create'
  | 'prescription_update'
  | 'prescription_cancel'
  | 'document_upload'
  | 'document_view'
  | 'document_delete'
  | 'photo_upload'
  | 'photo_view'
  | 'photo_delete'
  | 'charge_create'
  | 'charge_update'
  | 'charge_delete'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'permission_change'
  | 'setting_change'
  | 'export_data'
  | 'print_document'
  | 'permission_denied';

interface AuditLogEntry {
  tenantId?: string;
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  statusCode?: number;
}

/**
 * Log audit event to database
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log
       (tenant_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent, request_path, status_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.tenantId || null,
        entry.userId || null,
        entry.action,
        entry.entityType || null,
        entry.entityId || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.requestPath || null,
        entry.statusCode || null,
      ]
    );

    logger.info('Audit event logged', {
      action: entry.action,
      entityType: entry.entityType,
      userId: entry.userId,
    });
  } catch (error: any) {
    logger.error('Failed to log audit event', {
      error: error.message,
      entry,
    });
  }
}

/**
 * Audit logging middleware
 * Automatically logs sensitive operations
 */
export function auditMiddleware(action: AuditAction, entityType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authedReq = req as AuthedRequest;
    const originalJson = res.json.bind(res);

    // Override json method to log after successful response
    res.json = function (body: any) {
      // Log audit event
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || req.params.patientId || body?.id;

        logAuditEvent({
          tenantId: authedReq.user?.tenantId,
          userId: authedReq.user?.id,
          action,
          entityType,
          entityId,
          details: {
            method: req.method,
            params: req.params,
            query: req.query,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          requestPath: req.path,
          statusCode: res.statusCode,
        }).catch((err) => {
          logger.error('Audit logging error', { error: err.message });
        });
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * PHI Access Logging
 * Special logging for Protected Health Information access
 */
export async function logPHIAccess(
  userId: string,
  tenantId: string,
  patientId: string,
  action: 'view' | 'update' | 'create' | 'delete',
  details?: Record<string, any>
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    action: `patient_${action}` as AuditAction,
    entityType: 'patient',
    entityId: patientId,
    details: {
      ...details,
      phi_access: true,
      timestamp: new Date().toISOString(),
    },
  });

  logger.info('PHI access logged', {
    userId,
    patientId,
    action,
  });
}

/**
 * Security Event Logging
 * Log security-related events
 */
export async function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, any>,
  userId?: string,
  tenantId?: string
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    action: 'permission_denied',
    details: {
      event,
      severity,
      ...details,
    },
  });

  logger.warn('Security event', {
    event,
    severity,
    userId,
    details,
  });
}

/**
 * Data Export Logging
 * Log when data is exported from the system
 */
export async function logDataExport(
  userId: string,
  tenantId: string,
  exportType: string,
  recordCount: number,
  filters?: Record<string, any>
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    action: 'export_data',
    details: {
      exportType,
      recordCount,
      filters,
      timestamp: new Date().toISOString(),
    },
  });

  logger.info('Data export logged', {
    userId,
    exportType,
    recordCount,
  });
}

/**
 * Configuration Change Logging
 * Log when system settings are changed
 */
export async function logConfigurationChange(
  userId: string,
  tenantId: string,
  settingName: string,
  oldValue: any,
  newValue: any
): Promise<void> {
  await logAuditEvent({
    tenantId,
    userId,
    action: 'setting_change',
    details: {
      settingName,
      oldValue,
      newValue,
      timestamp: new Date().toISOString(),
    },
  });

  logger.info('Configuration change logged', {
    userId,
    settingName,
  });
}

/**
 * Get audit log for a specific entity
 */
export async function getAuditLog(
  entityType: string,
  entityId: string,
  limit: number = 50
): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      al.*,
      u.email as user_email,
      u.first_name || ' ' || u.last_name as user_name
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );

  return result.rows;
}

/**
 * Get user activity log
 */
export async function getUserActivityLog(
  userId: string,
  limit: number = 100
): Promise<any[]> {
  const result = await pool.query(
    `SELECT *
     FROM audit_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

/**
 * Get security events
 */
export async function getSecurityEvents(
  tenantId: string,
  since?: Date,
  limit: number = 100
): Promise<any[]> {
  const query = since
    ? `SELECT * FROM audit_log
       WHERE tenant_id = $1
       AND action IN ('login_failed', 'permission_denied')
       AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT $3`
    : `SELECT * FROM audit_log
       WHERE tenant_id = $1
       AND action IN ('login_failed', 'permission_denied')
       ORDER BY created_at DESC
       LIMIT $2`;

  const params = since ? [tenantId, since, limit] : [tenantId, limit];
  const result = await pool.query(query, params);

  return result.rows;
}

/**
 * Generate audit report
 */
export async function generateAuditReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  summary: Record<string, number>;
  events: any[];
  securityEvents: any[];
  phiAccess: any[];
}> {
  // Get summary statistics
  const summaryResult = await pool.query(
    `SELECT
      action,
      COUNT(*) as count
     FROM audit_log
     WHERE tenant_id = $1
     AND created_at BETWEEN $2 AND $3
     GROUP BY action
     ORDER BY count DESC`,
    [tenantId, startDate, endDate]
  );

  const summary: Record<string, number> = {};
  summaryResult.rows.forEach((row) => {
    summary[row.action] = parseInt(row.count);
  });

  // Get all events
  const eventsResult = await pool.query(
    `SELECT * FROM audit_log
     WHERE tenant_id = $1
     AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC
     LIMIT 1000`,
    [tenantId, startDate, endDate]
  );

  // Get security events
  const securityResult = await pool.query(
    `SELECT * FROM audit_log
     WHERE tenant_id = $1
     AND action IN ('login_failed', 'permission_denied')
     AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC`,
    [tenantId, startDate, endDate]
  );

  // Get PHI access events
  const phiResult = await pool.query(
    `SELECT * FROM audit_log
     WHERE tenant_id = $1
     AND action LIKE 'patient_%'
     AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC
     LIMIT 500`,
    [tenantId, startDate, endDate]
  );

  return {
    summary,
    events: eventsResult.rows,
    securityEvents: securityResult.rows,
    phiAccess: phiResult.rows,
  };
}
