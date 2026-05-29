/**
 * SMS Audit Log Routes
 * HIPAA-compliant audit trail for SMS communications
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { getTableColumns } from '../db/schema';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

function isDateOnlyQueryValue(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addAuditDateFilters(query: string, params: any[], startDate?: string, endDate?: string): string {
  let nextQuery = query;

  if (startDate) {
    params.push(startDate);
    nextQuery += isDateOnlyQueryValue(startDate)
      ? ` AND created_at >= $${params.length}::date`
      : ` AND created_at >= $${params.length}::timestamptz`;
  }

  if (endDate) {
    params.push(endDate);
    nextQuery += isDateOnlyQueryValue(endDate)
      ? ` AND created_at < ($${params.length}::date + interval '1 day')`
      : ` AND created_at <= $${params.length}::timestamptz`;
  }

  return nextQuery;
}

function smsAuditColumn(columns: Set<string>, modern: string, legacy: string): string {
  return columns.has(modern) ? modern : legacy;
}

function smsAuditSelectExpressions(columns: Set<string>) {
  const eventType = smsAuditColumn(columns, 'event_type', 'action');
  const userId = smsAuditColumn(columns, 'user_id', 'performed_by_user_id');
  const userName = smsAuditColumn(columns, 'user_name', 'performed_by_name');
  const metadata = columns.has('metadata') ? 'metadata' : 'details';
  const patientName = columns.has('patient_name')
    ? 'patient_name'
    : `COALESCE(details->>'patientName', details->>'patient_name')`;
  const messagePreview = columns.has('message_preview')
    ? 'message_preview'
    : `LEFT(COALESCE(details->>'messagePreview', details->>'message_preview', details->>'messageBody', details->>'body', ''), 160)`;
  const direction = columns.has('direction')
    ? 'direction'
    : `COALESCE(details->>'direction', '')`;
  const status = columns.has('status')
    ? 'status'
    : `COALESCE(details->>'status', '')`;

  return { eventType, userId, userName, metadata, patientName, messagePreview, direction, status };
}

/**
 * GET /api/sms-audit
 * Get SMS audit log entries
 */
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.query.patientId as string | undefined;
    const eventType = req.query.eventType as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const columns = await getTableColumns('sms_audit_log');
    const audit = smsAuditSelectExpressions(columns);

    let query = `
      SELECT
        id,
        ${audit.eventType} as "eventType",
        patient_id as "patientId",
        ${audit.patientName} as "patientName",
        ${audit.userId} as "userId",
        ${audit.userName} as "userName",
        message_id as "messageId",
        ${audit.messagePreview} as "messagePreview",
        ${audit.direction} as direction,
        ${audit.status} as status,
        ${audit.metadata} as metadata,
        created_at as "createdAt"
      FROM sms_audit_log
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (eventType) {
      query += ` AND ${audit.eventType} = $${paramIndex}`;
      params.push(eventType);
      paramIndex++;
    }

    query = addAuditDateFilters(query, params, startDate, endDate);
    paramIndex = params.length + 1;

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM sms_audit_log WHERE tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countParamIndex = 2;

    if (patientId) {
      countQuery += ` AND patient_id = $${countParamIndex}`;
      countParams.push(patientId);
      countParamIndex++;
    }
    if (eventType) {
      countQuery += ` AND ${audit.eventType} = $${countParamIndex}`;
      countParams.push(eventType);
      countParamIndex++;
    }
    countQuery = addAuditDateFilters(countQuery, countParams, startDate, endDate);

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      auditLogs: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching SMS audit log', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS audit log' });
  }
});

/**
 * GET /api/sms-audit/export
 * Export SMS audit log as CSV
 */
router.get('/export', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.query.patientId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const columns = await getTableColumns('sms_audit_log');
    const audit = smsAuditSelectExpressions(columns);

    let query = `
      SELECT
        ${audit.eventType} as event_type,
        ${audit.patientName} as patient_name,
        ${audit.userName} as user_name,
        ${audit.messagePreview} as message_preview,
        ${audit.direction} as direction,
        ${audit.status} as status,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as timestamp
      FROM sms_audit_log
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    query = addAuditDateFilters(query, params, startDate, endDate);

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    // Generate CSV
    const headers = ['Event Type', 'Patient Name', 'Staff Member', 'Message Preview', 'Direction', 'Status', 'Timestamp'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const values = [
        row.event_type || '',
        row.patient_name || '',
        row.user_name || '',
        row.message_preview ? `"${row.message_preview.replace(/"/g, '""').substring(0, 50)}"` : '',
        row.direction || '',
        row.status || '',
        row.timestamp || '',
      ];
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sms-audit-log-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error: any) {
    logger.error('Error exporting SMS audit log', { error: error.message });
    res.status(500).json({ error: 'Failed to export SMS audit log' });
  }
});

/**
 * GET /api/sms-audit/summary
 * Get summary statistics for audit log
 */
router.get('/summary', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const columns = await getTableColumns('sms_audit_log');
    const audit = smsAuditSelectExpressions(columns);

    const params: any[] = [tenantId];
    const where = addAuditDateFilters('tenant_id = $1', params, startDate, endDate);

    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE ${audit.eventType} = 'message_sent') as "messagesSent",
        COUNT(*) FILTER (WHERE ${audit.eventType} = 'message_received') as "messagesReceived",
        COUNT(*) FILTER (WHERE ${audit.eventType} = 'consent_obtained') as "consentsObtained",
        COUNT(*) FILTER (WHERE ${audit.eventType} = 'consent_revoked') as "consentsRevoked",
        COUNT(*) FILTER (WHERE ${audit.eventType} = 'opt_out') as "optOuts",
        COUNT(DISTINCT patient_id) as "uniquePatients"
       FROM sms_audit_log
       WHERE ${where}`,
      params
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching SMS audit summary', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS audit summary' });
  }
});

export const smsAuditRouter = router;
