/**
 * SMS Audit Log Routes
 * HIPAA-compliant audit trail for SMS communications
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

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

    let query = `
      SELECT
        id,
        event_type as "eventType",
        patient_id as "patientId",
        patient_name as "patientName",
        user_id as "userId",
        user_name as "userName",
        message_id as "messageId",
        message_preview as "messagePreview",
        direction,
        status,
        metadata,
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
      query += ` AND event_type = $${paramIndex}`;
      params.push(eventType);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

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
      countQuery += ` AND event_type = $${countParamIndex}`;
      countParams.push(eventType);
      countParamIndex++;
    }
    if (startDate) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }
    if (endDate) {
      countQuery += ` AND created_at <= $${countParamIndex}`;
      countParams.push(endDate);
    }

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

    let query = `
      SELECT
        event_type,
        patient_name,
        user_name,
        message_preview,
        direction,
        status,
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

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

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

    let dateFilter = '';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      dateFilter += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      dateFilter += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE event_type = 'message_sent') as "messagesSent",
        COUNT(*) FILTER (WHERE event_type = 'message_received') as "messagesReceived",
        COUNT(*) FILTER (WHERE event_type = 'consent_obtained') as "consentsObtained",
        COUNT(*) FILTER (WHERE event_type = 'consent_revoked') as "consentsRevoked",
        COUNT(*) FILTER (WHERE event_type = 'opt_out') as "optOuts",
        COUNT(DISTINCT patient_id) as "uniquePatients"
       FROM sms_audit_log
       WHERE tenant_id = $1 ${dateFilter}`,
      params
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching SMS audit summary', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS audit summary' });
  }
});

export const smsAuditRouter = router;
