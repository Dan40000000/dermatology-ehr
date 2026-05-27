import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';
import { SMSService } from '../services/smsService';
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
const VALID_CONTACT_METHODS = ['email', 'sms', 'phone', 'mail', 'portal'] as const;
type ContactMethod = (typeof VALID_CONTACT_METHODS)[number];

function campaignSelect(): string {
  return `
    id,
    tenant_id as "tenantId",
    name,
    description,
    recall_type as "recallType",
    interval_months as "intervalMonths",
    is_active as "isActive",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}

function patientRecallSelect(prefix = 'pr'): string {
  return `
    ${prefix}.id,
    ${prefix}.tenant_id as "tenantId",
    ${prefix}.patient_id as "patientId",
    ${prefix}.campaign_id as "campaignId",
    COALESCE(${prefix}.due_date, ${prefix}.recall_date) as "dueDate",
    ${prefix}.recall_date as "recallDate",
    COALESCE(${prefix}.recall_type, rc.recall_type) as "recallType",
    ${prefix}.status,
    ${prefix}.last_contact_date as "lastContactDate",
    ${prefix}.contact_method as "contactMethod",
    ${prefix}.notes,
    ${prefix}.doctor_notes as "doctorNotes",
    ${prefix}.preferred_contact_method as "preferredContactMethod",
    ${prefix}.notified_on as "notifiedOn",
    ${prefix}.notification_count as "notificationCount",
    ${prefix}.appointment_id as "appointmentId",
    ${prefix}.created_at as "createdAt",
    ${prefix}.updated_at as "updatedAt"
  `;
}

function patientRecallReturning(prefix = 'patient_recalls'): string {
  return `
    ${prefix}.id,
    ${prefix}.tenant_id as "tenantId",
    ${prefix}.patient_id as "patientId",
    ${prefix}.campaign_id as "campaignId",
    COALESCE(${prefix}.due_date, ${prefix}.recall_date) as "dueDate",
    ${prefix}.recall_date as "recallDate",
    ${prefix}.recall_type as "recallType",
    ${prefix}.status,
    ${prefix}.last_contact_date as "lastContactDate",
    ${prefix}.contact_method as "contactMethod",
    ${prefix}.notes,
    ${prefix}.doctor_notes as "doctorNotes",
    ${prefix}.preferred_contact_method as "preferredContactMethod",
    ${prefix}.notified_on as "notifiedOn",
    ${prefix}.notification_count as "notificationCount",
    ${prefix}.appointment_id as "appointmentId",
    ${prefix}.created_at as "createdAt",
    ${prefix}.updated_at as "updatedAt"
  `;
}

function defaultRecallMessage(recall: Record<string, any>): string {
  const template = recall.messageTemplate || recall.message_template;
  if (template) {
    return template;
  }

  // Avoid diagnosis-specific PHI in SMS by default.
  return 'Dermatology DEMO Office: You are due for a dermatology follow-up visit. Please call us or reply to schedule. Reply STOP to opt out.';
}

function getRecallPatientId(recall: Record<string, any>): string | undefined {
  return recall.patientId || recall.patient_id;
}

async function sendSmsIfRequested(
  tenantId: string,
  userId: string,
  patientId: string,
  messageContent: string
): Promise<{ ok: boolean; error?: string }> {
  const smsService = new SMSService(tenantId);
  const smsResult = await smsService.sendSMS({
    patientId,
    message: messageContent,
    userId,
    messageType: 'reminder',
  });

  if (!smsResult.success) {
    return { ok: false, error: smsResult.error || 'Failed to send SMS' };
  }

  return { ok: true };
}

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
      `SELECT ${campaignSelect()} FROM recall_campaigns
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
      RETURNING ${campaignSelect()}`,
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
       RETURNING ${campaignSelect()}`,
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
    const statusFilter = Array.isArray(status) ? status[0] : status;

    let query = `
      SELECT
        ${patientRecallSelect('pr')},
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.email,
        p.phone,
        p.dob as "dateOfBirth",
        rc.name as "campaignName",
        rc.recall_type as "campaignRecallType",
        latest_log.reminder_type as "lastReminderType",
        latest_log.sent_at as "lastReminderSentAt",
        latest_log.delivery_status as "lastReminderDeliveryStatus",
        latest_thread.id as "textThreadId",
        latest_thread.status as "textThreadStatus",
        (
          SELECT COUNT(*)::int
          FROM reminder_log rl
          WHERE rl.recall_id = pr.id
        ) as "contactAttempts"
      FROM patient_recalls pr
      JOIN patients p ON p.id = pr.patient_id
      LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id AND rc.tenant_id = pr.tenant_id
      LEFT JOIN LATERAL (
        SELECT rl.reminder_type, rl.sent_at, rl.delivery_status
        FROM reminder_log rl
        WHERE rl.recall_id = pr.id
        ORDER BY rl.sent_at DESC
        LIMIT 1
      ) latest_log ON true
      LEFT JOIN LATERAL (
        SELECT t.id, t.status
        FROM patient_message_threads t
        WHERE t.patient_id = pr.patient_id
          AND t.tenant_id = pr.tenant_id
        ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
        LIMIT 1
      ) latest_thread ON true
      WHERE pr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND COALESCE(pr.due_date, pr.recall_date) >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND COALESCE(pr.due_date, pr.recall_date) <= $${paramCount}`;
      params.push(endDate);
    }

    if (campaignId) {
      paramCount++;
      query += ` AND pr.campaign_id = $${paramCount}`;
      params.push(campaignId);
    }

    if (statusFilter && statusFilter !== 'all') {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      params.push(statusFilter);
    } else if (!statusFilter) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      params.push('pending');
    }

    query += ' ORDER BY COALESCE(pr.due_date, pr.recall_date) ASC, p.last_name ASC';

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
    const { patientId, campaignId, dueDate, notes, recallType } = req.body;

    if (!patientId || !dueDate) {
      return res.status(400).json({ error: 'Patient ID and due date are required' });
    }

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let resolvedRecallType = recallType || 'Manual Recall';

    if (campaignId) {
      const campaignResult = await pool.query(
        `SELECT id, recall_type as "recallType"
         FROM recall_campaigns
         WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [campaignId, tenantId]
      );

      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ error: 'Recall campaign not found' });
      }

      resolvedRecallType = campaignResult.rows[0].recallType || resolvedRecallType;

      const duplicateResult = await pool.query(
        `SELECT id
         FROM patient_recalls
         WHERE tenant_id = $1
           AND patient_id = $2
           AND campaign_id = $3
           AND status IN ('pending', 'contacted', 'scheduled')
         LIMIT 1`,
        [tenantId, patientId, campaignId]
      );

      if (duplicateResult.rows.length > 0) {
        return res.status(409).json({ error: 'Patient already has an active recall for this campaign' });
      }
    }

    const id = randomUUID();

    const result = await pool.query<PatientRecall>(
      `INSERT INTO patient_recalls (
        id,
        tenant_id,
        patient_id,
        campaign_id,
        due_date,
        recall_date,
        recall_type,
        status,
        notes,
        created_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $5,
        $7,
        'pending',
        $6,
        NOW(),
        NOW()
      )
      RETURNING ${patientRecallReturning('patient_recalls')}`,
      [id, tenantId, patientId, campaignId || null, dueDate, notes, resolvedRecallType]
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
       RETURNING ${patientRecallReturning('patient_recalls')}`,
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

    if (!VALID_CONTACT_METHODS.includes(contactMethod)) {
      return res.status(400).json({ error: 'Invalid contact method' });
    }

    // Get recall details
    const recallResult = await pool.query(
      `SELECT
        ${patientRecallSelect('pr')},
        p.first_name as "firstName",
        p.last_name as "lastName",
        p.phone,
        p.email,
        rc.name as "campaignName",
        rc.message_template as "messageTemplate"
       FROM patient_recalls pr
       JOIN patients p ON p.id = pr.patient_id
       LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id AND rc.tenant_id = pr.tenant_id
       WHERE pr.id = $1 AND pr.tenant_id = $2`,
      [id, tenantId]
    );

    if (recallResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recall not found' });
    }

    const recall = recallResult.rows[0]!;
    const patientId = getRecallPatientId(recall);

    if (!patientId) {
      return res.status(500).json({ error: 'Recall is missing a patient link' });
    }

    // Check if patient can be contacted via this method
    const canContact = await canContactPatient(tenantId, patientId, contactMethod as ContactMethod);

    if (!canContact.canContact) {
      return res.status(403).json({ error: canContact.reason });
    }

    const outboundMessage = messageContent || defaultRecallMessage(recall);

    if (contactMethod === 'sms') {
      const smsResult = await sendSmsIfRequested(tenantId, userId, patientId, outboundMessage);

      if (!smsResult.ok) {
        await logReminder(
          tenantId,
          patientId,
          id!,
          contactMethod,
          outboundMessage,
          userId,
          'failed',
          smsResult.error
        );

        return res.status(502).json({ error: smsResult.error || 'Failed to send SMS recall reminder' });
      }
    }

    // Log the reminder
    await logReminder(
      tenantId,
      patientId,
      id!,
      contactMethod,
      outboundMessage,
      userId
    );

    // Update recall record
    await pool.query(
      `UPDATE patient_recalls
       SET last_contact_date = CURRENT_DATE,
           contact_method = $1,
           notes = COALESCE($2, notes),
           notified_on = CASE WHEN $1 IN ('email', 'sms', 'portal') THEN NOW() ELSE notified_on END,
           notification_count = CASE
             WHEN $1 IN ('email', 'sms', 'portal') THEN COALESCE(notification_count, 0) + 1
             ELSE notification_count
           END,
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
        rl.id,
        rl.tenant_id as "tenantId",
        rl.patient_id as "patientId",
        rl.recall_id as "recallId",
        rl.reminder_type as "reminderType",
        rl.sent_at as "sentAt",
        rl.delivery_status as "deliveryStatus",
        rl.message_content as "messageContent",
        rl.sent_by as "sentBy",
        rl.error_message as "errorMessage",
        p.first_name as "firstName",
        p.last_name as "lastName",
        pr.campaign_id as "campaignId",
        rc.name as "campaignName"
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
        COUNT(*) FILTER (WHERE status = 'pending')::int as total_pending,
        COUNT(*) FILTER (WHERE status = 'contacted')::int as total_contacted,
        COUNT(*) FILTER (WHERE status = 'scheduled')::int as total_scheduled,
        COUNT(*) FILTER (WHERE status = 'completed')::int as total_completed,
        COUNT(*) FILTER (WHERE status = 'dismissed')::int as total_dismissed,
        COUNT(*) FILTER (
          WHERE status NOT IN ('completed', 'dismissed', 'scheduled')
            AND COALESCE(due_date, recall_date) < CURRENT_DATE
        )::int as total_overdue,
        COUNT(*)::int as total_recalls
      FROM patient_recalls pr
      WHERE pr.tenant_id = $1 ${campaignFilter} ${dateFilter}`,
      params
    );

    // By campaign breakdown
    const byCampaignResult = await pool.query(
      `SELECT
        rc.id,
        rc.name,
        rc.recall_type as "recallType",
        COUNT(pr.id)::int as total_recalls,
        COUNT(*) FILTER (WHERE pr.status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE pr.status = 'contacted')::int as contacted,
        COUNT(*) FILTER (WHERE pr.status = 'scheduled')::int as scheduled,
        COUNT(*) FILTER (WHERE pr.status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE pr.status = 'dismissed')::int as dismissed,
        COUNT(*) FILTER (
          WHERE pr.status NOT IN ('completed', 'dismissed', 'scheduled')
            AND COALESCE(pr.due_date, pr.recall_date) < CURRENT_DATE
        )::int as overdue
      FROM recall_campaigns rc
      LEFT JOIN patient_recalls pr ON pr.campaign_id = rc.id AND pr.tenant_id = rc.tenant_id ${dateFilter}
      WHERE rc.tenant_id = $1 ${campaignFilter}
      GROUP BY rc.id, rc.name, rc.recall_type
      ORDER BY rc.name`,
      params
    );

    // Contact rate and conversion rate
    const stats = statsResult.rows[0];
    const totalContacted = Number(stats.total_contacted) + Number(stats.total_scheduled) + Number(stats.total_completed);
    const contactRate = stats.total_recalls > 0 ? (totalContacted / stats.total_recalls) * 100 : 0;
    const conversionRate = totalContacted > 0 ? ((Number(stats.total_scheduled) + Number(stats.total_completed)) / totalContacted) * 100 : 0;

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

    const validTypes = ['email', 'sms', 'phone', 'portal'] as const;
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
        const recallResult = await pool.query(
          `SELECT
             ${patientRecallSelect('pr')},
             p.first_name as "firstName",
             p.last_name as "lastName",
             p.email,
             p.phone,
             rc.name as "campaignName",
             rc.message_template as "messageTemplate"
           FROM patient_recalls pr
           JOIN patients p ON p.id = pr.patient_id
           LEFT JOIN recall_campaigns rc ON rc.id = pr.campaign_id AND rc.tenant_id = pr.tenant_id
           WHERE pr.id = $1 AND pr.tenant_id = $2`,
          [recallId, tenantId]
        );

        if (recallResult.rows.length === 0) {
          results.failed++;
          results.errors.push({ recallId, error: 'Recall not found' });
          continue;
        }

        const recall = recallResult.rows[0]!;
        const patientId = getRecallPatientId(recall);

        if (!patientId) {
          results.failed++;
          results.errors.push({ recallId, error: 'Recall is missing a patient link' });
          continue;
        }

        // Check if patient can be contacted via this method
        const canContact = await canContactPatient(tenantId, patientId, notificationType as ContactMethod);

        if (!canContact.canContact) {
          results.failed++;
          results.errors.push({ recallId, error: canContact.reason || 'Cannot contact patient' });
          continue;
        }

        // Create notification message
        const messageContent = messageTemplate || defaultRecallMessage(recall);

        if (notificationType === 'sms') {
          const smsResult = await sendSmsIfRequested(tenantId, userId, patientId, messageContent);

          if (!smsResult.ok) {
            await logReminder(
              tenantId,
              patientId,
              recallId,
              notificationType,
              messageContent,
              userId,
              'failed',
              smsResult.error
            );

            results.failed++;
            results.errors.push({ recallId, error: smsResult.error || 'Failed to send SMS' });
            continue;
          }
        }

        // Log the reminder
        await logReminder(
          tenantId,
          patientId,
          recallId,
          notificationType,
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
        rl.tenant_id as "tenantId",
        rl.recall_id as "recallId",
        rl.patient_id as "patientId",
        rl.reminder_type as "notificationType",
        rl.delivery_status as status,
        rl.message_content as "messageContent",
        rl.sent_by as "sentBy",
        rl.sent_at as "sentAt",
        u.full_name as "sentByName"
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
        COALESCE(pr.due_date, pr.recall_date) as due_date,
        pr.status,
        pr.last_contact_date,
        pr.contact_method,
        rc.name as campaign_name,
        COALESCE(pr.recall_type, rc.recall_type) as recall_type
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

    query += ' ORDER BY COALESCE(pr.due_date, pr.recall_date) ASC, p.last_name ASC';

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
