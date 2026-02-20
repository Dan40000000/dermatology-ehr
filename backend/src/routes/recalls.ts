import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';
import {
  generateRecalls,
  generateAllRecalls,
  logReminder,
  getPatientPreferences,
  updatePatientPreferences,
  canContactPatient,
  type RecallCampaign,
  type PatientRecall,
  type ReminderLogEntry,
} from '../services/recallService';

const router = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logRecallsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/recalls/campaigns
 * List all recall campaigns
 */
router.get('/campaigns', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;

    const result = await pool.query<RecallCampaign>(
      `SELECT * FROM recall_campaigns
       WHERE tenant_id = $1
       ORDER BY is_active DESC, name ASC`,
      [tenantId]
    );

    res.json({ campaigns: result.rows });
  } catch (error: any) {
    logRecallsError('Error fetching campaigns', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/campaigns
 * Create a new recall campaign
 */
router.post('/campaigns', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { name, description, recallType, intervalMonths, isActive } = req.body;

    if (!name || !recallType) {
      return res.status(400).json({ error: 'Name and recall type are required' });
    }

    const id = randomUUID();

    const result = await pool.query<RecallCampaign>(
      `INSERT INTO recall_campaigns (
        id, tenant_id, name, description, recall_type, interval_months, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`,
      [id, tenantId, name, description, recallType, intervalMonths || 12, isActive ?? true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logRecallsError('Error creating campaign', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/recalls/campaigns/:id
 * Update a recall campaign
 */
router.put('/campaigns/:id', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;
    const { name, description, recallType, intervalMonths, isActive } = req.body;

    const result = await pool.query<RecallCampaign>(
      `UPDATE recall_campaigns
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           recall_type = COALESCE($3, recall_type),
           interval_months = COALESCE($4, interval_months),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [name, description, recallType, intervalMonths, isActive, id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logRecallsError('Error updating campaign', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/recalls/campaigns/:id
 * Delete a recall campaign
 */
router.delete('/campaigns/:id', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM recall_campaigns WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error: any) {
    logRecallsError('Error deleting campaign', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/campaigns/:id/generate
 * Generate recalls for a specific campaign
 */
router.post('/campaigns/:id/generate', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const result = await generateRecalls(tenantId, id!);

    res.json({
      message: `Generated ${result.created} recalls`,
      ...result,
    });
  } catch (error: any) {
    logRecallsError('Error generating recalls', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/generate-all
 * Generate recalls for all active campaigns
 */
router.post('/generate-all', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;

    const result = await generateAllRecalls(tenantId);

    res.json({
      message: `Processed ${result.campaigns} campaigns, created ${result.totalCreated} recalls`,
      ...result,
    });
  } catch (error: any) {
    logRecallsError('Error generating all recalls', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/due
 * Get patients due for recall (filtered by date range, campaign, status)
 */
router.get('/due', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { startDate, endDate, campaignId, status } = req.query;

    let query = `
      SELECT
        pr.*,
        p.first_name,
        p.last_name,
        p.email,
        p.phone,
        p.dob as date_of_birth,
        rc.name as campaign_name,
        rc.recall_type,
        (
          SELECT COUNT(*)
          FROM reminder_log rl
          WHERE rl.recall_id = pr.id
        ) as contact_attempts
      FROM patient_recalls pr
      JOIN patients p ON p.id = pr.patient_id
      LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id
      WHERE pr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND pr.due_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND pr.due_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (campaignId) {
      paramCount++;
      query += ` AND pr.campaign_id = $${paramCount}`;
      params.push(campaignId);
    }

    if (status) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY pr.due_date ASC, p.last_name ASC';

    const result = await pool.query(query, params);

    res.json({ recalls: result.rows });
  } catch (error: any) {
    logRecallsError('Error fetching due recalls', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/patient
 * Create a patient recall manually
 */
router.post('/patient', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { patientId, campaignId, dueDate, notes } = req.body;

    if (!patientId || !dueDate) {
      return res.status(400).json({ error: 'Patient ID and due date are required' });
    }

    const id = randomUUID();

    const result = await pool.query<PatientRecall>(
      `INSERT INTO patient_recalls (
        id, tenant_id, patient_id, campaign_id, due_date, status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW())
      RETURNING *`,
      [id, tenantId, patientId, campaignId, dueDate, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    logRecallsError('Error creating patient recall', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/recalls/:id/status
 * Update recall status
 */
router.put('/:id/status', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;
    const { status, appointmentId, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'contacted', 'scheduled', 'completed', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query<PatientRecall>(
      `UPDATE patient_recalls
       SET status = $1,
           appointment_id = COALESCE($2, appointment_id),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [status, appointmentId, notes, id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recall not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logRecallsError('Error updating recall status', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/:id/contact
 * Record a contact attempt
 */
router.post('/:id/contact', async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const { contactMethod, notes, messageContent } = req.body;

    if (!contactMethod) {
      return res.status(400).json({ error: 'Contact method is required' });
    }

    const validMethods = ['email', 'sms', 'phone', 'mail', 'portal'];
    if (!validMethods.includes(contactMethod)) {
      return res.status(400).json({ error: 'Invalid contact method' });
    }

    // Get recall details
    const recallResult = await pool.query<PatientRecall>(
      'SELECT * FROM patient_recalls WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (recallResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recall not found' });
    }

    const recall = recallResult.rows[0]!;

    // Check if patient can be contacted via this method
    const canContact = await canContactPatient(tenantId, recall.patientId, contactMethod as any);

    if (!canContact.canContact) {
      return res.status(403).json({ error: canContact.reason });
    }

    // Log the reminder
    await logReminder(
      tenantId,
      recall.patientId,
      id!,
      contactMethod as any,
      messageContent || `Recall: ${contactMethod} contact`,
      userId
    );

    // Update recall record
    await pool.query(
      `UPDATE patient_recalls
       SET last_contact_date = CURRENT_DATE,
           contact_method = $1,
           notes = COALESCE($2, notes),
           status = CASE WHEN status = 'pending' THEN 'contacted' ELSE status END,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [contactMethod, notes, id, tenantId]
    );

    res.json({ message: 'Contact recorded successfully' });
  } catch (error: any) {
    logRecallsError('Error recording contact', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/history
 * Get reminder contact history
 */
router.get('/history', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { patientId, campaignId, startDate, endDate, limit = 100 } = req.query;

    let query = `
      SELECT
        rl.*,
        p.first_name,
        p.last_name,
        pr.campaign_id,
        rc.name as campaign_name
      FROM reminder_log rl
      JOIN patients p ON p.id = rl.patient_id
      LEFT JOIN patient_recalls pr ON pr.id = rl.recall_id
      LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id
      WHERE rl.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (patientId) {
      paramCount++;
      query += ` AND rl.patient_id = $${paramCount}`;
      params.push(patientId);
    }

    if (campaignId) {
      paramCount++;
      query += ` AND pr.campaign_id = $${paramCount}`;
      params.push(campaignId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND rl.sent_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND rl.sent_at <= $${paramCount}`;
      params.push(endDate);
    }

    paramCount++;
    query += ` ORDER BY rl.sent_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query<ReminderLogEntry>(query, params);

    res.json({ history: result.rows });
  } catch (error: any) {
    logRecallsError('Error fetching reminder history', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/stats
 * Get campaign statistics
 */
router.get('/stats', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { campaignId, startDate, endDate } = req.query;

    let campaignFilter = '';
    let dateFilter = '';
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (campaignId) {
      paramCount++;
      campaignFilter = ` AND pr.campaign_id = $${paramCount}`;
      params.push(campaignId);
    }

    if (startDate && endDate) {
      paramCount++;
      dateFilter = ` AND pr.created_at BETWEEN $${paramCount} AND $${paramCount + 1}`;
      params.push(startDate);
      paramCount++;
      params.push(endDate);
    }

    // Overall statistics
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) FILTER (WHERE status = 'contacted') as total_contacted,
        COUNT(*) FILTER (WHERE status = 'scheduled') as total_scheduled,
        COUNT(*) FILTER (WHERE status = 'completed') as total_completed,
        COUNT(*) FILTER (WHERE status = 'dismissed') as total_dismissed,
        COUNT(*) as total_recalls
      FROM patient_recalls pr
      WHERE pr.tenant_id = $1 ${campaignFilter} ${dateFilter}`,
      params
    );

    // By campaign breakdown
    const byCampaignResult = await pool.query(
      `SELECT
        rc.id,
        rc.name,
        rc.recall_type,
        COUNT(pr.id) as total_recalls,
        COUNT(*) FILTER (WHERE pr.status = 'pending') as pending,
        COUNT(*) FILTER (WHERE pr.status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE pr.status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE pr.status = 'completed') as completed
      FROM recall_campaigns rc
      LEFT JOIN patient_recalls pr ON pr.campaign_id = rc.id AND pr.tenant_id = rc.tenant_id ${dateFilter}
      WHERE rc.tenant_id = $1 ${campaignFilter}
      GROUP BY rc.id, rc.name, rc.recall_type
      ORDER BY rc.name`,
      params
    );

    // Contact rate and conversion rate
    const stats = statsResult.rows[0];
    const totalContacted = parseInt(stats.total_contacted) + parseInt(stats.total_scheduled) + parseInt(stats.total_completed);
    const contactRate = stats.total_recalls > 0 ? (totalContacted / stats.total_recalls) * 100 : 0;
    const conversionRate = totalContacted > 0 ? ((parseInt(stats.total_scheduled) + parseInt(stats.total_completed)) / totalContacted) * 100 : 0;

    res.json({
      overall: {
        ...stats,
        contactRate: Math.round(contactRate * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
      },
      byCampaign: byCampaignResult.rows,
    });
  } catch (error: any) {
    logRecallsError('Error fetching stats', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/patient/:patientId/preferences
 * Get patient communication preferences
 */
router.get('/patient/:patientId/preferences', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { patientId } = req.params;

    const prefs = await getPatientPreferences(tenantId, patientId!);

    res.json({ preferences: prefs });
  } catch (error: any) {
    logRecallsError('Error fetching patient preferences', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/recalls/patient/:patientId/preferences
 * Update patient communication preferences
 */
router.put('/patient/:patientId/preferences', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { patientId } = req.params;
    const preferences = req.body;

    const updated = await updatePatientPreferences(tenantId, patientId!, preferences);

    res.json(updated);
  } catch (error: any) {
    logRecallsError('Error updating patient preferences', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recalls/bulk-notify
 * Send bulk notifications to multiple patients
 */
router.post('/bulk-notify', async (req: AuthedRequest, res) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { recallIds, notificationType, messageTemplate } = req.body;

    if (!recallIds || !Array.isArray(recallIds) || recallIds.length === 0) {
      return res.status(400).json({ error: 'Recall IDs are required' });
    }

    if (!notificationType) {
      return res.status(400).json({ error: 'Notification type is required' });
    }

    const validTypes = ['email', 'sms', 'phone', 'portal'];
    if (!validTypes.includes(notificationType)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const results = {
      total: recallIds.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ recallId: string; error: string }>,
    };

    // Process each recall
    for (const recallId of recallIds) {
      try {
        // Get recall details
        const recallResult = await pool.query<PatientRecall>(
          `SELECT pr.*, p.first_name, p.last_name, p.email, p.phone
           FROM patient_recalls pr
           JOIN patients p ON p.id = pr.patient_id
           WHERE pr.id = $1 AND pr.tenant_id = $2`,
          [recallId, tenantId]
        );

        if (recallResult.rows.length === 0) {
          results.failed++;
          results.errors.push({ recallId, error: 'Recall not found' });
          continue;
        }

        const recall = recallResult.rows[0]!;

        // Check if patient can be contacted via this method
        const canContact = await canContactPatient(tenantId, recall.patientId, notificationType as any);

        if (!canContact.canContact) {
          results.failed++;
          results.errors.push({ recallId, error: canContact.reason || 'Cannot contact patient' });
          continue;
        }

        // Create notification message
        const messageContent = messageTemplate || `Reminder: You have a scheduled appointment coming up.`;

        // Log the reminder
        await logReminder(
          tenantId,
          recall.patientId,
          recallId,
          notificationType as any,
          messageContent,
          userId
        );

        // Update recall record
        await pool.query(
          `UPDATE patient_recalls
           SET notified_on = NOW(),
               notification_count = COALESCE(notification_count, 0) + 1,
               status = CASE WHEN status = 'pending' THEN 'contacted' ELSE status END,
               updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [recallId, tenantId]
        );

        // Note: reminder_notification_history table not yet created - skip for now
        // The reminder_log table already captures contact history

        results.successful++;
      } catch (err: any) {
        logRecallsError(`Error notifying recall ${recallId}`, err);
        results.failed++;
        results.errors.push({ recallId, error: err.message || 'Unknown error' });
      }
    }

    res.json(results);
  } catch (error: any) {
    logRecallsError('Error in bulk notify', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/:id/notification-history
 * Get notification history for a specific recall
 */
router.get('/:id/notification-history', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    // Use reminder_log table instead of reminder_notification_history
    const result = await pool.query(
      `SELECT
        rl.id,
        rl.tenant_id,
        rl.recall_id,
        rl.patient_id,
        rl.reminder_type as notification_type,
        rl.delivery_status as status,
        rl.message_content,
        rl.sent_by,
        rl.sent_at,
        u.full_name as sent_by_name
      FROM reminder_log rl
      LEFT JOIN users u ON rl.sent_by = u.id::text
      WHERE rl.recall_id = $1 AND rl.tenant_id = $2
      ORDER BY rl.sent_at DESC`,
      [id, tenantId]
    );

    res.json({ history: result.rows });
  } catch (error: any) {
    logRecallsError('Error fetching notification history', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recalls/export
 * Export patient recall list to CSV
 */
router.get('/export', async (req: AuthedRequest, res) => {
  try {
    const { tenantId } = req.user!;
    const { campaignId, status } = req.query;

    let query = `
      SELECT
        p.last_name,
        p.first_name,
        p.email,
        p.phone,
        pr.due_date,
        pr.status,
        pr.last_contact_date,
        pr.contact_method,
        rc.name as campaign_name,
        rc.recall_type
      FROM patient_recalls pr
      JOIN patients p ON p.id = pr.patient_id
      LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id
      WHERE pr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (campaignId) {
      paramCount++;
      query += ` AND pr.campaign_id = $${paramCount}`;
      params.push(campaignId);
    }

    if (status) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY pr.due_date ASC, p.last_name ASC';

    const result = await pool.query(query, params);

    // Generate CSV
    const headers = ['Last Name', 'First Name', 'Email', 'Phone', 'Due Date', 'Status', 'Last Contact', 'Contact Method', 'Campaign', 'Type'];
    const rows = result.rows.map((row) => [
      row.last_name,
      row.first_name,
      row.email || '',
      row.phone || '',
      row.due_date,
      row.status,
      row.last_contact_date || '',
      row.contact_method || '',
      row.campaign_name || '',
      row.recall_type || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="recalls-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error: any) {
    logRecallsError('Error exporting recalls', error);
    res.status(500).json({ error: error.message });
  }
});

export const recallsRouter = router;
