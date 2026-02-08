import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { communicationHubService, TemplateCategory } from '../services/communicationHubService';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';

export const communicationsRouter = Router();

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createConversationSchema = z.object({
  patientId: z.string().uuid(),
  subject: z.string().max(500).optional(),
  channel: z.enum(['sms', 'email', 'portal', 'phone']),
  assignedTo: z.string().uuid().optional(),
});

const updateConversationSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  attachments: z.array(z.object({
    filename: z.string(),
    url: z.string().url(),
    mimeType: z.string(),
    size: z.number(),
  })).optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['appointment', 'billing', 'clinical', 'marketing', 'recall', 'general']),
  subject: z.string().max(500).optional(),
  content: z.string().min(1),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    defaultValue: z.string().optional(),
  })).optional(),
  channel: z.string().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.enum(['appointment', 'billing', 'clinical', 'marketing', 'recall', 'general']).optional(),
  subject: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    defaultValue: z.string().optional(),
  })).optional(),
  channel: z.string().optional(),
  isActive: z.boolean().optional(),
});

const useTemplateSchema = z.object({
  variables: z.record(z.string(), z.string()),
});

const createBroadcastSchema = z.object({
  name: z.string().min(1).max(255),
  content: z.string().min(1),
  subject: z.string().max(500).optional(),
  channel: z.enum(['sms', 'email', 'portal']),
  targetCriteria: z.object({
    patientFilters: z.object({
      lastVisitDays: z.number().optional(),
      tags: z.array(z.string()).optional(),
      diagnoses: z.array(z.string()).optional(),
      ageMin: z.number().optional(),
      ageMax: z.number().optional(),
      insuranceType: z.string().optional(),
    }).optional(),
    includeIds: z.array(z.string().uuid()).optional(),
    excludeIds: z.array(z.string().uuid()).optional(),
  }),
  templateId: z.string().uuid().optional(),
});

const scheduleBroadcastSchema = z.object({
  scheduledAt: z.string().datetime(),
});

const updatePreferencesSchema = z.object({
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  portalEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  preferredChannel: z.enum(['sms', 'email', 'portal']).optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  language: z.string().optional(),
});

const unsubscribeSchema = z.object({
  patientId: z.string().uuid(),
  channel: z.enum(['sms', 'email', 'marketing', 'all']),
  reason: z.string().optional(),
});

const inboundSmsSchema = z.object({
  from: z.string(),
  to: z.string(),
  body: z.string(),
  messageId: z.string().optional(),
});

const inboundEmailSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().optional(),
  body: z.string(),
  messageId: z.string().optional(),
});

// =====================================================
// CONVERSATIONS
// =====================================================

/**
 * GET /communications/conversations
 * List conversations with filters
 */
communicationsRouter.get('/conversations', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const filters = {
      status: req.query.status as string,
      channel: req.query.channel as string,
      assignedTo: req.query.assignedTo as string,
      patientId: req.query.patientId as string,
      priority: req.query.priority as string,
      search: req.query.search as string,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    };

    const result = await communicationHubService.getConversations(tenantId, filters);

    return res.json({
      conversations: result.conversations,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error: any) {
    logger.error('Error listing conversations', { error: error.message });
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * POST /communications/conversations
 * Create a new conversation
 */
communicationsRouter.post('/conversations', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const { patientId, subject, channel, assignedTo } = parsed.data;

    const conversation = await communicationHubService.createConversation(
      tenantId,
      patientId,
      subject || null,
      channel,
      assignedTo
    );

    await auditLog(tenantId, req.user!.id, 'conversation_created', 'conversation', conversation.id);

    return res.status(201).json(conversation);
  } catch (error: any) {
    logger.error('Error creating conversation', { error: error.message });
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /communications/conversations/:id
 * Get conversation with messages
 */
communicationsRouter.get('/conversations/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.params.id);

    const result = await communicationHubService.getConversation(tenantId, conversationId);

    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json(result);
  } catch (error: any) {
    logger.error('Error getting conversation', { error: error.message });
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * PATCH /communications/conversations/:id
 * Update conversation (assign, close, change priority, etc.)
 */
communicationsRouter.patch('/conversations/:id', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.params.id);
    const updates = parsed.data;

    if (updates.assignedTo) {
      await communicationHubService.assignConversation(tenantId, conversationId, updates.assignedTo);
    }

    if (updates.status === 'closed') {
      await communicationHubService.closeConversation(tenantId, conversationId, req.user!.id);
    } else if (updates.status === 'open') {
      await communicationHubService.reopenConversation(tenantId, conversationId);
    }

    if (updates.priority) {
      await communicationHubService.updateConversationPriority(tenantId, conversationId, updates.priority);
    }

    const result = await communicationHubService.getConversation(tenantId, conversationId);

    await auditLog(tenantId, req.user!.id, 'conversation_updated', 'conversation', conversationId);

    return res.json(result?.conversation);
  } catch (error: any) {
    logger.error('Error updating conversation', { error: error.message });
    return res.status(500).json({ error: error.message || 'Failed to update conversation' });
  }
});

/**
 * GET /communications/conversations/:id/messages
 * Get messages for a conversation
 */
communicationsRouter.get('/conversations/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.params.id);

    const result = await communicationHubService.getConversation(tenantId, conversationId);

    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json({ messages: result.messages });
  } catch (error: any) {
    logger.error('Error getting messages', { error: error.message });
    return res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /communications/conversations/:id/messages
 * Send a message in a conversation
 */
communicationsRouter.post('/conversations/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.params.id);
    const { content, attachments } = parsed.data;

    const message = await communicationHubService.sendMessage(
      tenantId,
      conversationId,
      req.user!.id,
      content,
      attachments || []
    );

    await auditLog(tenantId, req.user!.id, 'message_sent', 'message', message.id);

    return res.status(201).json(message);
  } catch (error: any) {
    logger.error('Error sending message', { error: error.message });
    return res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

/**
 * POST /communications/conversations/:id/read
 * Mark all messages in conversation as read
 */
communicationsRouter.post('/conversations/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.params.id);

    await communicationHubService.markAllRead(tenantId, conversationId);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Error marking messages as read', { error: error.message });
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// =====================================================
// INBOX
// =====================================================

/**
 * GET /communications/inbox
 * Get staff inbox with conversations
 */
communicationsRouter.get('/inbox', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const filters = {
      unreadOnly: req.query.unreadOnly === 'true',
      assignedToMe: req.query.assignedToMe !== 'false', // Default to true
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    };

    const result = await communicationHubService.getInbox(tenantId, userId, filters);

    return res.json(result);
  } catch (error: any) {
    logger.error('Error getting inbox', { error: error.message });
    return res.status(500).json({ error: 'Failed to get inbox' });
  }
});

/**
 * GET /communications/inbox/unread-count
 * Get unread message count for current user
 */
communicationsRouter.get('/inbox/unread-count', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const count = await communicationHubService.getUnreadCount(tenantId, userId);

    return res.json({ unreadCount: count });
  } catch (error: any) {
    logger.error('Error getting unread count', { error: error.message });
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * GET /communications/search
 * Search messages
 */
communicationsRouter.get('/search', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const result = await communicationHubService.searchMessages(tenantId, query, limit);

    return res.json(result);
  } catch (error: any) {
    logger.error('Error searching messages', { error: error.message });
    return res.status(500).json({ error: 'Failed to search messages' });
  }
});

// =====================================================
// TEMPLATES
// =====================================================

/**
 * GET /communications/templates
 * List message templates
 */
communicationsRouter.get('/templates', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const category = req.query.category as TemplateCategory | undefined;
    const channel = req.query.channel as string | undefined;

    const templates = await communicationHubService.getTemplates(tenantId, category, channel);

    return res.json({ templates });
  } catch (error: any) {
    logger.error('Error listing templates', { error: error.message });
    return res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * POST /communications/templates
 * Create a message template
 */
communicationsRouter.post('/templates', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const template = await communicationHubService.createTemplate(tenantId, parsed.data, req.user!.id);

    await auditLog(tenantId, req.user!.id, 'template_created', 'message_template', template.id);

    return res.status(201).json(template);
  } catch (error: any) {
    logger.error('Error creating template', { error: error.message });
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * GET /communications/templates/categories
 * Get template categories
 */
communicationsRouter.get('/templates/categories', requireAuth, async (req: AuthedRequest, res) => {
  const categories = communicationHubService.getTemplateCategories();
  return res.json({ categories });
});

/**
 * GET /communications/templates/:id
 * Get a specific template
 */
communicationsRouter.get('/templates/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const templateId = String(req.params.id);
    const templates = await communicationHubService.getTemplates(tenantId);
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(template);
  } catch (error: any) {
    logger.error('Error getting template', { error: error.message });
    return res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * PATCH /communications/templates/:id
 * Update a template
 */
communicationsRouter.patch('/templates/:id', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const templateId = String(req.params.id);
    const template = await communicationHubService.updateTemplate(tenantId, templateId, parsed.data);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await auditLog(tenantId, req.user!.id, 'template_updated', 'message_template', templateId);

    return res.json(template);
  } catch (error: any) {
    logger.error('Error updating template', { error: error.message });
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * POST /communications/templates/:id/use
 * Render a template with variables
 */
communicationsRouter.post('/templates/:id/use', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = useTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const templateId = String(req.params.id);
    const rendered = await communicationHubService.useTemplate(tenantId, templateId, parsed.data.variables);

    return res.json(rendered);
  } catch (error: any) {
    logger.error('Error using template', { error: error.message });
    return res.status(500).json({ error: error.message || 'Failed to use template' });
  }
});

// =====================================================
// BROADCASTS
// =====================================================

/**
 * GET /communications/broadcasts
 * List broadcasts
 */
communicationsRouter.get('/broadcasts', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await communicationHubService.listBroadcasts(tenantId, status, limit, offset);

    return res.json({
      broadcasts: result.broadcasts,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: any) {
    logger.error('Error listing broadcasts', { error: error.message });
    return res.status(500).json({ error: 'Failed to list broadcasts' });
  }
});

/**
 * POST /communications/broadcasts
 * Create a broadcast
 */
communicationsRouter.post('/broadcasts', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  const parsed = createBroadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const broadcast = await communicationHubService.createBroadcast(tenantId, parsed.data, req.user!.id);

    await auditLog(tenantId, req.user!.id, 'broadcast_created', 'broadcast_message', broadcast.id);

    return res.status(201).json(broadcast);
  } catch (error: any) {
    logger.error('Error creating broadcast', { error: error.message });
    return res.status(500).json({ error: 'Failed to create broadcast' });
  }
});

/**
 * GET /communications/broadcasts/:id
 * Get broadcast with stats
 */
communicationsRouter.get('/broadcasts/:id', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const broadcastId = String(req.params.id);
    const broadcast = await communicationHubService.getBroadcast(tenantId, broadcastId);

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    const stats = await communicationHubService.getBroadcastStats(tenantId, broadcastId);

    return res.json({ broadcast, stats });
  } catch (error: any) {
    logger.error('Error getting broadcast', { error: error.message });
    return res.status(500).json({ error: 'Failed to get broadcast' });
  }
});

/**
 * POST /communications/broadcasts/:id/send
 * Send broadcast immediately
 */
communicationsRouter.post('/broadcasts/:id/send', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const broadcastId = String(req.params.id);
    const broadcast = await communicationHubService.sendBroadcast(tenantId, broadcastId);

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found or already sent' });
    }

    await auditLog(tenantId, req.user!.id, 'broadcast_sent', 'broadcast_message', broadcastId);

    return res.json(broadcast);
  } catch (error: any) {
    logger.error('Error sending broadcast', { error: error.message });
    return res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

/**
 * POST /communications/broadcasts/:id/schedule
 * Schedule broadcast for later
 */
communicationsRouter.post('/broadcasts/:id/schedule', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  const parsed = scheduleBroadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const broadcastId = String(req.params.id);
    const scheduledAt = new Date(parsed.data.scheduledAt);

    if (scheduledAt <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const broadcast = await communicationHubService.scheduleBroadcast(tenantId, broadcastId, scheduledAt);

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found or already scheduled' });
    }

    await auditLog(tenantId, req.user!.id, 'broadcast_scheduled', 'broadcast_message', broadcastId);

    return res.json(broadcast);
  } catch (error: any) {
    logger.error('Error scheduling broadcast', { error: error.message });
    return res.status(500).json({ error: 'Failed to schedule broadcast' });
  }
});

/**
 * DELETE /communications/broadcasts/:id
 * Cancel broadcast
 */
communicationsRouter.delete('/broadcasts/:id', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const broadcastId = String(req.params.id);
    const cancelled = await communicationHubService.cancelBroadcast(tenantId, broadcastId);

    if (!cancelled) {
      return res.status(404).json({ error: 'Broadcast not found or cannot be cancelled' });
    }

    await auditLog(tenantId, req.user!.id, 'broadcast_cancelled', 'broadcast_message', broadcastId);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Error cancelling broadcast', { error: error.message });
    return res.status(500).json({ error: 'Failed to cancel broadcast' });
  }
});

// =====================================================
// PREFERENCES
// =====================================================

/**
 * GET /communications/preferences/:patientId
 * Get patient communication preferences
 */
communicationsRouter.get('/preferences/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const preferences = await communicationHubService.getPatientPreferences(tenantId, patientId);

    return res.json(preferences);
  } catch (error: any) {
    logger.error('Error getting preferences', { error: error.message });
    return res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * PATCH /communications/preferences/:patientId
 * Update patient communication preferences
 */
communicationsRouter.patch('/preferences/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const preferences = await communicationHubService.updatePatientPreferences(
      tenantId,
      patientId,
      parsed.data
    );

    await auditLog(tenantId, req.user!.id, 'preferences_updated', 'communication_preferences', preferences.id);

    return res.json(preferences);
  } catch (error: any) {
    logger.error('Error updating preferences', { error: error.message });
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /communications/unsubscribe
 * Unsubscribe patient from channel
 */
communicationsRouter.post('/unsubscribe', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    await communicationHubService.unsubscribe(
      tenantId,
      parsed.data.patientId,
      parsed.data.channel,
      parsed.data.reason
    );

    await auditLog(tenantId, req.user!.id, 'patient_unsubscribed', 'patient', parsed.data.patientId);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Error unsubscribing', { error: error.message });
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// =====================================================
// WEBHOOKS
// =====================================================

/**
 * POST /communications/webhook/sms
 * Inbound SMS webhook
 */
communicationsRouter.post('/webhook/sms', async (req, res) => {
  const parsed = inboundSmsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const { from, body, messageId } = parsed.data;

    // Look up patient by phone number
    // This is a simplified lookup - in production would need more robust matching
    const { pool } = require('../db/pool');
    const patientResult = await pool.query(
      `SELECT id, tenant_id FROM patients
       WHERE phone = $1 OR phone = $2
       LIMIT 1`,
      [from, from.replace(/^\+1/, '')] // Try with and without +1
    );

    if (!patientResult.rowCount) {
      logger.warn('Inbound SMS from unknown number', { from });
      return res.status(200).json({ success: true, message: 'Unknown sender' });
    }

    const { id: patientId, tenant_id: tenantId } = patientResult.rows[0];

    const result = await communicationHubService.receiveInboundMessage(
      tenantId,
      patientId,
      'sms',
      body,
      messageId
    );

    logger.info('Inbound SMS processed', { from, conversationId: result.conversation.id });

    return res.json({ success: true, conversationId: result.conversation.id });
  } catch (error: any) {
    logger.error('Error processing inbound SMS', { error: error.message });
    return res.status(500).json({ error: 'Failed to process inbound SMS' });
  }
});

/**
 * POST /communications/webhook/email
 * Inbound email webhook
 */
communicationsRouter.post('/webhook/email', async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const { from, body, messageId } = parsed.data;

    // Look up patient by email
    const { pool } = require('../db/pool');
    const patientResult = await pool.query(
      `SELECT id, tenant_id FROM patients
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [from]
    );

    if (!patientResult.rowCount) {
      logger.warn('Inbound email from unknown address', { from });
      return res.status(200).json({ success: true, message: 'Unknown sender' });
    }

    const { id: patientId, tenant_id: tenantId } = patientResult.rows[0];

    const result = await communicationHubService.receiveInboundMessage(
      tenantId,
      patientId,
      'email',
      body,
      messageId
    );

    logger.info('Inbound email processed', { from, conversationId: result.conversation.id });

    return res.json({ success: true, conversationId: result.conversation.id });
  } catch (error: any) {
    logger.error('Error processing inbound email', { error: error.message });
    return res.status(500).json({ error: 'Failed to process inbound email' });
  }
});
