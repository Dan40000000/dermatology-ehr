import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// =====================================================
// TYPES
// =====================================================

export interface Conversation {
  id: string;
  tenantId: string;
  patientId: string;
  subject: string | null;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  channel: 'sms' | 'email' | 'portal' | 'phone';
  assignedTo: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  lastMessageAt: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface ConversationWithPatient extends Conversation {
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'patient' | 'staff' | 'system' | 'auto';
  senderId: string | null;
  content: string;
  contentType: 'text' | 'html' | 'template';
  attachments: Attachment[];
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface Attachment {
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: TemplateCategory;
  subject: string | null;
  content: string;
  variables: TemplateVariable[];
  channel: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
}

export type TemplateCategory = 'appointment' | 'billing' | 'clinical' | 'marketing' | 'recall' | 'general';

export interface BroadcastMessage {
  id: string;
  tenantId: string;
  name: string;
  content: string;
  subject: string | null;
  channel: 'sms' | 'email' | 'portal';
  targetCriteria: BroadcastCriteria;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
  createdAt: string;
}

export interface BroadcastCriteria {
  patientFilters?: {
    lastVisitDays?: number;
    tags?: string[];
    diagnoses?: string[];
    ageMin?: number;
    ageMax?: number;
    insuranceType?: string;
  };
  includeIds?: string[];
  excludeIds?: string[];
}

export interface BroadcastRecipient {
  id: string;
  broadcastId: string;
  patientId: string;
  patientName?: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'unsubscribed';
}

export interface CommunicationPreferences {
  id: string;
  tenantId: string;
  patientId: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  portalEnabled: boolean;
  marketingEnabled: boolean;
  reminderEnabled: boolean;
  preferredChannel: 'sms' | 'email' | 'portal';
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  language: string;
  updatedAt: string;
}

export interface ConversationFilters {
  status?: string;
  channel?: string;
  assignedTo?: string;
  patientId?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface InboxFilters {
  unreadOnly?: boolean;
  assignedToMe?: boolean;
  limit?: number;
  offset?: number;
}

// =====================================================
// CONVERSATION MANAGEMENT
// =====================================================

export class CommunicationHubService {
  /**
   * Create a new conversation
   */
  async createConversation(
    tenantId: string,
    patientId: string,
    subject: string | null,
    channel: 'sms' | 'email' | 'portal' | 'phone',
    assignedTo?: string
  ): Promise<Conversation> {
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO conversations (id, tenant_id, patient_id, subject, channel, assigned_to, status, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', 'normal', NOW())
       RETURNING *`,
      [id, tenantId, patientId, subject, channel, assignedTo || null]
    );

    logger.info('Conversation created', { conversationId: id, patientId, channel });
    return this.mapConversation(result.rows[0]);
  }

  /**
   * Get conversations with filters
   */
  async getConversations(
    tenantId: string,
    filters: ConversationFilters = {}
  ): Promise<{ conversations: ConversationWithPatient[]; total: number }> {
    const params: any[] = [tenantId];
    let paramIndex = 2;
    const conditions: string[] = ['c.tenant_id = $1'];

    if (filters.status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.channel) {
      conditions.push(`c.channel = $${paramIndex}`);
      params.push(filters.channel);
      paramIndex++;
    }

    if (filters.assignedTo) {
      conditions.push(`c.assigned_to = $${paramIndex}`);
      params.push(filters.assignedTo);
      paramIndex++;
    }

    if (filters.patientId) {
      conditions.push(`c.patient_id = $${paramIndex}`);
      params.push(filters.patientId);
      paramIndex++;
    }

    if (filters.priority) {
      conditions.push(`c.priority = $${paramIndex}`);
      params.push(filters.priority);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(p.first_name ILIKE $${paramIndex} OR p.last_name ILIKE $${paramIndex} OR c.subject ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE ${whereClause}`,
      params
    );

    // Get conversations with unread counts
    const result = await pool.query(
      `SELECT c.*,
              p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone,
              p.email as patient_email,
              COALESCE((
                SELECT COUNT(*)
                FROM conversation_messages m
                WHERE m.conversation_id = c.id
                  AND m.direction = 'inbound'
                  AND m.read_at IS NULL
              ), 0) as unread_count
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE ${whereClause}
       ORDER BY
         CASE c.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         c.last_message_at DESC NULLS LAST,
         c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      conversations: result.rows.map(row => this.mapConversationWithPatient(row)),
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Get a single conversation with messages
   */
  async getConversation(
    tenantId: string,
    conversationId: string
  ): Promise<{ conversation: ConversationWithPatient; messages: Message[] } | null> {
    const convResult = await pool.query(
      `SELECT c.*,
              p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone,
              p.email as patient_email,
              0 as unread_count
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [conversationId, tenantId]
    );

    if (!convResult.rowCount) {
      return null;
    }

    const messagesResult = await pool.query(
      `SELECT *
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return {
      conversation: this.mapConversationWithPatient(convResult.rows[0]),
      messages: messagesResult.rows.map(row => this.mapMessage(row)),
    };
  }

  /**
   * Assign conversation to staff member
   */
  async assignConversation(
    tenantId: string,
    conversationId: string,
    staffId: string
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE conversations
       SET assigned_to = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [staffId, conversationId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Conversation not found');
    }

    logger.info('Conversation assigned', { conversationId, staffId });
  }

  /**
   * Close conversation
   */
  async closeConversation(
    tenantId: string,
    conversationId: string,
    userId: string
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'closed', closed_at = NOW(), closed_by = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [userId, conversationId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Conversation not found');
    }

    logger.info('Conversation closed', { conversationId, userId });
  }

  /**
   * Reopen closed conversation
   */
  async reopenConversation(
    tenantId: string,
    conversationId: string
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'open', closed_at = NULL, closed_by = NULL
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [conversationId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Conversation not found');
    }

    logger.info('Conversation reopened', { conversationId });
  }

  /**
   * Update conversation priority
   */
  async updateConversationPriority(
    tenantId: string,
    conversationId: string,
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE conversations
       SET priority = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [priority, conversationId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Conversation not found');
    }
  }

  // =====================================================
  // MESSAGING
  // =====================================================

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    tenantId: string,
    conversationId: string,
    senderId: string,
    content: string,
    attachments: Attachment[] = []
  ): Promise<Message> {
    // Verify conversation exists and belongs to tenant
    const convResult = await pool.query(
      `SELECT id, channel, patient_id FROM conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );

    if (!convResult.rowCount) {
      throw new Error('Conversation not found');
    }

    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO conversation_messages (id, conversation_id, direction, sender_type, sender_id, content, attachments, created_at)
       VALUES ($1, $2, 'outbound', 'staff', $3, $4, $5, NOW())
       RETURNING *`,
      [id, conversationId, senderId, content, JSON.stringify(attachments)]
    );

    // Update conversation status if it was closed
    await pool.query(
      `UPDATE conversations
       SET status = CASE WHEN status = 'resolved' THEN status ELSE 'pending' END
       WHERE id = $1`,
      [conversationId]
    );

    logger.info('Message sent', { messageId: id, conversationId });

    // TODO: Actually send via SMS/email based on channel
    // This would integrate with the existing SMS service

    return this.mapMessage(result.rows[0]);
  }

  /**
   * Handle inbound message (from webhook)
   */
  async receiveInboundMessage(
    tenantId: string,
    patientId: string,
    channel: 'sms' | 'email' | 'portal',
    content: string,
    externalId?: string
  ): Promise<{ conversation: Conversation; message: Message }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find existing open conversation or create new one
      let convResult = await client.query(
        `SELECT id FROM conversations
         WHERE tenant_id = $1 AND patient_id = $2 AND channel = $3
           AND status IN ('open', 'pending')
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT 1`,
        [tenantId, patientId, channel]
      );

      let conversationId: string;

      if (convResult.rowCount) {
        conversationId = convResult.rows[0].id;
      } else {
        // Create new conversation
        conversationId = crypto.randomUUID();
        await client.query(
          `INSERT INTO conversations (id, tenant_id, patient_id, channel, status, created_at)
           VALUES ($1, $2, $3, $4, 'open', NOW())`,
          [conversationId, tenantId, patientId, channel]
        );
      }

      // Insert message
      const messageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO conversation_messages (id, conversation_id, direction, sender_type, sender_id, content, external_id, created_at)
         VALUES ($1, $2, 'inbound', 'patient', $3, $4, $5, NOW())`,
        [messageId, conversationId, patientId, content, externalId || null]
      );

      // Check for after-hours and send auto-response if needed
      await this.checkAndSendAfterHoursResponse(client, tenantId, conversationId, channel);

      // Apply routing rules
      await this.applyRoutingRules(client, tenantId, conversationId, content, channel);

      await client.query('COMMIT');

      // Fetch the created/updated conversation and message
      const conversation = await this.getConversationById(tenantId, conversationId);
      const message = await this.getMessageById(messageId);

      logger.info('Inbound message received', { messageId, conversationId, patientId, channel });

      return { conversation: conversation!, message: message! };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(
    tenantId: string,
    messageId: string
  ): Promise<void> {
    await pool.query(
      `UPDATE conversation_messages m
       SET read_at = NOW()
       FROM conversations c
       WHERE m.id = $1
         AND m.conversation_id = c.id
         AND c.tenant_id = $2
         AND m.read_at IS NULL`,
      [messageId, tenantId]
    );
  }

  /**
   * Mark all messages in conversation as read
   */
  async markAllRead(
    tenantId: string,
    conversationId: string
  ): Promise<void> {
    await pool.query(
      `UPDATE conversation_messages m
       SET read_at = NOW()
       FROM conversations c
       WHERE m.conversation_id = $1
         AND m.conversation_id = c.id
         AND c.tenant_id = $2
         AND m.direction = 'inbound'
         AND m.read_at IS NULL`,
      [conversationId, tenantId]
    );
  }

  /**
   * Get unread count for staff member
   */
  async getUnreadCount(
    tenantId: string,
    userId: string
  ): Promise<number> {
    const result = await pool.query(
      `SELECT get_unread_count($1, $2) as count`,
      [tenantId, userId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Search messages
   */
  async searchMessages(
    tenantId: string,
    query: string,
    limit: number = 50
  ): Promise<{ messages: Message[]; conversations: ConversationWithPatient[] }> {
    const messagesResult = await pool.query(
      `SELECT m.*, c.id as conv_id
       FROM conversation_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.tenant_id = $1
         AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [tenantId, `%${query}%`, limit]
    );

    const conversationIds = [...new Set(messagesResult.rows.map(r => r.conv_id))];

    let conversations: ConversationWithPatient[] = [];
    if (conversationIds.length > 0) {
      const convResult = await pool.query(
        `SELECT c.*,
                p.first_name || ' ' || p.last_name as patient_name,
                p.phone as patient_phone,
                p.email as patient_email,
                0 as unread_count
         FROM conversations c
         JOIN patients p ON p.id = c.patient_id
         WHERE c.id = ANY($1)`,
        [conversationIds]
      );
      conversations = convResult.rows.map(row => this.mapConversationWithPatient(row));
    }

    return {
      messages: messagesResult.rows.map(row => this.mapMessage(row)),
      conversations,
    };
  }

  /**
   * Get staff inbox
   */
  async getInbox(
    tenantId: string,
    userId: string,
    filters: InboxFilters = {}
  ): Promise<{ conversations: ConversationWithPatient[]; unreadCount: number }> {
    const conditions: string[] = ['c.tenant_id = $1', 'c.status IN (\'open\', \'pending\')'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.assignedToMe) {
      conditions.push(`(c.assigned_to = $${paramIndex} OR c.assigned_to IS NULL)`);
      params.push(userId);
      paramIndex++;
    }

    if (filters.unreadOnly) {
      conditions.push(`EXISTS (
        SELECT 1 FROM conversation_messages m
        WHERE m.conversation_id = c.id
          AND m.direction = 'inbound'
          AND m.read_at IS NULL
      )`);
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await pool.query(
      `SELECT c.*,
              p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone,
              p.email as patient_email,
              COALESCE((
                SELECT COUNT(*)
                FROM conversation_messages m
                WHERE m.conversation_id = c.id
                  AND m.direction = 'inbound'
                  AND m.read_at IS NULL
              ), 0) as unread_count
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE c.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         c.last_message_at DESC NULLS LAST
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const unreadCount = await this.getUnreadCount(tenantId, userId);

    return {
      conversations: result.rows.map(row => this.mapConversationWithPatient(row)),
      unreadCount,
    };
  }

  // =====================================================
  // TEMPLATES
  // =====================================================

  /**
   * Get message templates
   */
  async getTemplates(
    tenantId: string,
    category?: TemplateCategory,
    channel?: string
  ): Promise<MessageTemplate[]> {
    let query = `
      SELECT * FROM message_templates
      WHERE tenant_id = $1 AND is_active = TRUE
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (channel) {
      query += ` AND (channel = $${paramIndex} OR channel IS NULL)`;
      params.push(channel);
    }

    query += ` ORDER BY usage_count DESC, name ASC`;

    const result = await pool.query(query, params);
    return result.rows.map(row => this.mapTemplate(row));
  }

  /**
   * Create a message template
   */
  async createTemplate(
    tenantId: string,
    template: {
      name: string;
      category: TemplateCategory;
      subject?: string;
      content: string;
      variables?: TemplateVariable[];
      channel?: string;
    },
    userId: string
  ): Promise<MessageTemplate> {
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO message_templates (id, tenant_id, name, category, subject, content, variables, channel, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        tenantId,
        template.name,
        template.category,
        template.subject || null,
        template.content,
        JSON.stringify(template.variables || []),
        template.channel || null,
        userId,
      ]
    );

    logger.info('Template created', { templateId: id, name: template.name });
    return this.mapTemplate(result.rows[0]);
  }

  /**
   * Update a message template
   */
  async updateTemplate(
    tenantId: string,
    templateId: string,
    updates: Partial<{
      name: string;
      category: TemplateCategory;
      subject: string;
      content: string;
      variables: TemplateVariable[];
      channel: string;
      isActive: boolean;
    }>
  ): Promise<MessageTemplate | null> {
    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      params.push(updates.name);
      paramIndex++;
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex}`);
      params.push(updates.category);
      paramIndex++;
    }
    if (updates.subject !== undefined) {
      fields.push(`subject = $${paramIndex}`);
      params.push(updates.subject);
      paramIndex++;
    }
    if (updates.content !== undefined) {
      fields.push(`content = $${paramIndex}`);
      params.push(updates.content);
      paramIndex++;
    }
    if (updates.variables !== undefined) {
      fields.push(`variables = $${paramIndex}`);
      params.push(JSON.stringify(updates.variables));
      paramIndex++;
    }
    if (updates.channel !== undefined) {
      fields.push(`channel = $${paramIndex}`);
      params.push(updates.channel);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      params.push(updates.isActive);
      paramIndex++;
    }

    params.push(templateId, tenantId);

    const result = await pool.query(
      `UPDATE message_templates
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    return result.rowCount ? this.mapTemplate(result.rows[0]) : null;
  }

  /**
   * Render template with variables
   */
  async useTemplate(
    tenantId: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<{ subject: string | null; content: string }> {
    const result = await pool.query(
      `UPDATE message_templates
       SET usage_count = usage_count + 1
       WHERE id = $1 AND tenant_id = $2
       RETURNING subject, content`,
      [templateId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Template not found');
    }

    const { subject, content } = result.rows[0];

    // Replace variables in content
    let renderedContent = content;
    let renderedSubject = subject;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      renderedContent = renderedContent.replace(placeholder, value);
      if (renderedSubject) {
        renderedSubject = renderedSubject.replace(placeholder, value);
      }
    }

    return {
      subject: renderedSubject,
      content: renderedContent,
    };
  }

  /**
   * Get template categories
   */
  getTemplateCategories(): { id: TemplateCategory; name: string; description: string }[] {
    return [
      { id: 'appointment', name: 'Appointment', description: 'Appointment related messages' },
      { id: 'billing', name: 'Billing', description: 'Billing and payment messages' },
      { id: 'clinical', name: 'Clinical', description: 'Clinical information' },
      { id: 'marketing', name: 'Marketing', description: 'Promotional messages' },
      { id: 'recall', name: 'Recall', description: 'Recall messages' },
      { id: 'general', name: 'General', description: 'General communication' },
    ];
  }

  // =====================================================
  // BROADCASTS
  // =====================================================

  /**
   * Create a broadcast message
   */
  async createBroadcast(
    tenantId: string,
    config: {
      name: string;
      content: string;
      subject?: string;
      channel: 'sms' | 'email' | 'portal';
      targetCriteria: BroadcastCriteria;
      templateId?: string;
    },
    userId: string
  ): Promise<BroadcastMessage> {
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO broadcast_messages (id, tenant_id, name, content, subject, channel, target_criteria, template_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        tenantId,
        config.name,
        config.content,
        config.subject || null,
        config.channel,
        JSON.stringify(config.targetCriteria),
        config.templateId || null,
        userId,
      ]
    );

    logger.info('Broadcast created', { broadcastId: id, name: config.name });
    return this.mapBroadcast(result.rows[0]);
  }

  /**
   * Schedule a broadcast for later
   */
  async scheduleBroadcast(
    tenantId: string,
    broadcastId: string,
    scheduledAt: Date
  ): Promise<BroadcastMessage | null> {
    // First, calculate recipients
    await this.calculateBroadcastRecipients(tenantId, broadcastId);

    const result = await pool.query(
      `UPDATE broadcast_messages
       SET scheduled_at = $1, status = 'scheduled', updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'draft'
       RETURNING *`,
      [scheduledAt, broadcastId, tenantId]
    );

    if (!result.rowCount) {
      return null;
    }

    logger.info('Broadcast scheduled', { broadcastId, scheduledAt });
    return this.mapBroadcast(result.rows[0]);
  }

  /**
   * Send broadcast immediately
   */
  async sendBroadcast(
    tenantId: string,
    broadcastId: string
  ): Promise<BroadcastMessage | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Calculate recipients if not done
      await this.calculateBroadcastRecipients(tenantId, broadcastId, client);

      // Update status to sending
      const result = await client.query(
        `UPDATE broadcast_messages
         SET status = 'sending', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'scheduled')
         RETURNING *`,
        [broadcastId, tenantId]
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const broadcast = this.mapBroadcast(result.rows[0]);

      // Get recipients
      const recipientsResult = await client.query(
        `SELECT br.id, br.patient_id, p.phone, p.email
         FROM broadcast_recipients br
         JOIN patients p ON p.id = br.patient_id
         WHERE br.broadcast_id = $1 AND br.status = 'pending'`,
        [broadcastId]
      );

      // TODO: Actually send messages via SMS/email service
      // For now, mark as sent
      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of recipientsResult.rows) {
        // Check if patient can be contacted
        const canContact = await this.checkCanContact(tenantId, recipient.patient_id, broadcast.channel, 'general');

        if (canContact) {
          await client.query(
            `UPDATE broadcast_recipients
             SET status = 'sent', sent_at = NOW()
             WHERE id = $1`,
            [recipient.id]
          );
          sentCount++;
        } else {
          await client.query(
            `UPDATE broadcast_recipients
             SET status = 'unsubscribed'
             WHERE id = $1`,
            [recipient.id]
          );
          failedCount++;
        }
      }

      // Update broadcast counts
      await client.query(
        `UPDATE broadcast_messages
         SET sent_count = $1, failed_count = $2, status = 'sent', completed_at = NOW()
         WHERE id = $3`,
        [sentCount, failedCount, broadcastId]
      );

      await client.query('COMMIT');

      logger.info('Broadcast sent', { broadcastId, sentCount, failedCount });

      // Return updated broadcast
      return this.getBroadcast(tenantId, broadcastId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get broadcast with stats
   */
  async getBroadcast(
    tenantId: string,
    broadcastId: string
  ): Promise<BroadcastMessage | null> {
    const result = await pool.query(
      `SELECT * FROM broadcast_messages
       WHERE id = $1 AND tenant_id = $2`,
      [broadcastId, tenantId]
    );

    return result.rowCount ? this.mapBroadcast(result.rows[0]) : null;
  }

  /**
   * Get broadcast stats
   */
  async getBroadcastStats(
    tenantId: string,
    broadcastId: string
  ): Promise<{
    recipientCount: number;
    sentCount: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
    failedCount: number;
    unsubscribedCount: number;
  } | null> {
    const broadcast = await this.getBroadcast(tenantId, broadcastId);
    if (!broadcast) return null;

    const statsResult = await pool.query(
      `SELECT
         COUNT(*) as recipient_count,
         COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) as sent_count,
         COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) as delivered_count,
         COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) as opened_count,
         COUNT(*) FILTER (WHERE status = 'clicked') as clicked_count,
         COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
         COUNT(*) FILTER (WHERE status = 'unsubscribed') as unsubscribed_count
       FROM broadcast_recipients
       WHERE broadcast_id = $1`,
      [broadcastId]
    );

    const stats = statsResult.rows[0];

    return {
      recipientCount: parseInt(stats.recipient_count),
      sentCount: parseInt(stats.sent_count),
      deliveredCount: parseInt(stats.delivered_count),
      openedCount: parseInt(stats.opened_count),
      clickedCount: parseInt(stats.clicked_count),
      failedCount: parseInt(stats.failed_count),
      unsubscribedCount: parseInt(stats.unsubscribed_count),
    };
  }

  /**
   * Cancel scheduled broadcast
   */
  async cancelBroadcast(
    tenantId: string,
    broadcastId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE broadcast_messages
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'scheduled')
       RETURNING id`,
      [broadcastId, tenantId]
    );

    if (result.rowCount) {
      logger.info('Broadcast cancelled', { broadcastId });
      return true;
    }

    return false;
  }

  /**
   * List broadcasts
   */
  async listBroadcasts(
    tenantId: string,
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ broadcasts: BroadcastMessage[]; total: number }> {
    let query = 'SELECT * FROM broadcast_messages WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Get count
    const countResult = await pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );

    // Get broadcasts
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      broadcasts: result.rows.map(row => this.mapBroadcast(row)),
      total: parseInt(countResult.rows[0].count),
    };
  }

  // =====================================================
  // PREFERENCES
  // =====================================================

  /**
   * Get patient communication preferences
   */
  async getPatientPreferences(
    tenantId: string,
    patientId: string
  ): Promise<CommunicationPreferences | null> {
    const result = await pool.query(
      `SELECT * FROM communication_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (!result.rowCount) {
      // Return default preferences
      return {
        id: '',
        tenantId,
        patientId,
        smsEnabled: true,
        emailEnabled: true,
        portalEnabled: true,
        marketingEnabled: false,
        reminderEnabled: true,
        preferredChannel: 'sms',
        quietHoursStart: null,
        quietHoursEnd: null,
        language: 'en',
        updatedAt: new Date().toISOString(),
      };
    }

    return this.mapPreferences(result.rows[0]);
  }

  /**
   * Update patient communication preferences
   */
  async updatePatientPreferences(
    tenantId: string,
    patientId: string,
    prefs: Partial<{
      smsEnabled: boolean;
      emailEnabled: boolean;
      portalEnabled: boolean;
      marketingEnabled: boolean;
      reminderEnabled: boolean;
      preferredChannel: 'sms' | 'email' | 'portal';
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
      language: string;
    }>
  ): Promise<CommunicationPreferences> {
    const result = await pool.query(
      `INSERT INTO communication_preferences (id, tenant_id, patient_id, sms_enabled, email_enabled, portal_enabled, marketing_enabled, reminder_enabled, preferred_channel, quiet_hours_start, quiet_hours_end, language, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       ON CONFLICT (tenant_id, patient_id) DO UPDATE SET
         sms_enabled = COALESCE($4, communication_preferences.sms_enabled),
         email_enabled = COALESCE($5, communication_preferences.email_enabled),
         portal_enabled = COALESCE($6, communication_preferences.portal_enabled),
         marketing_enabled = COALESCE($7, communication_preferences.marketing_enabled),
         reminder_enabled = COALESCE($8, communication_preferences.reminder_enabled),
         preferred_channel = COALESCE($9, communication_preferences.preferred_channel),
         quiet_hours_start = COALESCE($10, communication_preferences.quiet_hours_start),
         quiet_hours_end = COALESCE($11, communication_preferences.quiet_hours_end),
         language = COALESCE($12, communication_preferences.language),
         updated_at = NOW()
       RETURNING *`,
      [
        crypto.randomUUID(),
        tenantId,
        patientId,
        prefs.smsEnabled ?? true,
        prefs.emailEnabled ?? true,
        prefs.portalEnabled ?? true,
        prefs.marketingEnabled ?? false,
        prefs.reminderEnabled ?? true,
        prefs.preferredChannel ?? 'sms',
        prefs.quietHoursStart ?? null,
        prefs.quietHoursEnd ?? null,
        prefs.language ?? 'en',
      ]
    );

    logger.info('Communication preferences updated', { patientId });
    return this.mapPreferences(result.rows[0]);
  }

  /**
   * Unsubscribe patient from channel
   */
  async unsubscribe(
    tenantId: string,
    patientId: string,
    channel: 'sms' | 'email' | 'marketing' | 'all',
    reason?: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO communication_unsubscribes (id, tenant_id, patient_id, channel, reason, unsubscribed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [crypto.randomUUID(), tenantId, patientId, channel, reason || null]
    );

    // Also update preferences
    if (channel === 'all') {
      await this.updatePatientPreferences(tenantId, patientId, {
        smsEnabled: false,
        emailEnabled: false,
        marketingEnabled: false,
      });
    } else if (channel === 'sms') {
      await this.updatePatientPreferences(tenantId, patientId, { smsEnabled: false });
    } else if (channel === 'email') {
      await this.updatePatientPreferences(tenantId, patientId, { emailEnabled: false });
    } else if (channel === 'marketing') {
      await this.updatePatientPreferences(tenantId, patientId, { marketingEnabled: false });
    }

    logger.info('Patient unsubscribed', { patientId, channel });
  }

  /**
   * Check if patient can be contacted
   */
  async checkCanContact(
    tenantId: string,
    patientId: string,
    channel: 'sms' | 'email' | 'portal',
    messageType: 'general' | 'marketing' | 'reminder' = 'general'
  ): Promise<boolean> {
    const result = await pool.query(
      `SELECT can_contact_patient($1, $2, $3, $4) as can_contact`,
      [tenantId, patientId, channel, messageType]
    );

    return result.rows[0].can_contact;
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async getConversationById(tenantId: string, conversationId: string): Promise<Conversation | null> {
    const result = await pool.query(
      `SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    return result.rowCount ? this.mapConversation(result.rows[0]) : null;
  }

  private async getMessageById(messageId: string): Promise<Message | null> {
    const result = await pool.query(
      `SELECT * FROM conversation_messages WHERE id = $1`,
      [messageId]
    );
    return result.rowCount ? this.mapMessage(result.rows[0]) : null;
  }

  private async calculateBroadcastRecipients(
    tenantId: string,
    broadcastId: string,
    client?: any
  ): Promise<void> {
    const db = client || pool;

    const broadcastResult = await db.query(
      `SELECT target_criteria, channel FROM broadcast_messages WHERE id = $1 AND tenant_id = $2`,
      [broadcastId, tenantId]
    );

    if (!broadcastResult.rowCount) return;

    const { target_criteria: criteria, channel } = broadcastResult.rows[0];

    // Build patient query based on criteria
    let patientQuery = `
      SELECT DISTINCT p.id
      FROM patients p
      WHERE p.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (criteria.patientFilters) {
      const filters = criteria.patientFilters;

      if (filters.lastVisitDays) {
        patientQuery += ` AND EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.patient_id = p.id
            AND a.status = 'completed'
            AND a.start_time >= NOW() - INTERVAL '${filters.lastVisitDays} days'
        )`;
      }

      if (filters.ageMin) {
        patientQuery += ` AND EXTRACT(YEAR FROM AGE(p.dob)) >= $${paramIndex}`;
        params.push(filters.ageMin);
        paramIndex++;
      }

      if (filters.ageMax) {
        patientQuery += ` AND EXTRACT(YEAR FROM AGE(p.dob)) <= $${paramIndex}`;
        params.push(filters.ageMax);
        paramIndex++;
      }
    }

    if (criteria.includeIds && criteria.includeIds.length > 0) {
      patientQuery += ` AND p.id = ANY($${paramIndex})`;
      params.push(criteria.includeIds);
      paramIndex++;
    }

    if (criteria.excludeIds && criteria.excludeIds.length > 0) {
      patientQuery += ` AND p.id != ALL($${paramIndex})`;
      params.push(criteria.excludeIds);
      paramIndex++;
    }

    const patientsResult = await db.query(patientQuery, params);

    // Clear existing recipients
    await db.query(`DELETE FROM broadcast_recipients WHERE broadcast_id = $1`, [broadcastId]);

    // Insert recipients
    for (const patient of patientsResult.rows) {
      await db.query(
        `INSERT INTO broadcast_recipients (id, broadcast_id, patient_id, status)
         VALUES ($1, $2, $3, 'pending')`,
        [crypto.randomUUID(), broadcastId, patient.id]
      );
    }

    // Update recipient count
    await db.query(
      `UPDATE broadcast_messages SET recipient_count = $1 WHERE id = $2`,
      [patientsResult.rowCount, broadcastId]
    );
  }

  private async checkAndSendAfterHoursResponse(
    client: any,
    tenantId: string,
    conversationId: string,
    channel: string
  ): Promise<void> {
    // Check if after hours
    const configResult = await client.query(
      `SELECT * FROM after_hours_config
       WHERE tenant_id = $1
         AND (channel = $2 OR channel = 'all')
         AND is_active = TRUE`,
      [tenantId, channel]
    );

    if (!configResult.rowCount) return;

    const config = configResult.rows[0];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const dayOfWeek = now.getDay();

    // Check if current day is an after-hours day
    if (!config.days_of_week.includes(dayOfWeek)) {
      // Check time
      const startTime = config.start_time.slice(0, 5);
      const endTime = config.end_time.slice(0, 5);

      let isAfterHours = false;
      if (startTime > endTime) {
        // Overnight (e.g., 17:00 to 08:00)
        isAfterHours = currentTime >= startTime || currentTime <= endTime;
      } else {
        isAfterHours = currentTime >= startTime && currentTime <= endTime;
      }

      if (!isAfterHours) return;
    }

    // Send auto-response
    const message = config.custom_message || 'Thank you for contacting us. Our office is currently closed.';

    await client.query(
      `INSERT INTO conversation_messages (id, conversation_id, direction, sender_type, content, created_at)
       VALUES ($1, $2, 'outbound', 'auto', $3, NOW())`,
      [crypto.randomUUID(), conversationId, message]
    );
  }

  private async applyRoutingRules(
    client: any,
    tenantId: string,
    conversationId: string,
    content: string,
    channel: string
  ): Promise<void> {
    // Get active routing rules
    const rulesResult = await client.query(
      `SELECT * FROM conversation_routing_rules
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY priority ASC`,
      [tenantId]
    );

    for (const rule of rulesResult.rows) {
      const conditions = rule.conditions;

      // Check channel condition
      if (conditions.channel && conditions.channel !== channel) continue;

      // Check keyword conditions
      if (conditions.keywords && conditions.keywords.length > 0) {
        const hasKeyword = conditions.keywords.some((kw: string) =>
          content.toLowerCase().includes(kw.toLowerCase())
        );
        if (!hasKeyword) continue;
      }

      // Apply action
      if (rule.action_type === 'assign_user' && rule.action_config.user_id) {
        await client.query(
          `UPDATE conversations SET assigned_to = $1 WHERE id = $2`,
          [rule.action_config.user_id, conversationId]
        );
        break; // Only apply first matching rule
      }
    }
  }

  // =====================================================
  // MAPPERS
  // =====================================================

  private mapConversation(row: any): Conversation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      patientId: row.patient_id,
      subject: row.subject,
      status: row.status,
      channel: row.channel,
      assignedTo: row.assigned_to,
      priority: row.priority,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      closedAt: row.closed_at,
    };
  }

  private mapConversationWithPatient(row: any): ConversationWithPatient {
    return {
      ...this.mapConversation(row),
      patientName: row.patient_name,
      patientPhone: row.patient_phone,
      patientEmail: row.patient_email,
      unreadCount: parseInt(row.unread_count) || 0,
    };
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction,
      senderType: row.sender_type,
      senderId: row.sender_id,
      content: row.content,
      contentType: row.content_type,
      attachments: row.attachments || [],
      readAt: row.read_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
    };
  }

  private mapTemplate(row: any): MessageTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      category: row.category,
      subject: row.subject,
      content: row.content,
      variables: row.variables || [],
      channel: row.channel,
      isActive: row.is_active,
      usageCount: row.usage_count,
      createdAt: row.created_at,
    };
  }

  private mapBroadcast(row: any): BroadcastMessage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      content: row.content,
      subject: row.subject,
      channel: row.channel,
      targetCriteria: row.target_criteria,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      recipientCount: row.recipient_count,
      sentCount: row.sent_count,
      deliveredCount: row.delivered_count,
      failedCount: row.failed_count,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private mapPreferences(row: any): CommunicationPreferences {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      patientId: row.patient_id,
      smsEnabled: row.sms_enabled,
      emailEnabled: row.email_enabled,
      portalEnabled: row.portal_enabled,
      marketingEnabled: row.marketing_enabled,
      reminderEnabled: row.reminder_enabled,
      preferredChannel: row.preferred_channel,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      language: row.language,
      updatedAt: row.updated_at,
    };
  }
}

export const communicationHubService = new CommunicationHubService();
