import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import crypto from 'crypto';

const sendMessageSchema = z.object({
  toAddress: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    url: z.string(),
    size: z.number().optional(),
    mimeType: z.string().optional(),
  })).optional(),
});

const createContactSchema = z.object({
  providerName: z.string().min(1),
  specialty: z.string().optional(),
  organization: z.string().optional(),
  directAddress: z.string().email(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().optional(),
});

export const directMessagingRouter = Router();

// GET /api/direct/messages - List Direct messages (inbox/sent)
directMessagingRouter.get('/messages', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const folder = (req.query.folder as string) || 'inbox'; // inbox, sent, all

  try {
    let query = `
      SELECT
        dm.id,
        dm.from_address AS "fromAddress",
        dm.to_address AS "toAddress",
        dm.subject,
        dm.body,
        dm.attachments,
        dm.status,
        dm.sent_at AS "sentAt",
        dm.delivered_at AS "deliveredAt",
        dm.read_at AS "readAt",
        dm.transmission_id AS "transmissionId",
        dm.error_message AS "errorMessage",
        dm.sent_by AS "sentBy",
        dm.reply_to_message_id AS "replyToMessageId",
        dm.created_at AS "createdAt",
        u.email AS "sentByEmail",
        u.first_name || ' ' || u.last_name AS "sentByName"
      FROM direct_messages dm
      LEFT JOIN users u ON u.id = dm.sent_by
      WHERE dm.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (folder === 'inbox') {
      query += ` AND dm.from_address NOT LIKE '%@mountainpinederm.direct'`;
    } else if (folder === 'sent') {
      query += ` AND dm.from_address LIKE '%@mountainpinederm.direct'`;
    }
    // 'all' shows everything

    query += ` ORDER BY dm.sent_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Error fetching Direct messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/direct/send - Send Direct message to external provider
directMessagingRouter.post('/send', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { toAddress, subject, body, attachments } = parsed.data;

  try {
    // Mock Direct protocol - simulate secure email exchange
    // In production, this would integrate with a Direct HISP (Health Information Service Provider)
    const messageId = crypto.randomUUID();
    const transmissionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Simulate transmission delay and success/failure
    const success = Math.random() > 0.05; // 95% success rate
    const status = success ? 'delivered' : 'failed';
    const errorMessage = success ? null : 'Recipient Direct address not found in HISP directory';

    const deliveredAt = success ? new Date(Date.now() + 2000) : null; // 2 second delivery simulation

    await pool.query(
      `INSERT INTO direct_messages (
        id, tenant_id, from_address, to_address, subject, body, attachments,
        status, transmission_id, error_message, sent_by, delivered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        messageId,
        tenantId,
        'provider@mountainpinederm.direct', // Your practice's Direct address
        toAddress,
        subject,
        body || null,
        JSON.stringify(attachments || []),
        status,
        transmissionId,
        errorMessage,
        userId,
        deliveredAt,
      ]
    );

    await auditLog(tenantId, userId, 'direct_message_send', 'direct_message', messageId);

    res.status(201).json({
      id: messageId,
      status,
      transmissionId,
      message: success
        ? 'Direct message sent successfully'
        : 'Direct message send failed',
      errorMessage,
    });
  } catch (err) {
    console.error('Error sending Direct message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/direct/contacts - List external provider directory
directMessagingRouter.get('/contacts', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const search = req.query.search as string;
  const specialty = req.query.specialty as string;
  const favoritesOnly = req.query.favoritesOnly === 'true';

  try {
    let query = `
      SELECT
        dc.id,
        dc.provider_name AS "providerName",
        dc.specialty,
        dc.organization,
        dc.direct_address AS "directAddress",
        dc.phone,
        dc.fax,
        dc.address,
        dc.notes,
        dc.is_favorite AS "isFavorite",
        dc.created_at AS "createdAt",
        dc.updated_at AS "updatedAt"
      FROM direct_contacts dc
      WHERE dc.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (
        dc.provider_name ILIKE $${params.length}
        OR dc.organization ILIKE $${params.length}
        OR dc.direct_address ILIKE $${params.length}
      )`;
    }

    if (specialty) {
      params.push(specialty);
      query += ` AND dc.specialty = $${params.length}`;
    }

    if (favoritesOnly) {
      query += ` AND dc.is_favorite = true`;
    }

    query += ` ORDER BY dc.is_favorite DESC, dc.provider_name ASC`;

    const result = await pool.query(query, params);

    res.json({ contacts: result.rows });
  } catch (err) {
    console.error('Error fetching Direct contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/direct/contacts - Add external provider contact
directMessagingRouter.post('/contacts', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const data = parsed.data;

  try {
    // Check if contact already exists
    const existing = await pool.query(
      'SELECT id FROM direct_contacts WHERE direct_address = $1 AND tenant_id = $2',
      [data.directAddress, tenantId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Contact with this Direct address already exists' });
    }

    const contactId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO direct_contacts (
        id, tenant_id, provider_name, specialty, organization, direct_address,
        phone, fax, address, notes, is_favorite, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        contactId,
        tenantId,
        data.providerName,
        data.specialty || null,
        data.organization || null,
        data.directAddress,
        data.phone || null,
        data.fax || null,
        data.address || null,
        data.notes || null,
        data.isFavorite || false,
        userId,
      ]
    );

    await auditLog(tenantId, userId, 'direct_contact_create', 'direct_contact', contactId);

    const result = await pool.query(
      `SELECT
        id,
        provider_name AS "providerName",
        specialty,
        organization,
        direct_address AS "directAddress",
        phone,
        fax,
        address,
        notes,
        is_favorite AS "isFavorite",
        created_at AS "createdAt"
      FROM direct_contacts
      WHERE id = $1`,
      [contactId]
    );

    res.status(201).json({ contact: result.rows[0] });
  } catch (err) {
    console.error('Error creating Direct contact:', err);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PATCH /api/direct/messages/:id - Mark as read
directMessagingRouter.patch('/messages/:id', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const messageId = req.params.id;
  const { read } = req.body;

  try {
    // Verify message belongs to tenant
    const check = await pool.query(
      'SELECT id FROM direct_messages WHERE id = $1 AND tenant_id = $2',
      [messageId, tenantId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (read === true) {
      await pool.query(
        'UPDATE direct_messages SET read_at = NOW() WHERE id = $1 AND read_at IS NULL',
        [messageId]
      );
    } else if (read === false) {
      await pool.query(
        'UPDATE direct_messages SET read_at = NULL WHERE id = $1',
        [messageId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating Direct message:', err);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// GET /api/direct/messages/:id/attachments - Get message attachments
directMessagingRouter.get('/messages/:id/attachments', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const messageId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT attachments FROM direct_messages WHERE id = $1 AND tenant_id = $2',
      [messageId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const attachments = result.rows[0].attachments || [];

    res.json({ attachments });
  } catch (err) {
    console.error('Error fetching message attachments:', err);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// GET /api/direct/stats - Get Direct messaging statistics
directMessagingRouter.get('/stats', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE from_address NOT LIKE '%@mountainpinederm.direct') AS "inboxTotal",
        COUNT(*) FILTER (WHERE from_address NOT LIKE '%@mountainpinederm.direct' AND read_at IS NULL) AS "unreadTotal",
        COUNT(*) FILTER (WHERE from_address LIKE '%@mountainpinederm.direct') AS "sentTotal",
        COUNT(*) FILTER (WHERE status = 'delivered') AS "deliveredTotal",
        COUNT(*) FILTER (WHERE status = 'failed') AS "failedTotal"
      FROM direct_messages
      WHERE tenant_id = $1`,
      [tenantId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching Direct messaging stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
